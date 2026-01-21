# PHASE 3: SQL & Script Execution Engine – Implementation Plan

> Based on `docs/MIGRATION_PLAN_SQLREST.md`.  
> **Prerequisites:** Phase 1 (models, migrations, config), Phase 2 (DataSource, ApiAssignment, debug → 501).  
> **Scope:** PostgreSQL and MySQL only; other DBs (Oracle, SQL Server, ClickHouse, …) to be added later.

---

## 1. Overview

| Task | Directory/File | Description |
|------|----------------|-------------|
| **3.1** | `core/pool/` | DB connection + connection pool (DataSource only, no driver layer) |
| **3.2** | `engines/sql/` | SQL template engine (Jinja2): filters, parser, executor |
| **3.3** | `engines/script/` | Script engine (Python): sandbox, context, built-in modules |
| **3.4** | `engines/` or `core/` | Unified API Executor: `ApiExecutor.execute(engine, …)` |

**Technology:**

- **SQL:** Jinja2 (replaces MyBatis)
- **Script:** Python sandbox (RestrictedPython), replaces Groovy
- **DB (initial):** PostgreSQL (`psycopg`), MySQL (`pymysql`) — **pre-installed via pip, no driver management**

**Difference from SQLREST (Java):** In SQLREST, driver = JDBC JAR files that must be stored/selected per DB type. In pydbapi, `psycopg`/`pymysql` are already installed via `pyproject.toml`; **adding a DataSource** (product_type, host, port, database, username, password) is sufficient. There is no “driver” concept to store or select.

---

## 2. Implementation Order and Dependencies

```
3.1 Pool + connect  ──┬──► 3.2 SQL Engine (Jinja2)  ──┐
                      │                                ├──► 3.4 ApiExecutor
                      └──► 3.3 Script Engine (Python) ──┘
```

**Suggested order:**  
3.1 → 3.2 and 3.3 (can run in parallel) → 3.4.

**Phase 2 integration:**

- `datasources/test/{id}`, `datasources/preTest`: use `connect()` + `health_check()` from 3.1 (and Pool if desired).
- `api-assignments/debug`: replace 501 with `ApiExecutor.execute(...)`.
- **`/datasources/{type}/drivers`:** can be **removed** (Phase 2) since there is no driver concept; or keep returning `["default"]` if legacy frontend depends on it.

---

## 3. Task 3.1: DB Connection & Connection Pool (No Driver Layer)

**Directory:** `backend/app/core/pool/`

**Principle:** In SQLREST, driver = JDBC JAR files to store/select. In pydbapi, **psycopg** and **pymysql** are installed via pip — **only need to add a DataSource** (product_type, host, port, database, username, password). No “driver” to manage. `product_type` determines whether to call `psycopg.connect()` or `pymysql.connect()`.

### 3.1.1 Directory Layout

```
backend/app/core/
└── pool/
    ├── __init__.py       # export: connect, execute_sql, cursor_to_dicts, health_check, PoolManager, get_pool_manager
    ├── connect.py        # connect(datasource | dict, product_type?) -> Connection; if/else psycopg vs pymysql
    ├── manager.py        # PoolManager: get_connection(datasource), release(conn, datasource_id), dispose(datasource_id?)
    └── health.py         # health_check(conn, product_type) -> bool  (SELECT 1)
```

### 3.1.2 connect.py — Connect by product_type

- **`connect(datasource: DataSource | dict, *, product_type: ProductTypeEnum | None = None) -> Connection`**
  - If `datasource` is dict (preTest): need `product_type` or `datasource["product_type"]`.
  - If `datasource` is model: `product_type = datasource.product_type`.
  - **Postgres:** `psycopg.connect(host=..., port=..., dbname=..., user=..., password=..., connect_timeout=config.EXTERNAL_DB_CONNECT_TIMEOUT)`.
  - **MySQL:** `pymysql.connect(host=..., port=..., database=..., user=..., password=..., connect_timeout=...)`.
  - If `product_type` is not postgres/mysql → `ValueError`.

