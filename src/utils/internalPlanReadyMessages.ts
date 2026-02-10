const PLAN_READY_TAG_PREFIX = "[[cm_plan_ready:";

export function isPlanReadyTaggedMessage(text: string) {
  return text.trimStart().startsWith(PLAN_READY_TAG_PREFIX);
}

export function makePlanReadyAcceptMessage() {
  return `${PLAN_READY_TAG_PREFIX}accept]] Implement this plan.`;
}

export function makePlanReadyExportMessage() {
  return `${PLAN_READY_TAG_PREFIX}export]] Convert the plan above into a plan-v1 plan.json and save it.\n\nRules:\n- Use the plan-v1 schema in .agents/skills/plan/references/plan-schema.md.\n- Choose a plan_id slug matching ^[a-z0-9][a-z0-9-]*[a-z0-9]$ (max 64 chars).\n- Include a short, friendly "title" for UI/menus (aim for <= 60 chars).\n- Write plans/<plan_id>/plan.json (create the folder if needed).\n- Do NOT implement the plan tasks. Only write the plan file.\n\nAfter writing the file, reply with:\n- Plan ID: <plan_id>\n- Path: plans/<plan_id>/plan.json`;
}

export function makePlanReadyChangesMessage(changes: string) {
  const trimmed = changes.trim();
  return `${PLAN_READY_TAG_PREFIX}changes]] Update the plan with these changes:\n\n${trimmed}`;
}
