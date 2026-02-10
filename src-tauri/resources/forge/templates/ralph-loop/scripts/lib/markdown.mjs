import { formatBulletList } from "./render.mjs";

export function planToMarkdown(plan) {
  const techStack = Array.isArray(plan?.context?.tech_stack)
    ? plan.context.tech_stack.join(", ")
    : "";
  const constraints = Array.isArray(plan?.context?.constraints)
    ? formatBulletList(plan.context.constraints)
    : "";

  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
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

  if (phases.length > 0) {
    lines.push("## Phases");
    lines.push("");
    for (const phase of phases) {
      lines.push(`- ${phase.id}: ${phase.title} - ${phase.description}`);
    }
    lines.push("");
  }

  lines.push("## Tasks");
  lines.push("");
  for (const task of tasks) {
    lines.push(`### ${task.id}: ${task.name}`);
    lines.push("");
    lines.push(`- Phase: ${task.phase}`);
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

