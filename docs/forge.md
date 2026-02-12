# Forge Module

Forge is the backend module that installs bundled templates into a workspace, returns normalized plan prompts, and exposes plan/execution state over Tauri commands.

Architecture conventions for app/daemon/shared-core layering live in `AGENTS.md`. This doc focuses on the Forge command surface and runtime behavior only.

## Backend Entry Points

- Tauri command registration: `src-tauri/src/lib.rs`
- App command handlers: `src-tauri/src/forge/mod.rs`
- Remote proxy transport: `src-tauri/src/remote_backend/mod.rs`
- Daemon JSON-RPC dispatch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon command implementations: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Shared cores:
  - `src-tauri/src/shared/forge_templates_core.rs`
  - `src-tauri/src/shared/forge_plans_core.rs`
  - `src-tauri/src/shared/forge_execute_core.rs`
- Frontend wrappers: `src/services/tauri.ts`

## Forge Command Matrix

All Forge IPC names are `forge_*`. Local mode calls shared cores in-process; remote mode sends JSON-RPC with the same method name.

| Invoke name | Frontend wrapper | Inputs (TS wrapper) | Output (TS wrapper) | App handler path | Local shared-core behavior | Remote JSON-RPC method + params |
| --- | --- | --- | --- | --- | --- | --- |
| `forge_list_bundled_templates` | `forgeListBundledTemplates` | none | `ForgeBundledTemplateInfo[]` (`id`, `title`, `version`) | `src-tauri/src/forge/mod.rs::forge_list_bundled_templates` | `src-tauri/src/forge/mod.rs::bundled_templates_root_for_app` -> `src-tauri/src/shared/forge_templates_core.rs::list_bundled_templates_core` | method `forge_list_bundled_templates`, params `{}` |
| `forge_get_installed_template` | `forgeGetInstalledTemplate` | `{ workspaceId }` | `ForgeTemplateLock \| null` | `src-tauri/src/forge/mod.rs::forge_get_installed_template` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_templates_core.rs::sync_agent_skills_into_repo_agents_dir_core` (best effort) -> `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_lock_core` | method `forge_get_installed_template`, params `{ "workspaceId": "<id>" }` |
| `forge_install_template` | `forgeInstallTemplate` | `{ workspaceId, templateId }` | `ForgeTemplateLock` | `src-tauri/src/forge/mod.rs::forge_install_template` | `src-tauri/src/forge/mod.rs::bundled_templates_root_for_app` + `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_templates_core.rs::install_bundled_template_core` -> `src-tauri/src/shared/forge_templates_core.rs::sync_agent_skills_into_repo_agents_dir_core` (best effort) | method `forge_install_template`, params `{ "workspaceId": "<id>", "templateId": "<id>" }` |
| `forge_uninstall_template` | `forgeUninstallTemplate` | `{ workspaceId }` | `void` | `src-tauri/src/forge/mod.rs::forge_uninstall_template` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_templates_core.rs::uninstall_template_core` | method `forge_uninstall_template`, params `{ "workspaceId": "<id>" }`; daemon returns `{ "ok": true }` |
| `forge_list_plans` | `forgeListPlans` | `{ workspaceId }` | `ForgeWorkspacePlan[]` | `src-tauri/src/forge/mod.rs::forge_list_plans` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_plans_core.rs::list_plans_core` | method `forge_list_plans`, params `{ "workspaceId": "<id>" }` |
| `forge_get_plan_prompt` | `forgeGetPlanPrompt` | `{ workspaceId }` | `string` | `src-tauri/src/forge/mod.rs::forge_get_plan_prompt` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_templates_core.rs::sync_agent_skills_into_repo_agents_dir_core` (best effort) -> `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core` | method `forge_get_plan_prompt`, params `{ "workspaceId": "<id>" }` |
| `forge_prepare_execution` | `forgePrepareExecution` | `{ workspaceId, planId }` | `void` | `src-tauri/src/forge/mod.rs::forge_prepare_execution` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_execute_core.rs::forge_prepare_execution_core` | method `forge_prepare_execution`, params `{ "workspaceId": "<id>", "planId": "<planId>" }`; daemon returns `{ "ok": true }` |
| `forge_reset_execution_progress` | `forgeResetExecutionProgress` | `{ workspaceId, planId }` | `void` | `src-tauri/src/forge/mod.rs::forge_reset_execution_progress` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_execute_core.rs::forge_reset_execution_progress_core` | method `forge_reset_execution_progress`, params `{ "workspaceId": "<id>", "planId": "<planId>" }`; daemon returns `{ "ok": true }` |
| `forge_get_next_phase_prompt` | `forgeGetNextPhasePrompt` | `{ workspaceId, planId }` | `ForgeNextPhasePrompt \| null` | `src-tauri/src/forge/mod.rs::forge_get_next_phase_prompt` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_execute_core.rs::forge_get_next_phase_prompt_core` | method `forge_get_next_phase_prompt`, params `{ "workspaceId": "<id>", "planId": "<planId>" }` |
| `forge_get_phase_status` | `forgeGetPhaseStatus` | `{ workspaceId, planId, taskId, phaseId }` | `ForgePhaseStatus` | `src-tauri/src/forge/mod.rs::forge_get_phase_status` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_execute_core.rs::forge_get_phase_status_core` | method `forge_get_phase_status`, params `{ "workspaceId": "<id>", "planId": "<planId>", "taskId": "<taskId>", "phaseId": "<phaseId>" }` |
| `forge_run_phase_checks` | `forgeRunPhaseChecks` | `{ workspaceId, planId, taskId, phaseId }` | `ForgeRunPhaseChecksResponse` | `src-tauri/src/forge/mod.rs::forge_run_phase_checks` | `src-tauri/src/forge/mod.rs::workspace_root_for_id` -> `src-tauri/src/shared/forge_execute_core.rs::forge_run_phase_checks_core` | method `forge_run_phase_checks`, params `{ "workspaceId": "<id>", "planId": "<planId>", "taskId": "<taskId>", "phaseId": "<phaseId>" }` |

