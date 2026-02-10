import fs from "node:fs/promises";
import path from "node:path";

import { requireFlagValue } from "./lib/args.mjs";
import { readContext } from "./lib/context.mjs";
import { readJsonFile } from "./lib/state.mjs";

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const contextPath = requireFlagValue(process.argv.slice(2), "context");
  const ctx = await readContext(contextPath);

  // Validate template completeness (manifest-driven).
  const manifestPath = path.join(ctx.templateRoot, "template.json");
  const manifest = await readJsonFile(manifestPath);
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  for (const rel of files) {
    const abs = path.join(ctx.templateRoot, rel);
    if (!(await fileExists(abs))) {
      throw new Error(`Template file missing: ${rel}`);
    }
  }

  // Validate required skill is installed into the workspace.
  const skillPath = path.join(ctx.workspaceRoot, ".agent", "skills", "plan", "SKILL.md");
  if (!(await fileExists(skillPath))) {
    throw new Error(`Missing required workspace skill: ${skillPath}`);
  }

  // Validate that plan + state exist.
  if (!(await fileExists(ctx.planPath))) {
    throw new Error(`Missing plan.json: ${ctx.planPath}`);
  }
  if (!(await fileExists(ctx.statePath))) {
    throw new Error(`Missing state.json: ${ctx.statePath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

