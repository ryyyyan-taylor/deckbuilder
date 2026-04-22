import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { validateCommanderName } from "../../src/lib/validation";
import { env } from "./_lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "./_lib/rateLimit";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function parseMtgTop8Date(dateStr: string): string {
  // Format: DD/MM/YY → YYYY-MM-DD
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return dateStr;
  const [, day, month, year] = match;
  const fullYear = parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
  return `${fullYear}-${month}-${day}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown";
  const rateLimitKey = `mtgtop8:${clientIp}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMITS.RESULTS_TOURNAMENT.limit, RATE_LIMITS.RESULTS_TOURNAMENT.window)) {
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", getRateLimitReset(rateLimitKey));
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const remaining = getRateLimitRemaining(rateLimitKey, RATE_LIMITS.RESULTS_TOURNAMENT.limit);
  res.setHeader("X-RateLimit-Remaining", remaining);

  try {
    const commander = req.query.commander;
    const commanderName = validateCommanderName(commander);
    const commanderLower = commanderName.toLowerCase();

    // Check cache
    const { data: cached } = await supabase
      .from("tournament_cache")
      .select("data, fetched_at")
      .eq("commander_name", commanderLower)
      .eq("source", "mtgtop8")
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < CACHE_TTL) {
        return res.status(200).json(cached.data);
      }
    }

    // Search MTGTop8 for Duel Commander results
    const searchUrl = `https://www.mtgtop8.com/search?MD_check=1&SB_check=1&cards=${encodeURIComponent(commanderName)}&format=EDH`;
    const mtgRes = await fetch(searchUrl, {
      headers: { "User-Agent": "MTGDeckBuilder/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!mtgRes.ok) {
      console.error("[API] mtgtop8 fetch failed", { commander: commanderName, status: mtgRes.status });
      return res.status(502).json({
        error: "Failed to fetch MTGTop8 results",
        fallback_url: searchUrl,
      });
    }

    const html = await mtgRes.text();
    const $ = cheerio.load(html);

    const results: {
      tournament_name: string;
      date: string;
      player: string;
      standing: number | null;
      decklist_url: string | null;
      tournament_size: number | null;
    }[] = [];

    // Results are in tr.hover_tr rows
    // Columns: checkbox, deck (link), player, format, event, level, rank, date
    $("tr.hover_tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 8) return;

      // Col 1: Deck name with link to decklist
      const deckLink = $(cells[1]).find("a");
      const deckHref = deckLink.attr("href");

      // Col 2: Player name
      const player = $(cells[2]).text().trim();

      // Col 4: Event name
      const event = $(cells[4]).text().trim();

      // Col 6: Rank/placement
      const rankText = $(cells[6]).text().trim();
      const rankMatch = rankText.match(/^(\d+)/);

      // Col 7: Date (DD/MM/YY)
      const dateText = $(cells[7]).text().trim();

      if (!player && !event) return;

      results.push({
        tournament_name: event,
        date: parseMtgTop8Date(dateText),
        player,
        standing: rankMatch ? parseInt(rankMatch[1], 10) : null,
        decklist_url: deckHref
          ? `https://www.mtgtop8.com/${deckHref}`
          : null,
        tournament_size: null,
      });
    });

    const result = {
      results: results.slice(0, 50),
      search_url: searchUrl,
    };

    // Upsert cache
    const { error: cacheError } = await supabase.from("tournament_cache").upsert(
      {
        commander_name: commanderLower,
        source: "mtgtop8",
        data: result,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "commander_name,source" }
    );
    if (cacheError) {
      console.error("[API] mtgtop8 cache upsert failed", { commander: commanderName, error: cacheError.message });
    }

    return res.status(200).json(result);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR') {
      const errMsg = 'message' in err ? String(err.message) : 'Validation error';
      console.warn("[API] validation error", { error: errMsg });
      return res.status(400).json({ error: errMsg });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] mtgtop8 error", { error: errorMsg });
    const searchUrl = `https://www.mtgtop8.com/search?MD_check=1&SB_check=1&cards=${encodeURIComponent(req.query.commander as string)}&format=EDH`;
    return res.status(500).json({
      error: "Failed to fetch MTGTop8 results",
      fallback_url: searchUrl,
    });
  }
}