Notes:
- Remote param casing is camelCase at the JSON-RPC boundary (`workspaceId`, `templateId`, `planId`, `taskId`, `phaseId`).
- In remote mode, each app handler calls `remote_backend::call_remote`; daemon `rpc.rs` parses the same camelCase keys with `parse_string`.
- `remote_backend::can_retry_after_disconnect` includes all Forge methods above, so disconnect errors are retried once after reconnect.

## UI Phase Metadata and Icon Resolution

Forge execution chips use a frontend-composed phase-view model rather than a dedicated `forge_*` backend command:

- Loader: `src/services/tauri.ts::forgeLoadPhaseView`
- File reads (via `read_workspace_file`):
  - `plans/<planId>/state.json`
  - `.agent/templates/<installedTemplateId>/phases.json` (when a template is installed)

`forgeLoadPhaseView` behavior:

- Missing, malformed, or truncated files are treated as non-fatal and return empty phase metadata/status maps.
- State phase statuses are normalized to:
  - `pending`
  - `in_progress`
  - `completed`
  - `blocked`
  - `failed`
- Unknown statuses normalize to `pending`.
- Template phase metadata is sorted by `order` (fallback: array index + 1).
- Missing/blank `iconId` metadata falls back to `check_circle` during metadata parsing.

Execution UI rendering behavior:

- `src/features/forge/components/Forge.tsx::mapForgePhaseChipState` maps states as:
  - running phase or `in_progress` -> `is-current`
  - `completed` -> `is-complete`
  - `pending` / `blocked` / `failed` -> `is-pending`
- `src/features/forge/components/Forge.tsx::resolveForgeTaskRowStatus` computes task-row state with deterministic precedence:
  - active `runningInfo.taskId` -> row `inProgress`
  - otherwise phase-state fallback from `phaseView.taskPhaseStatusByTaskId[taskId]`
  - otherwise plan task status from `forge_list_plans` / `state-v2`
- Stale non-active `in_progress` rows are demoted while another task is actively running:
  - demote to `completed` if all phases for that task are `completed`
  - otherwise demote to `pending`
