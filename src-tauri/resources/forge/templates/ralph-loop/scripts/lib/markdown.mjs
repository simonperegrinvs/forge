import { formatBulletList } from "./render.mjs";

export function planToMarkdown(plan) {
  const techStack = Array.isArray(plan?.context?.tech_stack)
    ? plan.context.tech_stack.join(", ")
    : "";
  const constraints = Array.isArray(plan?.context?.constraints)
    ? formatBulletList(plan.context.constraints)
    : "";

  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];

  const lines = [];
  lines.push(`# Plan: ${plan.id}`);
  lines.push("");
  lines.push(`## Goal`);
  lines.push("");
  lines.push(plan.goal ?? "");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`- Tech stack: ${techStack}`);
  lines.push("");
  if (constraints) {
    lines.push("### Constraints");
    lines.push("");
    lines.push(constraints);
    lines.push("");
  }

  lines.push("## Tasks");
  lines.push("");
  for (const task of tasks) {
    lines.push(`### ${task.id}: ${task.name}`);
    lines.push("");
    lines.push(`- Depends on: ${Array.isArray(task.depends_on) && task.depends_on.length > 0 ? task.depends_on.join(", ") : "(none)"}`);
    lines.push("");
    lines.push(task.description ?? "");
    lines.push("");
    if (Array.isArray(task.files) && task.files.length > 0) {
      lines.push("Files:");
      lines.push(formatBulletList(task.files));
      lines.push("");
    }
    if (Array.isArray(task.verification) && task.verification.length > 0) {
      lines.push("Verification:");
      lines.push(formatBulletList(task.verification));
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function statusMark(status) {
  switch (String(status ?? "").trim()) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[*]";
    case "blocked":
      return "[!]";
    case "failed":
      return "[~]";
    case "pending":
    default:
      return "[ ]";
  }
}

export function planStateToMarkdown(plan, state, templatePhases) {
  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const stateTasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const stateById = new Map(stateTasks.map((t) => [t.id, t]));
  const phases = Array.isArray(templatePhases) ? templatePhases : [];

  const lines = [];
  lines.push(`# Plan: ${plan?.id ?? ""}`);
  lines.push("");
  lines.push(`## Goal`);
  lines.push("");
  lines.push(String(plan?.goal ?? ""));
  lines.push("");
  lines.push("## Execution State");
  lines.push("");
  lines.push(`- Iteration: ${String(state?.iteration ?? 0)}`);
  lines.push(`- Summary: ${String(state?.summary ?? "").trim()}`);
  lines.push("");
  lines.push("## Tasks");
  lines.push("");

  for (const task of planTasks) {
    const st = stateById.get(task.id) ?? { status: "pending", notes: "", phases: [] };
    lines.push(`### ${statusMark(st.status)} ${task.id}: ${task.name}`);
    lines.push("");
    const notes = String(st.notes ?? "").trim();
    if (notes) {
      lines.push("Notes:");
      lines.push(formatBulletList(notes.split("\n").map((l) => l.trim()).filter(Boolean)));
      lines.push("");
    }

    const stPhases = Array.isArray(st.phases) ? st.phases : [];
    const phaseById = new Map(stPhases.map((p) => [p.id, p]));
    if (phases.length > 0) {
      lines.push("Phases:");
      for (const phase of phases) {
        const p = phaseById.get(phase.id) ?? { status: "pending", notes: "" };
        const title = phase.title ?? phase.id;
        lines.push(`- ${statusMark(p.status)} ${phase.id}: ${title}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
