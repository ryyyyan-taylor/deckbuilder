import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { validateCommanderName } from "../../src/lib/validation.js";
import { env } from "../../src/lib/server/env.js";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "../../src/lib/server/rateLimit.js";
import { setCorsHeaders, verifyOrigin } from "../../src/lib/server/cors.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function parseMtgTop8Date(dateStr: string): string {
  // Format: DD/MM/YY → YYYY-MM-DD
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return dateStr;

  const [, dayStr, monthStr, yearStr] = match;
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  // Validate ranges
  if (month < 1 || month > 12) return dateStr;
  if (day < 1 || day > 31) return dateStr;

  // Y2K pivot: >= 70 → 19XX, < 70 → 20XX
  const fullYear = year >= 70 ? `19${yearStr}` : `20${yearStr}`;

  // Format with zero-padding
  const paddedMonth = monthStr.padStart(2, '0');
  const paddedDay = dayStr.padStart(2, '0');

  return `${fullYear}-${paddedMonth}-${paddedDay}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify origin for this expensive endpoint
  try {
    verifyOrigin(req.headers.origin);
  } catch (err) {
    console.warn("[API] origin verification failed", {
      origin: req.headers.origin,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return res.status(403).json({ error: "Forbidden" });
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

    // Validate HTML structure before parsing
    if (!html.includes("hover_tr") || html.length < 100) {
      console.error("[API] mtgtop8 invalid HTML structure", {
        commander: commanderName,
        htmlLength: html.length,
      });
      return res.status(502).json({
        error: "Invalid response from MTGTop8",
        fallback_url: searchUrl,
      });
    }

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
