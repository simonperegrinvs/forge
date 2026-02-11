# Mode: execute

You are executing a single task from a development plan. Your context is cleared
between tasks - everything you need is below.

## Runtime contract (read first)

`Forge` is the CodexMonitor backend orchestrator driving this loop.

- Forge selects the current task/phase from `plans/{{plan_id}}/state.json`.
- Forge starts fresh task-scoped threads, runs backend checks, and manages final task commits.
- Your job is to implement the requested phase and keep `state.json`/`progress.md` accurate.

---

## Plan

**Goal:** {{goal}}
**Tech Stack:** {{tech_stack}}
**Constraints:**
{{constraints}}

## Progress (iteration {{iteration}})

{{summary}}

## All tasks

{{task_list}}

## Learnings from previous iterations

{{progress_notes}}

---

## YOUR TASK: {{current_task_id}} - {{current_task_name}}

{{current_task_description}}

## Current phase: {{current_phase_id}} - {{current_phase_title}}

**Phase goal:** {{current_phase_goal}}

{{current_phase_description}}

**Files:** {{current_task_files}}

**Verification:**
{{current_task_verification}}

**Attempts so far:** {{current_task_attempts}}
{{current_task_previous_notes}}

**What dependencies produced:**
{{dependency_notes}}

---

## Phase protocol (important)

1. Implement the current phase for the current task.
2. Update `plans/{{plan_id}}/state.json`:
   - Set this phase `status` to `completed` (or `blocked`/`failed` if truly stuck).
   - Increment this phase `attempts`.
   - Append concise notes (paths/decisions).
   - Keep task `status` as `in_progress` while handing off to Forge checks.
3. Forge will run backend checks after your phase is marked complete.
   - Forge finalizes phase/task completion statuses after checks.
   - If checks fail, Forge reopens the phase and you retry.
   - If checks pass on the last phase, Forge creates the task commit and records `commit_sha`.
4. Do NOT run `git` commands yourself in execute mode.
   - Do NOT run `git add`, `git commit`, `git commit --amend`, or `git push`.
   - Do NOT set `commit_sha` in `state.json`; Forge manages it.
5. End your message with this exact single line marker:

```text
[[cm_forge:done plan={{plan_id}} task={{current_task_id}} phase={{current_phase_id}}]]
```
   - Use the exact `plan/task/phase` values shown above. Do not reuse marker values from a previous task or phase.

---

## After implementation - update state

Update `plans/{{plan_id}}/state.json` following these rules:

1. Keep your task's `status` as `in_progress` while implementing (or `failed` if truly stuck after multiple attempts)
2. Write `notes` explaining what you did - file paths, decisions, config values. The next
   iteration has no memory of you; these notes are its only link to your work.
3. Update `summary` - orient a newcomer: what's done, what's next (max 300 chars)
4. Increment your task's `attempts` count
5. Do NOT change any other task's status
6. Do NOT modify `plan.json` - it is immutable
7. Do NOT set `commit_sha`; Forge writes it after final-phase checks pass.

If you learned something useful beyond this task (a gotcha, a project convention,
a tool quirk), append a one-liner to `plans/{{plan_id}}/progress.md`:

```text
- {{date}} iter {{iteration}}: <what you learned>
```
