import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // Check environment variables
  const requiredEnvVars = ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

  checks.environment = {
    ok: missingEnvVars.length === 0,
    error: missingEnvVars.length > 0 ? `Missing: ${missingEnvVars.join(", ")}` : undefined,
  };

  // Check Supabase connection
  if (checks.environment.ok) {
    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { error } = await Promise.race([
        supabase.from("cards").select("id").limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000)
        ),
      ]);

      checks.supabase = {
        ok: !error,
        error: error ? error.message : undefined,
      };
    } catch (err) {
      checks.supabase = {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  } else {
    checks.supabase = {
      ok: false,
      error: "Skipped due to missing environment variables",
    };
  }

  // Overall status
  const isHealthy = Object.values(checks).every((check) => check.ok);

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime(),
  });
}