- **`execute(conn, sql, params=None, product_type: ProductTypeEnum) -> tuple[Cursor, int | None]`**  
  - `conn.cursor()` → `cursor.execute(sql, params)`; for SELECT returns `(cursor, None)`, for INSERT/UPDATE/DELETE returns `(cursor, rowcount)`.
  - `product_type` only needed if Postgres vs MySQL differ (placeholders, etc.); can be omitted for now.

- **`cursor_to_dicts(cursor) -> list[dict]`**  
  - `[dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]` — shared for both psycopg and pymysql.

### 3.1.3 PoolManager (manager.py)

- **Purpose:** Avoid open/close connection per request; reuse by `datasource_id`.
- **Key:** `datasource_id` (UUID). When a new connection is needed: `connect(datasource)` from `connect.py`.
- **Config:** `EXTERNAL_DB_POOL_SIZE`, `EXTERNAL_DB_CONNECT_TIMEOUT` from `config`.
- **API:**
  - `get_connection(datasource: DataSource) -> Connection`
  - `release(conn, datasource_id: UUID)`
  - `dispose(datasource_id?: UUID | None)` — None = all pools.

### 3.1.4 health.py

- **`health_check(conn, product_type: ProductTypeEnum) -> bool`**  
  - `execute(conn, "SELECT 1", product_type=product_type)` and ensure no exception. Postgres and MySQL both use `SELECT 1`.

### 3.1.5 driver_version and API /datasources/{type}/drivers

- **`driver_version` (column in DataSource):** **Not used** in Phase 3. Can drop the column in a later migration, or keep for compatibility; when adding a DataSource **no** driver selection is needed.
- **`/datasources/{type}/drivers`:** Can be **removed** (Phase 2) since there is no driver concept. If kept for frontend compatibility: return `["default"]`.

### 3.1.6 Phase 2 Integration

- **`/datasources/preTest`:**  
  - Build dict from body (host, port, database, username, password, product_type).  
  - `conn = connect(params, product_type=params["product_type"])` → `health_check(conn, product_type)` → `conn.close()` → `{"ok": True}` or `{"ok": False, "message": str(e)}`.
- **`/datasources/test/{id}`:**  
  - Load `DataSource` by `id`; `conn = connect(datasource)` → `health_check(conn, datasource.product_type)` → `conn.close()` (or `PoolManager.get_connection` then `release`) → `{"ok": bool, "message": str}`.

---

## 4. Task 3.2: SQL Template Engine (Jinja2)

**Directory:** `backend/app/engines/sql/`

### 4.1 Directory Layout

```
backend/app/engines/
├── __init__.py
└── sql/
    ├── __init__.py           # export: SQLTemplateEngine, parse_parameters, execute_sql
    ├── template_engine.py     # SQLTemplateEngine: render, parse_parameters
    ├── filters.py             # Custom Jinja2 filters (sql_string, sql_int, in_list, ...)
    ├── extensions.py          # (optional) Custom tags: {% where %}, {% set %}
    ├── parser.py              # parse_parameters(template) -> list[str]
    └── executor.py            # execute_sql(datasource, sql, params) -> list[dict] | int
```

### 4.2 Parameter Types (Jinja2)

| Type | Jinja2 | Example |
|------|--------|---------|
| String | `{{ name }}` | `WHERE name = '{{ name }}'` |
| Integer | `{{ id \| int }}` | `WHERE id = {{ id \| int }}` |
| Float | `{{ price \| float }}` | `WHERE price > {{ price \| float }}` |
| Boolean | `{{ active \| bool }}` | `WHERE active = {{ active \| bool }}` |
| Date | `{{ date \| sql_date }}` | `WHERE created_at = '{{ date \| sql_date }}'` |
| DateTime | `{{ dt \| sql_datetime }}` | `WHERE updated_at = '{{ dt \| sql_datetime }}'` |
| List/Array | `{{ ids \| in_list }}` | `WHERE id IN {{ ids \| in_list }}` → `(1,2,3)` |
| JSON | `{{ data \| json }}` | JSONB / JSON columns |

### 4.3 Dynamic SQL (MyBatis → Jinja2)

**Conditionals:**

```jinja2
{% if name %}
  AND name = '{{ name }}'
{% endif %}

{% if status == 1 %}active{% else %}inactive{% endif %}
```

**Loops:**

