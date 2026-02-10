@plan

# Mode: plan

You are generating a development plan.

## Two-step flow (important)

This message is only the planning template injection. Do NOT generate a plan yet.

1. First, reply only with: `Ready for your request.`
2. Then wait for the user to describe what they want to build in their next message.
3. Only after you receive the user's request, follow the instructions below to generate the plan.

## Instructions

Read the @plan skill and its reference schemas before generating anything:

1. `.agents/skills/plan/SKILL.md` - rules, field guidelines, sizing advice
2. `.agents/skills/plan/references/plan-schema.md` - full plan.json JSON Schema + example

## Output

- Choose a `plan_id` slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (max 64 chars).
- Output the plan as the exact `plan-v1` JSON object inside a single `<proposed_plan>...</proposed_plan>` block.
- Do NOT write any files yet.

Inside the JSON, include:

- `"$schema": "plan-v1"`
- `"id": "<plan_id>"`
- `"title": "<short title>"`

## Hard requirement

Do NOT implement the plan. Stop after outputting the `<proposed_plan>` block.
