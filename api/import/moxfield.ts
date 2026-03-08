import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

const SECTION_MAP: Record<string, string> = {
  commanders: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
  companions: "Companion",
};

function pickImageUris(card: MoxfieldCard["card"]) {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!uris) return null;
  return {
    small: uris.small,
    normal: uris.normal,
    large: uris.large,
    png: uris.png,
  };
}

function scryfallToRow(card: MoxfieldCard["card"]) {
  return {
    scryfall_id: card.scryfall_id,
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url in request body" });
  }

  // Extract deck ID from Moxfield URL
  const match = url.match(/\/decks\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    return res.status(400).json({ error: "Invalid Moxfield URL" });
  }
  const deckId = match[1];

  try {
    const moxRes = await fetch(
      `https://api2.moxfield.com/v2/decks/all/${deckId}`
    );
    if (!moxRes.ok) {
      return res
        .status(moxRes.status)
        .json({ error: "Failed to fetch deck from Moxfield" });
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

    // Upsert all cards into our cards table
    const rows = allCards.map((c) => scryfallToRow(c.card));
    await supabase
      .from("cards")
      .upsert(rows, { onConflict: "scryfall_id" });

    // Fetch the card rows to get our internal IDs
    const scryfallIds = rows.map((r) => r.scryfall_id);
    const { data: dbCards, error: dbError } = await supabase
      .from("cards")
      .select("id, scryfall_id")
      .in("scryfall_id", scryfallIds);

    if (dbError || !dbCards) {
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const idMap = new Map(dbCards.map((c: { id: string; scryfall_id: string }) => [c.scryfall_id, c.id]));

    const result = allCards
      .map((c) => ({
        card_id: idMap.get(c.card.scryfall_id),
        section: c.section,
        quantity: c.quantity,
      }))
      .filter((c) => c.card_id);

    // Collect which sections are used
    const usedSections = [...new Set(result.map((c) => c.section))];

    return res.status(200).json({ cards: result, sections: usedSections });
  } catch {
    return res.status(500).json({ error: "Failed to import from Moxfield" });
  }
}