```jinja2
{% for id in ids %}{{ id }}{% if not loop.last %},{% endif %}{% endfor %}
{{ ids | in_list }}
```

**`{% where %}` / `{% set %}` (if extensions exist):**  
- `{% where %}`: combine conditions, add `WHERE` and strip leading `AND`/`OR`.

### 4.4 filters.py – Custom Filters

- `sql_string`, `sql_int`, `sql_float`, `sql_bool`: escape/validate, avoid SQL injection; `None` → appropriate (e.g. `NULL` or omit when used in `{% if %}`).
- `sql_date`, `sql_datetime`: ISO format for DB.
- `in_list`: `[1,2,3]` → `(1, 2, 3)`; empty → `(NULL)` or `(SELECT 1 WHERE 1=0)` to avoid syntax errors.
- `sql_like`, `sql_like_start`, `sql_like_end`: escape `%`, `_` in LIKE.

### 4.5 SQLTemplateEngine (template_engine.py)

- **`render(template: str, params: dict) -> str`**  
  - Load Jinja2 `Environment` with `filters` from `filters.py`, `extensions` from `extensions.py` (if any).  
  - `env.from_string(template).render(**params)` → SQL string.  
  - No HTML `autoescape`; ensure filters handle escape/validate.
- **`parse_parameters(template: str) -> list[str]`**  
  - Scan `{{ ... }}` and `{% ... %}` for variable names (or use Jinja2 `meta.find_undeclared_variables(ast)`).  
  - Return list of parameter names (to validate `params` before `render`).

### 4.6 parser.py

- Can be merged into `template_engine`: `SQLTemplateEngine.parse_parameters` calls `meta.find_undeclared_variables` or a simple regex.  
- If separate: `parse_parameters(template) -> list[str]`.

### 4.7 executor.py

- **`execute_sql(datasource: DataSource, sql: str, params: dict | None, *, use_pool: bool = True) -> list[dict] | int`**
  - `params`: optional if SQL is fully rendered via Jinja2; if executor also accepts raw params for later binding, the interface must be explicit (Migration Plan: after render, SQL is final; params here can be the dict passed into Jinja2).
  - If **Jinja2 only** (no later binding): `params` only for `render`; `execute_sql` receives already-rendered `sql`.  
  - **Suggested signature:**  
    - `execute_sql(datasource, sql, *, params_for_binding: dict | None = None) -> list[dict] | int`  
    - `sql` = rendered SQL. `params_for_binding`: only if DB uses placeholders (`%s`, `%(name)s`); if full Jinja2 then `None`.
  - **Simplified:** `execute_sql(datasource, sql) -> list[dict] | int`: `sql` is rendered; `PoolManager.get_connection(datasource)` or `connect(datasource)` → `execute(conn, sql, product_type=datasource.product_type)` → `cursor_to_dicts` or `rowcount` for INSERT/UPDATE/DELETE.
- **list vs int:**  
  - SELECT → `list[dict]`;  
  - INSERT/UPDATE/DELETE → `int` (rowcount) or empty `list[dict]`; API may normalize to `{"rows": [...], "rowcount": int}` per ApiExecutor.

---

## 5. Task 3.3: Script Engine (Python)

**Directory:** `backend/app/engines/script/`

### 5.1 Directory Layout

```
backend/app/engines/script/
├── __init__.py
├── executor.py      # ScriptExecutor.execute(script, context) -> result
├── sandbox.py       # compile, execute with RestrictedPython
├── context.py       # ScriptContext: db, http, cache, env, log, req, tx
└── modules/
    ├── __init__.py
    ├── db.py        # db.query, query_one, execute, insert, update, delete
    ├── http.py      # http.get, post, put, delete
    ├── cache.py     # cache.get, set, delete, exists, incr, decr
    ├── env.py       # env.get, get_int, get_bool
    ├── log.py       # log.info, warn, error, debug
    └── utils.py     # (optional) helpers
```

### 5.2 Context (context.py)

| Groovy (source) | Python | Description |
|-----------------|--------|-------------|
| `db` | `db` | DB query/write (via DataSource) |
| `ds` | `ds` | DataSource access (metadata, etc.) |
| `http` | `http` | HTTP client |
| `cache` | `cache` | Redis/cache |
| `env` | `env` | Environment / config |
| `log` | `log` | Logging |
| `req` | `req` | Request parameters (dict) |
| `tx` | `tx` | Transaction (begin, commit, rollback) |

