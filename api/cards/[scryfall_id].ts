import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateString, ValidationError } from "../../src/lib/validation";
import { env } from "../../src/lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../../src/lib/rateLimit";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `cards-single:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.CARDS_SINGLE.limit, RATE_LIMITS.CARDS_SINGLE.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const remaining = getRateLimitRemaining(rateLimitKey, RATE_LIMITS.CARDS_SINGLE.limit);
  res.setHeader("X-RateLimit-Remaining", remaining);

  try {
    const { scryfall_id } = req.query;
    const cardId = validateString(scryfall_id, 50, /^[a-z0-9\-]+$/i);

    // 1. Check Supabase cache
    const { data: cached, error: cacheError } = await supabase
      .from("cards")
      .select("*")
      .eq("scryfall_id", cardId)
      .single();

    if (!cacheError && cached) {
      return res.status(200).json({ data: cached, source: "cache" });
    }

    // 2. Cache miss — fetch from Scryfall
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(cardId)}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!scryfallRes.ok) {
      console.error("[API] scryfall card fetch failed", { cardId, status: scryfallRes.status });
      return res.status(scryfallRes.status === 404 ? 404 : 502).json({ error: "Card not found" });
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

    const { data: inserted, error: insertError } = await supabase
      .from("cards")
      .upsert(row, { onConflict: "scryfall_id" })
      .select()
      .single();

    if (insertError) {
      console.error("[API] card cache upsert failed", { cardId, error: insertError.message });
    }

    return res.status(200).json({ data: inserted ?? row, source: "scryfall" });
  } catch (err) {
    if (err instanceof ValidationError) {
      console.warn("[API] validation error", { error: err.message });
      return res.status(400).json({ error: err.message });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] card fetch error", { error: errorMsg });
    return res.status(500).json({ error: "Failed to fetch card" });
  }
}
