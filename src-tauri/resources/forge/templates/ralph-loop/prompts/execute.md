# Mode: execute

You are executing a single task from a development plan. Your context is cleared
between tasks - everything you need is below.

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
2. If this is the last phase of the task:
   - Create exactly 1 git commit for the task before marking the phase complete.
   - Record the commit SHA in `plans/{{plan_id}}/state.json` under your task's `commit_sha`.
   - If checks fail after committing, fix issues and **amend the same commit** (do not create a second commit).
3. Update `plans/{{plan_id}}/state.json`:
   - Set this phase `status` to `completed` (or `blocked`/`failed` if truly stuck).
   - Increment this phase `attempts`.
   - Append concise notes (paths/decisions).
   - Keep task `status` consistent with phase statuses.
4. End your message with this exact single line marker:

```text
[[cm_forge:done plan={{plan_id}} task={{current_task_id}} phase={{current_phase_id}}]]
```

---

## After implementation - update state

Update `plans/{{plan_id}}/state.json` following these rules:

1. Set your task's `status` to `completed` (or `failed` if truly stuck after multiple attempts)
2. Write `notes` explaining what you did - file paths, decisions, config values. The next
   iteration has no memory of you; these notes are its only link to your work.
3. Update `summary` - orient a newcomer: what's done, what's next (max 300 chars)
4. Increment your task's `attempts` count
5. Do NOT change any other task's status
6. Do NOT modify `plan.json` - it is immutable

If you learned something useful beyond this task (a gotcha, a project convention,
a tool quirk), append a one-liner to `plans/{{plan_id}}/progress.md`:

```text
- {{date}} iter {{iteration}}: <what you learned>
```
