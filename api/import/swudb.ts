import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateSwudbUrl, validatePayloadSize, validatePostBody } from "../../src/lib/server/validation.js";
import { env } from "../../src/lib/server/env.js";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../../src/lib/server/rateLimit.js";
import { setCorsHeaders, verifyOrigin } from "../../src/lib/server/cors.js";
import { fetchSwudbDeck, searchSwuapiCards, swudbToRow, type SwudbDeckCard } from "../../src/lib/server/swudb.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Map SWUDB numeric type to our section name
function cardSection(card: SwudbDeckCard): string {
  if (card.type === 0 || card.type === 1) return 'Leader/Base'
  return 'Mainboard'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    verifyOrigin(req.headers.origin, undefined, req.headers.host);
  } catch (err) {
    console.warn("[API] origin verification failed", {
      origin: req.headers.origin,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `swudb-import:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.IMPORT_SWUDB.limit, RATE_LIMITS.IMPORT_SWUDB.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  res.setHeader("X-RateLimit-Remaining", getRateLimitRemaining(rateLimitKey, RATE_LIMITS.IMPORT_SWUDB.limit));

  try {
    // Validate payload size and structure
    validatePayloadSize(req.body, 5 * 1024); // 5KB max for URL payload
    const body = validatePostBody(req.body, { url: 'string' });
    const deckId = validateSwudbUrl(body.url);
    const startTime = Date.now();

    const swudbDeck = await fetchSwudbDeck(deckId);
    if (!swudbDeck) {
      console.error("[API] swudb fetch returned null", { deckId, duration: Date.now() - startTime });
      return res.status(404).json({ error: "Failed to fetch deck from SWUDB. Check the deck URL and try again." });
    }

    if (swudbDeck.cards.length === 0) {
      return res.status(200).json({ name: swudbDeck.name, cards: [], sections: [] });
    }

    // De-duplicate names (leader might appear in both leader slot and shuffledDeck)
    const uniqueNames = [...new Set(swudbDeck.cards.map((c) => c.name))];

    // 1. Batch lookup by name in our DB
    const { data: dbCards, error: dbError } = await supabase
      .from("cards")
      .select("id, name, swu_type, arena")
      .in("name", uniqueNames)
      .eq("game", "swu");

    if (dbError) {
      console.error("[API] card lookup failed", { deckId, error: dbError.message });
      return res.status(500).json({ error: "Failed to look up cards" });
    }

    const nameToId = new Map<string, number>(
      (dbCards ?? []).map((c: Record<string, unknown>) => [c.name as string, c.id as number])
    );

    // 2. For names not in DB, search SWUAPI and insert
    const missingNames = uniqueNames.filter((n) => !nameToId.has(n));
    if (missingNames.length > 0) {
      for (const name of missingNames) {
        try {
          const results = await searchSwuapiCards(name, 5);
          // Find best match: exact name (full name = name + subtitle or just name)
          const match = results.find((c) => {
            const fullName = c.subtitle ? `${c.name}, ${c.subtitle}` : c.name;
            return fullName.toLowerCase() === name.toLowerCase();
          }) ?? results[0];

          if (match) {
            const row = swudbToRow(match);
            const { data: upserted } = await supabase
              .from("cards")
              .upsert(row, { onConflict: "scryfall_id,game" })
              .select("id, name")
              .single();
            if (upserted) {
              nameToId.set(upserted.name as string, upserted.id as number);
              // Also map the original lookup name in case there's a casing difference
              if (!nameToId.has(name)) {
                nameToId.set(name, upserted.id as number);
              }
            }
          }
        } catch (err) {
          console.warn(`[API] failed to fetch card "${name}":`, err instanceof Error ? err.message : "unknown");
        }
      }
    }

    // 3. Build result rows
    const result: { card_id: number; section: string; quantity: number }[] = [];

    for (const card of swudbDeck.cards) {
      const cardId = nameToId.get(card.name);
      if (!cardId) {
        console.warn(`[API] card not resolved: "${card.name}"`);
        continue;
      }
      const section = cardSection(card);
      if (card.quantity > 0) {
        result.push({ card_id: cardId, section, quantity: card.quantity });
      }
      if (card.sideboardQuantity > 0) {
        result.push({ card_id: cardId, section: "Sideboard", quantity: card.sideboardQuantity });
      }
    }

    const usedSections = [...new Set(result.map((c) => c.section))];

    console.info("[API] swudb import success", {
      deckId,
      cardCount: result.length,
      sections: usedSections.length,
      duration: Date.now() - startTime,
    });

    return res.status(200).json({
      name: swudbDeck.name,
      cards: result,
      sections: usedSections,
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
