---
name: plan
description: |
  How to create structured development plans for agentic coding orchestrators.
  Use this skill whenever asked to create a plan, break down a feature, generate
  a task list, or prepare work for an AI agent loop. Triggers: "plan this",
  "break this down", "create tasks for", or any reference to spec-driven
  development, ralph loop, or agentic task execution.
---

# @plan -- Create a Development Plan

Generate a structured `plan.json` that an orchestrator will feed to stateless
LLM iterations, one task at a time.

## What you produce

This skill supports two outputs depending on collaboration mode:

- In **Plan** collaboration mode: output the plan as the exact `plan-v1` JSON object inside a single `<proposed_plan>...</proposed_plan>` block. Do not write files.
- In **Default** (or any non-Plan) mode: write the plan file to `plans/<plan-id>/plan.json` (create the folder if needed).

The orchestrator initializes state/progress files programmatically.

## Read the schema first

Before generating anything, read:
- `references/plan-schema.md` -- Full plan.json JSON Schema + complete example

## plan.json structure (summary)

```json
{
  "$schema": "plan-v1",
  "id": "<plan-id>",
  "title": "Short UI title (<= 60 chars)",
  "goal": "One sentence - the desired end state",
  "context": {
    "tech_stack": ["Node.js", "Express"],
    "constraints": ["Must use existing schema in db/schema.sql"],
    "references": [{ "path": "db/schema.sql", "description": "Existing DB schema" }]
  },
  "phases": [
    { "id": "phase-1", "title": "Foundation", "description": "Setup and config" }
  ],
  "tasks": [
    {
      "id": "task-1-1",
      "phase": "phase-1",
      "name": "Project setup",
      "description": "Detailed implementation instructions...",
      "depends_on": [],
      "files": ["src/index.ts"],
      "verification": ["GET /health returns 200"]
    }
  ]
}
```

## Key rules

### IDs
- Phase IDs: `phase-1`, `phase-2`, etc.
- Task IDs: `task-{phase}-{seq}` -- e.g. `task-2-1` is first task in phase 2
- Plan ID: URL-safe slug -- e.g. `auth-system`, `notification-service`

### Phases
- 3-5 logical groupings. For UI display, not execution order.
- The orchestrator uses `depends_on` to determine execution order.

### Title
- Add a short, friendly `title` for UI/menus (aim for <= 60 chars).
- Keep `goal` longer and more descriptive (the desired end state).

### Tasks
- Each completable in one LLM iteration (~5-30 min agent work)
- Too big: >5 files, >200 lines new code, mixes unrelated concerns
- Too small: single line change, no meaningful verification

### Dependencies
- `depends_on` lists direct dependencies only (task IDs)
- At least one task with `"depends_on": []` (entry point)
- No circular dependencies
- Minimize chain length -- long chains serialize execution

### Descriptions -- be extremely specific

Bad:
```
"Add authentication to the API"
```

Good:
```
"Implement POST /auth/login accepting { email, password }. Validate against users
table using bcrypt.compare(). On success, return { accessToken, refreshToken } as
httpOnly cookies. Access token: JWT with { userId, email } payload, 15min expiry,
signed with ACCESS_TOKEN_SECRET. On failure, return 401."
```

### Verification -- concrete, testable assertions

Bad: `"Auth works correctly"`
Good: `"POST /auth/login with valid credentials returns 200 with Set-Cookie headers"`

### Constraints -- include what NOT to build

Good constraints:
- "Do NOT add a frontend -- API only"
- "Do NOT modify existing tables, extend only"
- "Max 3 external dependencies"
