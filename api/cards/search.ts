import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
  set: string;
  image_uris?: Record<string, string>;
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
}

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
    image_uris: pickImageUris(card),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = req.query.q;
  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  // 1. Check Supabase cache first
  const { data: cached, error: cacheError } = await supabase
    .from("cards")
    .select("*")
    .ilike("name", `%${q}%`)
    .limit(20);

  if (!cacheError && cached && cached.length > 0) {
    return res.status(200).json({ data: cached, source: "cache" });
  }

  // 2. Cache miss — fetch from Scryfall
  try {
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name`
    );

    if (!scryfallRes.ok) {
      const err = await scryfallRes.json();
      return res.status(scryfallRes.status).json({ error: err.details ?? "Scryfall search failed" });
    }

    const scryfallData = await scryfallRes.json();
    const cards: ScryfallCard[] = scryfallData.data ?? [];

    // 3. Write results back to cache
    const rows = cards.map(scryfallToRow);
    if (rows.length > 0) {
      await supabase
        .from("cards")
        .upsert(rows, { onConflict: "scryfall_id" });
    }

    // 4. Return the cached-format rows
    const { data: freshData } = await supabase
      .from("cards")
      .select("*")
      .in("scryfall_id", rows.map((r) => r.scryfall_id));

    return res.status(200).json({ data: freshData ?? rows, source: "scryfall" });
  } catch {
    return res.status(500).json({ error: "Failed to fetch from Scryfall" });
  }
}
