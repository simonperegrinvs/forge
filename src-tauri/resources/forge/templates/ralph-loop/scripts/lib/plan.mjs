function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function expectNoExtraKeys(errors, obj, allowedKeys, path) {
  if (!isPlainObject(obj)) {
    return;
  }
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      pushError(errors, path, `Unexpected property: ${key}`);
    }
  }
}

function expectString(errors, value, path, { minLength, maxLength, pattern } = {}) {
  if (typeof value !== "string") {
    pushError(errors, path, "Expected string");
    return;
  }
  if (minLength != null && value.length < minLength) {
    pushError(errors, path, `Too short (minLength ${minLength})`);
  }
  if (maxLength != null && value.length > maxLength) {
    pushError(errors, path, `Too long (maxLength ${maxLength})`);
  }
  if (pattern && !pattern.test(value)) {
    pushError(errors, path, `Does not match pattern ${pattern}`);
  }
}

function expectArray(errors, value, path, { minItems } = {}) {
  if (!Array.isArray(value)) {
    pushError(errors, path, "Expected array");
    return;
  }
  if (minItems != null && value.length < minItems) {
    pushError(errors, path, `Too few items (minItems ${minItems})`);
  }
}

function expectArrayOfStrings(errors, value, path, { minItems } = {}) {
  expectArray(errors, value, path, { minItems });
  if (!Array.isArray(value)) {
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      pushError(errors, `${path}[${i}]`, "Expected string");
    }
  }
}

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const TASK_ID_RE = /^task-[0-9]+$/;
const NOTES_TRUNCATED_SUFFIX = " ... [truncated]";

export const STATE_SUMMARY_MAX_LENGTH = 300;
export const TASK_NOTES_MAX_LENGTH = 2000;
export const PHASE_NOTES_MAX_LENGTH = 800;

function truncateNotes(value, maxLength) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return [value, false];
  }
  const suffix = maxLength > NOTES_TRUNCATED_SUFFIX.length ? NOTES_TRUNCATED_SUFFIX : "";
  const sliceLength = Math.max(maxLength - suffix.length, 0);
  const truncated = `${value.slice(0, sliceLength)}${suffix}`;
  return [truncated, true];
}