- If `runningInfo.taskId` does not match any visible plan task row, no row renders a running spinner.
- Forge sidebar panel project gate (`src/features/forge/components/Forge.tsx` + `src/features/app/components/Sidebar.tsx`):
  - Forge panel can be opened from the sidebar header even when no workspace is active.
  - If `activeWorkspaceId` is null/blank, Forge renders blocker copy `Select a project first to use Forge.`.
  - In no-project mode, these controls are disabled and blocked from backend side effects: `Open templates`, plan selector, `Resume plan`, and `Clean progress`.
  - Plan menu actions (`New plan...`, `Other...`) are not reachable while blocked, and no-project control clicks do not call `connectWorkspace`, `startThread`, or `sendUserMessage`.
- `src/utils/forgePhaseIcons.ts::getForgePhaseIconUrl` validates icon ids with `isMaterialIconName` and resolves URLs with `getIconUrlByName(id, "/assets/material-icons")`.
- Invalid/empty icon ids fall back to safe icon id `file` (`/assets/material-icons/file.svg`).

## Local vs Remote Command Routing

Each app handler in `src-tauri/src/forge/mod.rs` follows the same branch:

1. `remote_backend::is_remote_mode(&state).await`
2. If `true`: call `remote_backend::call_remote(&state, app, "<method>", <params>)`
3. If `false`: run local adapter logic and shared-core call

Remote mode path is:

1. Frontend wrapper (`src/services/tauri.ts`) calls `invoke("forge_*", ...)`
2. App handler (`src-tauri/src/forge/mod.rs`) forwards via `call_remote`
3. Daemon RPC dispatcher (`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`) matches method and parses params
4. Daemon state method (`src-tauri/src/bin/codex_monitor_daemon.rs`) calls the same shared core as local mode
5. Result is serialized back to the app and then to frontend

## Bundled Template Root Resolution

`src-tauri/src/forge/mod.rs::bundled_templates_root_for_app` resolves bundled templates in this order:

1. `app.path().resource_dir()/forge/templates`
2. `app.path().resource_dir()/resources/forge/templates`
3. Dev fallback: `env!("CARGO_MANIFEST_DIR")/resources/forge/templates`
4. Near-exe fallback: `forge_templates_core::find_bundled_templates_root_near_exe(current_exe)`

`find_bundled_templates_root_near_exe` checks resource candidates near the executable (for packaged layouts), including `resources/forge/templates` and nested `resources/resources/forge/templates` patterns.

Error implications:
- `"Unable to locate bundled forge templates"` means all candidate roots above were missing.
- If `current_exe()` fails before near-exe probing, the raw OS error string is returned.

Daemon behavior is similar but starts at dev fallback (`CARGO_MANIFEST_DIR/resources/forge/templates`) and then near-exe probing in `src-tauri/src/bin/codex_monitor_daemon.rs::bundled_templates_root_for_daemon`.

## Bundled Templates and Manifest Contract

Bundled templates are stored under:

- `src-tauri/resources/forge/templates/<template-id>/`

Each template folder must contain `template.json` (read by `read_manifest` in `src-tauri/src/shared/forge_templates_core.rs`). `forge_list_bundled_templates` ignores folders that are missing or fail to parse `template.json`.

Current bundled templates:

- `src-tauri/resources/forge/templates/ralph-loop/template.json`
- `src-tauri/resources/forge/templates/test-first-loop/template.json`

`template.json` fields (schema `forge-template-v1`):

