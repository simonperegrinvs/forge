use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::process::Output;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::time::timeout;
use uuid::Uuid;

use crate::shared::forge_templates_core::{read_installed_template_lock_core, ForgeTemplateLockV1};
use crate::shared::process_core::tokio_command;
use crate::utils::{git_env_path, resolve_git_binary};

const CHECK_TIMEOUT_SECONDS_DEFAULT: u64 = 10 * 60;
const HOOK_TIMEOUT_SECONDS: u64 = 2 * 60;
const GIT_COMMAND_TIMEOUT_SECONDS: u64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgeNextPhasePromptV1 {
    pub(crate) plan_id: String,
    pub(crate) task_id: String,
    pub(crate) phase_id: String,
    pub(crate) is_last_phase: bool,
    pub(crate) prompt_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgePhaseStatusV1 {
    pub(crate) status: String,
    pub(crate) commit_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgePhaseCheckResultV1 {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) exit_code: i32,
    pub(crate) duration_ms: i64,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgeRunPhaseChecksResponseV1 {
    pub(crate) ok: bool,
    pub(crate) results: Vec<ForgePhaseCheckResultV1>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateManifestV1 {
    schema: String,
    entrypoints: ForgeTemplateEntrypointsV1,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateEntrypointsV1 {
    phases: String,
    execute_prompt: String,
    hooks: ForgeTemplateHooksV1,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateHooksV1 {
    post_plan: String,
    pre_execute: String,
    post_step: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanV1 {
    #[serde(rename = "$schema")]
    schema: String,
    id: String,
    #[allow(dead_code)]
    goal: String,
    #[serde(default)]
    tasks: Vec<PlanTaskV1>,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanTaskV1 {
    id: String,
    name: String,
    #[serde(default)]
    depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StateV2 {
    #[serde(rename = "$schema")]
    schema: String,
    plan_id: String,
    #[serde(default)]
    tasks: Vec<StateTaskV2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StateTaskV2 {
    id: String,
    status: String,
    #[serde(default)]
    commit_sha: Option<String>,
    #[serde(default)]
    phases: Vec<StatePhaseV2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StatePhaseV2 {
    id: String,
    status: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ForgeTemplatePhasesV1 {
    schema: String,
    #[serde(default)]
    phases: Vec<ForgeTemplatePhaseV1>,
}

#[derive(Debug, Clone, Deserialize)]
struct ForgeTemplatePhaseV1 {
    id: String,
    #[serde(default)]
    checks: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ForgeHookContextV1 {
    workspace_root: String,
    template_root: String,
    plan_id: String,
    plan_dir: String,
    plan_path: String,
    state_path: String,
    progress_path: String,
    generated_plan_md_path: String,
    generated_execute_prompt_path: String,
    today_iso: String,
}

#[derive(Debug, Clone)]
struct ForgeExecutionPaths {
    plan_id: String,
    workspace_root: PathBuf,
    template_root: PathBuf,
    plan_dir: PathBuf,
    plan_path: PathBuf,
    state_path: PathBuf,
    progress_path: PathBuf,
    generated_plan_md_path: PathBuf,
    generated_execute_prompt_path: PathBuf,
    phases_path: PathBuf,
    post_plan_hook_path: PathBuf,
    pre_execute_hook_path: PathBuf,
    post_step_hook_path: PathBuf,
}

#[derive(Debug, Clone)]
struct RunnablePhaseCheck {
    id: String,
    title: String,
    command: String,
    timeout_seconds: u64,
}

fn is_ascii_lower_alnum(ch: char) -> bool {
    ch.is_ascii_lowercase() || ch.is_ascii_digit()
}

fn validate_plan_id(plan_id: &str) -> Result<String, String> {
    let id = plan_id.trim();
    if id.is_empty() {
        return Err("planId is required".to_string());
    }
    if id.len() > 64 {
        return Err("planId is too long".to_string());
    }

    let first = id.chars().next().ok_or("planId is required")?;
    let last = id.chars().last().ok_or("planId is required")?;
    if !is_ascii_lower_alnum(first) || !is_ascii_lower_alnum(last) {
        return Err("planId must start and end with [a-z0-9]".to_string());
    }
    for ch in id.chars() {
        if is_ascii_lower_alnum(ch) || ch == '-' {
            continue;
        }
        return Err("planId must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$".to_string());
    }
    Ok(id.to_string())
}

fn validate_relative_file_path(rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim();
    if trimmed.is_empty() {
        return Err("template file path is empty".to_string());
    }

    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        return Err(format!("template file path must be relative: {trimmed}"));
    }

    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                return Err(format!("template file path must be relative: {trimmed}"))
            }
            Component::ParentDir => {
                return Err(format!("template file path may not use '..': {trimmed}"))
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }

    Ok(path)
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let raw = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str::<T>(&raw).map_err(|err| format!("Invalid JSON in {}: {err}", path.display()))
}

fn read_template_manifest(template_root: &Path) -> Result<ForgeTemplateManifestV1, String> {
    let manifest_path = template_root.join("template.json");
    let manifest = read_json_file::<ForgeTemplateManifestV1>(&manifest_path)?;
    if manifest.schema.trim() != "forge-template-v1" {
        return Err(format!(
            "Unsupported template.json schema (expected forge-template-v1): {}",
            manifest.schema
        ));
    }
    Ok(manifest)
}

fn require_installed_template_lock(workspace_root: &Path) -> Result<ForgeTemplateLockV1, String> {
    read_installed_template_lock_core(workspace_root)?
        .ok_or_else(|| "No Forge template installed.".to_string())
}

fn build_execution_paths(workspace_root: &Path, plan_id: &str) -> Result<ForgeExecutionPaths, String> {
    let normalized_plan_id = validate_plan_id(plan_id)?;
    let template_lock = require_installed_template_lock(workspace_root)?;
    let template_root = workspace_root
        .join(".agent")
        .join("templates")
        .join(&template_lock.installed_template_id);
    if !template_root.is_dir() {
        return Err("Installed Forge template folder is missing.".to_string());
    }

    let manifest = read_template_manifest(&template_root)?;
    let phases_rel = validate_relative_file_path(&manifest.entrypoints.phases)?;
    let _execute_prompt_rel = validate_relative_file_path(&manifest.entrypoints.execute_prompt)?;
    let post_plan_rel = validate_relative_file_path(&manifest.entrypoints.hooks.post_plan)?;
    let pre_execute_rel = validate_relative_file_path(&manifest.entrypoints.hooks.pre_execute)?;
    let post_step_rel = validate_relative_file_path(&manifest.entrypoints.hooks.post_step)?;

    let plan_dir = workspace_root.join("plans").join(&normalized_plan_id);
    let plan_path = plan_dir.join("plan.json");
    let state_path = plan_dir.join("state.json");
    let progress_path = plan_dir.join("progress.md");
    let generated_plan_md_path = plan_dir.join("plan.md");
    let generated_execute_prompt_path = plan_dir.join("execute-prompt.md");

    Ok(ForgeExecutionPaths {
        plan_id: normalized_plan_id,
        workspace_root: workspace_root.to_path_buf(),
        template_root: template_root.clone(),
        plan_dir,
        plan_path,
        state_path,
        progress_path,
        generated_plan_md_path,
        generated_execute_prompt_path,
        phases_path: template_root.join(phases_rel),
        post_plan_hook_path: template_root.join(post_plan_rel),
        pre_execute_hook_path: template_root.join(pre_execute_rel),
        post_step_hook_path: template_root.join(post_step_rel),
    })
}

fn require_plan_file(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("Missing plan.json: {}", path.display()));
    }
    Ok(())
}

fn load_plan(paths: &ForgeExecutionPaths) -> Result<PlanV1, String> {
    let plan = read_json_file::<PlanV1>(&paths.plan_path)?;
    if plan.schema.trim() != "plan-v1" {
        return Err(format!(
            "Unsupported plan schema in {}: {}",
            paths.plan_path.display(),
            plan.schema
        ));
    }
    if plan.id.trim() != paths.plan_id {
        return Err(format!(
            "Plan id mismatch (expected {}, got {})",
            paths.plan_id, plan.id
        ));
    }
    Ok(plan)
}

fn load_state(paths: &ForgeExecutionPaths) -> Result<StateV2, String> {
    let state = read_json_file::<StateV2>(&paths.state_path)?;
    if state.schema.trim() != "state-v2" {
        return Err(format!(
            "Unsupported state schema in {}: {}",
            paths.state_path.display(),
            state.schema
        ));
    }
    if state.plan_id.trim() != paths.plan_id {
        return Err(format!(
            "State plan_id mismatch (expected {}, got {})",
            paths.plan_id, state.plan_id
        ));
    }
    Ok(state)
}

fn load_template_phases(paths: &ForgeExecutionPaths) -> Result<ForgeTemplatePhasesV1, String> {
    let phases = read_json_file::<ForgeTemplatePhasesV1>(&paths.phases_path)?;
    if phases.schema.trim() != "forge-phases-v1" {
        return Err(format!(
            "Unsupported phases schema in {}: {}",
            paths.phases_path.display(),
            phases.schema
        ));
    }
    Ok(phases)
}

fn is_completed_status(status: &str) -> bool {
    status.trim() == "completed"
}

fn is_task_completed(task: &StateTaskV2) -> bool {
    if task.phases.is_empty() {
        return is_completed_status(&task.status);
    }
    task.phases
        .iter()
        .all(|phase| is_completed_status(&phase.status))
}

fn map_state_tasks<'a>(state: &'a StateV2) -> HashMap<&'a str, &'a StateTaskV2> {
    state
        .tasks
        .iter()
        .map(|task| (task.id.as_str(), task))
        .collect()
}

fn is_task_dependencies_satisfied(
    task: &PlanTaskV1,
    state_tasks_by_id: &HashMap<&str, &StateTaskV2>,
) -> bool {
    for dep in &task.depends_on {
        let dep_id = dep.trim();
        if dep_id.is_empty() {
            continue;
        }
        let Some(state_task) = state_tasks_by_id.get(dep_id) else {
            return false;
        };
        if !is_task_completed(state_task) {
            return false;
        }
    }
    true
}

fn find_next_runnable_task<'a>(plan: &'a PlanV1, state: &'a StateV2) -> Option<&'a PlanTaskV1> {
    let state_tasks_by_id = map_state_tasks(state);

    for task in &plan.tasks {
        let Some(state_task) = state_tasks_by_id.get(task.id.as_str()) else {
            continue;
        };
        if is_task_completed(state_task) {
            continue;
        }
        if is_task_dependencies_satisfied(task, &state_tasks_by_id) {
            return Some(task);
        }
    }

    None
}

fn find_next_phase<'a>(task: &'a StateTaskV2) -> Option<(usize, &'a StatePhaseV2)> {
    task.phases
        .iter()
        .enumerate()
        .find(|(_, phase)| !is_completed_status(&phase.status))
}

fn build_hook_context(paths: &ForgeExecutionPaths) -> ForgeHookContextV1 {
    ForgeHookContextV1 {
        workspace_root: paths.workspace_root.to_string_lossy().to_string(),
        template_root: paths.template_root.to_string_lossy().to_string(),
        plan_id: paths.plan_id.clone(),
        plan_dir: paths.plan_dir.to_string_lossy().to_string(),
        plan_path: paths.plan_path.to_string_lossy().to_string(),
        state_path: paths.state_path.to_string_lossy().to_string(),
        progress_path: paths.progress_path.to_string_lossy().to_string(),
        generated_plan_md_path: paths.generated_plan_md_path.to_string_lossy().to_string(),
        generated_execute_prompt_path: paths.generated_execute_prompt_path.to_string_lossy().to_string(),
        today_iso: Utc::now().date_naive().format("%Y-%m-%d").to_string(),
    }
}

fn format_process_error(stdout: &[u8], stderr: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let stdout = String::from_utf8_lossy(stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        "Process failed.".to_string()
    } else {
        detail.to_string()
    }
}

async fn run_template_hook(
    script_path: &Path,
    workspace_root: &Path,
    context: &ForgeHookContextV1,
) -> Result<(), String> {
    let context_json =
        serde_json::to_string_pretty(context).map_err(|err| format!("Failed to serialize hook context: {err}"))?;
    let context_path =
        std::env::temp_dir().join(format!("codex-monitor-forge-hook-context-{}.json", Uuid::new_v4()));

    fs::write(&context_path, format!("{context_json}\n")).map_err(|err| {
        format!(
            "Failed to write Forge hook context file {}: {err}",
            context_path.display()
        )
    })?;

    let mut command = tokio_command("node");
    command
        .arg(script_path)
        .arg("--context")
        .arg(&context_path)
        .current_dir(workspace_root)
        .env("PATH", git_env_path());

    let output_result = timeout(Duration::from_secs(HOOK_TIMEOUT_SECONDS), command.output()).await;
    let _ = fs::remove_file(&context_path);

    let output = match output_result {
        Ok(Ok(output)) => output,
        Ok(Err(err)) => {
            return Err(format!(
                "Failed to run hook {}: {err}",
                script_path.display()
            ))
        }
        Err(_) => {
            return Err(format!(
                "Hook timed out after {}s: {}",
                HOOK_TIMEOUT_SECONDS,
                script_path.display()
            ))
        }
    };

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "Hook failed ({}): {}",
        script_path.display(),
        format_process_error(&output.stdout, &output.stderr)
    ))
}

fn parse_phase_checks(checks: &[Value]) -> Vec<Result<RunnablePhaseCheck, ForgePhaseCheckResultV1>> {
    checks
        .iter()
        .enumerate()
        .map(|(index, raw)| {
            let fallback_id = format!("check-{}", index + 1);
            if let Some(command) = raw.as_str() {
                let trimmed = command.trim();
                if trimmed.is_empty() {
                    return Err(ForgePhaseCheckResultV1 {
                        id: fallback_id.clone(),
                        title: fallback_id,
                        exit_code: 2,
                        duration_ms: 0,
                        stdout: String::new(),
                        stderr: "Phase check command is empty.".to_string(),
                        timed_out: false,
                    });
                }
                return Ok(RunnablePhaseCheck {
                    id: fallback_id.clone(),
                    title: fallback_id,
                    command: trimmed.to_string(),
                    timeout_seconds: CHECK_TIMEOUT_SECONDS_DEFAULT,
                });
            }

            let Some(obj) = raw.as_object() else {
                return Err(ForgePhaseCheckResultV1 {
                    id: fallback_id.clone(),
                    title: fallback_id,
                    exit_code: 2,
                    duration_ms: 0,
                    stdout: String::new(),
                    stderr: "Invalid phase check entry: expected string or object.".to_string(),
                    timed_out: false,
                });
            };

            let id = obj
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(&fallback_id)
                .to_string();
            let title = obj
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(&id)
                .to_string();
            let command = obj
                .get("command")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            if command.is_empty() {
                return Err(ForgePhaseCheckResultV1 {
                    id,
                    title,
                    exit_code: 2,
                    duration_ms: 0,
                    stdout: String::new(),
                    stderr: "Phase check object is missing a non-empty command field.".to_string(),
                    timed_out: false,
                });
            }
            let timeout_seconds = obj
                .get("timeoutSec")
                .and_then(Value::as_u64)
                .filter(|value| *value > 0)
                .unwrap_or(CHECK_TIMEOUT_SECONDS_DEFAULT);

            Ok(RunnablePhaseCheck {
                id,
                title,
                command,
                timeout_seconds,
            })
        })
        .collect()
}

async fn run_phase_check(workspace_root: &Path, check: &RunnablePhaseCheck) -> ForgePhaseCheckResultV1 {
    let start = Instant::now();

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = tokio_command("cmd");
        command.arg("/C").arg(&check.command);
        command
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = tokio_command("sh");
        command.arg("-lc").arg(&check.command);
        command
    };

    command.current_dir(workspace_root).env("PATH", git_env_path());

    match timeout(Duration::from_secs(check.timeout_seconds), command.output()).await {
        Ok(Ok(output)) => ForgePhaseCheckResultV1 {
            id: check.id.clone(),
            title: check.title.clone(),
            exit_code: output.status.code().unwrap_or(-1),
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            timed_out: false,
        },
        Ok(Err(err)) => ForgePhaseCheckResultV1 {
            id: check.id.clone(),
            title: check.title.clone(),
            exit_code: -1,
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::new(),
            stderr: format!("Failed to run phase check command: {err}"),
            timed_out: false,
        },
        Err(_) => ForgePhaseCheckResultV1 {
            id: check.id.clone(),
            title: check.title.clone(),
            exit_code: 124,
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::new(),
            stderr: format!(
                "Phase check timed out after {}s.",
                check.timeout_seconds
            ),
            timed_out: true,
        },
    }
}

fn task_has_commit_sha(task: &StateTaskV2) -> bool {
    task.commit_sha
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn build_forge_task_commit_message(plan_id: &str, task: &PlanTaskV1) -> String {
    let normalized_name = task.name.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized_name.is_empty() {
        return format!("forge({plan_id}): {}", task.id);
    }
    format!("forge({plan_id}): {} {normalized_name}", task.id)
}

async fn run_git_command_with_timeout(
    workspace_root: &Path,
    args: &[&str],
) -> Result<Output, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to resolve git binary: {err}"))?;
    let mut command = tokio_command(git_bin);
    command
        .args(args)
        .current_dir(workspace_root)
        .env("PATH", git_env_path());

    match timeout(Duration::from_secs(GIT_COMMAND_TIMEOUT_SECONDS), command.output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(format!("Failed to run git command {:?}: {err}", args)),
        Err(_) => Err(format!(
            "Git command timed out after {}s: {:?}",
            GIT_COMMAND_TIMEOUT_SECONDS, args
        )),
    }
}

async fn forge_create_task_commit(
    workspace_root: &Path,
    commit_message: &str,
) -> Result<(String, String, String, i64), ForgePhaseCheckResultV1> {
    let start = Instant::now();
    let add_output = match run_git_command_with_timeout(workspace_root, &["add", "-A"]).await {
        Ok(output) => output,
        Err(err) => {
            return Err(ForgePhaseCheckResultV1 {
                id: "forge-commit".to_string(),
                title: "Forge task commit".to_string(),
                exit_code: -1,
                duration_ms: start.elapsed().as_millis() as i64,
                stdout: String::new(),
                stderr: err,
                timed_out: false,
            })
        }
    };
    if !add_output.status.success() {
        return Err(ForgePhaseCheckResultV1 {
            id: "forge-commit".to_string(),
            title: "Forge task commit".to_string(),
            exit_code: add_output.status.code().unwrap_or(-1),
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::from_utf8_lossy(&add_output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&add_output.stderr).to_string(),
            timed_out: false,
        });
    }

    let commit_output = match run_git_command_with_timeout(
        workspace_root,
        &["commit", "-m", commit_message],
    )
    .await
    {
        Ok(output) => output,
        Err(err) => {
            return Err(ForgePhaseCheckResultV1 {
                id: "forge-commit".to_string(),
                title: "Forge task commit".to_string(),
                exit_code: -1,
                duration_ms: start.elapsed().as_millis() as i64,
                stdout: String::new(),
                stderr: err,
                timed_out: false,
            })
        }
    };
    if !commit_output.status.success() {
        return Err(ForgePhaseCheckResultV1 {
            id: "forge-commit".to_string(),
            title: "Forge task commit".to_string(),
            exit_code: commit_output.status.code().unwrap_or(-1),
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::from_utf8_lossy(&commit_output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&commit_output.stderr).to_string(),
            timed_out: false,
        });
    }

    let sha_output = match run_git_command_with_timeout(workspace_root, &["rev-parse", "HEAD"]).await {
        Ok(output) => output,
        Err(err) => {
            return Err(ForgePhaseCheckResultV1 {
                id: "forge-commit".to_string(),
                title: "Forge task commit".to_string(),
                exit_code: -1,
                duration_ms: start.elapsed().as_millis() as i64,
                stdout: String::new(),
                stderr: err,
                timed_out: false,
            })
        }
    };
    if !sha_output.status.success() {
        return Err(ForgePhaseCheckResultV1 {
            id: "forge-commit".to_string(),
            title: "Forge task commit".to_string(),
            exit_code: sha_output.status.code().unwrap_or(-1),
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::from_utf8_lossy(&sha_output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&sha_output.stderr).to_string(),
            timed_out: false,
        });
    }

    let sha = String::from_utf8_lossy(&sha_output.stdout).trim().to_string();
    if sha.is_empty() {
        return Err(ForgePhaseCheckResultV1 {
            id: "forge-commit".to_string(),
            title: "Forge task commit".to_string(),
            exit_code: -1,
            duration_ms: start.elapsed().as_millis() as i64,
            stdout: String::new(),
            stderr: "Unable to resolve commit SHA after commit.".to_string(),
            timed_out: false,
        });
    }

    Ok((
        sha,
        String::from_utf8_lossy(&commit_output.stdout).to_string(),
        String::from_utf8_lossy(&commit_output.stderr).to_string(),
        start.elapsed().as_millis() as i64,
    ))
}

pub(crate) async fn forge_prepare_execution_core(
    workspace_root: &Path,
    plan_id: &str,
) -> Result<(), String> {
    let paths = build_execution_paths(workspace_root, plan_id)?;
    require_plan_file(&paths.plan_path)?;
    let context = build_hook_context(&paths);

    run_template_hook(&paths.post_plan_hook_path, &paths.workspace_root, &context).await?;
    run_template_hook(&paths.pre_execute_hook_path, &paths.workspace_root, &context).await
}

pub(crate) async fn forge_get_next_phase_prompt_core(
    workspace_root: &Path,
    plan_id: &str,
) -> Result<Option<ForgeNextPhasePromptV1>, String> {
    let paths = build_execution_paths(workspace_root, plan_id)?;
    require_plan_file(&paths.plan_path)?;
    if !paths.state_path.is_file() {
        return Err(format!(
            "Missing state.json: {}. Run forge_prepare_execution first.",
            paths.state_path.display()
        ));
    }

    let plan = load_plan(&paths)?;
    let state = load_state(&paths)?;
    let Some(task) = find_next_runnable_task(&plan, &state) else {
        return Ok(None);
    };
    let state_tasks_by_id = map_state_tasks(&state);
    let task_state = state_tasks_by_id
        .get(task.id.as_str())
        .ok_or_else(|| format!("state.json missing task entry for {}", task.id))?;

    let (phase_id, is_last_phase) = match find_next_phase(task_state) {
        Some((index, phase)) => (phase.id.clone(), index + 1 >= task_state.phases.len()),
        None => ("implementation".to_string(), true),
    };

    let prompt_text = if paths.generated_execute_prompt_path.is_file() {
        fs::read_to_string(&paths.generated_execute_prompt_path).map_err(|err| err.to_string())?
    } else {
        let context = build_hook_context(&paths);
        run_template_hook(&paths.post_step_hook_path, &paths.workspace_root, &context).await?;
        fs::read_to_string(&paths.generated_execute_prompt_path).map_err(|err| {
            format!(
                "Unable to read generated execute prompt {}: {err}",
                paths.generated_execute_prompt_path.display()
            )
        })?
    };

    Ok(Some(ForgeNextPhasePromptV1 {
        plan_id: paths.plan_id,
        task_id: task.id.clone(),
        phase_id,
        is_last_phase,
        prompt_text,
    }))
}

pub(crate) fn forge_get_phase_status_core(
    workspace_root: &Path,
    plan_id: &str,
    task_id: &str,
    phase_id: &str,
) -> Result<ForgePhaseStatusV1, String> {
    let paths = build_execution_paths(workspace_root, plan_id)?;
    if !paths.state_path.is_file() {
        return Err(format!("Missing state.json: {}", paths.state_path.display()));
    }

    let task_id = task_id.trim();
    let phase_id = phase_id.trim();
    if task_id.is_empty() {
        return Err("taskId is required".to_string());
    }
    if phase_id.is_empty() {
        return Err("phaseId is required".to_string());
    }

    let state = load_state(&paths)?;
    let task = state
        .tasks
        .iter()
        .find(|task| task.id.trim() == task_id)
        .ok_or_else(|| format!("Unknown taskId: {task_id}"))?;
    let phase = task
        .phases
        .iter()
        .find(|phase| phase.id.trim() == phase_id)
        .ok_or_else(|| format!("Unknown phaseId for task {task_id}: {phase_id}"))?;

    let status = phase.status.trim();
    let status = if status.is_empty() {
        "pending".to_string()
    } else {
        status.to_string()
    };

    Ok(ForgePhaseStatusV1 {
        status,
        commit_sha: task.commit_sha.clone(),
    })
}

pub(crate) async fn forge_run_phase_checks_core(
    workspace_root: &Path,
    plan_id: &str,
    task_id: &str,
    phase_id: &str,
) -> Result<ForgeRunPhaseChecksResponseV1, String> {
    let paths = build_execution_paths(workspace_root, plan_id)?;
    let task_id = task_id.trim();
    let phase_id = phase_id.trim();
    if task_id.is_empty() {
        return Err("taskId is required".to_string());
    }
    if phase_id.is_empty() {
        return Err("phaseId is required".to_string());
    }

    let plan = load_plan(&paths)?;
    let plan_task = plan
        .tasks
        .iter()
        .find(|task| task.id.trim() == task_id)
        .ok_or_else(|| format!("Unknown taskId: {task_id}"))?;
    let mut state = load_state(&paths)?;
    let task_index = state
        .tasks
        .iter()
        .position(|task| task.id.trim() == task_id)
        .ok_or_else(|| format!("state.json missing task entry for {task_id}"))?;
    let task_state = state
        .tasks
        .get(task_index)
        .ok_or_else(|| format!("state.json missing task entry for {task_id}"))?;
    let phase_index = task_state
        .phases
        .iter()
        .position(|phase| phase.id.trim() == phase_id)
        .ok_or_else(|| format!("Unknown phaseId for task {task_id}: {phase_id}"))?;
    let target_phase = task_state
        .phases
        .get(phase_index)
        .ok_or_else(|| format!("Unknown phaseId for task {task_id}: {phase_id}"))?;
    let is_last_phase = phase_index + 1 >= task_state.phases.len();

    let phases = load_template_phases(&paths)?;
    let phase_checks = phases
        .phases
        .iter()
        .find(|phase| phase.id.trim() == phase_id)
        .map(|phase| phase.checks.as_slice())
        .unwrap_or(&[]);

    let mut results = Vec::new();
    for parsed in parse_phase_checks(phase_checks) {
        match parsed {
            Ok(check) => {
                let result = run_phase_check(&paths.workspace_root, &check).await;
                results.push(result);
            }
            Err(result) => results.push(result),
        }
    }

    let mut ok = results
        .iter()
        .all(|result| !result.timed_out && result.exit_code == 0);

    let should_commit_task = ok
        && is_last_phase
        && is_completed_status(&target_phase.status)
        && is_task_completed(task_state)
        && !task_has_commit_sha(task_state);
    if should_commit_task {
        let commit_message = build_forge_task_commit_message(&paths.plan_id, plan_task);
        match forge_create_task_commit(&paths.workspace_root, &commit_message).await {
            Ok((sha, stdout, stderr, duration_ms)) => {
                if let Some(task) = state.tasks.get_mut(task_index) {
                    task.commit_sha = Some(sha.clone());
                }
                let state_raw =
                    serde_json::to_string_pretty(&state).map_err(|err| err.to_string())?;
                fs::write(&paths.state_path, format!("{state_raw}\n")).map_err(|err| err.to_string())?;
                results.push(ForgePhaseCheckResultV1 {
                    id: "forge-commit".to_string(),
                    title: "Forge task commit".to_string(),
                    exit_code: 0,
                    duration_ms,
                    stdout: if stdout.trim().is_empty() {
                        format!("Created commit {sha}")
                    } else {
                        stdout
                    },
                    stderr,
                    timed_out: false,
                });
            }
            Err(result) => {
                results.push(result);
                ok = false;
            }
        }
    }

    ok = ok
        && results
            .iter()
            .all(|result| !result.timed_out && result.exit_code == 0);

    let context = build_hook_context(&paths);
    run_template_hook(&paths.post_step_hook_path, &paths.workspace_root, &context).await?;

    Ok(ForgeRunPhaseChecksResponseV1 { ok, results })
}
