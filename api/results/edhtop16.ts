import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const commander = req.query.commander;
  if (!commander || typeof commander !== "string") {
    return res.status(400).json({ error: "Missing commander query parameter" });
  }

  const commanderLower = commander.toLowerCase();

  try {
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
        variables: { name: commander },
      }),
    });

    if (!gqlRes.ok) {
      return res
        .status(502)
        .json({ error: `EDHTop16 returned ${gqlRes.status}` });
    }

    const gqlData = await gqlRes.json();

    if (gqlData.errors) {
      return res
        .status(502)
        .json({ error: gqlData.errors[0]?.message ?? "GraphQL error" });
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
    await supabase.from("tournament_cache").upsert(
      {
        commander_name: commanderLower,
        source: "edhtop16",
        data: result,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "commander_name,source" }
    );

    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ error: "Failed to fetch EDHTop16 results" });
  }
}
