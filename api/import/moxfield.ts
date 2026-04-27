import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateMoxfieldUrl } from "../../src/lib/validation.js";
import { env } from "../../src/lib/server/env.js";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../../src/lib/server/rateLimit.js";
import { setCorsHeaders, verifyOrigin } from "../../src/lib/server/cors.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

interface MoxfieldCard {
  card: {
    scryfall_id: string;
    name: string;
    mana_cost?: string;
    cmc?: number;
    type_line?: string;
    colors?: string[];
    color_identity?: string[];
    set: string;
    image_uris?: Record<string, string>;
    card_faces?: Array<{ image_uris?: Record<string, string> }>;
  };
  quantity: number;
}

interface MoxfieldDeck {
  name: string;
  mainboard: Record<string, MoxfieldCard>;
  sideboard: Record<string, MoxfieldCard>;
  commanders: Record<string, MoxfieldCard>;
  companions: Record<string, MoxfieldCard>;
  maybeboard: Record<string, MoxfieldCard>;
}

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
  set: string;
  released_at?: string;
  image_uris?: Record<string, string>;
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
}

const SECTION_MAP: Record<string, string> = {
  commanders: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
  companions: "Companion",
};

function pickImageUris(card: ScryfallCard) {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!uris) return null;
  return {
    small: uris.small,
    normal: uris.normal,
    large: uris.large,
    png: uris.png,
  };
}