- `schema`: must be exactly `forge-template-v1`; otherwise commands that read the manifest fail with `Unsupported template.json schema...`.
- `id`: template id. During install, this must match the folder name (`template.json id does not match template folder`).
- `title`: display name returned by `forge_list_bundled_templates`.
- `version`: template version returned by `forge_list_bundled_templates` and stored in template lock.
- `files`: relative file list copied into the workspace template install directory. Every listed file must exist in the bundle.
- `entrypoints.planPrompt`: relative prompt path used by `forge_get_plan_prompt` (`read_installed_template_plan_prompt_core`).
- `entrypoints.executePrompt`: relative prompt path validated by execution setup (`build_execution_paths` in `forge_execute_core`).
- `entrypoints.phases`: relative phases file path used by `forge_execute_core::load_template_phases`.
- `entrypoints.planSchema`: template-declared plan schema path (deserialized from manifest; not currently loaded by shared cores).
- `entrypoints.stateSchema`: template-declared state schema path (deserialized from manifest; not currently loaded by shared cores).
- `entrypoints.requiredSkills`: template-declared skill list (deserialized from manifest; not currently enforced by shared cores).
- `entrypoints.hooks.postPlan`: hook script run by `forge_prepare_execution`/`forge_reset_execution_progress` when (re)generating execution artifacts.
- `entrypoints.hooks.preExecute`: hook script run by `forge_prepare_execution`/`forge_reset_execution_progress` before execution.
- `entrypoints.hooks.postStep`: hook script run by `forge_get_next_phase_prompt` and `forge_run_phase_checks` to regenerate `plans/<plan_id>/execute-prompt.md`.

`template.json` should also be included in `files` so installed templates at `.agent/templates/<id>/` remain self-describing (both bundled templates do this).

## `test-first-loop` Phase Contract (6 Phases)

`src-tauri/resources/forge/templates/test-first-loop/phases.json` defines six ordered phases:

| Order | Phase id | Title | iconId | Completion contract highlights |
| --- | --- | --- | --- | --- |
| 1 | `test-case-mapping` | `Test Case Mapping` | `taskfile` | Requirement-to-test mapping, edge/failure paths, risk prioritization, assumptions documented |
| 2 | `behavioral-tests` | `Behavioral Tests` | `cucumber` | Behavior-focused executable tests, fail-before/pass-after flow, outcome assertions, stabilized determinism |
| 3 | `implementation` | `Implementation` | `console` | Minimal scoped code changes with passing targeted tests and recorded decisions |
| 4 | `coverage-hardening` | `Coverage Hardening` | `codecov` | Fixed coverage floor of **80%**, explicit remaining risk gaps, property-based tests for high-risk gaps |
| 5 | `documentation` | `Documentation` | `readme` | Canonical docs/runbooks updated to live behavior, obsolete guidance removed |
| 6 | `ai-review` | `AI Review Gate` | `folder-review` | Zero-findings gate: any remaining finding keeps the phase non-completed (`failed` or `blocked`) and execution must stop |

The `ai-review` phase is terminal and is treated as a hard gate for task completion.
`forge_execute_core` only records task completion commit SHA on successful final-phase checks. When terminal `ai-review` checks fail, the phase remains non-completed and progression does not advance.

## Regression Coverage Snapshot

Current regression coverage for this behavior spans frontend, template hooks, and shared Rust execution core:

- Frontend project-gate behavior:
  - `src/features/app/components/Sidebar.test.tsx`
  - `src/features/forge/components/Forge.plans.test.tsx`
  - Covers no-project blocker copy, disabled Forge controls, blocked menu reachability, no backend calls in blocked mode, and unchanged sidebar Forge open/close toggling.
- Frontend execution chip rendering:
  - `src/features/forge/components/Forge.plans.test.tsx`
  - Covers template-order chip rendering, class-state mapping, deterministic single-running-row behavior, stale non-active `in_progress` demotion (`pending` vs `completed`), non-visible running-task guard, icon URL fallback, and terminal `ai-review` staying non-completed/visibly blocking.
- Frontend icon resolver:
  - `src/utils/forgePhaseIcons.test.ts`
  - Covers valid icon URL resolution, invalid-id fallback to `file`, and whitespace-trimmed valid ids.
- Frontend phase-view loader:
  - `src/services/tauri.test.ts`
  - Covers `forgeLoadPhaseView` parsing/fallbacks plus normalization/preservation of `blocked` and `failed` statuses.
- Template hook behavior:
  - `src/features/forge/scripts/testFirstLoopScripts.test.ts`
  - Covers six-phase initialization and post-step selection of first non-completed phase, including `ai-review`.
- Shared execution core:
  - `src-tauri/src/shared/forge_execute_core.rs` tests under `forge_execute_core::tests`
  - Covers partial progression, non-final no-commit success, final `ai-review` failure blocking completion, and final `ai-review` success commit gating.

