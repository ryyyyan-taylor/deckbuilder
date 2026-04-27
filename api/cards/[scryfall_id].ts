import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateString, validateGame } from "../../src/lib/validation.js";
import { env } from "../../src/lib/server/env.js";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../../src/lib/server/rateLimit.js";
import { setCorsHeaders } from "../../src/lib/server/cors.js";
import { fetchScryfallById, scryfallToRow } from "../../src/lib/server/scryfall.js";
import { fetchSwuapiCardById } from "../../src/lib/server/swudb.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

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
    const gameParam = req.query.game;
    const cardId = validateString(scryfall_id, 50, /^[a-z0-9-]+$/i);
    const game = validateGame(gameParam);

    // 1. Check Supabase cache (filtered by game)
    const { data: cached, error: cacheError } = await supabase
      .from("cards")
      .select("*")
      .eq("scryfall_id", cardId)
      .eq("game", game)
      .single();

    if (!cacheError && cached) {
      return res.status(200).json({ data: cached, source: "cache" });
    }

    // 2. Cache miss — fetch from appropriate source
    let card: Record<string, unknown> | null = null;
    let source = "unknown";

    if (game === "swu") {
      const swuCard = await fetchSwuapiCardById(cardId);
      if (swuCard) {
        card = {
          game: "swu",
          scryfall_id: swuCard.uuid,
          name: swuCard.subtitle ? `${swuCard.name}, ${swuCard.subtitle}` : swuCard.name,
          swu_type: swuCard.type,
          aspects: swuCard.aspects ?? [],
          cost: swuCard.cost ?? null,
          arena: swuCard.arena ?? null,
          hp: swuCard.hp ?? null,
          power: swuCard.power ?? null,
          set_code: swuCard.set_code,
          type_line: swuCard.type,
          image_uris: {
            normal: swuCard.front_image_url,
            ...(swuCard.back_image_url ? { back: swuCard.back_image_url } : {}),
          },
        };
        source = "swuapi";
      }
    } else {
      const scryfallCard = await fetchScryfallById(cardId);
      if (scryfallCard) {
        card = scryfallToRow(scryfallCard);
        source = "scryfall";
      }
    }

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    // 3. Write to cache
    const { data: inserted, error: insertError } = await supabase
      .from("cards")
      .upsert(card, { onConflict: "scryfall_id,game" })
      .select()
      .single();

    if (insertError) {
      console.error("[API] card cache upsert failed", { cardId, game, error: insertError.message });
    }

    return res.status(200).json({ data: inserted ?? card, source });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR') {
      const errMsg = 'message' in err ? String(err.message) : 'Validation error';
      console.warn("[API] validation error", { error: errMsg });
      return res.status(400).json({ error: errMsg });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] card fetch error", { error: errorMsg });
    return res.status(500).json({ error: "Failed to fetch card" });
  }
}
