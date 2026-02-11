import fs from "node:fs/promises";
import path from "node:path";

import { requireFlagValue } from "./lib/args.mjs";
import { readContext } from "./lib/context.mjs";
import { renderExecutePrompt } from "./lib/execute.mjs";
import { planStateToMarkdown } from "./lib/markdown.mjs";
import { buildInitialState, validatePlan } from "./lib/plan.mjs";
import { ensureFileExists, readJsonFile, writeJsonFile } from "./lib/state.mjs";

async function main() {
  const contextPath = requireFlagValue(process.argv.slice(2), "context");
  const ctx = await readContext(contextPath);

  const plan = await readJsonFile(ctx.planPath);
  validatePlan(plan);

  const phases = await readJsonFile(path.join(ctx.templateRoot, "phases.json"));
  const templatePhases = Array.isArray(phases?.phases) ? phases.phases : [];

  // Initialize plans/<planId>/state.json
  const state = buildInitialState(plan, templatePhases);
  await writeJsonFile(ctx.statePath, state);

  // Write plans/<planId>/plan.md (derived, includes state)
  await fs.mkdir(path.dirname(ctx.generatedPlanMdPath), { recursive: true });
  await fs.writeFile(
    ctx.generatedPlanMdPath,
    planStateToMarkdown(plan, state, templatePhases),
    "utf8",
  );

  // Ensure plans/<planId>/progress.md exists.
  await ensureFileExists(ctx.progressPath, "");

  // Render initial execute prompt for the first runnable task.
  const templateText = await fs.readFile(
    path.join(ctx.templateRoot, "prompts", "execute.md"),
    "utf8",
  );
  const progressNotes = await fs.readFile(ctx.progressPath, "utf8").catch(() => "");
  const prompt = renderExecutePrompt({
    templateText,
    plan,
    state,
    templatePhases,
    progressNotes,
    todayIso: ctx.todayIso,
  });
  await fs.mkdir(path.dirname(ctx.generatedExecutePromptPath), { recursive: true });
  await fs.writeFile(ctx.generatedExecutePromptPath, prompt, "utf8");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
