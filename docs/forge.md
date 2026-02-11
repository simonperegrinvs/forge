# Forge (CodexMonitor) Contributor Outline

This is an implementation-backed section outline for `docs/forge.md`.

For broader app architecture, use `AGENTS.md`.

## 1. What Forge Is In CodexMonitor

- Define Forge as template-backed workspace scaffolding plus plan lifecycle support.
- Cover the live flow:
  - `forge_list_bundled_templates`
  - `forge_install_template` / `forge_uninstall_template`
  - `forge_get_plan_prompt`
  - `forge_list_plans`
- Source anchors:
  - `src-tauri/src/forge/mod.rs`
  - `src-tauri/src/shared/forge_templates_core.rs`
  - `src-tauri/src/shared/forge_plans_core.rs`
  - `src/services/tauri.ts`

## 2. Public IPC Surface (Exact Commands + Implementation Paths)

Registration anchor: `src-tauri/src/lib.rs` in `tauri::generate_handler![...]`.

### 2.1 `forge_list_bundled_templates`

- App command: `src-tauri/src/forge/mod.rs` (`forge_list_bundled_templates`)
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` (`list_bundled_templates_core`)
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeListBundledTemplates`)
- Remote proxy method: `"forge_list_bundled_templates"` via `src-tauri/src/remote_backend/mod.rs`
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_list_bundled_templates`)

### 2.2 `forge_get_installed_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_get_installed_template`)
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_lock_core`)
- Skill sync side effect: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeGetInstalledTemplate`)
- Remote proxy method: `"forge_get_installed_template"` (param: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_get_installed_template`)

### 2.3 `forge_install_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_install_template`)
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` (`install_bundled_template_core`)
- Skill sync side effect: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeInstallTemplate`)
- Remote proxy method: `"forge_install_template"` (params: `workspaceId`, `templateId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_install_template`)

