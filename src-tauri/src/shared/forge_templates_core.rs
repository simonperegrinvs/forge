use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgeBundledTemplateInfo {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgeTemplateLockV1 {
    pub(crate) schema: String,
    pub(crate) installed_template_id: String,
    pub(crate) installed_template_version: String,
    pub(crate) installed_at_iso: String,
    pub(crate) installed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateManifestV1 {
    schema: String,
    id: String,
    title: String,
    version: String,
    files: Vec<String>,
    entrypoints: ForgeTemplateEntrypointsV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateEntrypointsV1 {
    phases: String,
    plan_prompt: String,
    execute_prompt: String,
    plan_schema: String,
    state_schema: String,
    required_skills: Vec<String>,
    hooks: ForgeTemplateHooksV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeTemplateHooksV1 {
    post_plan: String,
    pre_execute: String,
    post_step: String,
}

fn is_ascii_lower_alnum(ch: char) -> bool {
    ch.is_ascii_lowercase() || ch.is_ascii_digit()
}

fn validate_template_id(template_id: &str) -> Result<(), String> {
    let id = template_id.trim();
    if id.is_empty() {
        return Err("templateId is required".to_string());
    }
    if id.len() > 64 {
        return Err("templateId is too long".to_string());
    }

    let first = id.chars().next().ok_or("templateId is required")?;
    let last = id.chars().last().ok_or("templateId is required")?;
    if !is_ascii_lower_alnum(first) || !is_ascii_lower_alnum(last) {
        return Err("templateId must start and end with [a-z0-9]".to_string());
    }

    for ch in id.chars() {
        if is_ascii_lower_alnum(ch) || ch == '-' {
            continue;
        }
        return Err("templateId must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$".to_string());
    }

    Ok(())
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
            Component::CurDir => continue,
            Component::Normal(_) => continue,
        }
    }
    Ok(path)
}

fn read_manifest(template_dir: &Path) -> Result<ForgeTemplateManifestV1, String> {
    let manifest_path = template_dir.join("template.json");
    let raw = fs::read_to_string(&manifest_path).map_err(|err| err.to_string())?;
    let parsed: ForgeTemplateManifestV1 = serde_json::from_str(&raw).map_err(|err| err.to_string())?;
    if parsed.schema != "forge-template-v1" {
        return Err(format!(
            "Unsupported template.json schema (expected forge-template-v1): {}",
            parsed.schema
        ));
    }
    Ok(parsed)
}

pub(crate) fn list_bundled_templates_core(
    bundled_templates_root: &Path,
) -> Result<Vec<ForgeBundledTemplateInfo>, String> {
    let mut output = Vec::new();
    let entries = fs::read_dir(bundled_templates_root).map_err(|err| err.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest = match read_manifest(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        output.push(ForgeBundledTemplateInfo {
            id: manifest.id,
            title: manifest.title,
            version: manifest.version,
        });
    }

    output.sort_by(|a, b| a.title.to_ascii_lowercase().cmp(&b.title.to_ascii_lowercase()));
    Ok(output)
}

pub(crate) fn read_installed_template_lock_core(
    workspace_root: &Path,
) -> Result<Option<ForgeTemplateLockV1>, String> {
    let path = workspace_root
        .join(".agent")
        .join("template-lock.json");
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let parsed: ForgeTemplateLockV1 = serde_json::from_str(&raw).map_err(|err| err.to_string())?;
    Ok(Some(parsed))
}

pub(crate) fn read_installed_template_plan_prompt_core(
    workspace_root: &Path,
) -> Result<String, String> {
    let lock = read_installed_template_lock_core(workspace_root)?
        .ok_or_else(|| "No Forge template installed.".to_string())?;

    let template_root = workspace_root
        .join(".agent")
        .join("templates")
        .join(&lock.installed_template_id);
    if !template_root.is_dir() {
        return Err("Installed Forge template folder is missing.".to_string());
    }

    let manifest = read_manifest(&template_root)?;
    let plan_prompt_rel = validate_relative_file_path(&manifest.entrypoints.plan_prompt)?;
    let prompt_path = template_root.join(plan_prompt_rel);
    let raw = fs::read_to_string(&prompt_path).map_err(|err| err.to_string())?;
    Ok(normalize_plan_prompt(&raw))
}

fn normalize_plan_prompt(prompt: &str) -> String {
    let mut out = prompt.to_string();

    // Keep current repo conventions: skills live in `.agents/skills`, not `.agent/skills`.
    out = out.replace(".agent/skills/", ".agents/skills/");

    // Align file output with Forge's nested plan directory structure.
    out = out.replace("plans/<plan_id>.json", "plans/<plan_id>/plan.json");
    out = out.replace("plans/<plan-id>.json", "plans/<plan-id>/plan.json");

    // Plan collaboration mode forbids mutating actions like writing files. Older template versions
    // asked the agent to write plan.json directly. If we detect that, rewrite the output section
    // to be plan-mode compatible (output JSON in <proposed_plan>, export happens later).
    let looks_like_file_write_prompt = out.contains("After writing the file")
        || out.contains("Create `plans/<plan_id>")
        || out.contains("Path: plans/<plan_id>");
    if looks_like_file_write_prompt && out.contains("## Output") {
        let before = out
            .split("## Output")
            .next()
            .unwrap_or("")
            .trim_end_matches('\n');
        out = format!(
            "{before}\n\n## Output\n\n- Choose a `plan_id` slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (max 64 chars).\n- Output the plan as the exact `plan-v1` JSON object inside a single `<proposed_plan>...</proposed_plan>` block.\n- Do NOT write any files yet.\n\nInside the JSON, include:\n\n- `\"$schema\": \"plan-v1\"`\n- `\"id\": \"<plan_id>\"`\n- `\"title\": \"<short title>\"`\n\n## Hard requirement\n\nDo NOT implement the plan. Stop after outputting the `<proposed_plan>` block.\n"
        );
    }

    // Ensure the `@plan` skill is explicitly loaded.
    let mut lines = out.lines();
    let mut seen_first = false;
    let mut first_non_empty: Option<String> = None;
    for line in &mut lines {
        seen_first = true;
        if !line.trim().is_empty() {
            first_non_empty = Some(line.trim().to_string());
            break;
        }
    }

    if seen_first {
        if first_non_empty.as_deref() != Some("@plan") {
            out = format!("@plan\n\n{out}");
        }
    } else {
        out = "@plan\n".to_string();
    }

    out
}

fn copy_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::copy(src, dest).map_err(|err| err.to_string())?;
    Ok(())
}

fn walk_files_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        let meta = fs::metadata(&path).map_err(|err| err.to_string())?;
        if meta.is_dir() {
            walk_files_recursive(&path, out)?;
        } else if meta.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

/// Best-effort: mirror Forge template skills into Codex's repository skill directory.
///
/// Forge templates install skills into `.agent/skills/*` (Forge internal). Codex discovers
/// repo-scoped skills under `.agents/skills/*` (note the plural `.agents`). This sync step bridges
/// those two layouts so skills are visible to Codex (e.g. `skills/list` and `@skill` resolution).
///
/// This does not overwrite existing files in `.agents/skills`.
pub(crate) fn sync_agent_skills_into_repo_agents_dir_core(workspace_root: &Path) -> Result<(), String> {
    let agent_skills_root = workspace_root.join(".agent").join("skills");
    if !agent_skills_root.is_dir() {
        return Ok(());
    }

    let mut files: Vec<PathBuf> = Vec::new();
    walk_files_recursive(&agent_skills_root, &mut files)?;

    let codex_skills_root = workspace_root.join(".agents").join("skills");
    for src_path in files {
        let rel = src_path
            .strip_prefix(&agent_skills_root)
            .map_err(|_| "Invalid .agent/skills file path.".to_string())?;
        let dest_path = codex_skills_root.join(rel);
        if dest_path.exists() {
            let src_contents = fs::read(&src_path).map_err(|err| err.to_string())?;
            let dest_contents = fs::read(&dest_path).map_err(|err| err.to_string())?;
            if src_contents == dest_contents {
                continue;
            }
        }
        copy_file(&src_path, &dest_path)?;
    }

    Ok(())
}

fn ensure_git_info_exclude_contains(workspace_root: &Path, needle: &str) -> Result<(), String> {
    let git_dir = workspace_root.join(".git");
    if !git_dir.is_dir() {
        return Ok(());
    }
    let info_dir = git_dir.join("info");
    fs::create_dir_all(&info_dir).map_err(|err| err.to_string())?;
    let exclude_path = info_dir.join("exclude");
    let existing = fs::read_to_string(&exclude_path).unwrap_or_default();
    if existing.lines().any(|line| line.trim() == needle) {
        return Ok(());
    }
    let mut next = existing;
    if !next.ends_with('\n') && !next.is_empty() {
        next.push('\n');
    }
    next.push_str(needle);
    next.push('\n');
    fs::write(&exclude_path, next).map_err(|err| err.to_string())
}

pub(crate) fn install_bundled_template_core(
    bundled_templates_root: &Path,
    workspace_root: &Path,
    template_id: &str,
) -> Result<ForgeTemplateLockV1, String> {
    validate_template_id(template_id)?;

    let src_template_dir = bundled_templates_root.join(template_id);
    if !src_template_dir.is_dir() {
        return Err(format!("Bundled template not found: {template_id}"));
    }

    let manifest = read_manifest(&src_template_dir)?;
    if manifest.id != template_id {
        return Err("template.json id does not match template folder".to_string());
    }

    let agent_dir = workspace_root.join(".agent");
    let dest_template_root = agent_dir.join("templates").join(template_id);
    fs::create_dir_all(&dest_template_root).map_err(|err| err.to_string())?;

    for rel in &manifest.files {
        let rel_path = validate_relative_file_path(rel)?;
        let src_path = src_template_dir.join(&rel_path);
        if !src_path.is_file() {
            return Err(format!("Template file missing in bundle: {}", rel));
        }
        let dest_path = dest_template_root.join(&rel_path);
        copy_file(&src_path, &dest_path)?;

        // Mirror skills into workspace-local .agent/skills/*
        if let Some(stripped) = rel.strip_prefix("skills/") {
            let skills_dest_path = agent_dir.join("skills").join(stripped);
            copy_file(&src_path, &skills_dest_path)?;
        }
    }

    // Keep .agent out of git by default without modifying .gitignore.
    let _ = ensure_git_info_exclude_contains(workspace_root, ".agent/");

    let installed_at_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let lock = ForgeTemplateLockV1 {
        schema: "forge-template-lock-v1".to_string(),
        installed_template_id: manifest.id,
        installed_template_version: manifest.version,
        installed_at_iso,
        installed_files: manifest.files,
    };

    let lock_path = agent_dir.join("template-lock.json");
    let raw = serde_json::to_string_pretty(&lock).map_err(|err| err.to_string())?;
    fs::write(&lock_path, format!("{raw}\n")).map_err(|err| err.to_string())?;

    Ok(lock)
}

pub(crate) fn uninstall_template_core(workspace_root: &Path) -> Result<(), String> {
    let agent_dir = workspace_root.join(".agent");
    let lock_path = agent_dir.join("template-lock.json");
    let installed_template_id = fs::read_to_string(&lock_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<ForgeTemplateLockV1>(&raw).ok())
        .map(|lock| lock.installed_template_id);

    // Keep it simple for v1: remove the installed template folder recorded in the lock file.
    if let Some(template_id) = installed_template_id {
        let template_root = agent_dir.join("templates").join(template_id);
        let _ = fs::remove_dir_all(&template_root);
    }

    let _ = fs::remove_file(&lock_path);

    Ok(())
}

pub(crate) fn find_bundled_templates_root_near_exe(exe_path: &Path) -> Option<PathBuf> {
    let exe_dir = exe_path.parent()?;
    let candidates = [
        exe_dir.join("resources"),
        exe_dir.to_path_buf(),
        exe_dir.join("..").join("Resources"),
        exe_dir.join("..").join("resources"),
        exe_dir.join("..").join("..").join("resources"),
    ];

    for base in candidates {
        let roots = [
            base.join("forge").join("templates"),
            base.join("resources").join("forge").join("templates"),
        ];
        for root in roots {
            if root.is_dir() {
                return Some(root);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    fn templates_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("forge")
            .join("templates")
    }

    fn temp_bundled_templates_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-forge-bundled-templates-test-{}",
            Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).expect("create temp templates root");
        root
    }

    fn temp_workspace_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-forge-template-test-{}",
            Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).expect("create temp workspace root");
        root
    }

    fn write_template_manifest(template_dir: &Path, manifest: serde_json::Value) {
        let raw = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
        std::fs::write(template_dir.join("template.json"), format!("{raw}\n"))
            .expect("write template.json");
    }

    #[test]
    fn validate_template_id_accepts_valid() {
        assert!(validate_template_id("ralph-loop").is_ok());
        assert!(validate_template_id("a").is_ok());
        assert!(validate_template_id("a1-2b").is_ok());
    }

    #[test]
    fn validate_template_id_rejects_invalid() {
        assert!(validate_template_id("").is_err());
        assert!(validate_template_id(" ").is_err());
        assert!(validate_template_id(&"a".repeat(65)).is_err());
        assert!(validate_template_id("-bad").is_err());
        assert!(validate_template_id("bad-").is_err());
        assert!(validate_template_id("Bad").is_err());
        assert!(validate_template_id("bad_underscore").is_err());
        assert!(validate_template_id("bad/slash").is_err());
    }

    #[test]
    fn validate_relative_file_path_rejects_unsafe() {
        assert!(validate_relative_file_path("../evil").is_err());
        assert!(validate_relative_file_path("/abs").is_err());
        assert!(validate_relative_file_path("").is_err());
        assert!(validate_relative_file_path("./prompts/plan.md").is_ok());
        assert!(validate_relative_file_path("skills/plan/SKILL.md").is_ok());
        assert!(validate_relative_file_path("prompts/plan.md").is_ok());
    }

    #[test]
    fn read_installed_template_lock_returns_none_when_missing() {
        let workspace = temp_workspace_root();
        let lock = read_installed_template_lock_core(&workspace).expect("read lock");
        assert!(lock.is_none());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn ensure_git_info_exclude_is_noop_when_workspace_is_not_a_repo() {
        let workspace = temp_workspace_root();
        ensure_git_info_exclude_contains(&workspace, ".agent/").expect("exclude update");
        assert!(!workspace.join(".git").exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn ensure_git_info_exclude_appends_and_is_idempotent() {
        let workspace = temp_workspace_root();
        let info_dir = workspace.join(".git").join("info");
        std::fs::create_dir_all(&info_dir).expect("create .git/info");
        let exclude_path = info_dir.join("exclude");
        // No trailing newline so we cover the newline insertion branch.
        std::fs::write(&exclude_path, "target/").expect("seed exclude");

        ensure_git_info_exclude_contains(&workspace, ".agent/").expect("exclude update");
        let first = std::fs::read_to_string(&exclude_path).expect("read exclude");
        assert!(first.lines().any(|line| line.trim() == "target/"));
        assert!(first.lines().any(|line| line.trim() == ".agent/"));
        assert!(first.ends_with('\n'));

        ensure_git_info_exclude_contains(&workspace, ".agent/").expect("exclude update again");
        let second = std::fs::read_to_string(&exclude_path).expect("read exclude again");
        assert_eq!(first, second);
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn sync_agent_skills_updates_existing_repo_skill_when_source_changes() {
        let workspace = temp_workspace_root();
        let source_path = workspace.join(".agent").join("skills").join("plan").join("SKILL.md");
        let dest_path = workspace.join(".agents").join("skills").join("plan").join("SKILL.md");

        std::fs::create_dir_all(source_path.parent().expect("source parent"))
            .expect("create source parent");
        std::fs::create_dir_all(dest_path.parent().expect("dest parent"))
            .expect("create dest parent");

        std::fs::write(&source_path, "new skill instructions\n").expect("write source");
        std::fs::write(&dest_path, "stale skill instructions\n").expect("write destination");

        sync_agent_skills_into_repo_agents_dir_core(&workspace).expect("sync skills");

        let dest_contents = std::fs::read_to_string(&dest_path).expect("read destination");
        assert_eq!(dest_contents, "new skill instructions\n");
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn read_manifest_rejects_unknown_schema() {
        let root = temp_bundled_templates_root();
        let template_dir = root.join("bad-schema");
        std::fs::create_dir_all(&template_dir).expect("create template dir");
        write_template_manifest(
            &template_dir,
            json!({
              "schema": "forge-template-v0",
              "id": "bad-schema",
              "title": "Bad Schema",
              "version": "0.0.0",
              "files": [],
              "entrypoints": {
                "phases": "phases.json",
                "planPrompt": "prompts/plan.md",
                "executePrompt": "prompts/execute.md",
                "planSchema": "schemas/plan.schema.json",
                "stateSchema": "schemas/state.schema.json",
                "requiredSkills": [],
                "hooks": {
                  "postPlan": "scripts/post-plan.mjs",
                  "preExecute": "scripts/pre-execute.mjs",
                  "postStep": "scripts/post-step.mjs"
                }
              }
            }),
        );

        let err = read_manifest(&template_dir).unwrap_err();
        assert!(err.contains("Unsupported template.json schema"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn list_bundled_templates_skips_invalid_entries() {
        let root = temp_bundled_templates_root();

        // Non-directory entry should be ignored.
        std::fs::write(root.join("README.txt"), "not a template").expect("write file entry");

        // Invalid directory missing template.json should be ignored.
        std::fs::create_dir_all(root.join("missing-manifest")).expect("create missing dir");

        // Valid templates should be included and sorted by title.
        let alpha = root.join("alpha");
        let beta = root.join("beta");
        std::fs::create_dir_all(&alpha).expect("create alpha");
        std::fs::create_dir_all(&beta).expect("create beta");
        write_template_manifest(
            &alpha,
            json!({
              "schema": "forge-template-v1",
              "id": "alpha",
              "title": "Alpha",
              "version": "1.0.0",
              "files": ["template.json"],
              "entrypoints": {
                "phases": "phases.json",
                "planPrompt": "prompts/plan.md",
                "executePrompt": "prompts/execute.md",
                "planSchema": "schemas/plan.schema.json",
                "stateSchema": "schemas/state.schema.json",
                "requiredSkills": [],
                "hooks": {
                  "postPlan": "scripts/post-plan.mjs",
                  "preExecute": "scripts/pre-execute.mjs",
                  "postStep": "scripts/post-step.mjs"
                }
              }
            }),
        );
        write_template_manifest(
            &beta,
            json!({
              "schema": "forge-template-v1",
              "id": "beta",
              "title": "Beta",
              "version": "1.0.0",
              "files": ["template.json"],
              "entrypoints": {
                "phases": "phases.json",
                "planPrompt": "prompts/plan.md",
                "executePrompt": "prompts/execute.md",
                "planSchema": "schemas/plan.schema.json",
                "stateSchema": "schemas/state.schema.json",
                "requiredSkills": [],
                "hooks": {
                  "postPlan": "scripts/post-plan.mjs",
                  "preExecute": "scripts/pre-execute.mjs",
                  "postStep": "scripts/post-step.mjs"
                }
              }
            }),
        );

        let list = list_bundled_templates_core(&root).expect("list templates");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "alpha");
        assert_eq!(list[1].id, "beta");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn list_bundled_templates_includes_ralph_loop() {
        let root = templates_root();
        let list = list_bundled_templates_core(&root).expect("list bundled templates");
        let ralph = list
            .iter()
            .find(|tpl| tpl.id == "ralph-loop")
            .expect("ralph-loop template present");
        assert_eq!(ralph.title, "Ralph Loop");
        assert_eq!(ralph.version, "0.2.1");
    }

    #[test]
    fn install_and_uninstall_ralph_loop_template() {
        let templates = templates_root();
        let workspace = temp_workspace_root();

        // Create a fake git repo to assert info/exclude behavior.
        std::fs::create_dir_all(workspace.join(".git").join("info"))
            .expect("create .git/info");

        let lock = install_bundled_template_core(&templates, &workspace, "ralph-loop")
            .expect("install template");
        assert_eq!(lock.schema, "forge-template-lock-v1");
        assert_eq!(lock.installed_template_id, "ralph-loop");
        assert_eq!(lock.installed_template_version, "0.2.1");
        assert!(lock.installed_files.contains(&"template.json".to_string()));
        assert!(lock
            .installed_files
            .contains(&"skills/plan/SKILL.md".to_string()));

        // Template files copied.
        assert!(workspace
            .join(".agent")
            .join("templates")
            .join("ralph-loop")
            .join("template.json")
            .is_file());
        assert!(workspace
            .join(".agent")
            .join("templates")
            .join("ralph-loop")
            .join("prompts")
            .join("execute.md")
            .is_file());

        // Skills mirrored.
        assert!(workspace
            .join(".agent")
            .join("skills")
            .join("plan")
            .join("SKILL.md")
            .is_file());

        // Lock file written and parsable.
        let lock_path = workspace.join(".agent").join("template-lock.json");
        assert!(lock_path.is_file());
        let parsed =
            read_installed_template_lock_core(&workspace).expect("read installed template lock");
        assert!(parsed.is_some());
        assert_eq!(
            parsed.unwrap().installed_template_id,
            "ralph-loop".to_string()
        );

        // git exclude updated.
        let exclude_path = workspace.join(".git").join("info").join("exclude");
        let exclude = std::fs::read_to_string(&exclude_path).expect("read exclude");
        assert!(exclude.lines().any(|line| line.trim() == ".agent/"));

        uninstall_template_core(&workspace).expect("uninstall template");
        assert!(!lock_path.exists());
        assert!(
            !workspace
                .join(".agent")
                .join("templates")
                .join("ralph-loop")
                .exists()
        );

        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn uninstall_without_lock_is_ok() {
        let workspace = temp_workspace_root();
        uninstall_template_core(&workspace).expect("uninstall on empty workspace");
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn install_fails_when_manifest_id_mismatches_folder() {
        let bundled = temp_bundled_templates_root();
        let workspace = temp_workspace_root();
        let template_dir = bundled.join("folder-id");
        std::fs::create_dir_all(&template_dir).expect("create template dir");
        write_template_manifest(
            &template_dir,
            json!({
              "schema": "forge-template-v1",
              "id": "different-id",
              "title": "Mismatch",
              "version": "0.0.1",
              "files": ["template.json"],
              "entrypoints": {
                "phases": "phases.json",
                "planPrompt": "prompts/plan.md",
                "executePrompt": "prompts/execute.md",
                "planSchema": "schemas/plan.schema.json",
                "stateSchema": "schemas/state.schema.json",
                "requiredSkills": [],
                "hooks": {
                  "postPlan": "scripts/post-plan.mjs",
                  "preExecute": "scripts/pre-execute.mjs",
                  "postStep": "scripts/post-step.mjs"
                }
              }
            }),
        );

        let err = install_bundled_template_core(&bundled, &workspace, "folder-id").unwrap_err();
        assert!(err.contains("template.json id does not match template folder"));
        let _ = std::fs::remove_dir_all(&bundled);
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn install_fails_when_manifest_file_is_missing_in_bundle() {
        let bundled = temp_bundled_templates_root();
        let workspace = temp_workspace_root();
        let template_dir = bundled.join("missing-file");
        std::fs::create_dir_all(&template_dir).expect("create template dir");
        write_template_manifest(
            &template_dir,
            json!({
              "schema": "forge-template-v1",
              "id": "missing-file",
              "title": "Missing File",
              "version": "0.0.1",
              "files": ["missing.txt"],
              "entrypoints": {
                "phases": "phases.json",
                "planPrompt": "prompts/plan.md",
                "executePrompt": "prompts/execute.md",
                "planSchema": "schemas/plan.schema.json",
                "stateSchema": "schemas/state.schema.json",
                "requiredSkills": [],
                "hooks": {
                  "postPlan": "scripts/post-plan.mjs",
                  "preExecute": "scripts/pre-execute.mjs",
                  "postStep": "scripts/post-step.mjs"
                }
              }
            }),
        );

        let err = install_bundled_template_core(&bundled, &workspace, "missing-file").unwrap_err();
        assert!(err.contains("Template file missing in bundle"));
        let _ = std::fs::remove_dir_all(&bundled);
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn find_bundled_templates_root_near_exe_discovers_resources() {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-forge-exe-root-test-{}",
            Uuid::new_v4()
        ));
        let exe_dir = root.join("bin");
        let exe_path = exe_dir.join("codex-monitor");
        std::fs::create_dir_all(&exe_dir).expect("create exe dir");
        std::fs::write(&exe_path, "").expect("create fake exe");

        let bundled_root = exe_dir.join("resources").join("forge").join("templates");
        std::fs::create_dir_all(&bundled_root).expect("create bundled templates");

        let found = find_bundled_templates_root_near_exe(&exe_path).expect("expected templates");
        assert_eq!(found, bundled_root);

        // Absent candidates should return None.
        let empty_exe_path = root.join("empty").join("codex-monitor");
        std::fs::create_dir_all(empty_exe_path.parent().unwrap()).expect("create empty dir");
        std::fs::write(&empty_exe_path, "").expect("create empty exe");
        assert!(find_bundled_templates_root_near_exe(&empty_exe_path).is_none());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn install_unknown_template_fails() {
        let templates = templates_root();
        let workspace = temp_workspace_root();
        let err =
            install_bundled_template_core(&templates, &workspace, "does-not-exist").unwrap_err();
        assert!(err.contains("Bundled template not found"));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn read_installed_template_plan_prompt_reads_prompt_from_installed_template() {
        let templates = templates_root();
        let workspace = temp_workspace_root();

        install_bundled_template_core(&templates, &workspace, "ralph-loop").expect("install");

        let prompt = read_installed_template_plan_prompt_core(&workspace).expect("read prompt");
        assert!(prompt.contains("# Mode: plan"));
        assert!(prompt.contains("Two-step flow"));

        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn normalize_plan_prompt_rewrites_legacy_file_write_instructions_for_plan_mode() {
        let legacy = r#"
# Mode: plan

## Output

- Choose a `plan_id` slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (max 64 chars).
- Create `plans/<plan_id>.json` (create the `plans/` folder if needed).

After writing the file, respond with:

- `Plan ID: <plan_id>`
- `Path: plans/<plan_id>.json`
"#;

        let normalized = normalize_plan_prompt(legacy);
        assert!(normalized.contains("@plan"));
        assert!(normalized.contains("<proposed_plan>"));
        assert!(normalized.contains("Do NOT write any files yet."));
        assert!(!normalized.contains("After writing the file"));
        assert!(!normalized.contains("Path: plans/<plan_id>.json"));
    }
}