`ScriptContext` receives: `datasource`, `req: dict`, `pool_manager`, `cache_client`, `settings`, `logger`.  
Build `db`, `http`, `cache`, `env`, `log`, `req`, `tx` (and `ds` if needed) and inject into the script namespace at execution.

### 5.3 modules/db.py

- **Inputs:** `datasource: DataSource`, `pool_manager: PoolManager`, `sql_engine: SQLTemplateEngine` (if script allows SQL string + params; or only safe raw SQL).  
- **API:**
  - `query(sql, params=None) -> list[dict]`
  - `query_one(sql, params=None) -> dict | None`
  - `execute(sql, params=None) -> int`
  - `insert`, `update`, `delete`: optional wrappers around `execute` with simple conventions.

`db` calls `pool_manager.get_connection(datasource)` and `execute(conn, sql, product_type=datasource.product_type)` (from `core.pool`) / `execute_sql` (from `engines.sql.executor`) as appropriate.

### 5.4 modules/http.py

- Use `httpx` (already present): `get`, `post`, `put`, `delete`; timeout from config or default.  
- Limits: URL allowlist (optional in Phase 3), timeout, response size (avoid DoS).

### 5.5 modules/cache.py

- Backend: Redis (`redis`).  
- `get`, `set`, `delete`, `exists`, `incr`, `decr`.  
- Key prefix (e.g. `script:`) to separate namespace.

### 5.6 modules/env.py

- `get(key, default=None)`, `get_int`, `get_bool`: read from `settings` or `os.environ` with a key whitelist (avoid leaking secrets).

### 5.7 modules/log.py

- `info`, `warn`, `error`, `debug`: call `logger` with context (e.g. `api_assignment_id`, `request_id`).

### 5.8 sandbox.py (RestrictedPython)

- **Library:** `RestrictedPython` (add to `pyproject.toml`).
- **Allowed:** `dict`, `list`, `str`, `int`, `float`, `bool`, `range`, `enumerate`, `zip`, `sorted`, `len`, `round`, `min`, `max`, `sum`, `abs`, `json.loads`, `json.dumps`, `datetime`, `date`, `time`, `timedelta`, and context objects (`db`, `http`, `cache`, `env`, `log`, `req`, `tx`).
- **Blocked:** `open`, `exec`, `eval`, unrestricted `__import__`, `compile`, `os`, `subprocess`, dangerous `sys`/`getattr`/`setattr`, etc.
- **Flow:** `compile(script)` → `exec(compiled, restricted_globals)`; `restricted_globals` = limited builtins + context.

### 5.9 executor.py (ScriptExecutor)

- **`execute(script: str, context: ScriptContext) -> Any`**
  - `sandbox.compile(script)` → on error → raise.
  - `restricted_globals = {**safe_builtins, **context.to_dict()}` (db, http, cache, env, log, req, tx, ds?).
  - `exec(compiled, restricted_globals)`.
  - Return `restricted_globals.get("result")` (script **must** set `result`).  
  - If no `result` → error or `None` per convention.

**Example script:**

```python
users = db.query("SELECT id, name FROM users WHERE status = 1")
result = [{"id": u["id"], "label": u["name"]} for u in users]
```

### 5.10 Transaction (tx)

- `tx.begin()`, `tx.commit()`, `tx.rollback()`: wrap connection from `PoolManager`; one connection per request/script, `tx` controls commit/rollback.  
  - Simplification: if `tx` is not used, auto-commit after each `db.query`/`execute`; if `tx.begin()` is called, commit only on `tx.commit()`.

---

## 6. Task 3.4: Unified API Executor

**File:** `backend/app/engines/executor.py` (or `core/executor.py`)

### 6.1 ApiExecutor

