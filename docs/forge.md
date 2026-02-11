# Forge (CodexMonitor) - Contributor Doc Outline

This file is the implementation-backed outline for Forge module documentation. It maps every section to the current source of truth in code.

For general app architecture, use `AGENTS.md`.

## 1. What Forge Is In CodexMonitor

- Define Forge as template-backed workspace scaffolding plus plan lifecycle support.
- Clarify the high-level flow:
  - List bundled templates.
  - Install/uninstall template into workspace `.agent/`.
  - Read normalized plan prompt from installed template.
  - List plan files and joined task statuses from `plans/`.
- Reference implementation anchors:
  - `src-tauri/src/forge/mod.rs`
  - `src-tauri/src/shared/forge_templates_core.rs`
  - `src-tauri/src/shared/forge_plans_core.rs`
  - `src/services/tauri.ts`

## 2. Public IPC Surface (Exact Commands + Implementation Paths)

Document each command with app handler, shared core, frontend wrapper, remote proxy method, and daemon RPC branch.

### 2.1 `forge_list_bundled_templates`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_list_bundled_templates`
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` -> `list_bundled_templates_core`
- Frontend invoke wrapper: `src/services/tauri.ts` -> `forgeListBundledTemplates`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote proxy method string: `"forge_list_bundled_templates"` via `src-tauri/src/remote_backend/mod.rs`
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_list_bundled_templates`

### 2.2 `forge_get_installed_template`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_get_installed_template`
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` -> `read_installed_template_lock_core`
- Best-effort skill sync: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend wrapper: `src/services/tauri.ts` -> `forgeGetInstalledTemplate`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote method string: `"forge_get_installed_template"` (params: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_get_installed_template`

### 2.3 `forge_install_template`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_install_template`
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` -> `install_bundled_template_core`
- Best-effort skill sync: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend wrapper: `src/services/tauri.ts` -> `forgeInstallTemplate`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote method string: `"forge_install_template"` (params: `workspaceId`, `templateId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_install_template`

### 2.4 `forge_uninstall_template`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_uninstall_template`
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` -> `uninstall_template_core`
- Frontend wrapper: `src/services/tauri.ts` -> `forgeUninstallTemplate`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote method string: `"forge_uninstall_template"` (params: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_uninstall_template`

