# Plan Schema Reference

Full JSON Schema for `plan.json` files. Read this before generating a plan.

## Complete JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Plan",
  "description": "A structured development plan for agentic coding orchestrators",
  "type": "object",
  "required": ["$schema", "id", "goal", "context", "phases", "tasks"],
  "additionalProperties": false,
  "properties": {
    "$schema": {
      "type": "string",
      "const": "plan-v1",
      "description": "Schema version identifier"
    },
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
      "maxLength": 64,
      "description": "URL-safe slug identifying this plan"
    },
    "title": {
      "type": "string",
      "minLength": 3,
      "maxLength": 80,
      "description": "Short friendly label for UI/menus (keep under ~60 chars)"
    },
    "goal": {
      "type": "string",
      "minLength": 10,
      "maxLength": 500,
      "description": "One sentence describing the desired end state"
    },
    "context": {
      "type": "object",
      "required": ["tech_stack", "constraints"],
      "additionalProperties": false,
      "properties": {
        "tech_stack": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "description": "Technologies to use"
        },
        "constraints": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Hard rules and boundaries"
        },
        "references": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["path", "description"],
            "additionalProperties": false,
            "properties": {
              "path": { "type": "string" },
              "description": { "type": "string" }
            }
          },
          "description": "Files the LLM should read for context"
        }
      }
    },
    "phases": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "title", "description"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^phase-[0-9]+$"
          },
          "title": {
            "type": "string",
            "maxLength": 50
          },
          "description": {
            "type": "string",
            "maxLength": 200
          }
        }
      }
    },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "phase", "name", "description", "depends_on", "files", "verification"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^task-[0-9]+-[0-9]+$",
            "description": "Format: task-{phase_number}-{sequence}"
          },
          "phase": {
            "type": "string",
            "pattern": "^phase-[0-9]+$",
            "description": "References a phase id"
          },
          "name": {
            "type": "string",
            "maxLength": 80,
            "description": "Short display name for UI"
          },
          "description": {
            "type": "string",
            "minLength": 20,
            "description": "Detailed implementation instructions"
          },
          "depends_on": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^task-[0-9]+-[0-9]+$"
            },
            "description": "Task IDs that must complete before this task can start"
          },
          "files": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "description": "File paths this task will create or modify"
          },
          "verification": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "description": "Concrete, testable assertions for completion"
          }
        }
      }
    }
  }
}
```

## Validation rules (beyond JSON Schema)

The orchestrator should enforce these rules programmatically after the LLM generates a plan:

### Referential integrity
- Every task's `phase` must match an existing phase `id`
- Every entry in `depends_on` must match an existing task `id`
- No task can depend on itself

### Dependency graph
- The dependency graph must be a DAG (no cycles)
- At least one task must have `"depends_on": []` (an entry point)

### ID consistency
- Task IDs must use the format `task-{phase_number}-{sequence}`
- The phase number in the task ID should match the referenced phase
  - e.g., `task-2-1` should have `"phase": "phase-2"`
- Phase IDs must be sequential: `phase-1`, `phase-2`, etc.
- Task sequences within a phase should be sequential: `task-2-1`, `task-2-2`, etc.

### Content quality checks
- `description` should contain concrete specifics (endpoint paths, field names, config values)
- `verification` items should be testable (contain expected status codes, return values, observable behaviors)
- `files` should not be empty - every task must touch at least one file

## Complete example

```json
{
  "$schema": "plan-v1",
  "id": "task-api",
  "title": "Tasks API",
  "goal": "A REST API with JWT auth, task CRUD with pagination, and WebSocket notifications, fully tested with OpenAPI docs",
  "context": {
    "tech_stack": ["Node.js", "TypeScript", "Express", "PostgreSQL", "Socket.io", "JWT"],
    "constraints": [
      "Must use existing PostgreSQL schema in db/schema.sql",
      "Auth must support email/password and OAuth2 Google login",
      "All endpoints must have OpenAPI documentation",
      "Minimum 80% test coverage on business logic",
      "Do NOT add a frontend - API only"
    ],
    "references": [
      { "path": "db/schema.sql", "description": "Existing database schema - do not modify, extend only" },
      { "path": "src/middleware/auth.ts", "description": "Existing auth middleware skeleton to build upon" },
      { "path": "docs/api-contract.md", "description": "Agreed API contract with frontend team" }
    ]
  },
  "phases": [
    {
      "id": "phase-1",
      "title": "Foundation",
      "description": "Project setup, database connection, and base configuration"
    },
    {
      "id": "phase-2",
      "title": "Authentication",
      "description": "JWT auth system with email/password and Google OAuth2"
    },
    {
      "id": "phase-3",
      "title": "Core Features",
      "description": "Task CRUD endpoints and real-time notifications"
    },
    {
      "id": "phase-4",
      "title": "Quality & Docs",
      "description": "Integration tests and OpenAPI documentation"
    }
  ],
  "tasks": [
    {
      "id": "task-1-1",
      "phase": "phase-1",
      "name": "Project setup and database connection",
      "description": "Initialize Express+TypeScript app with tsconfig (strict mode). Configure dotenv for DATABASE_URL, PORT, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET env vars. Set up PostgreSQL connection pool using pg library with max 20 connections. Create GET /health endpoint returning { status: 'ok', db: boolean } where db reflects a successful SELECT 1 query.",
      "depends_on": [],
      "files": ["src/index.ts", "src/db.ts", "src/routes/health.ts", "tsconfig.json", ".env.example"],
      "verification": [
        "npm run build compiles without errors",
        "GET /health returns 200 with { status: 'ok', db: true } when DB is connected",
        "GET /health returns 200 with { status: 'ok', db: false } when DB is unreachable",
        "App reads PORT from environment variable, defaults to 3000"
      ]
    },
    {
      "id": "task-1-2",
      "phase": "phase-1",
      "name": "Error handling middleware",
      "description": "Create centralized error handling middleware. Define AppError class extending Error with statusCode and isOperational fields. Global error handler catches all errors, logs stack traces for 5xx, returns { error: string, code: string } to client. Add request ID middleware using uuid v4, attach to req and include in error responses.",
      "depends_on": [],
      "files": ["src/middleware/error-handler.ts", "src/errors/app-error.ts", "src/middleware/request-id.ts"],
      "verification": [
        "Throwing AppError(404, 'Not found') returns { error: 'Not found', code: 'NOT_FOUND', requestId: '...' }",
        "Unhandled errors return 500 with generic message (no stack leak)",
        "Every response includes x-request-id header"
      ]
    },
    {
      "id": "task-2-1",
      "phase": "phase-2",
      "name": "JWT authentication endpoints",
      "description": "Implement POST /auth/register accepting { email, password, name }. Validate email format and password length >= 8. Hash password with bcrypt cost 12. Store in users table. Return { accessToken, refreshToken } as httpOnly cookies. Implement POST /auth/login with same response format. Access tokens: JWT with { userId, email } payload, 15min expiry signed with ACCESS_TOKEN_SECRET. Refresh tokens: opaque UUID stored in refresh_tokens table, 7-day expiry. POST /auth/refresh rotates refresh token (invalidate old, issue new pair). Rate limit login: 5 attempts per email per 15 minutes.",
      "depends_on": ["task-1-1", "task-1-2"],
      "files": ["src/routes/auth.ts", "src/services/auth.service.ts", "src/types/auth.ts"],
      "verification": [
        "POST /auth/register with valid data returns 201 with Set-Cookie headers",
        "POST /auth/register with duplicate email returns 409",
        "POST /auth/register with password < 8 chars returns 400",
        "POST /auth/login with valid credentials returns 200 with tokens",
        "POST /auth/login with wrong password returns 401",
        "POST /auth/refresh with valid refresh token returns new token pair",
        "POST /auth/refresh invalidates the old refresh token",
        "6th login attempt for same email within 15 minutes returns 429"
      ]
    },
    {
      "id": "task-2-2",
      "phase": "phase-2",
      "name": "Google OAuth2 integration",
      "description": "Add Google OAuth2 using passport-google-oauth20. Configure with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars. GET /auth/google redirects to Google consent screen requesting email and profile scopes. GET /auth/google/callback handles the response: if a user with matching email exists, link the Google ID to their account; if not, create a new user. Return same token format as /auth/login. Store google_id in users table (nullable column).",
      "depends_on": ["task-2-1"],
      "files": ["src/routes/auth-google.ts", "src/services/oauth.service.ts", "src/config/passport.ts"],
      "verification": [
        "GET /auth/google returns 302 redirect to accounts.google.com",
        "Callback with new Google user creates user record and returns tokens",
        "Callback with existing email links Google ID without creating duplicate",
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.example"
      ]
    },
    {
      "id": "task-3-1",
      "phase": "phase-3",
      "name": "Task CRUD endpoints",
      "description": "Implement authenticated CRUD for /tasks. POST /tasks creates a task with { title, description, status, assigneeId }. GET /tasks returns paginated list (default 20 per page) with ?page, ?status, ?assignee query filters, sorted by createdAt desc. GET /tasks/:id returns single task. PUT /tasks/:id updates task fields. DELETE /tasks/:id soft-deletes (sets deletedAt). All routes require valid access token via auth middleware. Users can only see/modify tasks they created or are assigned to.",
      "depends_on": ["task-2-1"],
      "files": ["src/routes/tasks.ts", "src/services/task.service.ts", "src/types/task.ts"],
      "verification": [
        "POST /tasks without auth returns 401",
        "POST /tasks with auth creates task and returns 201",
        "GET /tasks returns paginated array with total count in response",
        "GET /tasks?status=done filters by status",
        "GET /tasks?page=2 returns second page",
        "PUT /tasks/:id updates fields and returns 200",
        "DELETE /tasks/:id sets deletedAt, subsequent GET returns 404",
        "User A cannot GET/PUT/DELETE tasks owned by User B"
      ]
    },
    {
      "id": "task-3-2",
      "phase": "phase-3",
      "name": "WebSocket notifications",
      "description": "Set up Socket.io server attached to the Express http server. Authenticate WebSocket connections by extracting JWT from the handshake auth header. On task.created, task.updated, and task.assigned events, broadcast to relevant users (creator and assignee). Event payload: { type, taskId, taskTitle, actorId, timestamp }. Store notification in notifications table with userId, type, payload, readAt (nullable). Add GET /notifications for authenticated user with ?unread=true filter.",
      "depends_on": ["task-3-1"],
      "files": ["src/websocket/server.ts", "src/websocket/handlers.ts", "src/services/notification.service.ts", "src/routes/notifications.ts"],
      "verification": [
        "WebSocket connection without valid JWT is rejected",
        "Creating a task emits task.created to the creator's socket",
        "Assigning a task emits task.assigned to the assignee's socket",
        "Notifications are persisted in the notifications table",
        "GET /notifications returns user's notifications",
        "GET /notifications?unread=true filters to readAt IS NULL"
      ]
    },
    {
      "id": "task-4-1",
      "phase": "phase-4",
      "name": "Integration tests",
      "description": "Write Jest integration tests using supertest. Set up test database with docker-compose.test.yml running PostgreSQL. Before each test suite: run migrations, seed test data. After each suite: truncate all tables. Cover: full auth flow (register -> login -> refresh -> access protected route), task CRUD with auth, pagination edge cases (empty results, last page), WebSocket connection and event delivery. Aim for 80%+ coverage on src/services/ and src/routes/.",
      "depends_on": ["task-2-2", "task-3-2"],
      "files": ["tests/auth.test.ts", "tests/tasks.test.ts", "tests/notifications.test.ts", "tests/setup.ts", "docker-compose.test.yml", "jest.config.ts"],
      "verification": [
        "npm test runs all tests and exits 0",
        "Auth tests cover register, login, refresh, and token expiry",
        "Task tests cover CRUD, pagination, filtering, and authorization",
        "Coverage report shows >= 80% on src/services/ and src/routes/"
      ]
    },
    {
      "id": "task-4-2",
      "phase": "phase-4",
      "name": "OpenAPI documentation",
      "description": "Add swagger-jsdoc and swagger-ui-express. Write JSDoc annotations on all route handlers with @openapi tags. Include request/response schemas, auth requirements (bearerAuth), error responses, and query parameter descriptions. Serve Swagger UI at GET /docs. Generate openapi.json at build time via a script in package.json.",
      "depends_on": ["task-3-2"],
      "files": ["src/config/swagger.ts", "src/routes/*.ts", "scripts/generate-openapi.ts"],
      "verification": [
        "GET /docs serves Swagger UI page",
        "Every endpoint appears in the documentation",
        "npm run generate:openapi produces a valid openapi.json",
        "Auth endpoints show request/response body schemas",
        "Protected endpoints show bearerAuth requirement"
      ]
    }
  ]
}
```
