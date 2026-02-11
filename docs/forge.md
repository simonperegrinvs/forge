# Forge Backend Commands (CodexMonitor)

Forge is exposed as Tauri commands in `src-tauri/src/lib.rs` and consumed by frontend wrappers in `src/services/tauri.ts`.
For broader app architecture and adapter conventions, see `AGENTS.md`.

## Command Routing

All `forge_*` commands follow the same runtime split in `src-tauri/src/forge/mod.rs`:

1. Check `remote_backend::is_remote_mode`.
2. Local mode: call shared-core functions directly from `src-tauri/src/shared/*`.
3. Remote mode: call `remote_backend::call_remote` with method name + camelCase params.
4. Daemon RPC dispatch in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` parses the same camelCase keys, then calls daemon methods in `src-tauri/src/bin/codex_monitor_daemon.rs` that use the same shared cores.

All Forge methods are included in remote reconnect retry allowlist `can_retry_after_disconnect` (`src-tauri/src/remote_backend/mod.rs`).

## Forge Command Map

| Invoke name | TS wrapper (`src/services/tauri.ts`) | Rust handler path | Shared-core path | Input args and remote param shape | Output (TS type) | Remote method and daemon dispatch |
| --- | --- | --- | --- | --- | --- | --- |
| `forge_list_bundled_templates` | `forgeListBundledTemplates()` | `src-tauri/src/forge/mod.rs::forge_list_bundled_templates` | `src-tauri/src/shared/forge_templates_core.rs::list_bundled_templates_core` | none; remote params `{}` | `ForgeBundledTemplateInfo[]` | method `"forge_list_bundled_templates"`; RPC `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` -> daemon `forge_list_bundled_templates` |
| `forge_get_installed_template` | `forgeGetInstalledTemplate(workspaceId)` | `src-tauri/src/forge/mod.rs::forge_get_installed_template` | `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_lock_core` (plus best-effort `sync_agent_skills_into_repo_agents_dir_core`) | `workspaceId`; remote `{ "workspaceId": string }` | `ForgeTemplateLock \| null` | method `"forge_get_installed_template"`; params key `workspaceId`; daemon mirrors sync + lock read |
| `forge_install_template` | `forgeInstallTemplate(workspaceId, templateId)` | `src-tauri/src/forge/mod.rs::forge_install_template` | `src-tauri/src/shared/forge_templates_core.rs::install_bundled_template_core` (plus best-effort `sync_agent_skills_into_repo_agents_dir_core`) | `workspaceId`, `templateId`; remote `{ "workspaceId": string, "templateId": string }` | `ForgeTemplateLock` | method `"forge_install_template"`; params keys `workspaceId`, `templateId`; daemon mirrors install path |
| `forge_uninstall_template` | `forgeUninstallTemplate(workspaceId)` | `src-tauri/src/forge/mod.rs::forge_uninstall_template` | `src-tauri/src/shared/forge_templates_core.rs::uninstall_template_core` | `workspaceId`; remote `{ "workspaceId": string }` | `void` | method `"forge_uninstall_template"`; params key `workspaceId`; daemon returns `{ "ok": true }` over RPC |
| `forge_list_plans` | `forgeListPlans(workspaceId)` | `src-tauri/src/forge/mod.rs::forge_list_plans` | `src-tauri/src/shared/forge_plans_core.rs::list_plans_core` | `workspaceId`; remote `{ "workspaceId": string }` | `ForgeWorkspacePlan[]` | method `"forge_list_plans"`; params key `workspaceId`; daemon calls same shared core |
| `forge_get_plan_prompt` | `forgeGetPlanPrompt(workspaceId)` | `src-tauri/src/forge/mod.rs::forge_get_plan_prompt` | `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core` (normalizes via `normalize_plan_prompt`; plus best-effort skill sync) | `workspaceId`; remote `{ "workspaceId": string }` | `string` | method `"forge_get_plan_prompt"`; params key `workspaceId`; daemon mirrors prompt read path |
| `forge_prepare_execution` | `forgePrepareExecution(workspaceId, planId)` | `src-tauri/src/forge/mod.rs::forge_prepare_execution` | `src-tauri/src/shared/forge_execute_core.rs::forge_prepare_execution_core` | `workspaceId`, `planId`; remote `{ "workspaceId": string, "planId": string }` | `void` | method `"forge_prepare_execution"`; params keys `workspaceId`, `planId`; daemon returns `{ "ok": true }` |
| `forge_reset_execution_progress` | `forgeResetExecutionProgress(workspaceId, planId)` | `src-tauri/src/forge/mod.rs::forge_reset_execution_progress` | `src-tauri/src/shared/forge_execute_core.rs::forge_reset_execution_progress_core` | `workspaceId`, `planId`; remote `{ "workspaceId": string, "planId": string }` | `void` | method `"forge_reset_execution_progress"`; params keys `workspaceId`, `planId`; daemon returns `{ "ok": true }` |
| `forge_get_next_phase_prompt` | `forgeGetNextPhasePrompt(workspaceId, planId)` | `src-tauri/src/forge/mod.rs::forge_get_next_phase_prompt` | `src-tauri/src/shared/forge_execute_core.rs::forge_get_next_phase_prompt_core` | `workspaceId`, `planId`; remote `{ "workspaceId": string, "planId": string }` | `ForgeNextPhasePrompt \| null` | method `"forge_get_next_phase_prompt"`; params keys `workspaceId`, `planId`; daemon calls same shared core |
| `forge_get_phase_status` | `forgeGetPhaseStatus(workspaceId, planId, taskId, phaseId)` | `src-tauri/src/forge/mod.rs::forge_get_phase_status` | `src-tauri/src/shared/forge_execute_core.rs::forge_get_phase_status_core` | `workspaceId`, `planId`, `taskId`, `phaseId`; remote `{ "workspaceId": string, "planId": string, "taskId": string, "phaseId": string }` | `ForgePhaseStatus` | method `"forge_get_phase_status"`; params keys `workspaceId`, `planId`, `taskId`, `phaseId`; daemon calls same shared core |
| `forge_run_phase_checks` | `forgeRunPhaseChecks(workspaceId, planId, taskId, phaseId)` | `src-tauri/src/forge/mod.rs::forge_run_phase_checks` | `src-tauri/src/shared/forge_execute_core.rs::forge_run_phase_checks_core` | `workspaceId`, `planId`, `taskId`, `phaseId`; remote `{ "workspaceId": string, "planId": string, "taskId": string, "phaseId": string }` | `ForgeRunPhaseChecksResponse` | method `"forge_run_phase_checks"`; params keys `workspaceId`, `planId`, `taskId`, `phaseId`; daemon calls same shared core |

## App Template Root Resolution

`bundled_templates_root_for_app` (`src-tauri/src/forge/mod.rs`) resolves bundled template root in this order:

1. `app.path().resource_dir()` candidates:
   - `<resource_dir>/forge/templates`
   - `<resource_dir>/resources/forge/templates`
2. Dev fallback (for `cargo tauri dev`) from `env!("CARGO_MANIFEST_DIR")`:
   - `<manifest_dir>/resources/forge/templates` (`src-tauri/resources/forge/templates`)
3. Near-executable fallback:
   - `find_bundled_templates_root_near_exe` (`src-tauri/src/shared/forge_templates_core.rs`)

Error implications:

- `"Unable to locate bundled forge templates"` means all path candidates above were checked and none existed.
- A raw `current_exe` error string means executable path resolution failed before near-exe probing.
- `"Bundled template not found: <templateId>"` means a template root was found, but `<root>/<templateId>` was not present as a directory.

## Bundled Template Layout and Manifest Contract

Bundled templates live at:

- `src-tauri/resources/forge/templates/<template-id>/`

Each template directory must contain:

- `template.json` (required manifest)

`forge_list_bundled_templates` only includes directories where `template.json` parses and `schema == "forge-template-v1"`.

`template.json` fields (from `src-tauri/src/shared/forge_templates_core.rs`):

| Field | Required | Meaning in current runtime |
| --- | --- | --- |
| `schema` | yes | Must be `"forge-template-v1"` or install/list rejects it. |
| `id` | yes | Template id. Must match folder name during install. |
| `title` | yes | Display name returned by `forge_list_bundled_templates`. |
| `version` | yes | Template version returned by list/install lock. |
| `files` | yes | Relative file list copied into workspace on install. Each entry must exist in the bundle. |
| `entrypoints.planPrompt` | yes | Relative file path read by `forge_get_plan_prompt`. |
| `entrypoints.executePrompt` | yes | Relative path validated by execution path setup. |
| `entrypoints.phases` | yes | Relative phases file used by execution (`forge-phases-v1`). |
| `entrypoints.planSchema` | yes | Required manifest key; kept in installed template manifest for template tooling. |
| `entrypoints.stateSchema` | yes | Required manifest key; kept in installed template manifest for template tooling. |
| `entrypoints.requiredSkills` | yes | Required manifest key listing skill ids expected by the template. |
| `entrypoints.hooks.postPlan` | yes | Relative hook path executed after plan export. |
| `entrypoints.hooks.preExecute` | yes | Relative hook path executed before prompt handoff. |
| `entrypoints.hooks.postStep` | yes | Relative hook path executed after each phase/check cycle. |

Path rules for manifest file references:

- Must be relative paths.
- Must not be absolute.
- Must not contain `..` segments.

## Workspace Install Artifacts

`forge_install_template` installs into workspace root using these paths:

- `.agent/templates/<template-id>/<file from template.json files[]>`
- `.agent/skills/<relative path under skills/>` for each `files[]` entry starting with `skills/`
- `.agent/template-lock.json`

`template-lock.json` schema and fields are:

```json
{
  "schema": "forge-template-lock-v1",
  "installedTemplateId": "<template-id>",
  "installedTemplateVersion": "<template-version>",
  "installedAtIso": "<RFC3339 timestamp>",
  "installedFiles": ["...from template.json files..."]
}
```

Git ignore behavior during install:

- Best-effort append of `.agent/` to `.git/info/exclude` (if `<workspace>/.git` exists).
- This keeps Forge-managed workspace artifacts out of git by default without editing tracked `.gitignore`.

## Skill Discovery Bridge (`.agent` -> `.agents`)

Forge templates store workspace-local skills in:

- `.agent/skills/*`

Codex repository skill discovery uses:

- `.agents/skills/*`

Bridge behavior (`sync_agent_skills_into_repo_agents_dir_core`):

- Triggered as best-effort after `forge_install_template`, `forge_get_installed_template`, and `forge_get_plan_prompt` (app and daemon paths).
- Recursively copies files from `.agent/skills/*` to `.agents/skills/*`.
- Does not overwrite existing `.agents/skills` files (existing files are left unchanged).
- Sync failures are logged and do not fail those commands.

## Workspace Uninstall Artifacts

`forge_uninstall_template` currently removes only:

- `.agent/templates/<installed_template_id>/` (derived from `.agent/template-lock.json`)
- `.agent/template-lock.json`

Uninstall does not remove:

- `.agent/skills/*`
- `.agents/skills/*`
- Existing `.git/info/exclude` entries (including `.agent/`)

## Flow: Install Template

1. Frontend calls `forgeInstallTemplate(workspaceId, templateId)` in `src/services/tauri.ts`.
2. Tauri handler `forge_install_template` (`src-tauri/src/forge/mod.rs`) chooses local or remote path.
3. Local mode:
   - Resolve bundled template root with `bundled_templates_root_for_app`.
   - Resolve workspace path by `workspace_id`.
   - Call `install_bundled_template_core`.
4. Shared install core (`src-tauri/src/shared/forge_templates_core.rs`):
   - Validates `templateId`.
   - Loads `template.json` and validates schema/id.
   - Copies listed files to `.agent/templates/<templateId>/...`.
   - Mirrors `skills/*` into `.agent/skills/*`.
   - Best-effort appends `.agent/` to `.git/info/exclude`.
   - Writes `.agent/template-lock.json`.
5. Handler runs best-effort `sync_agent_skills_into_repo_agents_dir_core` to mirror into `.agents/skills/*` without overwrite.
6. Returns lock payload (`forge-template-lock-v1` fields) to frontend.
7. Remote mode sends method `"forge_install_template"` with params `{ "workspaceId", "templateId" }`; daemon runs the same core path.

## Flow: Plan Creation Prompt Retrieval

1. Frontend calls `forgeGetPlanPrompt(workspaceId)` in `src/services/tauri.ts`.
2. Tauri handler `forge_get_plan_prompt` chooses local or remote path.
3. Local mode:
   - Resolve workspace path by `workspace_id`.
   - Run best-effort skill sync to `.agents/skills/*`.
   - Call `read_installed_template_plan_prompt_core`.
4. Shared prompt core (`src-tauri/src/shared/forge_templates_core.rs`):
   - Reads `.agent/template-lock.json`; errors `"No Forge template installed."` when absent.
   - Requires `.agent/templates/<installed_template_id>/`; errors `"Installed Forge template folder is missing."` when absent.
   - Reads `template.json` and `entrypoints.planPrompt`.
   - Reads prompt file and returns `normalize_plan_prompt` output.
5. Prompt normalization enforces current conventions:
   - `.agent/skills/` -> `.agents/skills/`
   - `plans/<plan_id>.json` and `plans/<plan-id>.json` -> nested `plans/<plan_id>/plan.json`
   - Prepends `@plan` when missing
6. Remote mode sends method `"forge_get_plan_prompt"` with `{ "workspaceId" }`; daemon runs the same core path and returns the normalized prompt string.
