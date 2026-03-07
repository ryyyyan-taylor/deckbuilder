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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { scryfall_id } = req.query;
  if (!scryfall_id || typeof scryfall_id !== "string") {
    return res.status(400).json({ error: "Missing scryfall_id" });
  }

  // 1. Check Supabase cache
  const { data: cached, error: cacheError } = await supabase
    .from("cards")
    .select("*")
    .eq("scryfall_id", scryfall_id)
    .single();

  if (!cacheError && cached) {
    return res.status(200).json({ data: cached, source: "cache" });
  }

  // 2. Cache miss — fetch from Scryfall
  try {
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfall_id)}`
    );

    if (!scryfallRes.ok) {
      const err = await scryfallRes.json();
      return res.status(scryfallRes.status).json({ error: err.details ?? "Card not found" });
    }

    const card: ScryfallCard = await scryfallRes.json();

    // 3. Write to cache
    const row = {
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

    const { data: inserted } = await supabase
      .from("cards")
      .upsert(row, { onConflict: "scryfall_id" })
      .select()
      .single();

    return res.status(200).json({ data: inserted ?? row, source: "scryfall" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch from Scryfall" });
  }
}
