# Overview

pyDBAPI is a database API platform. You manage data sources, define API endpoints with SQL or Python, and expose them through a dynamic gateway with auth, rate limiting, concurrency control, and versioning.

---

## End-to-End Flow

### 1. Setup

- Clone the repo, copy `.env.example` to `.env`, set required variables (`SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`).
- Run `docker compose up -d`. Open `http://localhost` and log in with the superuser credentials.

### 2. Create a Data Source

- Navigate to **Connection** (Data Sources).
- Add a data source: **PostgreSQL**, **MySQL**, or **Trino**. Databases using compatible protocols (e.g. StarRocks, RisingWave) work via the corresponding type.
- Configure host, port, database, user, and password. Use **Test** to verify connectivity.

### 3. Define APIs

- **Modules** group endpoints under a common prefix for organization and permissions (the module is not part of the gateway URL).
- **API Assignments** define each endpoint:
  - **Engine:** SQL (Jinja2 template) or Script (RestrictedPython sandbox).
  - **Data Source:** which database to query.
  - **Path:** URL path (e.g. `users`, `users/{id}`). Supports path parameters. Must be globally unique per HTTP method.
  - **HTTP Method:** GET, POST, PUT, PATCH, DELETE.
  - **Parameters:** name, location (query / header / body), type, required flag, validation (regex or Python script).
  - **Content:** SQL template or Python script body. SQL supports **macro definitions** (reusable snippets).
- **Publish** an assignment to make it live on the gateway. **Version commits** track changes for audit and rollback.

### 4. Control Access

- **Groups:** Authorization groups. An API can be restricted to certain groups.
- **Clients:** Applications that call the gateway. Each client has a `client_id` and `client_secret`, with configurable rate limits, max concurrent requests, and optional per-client JWT expiry (`token_expire_seconds`).

### 5. Call the Gateway

**Public APIs** — call directly, no token needed:

```bash
curl "http://localhost/api/users?limit=10&q=john"
```

**Private APIs** — authenticate with a client token first:

```bash
# Step 1: Get a JWT (using client_id and client_secret)
curl -X POST http://localhost/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "my-app", "client_secret": "secret123"}'
# → {"access_token": "eyJ...", "token_type": "bearer"}

# Step 2: Call the API with the token
curl -H "Authorization: Bearer eyJ..." "http://localhost/api/orders?status=1"
```

**Parameters** are sourced from four locations:

| Source | Example | Notes |
|--------|---------|-------|
| **Path** | `/api/users/123` (from path pattern `users/{id}`) | Always takes priority |
| **Query** | `?limit=10&q=search` | GET and POST |
| **Body** | JSON `{"filters": {"min": 10}}` or form data | POST/PUT/PATCH |
| **Header** | `X-User-Id: abc` | Only when parameter definition specifies `location: header` |

When parameter definitions exist, each param is taken only from its configured location. Priority: path > query > body > header.

**Response** — standard JSON envelope:

```json
{"success": true, "message": null, "data": [...]}
```

Optional camelCase response keys: add `?naming=camel` or header `X-Response-Naming: camel`.

### 6. Administration

- **Users and Roles:** Create users (username-based login), assign roles (Admin, Dev, Viewer, or custom), manage granular permissions.
- **Access Logs:** View gateway request history when enabled.

---

## Features

### Data Sources

- **Databases:** PostgreSQL (psycopg), MySQL (pymysql), Trino (trino). Compatible-protocol databases (StarRocks, RisingWave) supported via the corresponding type.
- **Connection pool:** Configurable pool size, connect timeout, statement timeout.
- **Health checks:** Test connectivity on create/edit.

### API Definitions

#### SQL Engine (Jinja2)

