# Migration Plan: SQLREST (Java) → Python + React

> Plan to migrate SQLREST into the pydbapi stack (FastAPI + React).  
> **Initial database support: PostgreSQL and MySQL only.** Other databases (Oracle, SQL Server, ClickHouse, etc.) will be added in a later phase.

---

## Overview

| Aspect | SQLREST (Source) | PyDBAPI (Target) |
|--------|------------------|------------------|
| Backend | Java Spring Boot + MyBatis | FastAPI + SQLModel |
| Frontend | Vue.js 2 + Element UI | React + TypeScript + shadcn/ui |
| Database | MySQL/PostgreSQL | PostgreSQL (app DB) |
| Auth | Token-based | JWT |
| Architecture | 3-tier (Gateway, Executor, Manager) | Monolithic backend + SPA frontend |

---

## PHASE 1: Database Models & Core Infrastructure

### Task 1.1: Database Models

| Java Entity | Python SQLModel | Description |
|-------------|-----------------|-------------|
| `DataSourceEntity` | `DataSource` | Connection management |
| `ApiAssignmentEntity` | `ApiAssignment` | API endpoint definition |
| `ApiModuleEntity` | `ApiModule` | Module grouping APIs |
| `ApiGroupEntity` | `ApiGroup` | Authorization group |
| `AppClientEntity` | `AppClient` | Client application |
| ~~`SystemUserEntity`~~ | — | *Dropped: web login uses `app.models.User`* |
| `FirewallRulesEntity` | `FirewallRules` | Firewall rules |
| `UnifyAlarmEntity` | `UnifyAlarm` | Alarm config |
| `McpToolEntity` | `McpTool` | MCP Tool config |
| `McpClientEntity` | `McpClient` | MCP Client config |
| `ApiContextEntity` | `ApiContext` | SQL/script content for API |
| `VersionCommitEntity` | `VersionCommit` | Version management |
| `AccessRecordEntity` | `AccessRecord` | Access log |

### Task 1.2: Database Migrations (Alembic)

- Migration scripts for all models
- Enum types: ProductTypeEnum, HttpMethodEnum, ExecuteEngineEnum, etc.

### Task 1.3: Core Configuration

- Extend `config.py` for:
  - Multiple (external) database connections (PostgreSQL, MySQL)
  - Cache (Redis)
  - Flow control

---

## PHASE 2: Backend API Development

### Task 2.1: DataSource Management

**File**: `backend/app/api/routes/datasources.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/datasources/types` | GET | List supported database types (postgres, mysql initially) |
| `/datasources/{type}/drivers` | GET | List driver versions for type |
| `/datasources/list` | POST | List datasources with pagination |
| `/datasources/create` | POST | Create datasource |
| `/datasources/update` | POST | Update datasource |
| `/datasources/delete/{id}` | DELETE | Delete datasource |
| `/datasources/test/{id}` | GET | Test connection |
| `/datasources/preTest` | POST | Test connection before save |

### Task 2.2: API Assignment Management

**File**: `backend/app/api/routes/api_assignments.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api-assignments/list` | POST | List APIs with filters |
| `/api-assignments/create` | POST | Create API |
| `/api-assignments/update` | POST | Update API |
| `/api-assignments/delete/{id}` | DELETE | Delete API |
| `/api-assignments/{id}` | GET | Get API detail |
| `/api-assignments/publish` | POST | Publish API |
| `/api-assignments/debug` | POST | Debug/test API |

### Task 2.3: Module & Group Management

**Files**:

- `backend/app/api/routes/modules.py`
- `backend/app/api/routes/groups.py`

### Task 2.4: Client Application Management

**File**: `backend/app/api/routes/clients.py`

### Task 2.5: System Settings

**Files**:

- `backend/app/api/routes/firewall.py`
- `backend/app/api/routes/alarm.py`
- `backend/app/api/routes/topology.py`

### Task 2.6: MCP Service

**File**: `backend/app/api/routes/mcp.py`

### Task 2.7: Overview / Dashboard

**File**: `backend/app/api/routes/overview.py`

---

## PHASE 3: SQL & Script Execution Engine

> **SQL Engine**: **Jinja2**  
> **Script Engine**: **Python** (replacing Groovy), sandboxed execution

### Task 3.1: DB Connection & Connection Pool (no Driver layer)

**Difference from SQLREST (Java):** In SQLREST, **driver = JDBC JAR files** — must be stored and selected per DB type. In pydbapi, **psycopg** and **pymysql** are **pre-installed via pip**; **only need to add a DataSource** (product_type, host, port, database, username, password). There is no "driver" to manage. The endpoint `/datasources/{type}/drivers` and column `driver_version` may be **dropped** (or kept for compatibility).