Task-local validation commands for Forge panel/runtime behavior:

- `npm run test -- src/features/forge/components/Forge.plans.test.tsx src/features/app/components/Sidebar.test.tsx`
- `npm run test -- --coverage --coverage.include=src/features/forge/components/Forge.tsx src/features/forge/components/Forge.plans.test.tsx`
- `npm run typecheck`

## Workspace Artifacts Created by Install

`install_bundled_template_core` writes these paths in the workspace root:

- `.agent/templates/<template-id>/<file>` for every relative path in manifest `files`.
- `.agent/template-lock.json` with schema `forge-template-lock-v1`:
  - `schema`
  - `installedTemplateId`
  - `installedTemplateVersion`
  - `installedAtIso`
  - `installedFiles` (copied from manifest `files`)
- `.agent/skills/<...>` for any file in `files` under `skills/` (mirrored from template bundle).
- `.git/info/exclude` entry `.agent/` (idempotent best-effort), so Forge-managed workspace artifacts stay out of git status without editing tracked `.gitignore`.

Skill discovery bridge (`.agent` -> `.agents`):

- Forge templates install skills into `.agent/skills/*`.
- Codex repository skill discovery uses `.agents/skills/*`.
- `sync_agent_skills_into_repo_agents_dir_core` copies `.agent/skills/*` into `.agents/skills/*` on:
  - `forge_get_installed_template`
  - `forge_install_template`
  - `forge_get_plan_prompt`
- Existing files in `.agents/skills/*` are never overwritten (`if dest_path.exists() { continue; }`).
- Sync is best-effort in app handlers: failures are logged to stderr and do not fail the command.

## Workspace Artifacts Removed by Uninstall

`uninstall_template_core` removes only:

- `.agent/templates/<installed_template_id>/` (resolved from `.agent/template-lock.json` when lock is readable)
- `.agent/template-lock.json`

It intentionally does not remove:

- `.agent/skills/*`
- `.agents/skills/*`
- `.git/info/exclude` entries (including `.agent/`)

## Plan and State File Conventions (`forge_list_plans`)

Plan discovery and status projection are implemented in `src-tauri/src/shared/forge_plans_core.rs::list_plans_core`.

Discovery and filtering:

- Forge scans `<workspace>/plans` recursively and considers only `.json` files.
- Dot-prefixed paths are ignored while traversing (`collect_json_files` skips hidden files/directories).
- Candidate JSON must parse and have `"$schema": "plan-v1"`.
- Legacy phase format is explicitly rejected:
  - top-level `phases` key present, or
  - any `tasks[*].phase` key present.
- Plan id comes from JSON `id` (trimmed) and must be non-empty.
- Task ids must be ordered `task-1..task-n` in array order; invalid files are skipped.

State resolution (`resolve_state_path`):

- For each plan file, Forge checks state candidates in this order and uses the first existing file:
  1. If plan filename is `plan.json`, sibling `state.json`; otherwise sibling `<plan-stem>.state.json`.
  2. `plans/<planId>.state.json`
  3. `plans/<planId>/state.json`

Concrete path examples:

- Plan `plans/document-forge-module/plan.json` (id `document-forge-module`) -> first candidate `plans/document-forge-module/state.json`.
- Plan `plans/releases/q2.json` (id `release-q2`) -> first candidate `plans/releases/q2.state.json`, then `plans/release-q2.state.json`, then `plans/release-q2/state.json`.
- Plan `plans/alpha.json` (id `alpha`) -> first candidate `plans/alpha.state.json`, then `plans/alpha/state.json`.

How `ForgeWorkspacePlanV1` is populated:

- `id`, `title`, `goal`, and ordered `tasks` are taken from the parsed `plan-v1` file.
- `planPath` is workspace-relative when possible (for example, `plans/document-forge-module/plan.json`).
- `updatedAtMs` is the plan file mtime.
- Task statuses are joined only from resolved state files with `"$schema": "state-v2"` by matching task ids.
- If state is missing, unreadable, invalid, non-`state-v2`, or missing a task status, Forge returns `"pending"` for that task.
- `currentTaskId` is always `null` (`current_task_id: None` in Rust).
- Duplicate plan ids are deduplicated by keeping the newest `updatedAtMs`, then sorted descending by `updatedAtMs`.

