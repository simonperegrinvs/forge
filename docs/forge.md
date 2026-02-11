# Forge (CodexMonitor)

Forge is CodexMonitor's "agent scaffolding" feature: it installs a bundled template into a workspace, exposes the template's prompts to the frontend, and enumerates runnable plans from the workspace so CodexMonitor can execute work in phases.

This doc focuses on the Forge surface area. For the broader app/daemon/shared-core architecture, see `AGENTS.md`.

## Code Map (Source Of Truth)

- App (Tauri commands): `src-tauri/src/forge/mod.rs`
- Shared cores (domain logic used by both app + daemon):
  - Templates: `src-tauri/src/shared/forge_templates_core.rs`
  - Plan listing: `src-tauri/src/shared/forge_plans_core.rs`
  - Execution: `src-tauri/src/shared/forge_execute_core.rs`
- Remote backend proxy: `src-tauri/src/remote_backend/mod.rs`
- Daemon JSON-RPC:
  - Request dispatch: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
  - Forge method implementations: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Frontend IPC wrapper: `src/services/tauri.ts`

## Public IPC Surface (Tauri Commands)

These commands are registered in `src-tauri/src/lib.rs` and implemented in `src-tauri/src/forge/mod.rs`.

For each command: when remote mode is enabled, the app proxies the call via `remote_backend::call_remote(...)` in `src-tauri/src/remote_backend/mod.rs` using the same method string. The daemon handles that method in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` and calls the same shared core.

### `forge_list_bundled_templates`

- App command: `src-tauri/src/forge/mod.rs` (`forge_list_bundled_templates`)
- Local core: `src-tauri/src/shared/forge_templates_core.rs` (`list_bundled_templates_core`)
- Remote proxy method: `"forge_list_bundled_templates"` via `src-tauri/src/remote_backend/mod.rs` (`call_remote`)
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_list_bundled_templates" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_list_bundled_templates`)