- **`execute(engine: ExecuteEngineEnum, datasource_id: UUID | None, content: str, params: dict, *, datasource: DataSource | None = None) -> Any`**
  - `datasource`: if `None`, load from `datasource_id` via DB (requires `Session` or injection).
  - **engine == SQL:**
    - `SQLTemplateEngine().render(content, params)` → `sql`.
    - `execute_sql(datasource, sql)` → `list[dict] | int`.
    - Return: `{"data": rows }` or `{"rowcount": n}`; align with Gateway (Phase 4).
  - **engine == SCRIPT:**
    - `ScriptContext(datasource=..., req=params, ...)`.
    - `ScriptExecutor.execute(content, context)` → `result`.
    - Return: `result` (dict/list) or `{"data": result}`.

### 6.2 Integration with `api-assignments/debug`

- **Request:** `ApiAssignmentDebugIn`: `id?` or `content` + `execute_engine` + `datasource_id?` + `params?`.
- **Logic:**
  - If `id`: load `ApiAssignment` + `ApiContext.content`, `execute_engine`, `datasource_id`; if `datasource_id` and `execute_engine==SQL`, need `datasource`.
  - If inline: use `content`, `execute_engine`, `datasource_id` from body.
- Call `ApiExecutor.execute(execute_engine, datasource_id, content, params or {}, datasource=...)`.
- Return `{"data": ...}` or `{"rowcount": ...}` or `{"error": "..."}`.

### 6.3 Errors and Timeout

- **SQL:** `EXTERNAL_DB_STATEMENT_TIMEOUT` (if supported); exception → `{"error": str(e)}`.
- **Script:** timeout on `exec` (e.g. `signal` or `multiprocessing` with timeout); `RestrictedPython` exception → `{"error": "..."}`.

---

## 7. Dependencies (pyproject.toml)

**To add (Phase 3):**

```toml
RestrictedPython = ">=7.0"
# jinja2, httpx, redis, psycopg, pymysql already present
```

**Already present:** `jinja2`, `httpx`, `redis`, `psycopg` (or `psycopg2-binary`), `pymysql`.

**Later (when adding more DBs):** `cx_Oracle`, `oracledb`, `pyodbc`, `pymssql`, `clickhouse-driver`, etc.

---

## 8. Files to Create or Update

### Create

| File | Notes |
|------|-------|
| `app/core/pool/__init__.py` | Export connect, execute, cursor_to_dicts, health_check, PoolManager, get_pool_manager |
| `app/core/pool/connect.py` | connect(datasource), execute(conn, sql), cursor_to_dicts(cursor) — if/else psycopg vs pymysql |
| `app/core/pool/manager.py` | PoolManager: get_connection, release, dispose |
| `app/core/pool/health.py` | health_check(conn, product_type) |
| `app/engines/__init__.py` | Export SQLTemplateEngine, ScriptExecutor, ApiExecutor |
| `app/engines/sql/__init__.py` | |
| `app/engines/sql/template_engine.py` | SQLTemplateEngine |
| `app/engines/sql/filters.py` | Jinja2 filters |
| `app/engines/sql/extensions.py` | (optional) {% where %}, {% set %} |
| `app/engines/sql/parser.py` | parse_parameters (or merge into template_engine) |
| `app/engines/sql/executor.py` | execute_sql |
| `app/engines/script/__init__.py` | |
| `app/engines/script/executor.py` | ScriptExecutor |
| `app/engines/script/sandbox.py` | RestrictedPython compile/exec |
| `app/engines/script/context.py` | ScriptContext |
| `app/engines/script/modules/__init__.py` | |
| `app/engines/script/modules/db.py` | db |
| `app/engines/script/modules/http.py` | http |
| `app/engines/script/modules/cache.py` | cache |
| `app/engines/script/modules/env.py` | env |
| `app/engines/script/modules/log.py` | log |
| `app/engines/script/modules/utils.py` | (optional) |
| `app/engines/executor.py` or `app/core/api_executor.py` | ApiExecutor |

### Update

| File | Changes |
|------|---------|
| `app/api/routes/datasources.py` | `preTest`, `test/{id}`: use `connect()` + `health_check()` from `core.pool` (and `PoolManager` if desired). Consider **removing** `/datasources/{type}/drivers` or return `["default"]`. |
| `app/api/routes/api_assignments.py` | `debug`: call `ApiExecutor.execute(...)` instead of 501. |
| `app/main.py` or `backend_pre_start.py` | Optionally init `PoolManager` (lazy is fine). No driver registration. |
| `pyproject.toml` | Add `RestrictedPython>=7.0`. (psycopg, pymysql already present) |

