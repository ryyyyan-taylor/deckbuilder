import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EdhrecCard {
  name: string;
  sanitized: string;
  synergy: number;
  inclusion: number;
  num_decks: number;
  potential_decks: number;
}

interface EdhrecCardlist {
  header: string;
  cardviews: EdhrecCard[];
}

interface EdhrecResponse {
  container: {
    json_dict: {
      cardlists: EdhrecCardlist[];
    };
  };
}

interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  image_uris?: Record<string, string>;
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
}

function pickImageUris(card: ScryfallCard) {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!uris) return null;
  return { small: uris.small, normal: uris.normal, large: uris.large, png: uris.png };
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
    image_uris: pickImageUris(card),
  };
}

function commanderToSlug(name: string): string {
  return name.toLowerCase().replace(/[',]/g, "").replace(/\s+/g, "-");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const commander = req.query.commander;
  if (!commander || typeof commander !== "string") {
    return res.status(400).json({ error: "Missing commander query parameter" });
  }

  // Partner commanders: "Name A / Name B" → "name-a/name-b" for EDHREC URL
  const slug = commander
    .split(" / ")
    .map((part) => commanderToSlug(part.trim()))
    .join("/");

  try {
    // Check cache
    const { data: cached } = await supabase
      .from("edhrec_cache")
      .select("data, fetched_at")
      .eq("commander_name", slug)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return res.status(200).json(cached.data);
      }
    }

    // Fetch from EDHREC
    const edhrecRes = await fetch(
      `https://json.edhrec.com/pages/commanders/${slug}.json`,
      { headers: { "User-Agent": "MTGDeckBuilder/1.0" } }
    );

    if (!edhrecRes.ok) {
      return res
        .status(edhrecRes.status === 404 ? 404 : 502)
        .json({ error: `EDHREC returned ${edhrecRes.status}` });
    }

    const edhrecData: EdhrecResponse = await edhrecRes.json();
    const cardlists = edhrecData.container?.json_dict?.cardlists ?? [];

    // Parse categories from cardlists
    const categories: {
      name: string;
      cards: { name: string; inclusion: number; synergy: number; num_decks: number; potential_decks: number }[];
    }[] = [];

    for (const list of cardlists) {
      if (!list.cardviews || list.cardviews.length === 0) continue;
      categories.push({
        name: list.header,
        cards: list.cardviews.map((cv) => ({
          name: cv.name,
          inclusion: cv.inclusion,
          synergy: cv.synergy,
          num_decks: cv.num_decks,
          potential_decks: cv.potential_decks,
        })),
      });
    }

    // Collect all unique card names for DB lookup
    const allCardNames = [
      ...new Set(categories.flatMap((cat) => cat.cards.map((c) => c.name))),
    ];

    // Look up cards in our DB by name
    const { data: dbCards } = await supabase
      .from("cards")
      .select("id, name, image_uris")
      .in("name", allCardNames);

    const cardMap = new Map<string, { id: string; image_uri: string | null }>();
    for (const card of dbCards ?? []) {
      if (!cardMap.has(card.name)) {
        cardMap.set(card.name, {
          id: card.id,
          image_uri: card.image_uris?.normal ?? null,
        });
      }
    }

    // Fetch missing cards from Scryfall
    const missingNames = allCardNames.filter((n) => !cardMap.has(n));
    if (missingNames.length > 0) {
      const BATCH_SIZE = 75;
      for (let i = 0; i < missingNames.length; i += BATCH_SIZE) {
        const batch = missingNames.slice(i, i + BATCH_SIZE);
        const scryfallRes = await fetch(
          "https://api.scryfall.com/cards/collection",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifiers: batch.map((name) => ({ name })),
            }),
          }
        );
        if (scryfallRes.ok) {
          const scryfallData = await scryfallRes.json();
          const cards = scryfallData.data ?? [];
          const rows = cards.map((card: ScryfallCard) => scryfallToRow(card));
          if (rows.length > 0) {
            await supabase
              .from("cards")
              .upsert(rows, { onConflict: "scryfall_id" });
          }
          for (const card of cards) {
            const imgUri = pickImageUris(card);
            cardMap.set(card.name, {
              id: card.id,
              image_uri: imgUri?.normal ?? null,
            });
          }
        }
      }

      // Re-fetch DB IDs for newly inserted cards
      const { data: newDbCards } = await supabase
        .from("cards")
        .select("id, name, image_uris")
        .in("name", missingNames);
      for (const card of newDbCards ?? []) {
        cardMap.set(card.name, {
          id: card.id,
          image_uri: card.image_uris?.normal ?? null,
        });
      }
    }

    // Build response with card_ids resolved
    const result = {
      categories: categories.map((cat) => ({
        name: cat.name,
        cards: cat.cards
          .map((c) => {
            const resolved = cardMap.get(c.name);
            const pct = c.potential_decks > 0 ? c.inclusion / c.potential_decks : 0;
            return {
              card_id: resolved?.id ?? null,
              name: c.name,
              inclusion: pct,
              synergy: c.synergy,
              num_decks: c.num_decks,
              image_uri: resolved?.image_uri ?? null,
            };
          })
          .filter((c) => c.card_id),
      })),
    };

    // Upsert cache
    await supabase.from("edhrec_cache").upsert(
      { commander_name: slug, data: result, fetched_at: new Date().toISOString() },
      { onConflict: "commander_name" }
    );

    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ error: "Failed to fetch EDHREC suggestions" });
  }
}