### 2.5 `forge_list_plans`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_list_plans`
- Shared core: `src-tauri/src/shared/forge_plans_core.rs` -> `list_plans_core`
- Frontend wrapper: `src/services/tauri.ts` -> `forgeListPlans`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote method string: `"forge_list_plans"` (params: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_list_plans`

### 2.6 `forge_get_plan_prompt`

- App command: `src-tauri/src/forge/mod.rs` -> `forge_get_plan_prompt`
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` -> `read_installed_template_plan_prompt_core`
- Prompt normalization hook: `normalize_plan_prompt` in `src-tauri/src/shared/forge_templates_core.rs`
- Best-effort skill sync: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend wrapper: `src/services/tauri.ts` -> `forgeGetPlanPrompt`
- Registered in Tauri: `src-tauri/src/lib.rs`
- Remote method string: `"forge_get_plan_prompt"` (params: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `forge_get_plan_prompt`

## 3. Local vs Remote Backend Behavior

- Local mode path:
  - `src-tauri/src/forge/mod.rs` calls shared cores directly.
- Remote mode gate:
  - `src-tauri/src/remote_backend/mod.rs` -> `is_remote_mode` checks `BackendMode::Remote`.
- Remote invocation path:
  - `src-tauri/src/forge/mod.rs` -> `remote_backend::call_remote(...)`
  - Method names are identical to Tauri command names (for example `"forge_list_plans"`).
  - Param casing is camelCase (`workspaceId`, `templateId`).
- RPC handling path:
  - `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` parses params and dispatches by method string.
  - `src-tauri/src/bin/codex_monitor_daemon.rs` runs daemon-side methods that call the same shared cores.
- Retry behavior note:
  - Forge methods are in `can_retry_after_disconnect` in `src-tauri/src/remote_backend/mod.rs`.

## 4. Workspace File Layout And Artifacts

Describe the exact workspace artifacts and writers/readers:

- `.agent/template-lock.json`
  - Read: `read_installed_template_lock_core`
  - Write: `install_bundled_template_core`
- `.agent/templates/<templateId>/...`
  - Created from bundled template `files` list in `install_bundled_template_core`
  - Read for plan prompt via `read_installed_template_plan_prompt_core`
- `.agent/skills/*`
  - Mirrored from bundled `skills/*` during template install
- `.agents/skills/*`
  - Best-effort sync target used by Codex repo skill discovery
  - Sync function: `sync_agent_skills_into_repo_agents_dir_core`
  - Behavior: do not overwrite existing `.agents/skills/*` files
- `plans/`
  - Read by `src-tauri/src/shared/forge_plans_core.rs` -> `list_plans_core`
  - Execution-related files consumed under `plans/<planId>/` by `src-tauri/src/shared/forge_execute_core.rs`
- Git exclusion:
  - `.agent/` entry added to `.git/info/exclude` by `ensure_git_info_exclude_contains`

## 5. Bundled Template Structure And Manifest Fields

### 5.1 Bundle Roots (App + Daemon Resolution)

- App resolver: `src-tauri/src/forge/mod.rs` -> `bundled_templates_root_for_app`
  - `app.path().resource_dir()/forge/templates`
  - `app.path().resource_dir()/resources/forge/templates`
  - Dev fallback: `src-tauri/resources/forge/templates` (`env!("CARGO_MANIFEST_DIR")`)
  - Near-exe fallback: `find_bundled_templates_root_near_exe`
- Daemon resolver: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `bundled_templates_root_for_daemon`
  - Dev fallback: `src-tauri/resources/forge/templates`
  - Near-exe fallback: `find_bundled_templates_root_near_exe`

### 5.2 Required Bundle Shape

- `<templatesRoot>/<templateId>/template.json`
- Additional files listed in `template.json.files`
- Example bundle path:
  - `src-tauri/resources/forge/templates/ralph-loop/template.json`

### 5.3 `template.json` Fields (`schema = "forge-template-v1"`)

- Top-level:
  - `schema`
  - `id`
  - `title`
  - `version`
  - `files` (relative paths only; validated by `validate_relative_file_path`)
  - `entrypoints`
- `entrypoints`:
  - `phases`
  - `planPrompt`
  - `executePrompt`
  - `planSchema`
  - `stateSchema`
  - `requiredSkills`
  - `hooks.postPlan`
  - `hooks.preExecute`
  - `hooks.postStep`

## 6. Plan/State JSON Conventions (Practical Read Model)

### 6.1 Plan Discovery (`forge_list_plans`)

- Implemented in `src-tauri/src/shared/forge_plans_core.rs` -> `list_plans_core`.
- Scans recursively under `<workspaceRoot>/plans/` for `.json` files (ignores dotfiles/dirs).
- Accepts only plan JSON where:
  - `"$schema" == "plan-v1"`
  - No top-level `phases`
  - No `tasks[*].phase` (legacy phase format rejected)
  - Task IDs follow ordered naming `task-1`, `task-2`, ...
- De-duplicates by `id`; newest `updated_at_ms` wins.

### 6.2 State Resolution For Task Status

- Resolver function: `resolve_state_path` in `src-tauri/src/shared/forge_plans_core.rs`.
- Candidate paths:
  - `plans/<dir>/state.json` when plan file is `plan.json`
  - `plans/<dir>/<stem>.state.json` when plan file is `<stem>.json`
  - `plans/<planId>.state.json`
  - `plans/<planId>/state.json`
- State is joined only when parsed as `"$schema": "state-v2"`.
- Task status source: `state.tasks[].status` matched by `id`.
- Default status when missing/unreadable state: `"pending"`.

## 7. Troubleshooting (Code-Grounded)

### 7.1 Missing Bundled Templates Root

- Error text: `"Unable to locate bundled forge templates"`
- App root resolver: `src-tauri/src/forge/mod.rs` -> `bundled_templates_root_for_app`
- Daemon root resolver: `src-tauri/src/bin/codex_monitor_daemon.rs` -> `bundled_templates_root_for_daemon`
- Shared near-exe fallback: `src-tauri/src/shared/forge_templates_core.rs` -> `find_bundled_templates_root_near_exe`

### 7.2 Missing Template Lock

- Behavior: `forge_get_installed_template` returns `null`/`None` when `.agent/template-lock.json` is absent.
- Reader path: `src-tauri/src/shared/forge_templates_core.rs` -> `read_installed_template_lock_core`

### 7.3 Missing Installed Template Directory

- Error text: `"Installed Forge template folder is missing."`
- Raised by: `read_installed_template_plan_prompt_core` in `src-tauri/src/shared/forge_templates_core.rs`
- Typical trigger: lock exists, but `.agent/templates/<installed_template_id>/` is missing.

## 8. Planned Detail Sections For Follow-Up Tasks

- End-to-end flow narrative:
  - `forge_install_template` -> installed files + skill sync -> `forge_get_plan_prompt` -> normalized prompt -> plan creation -> `forge_list_plans`.
- Prompt normalization details from `normalize_plan_prompt`:
  - `.agent/skills/` -> `.agents/skills/`
  - `plans/<plan_id>.json` and `plans/<plan-id>.json` -> nested `plans/<plan_id>/plan.json`
  - Legacy file-write output instructions -> plan-mode output block
  - Ensure first non-empty line is `@plan`
