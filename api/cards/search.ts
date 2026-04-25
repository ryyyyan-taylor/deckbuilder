import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateQuery, validateGame } from "../../src/lib/validation";
import { env } from "../_lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../_lib/rateLimit";
import { setCorsHeaders } from "../_lib/cors";
import { searchScryfall, scryfallToRow } from "../_lib/scryfall";
import { searchSwuapiCards } from "../_lib/swudb";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

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
    const gameParam = req.query.game;
    const query = validateQuery(q);
    const game = validateGame(gameParam);

    // 1. Check Supabase cache first (filtered by game)
    const { data: cached, error: cacheError } = await supabase
      .from("cards")
      .select("*")
      .ilike("name", `%${query}%`)
      .eq("game", game)
      .limit(20);

    if (!cacheError && cached && cached.length > 0) {
      return res.status(200).json({ data: cached, source: "cache" });
    }

    // 2. Cache miss — fetch from appropriate source
    let cards: any[] = [];
    if (game === "swu") {
      const swuCards = await searchSwuapiCards(query, 20);
      cards = swuCards.map((c: any) => ({
        game: "swu",
        scryfall_id: c.uuid,
        name: c.subtitle ? `${c.name}, ${c.subtitle}` : c.name,
        swu_type: c.type,
        aspects: c.aspects ?? [],
        cost: c.cost ?? null,
        arena: c.arena ?? null,
        hp: c.hp ?? null,
        power: c.power ?? null,
        set_code: c.set_code,
        type_line: c.type,
        image_uris: {
          normal: c.front_image_url,
          ...(c.back_image_url ? { back: c.back_image_url } : {}),
        },
      }));
    } else {
      const scryfallCards = await searchScryfall(query);
      cards = scryfallCards.map(scryfallToRow);
    }

    // 3. Write results back to cache
    if (cards.length > 0) {
      const { error: upsertError } = await supabase
        .from("cards")
        .upsert(cards, { onConflict: "scryfall_id,game" });
      if (upsertError) {
        console.error("[API] cache upsert failed", { query, game, error: upsertError.message });
      }
    }

    // 4. Return the cached-format rows
    const { data: freshData } = await supabase
      .from("cards")
      .select("*")
      .in("scryfall_id", cards.map((r: any) => r.scryfall_id))
      .eq("game", game);

    return res.status(200).json({ data: freshData ?? cards, source: game === "swu" ? "swuapi" : "scryfall" });
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
