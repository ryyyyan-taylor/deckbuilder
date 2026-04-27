import type { VercelRequest, VercelResponse } from "@vercel/node";

interface DiagResult {
  step: string;
  ok: boolean;
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const results: DiagResult[] = [];

  const tryStep = async (step: string, fn: () => Promise<unknown> | unknown) => {
    try {
      await fn();
      results.push({ step, ok: true });
    } catch (e) {
      results.push({ step, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  await tryStep("import _lib/env", async () => {
    await import("./_lib/env");
  });
  await tryStep("import _lib/cors", async () => {
    await import("./_lib/cors");
  });
  await tryStep("import _lib/rateLimit", async () => {
    await import("./_lib/rateLimit");
  });
  await tryStep("import _lib/scryfall", async () => {
    await import("./_lib/scryfall");
  });
  await tryStep("import _lib/swudb", async () => {
    await import("./_lib/swudb");
  });
  await tryStep("import src/lib/validation", async () => {
    await import("../src/lib/validation");
  });

  const filter = String(req.query.q ?? "");
  res.status(200).json({
    ok: results.every((r) => r.ok),
    nodeVersion: process.version,
    cwd: process.cwd(),
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    filter,
    results,
  });
}
