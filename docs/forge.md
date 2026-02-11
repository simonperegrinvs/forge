# Forge Module Documentation Outline

This file defines the contributor-facing outline for Forge docs in CodexMonitor.

Scope boundaries:
- Source of truth is live implementation under `src-tauri/src/forge/*`, `src-tauri/src/shared/forge_*`, `src-tauri/src/bin/codex_monitor_daemon*`, and `src/services/tauri.ts`.
- Keep architecture duplication minimal; link to `AGENTS.md` for wider app/backend conventions.

## 1. What Forge Is in CodexMonitor

Describe Forge as the template + plan orchestration module used by CodexMonitor workspaces.

Implementation anchors to reference:
- App command registration: `src-tauri/src/lib.rs`
- App Forge handlers/adapters: `src-tauri/src/forge/mod.rs`
- Shared cores: `src-tauri/src/shared/forge_templates_core.rs`, `src-tauri/src/shared/forge_plans_core.rs`, `src-tauri/src/shared/forge_execute_core.rs`
- Frontend IPC wrappers: `src/services/tauri.ts`

## 2. Public IPC Surface (Template + Plan)

Document the six public commands below with exact names, request args, response shape, and core function mapping.

| Command name | App handler path | Shared core path | Frontend wrapper path |
| --- | --- | --- | --- |
| `forge_list_bundled_templates` | `src-tauri/src/forge/mod.rs::forge_list_bundled_templates` | `src-tauri/src/shared/forge_templates_core.rs::list_bundled_templates_core` | `src/services/tauri.ts::forgeListBundledTemplates` |
| `forge_get_installed_template` | `src-tauri/src/forge/mod.rs::forge_get_installed_template` | `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_lock_core` | `src/services/tauri.ts::forgeGetInstalledTemplate` |
| `forge_install_template` | `src-tauri/src/forge/mod.rs::forge_install_template` | `src-tauri/src/shared/forge_templates_core.rs::install_bundled_template_core` | `src/services/tauri.ts::forgeInstallTemplate` |
| `forge_uninstall_template` | `src-tauri/src/forge/mod.rs::forge_uninstall_template` | `src-tauri/src/shared/forge_templates_core.rs::uninstall_template_core` | `src/services/tauri.ts::forgeUninstallTemplate` |
| `forge_list_plans` | `src-tauri/src/forge/mod.rs::forge_list_plans` | `src-tauri/src/shared/forge_plans_core.rs::list_plans_core` | `src/services/tauri.ts::forgeListPlans` |
| `forge_get_plan_prompt` | `src-tauri/src/forge/mod.rs::forge_get_plan_prompt` | `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core` | `src/services/tauri.ts::forgeGetPlanPrompt` |

Also reference where these are registered in Tauri:
- `src-tauri/src/lib.rs`

## 3. Local vs Remote Backend Behavior

Document the runtime split when remote mode is enabled:
- Local mode branch and direct shared-core calls in `src-tauri/src/forge/mod.rs`
- Remote proxy call path via `src-tauri/src/remote_backend/mod.rs::call_remote`
- Retry allowlist (`can_retry_after_disconnect`) in `src-tauri/src/remote_backend/mod.rs`
- Daemon RPC method dispatch in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon method implementations in `src-tauri/src/bin/codex_monitor_daemon.rs`

Include command-by-command remote param keys (`workspaceId`, `templateId`) and note void command RPC responses (`{ "ok": true }`) for `forge_uninstall_template`.

## 4. Workspace File Layout and Artifacts

Document workspace-side files/directories created or read by Forge.

Paths to cover:
- `.agent/template-lock.json`
- `.agent/templates/<template-id>/...`
- `.agent/skills/...`
- `.agents/skills/...` (best-effort sync target)
- `plans/...` (plan discovery root)

Behavior anchors:
- Install/uninstall/sync logic in `src-tauri/src/shared/forge_templates_core.rs`
- Plan listing logic in `src-tauri/src/shared/forge_plans_core.rs`