## Flow: Template Install

1. Frontend calls `forgeInstallTemplate(workspaceId, templateId)` in `src/services/tauri.ts`.
2. Tauri invokes `forge_install_template` (registered in `src-tauri/src/lib.rs`).
3. Local mode:
   - `src-tauri/src/forge/mod.rs::forge_install_template` resolves bundled root and workspace root.
   - Calls `forge_templates_core::install_bundled_template_core`.
   - Runs best-effort `sync_agent_skills_into_repo_agents_dir_core`.
4. Remote mode:
   - App forwards method `forge_install_template` with `{ workspaceId, templateId }`.
   - Daemon `rpc.rs` parses `workspaceId`/`templateId`.
   - `DaemonState::forge_install_template` runs daemon root resolution + same shared-core install.
5. Response is `ForgeTemplateLock` (`schema`, installed template id/version/time/files).

## Flow: Plan Prompt Retrieval For Plan Creation

1. Frontend calls `forgeGetPlanPrompt(workspaceId)` in `src/services/tauri.ts`.
2. Tauri invokes `forge_get_plan_prompt`.
3. Local mode:
   - `src-tauri/src/forge/mod.rs::forge_get_plan_prompt` resolves workspace root.
   - Runs best-effort `.agent/skills` -> `.agents/skills` sync.
   - Calls `forge_templates_core::read_installed_template_plan_prompt_core`.
4. `read_installed_template_plan_prompt_core`:
   - Reads `.agent/template-lock.json`.
   - Resolves `.agent/templates/<installed_template_id>/...`.
   - Loads manifest `entrypoints.planPrompt`, validates the relative path, reads prompt text.
   - Applies `normalize_plan_prompt` before returning to frontend.
5. Remote mode uses method `forge_get_plan_prompt` with `{ workspaceId }`, then daemon executes the same core path.

## Plan Prompt Normalization and Plan-Mode Compatibility

`src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core` always returns the prompt after `normalize_plan_prompt`.

Exact normalization rules in `normalize_plan_prompt`:

- Skills path rewrite: before `.agent/skills/` -> after `.agents/skills/`.
- Plan output path rewrite (underscore token): before `plans/<plan_id>.json` -> after `plans/<plan_id>/plan.json`.
- Plan output path rewrite (hyphen token): before `plans/<plan-id>.json` -> after `plans/<plan-id>/plan.json`.
- Legacy plan-output rewrite trigger: before marker strings `After writing the file` or `Create \`plans/<plan_id>` or `Path: plans/<plan_id>` (with `## Output` present) -> after replacement of everything from first `## Output` onward with this exact text:

```md
## Output

- Choose a `plan_id` slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (max 64 chars).
- Output the plan as the exact `plan-v1` JSON object inside a single `<proposed_plan>...</proposed_plan>` block.
- Do NOT write any files yet.

Inside the JSON, include:

- `"$schema": "plan-v1"`
- `"id": "<plan_id>"`
- `"title": "<short title>"`

## Hard requirement

Do NOT implement the plan. Stop after outputting the `<proposed_plan>` block.
```

- Plan skill prefix rewrite: before first non-empty line is not `@plan` -> after prompt is prefixed with `@plan\n\n`.
- Empty prompt fallback: before no lines/text -> after exact output `@plan\n`.

## Backend Error Signals For These Commands

- `"workspace not found"`: workspace id did not resolve in app or daemon `workspace_root_for_id`.
- `"Unable to locate bundled forge templates"`: template root probing failed (app or daemon).
- `"Bundled template not found: <template_id>"`: install requested a template folder that does not exist.
- `"No Forge template installed."`: `forge_get_plan_prompt` was called without `.agent/template-lock.json`.
- `"Installed Forge template folder is missing."`: lock exists but `.agent/templates/<id>` is absent.
