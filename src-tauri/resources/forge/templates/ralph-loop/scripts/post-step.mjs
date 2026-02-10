import fs from "node:fs/promises";
import path from "node:path";

import { requireFlagValue } from "./lib/args.mjs";
import { readContext } from "./lib/context.mjs";
import { renderExecutePrompt } from "./lib/execute.mjs";
import { validatePlan, validateStateAgainstPlan } from "./lib/plan.mjs";
import { readJsonFile } from "./lib/state.mjs";

async function main() {
  const contextPath = requireFlagValue(process.argv.slice(2), "context");
  const ctx = await readContext(contextPath);

  const plan = await readJsonFile(ctx.planPath);
  validatePlan(plan);

  const state = await readJsonFile(ctx.statePath);
  const stateErrors = validateStateAgainstPlan(state, plan);
  if (stateErrors.length > 0) {
    throw new Error(`state.json is invalid:\n${stateErrors.join("\n")}`);
  }

  const templateText = await fs.readFile(
    path.join(ctx.templateRoot, "prompts", "execute.md"),
    "utf8",
  );
  const progressNotes = await fs.readFile(ctx.progressPath, "utf8").catch(() => "");

  const prompt = renderExecutePrompt({
    templateText,
    plan,
    state,
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