## 5. Bundled Template Structure and Manifest Contract

Document bundled template root and per-template requirements.

Paths to cover:
- Bundled root in dev tree: `src-tauri/resources/forge/templates/`
- Runtime root resolution in app: `src-tauri/src/forge/mod.rs::bundled_templates_root_for_app`
- Runtime root resolution in daemon: `src-tauri/src/bin/codex_monitor_daemon.rs::bundled_templates_root_for_daemon`

Manifest file and fields:
- `template.json` schema: `forge-template-v1`
- Top-level fields: `schema`, `id`, `title`, `version`, `files`, `entrypoints`
- `entrypoints` fields: `phases`, `planPrompt`, `executePrompt`, `planSchema`, `stateSchema`, `requiredSkills`, `hooks`
- `hooks` fields: `postPlan`, `preExecute`, `postStep`

Reference implementation struct definitions in `src-tauri/src/shared/forge_templates_core.rs` and a concrete bundled example at `src-tauri/resources/forge/templates/ralph-loop/template.json`.

## 6. Plan and State JSON Conventions (Practical Runtime Behavior)

Document what Forge actually reads and how statuses are derived.

Plan reading behavior (`src-tauri/src/shared/forge_plans_core.rs`):
- Recursively scans `plans/` for `.json` files
- Requires `"$schema": "plan-v1"`
- Requires ordered task IDs: `task-1`, `task-2`, ...
- Ignores dot-prefixed entries
- Deduplicates plan IDs by newest `updatedAtMs`

State join behavior (`src-tauri/src/shared/forge_plans_core.rs::resolve_state_path` + `list_plans_core`):
- State path candidates include sibling and root patterns (`state.json`, `<plan-stem>.state.json`, `plans/<planId>.state.json`, `plans/<planId>/state.json`)
- Status values only apply when resolved state parses and `"$schema" == "state-v2"`
- Missing/invalid/non-`state-v2` state means all task statuses default to `pending`
- `currentTaskId` is currently always `null`

Schema examples to link:
- `src-tauri/resources/forge/templates/ralph-loop/schemas/plan.schema.json`
- `src-tauri/resources/forge/templates/ralph-loop/schemas/state.schema.json`

## 7. Prompt Normalization and Plan-Mode Compatibility

Document `src-tauri/src/shared/forge_templates_core.rs::normalize_plan_prompt` behavior:
- Rewrites `.agent/skills/` to `.agents/skills/`
- Rewrites `plans/<plan_id>.json` and `plans/<plan-id>.json` to `plans/<...>/plan.json`
- Prepends `@plan` when missing
- Rewrites legacy file-write output instructions to plan-mode output when marker conditions are met

Include where normalization is applied:
- `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core`
- surfaced through `forge_get_plan_prompt`

## 8. Troubleshooting (Code-Grounded)

Document common operator errors and the source path that emits each:
- `Unable to locate bundled forge templates` from `src-tauri/src/forge/mod.rs::bundled_templates_root_for_app` and `src-tauri/src/bin/codex_monitor_daemon.rs::bundled_templates_root_for_daemon`
- Missing lock behavior (`None`) from `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_lock_core`
- `No Forge template installed.` from `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core`
- `Installed Forge template folder is missing.` from `src-tauri/src/shared/forge_templates_core.rs::read_installed_template_plan_prompt_core`
- `Bundled template not found: <template_id>` from `src-tauri/src/shared/forge_templates_core.rs::install_bundled_template_core`

## 9. End-to-End Flow to Capture in Final Doc

Add one concrete sequence that links the sections above:
1. `forge_install_template`
2. `forge_get_plan_prompt`
3. plan file creation under `plans/<plan_id>/plan.json`
4. state updates in `plans/<plan_id>/state.json`
5. `forge_list_plans` status projection
