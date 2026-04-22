import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateQuery } from "../../src/lib/validation";
import { env } from "./_lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "./_lib/rateLimit";

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
  released_at?: string;
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
    released_at: card.released_at ?? null,
    image_uris: pickImageUris(card),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `cards-search:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.CARDS_SEARCH.limit, RATE_LIMITS.CARDS_SEARCH.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const remaining = getRateLimitRemaining(rateLimitKey, RATE_LIMITS.CARDS_SEARCH.limit);
  res.setHeader("X-RateLimit-Remaining", remaining);

  try {
    const q = req.query.q;
    const query = validateQuery(q);

    // 1. Check Supabase cache first
    const { data: cached, error: cacheError } = await supabase
      .from("cards")
      .select("*")
      .ilike("name", `%${query}%`)
      .limit(20);

    if (!cacheError && cached && cached.length > 0) {
      return res.status(200).json({ data: cached, source: "cache" });
    }

    // 2. Cache miss — fetch from Scryfall
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!scryfallRes.ok) {
      console.error("[API] scryfall search failed", { query, status: scryfallRes.status });
      return res.status(502).json({ error: "Failed to search cards" });
    }

    const scryfallData = await scryfallRes.json();
    const cards: ScryfallCard[] = scryfallData.data ?? [];

    // 3. Write results back to cache
    const rows = cards.map(scryfallToRow);
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("cards")
        .upsert(rows, { onConflict: "scryfall_id" });
      if (upsertError) {
        console.error("[API] cache upsert failed", { query, error: upsertError.message });
      }
    }

    // 4. Return the cached-format rows
    const { data: freshData } = await supabase
      .from("cards")
      .select("*")
      .in("scryfall_id", rows.map((r) => r.scryfall_id));

    return res.status(200).json({ data: freshData ?? rows, source: "scryfall" });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR') {
      const errMsg = 'message' in err ? String(err.message) : 'Validation error';
      console.warn("[API] validation error", { error: errMsg });
      return res.status(400).json({ error: errMsg });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] card search error", { error: errorMsg });
    return res.status(500).json({ error: "Failed to search cards" });
  }
}