function parseTaskNumber(taskId) {
  const match = /^task-([0-9]+)$/.exec(taskId);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function validateDag(errors, tasksById) {
  const visiting = new Set();
  const visited = new Set();

  function dfs(id) {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      pushError(errors, "tasks", `Cycle detected at ${id}`);
      return;
    }
    visiting.add(id);
    const task = tasksById.get(id);
    const deps = Array.isArray(task?.depends_on) ? task.depends_on : [];
    for (const dep of deps) {
      if (tasksById.has(dep)) {
        dfs(dep);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of tasksById.keys()) {
    dfs(id);
  }
}

export function validatePlan(plan) {
  const errors = [];

  if (!isPlainObject(plan)) {
    pushError(errors, "plan", "Expected object");
    throw new Error(errors.join("\n"));
  }

  expectNoExtraKeys(
    errors,
    plan,
    ["$schema", "id", "title", "goal", "context", "tasks"],
    "plan",
  );
  if (plan.$schema !== "plan-v1") {
    pushError(errors, "plan.$schema", 'Expected "plan-v1"');
  }
  expectString(errors, plan.id, "plan.id", {
    maxLength: 64,
    pattern: PLAN_ID_RE,
  });
  if (plan.title != null) {
    expectString(errors, plan.title, "plan.title", { minLength: 3, maxLength: 80 });
  }
  expectString(errors, plan.goal, "plan.goal", { minLength: 10, maxLength: 500 });

  if (!isPlainObject(plan.context)) {
    pushError(errors, "plan.context", "Expected object");
  } else {
    expectNoExtraKeys(errors, plan.context, ["tech_stack", "constraints", "references"], "plan.context");
    expectArrayOfStrings(errors, plan.context.tech_stack, "plan.context.tech_stack", { minItems: 1 });
    expectArrayOfStrings(errors, plan.context.constraints, "plan.context.constraints");
    if (plan.context.references != null) {
      expectArray(errors, plan.context.references, "plan.context.references");
      if (Array.isArray(plan.context.references)) {
        for (let i = 0; i < plan.context.references.length; i++) {
          const ref = plan.context.references[i];
          const refPath = `plan.context.references[${i}]`;
          if (!isPlainObject(ref)) {
            pushError(errors, refPath, "Expected object");
            continue;
          }
          expectNoExtraKeys(errors, ref, ["path", "description"], refPath);
          expectString(errors, ref.path, `${refPath}.path`);
          expectString(errors, ref.description, `${refPath}.description`);
        }
      }
    }
  }

  expectArray(errors, plan.tasks, "plan.tasks", { minItems: 1 });
  const tasksById = new Map();
  let hasEntryPoint = false;

  if (Array.isArray(plan.tasks)) {
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      const taskPath = `plan.tasks[${i}]`;
      if (!isPlainObject(task)) {
        pushError(errors, taskPath, "Expected object");
        continue;
      }
      expectNoExtraKeys(
        errors,
        task,
        ["id", "name", "description", "depends_on", "files", "verification"],
        taskPath,
      );

      expectString(errors, task.id, `${taskPath}.id`, { pattern: TASK_ID_RE });
      expectString(errors, task.name, `${taskPath}.name`, { maxLength: 80 });
      expectString(errors, task.description, `${taskPath}.description`, { minLength: 20 });
      expectArrayOfStrings(errors, task.depends_on, `${taskPath}.depends_on`);
      expectArrayOfStrings(errors, task.files, `${taskPath}.files`, { minItems: 1 });
      expectArrayOfStrings(errors, task.verification, `${taskPath}.verification`, { minItems: 1 });

      if (Array.isArray(task.depends_on) && task.depends_on.length === 0) {
        hasEntryPoint = true;
      }

      if (typeof task.id === "string") {
        if (tasksById.has(task.id)) {
          pushError(errors, `${taskPath}.id`, `Duplicate task id: ${task.id}`);
        } else {
          tasksById.set(task.id, task);
        }
        const taskNumber = parseTaskNumber(task.id);
        const expectedId = `task-${i + 1}`;
        if (taskNumber == null) {
          pushError(errors, `${taskPath}.id`, "Task id must be task-<n> with n >= 1");
        } else if (task.id !== expectedId) {
          pushError(errors, `${taskPath}.id`, `Task ids must match array order (expected ${expectedId})`);
        }
      }
    }
  }

  if (!hasEntryPoint) {
    pushError(errors, "plan.tasks", "At least one task must have depends_on: []");
  }

  // depends_on referential integrity + self-deps
  for (const [id, task] of tasksById.entries()) {
    const deps = Array.isArray(task.depends_on) ? task.depends_on : [];
    for (const dep of deps) {
      if (dep === id) {
        pushError(errors, `task:${id}.depends_on`, "Task cannot depend on itself");
      } else if (!tasksById.has(dep)) {
        pushError(errors, `task:${id}.depends_on`, `Unknown dependency: ${dep}`);
      }
    }
  }

  validateDag(errors, tasksById);

  if (errors.length > 0) {
    throw new Error(`plan.json is invalid:\n${errors.join("\n")}`);
  }
}

function validatePhaseList(errors, phases, path) {
  expectArray(errors, phases, path, { minItems: 1 });
  if (!Array.isArray(phases)) {
    return;
  }
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phasePath = `${path}[${i}]`;
    if (!isPlainObject(phase)) {
      pushError(errors, phasePath, "Expected object");
      continue;
    }
    expectNoExtraKeys(
      errors,
      phase,
      ["id", "title", "order", "iconId", "goal", "description", "checks"],
      phasePath,
    );
    expectString(errors, phase.id, `${phasePath}.id`, { minLength: 1, maxLength: 64 });
    expectString(errors, phase.title, `${phasePath}.title`, { minLength: 1, maxLength: 80 });
  }
}

export function buildInitialState(plan, templatePhases) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const phases = Array.isArray(templatePhases) ? templatePhases : [];
  return {
    $schema: "state-v2",
    plan_id: plan.id,
    iteration: 0,
    summary: "",
    tasks: tasks.map((task) => ({
      id: task.id,
      status: "pending",
      attempts: 0,
      notes: "",
      commit_sha: null,
      phases: phases.map((phase) => ({
        id: phase.id,
        status: "pending",
        attempts: 0,
        notes: "",
      })),
    })),
  };
}

export function normalizeStateNotes(state) {
  let changed = false;

  if (!isPlainObject(state) || !Array.isArray(state.tasks)) {
    return { state, changed };
  }

  for (const task of state.tasks) {
    if (!isPlainObject(task)) {
      continue;
    }
    const [taskNotes, taskChanged] = truncateNotes(task.notes, TASK_NOTES_MAX_LENGTH);
    if (taskChanged) {
      task.notes = taskNotes;
      changed = true;
    }

    if (!Array.isArray(task.phases)) {
      continue;
    }
    for (const phase of task.phases) {
      if (!isPlainObject(phase)) {
        continue;
      }
      const [phaseNotes, phaseChanged] = truncateNotes(phase.notes, PHASE_NOTES_MAX_LENGTH);
      if (phaseChanged) {
        phase.notes = phaseNotes;
        changed = true;
      }
    }
  }

  return { state, changed };
}

