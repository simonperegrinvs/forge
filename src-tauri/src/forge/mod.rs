use serde_json::json;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

use crate::remote_backend;
use crate::shared::forge_execute_core;
use crate::shared::forge_plans_core;
use crate::shared::forge_templates_core::{
    find_bundled_templates_root_near_exe, install_bundled_template_core,
    list_bundled_templates_core, read_installed_template_lock_core, uninstall_template_core,
    read_installed_template_plan_prompt_core, sync_agent_skills_into_repo_agents_dir_core,
    ForgeBundledTemplateInfo, ForgeTemplateLockV1,
};
use crate::state::AppState;

fn bundled_templates_root_for_app(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let roots = [
            resource_dir.join("forge").join("templates"),
            resource_dir
                .join("resources")
                .join("forge")
                .join("templates"),
        ];
        for root in roots {
            if root.is_dir() {
                return Ok(root);
            }
        }
    }

    // Dev fallback: use the crate directory when running from `cargo tauri dev`.
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_root = manifest_root.join("resources").join("forge").join("templates");
    if dev_root.is_dir() {
        return Ok(dev_root);
    }

    // Last-ditch fallback: try resolving resources near the executable.
    let exe = std::env::current_exe().map_err(|err| err.to_string())?;
    find_bundled_templates_root_near_exe(&exe)
        .ok_or_else(|| "Unable to locate bundled forge templates".to_string())
}

async fn workspace_root_for_id(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

#[tauri::command]
pub(crate) async fn forge_list_bundled_templates(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<ForgeBundledTemplateInfo>, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response =
            remote_backend::call_remote(&state, app, "forge_list_bundled_templates", json!({}))
                .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let root = bundled_templates_root_for_app(&app)?;
    list_bundled_templates_core(&root)
}

#[tauri::command]
pub(crate) async fn forge_get_installed_template(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Option<ForgeTemplateLockV1>, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_get_installed_template",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    if let Err(err) = sync_agent_skills_into_repo_agents_dir_core(&workspace_root) {
        eprintln!("forge_get_installed_template: failed to sync skills into .agents: {err}");
    }
    read_installed_template_lock_core(&workspace_root)
}

#[tauri::command]
pub(crate) async fn forge_install_template(
    workspace_id: String,
    template_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ForgeTemplateLockV1, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_install_template",
            json!({ "workspaceId": workspace_id, "templateId": template_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let templates_root = bundled_templates_root_for_app(&app)?;
    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    let lock = install_bundled_template_core(&templates_root, &workspace_root, template_id.trim())?;
    if let Err(err) = sync_agent_skills_into_repo_agents_dir_core(&workspace_root) {
        eprintln!("forge_install_template: failed to sync skills into .agents: {err}");
    }
    Ok(lock)
}

#[tauri::command]
pub(crate) async fn forge_uninstall_template(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&state).await {
        remote_backend::call_remote(
            &state,
            app,
            "forge_uninstall_template",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return Ok(());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    uninstall_template_core(&workspace_root)
}

#[tauri::command]
pub(crate) async fn forge_list_plans(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<forge_plans_core::ForgeWorkspacePlanV1>, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_list_plans",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_plans_core::list_plans_core(&workspace_root)
}

#[tauri::command]
pub(crate) async fn forge_get_plan_prompt(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_get_plan_prompt",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    if let Err(err) = sync_agent_skills_into_repo_agents_dir_core(&workspace_root) {
        eprintln!("forge_get_plan_prompt: failed to sync skills into .agents: {err}");
    }
    read_installed_template_plan_prompt_core(&workspace_root)
}

#[tauri::command]
pub(crate) async fn forge_prepare_execution(
    workspace_id: String,
    plan_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&state).await {
        remote_backend::call_remote(
            &state,
            app,
            "forge_prepare_execution",
            json!({ "workspaceId": workspace_id, "planId": plan_id }),
        )
        .await?;
        return Ok(());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_execute_core::forge_prepare_execution_core(&workspace_root, &plan_id).await
}

#[tauri::command]
pub(crate) async fn forge_reset_execution_progress(
    workspace_id: String,
    plan_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&state).await {
        remote_backend::call_remote(
            &state,
            app,
            "forge_reset_execution_progress",
            json!({ "workspaceId": workspace_id, "planId": plan_id }),
        )
        .await?;
        return Ok(());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_execute_core::forge_reset_execution_progress_core(&workspace_root, &plan_id).await
}

#[tauri::command]
pub(crate) async fn forge_get_next_phase_prompt(
    workspace_id: String,
    plan_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Option<forge_execute_core::ForgeNextPhasePromptV1>, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_get_next_phase_prompt",
            json!({ "workspaceId": workspace_id, "planId": plan_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_execute_core::forge_get_next_phase_prompt_core(&workspace_root, &plan_id).await
}

#[tauri::command]
pub(crate) async fn forge_get_phase_status(
    workspace_id: String,
    plan_id: String,
    task_id: String,
    phase_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<forge_execute_core::ForgePhaseStatusV1, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_get_phase_status",
            json!({ "workspaceId": workspace_id, "planId": plan_id, "taskId": task_id, "phaseId": phase_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_execute_core::forge_get_phase_status_core(&workspace_root, &plan_id, &task_id, &phase_id)
}

#[tauri::command]
pub(crate) async fn forge_run_phase_checks(
    workspace_id: String,
    plan_id: String,
    task_id: String,
    phase_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<forge_execute_core::ForgeRunPhaseChecksResponseV1, String> {
    if remote_backend::is_remote_mode(&state).await {
        let response = remote_backend::call_remote(
            &state,
            app,
            "forge_run_phase_checks",
            json!({ "workspaceId": workspace_id, "planId": plan_id, "taskId": task_id, "phaseId": phase_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspace_root = workspace_root_for_id(&state, &workspace_id).await?;
    forge_execute_core::forge_run_phase_checks_core(&workspace_root, &plan_id, &task_id, &phase_id)
        .await
}
