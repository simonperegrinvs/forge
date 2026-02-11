import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("ralph-loop template scripts", () => {
  it("plan prompt does not include user_request or plan_id placeholders", async () => {
    const templateRoot = path.resolve("src-tauri/resources/forge/templates/ralph-loop");
    const planPrompt = await fs.readFile(path.join(templateRoot, "prompts", "plan.md"), "utf8");

    expect(planPrompt).not.toContain("{{user_request}}");
    expect(planPrompt).not.toContain("{{plan_id}}");
    expect(planPrompt).toContain("Ready for your request.");
    expect(planPrompt).toContain("@plan");
  });

  it("post-plan initializes state and renders execute prompt; post-step updates prompt when complete", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-monitor-ralph-loop-"));
    const workspaceRoot = tempRoot;
    const templateRoot = path.resolve(
      "src-tauri/resources/forge/templates/ralph-loop",
    );

    const planId = "test-plan";
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
          title: "Ralph Loop Test",
          goal: "Test goal for ralph-loop plan generation",
          context: {
            tech_stack: ["Node.js"],
            constraints: ["Do NOT add unrelated features."],
          },
          tasks: [
            {
              id: "task-1",
              name: "Test task",
              description: "Implement something specific for test coverage.",
              depends_on: [],
              files: ["README.md"],
              verification: ["README.md exists."],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const context = {
      workspaceRoot,
      templateRoot,
      planId,
      planDir,
      planPath,
      statePath,
      progressPath,
      generatedPlanMdPath,
      generatedExecutePromptPath,
      todayIso: "2026-02-10",
    };
    await fs.writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");

    const postPlanScript = path.join(templateRoot, "scripts", "post-plan.mjs");
    await execFileAsync(process.execPath, [postPlanScript, "--context", contextPath]);

    const stateRaw = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(stateRaw);
    expect(state.$schema).toBe("state-v2");
    expect(state.plan_id).toBe(planId);
    expect(state.iteration).toBe(0);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      id: "task-1",
      status: "pending",
      attempts: 0,
      commit_sha: null,
    });
    expect(state.tasks[0].phases).toHaveLength(1);
    expect(state.tasks[0].phases[0]).toMatchObject({
      id: "implementation",
      status: "pending",
      attempts: 0,
    });

    const progress = await fs.readFile(progressPath, "utf8");
    expect(progress).toBe("");

    const planMd = await fs.readFile(generatedPlanMdPath, "utf8");
    expect(planMd).toContain(`# Plan: ${planId}`);

    const executePrompt = await fs.readFile(generatedExecutePromptPath, "utf8");
    expect(executePrompt).toContain(`plans/${planId}/state.json`);
    expect(executePrompt).toContain("YOUR TASK: task-1");
    expect(executePrompt).toContain("Current phase:");
    expect(executePrompt).toContain("implementation");

    // Pre-execute should pass when the required skill exists in the workspace.
    const skillDest = path.join(workspaceRoot, ".agent", "skills", "plan", "SKILL.md");
    await fs.mkdir(path.dirname(skillDest), { recursive: true });
    const skillSrc = await fs.readFile(path.join(templateRoot, "skills", "plan", "SKILL.md"));
    await fs.writeFile(skillDest, skillSrc);

    const preExecuteScript = path.join(templateRoot, "scripts", "pre-execute.mjs");
    await execFileAsync(process.execPath, [preExecuteScript, "--context", contextPath]);

    // Mark task completed and regenerate prompt.
    state.iteration = 1;
    state.tasks[0].status = "completed";
    state.tasks[0].attempts = 1;
    state.tasks[0].notes = "Done.";
    state.tasks[0].commit_sha = "deadbeef";
    state.tasks[0].phases[0].status = "completed";
    state.tasks[0].phases[0].attempts = 1;
    state.tasks[0].phases[0].notes = "Done.";
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const postStepScript = path.join(templateRoot, "scripts", "post-step.mjs");
    await execFileAsync(process.execPath, [postStepScript, "--context", contextPath]);

    const nextPrompt = await fs.readFile(generatedExecutePromptPath, "utf8");
    expect(nextPrompt).toContain("All tasks completed");
  });

  it("post-step truncates oversized state notes before validation", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-monitor-ralph-loop-"));
    const workspaceRoot = tempRoot;
    const templateRoot = path.resolve(
      "src-tauri/resources/forge/templates/ralph-loop",
    );
    const planId = "notes-truncation";
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
          title: "Notes Truncation",
          goal: "Ensure oversized notes are truncated automatically by post-step.",
          context: {
            tech_stack: ["Node.js"],
            constraints: ["Keep state files valid."],
          },
          tasks: [
            {
              id: "task-1",
              name: "Task with long notes",
              description: "Exercise notes truncation behavior for state validation safety.",
              depends_on: [],
              files: ["README.md"],
              verification: ["State remains valid."],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const context = {
      workspaceRoot,
      templateRoot,
      planId,
      planDir,
      planPath,
      statePath,
      progressPath,
      generatedPlanMdPath,
      generatedExecutePromptPath,
      todayIso: "2026-02-10",
    };
    await fs.writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");

    const postPlanScript = path.join(templateRoot, "scripts", "post-plan.mjs");
    await execFileAsync(process.execPath, [postPlanScript, "--context", contextPath]);

    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    state.tasks[0].notes = "x".repeat(2200);
    state.tasks[0].phases[0].notes = "y".repeat(1000);
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const postStepScript = path.join(templateRoot, "scripts", "post-step.mjs");
    await execFileAsync(process.execPath, [postStepScript, "--context", contextPath]);

    const normalizedState = JSON.parse(await fs.readFile(statePath, "utf8"));
    expect(normalizedState.tasks[0].notes.length).toBeLessThanOrEqual(2000);
    expect(normalizedState.tasks[0].notes).toContain("[truncated]");
    expect(normalizedState.tasks[0].phases[0].notes.length).toBeLessThanOrEqual(800);
    expect(normalizedState.tasks[0].phases[0].notes).toContain("[truncated]");

    const prompt = await fs.readFile(generatedExecutePromptPath, "utf8");
    expect(prompt).toContain("YOUR TASK: task-1");
  });
});