- Template rendering with parameters from query, header, body, and path.
- Custom filters: `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `in_list`, `sql_like`, `sql_like_start`, `sql_like_end`, `json`.
- Custom tags: `{% where %}` for conditional WHERE clauses (auto-strips leading AND/OR), `{% set %}` for local variables.
- **Multi-statement SQL:** Separate statements with `;`. Each SELECT returns its own result set. Useful for data + count queries:
  ```sql
  SELECT * FROM items WHERE status = {{ status | sql_int }} LIMIT 20;
  SELECT COUNT(*) AS total FROM items WHERE status = {{ status | sql_int }};
  ```
- Size limits: `SQL_TEMPLATE_MAX_SIZE` (template source), `SQL_RENDERED_MAX_SIZE` (rendered output).

#### Script Engine (Python)

- **RestrictedPython** sandbox: no arbitrary imports. Only whitelisted modules via `SCRIPT_EXTRA_MODULES`.
- **Context objects:** `db` (query/query_one/execute), `http` (get/post/put/delete), `cache` (get/set/delete/exists/incr/decr), `req` (merged params dict), `tx` (begin/commit/rollback), `ds` (datasource metadata), `env` (get/get_int/get_bool), `log` (info/warning/error/debug).
- **Timeout:** `SCRIPT_EXEC_TIMEOUT` (thread-based, all platforms).
- **HTTP whitelist:** Optional `SCRIPT_HTTP_ALLOWED_HOSTS` to restrict outbound HTTP from scripts.

#### Common

- **Parameters:** Typed (string, integer, number, boolean, array, object) with automatic coercion. Required flag, default values, regex or Python script validation.
- **Result transform:** Optional Python post-processing script applied to results before returning. Useful for reshaping multi-statement SQL results.
- **Macro definitions:** Reusable snippets scoped per module. Jinja2 macros are prepended to SQL content; Python macros are prepended to script content, parameter validation, and result transform scripts.
- **Versioning:** Version commits create snapshots of API content, parameters, validations, and transforms. Publish a specific version to make it live; roll back by publishing an older version.

### Gateway

- **Dynamic routing:** `/api/{path}` — path + method are globally unique. Module is organizational only.
- **Pipeline:** Firewall -> Resolve -> Auth -> Concurrent limit -> Rate limit -> Parse params -> Execute -> Format response -> Access log.
- **Concurrent limit:** Max in-flight requests per client or IP. Redis (shared) or in-memory fallback. Per-client override via `max_concurrent`.
- **Rate limiting:** Sliding window per minute. Redis or in-memory. Per-API and per-client overrides.
- **Max response rows:** `GATEWAY_MAX_RESPONSE_ROWS` caps the number of rows returned (default 10,000).
- **Firewall:** IP-based (currently always-allow; model exists for future use).

### Authentication

- **Dashboard:** Username + password login -> JWT (configurable lifetime via `ACCESS_TOKEN_EXPIRE_MINUTES`). Role-based access control.
- **Gateway:** `client_id` + `client_secret` -> JWT (configurable via `GATEWAY_JWT_EXPIRE_SECONDS` globally, or `token_expire_seconds` per client). Private APIs require `Authorization: Bearer <token>`.
- **Auth rate limits:** Separate rate limits for login, password recovery, reset, and token generation endpoints.

### Admin UI

- **Tech:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui. Auto-generated OpenAPI client. Dark mode.
- **Sections:**
  - **Dashboard:** Stats, recent access, recent commits.
  - **Connection:** Data source CRUD with test.
  - **API Dev:** Modules, API assignments, macro definitions. Create/edit, publish, debug.
  - **API Repository:** Version commit history.
  - **System:** Groups, clients, access logs.
  - **Admin:** Users, roles, permission management.
- **Permissions:** Route and feature visibility driven by the backend RBAC system.

### Operations

- **Docker Compose:** Single app container (Nginx + FastAPI), PostgreSQL, Redis. Optional: StarRocks, Trino.
- **Kubernetes:** Kind-based dev cluster (see `k8s/k8s.md`).
- **CI/CD:** GitHub Actions with self-hosted runners for staging/production.
- **Monitoring:** Optional Sentry integration via `SENTRY_DSN`.

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture, diagrams, data model
- [TECHNICAL.md](./TECHNICAL.md) — Gateway internals, engines, parameters, limits
- [ENV_REFERENCE.md](./ENV_REFERENCE.md) — Complete environment variable reference
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Common issues and solutions
