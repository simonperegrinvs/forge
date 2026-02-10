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
const PHASE_ID_RE = /^phase-[0-9]+$/;
const TASK_ID_RE = /^task-[0-9]+-[0-9]+$/;

function parsePhaseNumber(phaseId) {
  const match = /^phase-([0-9]+)$/.exec(phaseId);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function parseTaskId(taskId) {
  const match = /^task-([0-9]+)-([0-9]+)$/.exec(taskId);
  if (!match) {
    return null;
  }
  const phaseNumber = Number(match[1]);
  const seq = Number(match[2]);
  if (!Number.isInteger(phaseNumber) || !Number.isInteger(seq)) {
    return null;
  }
  return { phaseNumber, seq };
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
    ["$schema", "id", "title", "goal", "context", "phases", "tasks"],
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

  expectArray(errors, plan.phases, "plan.phases", { minItems: 1 });
  const phaseIds = new Set();
  const phaseNumbers = [];
  if (Array.isArray(plan.phases)) {
    for (let i = 0; i < plan.phases.length; i++) {
      const phase = plan.phases[i];
      const phasePath = `plan.phases[${i}]`;
      if (!isPlainObject(phase)) {
        pushError(errors, phasePath, "Expected object");
        continue;
      }
      expectNoExtraKeys(errors, phase, ["id", "title", "description"], phasePath);
      expectString(errors, phase.id, `${phasePath}.id`, { pattern: PHASE_ID_RE });
      expectString(errors, phase.title, `${phasePath}.title`, { maxLength: 50 });
      expectString(errors, phase.description, `${phasePath}.description`, { maxLength: 200 });
      if (typeof phase.id === "string") {
        if (phaseIds.has(phase.id)) {
          pushError(errors, `${phasePath}.id`, `Duplicate phase id: ${phase.id}`);
        } else {
          phaseIds.add(phase.id);
        }
        const n = parsePhaseNumber(phase.id);
        if (n != null) {
          phaseNumbers.push(n);
        }
      }
    }
  }

  // Enforce sequential phase ids (phase-1..phase-n).
  if (phaseNumbers.length > 0) {
    const sorted = [...new Set(phaseNumbers)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const expected = i + 1;
      if (sorted[i] !== expected) {
        pushError(errors, "plan.phases", `Phase ids must be sequential (missing phase-${expected})`);
        break;
      }
    }
  }

  expectArray(errors, plan.tasks, "plan.tasks", { minItems: 1 });
  const tasksById = new Map();
  const tasksByPhase = new Map();
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
        ["id", "phase", "name", "description", "depends_on", "files", "verification"],
        taskPath,
      );

      expectString(errors, task.id, `${taskPath}.id`, { pattern: TASK_ID_RE });
      expectString(errors, task.phase, `${taskPath}.phase`, { pattern: PHASE_ID_RE });
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
        const parsed = parseTaskId(task.id);
        if (parsed) {
          const list = tasksByPhase.get(parsed.phaseNumber) ?? [];
          list.push(parsed.seq);
          tasksByPhase.set(parsed.phaseNumber, list);
        }
      }

      if (typeof task.phase === "string" && !phaseIds.has(task.phase)) {
        pushError(errors, `${taskPath}.phase`, `Unknown phase id: ${task.phase}`);
      }

      if (typeof task.id === "string" && typeof task.phase === "string") {
        const parsed = parseTaskId(task.id);
        if (parsed) {
          const expectedPhase = `phase-${parsed.phaseNumber}`;
          if (task.phase !== expectedPhase) {
            pushError(errors, `${taskPath}.phase`, `Task id implies ${expectedPhase} but got ${task.phase}`);
          }
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

  // Task sequences should be sequential per phase (task-2-1..task-2-k).
  for (const [phaseNumber, seqs] of tasksByPhase.entries()) {
    const sorted = [...new Set(seqs)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const expected = i + 1;
      if (sorted[i] !== expected) {
        pushError(errors, "plan.tasks", `Task sequences must be sequential for phase ${phaseNumber} (missing task-${phaseNumber}-${expected})`);
        break;
      }
    }
  }

  validateDag(errors, tasksById);

  if (errors.length > 0) {
    throw new Error(`plan.json is invalid:\n${errors.join("\n")}`);
  }
}

export function buildInitialState(plan) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  return {
    $schema: "state-v1",
    plan_id: plan.id,
    iteration: 0,
    summary: "",
    current_task: null,
    tasks: tasks.map((task) => ({
      id: task.id,
      status: "pending",
      attempts: 0,
      notes: "",
    })),
  };
}

export function validateStateAgainstPlan(state, plan) {
  const errors = [];

  if (!isPlainObject(state)) {
    pushError(errors, "state", "Expected object");
    return errors;
  }

  expectNoExtraKeys(errors, state, ["$schema", "plan_id", "iteration", "summary", "current_task", "tasks"], "state");
  if (state.$schema !== "state-v1") {
    pushError(errors, "state.$schema", 'Expected "state-v1"');
  }
  if (state.plan_id !== plan.id) {
    pushError(errors, "state.plan_id", `Expected ${plan.id}`);
  }
  if (!Number.isInteger(state.iteration) || state.iteration < 0) {
    pushError(errors, "state.iteration", "Expected integer >= 0");
  }
  expectString(errors, state.summary, "state.summary", { maxLength: 300 });

  if (state.current_task != null && typeof state.current_task !== "string") {
    pushError(errors, "state.current_task", "Expected string or null");
  }

  expectArray(errors, state.tasks, "state.tasks", { minItems: 1 });

  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (Array.isArray(state.tasks) && state.tasks.length !== planTasks.length) {
    pushError(errors, "state.tasks", "Must match plan.tasks length");
  }

  const allowedStatus = new Set(["pending", "in_progress", "completed", "blocked", "failed"]);
  let inProgressCount = 0;
  let inProgressId = null;

  if (Array.isArray(state.tasks)) {
    for (let i = 0; i < state.tasks.length; i++) {
      const entry = state.tasks[i];
      const entryPath = `state.tasks[${i}]`;
      if (!isPlainObject(entry)) {
        pushError(errors, entryPath, "Expected object");
        continue;
      }
      expectNoExtraKeys(errors, entry, ["id", "status", "attempts", "notes"], entryPath);
      expectString(errors, entry.id, `${entryPath}.id`, { pattern: TASK_ID_RE });
      if (typeof entry.status !== "string" || !allowedStatus.has(entry.status)) {
        pushError(errors, `${entryPath}.status`, "Invalid status");
      }
      if (!Number.isInteger(entry.attempts) || entry.attempts < 0) {
        pushError(errors, `${entryPath}.attempts`, "Expected integer >= 0");
      }
      expectString(errors, entry.notes, `${entryPath}.notes`, { maxLength: 500 });

      if (entry.status === "in_progress") {
        inProgressCount++;
        inProgressId = entry.id;
      }

      if (planTasks[i]?.id && entry.id !== planTasks[i].id) {
        pushError(errors, entryPath, `Task id mismatch at index ${i} (expected ${planTasks[i].id})`);
      }
    }
  }

  if (inProgressCount > 1) {
    pushError(errors, "state.tasks", "At most one task may be in_progress");
  }
  if (inProgressCount === 1) {
    if (state.current_task !== inProgressId) {
      pushError(errors, "state.current_task", "Must match the in_progress task id");
    }
  } else if (state.current_task != null) {
    pushError(errors, "state.current_task", "Must be null when no task is in_progress");
  }

  return errors;
}
