import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const TEMPLATE_ROOT = path.resolve(
  "src-tauri/resources/forge/templates/risk-adaptive-loop",
);
const PHASE_IDS = [
  "risk-triage",
  "focused-tests",
  "implementation",
  "review-gate",
];

type ScriptContext = {
  workspaceRoot: string;
  templateRoot: string;
  planId: string;
  planDir: string;
  planPath: string;
  statePath: string;
  progressPath: string;
  generatedPlanMdPath: string;
  generatedExecutePromptPath: string;
  todayIso: string;
};

async function createScriptContext(planId: string): Promise<{
  contextPath: string;
  context: ScriptContext;
}> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-monitor-risk-adaptive-loop-"),
  );
  const planDir = path.join(tempRoot, "plans", planId);
  const planPath = path.join(planDir, "plan.json");
  const statePath = path.join(planDir, "state.json");
  const progressPath = path.join(planDir, "progress.md");
  const generatedPlanMdPath = path.join(planDir, "plan.md");
  const generatedExecutePromptPath = path.join(planDir, "execute-prompt.md");
  const contextPath = path.join(tempRoot, "context.json");

  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        $schema: "plan-v1",
        id: planId,
        title: "Risk-Adaptive Loop Script Test",
        goal: "Validate risk-adaptive-loop scripts and phase progression.",
        context: {
          tech_stack: ["Node.js", "Vitest"],
          constraints: ["Keep script tests deterministic."],
        },
        tasks: [
          {
            id: "task-1",
            name: "Risk-oriented implementation task",
            description:
              "Ensure risk-adaptive loop prompts the right phase with lightweight evidence.",
            depends_on: [],
            files: ["src/features/forge/scripts/riskAdaptiveLoopScripts.test.ts"],
            verification: [
              "State initializes all template phases.",
              "Prompt advances to the first non-completed phase.",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const context: ScriptContext = {
    workspaceRoot: tempRoot,
    templateRoot: TEMPLATE_ROOT,
    planId,
    planDir,
    planPath,
    statePath,
    progressPath,
    generatedPlanMdPath,
    generatedExecutePromptPath,
    todayIso: "2026-02-12",
  };

  await fs.writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  return { contextPath, context };
}

async function runScript(scriptName: "post-plan.mjs" | "post-step.mjs", contextPath: string) {
  const scriptPath = path.join(TEMPLATE_ROOT, "scripts", scriptName);
  await execFileAsync(process.execPath, [scriptPath, "--context", contextPath]);
}

describe("risk-adaptive-loop template scripts", () => {
  it("post-plan initializes all task phases as pending in template order", async () => {
    const { contextPath, context } = await createScriptContext("phase-init");
    await runScript("post-plan.mjs", contextPath);

    const state = JSON.parse(await fs.readFile(context.statePath, "utf8"));
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].phases).toHaveLength(PHASE_IDS.length);
    expect(state.tasks[0].phases.map((phase: { id: string }) => phase.id)).toEqual(
      PHASE_IDS,
    );
    expect(
      state.tasks[0].phases.map(
        (phase: { status: string; attempts: number; notes: string }) => ({
          status: phase.status,
          attempts: phase.attempts,
          notes: phase.notes,
        }),
      ),
    ).toEqual(
      PHASE_IDS.map(() => ({
        status: "pending",
        attempts: 0,
        notes: "",
      })),
    );
  });

  it("post-step advances prompt to the first non-completed phase", async () => {
    const { contextPath, context } = await createScriptContext("phase-advance");
    await runScript("post-plan.mjs", contextPath);

    const firstPrompt = await fs.readFile(context.generatedExecutePromptPath, "utf8");
    expect(firstPrompt).toContain("Current phase: risk-triage - Risk Triage");

    const state = JSON.parse(await fs.readFile(context.statePath, "utf8"));
    state.tasks[0].status = "in_progress";
    state.tasks[0].phases[0].status = "completed";
    state.tasks[0].phases[1].status = "completed";
    state.tasks[0].phases[2].status = "completed";
    await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    await runScript("post-step.mjs", contextPath);
    const reviewPrompt = await fs.readFile(context.generatedExecutePromptPath, "utf8");
    expect(reviewPrompt).toContain("Current phase: review-gate - Review Gate");
  });
});
