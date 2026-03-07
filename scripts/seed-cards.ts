/**
 * Seed the Supabase `cards` table from Scryfall bulk data.
 *
 * Usage:
 *   npx tsx scripts/seed-cards.ts
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env vars from .env.local
const envPath = resolve(import.meta.dirname, "../.env.local");
const envFile = readFileSync(envPath, "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 500;

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  set: string;
  image_uris?: Record<string, string>;
  // multi-faced cards store images on card_faces instead
  card_faces?: Array<{ image_uris?: Record<string, string>; oracle_text?: string }>;
  // we only want paper, playable cards
  layout?: string;
  lang?: string;
  digital?: boolean;
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

function toRow(card: ScryfallCard) {
  return {
    scryfall_id: card.id,
    name: card.name,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    oracle_text: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? null,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    set_code: card.set,
    image_uris: pickImageUris(card),
  };
}

async function main() {
  // 1. Get the bulk data download URL for "default_cards" (one entry per unique print)
  console.log("Fetching Scryfall bulk data manifest...");
  const bulkRes = await fetch("https://api.scryfall.com/bulk-data");
  const bulkData = await bulkRes.json();
  const defaultCards = bulkData.data.find(
    (d: { type: string }) => d.type === "default_cards"
  );
  if (!defaultCards) {
    console.error("Could not find default_cards bulk data entry");
    process.exit(1);
  }

  console.log(`Downloading cards from: ${defaultCards.download_uri}`);
  console.log("This may take a minute...");

  // 2. Stream and parse the JSON array
  const res = await fetch(defaultCards.download_uri);
  const cards: ScryfallCard[] = await res.json();

  // 3. Filter to English, non-digital cards with images
  const filtered = cards.filter(
    (c) =>
      c.lang === "en" &&
      !c.digital &&
      (c.image_uris || c.card_faces?.[0]?.image_uris)
  );

  console.log(
    `Downloaded ${cards.length} cards, ${filtered.length} after filtering`
  );

  // 4. Upsert in batches
  let inserted = 0;
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE).map(toRow);
    const { error } = await supabase
      .from("cards")
      .upsert(batch, { onConflict: "scryfall_id" });

    if (error) {
      console.error(`Error at batch ${i}:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    const pct = ((inserted / filtered.length) * 100).toFixed(1);
    process.stdout.write(`\rInserted ${inserted}/${filtered.length} (${pct}%)`);
  }

  console.log("\nDone!");
}

main();
