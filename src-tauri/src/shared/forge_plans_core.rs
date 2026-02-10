use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgePlanTaskV1 {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgeWorkspacePlanV1 {
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) title: Option<String>,
    pub(crate) goal: String,
    pub(crate) tasks: Vec<ForgePlanTaskV1>,
    pub(crate) current_task_id: Option<String>,
    pub(crate) plan_path: String,
    pub(crate) updated_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanV1 {
    id: String,
    #[serde(default)]
    title: Option<String>,
    goal: String,
    tasks: Vec<PlanTaskV1>,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanTaskV1 {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct StateV1 {
    #[serde(rename = "$schema")]
    schema: String,
    current_task: Option<String>,
    tasks: Vec<StateTaskV1>,
}

#[derive(Debug, Clone, Deserialize)]
struct StateTaskV1 {
    id: String,
    status: String,
}

fn system_time_to_unix_ms(time: SystemTime) -> i64 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn collect_json_files(root: &Path) -> Vec<PathBuf> {
    let mut output = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();
            if file_name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if !path.is_file() {
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            output.push(path);
        }
    }
    output
}

fn resolve_state_path(plans_dir: &Path, plan_path: &Path, plan_id: &str) -> Option<PathBuf> {
    let plan_dir = plan_path.parent().unwrap_or(plans_dir);
    let file_name = plan_path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    let mut candidates: Vec<PathBuf> = Vec::new();

    if file_name == "plan.json" {
        candidates.push(plan_dir.join("state.json"));
    } else if let Some(stem) = plan_path.file_stem().and_then(|s| s.to_str()) {
        candidates.push(plan_dir.join(format!("{stem}.state.json")));
    }

    candidates.push(plans_dir.join(format!("{plan_id}.state.json")));
    candidates.push(plans_dir.join(plan_id).join("state.json"));

    candidates.into_iter().find(|path| path.is_file())
}

pub(crate) fn list_plans_core(workspace_root: &Path) -> Result<Vec<ForgeWorkspacePlanV1>, String> {
    let plans_dir = workspace_root.join("plans");
    if !plans_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut plans = Vec::new();
    for path in collect_json_files(&plans_dir) {
        let raw = match fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(_) => continue,
        };
        let value: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let schema = value
            .get("$schema")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if schema != "plan-v1" {
            continue;
        }

        // plan-v1 is tasks-only: reject phase-based legacy plans.
        if value.get("phases").is_some() {
            continue;
        }
        let has_task_phase = value
            .get("tasks")
            .and_then(|v| v.as_array())
            .map(|tasks| {
                tasks.iter().any(|task| {
                    task.as_object()
                        .map(|obj| obj.contains_key("phase"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if has_task_phase {
            continue;
        }

        let parsed: PlanV1 = match serde_json::from_value(value) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        let plan_id = parsed.id.trim();
        if plan_id.is_empty() {
            continue;
        }
        // Task ids must match array order: task-1..task-n.
        if parsed
            .tasks
            .iter()
            .enumerate()
            .any(|(i, task)| task.id.trim() != format!("task-{}", i + 1))
        {
            continue;
        }

        let updated_at_ms = fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .map(system_time_to_unix_ms)
            .unwrap_or(0);

        let state_path = resolve_state_path(&plans_dir, &path, plan_id);
        let (current_task_id, task_status_by_id) = if let Some(state_path) = state_path {
            let raw = fs::read_to_string(&state_path).ok();
            if let Some(raw) = raw {
                if let Ok(state) = serde_json::from_str::<StateV1>(&raw) {
                    if state.schema.trim() == "state-v1" {
                        let mut map = HashMap::new();
                        for task in state.tasks {
                            let id = task.id.trim();
                            if id.is_empty() {
                                continue;
                            }
                            let status = task.status.trim();
                            if status.is_empty() {
                                continue;
                            }
                            map.insert(id.to_string(), status.to_string());
                        }
                        let current = state
                            .current_task
                            .as_ref()
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty());
                        (current, map)
                    } else {
                        (None, HashMap::new())
                    }
                } else {
                    (None, HashMap::new())
                }
            } else {
                (None, HashMap::new())
            }
        } else {
            (None, HashMap::new())
        };

        let tasks = parsed
            .tasks
            .into_iter()
            .map(|task| {
                let status = task_status_by_id
                    .get(task.id.trim())
                    .cloned()
                    .unwrap_or_else(|| "pending".to_string());
                ForgePlanTaskV1 {
                    id: task.id,
                    name: task.name,
                    status,
                }
            })
            .collect::<Vec<_>>();

        let plan_path = path
            .strip_prefix(workspace_root)
            .ok()
            .map(|rel| rel.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());

        let title = parsed
            .title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        plans.push(ForgeWorkspacePlanV1 {
            id: plan_id.to_string(),
            title,
            goal: parsed.goal,
            tasks,
            current_task_id,
            plan_path,
            updated_at_ms,
        });
    }

    let mut unique_by_id: HashMap<String, ForgeWorkspacePlanV1> = HashMap::new();
    for plan in plans {
        match unique_by_id.get(&plan.id) {
            None => {
                unique_by_id.insert(plan.id.clone(), plan);
            }
            Some(existing) if plan.updated_at_ms > existing.updated_at_ms => {
                unique_by_id.insert(plan.id.clone(), plan);
            }
            _ => {}
        }
    }

    let mut plans = unique_by_id.into_values().collect::<Vec<_>>();
    plans.sort_by(|a, b| b.updated_at_ms.cmp(&a.updated_at_ms));
    Ok(plans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use uuid::Uuid;

    fn write_json(path: &Path, value: serde_json::Value) {
        let raw = serde_json::to_string_pretty(&value).expect("serialize json");
        let mut file = std::fs::File::create(path).expect("create file");
        file.write_all(raw.as_bytes()).expect("write file");
        file.write_all(b"\n").expect("write newline");
    }

    #[test]
    fn list_plans_finds_plan_v1_files_recursively_and_joins_state() {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-forge-plans-core-test-{}",
            Uuid::new_v4()
        ));
        std::fs::create_dir_all(root.join("plans").join("nested")).expect("create plans dir");

        write_json(
            &root.join("plans").join("alpha.json"),
            serde_json::json!({
              "$schema": "plan-v1",
              "id": "alpha",
              "title": "Alpha",
              "goal": "Alpha goal",
              "context": { "tech_stack": ["x"], "constraints": [] },
              "tasks": [{ "id": "task-1", "name": "T1", "description": "d", "depends_on": [], "files": ["a"], "verification": ["v"] }]
            }),
        );

        write_json(
            &root.join("plans").join("alpha.state.json"),
            serde_json::json!({
              "$schema": "state-v1",
              "plan_id": "alpha",
              "iteration": 1,
              "summary": "",
              "current_task": "task-1",
              "tasks": [{ "id": "task-1", "status": "in_progress", "attempts": 1, "notes": "" }]
            }),
        );

        write_json(
            &root.join("plans").join("nested").join("plan.json"),
            serde_json::json!({
              "$schema": "plan-v1",
              "id": "nested-plan",
              "goal": "Nested goal",
              "context": { "tech_stack": ["x"], "constraints": [] },
              "tasks": [{ "id": "task-1", "name": "T1", "description": "d", "depends_on": [], "files": ["a"], "verification": ["v"] }]
            }),
        );

        write_json(
            &root.join("plans").join("nested").join("state.json"),
            serde_json::json!({
              "$schema": "state-v1",
              "plan_id": "nested-plan",
              "iteration": 0,
              "summary": "",
              "current_task": null,
              "tasks": [{ "id": "task-1", "status": "completed", "attempts": 1, "notes": "" }]
            }),
        );

        // Non-plan json should be ignored.
        write_json(
            &root.join("plans").join("noise.json"),
            serde_json::json!({ "$schema": "not-a-plan", "id": "nope" }),
        );

        let plans = list_plans_core(&root).expect("list plans");
        assert_eq!(plans.len(), 2);

        let alpha = plans.iter().find(|p| p.id == "alpha").expect("alpha");
        assert_eq!(alpha.title.as_deref(), Some("Alpha"));
        assert_eq!(alpha.goal, "Alpha goal");
        assert_eq!(alpha.current_task_id.as_deref(), Some("task-1"));
        assert_eq!(alpha.tasks.len(), 1);
        assert_eq!(alpha.tasks[0].status, "in_progress");

        let nested = plans
            .iter()
            .find(|p| p.id == "nested-plan")
            .expect("nested-plan");
        assert_eq!(nested.title.as_deref(), None);
        assert_eq!(nested.goal, "Nested goal");
        assert_eq!(nested.tasks[0].status, "completed");
    }
}