### 2.4 `forge_uninstall_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_uninstall_template`)
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` (`uninstall_template_core`)
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeUninstallTemplate`)
- Remote proxy method: `"forge_uninstall_template"` (param: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_uninstall_template`)

### 2.5 `forge_list_plans`

- App command: `src-tauri/src/forge/mod.rs` (`forge_list_plans`)
- Shared core: `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`)
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeListPlans`)
- Remote proxy method: `"forge_list_plans"` (param: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_list_plans`)

### 2.6 `forge_get_plan_prompt`

- App command: `src-tauri/src/forge/mod.rs` (`forge_get_plan_prompt`)
- Shared core: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_plan_prompt_core`)
- Prompt normalization: `src-tauri/src/shared/forge_templates_core.rs` (`normalize_plan_prompt`)
- Skill sync side effect: `sync_agent_skills_into_repo_agents_dir_core`
- Frontend invoke wrapper: `src/services/tauri.ts` (`forgeGetPlanPrompt`)
- Remote proxy method: `"forge_get_plan_prompt"` (param: `workspaceId`)
- Daemon RPC branch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_get_plan_prompt`)

## 3. Local vs Remote Backend Behavior

- Local mode:
  - `src-tauri/src/forge/mod.rs` calls shared cores directly.
- Remote mode gate:
  - `src-tauri/src/remote_backend/mod.rs` (`is_remote_mode`) checks `BackendMode::Remote`.
- Remote proxy path:
  - `src-tauri/src/forge/mod.rs` calls `remote_backend::call_remote(...)`.
  - Method names match Tauri command names (for example `"forge_list_plans"`).
  - Params use camelCase (`workspaceId`, `templateId`).
- Daemon dispatch path:
  - `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` dispatches by method string.
  - `src-tauri/src/bin/codex_monitor_daemon.rs` executes daemon methods using the same shared cores.
- Retry note:
  - Forge methods are included in `can_retry_after_disconnect` in `src-tauri/src/remote_backend/mod.rs`.

## 4. Workspace File Layout And Artifacts

- `.agent/template-lock.json`
  - Read via `read_installed_template_lock_core`
  - Written by `install_bundled_template_core`
- `.agent/templates/<templateId>/...`
  - Populated from `template.json.files` by `install_bundled_template_core`
  - Read by `read_installed_template_plan_prompt_core`
- `.agent/skills/*`
  - Skill files mirrored from bundled template `skills/*` during install
- `.agents/skills/*`
  - Best-effort sync target for Codex repo skill discovery
  - Sync function: `sync_agent_skills_into_repo_agents_dir_core`
  - Existing files are not overwritten
- `plans/`
  - Plan listing read model: `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`)
  - Execution files: `plans/<plan_id>/plan.json`, `plans/<plan_id>/state.json`, `plans/<plan_id>/progress.md` used by `src-tauri/src/shared/forge_execute_core.rs`
- `.git/info/exclude`
  - `.agent/` is appended by `ensure_git_info_exclude_contains`

## 5. Bundled Template Structure And Manifest Fields

### 5.1 Bundle Root Resolution (App + Daemon)

- App resolver: `src-tauri/src/forge/mod.rs` (`bundled_templates_root_for_app`)
  - `resource_dir/forge/templates`
  - `resource_dir/resources/forge/templates`
  - Dev fallback: `src-tauri/resources/forge/templates` via `env!("CARGO_MANIFEST_DIR")`
  - Near-exe fallback: `find_bundled_templates_root_near_exe`
- Daemon resolver: `src-tauri/src/bin/codex_monitor_daemon.rs` (`bundled_templates_root_for_daemon`)
  - Dev fallback: `src-tauri/resources/forge/templates`
  - Near-exe fallback: `find_bundled_templates_root_near_exe`

### 5.2 Required Bundle Shape

- `<templatesRoot>/<templateId>/template.json`
- All entries listed in `template.json.files` must exist in the bundle.
- Current bundled example: `src-tauri/resources/forge/templates/ralph-loop/template.json`

### 5.3 `template.json` Fields (`schema = "forge-template-v1"`)

- Top-level fields:
  - `schema`
  - `id`
  - `title`
  - `version`
  - `files` (relative paths only, validated by `validate_relative_file_path`)
  - `entrypoints`
- `entrypoints` fields:
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

- Implemented in `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`).
- Scans recursively under `<workspaceRoot>/plans/` for `.json` files (skips dot paths).
- Accepts only `"$schema": "plan-v1"` files.
- Rejects legacy phase-based shapes (`phases` or `tasks[*].phase`).
- Requires ordered task ids: `task-1`, `task-2`, ... in array order.
- De-duplicates by `id` and keeps newest file by `updated_at_ms`.

### 6.2 State Resolution For Task Status

- Resolver: `src-tauri/src/shared/forge_plans_core.rs` (`resolve_state_path`).
- Candidate state paths:
  - `plans/<dir>/state.json` when plan file is `plan.json`
  - `plans/<dir>/<stem>.state.json` when plan file is `<stem>.json`
  - `plans/<planId>.state.json`
  - `plans/<planId>/state.json`
- Statuses are joined only when state parses as `"$schema": "state-v2"`.
- Task status source is `state.tasks[].status` keyed by task `id`.
- If state is missing/unreadable/unsupported, each task defaults to `"pending"`.

## 7. Troubleshooting (Code-Grounded)

### 7.1 Missing Bundled Templates Root

- Error: `"Unable to locate bundled forge templates"`
- App resolver: `src-tauri/src/forge/mod.rs` (`bundled_templates_root_for_app`)
- Daemon resolver: `src-tauri/src/bin/codex_monitor_daemon.rs` (`bundled_templates_root_for_daemon`)
- Shared near-exe fallback: `src-tauri/src/shared/forge_templates_core.rs` (`find_bundled_templates_root_near_exe`)

### 7.2 Missing `template-lock.json`

- `forge_get_installed_template` returns `None`/`null` when `.agent/template-lock.json` does not exist.
- Reader: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_lock_core`)

### 7.3 Missing Installed Template Directory

- Error: `"Installed Forge template folder is missing."`
- Raised by `read_installed_template_plan_prompt_core` and `build_execution_paths`.
- Trigger: lock exists but `.agent/templates/<installed_template_id>/` is missing.