---

## 9. Testing (Suggested)

### Unit

- **pool/connect:** mock `psycopg.connect`, `pymysql.connect`; test `connect(dict with product_type)`, `execute`, `cursor_to_dicts` with fake cursor.
- **SQLTemplateEngine:** `render` with `{% if %}`, `{{ x \| int }}`, `{{ ids \| in_list }}`; `parse_parameters` returns correct names.
- **filters:** `in_list` empty, one element, many; `sql_like` escapes `%`, `_`.
- **ScriptExecutor:** simple script `result = [1,2,3]`; script calling `db.query` (mock `db`); script using `open` → blocked.
- **ApiExecutor:** mock `execute_sql`, `ScriptExecutor.execute`; call with `SQL` and `SCRIPT`.

### Integration

- Postgres + MySQL (docker): real `DataSource` → `preTest`, `test/{id}`; `execute_sql` with SELECT/INSERT; `debug` with SQL and SCRIPT.
- Redis (optional): `cache` in script.

### Locations

- `tests/engines/test_sql_template_engine.py`, `tests/engines/test_sql_filters.py`, `tests/engines/test_sql_executor.py`
- `tests/engines/test_script_sandbox.py`, `tests/engines/test_script_executor.py`
- `tests/engines/test_api_executor.py`
- `tests/core/test_pool.py` (connect, execute, cursor_to_dicts, health_check, PoolManager)
- `tests/api/routes/test_datasources.py`, `test_api_assignments.py` (add real debug)

---

## 10. Implementation Checklist

- [ ] **3.1.1** `core/pool/connect.py` (connect, execute, cursor_to_dicts by product_type)
- [ ] **3.1.2** `core/pool/manager.py`, `health.py`
- [ ] **3.1.3** Update `datasources/preTest`, `datasources/test/{id}` to use `connect` + `health_check` (and/or pool). Consider removing `/datasources/{type}/drivers`.
- [ ] **3.2.1** `engines/sql/filters.py` (in_list, sql_int, sql_date, sql_datetime, sql_like…)
- [ ] **3.2.2** `engines/sql/template_engine.py` (`render`, `parse_parameters`), `extensions.py` (optional)
- [ ] **3.2.3** `engines/sql/executor.py` (`execute_sql`)
- [ ] **3.3.1** `engines/script/sandbox.py` (RestrictedPython)
- [ ] **3.3.2** `engines/script/context.py`, `modules/db`, `http`, `cache`, `env`, `log`
- [ ] **3.3.3** `engines/script/executor.py` (`ScriptExecutor.execute`)
- [ ] **3.4.1** `engines/executor.py` or `core/api_executor.py` (`ApiExecutor.execute`)
- [ ] **3.4.2** `api-assignments/debug` calls `ApiExecutor.execute`
- [ ] **3.4.3** `pyproject.toml`: `RestrictedPython>=7.0`
- [ ] Tests: unit (pool/connect, sql, script, api_executor) + integration (postgres, mysql, debug)

---

## 11. Security Notes

- **SQL:** Use Jinja2 render only with validated params; avoid putting user input directly into template as `{% ... %}` (if needed, whitelist). Filters `sql_*`, `in_list` must escape/validate.
- **Script:** RestrictedPython + whitelist builtins; disallow `open`, `os`, `subprocess`, unrestricted `__import__`; `env` only allowed keys; `http` should limit URL/timeout/size.
- **Pool:** Do not log passwords; connection leak: always `release` in `finally` or context manager.

---

## 12. Future Extensions (Beyond Phase 3)

- Oracle, SQL Server, SQLite, ClickHouse, Hive, Impala, TDengine, DM, Kingbase, GBase, OceanBase, OpenGauss: add `product_type` branch in `core/pool/connect.py` + corresponding pip package. **No** “driver” or registry — extend `connect()` and `ProductTypeEnum`.
- Async: `asyncpg`, `aiomysql` + `AsyncPoolManager`; async `ApiExecutor`.
- `{% where %}`, `{% set %}`, and extra filters as needed by real API usage.
