import fs from "node:fs/promises";

const REQUIRED_STRING_FIELDS = [
  "workspaceRoot",
  "templateRoot",
  "planId",
  "planDir",
  "planPath",
  "statePath",
  "progressPath",
  "generatedPlanMdPath",
  "generatedExecutePromptPath",
  "todayIso",
];

export async function readContext(contextPath) {
  const raw = await fs.readFile(contextPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in context file: ${contextPath} (${message})`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Context must be a JSON object: ${contextPath}`);
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = parsed[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Context missing required string field: ${field}`);
    }
  }

  return parsed;
}

