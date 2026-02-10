# pyDBAPI — Overview and Features

**pyDBAPI** is a DB API platform: you manage data sources (PostgreSQL, MySQL, Trino, and databases using PostgreSQL/MySQL protocol such as StarRocks, RisingWave), define API endpoints with **SQL (Jinja2)** or **Python scripts**, and expose them through a **dynamic gateway** with authentication, rate limiting, concurrency limits, and versioning.

This document describes the **end-to-end flow** and **features** of the tool.

---

## End-to-End Flow

### 1. Setup and run

- Clone the repo, copy `.env.example` to `.env`, set `SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`.
- Run with Docker Compose: `docker compose up -d`.
- Open the dashboard (e.g. `http://localhost` or your configured domain) and log in as the superuser.

### 2. Create a data source

- Go to **Connection** (Data Sources).
- Create a data source: choose **PostgreSQL**, **MySQL**, or **Trino**; or use PostgreSQL/MySQL for databases that speak the same protocol (e.g. StarRocks, RisingWave). Set host, port, database, user, password.
- Use **Test** to verify connectivity. The app uses a connection pool and health checks for external DBs.

### 3. Organize APIs: modules and API assignments

- **Modules** group API endpoints under a common path prefix (e.g. `sales`, `reporting`).
- **API Assignments** define each endpoint:
  - **Engine**: SQL (Jinja2 template) or Python script (RestrictedPython sandbox).
  - **DataSource**: which DB to use (for SQL) or which DB is available in script context.
  - **Path**: URL path under the module (e.g. `users`, `users/{id}`). Supports path parameters.
  - **HTTP method**: GET, POST, PUT, PATCH, DELETE.
  - **Parameters**: name, location (query / header / body), type, required, validation (regex or Python).
  - **Content**: SQL template or Python script body. For SQL you can use **macro definitions** (reusable snippets).
- **Publish** an API assignment to make it live on the gateway. You can use **version commits** to track changes (api-assignments and macro-defs).

### 4. Control access: groups and clients

- **Groups**: authorization groups; an API assignment can be restricted to certain groups (optional).
- **Clients**: applications that call the gateway. Each client has `client_id` and `client_secret`. You can set **max concurrent** requests per client; rate limits can be global or per client (Redis or in-memory).

### 5. Call the gateway

- **Obtain a token**: `POST /token/generate` with `client_id` and `client_secret` → returns a JWT.
- **Call the API**:  
  `GET|POST|PUT|PATCH|DELETE /{module}/{path}`  
  e.g. `GET /sales/users?status=active`  
  (full URL = your backend base URL + `/{module}/{path}`; the gateway route has no `/api` prefix.)  
  Use header `Authorization: Bearer <token>` for private APIs.
- **Parameters**: path params from URL; query from `?key=value`; body from JSON or form; headers from HTTP headers. When the API has a **params definition**, each param is taken only from its configured location (query, body, or header). Merged priority: path > query > body > header. Naming can be forced to camelCase via `?naming=camel` or `X-Response-Naming: camel`.
- **Response**: JSON (and optionally naming convention). Access is logged (AccessRecord) when enabled.

### 6. Admin and security

- **Users and roles**: create users, assign roles, manage permissions (Superset-style permission model). UI: Admin (users, roles), Security (roles, permissions).
- **Access logs**: view recent access to APIs (System > Access logs) when the feature is enabled.

---

## Features

### Data sources

- **Supported databases**: **PostgreSQL** (psycopg), **MySQL** (pymysql), **Trino** (trino). Databases that use a PostgreSQL or MySQL-compatible protocol are supported via the corresponding type (e.g. **StarRocks**, **RisingWave**).
- **Connection pool**: configurable pool size, connect timeout, statement timeout.
- **Health checks**: test connection when creating/editing; used by the pool for reliability.
- **Pre-test**: validate connection settings before saving (e.g. from UI).

### API definitions (API Assignments)

