# Forge Plan Execution v2

## Plan

### Goal
Implement Forge plan execution as a task-by-task loop with context reset between tasks, phase-based execution from template metadata, reviewer-style backend checks after phase completion, and one commit per task.

### Execution model
- Source of truth: `plans/<plan_id>/state.json` (`state-v2`).
- Immutable plan definition: `plans/<plan_id>/plan.json` (`plan-v1`).
- Context reset: start a new Codex thread per task.
- Phase completion protocol:
  - Agent marks phase `completed` in `state.json`.
  - Forge runs backend checks for that phase.
  - If checks fail, Forge asks agent to reopen/fix phase and retry.
  - If checks pass, Forge advances to next phase/task.
- Final phase of each task enforces one-commit workflow:
  - Task must end with one commit.
  - If checks fail after commit, agent amends the same commit.

### Backend requirements
- Add shared core for execution orchestration and checks.
- Add Tauri + daemon RPC commands for:
  - preparing execution state,
  - fetching next phase prompt,
  - reading phase status,
  - running phase checks.
- Keep app and daemon as thin adapters over shared core.

### Template requirements
- Upgrade Ralph Loop template to `0.2.0`.
- Add richer phase metadata + checks in `phases.json`.
- Update execute prompt to be phase-aware and include completion marker:
  - `[[cm_forge:done plan=<plan_id> task=<task_id> phase=<phase_id>]]`
- Upgrade scripts and schema from `state-v1` to `state-v2`.

### Frontend requirements
- Replace Forge run/pause UI stub with real execution orchestration.
- React to `turn/completed` app-server events.
- Run backend checks after phase completion signal.
- Auto-advance phase/task and create new thread when task changes.

---

## Summary of What Was Implemented

### Shared backend execution core
- Added `src-tauri/src/shared/forge_execute_core.rs`.
- Implemented:
  - template + manifest loading from installed `.agent/templates`,
  - execution preparation (`post-plan` hook + validation),
  - next runnable phase resolution (`post-step` hook + state read),
  - phase status reads from `state.json`,
  - backend phase checks (template checks + final task git checks).
- Registered module in `src-tauri/src/shared/mod.rs`.

### New Forge backend commands
- Added in app adapter (`src-tauri/src/forge/mod.rs`):
  - `forge_prepare_execution`
  - `forge_get_next_phase_prompt`
  - `forge_get_phase_status`
  - `forge_run_phase_checks`
- Registered in command list (`src-tauri/src/lib.rs`).
- Added remote retry allowlist entries (`src-tauri/src/remote_backend/mod.rs`).
- Added daemon RPC handlers (`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`).
- Added daemon methods delegating to shared core (`src-tauri/src/bin/codex_monitor_daemon.rs`).

### Plan listing state upgrade
- Updated `src-tauri/src/shared/forge_plans_core.rs` to read `state-v2` task statuses.

### Template upgrade to v2 execution flow
- Bumped template version to `0.2.0`:
  - `src-tauri/resources/forge/templates/ralph-loop/template.json`
- Extended phase metadata:
  - `src-tauri/resources/forge/templates/ralph-loop/phases.json`
- Updated phase-aware execution prompt with done marker:
  - `src-tauri/resources/forge/templates/ralph-loop/prompts/execute.md`
- Upgraded state schema:
  - `src-tauri/resources/forge/templates/ralph-loop/schemas/state.schema.json`
- Upgraded script logic to `state-v2` + phase handling:
  - `src-tauri/resources/forge/templates/ralph-loop/scripts/lib/plan.mjs`
  - `src-tauri/resources/forge/templates/ralph-loop/scripts/lib/execute.mjs`
  - `src-tauri/resources/forge/templates/ralph-loop/scripts/lib/markdown.mjs`
  - `src-tauri/resources/forge/templates/ralph-loop/scripts/post-plan.mjs`
  - `src-tauri/resources/forge/templates/ralph-loop/scripts/post-step.mjs`

### Frontend execution orchestration
- Added `src/features/forge/hooks/useForgeExecution.ts`.
- Wired Forge UI to real execution flow:
  - `src/features/forge/components/Forge.tsx`
- Extended Forge Tauri client surface:
  - `src/services/tauri.ts`

### Tests and validation updates
- Updated Forge plans tests for new client contract and run behavior:
  - `src/features/forge/components/Forge.plans.test.tsx`
- Updated template install/version expectations:
  - `src/features/forge/components/Forge.templates.test.tsx`
  - `src/services/tauri.test.ts`
  - `src-tauri/src/shared/forge_templates_core.rs`
- Updated Ralph Loop script tests for `state-v2`:
  - `src/features/forge/scripts/ralphLoopScripts.test.ts`

### Validation run results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed.
- `cargo check` passed in `src-tauri` (existing unrelated warnings remain in daemon build).
