import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { validateCommanderName } from "../../src/lib/validation";
import { env } from "./_lib/env";
import { checkRateLimit, getRateLimitRemaining, getRateLimitReset, RATE_LIMITS } from "./_lib/rateLimit";
import { setCorsHeaders, verifyOrigin } from "./_lib/cors";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface GqlEntry {
  node: {
    standing: number;
    winRate: number;
    wins: number;
    losses: number;
    draws: number;
    decklist: string | null;
    player: {
      name: string;
    };
    tournament: {
      name: string;
      size: number;
      tournamentDate: string;
    };
  };
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
  const rateLimitKey = `edhtop16:${clientIp}`;
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
      .eq("source", "edhtop16")
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < CACHE_TTL) {
        return res.status(200).json(cached.data);
      }
    }

    // EDHTop16 uses commander(name).entries() pattern
    const query = `
      query($name: String!) {
        commander(name: $name) {
          entries(first: 50, sortBy: NEW, filters: { minEventSize: 1, timePeriod: ALL_TIME }) {
            edges {
              node {
                standing
                winRate
                wins
                losses
                draws
                decklist
                player {
                  name
                }
                tournament {
                  name
                  size
                  tournamentDate
                }
              }
            }
          }
        }
      }
    `;

    const gqlRes = await fetch("https://edhtop16.com/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MTGDeckBuilder/1.0",
      },
      body: JSON.stringify({
        query,
        variables: { name: commanderName },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!gqlRes.ok) {
      console.error("[API] edhtop16 fetch failed", { commander: commanderName, status: gqlRes.status });
      return res.status(502).json({ error: "Failed to fetch EDHTop16 results" });
    }

    const gqlData = await gqlRes.json();

    if (gqlData.errors) {
      console.error("[API] edhtop16 graphql error", { commander: commanderName, errors: gqlData.errors });
      return res.status(502).json({ error: "Failed to fetch EDHTop16 results" });
    }

    const edges: GqlEntry[] = gqlData?.data?.commander?.entries?.edges ?? [];

    const results = edges.map((e) => ({
      tournament_name: e.node.tournament.name,
      date: e.node.tournament.tournamentDate,
      player: e.node.player.name,
      standing: e.node.standing,
      wins: e.node.wins,
      losses: e.node.losses,
      draws: e.node.draws,
      decklist_url: e.node.decklist || null,
      tournament_size: e.node.tournament.size,
    }));

    const result = { results };

    // Upsert cache
    const { error: cacheError } = await supabase.from("tournament_cache").upsert(
      {
        commander_name: commanderLower,
        source: "edhtop16",
        data: result,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "commander_name,source" }
    );
    if (cacheError) {
      console.error("[API] edhtop16 cache upsert failed", { commander: commanderName, error: cacheError.message });
    }

    return res.status(200).json(result);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR') {
      const errMsg = 'message' in err ? String(err.message) : 'Validation error';
      console.warn("[API] validation error", { error: errMsg });
      return res.status(400).json({ error: errMsg });
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[API] edhtop16 error", { error: errorMsg });
    return res.status(500).json({ error: "Failed to fetch EDHTop16 results" });
  }
}