- **SQL engine (Jinja2)**:
  - Template rendering with parameters (query, header, body).
  - Custom filters: `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `sql_in_list`, etc.
  - Custom tags: `where`, `set` for safe dynamic SQL fragments.
  - Parameter parsing and type handling; validation (regex or Python) before execution.
- **Script engine (Python)**:
  - **RestrictedPython** sandbox: no arbitrary `import`; only whitelisted modules (e.g. `pandas`, `numpy`) via `SCRIPT_EXTRA_MODULES`.
  - **Context**: `db`, `http`, `cache`, `env`, `log`, `req`, `tx`, `ds` (request params, transaction, datasource info).
  - **Timeout**: `SCRIPT_EXEC_TIMEOUT` (SIGALRM on Unix; not on Windows).
- **Parameters**: name, location (query / header / body), data type, required, validation (regex or Python). Merged and passed to SQL as template variables or to script as `req`.
- **Result transform**: optional post-processing of the result (e.g. rename keys, shape) before returning.
- **Macro definitions**: reusable SQL/text snippets referenced in SQL templates.
- **Version commits**: track versions of api-assignments and macro-defs for audit and rollback.

### Gateway

- **Dynamic routing**: `/{module}/{path}` (no `/api` prefix) — module and path resolved to a single API assignment (path can include placeholders, e.g. `users/{id}`).
- **Flow**: resolve → (firewall) → auth (if private) → concurrent limit → rate limit → parse params → run (SQL or script) → format response → write access record.
- **Concurrent limit**: max concurrent requests per client (or per IP for public APIs). Checked before rate limit; slot is released in all cases (success, 429, 5xx). Redis (shared across workers) or in-memory fallback; per-client override via `app_client.max_concurrent`; global default `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT`.
- **Rate limiting**: sliding window, configurable per minute; Redis (preferred) or in-memory. See `FLOW_CONTROL_RATE_LIMIT_*`.
- **Firewall**: IP-based firewall is **disabled** in the current build (all IPs allowed); model exists for future use.
- **Request/response**: JSON and form body; query and path params; optional camelCase response via `?naming=camel` or header.

### Authentication and authorization

- **Gateway auth**: JWT only. Token from `POST /api/token/generate` with `client_id` and `client_secret`. Bearer token required for private APIs.
- **Dashboard auth**: login, signup, password recovery (email), secure password hashing. Role-based access to Admin, Security, API Dev, Connection, System.

### Admin UI (React frontend)

- **Tech**: TypeScript, Vite, Tailwind, shadcn/ui; auto-generated OpenAPI client; dark mode.
- **Sections**:
  - **Dashboard**: stats, recent access, recent commits.
  - **Connection**: data sources CRUD, test, pre-test.
  - **API Dev**: modules, API assignments (APIs), macro definitions; create/edit, publish, debug (run with JSON params).
  - **API Repository**: version commits and browsing.
  - **System**: groups, clients (CRUD, regenerate secret); access logs.
  - **Admin**: users, roles; assign roles to users; edit role permissions (Superset-style).
  - **Security**: roles list and management.
- **Permissions**: route and feature visibility driven by backend permissions.

### Operations and deployment

- **Docker Compose**: backend, frontend, PostgreSQL, Redis (optional), Traefik for HTTPS (Let’s Encrypt). See [deployment.md](../deployment.md) and [development.md](../development.md).
- **Tests**: Pytest; CI/CD with GitHub Actions.

### Configuration (main environment variables)

| Variable | Purpose |
| -------- | ------- |
| `SECRET_KEY` | Signing key for tokens (required). |
| `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD` | App DB and first admin (required). |
| `REDIS_URL` / `REDIS_HOST`, `REDIS_PORT`, etc. | Redis for cache, rate limit, concurrent limit (optional; in-memory fallback). |
| `FLOW_CONTROL_RATE_LIMIT_ENABLED`, `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE` | Gateway rate limiting. |
| `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` | Default max concurrent requests per client (0 = no limit). |
| `SCRIPT_EXEC_TIMEOUT` | Script engine timeout in seconds (Unix only; SIGALRM). |
| `SCRIPT_EXTRA_MODULES` | Comma-separated whitelist of modules for scripts (e.g. `pandas,numpy`). |
| `GATEWAY_ACCESS_LOG_BODY` | Whether to store request body in access records. |
| `EXTERNAL_DB_POOL_SIZE`, `EXTERNAL_DB_STATEMENT_TIMEOUT` | Data source connection pool. |

### Disabled or planned

- **IP Firewall**: gateway always allows all IPs; no firewall CRUD API or UI. Model exists for future use.
- **Alarm**: model `UnifyAlarm` exists; no API routes or UI yet.

---

## See also

- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture, Mermaid diagrams, data model.
- [docs/TECHNICAL.md](./TECHNICAL.md) — Technical logic: gateway flow, resolution, parameters, concurrent/rate limits, SQL and script engines.
- [docs/ENV_REFERENCE.md](./ENV_REFERENCE.md) — Complete environment variable reference.
- [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Common issues, debugging, rollback procedures.
- [deployment.md](../deployment.md) — Deploy with Docker Compose and Traefik.
- [development.md](../development.md) — Local development and Docker setup.
- [backend/README.md](../backend/README.md), [frontend/README.md](../frontend/README.md) — Backend and frontend development.