### `forge_get_installed_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_get_installed_template`)
- Local core: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_lock_core`)
- Side effect (best-effort): sync `.agent/skills/*` into `.agents/skills/*` via `src-tauri/src/shared/forge_templates_core.rs` (`sync_agent_skills_into_repo_agents_dir_core`)
- Remote proxy method: `"forge_get_installed_template"`
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_get_installed_template" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_get_installed_template`)

### `forge_install_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_install_template`)
- Local core: `src-tauri/src/shared/forge_templates_core.rs` (`install_bundled_template_core`)
- Side effect (best-effort): sync `.agent/skills/*` into `.agents/skills/*` via `sync_agent_skills_into_repo_agents_dir_core`
- Remote proxy method: `"forge_install_template"` (params include `workspaceId`, `templateId`)
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_install_template" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_install_template`)

### `forge_uninstall_template`

- App command: `src-tauri/src/forge/mod.rs` (`forge_uninstall_template`)
- Local core: `src-tauri/src/shared/forge_templates_core.rs` (`uninstall_template_core`)
- Remote proxy method: `"forge_uninstall_template"`
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_uninstall_template" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_uninstall_template`)

### `forge_list_plans`

- App command: `src-tauri/src/forge/mod.rs` (`forge_list_plans`)
- Local core: `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`)
- Remote proxy method: `"forge_list_plans"`
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_list_plans" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_list_plans`)

### `forge_get_plan_prompt`

- App command: `src-tauri/src/forge/mod.rs` (`forge_get_plan_prompt`)
- Local core: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_plan_prompt_core`)
- Side effect (best-effort): sync `.agent/skills/*` into `.agents/skills/*` via `sync_agent_skills_into_repo_agents_dir_core`
- Remote proxy method: `"forge_get_plan_prompt"`
- Daemon handler: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (`"forge_get_plan_prompt" => ...`)
- Daemon implementation: `src-tauri/src/bin/codex_monitor_daemon.rs` (`forge_get_plan_prompt`)

## Local vs Remote Backend Behavior

Remote mode is determined by `BackendMode::Remote` in app settings and checked by `remote_backend::is_remote_mode` in `src-tauri/src/remote_backend/mod.rs`.

- Local mode: `src-tauri/src/forge/mod.rs` calls shared cores directly.
- Remote mode: `src-tauri/src/forge/mod.rs` calls `remote_backend::call_remote` (`src-tauri/src/remote_backend/mod.rs`) with:
  - The method name string (for example `"forge_list_plans"`)
  - A JSON params object (for example `{ "workspaceId": "<id>" }`)
- Daemon receives the JSON-RPC request and dispatches in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`.
- Daemon methods call the same shared cores as the app (see `src-tauri/src/bin/codex_monitor_daemon.rs`).

## Workspace File Layout And Artifacts

Forge reads and writes workspace-local artifacts under the workspace root.

- Installed template lock:
  - Path: `<workspaceRoot>/.agent/template-lock.json`
  - Read by: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_lock_core`)
  - Written by: `install_bundled_template_core`
- Installed template files:
  - Path: `<workspaceRoot>/.agent/templates/<templateId>/...`
  - Created by: `install_bundled_template_core`
  - Read by: `read_installed_template_plan_prompt_core` and execution cores
- Template-provided skills:
  - Installed into: `<workspaceRoot>/.agent/skills/*` (mirrors any bundled `skills/*` files)
  - Synced into: `<workspaceRoot>/.agents/skills/*` (Codex repo-scoped skills directory)
  - Sync implementation: `src-tauri/src/shared/forge_templates_core.rs` (`sync_agent_skills_into_repo_agents_dir_core`)
  - Sync behavior: best-effort; does not overwrite existing `.agents/skills` files
- Plans:
  - Root: `<workspaceRoot>/plans/`
  - Listed by: `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`)
  - Execution expects nested layout for a specific plan id:
    - `<workspaceRoot>/plans/<planId>/plan.json`
    - `<workspaceRoot>/plans/<planId>/state.json`
    - `src-tauri/src/shared/forge_execute_core.rs` (`forge_prepare_execution_core`, `forge_get_next_phase_prompt_core`, ...)
- Git exclusion (workspace is a git repo):
  - Forge adds `.agent/` to `<workspaceRoot>/.git/info/exclude` (no `.gitignore` edits)
  - Implementation: `src-tauri/src/shared/forge_templates_core.rs` (`ensure_git_info_exclude_contains`)

## Bundled Templates

### Bundle Roots (App vs Daemon)

Bundled templates are discovered via:

- App: `src-tauri/src/forge/mod.rs` (`bundled_templates_root_for_app`)
  - Checks `app.path().resource_dir()` for:
    - `<resourceDir>/forge/templates`
    - `<resourceDir>/resources/forge/templates`
  - Dev fallback (when running from `cargo tauri dev`):
    - `src-tauri/resources/forge/templates` (derived from `env!("CARGO_MANIFEST_DIR")`)
  - Last-ditch fallback:
    - `src-tauri/src/shared/forge_templates_core.rs` (`find_bundled_templates_root_near_exe`)
- Daemon: `src-tauri/src/bin/codex_monitor_daemon.rs` (`bundled_templates_root_for_daemon`)
  - Dev fallback: `src-tauri/resources/forge/templates`
  - Otherwise: `find_bundled_templates_root_near_exe`

### Template Folder Structure

Each bundled template is a directory under the templates root:

- `<templatesRoot>/<templateId>/template.json`
- Additional files referenced by `template.json.files` (copied at install time)

### `template.json` Manifest (Schema: `forge-template-v1`)

`template.json` is parsed in `src-tauri/src/shared/forge_templates_core.rs` (`read_manifest`) and must have:

- `schema`: must equal `"forge-template-v1"`
- `id`: template id (must match directory name during install)
- `title`: human-friendly name
- `version`: template version string
- `files`: list of relative file paths to copy from bundle into the workspace
  - Paths are validated to be relative and to not use `..` (`validate_relative_file_path`)
- `entrypoints`:
  - `phases`: relative path to phases definition
  - `planPrompt`: relative path to the plan prompt (read by `forge_get_plan_prompt`)
  - `executePrompt`: relative path to execute prompt (used by execution hooks)
  - `planSchema`: relative path to the plan JSON schema shipped with the template
  - `stateSchema`: relative path to the state JSON schema shipped with the template
  - `requiredSkills`: list of skill names (template-defined)
  - `hooks`:
    - `postPlan`: node script path invoked by `forge_prepare_execution` (`forge_execute_core`)
    - `preExecute`: node script path invoked during execution setup
    - `postStep`: node script path invoked to regenerate prompts between steps

## Plan And State File Conventions (Practical)

This section documents what CodexMonitor actually reads.

### Plan Discovery (`forge_list_plans`)

Implementation: `src-tauri/src/shared/forge_plans_core.rs` (`list_plans_core`)

- Root: `<workspaceRoot>/plans/`
- Discovery: recursively scans for `.json` files under `plans/` (ignores dotfiles/directories)
- A file is treated as a plan if:
  - `"$schema"` equals `"plan-v1"`
  - It does not have a top-level `phases` field
  - No task object contains a `phase` field (legacy plans are skipped)
  - Tasks must be ordered and named: `task-1`, `task-2`, ... (array order is validated)
- Deduping: if multiple plan files share the same `id`, the most recently modified file wins
- Sorting: plans are returned in descending `updated_at_ms` (filesystem `mtime` of the plan file)

### State Lookup For Task Statuses (`forge_list_plans`)

Implementation: `src-tauri/src/shared/forge_plans_core.rs` (`resolve_state_path`, state parsing in `list_plans_core`)

For a discovered plan, Forge attempts to find a matching state file to populate `tasks[].status`:

- If the plan file is `.../plan.json`, candidate is `.../state.json`
- If the plan file is `.../<stem>.json`, candidate is `.../<stem>.state.json`
- Additional fallback candidates:
  - `<workspaceRoot>/plans/<planId>.state.json`
  - `<workspaceRoot>/plans/<planId>/state.json`

If the state file exists and parses with `"$schema": "state-v2"`, each plan task gets:

- `status`: from `state.tasks[].status` (by matching `id`)
- Default when missing/unreadable: `"pending"`

### Plan Prompt Text (`forge_get_plan_prompt`)

Implementation: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_plan_prompt_core`, `normalize_plan_prompt`)

The plan prompt is read from the installed template and then normalized:

- `.agent/skills/` is rewritten to `.agents/skills/`
- `plans/<plan_id>.json` is rewritten to `plans/<plan_id>/plan.json`
- Legacy "write the plan file now" instructions are rewritten to be plan-mode compatible
- The prompt is prefixed with `@plan` if not already present as the first non-empty line

## Troubleshooting (Grounded In Code)

### Unable to locate bundled Forge templates

- Symptom: error string `"Unable to locate bundled forge templates"`
- App root resolution: `src-tauri/src/forge/mod.rs` (`bundled_templates_root_for_app`)
- Daemon root resolution: `src-tauri/src/bin/codex_monitor_daemon.rs` (`bundled_templates_root_for_daemon`)
- Near-exe fallback: `src-tauri/src/shared/forge_templates_core.rs` (`find_bundled_templates_root_near_exe`)

### No template installed / missing `template-lock.json`

- Symptom:
  - `forge_get_installed_template` returns `null` (lock missing)
  - `forge_get_plan_prompt` returns `"No Forge template installed."`
- Lock file path: `<workspaceRoot>/.agent/template-lock.json`
- Read implementation: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_lock_core`)

### Installed template folder is missing

- Symptom: `"Installed Forge template folder is missing."`
- Expected folder: `<workspaceRoot>/.agent/templates/<installedTemplateId>/`
- Check implementation: `src-tauri/src/shared/forge_templates_core.rs` (`read_installed_template_plan_prompt_core`)

