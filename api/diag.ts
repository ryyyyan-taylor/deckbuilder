import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, depth = 0, max = 3): string[] {
  const out: string[] = [];
  if (depth > max) return out;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory()) {
          out.push(full + "/");
          out.push(...walk(full, depth + 1, max));
        } else {
          out.push(full);
        }
      } catch {
        // ignore
      }
    }
  } catch (e) {
    out.push(`<err:${dir}:${e instanceof Error ? e.message : "?"}>`);
  }
  return out;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const cwd = process.cwd();
  const apiTree = walk(join(cwd, "api"));
  const srcTree = walk(join(cwd, "src"), 0, 2);
  const rootEntries = (() => {
    try {
      return readdirSync(cwd);
    } catch (e) {
      return [`<err:${e instanceof Error ? e.message : "?"}>`];
    }
  })();

  res.status(200).json({
    nodeVersion: process.version,
    cwd,
    rootEntries,
    apiTreeCount: apiTree.length,
    apiTree,
    srcTree,
  });
}