**Scope (initial)**: **PostgreSQL** and **MySQL** only. Other DBs (Oracle, SQL Server, ClickHouse, …) to be added later — extend `connect()` and `ProductTypeEnum`.

**Directory layout**:

```
backend/app/core/
└── pool/
    ├── __init__.py       # export: connect, execute, cursor_to_dicts, health_check, PoolManager
    ├── connect.py        # connect(datasource) — if/else psycopg vs pymysql by product_type
    ├── manager.py        # PoolManager: get_connection, release, dispose
    └── health.py         # health_check(conn, product_type)
```

**Supported databases (initial)**:

| Database | Python lib (pre-installed via pip) | Status |
|----------|-----------------------------------|--------|
| PostgreSQL | `psycopg` | ✅ Initial |
| MySQL / MariaDB | `pymysql` | ✅ Initial |
| Oracle, SQL Server, SQLite, ClickHouse, … | TBD | 🔜 Later — add branch in `connect.py` + pip |

---

### Task 3.2: SQL Template Engine (Jinja2)

**Goal**: Replace MyBatis dynamic SQL with **Jinja2**

**Directory layout**:

```
backend/app/
├── engines/
│   ├── __init__.py
│   ├── sql/
│   │   ├── __init__.py
│   │   ├── template_engine.py   # Jinja2 SQL engine
│   │   ├── filters.py           # Custom Jinja2 filters
│   │   ├── extensions.py        # Custom Jinja2 extensions
│   │   ├── parser.py            # Parameter parser
│   │   └── executor.py          # SQL executor
```

#### 3.2.1: Parameter types

| Type | Jinja2 syntax | Example |
|------|---------------|---------|
| String | `{{ name }}` | `WHERE name = '{{ name }}'` |
| Integer | `{{ id \| int }}` | `WHERE id = {{ id \| int }}` |
| Float | `{{ price \| float }}` | `WHERE price > {{ price \| float }}` |
| Boolean | `{{ active \| bool }}` | `WHERE active = {{ active \| bool }}` |
| Date | `{{ date \| date }}` | `WHERE created_at = '{{ date \| date }}'` |
| DateTime | `{{ dt \| datetime }}` | `WHERE updated_at = '{{ dt \| datetime }}'` |
| List/Array | `{{ ids \| in_list }}` | `WHERE id IN {{ ids \| in_list }}` |
| JSON | `{{ data \| json }}` | For JSONB / JSON columns |

#### 3.2.2: Dynamic SQL (MyBatis → Jinja2)

**Conditional**:

```sql
-- MyBatis
<if test="name != null">
  AND name = #{name}
</if>

-- Jinja2
{% if name %}
  AND name = '{{ name }}'
{% endif %}

-- choose / when / otherwise
{% if status == 1 %}active{% else %}inactive{% endif %}
```

**Loop**:

```sql
-- MyBatis foreach
-- Jinja2
{% for id in ids %}{{ id }}{% if not loop.last %},{% endif %}{% endfor %}
-- or
{{ ids | in_list }}  --> (1, 2, 3, 4)
```

**Where / Set** (custom tags):

```sql
{% where %}
  {% if name %}name = '{{ name }}'{% endif %}
  {% if age %}AND age = {{ age }}{% endif %}
{% endwhere %}
```

#### 3.2.3: Custom Jinja2 filters

- `sql_string`, `sql_int`, `sql_float`, `sql_bool`
- `sql_date`, `sql_datetime`
- `sql_in_list`, `sql_like`, `sql_like_start`, `sql_like_end`

#### 3.2.4: SQLTemplateEngine

- `render(template, params) -> str`
- `parse_parameters(template) -> list[str]`

---

### Task 3.3: Script Engine (Python)

**Goal**: Replace Groovy with **Python** scripts run in a sandbox

**Directory layout**:

```
backend/app/
├── engines/
│   ├── script/
│   │   ├── __init__.py
│   │   ├── executor.py          # Python script executor
│   │   ├── sandbox.py           # Sandboxed execution
│   │   ├── context.py           # Script context
│   │   └── modules/
│   │       ├── __init__.py
│   │       ├── db.py            # Database operations
│   │       ├── http.py          # HTTP client
│   │       ├── cache.py         # Cache
│   │       ├── env.py           # Environment
│   │       ├── log.py           # Logging
│   │       └── utils.py
```

#### 3.3.1: Context variables (like Groovy modules)

| Groovy | Python | Description |
|--------|--------|-------------|
| `db` | `db` | Database operations |
| `ds` | `ds` | DataSource access |
| `http` | `http` | HTTP client |
| `cache` | `cache` | Cache |
| `env` | `env` | Environment |
| `log` | `log` | Logging |
| `req` | `req` | Request parameters |
| `tx` | `tx` | Transaction control |

