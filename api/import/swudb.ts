import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateSwudbUrl } from "../../src/lib/validation";
import { env } from "./_lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "./_lib/rateLimit";
import { setCorsHeaders, verifyOrigin } from "./_lib/cors";
import { fetchSwudbDeck, fetchSwuapiCardById, searchSwuapiCards, swudbToRow } from "./_lib/swudb";
import { getSwuCardType } from "../../src/lib/swu";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// SWU section mapping
const SECTION_MAP: Record<string, string> = {
  leader: "Leader/Base",
  base: "Leader/Base",
  sideboard: "Sideboard",
  // Main deck cards are split by type after resolution
};

interface DeckCard {
  uuid: string;
  name: string;
  quantity: number;
  section?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify origin for this expensive endpoint
  try {
    verifyOrigin(req.headers.origin);
  } catch (err) {
    console.warn("[API] origin verification failed", {
      origin: req.headers.origin,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `swudb-import:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.IMPORT_SWUDB.limit, RATE_LIMITS.IMPORT_SWUDB.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const remaining = getRateLimitRemaining(rateLimitKey, RATE_LIMITS.IMPORT_SWUDB.limit);
  res.setHeader("X-RateLimit-Remaining", remaining);

  try {
    const { url } = req.body ?? {};

    // Input validation
    const deckId = validateSwudbUrl(url);

    const startTime = Date.now();

    // Fetch deck from SWUDB
    const swudbDeck = await fetchSwudbDeck(deckId);
    if (!swudbDeck) {
      console.error("[API] swudb import failed", {
        deckId,
        duration: Date.now() - startTime,
      });
      return res.status(404).json({ error: `Failed to fetch deck from SWUDB. Check the deck URL and try again.` });
    }

    // Collect all cards from the deck
    const allCards: DeckCard[] = swudbDeck.cards ?? [];

    if (allCards.length === 0) {
      return res.status(200).json({
        name: swudbDeck.name || "Untitled Deck",
        cards: [],
        sections: []
      });
    }

    const cardUuids = [...new Set(allCards.map((c) => c.uuid))];

    // Check which cards already exist in our DB
    const { data: existingCards, error: existError } = await supabase
      .from("cards")
      .select("id, scryfall_id, game, swu_type, arena")
      .in("scryfall_id", cardUuids)
      .eq("game", "swu");

    if (existError) {
      console.error("[API] card lookup failed", { deckId, error: existError.message });
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const existingMap = new Map(
      (existingCards ?? []).map((c: any) => [c.scryfall_id, c])
    );

    // Fetch from SWUAPI if card is missing
    const needsFetchUuids = cardUuids.filter((uuid) => !existingMap.has(uuid));

    if (needsFetchUuids.length > 0) {
      for (const uuid of needsFetchUuids) {
        try {
          const swuCard = await fetchSwuapiCardById(uuid);
          if (swuCard) {
            const row = swudbToRow(swuCard);
            await supabase.from("cards").upsert(row, { onConflict: "scryfall_id,game" });
            existingMap.set(uuid, {
              scryfall_id: uuid,
              swu_type: swuCard.type,
              arena: swuCard.arena ?? null
            });
          }
        } catch (err) {
          console.warn(`[API] failed to fetch card ${uuid}:`, err instanceof Error ? err.message : "unknown");
        }
      }
    }

    // Fetch final card data for internal IDs and section mapping
    const { data: dbCards, error: dbError } = await supabase
      .from("cards")
      .select("id, scryfall_id, swu_type, arena")
      .in("scryfall_id", cardUuids)
      .eq("game", "swu");

    if (dbError || !dbCards) {
      console.error("[API] final card lookup failed", { deckId, error: dbError?.message });
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const cardDataMap = new Map(dbCards.map((c: any) => [c.scryfall_id, c]));

    // For any cards still missing (couldn't fetch), try name fallback
    const stillMissing = allCards.filter((c) => !cardDataMap.has(c.uuid));
    if (stillMissing.length > 0) {
      const missingNames = [...new Set(stillMissing.map((c) => c.name))];
      for (const name of missingNames) {
        try {
          const cards = await searchSwuapiCards(name, 1);
          if (cards.length > 0) {
            const swuCard = cards[0];
            const row = swudbToRow(swuCard);
            await supabase.from("cards").upsert(row, { onConflict: "scryfall_id,game" });
            cardDataMap.set(swuCard.uuid, {
              scryfall_id: swuCard.uuid,
              swu_type: swuCard.type,
              arena: swuCard.arena ?? null,
            });
          }
        } catch (err) {
          console.warn(`[API] failed to lookup card ${name}:`, err instanceof Error ? err.message : "unknown");
        }
      }
    }

    // Map cards to sections
    const cardsBySection: Record<string, DeckCard[]> = {};

    for (const card of allCards) {
      const cardData = cardDataMap.get(card.uuid);
      if (!cardData) {
        console.warn(`[API] card not found after resolution: ${card.name}`);
        continue;
      }

      let section = "Sideboard"; // default

      // Determine section based on SWU type
      const swuType = cardData.swu_type;
      if (swuType === "Leader" || swuType === "Base") {
        section = "Leader/Base";
      } else if (swuType === "Unit") {
        // Split units by arena
        if (cardData.arena === "Ground") {
          section = "Ground Units";
        } else if (cardData.arena === "Space") {
          section = "Space Units";
        } else {
          section = "Ground Units"; // default
        }
      } else if (swuType === "Event") {
        section = "Events";
      } else if (swuType === "Upgrade") {
        section = "Upgrades";
      }

      if (!cardsBySection[section]) {
        cardsBySection[section] = [];
      }
      cardsBySection[section].push({ ...card, section });
    }

    // Build sections array
    const sections = Object.keys(cardsBySection).sort();

    console.info("[API] swudb import success", {
      deckId,
      cardCount: allCards.length,
      sections: sections.length,
      duration: Date.now() - startTime,
    });

    return res.status(200).json({
      name: swudbDeck.name || "Untitled Deck",
      cards: allCards.map((c) => ({
        ...c,
        section: cardsBySection[Object.keys(cardsBySection).find((s) =>
          cardsBySection[s].some((sc) => sc.uuid === c.uuid)
        ) || "Sideboard"]?.[0]?.section || "Sideboard",
      })),
      sections,
      game: "swu",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] swudb import error", { error: message });

    if (message.includes("Invalid SWUDB URL")) {
      return res.status(400).json({ error: message });
    }

    return res.status(500).json({ error: "Failed to import deck from SWUDB" });
  }
}