export function validateStateAgainstPlan(state, plan, templatePhases) {
  const errors = [];

  if (!isPlainObject(state)) {
    pushError(errors, "state", "Expected object");
    return errors;
  }

  expectNoExtraKeys(errors, state, ["$schema", "plan_id", "iteration", "summary", "tasks"], "state");
  if (state.$schema !== "state-v2") {
    pushError(errors, "state.$schema", 'Expected "state-v2"');
  }
  if (state.plan_id !== plan.id) {
    pushError(errors, "state.plan_id", `Expected ${plan.id}`);
  }
  if (!Number.isInteger(state.iteration) || state.iteration < 0) {
    pushError(errors, "state.iteration", "Expected integer >= 0");
  }
  expectString(errors, state.summary, "state.summary", { maxLength: STATE_SUMMARY_MAX_LENGTH });

  expectArray(errors, state.tasks, "state.tasks", { minItems: 1 });

  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (Array.isArray(state.tasks) && state.tasks.length !== planTasks.length) {
    pushError(errors, "state.tasks", "Must match plan.tasks length");
  }

  const allowedStatus = new Set(["pending", "in_progress", "completed", "blocked", "failed"]);
  validatePhaseList(errors, templatePhases, "templatePhases");
  const expectedPhaseIds = Array.isArray(templatePhases)
    ? templatePhases.map((p) => String(p.id ?? "")).filter(Boolean)
    : [];

  if (Array.isArray(state.tasks)) {
    for (let i = 0; i < state.tasks.length; i++) {
      const entry = state.tasks[i];
      const entryPath = `state.tasks[${i}]`;
      if (!isPlainObject(entry)) {
        pushError(errors, entryPath, "Expected object");
        continue;
      }
      expectNoExtraKeys(errors, entry, ["id", "status", "attempts", "notes", "commit_sha", "phases"], entryPath);
      expectString(errors, entry.id, `${entryPath}.id`, { pattern: TASK_ID_RE });
      if (typeof entry.status !== "string" || !allowedStatus.has(entry.status)) {
        pushError(errors, `${entryPath}.status`, "Invalid status");
      }
      if (!Number.isInteger(entry.attempts) || entry.attempts < 0) {
        pushError(errors, `${entryPath}.attempts`, "Expected integer >= 0");
      }
      expectString(errors, entry.notes, `${entryPath}.notes`, { maxLength: TASK_NOTES_MAX_LENGTH });

      if (entry.commit_sha != null && typeof entry.commit_sha !== "string") {
        pushError(errors, `${entryPath}.commit_sha`, "Expected string or null");
      }

      if (planTasks[i]?.id && entry.id !== planTasks[i].id) {
        pushError(errors, entryPath, `Task id mismatch at index ${i} (expected ${planTasks[i].id})`);
      }

      expectArray(errors, entry.phases, `${entryPath}.phases`, { minItems: 1 });
      if (Array.isArray(entry.phases) && expectedPhaseIds.length > 0 && entry.phases.length !== expectedPhaseIds.length) {
        pushError(errors, `${entryPath}.phases`, "Must match templatePhases length");
      }
      if (Array.isArray(entry.phases)) {
        for (let j = 0; j < entry.phases.length; j++) {
          const phase = entry.phases[j];
          const phasePath = `${entryPath}.phases[${j}]`;
          if (!isPlainObject(phase)) {
            pushError(errors, phasePath, "Expected object");
            continue;
          }
          expectNoExtraKeys(errors, phase, ["id", "status", "attempts", "notes"], phasePath);
          expectString(errors, phase.id, `${phasePath}.id`, { minLength: 1, maxLength: 64 });
          if (expectedPhaseIds[j] && phase.id !== expectedPhaseIds[j]) {
            pushError(errors, `${phasePath}.id`, `Phase id mismatch at index ${j} (expected ${expectedPhaseIds[j]})`);
          }
          if (typeof phase.status !== "string" || !allowedStatus.has(phase.status)) {
            pushError(errors, `${phasePath}.status`, "Invalid status");
          }
          if (!Number.isInteger(phase.attempts) || phase.attempts < 0) {
            pushError(errors, `${phasePath}.attempts`, "Expected integer >= 0");
          }
          expectString(errors, phase.notes, `${phasePath}.notes`, { maxLength: PHASE_NOTES_MAX_LENGTH });
        }
      }
    }
  }

  return errors;
}