#### 3.3.2: Built-in modules (outline)

- **db**: `query`, `query_one`, `execute`, `insert`, `update`, `delete`
- **http**: `get`, `post`, `put`, `delete`
- **cache**: `get`, `set`, `delete`, `exists`, `incr`, `decr`
- **env**: `get`, `get_int`, `get_bool`
- **log**: `info`, `warn`, `error`, `debug`

#### 3.3.3: Sandbox

- Use **RestrictedPython** (or equivalent)
- Expose only: `dict`, `list`, `str`, `int`, `float`, `bool`, `range`, `enumerate`, `zip`, `sorted`, `len`, `round`, `min`, `max`, `sum`, `abs`, `json.loads`, `json.dumps`, `datetime`, `date`, `time`, `timedelta`
- Block: `open`, `exec`, `eval`, unrestricted `__import__`, `compile`, `os`, `subprocess`, dangerous `sys`/`getattr`/`setattr`, etc.

#### 3.3.4: Script result

- Script must assign a `result` variable (dict, list, etc.) that the API returns.

```python
users = db.query("SELECT id, name FROM users WHERE status = 1")
result = [{"id": u["id"], "label": u["name"]} for u in users]
```

---

### Task 3.4: Unified API Executor

- `ExecuteEngine`: `SQL` | `SCRIPT`
- `ApiExecutor.execute(engine, datasource_id, content, params, dialect?) -> Any`
- **SQL**: render with Jinja2, run via pool (PostgreSQL or MySQL driver)
- **SCRIPT**: run via ScriptExecutor with `db`, `http`, `cache`, `env`, `log`, `req`

---

### Dependencies (Phase 3, initial)

**Initial (PostgreSQL + MySQL only)**:

```toml
# pyproject.toml

jinja2 = ">=3.1.0"
RestrictedPython = ">=7.0"

# PostgreSQL
psycopg2-binary = ">=2.9.0"
# asyncpg = ">=0.29.0"   # optional, for async

# MySQL
pymysql = ">=1.1.0"
# aiomysql = ">=0.2.0"   # optional, for async

httpx = ">=0.27.0"
redis = ">=5.0.0"
```

**Later (when adding more DBs)**:

- `cx-Oracle`, `oracledb`, `pyodbc`, `pymssql`, `clickhouse-driver`, `pyhive`, `impyla`, etc.

---

## PHASE 4: Gateway & Security

> **Detailed plan:** `docs/PHASE4_GATEWAY_SECURITY_PLAN.md`

- **4.1** Dynamic gateway: `/api/{module}/{path}` → execute (SQL or script) → JSON
- **4.2** Token auth for clients, IP firewall, rate limiting
- **4.3** Request/response: `application/x-www-form-urlencoded`, `application/json`; naming (camelCase, snake_case)

---

## PHASE 5: Frontend (Vue → React)

- **5.1** Layout, sidebar, routes: Dashboard, Connection (Driver, Management), System (Group, Client, Firewall, Alarm, Topology), API Dev (Module, API), API Repository, MCP (Token, Tool), About
- **5.2** DataSource: list, create, edit, test, detail
- **5.3** API Dev: modules, API list, create/edit (Jinja2 SQL + Python script editor), params, debug
- **5.4** System: groups, clients, firewall, alarm, topology
- **5.5** API Repository: search, detail (Swagger-like)
- **5.6** MCP: clients, tools
- **5.7** Dashboard: stats, charts, recent activity

---

## PHASE 6: Advanced

- Caching (Redis), flow control, alarms, import/export, versioning

---

## PHASE 7: Testing & Docs

- Backend unit/integration, frontend E2E, OpenAPI/Swagger

---

## PHASE 8: Deployment

- Docker, docker-compose, CI/CD (e.g. GitHub Actions)

---

## Priority

| Priority | Phase | Notes |
|----------|-------|-------|
| High | 1 | Foundation |
| High | 2 (2.1, 2.2) | Core APIs |
| High | 3 | SQL (Jinja2) + Script (Python); Postgres + MySQL only at first |
| Medium | 5 (5.1–5.3) | Core UI |
| Medium | 4 | Gateway & security |
| Low | 2 (rest), 5 (rest), 6, 7, 8 | Secondary, advanced, test, deploy |

---

## Summary

| Component | Technology |
|-----------|------------|
| SQL template | **Jinja2** |
| Script execution | **Python** (sandbox, e.g. RestrictedPython) |
| **Databases (initial)** | **PostgreSQL**, **MySQL** |
| Databases (later) | Oracle, SQL Server, SQLite, ClickHouse, Hive, Impala, and others |