function scryfallToRow(card: ScryfallCard) {
  return {
    scryfall_id: card.id,
    name: card.name,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    set_code: card.set,
    released_at: card.released_at ?? null,
    image_uris: pickImageUris(card),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify origin for this expensive endpoint
  try {
    verifyOrigin(req.headers.origin, undefined, req.headers.host);
  } catch (err) {
    console.warn("[API] origin verification failed", {
      origin: req.headers.origin,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `moxfield-import:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.IMPORT_MOXFIELD.limit, RATE_LIMITS.IMPORT_MOXFIELD.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const remaining = getRateLimitRemaining(rateLimitKey, RATE_LIMITS.IMPORT_MOXFIELD.limit);
  res.setHeader("X-RateLimit-Remaining", remaining);

  try {
    const { url } = req.body ?? {};

    // Input validation
    const deckId = validateMoxfieldUrl(url);

    const startTime = Date.now();

    const moxRes = await fetch(
      `https://api2.moxfield.com/v2/decks/all/${deckId}`,
      {
        headers: {
          "User-Agent": "MTGDeckBuilder/1.0",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );
    if (!moxRes.ok) {
      console.error("[API] moxfield import failed", {
        deckId,
        status: moxRes.status,
        duration: Date.now() - startTime,
      });
      return res
        .status(moxRes.status === 404 ? 404 : 502)
        .json({ error: `Failed to fetch deck from Moxfield` });
    }

    const moxDeck: MoxfieldDeck = await moxRes.json();

    // Collect all cards across sections
    const allCards: { card: MoxfieldCard["card"]; section: string; quantity: number }[] = [];

    for (const [moxSection, ourSection] of Object.entries(SECTION_MAP)) {
      const board = moxDeck[moxSection as keyof MoxfieldDeck];
      if (!board || typeof board !== "object") continue;

      for (const entry of Object.values(board as Record<string, MoxfieldCard>)) {
        allCards.push({
          card: entry.card,
          section: ourSection,
          quantity: entry.quantity,
        });
      }
    }

    if (allCards.length === 0) {
      return res.status(200).json({ cards: [], sections: [] });
    }

    const scryfallIds = [...new Set(allCards.map((c) => c.card.scryfall_id))];

    // Check which cards already exist in our DB (and whether they have images)
    const { data: existingCards, error: existError } = await supabase
      .from("cards")
      .select("id, scryfall_id, image_uris")
      .in("scryfall_id", scryfallIds);

    if (existError) {
      console.error("[API] card lookup failed", { deckId, error: existError.message });
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const existingMap = new Map(
      (existingCards ?? []).map((c: { scryfall_id: string; image_uris: unknown }) => [c.scryfall_id, c.image_uris])
    );
    // Fetch from Scryfall if card is missing OR exists but has no images
    const needsFetchIds = scryfallIds.filter(
      (id) => !existingMap.has(id) || !existingMap.get(id)
    );

    // For missing/imageless cards, fetch from Scryfall API to get proper image data
    if (needsFetchIds.length > 0) {
      const BATCH_SIZE = 75;
      for (let i = 0; i < needsFetchIds.length; i += BATCH_SIZE) {
        const batch = needsFetchIds.slice(i, i + BATCH_SIZE);
        const scryfallRes = await fetch(
          "https://api.scryfall.com/cards/collection",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifiers: batch.map((id) => ({ id })),
            }),
          }
        );
        if (scryfallRes.ok) {
          const scryfallData = await scryfallRes.json();
          const rows = (scryfallData.data ?? []).map((card: ScryfallCard) => scryfallToRow(card));
          if (rows.length > 0) {
            await supabase
              .from("cards")
              .upsert(rows, { onConflict: "scryfall_id" });
          }
        }
      }
    }

    // Fetch all card rows to get internal IDs
    const { data: dbCards, error: dbError } = await supabase
      .from("cards")
      .select("id, scryfall_id")
      .in("scryfall_id", scryfallIds);

    if (dbError || !dbCards) {
      console.error("[API] final card lookup failed", { deckId, error: dbError?.message });
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const idMap = new Map(dbCards.map((c: { id: string; scryfall_id: string }) => [c.scryfall_id, c.id]));

    // For any cards whose scryfall_id wasn't found (e.g. Moxfield has a stale/bad ID),
    // fall back to a name lookup in our DB, then Scryfall /cards/named if still missing.
    const stillMissing = allCards.filter((c) => !idMap.has(c.card.scryfall_id));
    if (stillMissing.length > 0) {
      const missingNames = [...new Set(stillMissing.map((c) => c.card.name))];
      const { data: byName } = await supabase
        .from("cards")
        .select("id, scryfall_id, name, image_uris")
        .in("name", missingNames)
        .order("released_at", { ascending: true, nullsFirst: false });

      // First-write-wins: earliest printing per name
      const nameMap = new Map<string, { id: string; scryfall_id: string; image_uris: unknown }>();
      for (const card of byName ?? []) {
        if (!nameMap.has(card.name)) nameMap.set(card.name, card);
      }

      // For cards not in DB by name either, fetch from Scryfall /cards/named
      const needsScryfall = missingNames.filter((n) => !nameMap.has(n) || !nameMap.get(n)!.image_uris);
      for (const name of needsScryfall) {
        const sfRes = await fetch(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
        );
        if (sfRes.ok) {
          const sfCard: ScryfallCard = await sfRes.json();
          const row = scryfallToRow(sfCard);
          const { data: upserted } = await supabase
            .from("cards")
            .upsert(row, { onConflict: "scryfall_id" })
            .select("id, scryfall_id, name, image_uris")
            .single();
          if (upserted) nameMap.set(sfCard.name, upserted);
        }
      }

      // Patch idMap: map the Moxfield scryfall_id → our DB id via the name fallback
      for (const c of stillMissing) {
        const match = nameMap.get(c.card.name);
        if (match) idMap.set(c.card.scryfall_id, match.id);
      }
    }

    const result = allCards
      .map((c) => ({
        card_id: idMap.get(c.card.scryfall_id),
        section: c.section,
        quantity: c.quantity,
      }))
      .filter((c) => c.card_id);

    // Collect which sections are used
    const usedSections = [...new Set(result.map((c) => c.section))];

    return res.status(200).json({ name: moxDeck.name, cards: result, sections: usedSections });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR') {
      const errMsg = 'message' in err ? String(err.message) : 'Validation error';
      console.warn("[API] validation error", { error: errMsg });
      return res.status(400).json({ error: errMsg });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] moxfield import error", {
      error: errorMsg,
    });
    return res.status(500).json({ error: "Failed to import from Moxfield" });
  }
}
