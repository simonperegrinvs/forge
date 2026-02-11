import { formatBulletList, renderTemplate } from "./render.mjs";

function statusMark(status) {
  switch (status) {
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

function normalizeNotes(notes) {
  if (typeof notes !== "string") {
    return "";
  }
  return notes.trim();
}

function buildTaskList(plan, state) {
  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const stateTasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const byId = new Map(stateTasks.map((t) => [t.id, t]));

  const lines = [];
  for (const task of planTasks) {
    const st = byId.get(task.id) ?? { status: "pending", notes: "" };
    const notes = normalizeNotes(st.notes);
    const noteSuffix = notes ? ` - ${notes.slice(0, 120)}` : "";
    lines.push(`${statusMark(st.status)} ${task.id} ${task.name}${noteSuffix}`);
  }
  return lines.join("\n");
}

function mapStateTasks(state) {
  const stateTasks = Array.isArray(state?.tasks) ? state.tasks : [];
  return new Map(stateTasks.map((t) => [t.id, t]));
}

function isCompletedStatus(status) {
  return typeof status === "string" && status.trim() === "completed";
}

function isTaskCompleted(stateTask) {
  const phases = Array.isArray(stateTask?.phases) ? stateTask.phases : [];
  return phases.length > 0 && phases.every((phase) => isCompletedStatus(phase.status));
}

function isDepsSatisfied(task, stateById) {
  const deps = Array.isArray(task?.depends_on) ? task.depends_on : [];
  for (const dep of deps) {
    const st = stateById.get(dep);
    if (!st || !isTaskCompleted(st)) {
      return false;
    }
  }
  return true;
}

export function findNextRunnableTask(plan, state) {
  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const stateById = mapStateTasks(state);

  for (const task of planTasks) {
    const st = stateById.get(task.id);
    if (!st) {
      continue;
    }
    if (isTaskCompleted(st)) {
      continue;
    }
    if (isDepsSatisfied(task, stateById)) {
      return task;
    }
  }
  return null;
}

function findNextRunnablePhase(stateTask) {
  const phases = Array.isArray(stateTask?.phases) ? stateTask.phases : [];
  for (const phase of phases) {
    if (!isCompletedStatus(phase.status)) {
      return phase;
    }
  }
  return null;
}

function mapTemplatePhases(templatePhases) {
  const phases = Array.isArray(templatePhases) ? templatePhases : [];
  return new Map(phases.map((p) => [p.id, p]));
}

function dependencyNotesForTask(task, stateById) {
  const deps = Array.isArray(task?.depends_on) ? task.depends_on : [];
  if (deps.length === 0) {
    return "(none)";
  }
  const lines = [];
  for (const dep of deps) {
    const st = stateById.get(dep);
    const notes = normalizeNotes(st?.notes ?? "");
    lines.push(`- ${dep}: ${notes || "(no notes)"}`);
  }
  return lines.join("\n");
}

export function renderExecutePrompt({
  templateText,
  plan,
  state,
  templatePhases,
  progressNotes,
  todayIso,
}) {
  const techStack = Array.isArray(plan?.context?.tech_stack)
    ? plan.context.tech_stack.join(", ")
    : "";
  const constraints = Array.isArray(plan?.context?.constraints)
    ? formatBulletList(plan.context.constraints)
    : "";

  const stateById = mapStateTasks(state);
  const current = findNextRunnableTask(plan, state);
  const templatePhaseById = mapTemplatePhases(templatePhases);

  if (!current) {
    const values = {
      plan_id: plan.id ?? "",
      goal: plan.goal ?? "",
      tech_stack: techStack,
      constraints,
      iteration: String(state?.iteration ?? 0),
      summary: state?.summary ?? "",
      task_list: buildTaskList(plan, state),
      progress_notes: progressNotes ?? "",
      current_task_id: "(none)",
      current_task_name: "All tasks completed",
      current_task_description: "No runnable pending task found. The plan may be complete.",
      current_phase_id: "(none)",
      current_phase_title: "",
      current_phase_goal: "",
      current_phase_description: "",
      current_task_files: "",
      current_task_verification: "",
      current_task_attempts: "0",
      current_task_previous_notes: "",
      dependency_notes: "",
      date: todayIso,
    };
    return renderTemplate(templateText, values);
  }

  const st = stateById.get(current.id) ?? {
    status: "pending",
    attempts: 0,
    notes: "",
    phases: [],
  };

  const phase = findNextRunnablePhase(st) ?? { id: "implementation", status: "pending", attempts: 0, notes: "" };
  const phaseMeta = templatePhaseById.get(phase.id) ?? { id: phase.id, title: phase.id, goal: "", description: "" };

  const previousNotes = normalizeNotes(st.notes);
  const phaseNotes = normalizeNotes(phase.notes);
  const notesBlocks = [];
  if (previousNotes) {
    notesBlocks.push(`Task notes:\n${previousNotes}`);
  }
  if (phaseNotes) {
    notesBlocks.push(`Phase notes:\n${phaseNotes}`);
  }
  const currentTaskPreviousNotes = notesBlocks.length > 0 ? `\nPrevious notes:\n${notesBlocks.join("\n\n")}` : "";

  const values = {
    plan_id: plan.id ?? "",
    goal: plan.goal ?? "",
    tech_stack: techStack,
    constraints,
    iteration: String(state?.iteration ?? 0),
    summary: state?.summary ?? "",
    task_list: buildTaskList(plan, state),
    progress_notes: progressNotes ?? "",
    current_task_id: current.id,
    current_task_name: current.name ?? "",
    current_task_description: current.description ?? "",
    current_phase_id: phase.id ?? "",
    current_phase_title: phaseMeta.title ?? phaseMeta.id ?? "",
    current_phase_goal: phaseMeta.goal ?? "",
    current_phase_description: phaseMeta.description ?? "",
    current_task_files: `\n${formatBulletList(current.files ?? [])}`,
    current_task_verification: formatBulletList(current.verification ?? []),
    current_task_attempts: String(phase.attempts ?? 0),
    current_task_previous_notes: currentTaskPreviousNotes,
    dependency_notes: dependencyNotesForTask(current, stateById),
    date: todayIso,
  };

  return renderTemplate(templateText, values);
}
