# pyDBAPI — Technical Logic

This document describes the **technical logic** of the gateway, parameters, engines, and related components. Code references use the `backend/app` layout.

---

## 1. Gateway request flow

**Route:** `GET|POST|PUT|PATCH|DELETE /api/{path:path}` (full URL = app base + `/api/{path}`).  
**Handler:** `backend/app/api/routes/gateway.py` → `gateway_proxy()`

Order of steps (and status codes when a step fails):

| Step | Action | On failure |
|------|--------|------------|
| 1 | **Client IP** from `X-Forwarded-For` (rightmost) or `request.client.host` | — |
| 2 | **Firewall** `check_firewall(ip, session)` | 403 Forbidden |
| 3 | **Resolve** `resolve_gateway_api(path, method, session)` → (ApiAssignment, path_params, ApiModule); path + HTTP method are unique globally | 404 Not Found |
| 4 | **Access type** If API is **private**, require auth | — |
| 5 | **Auth** `verify_gateway_client(request, session)` (JWT) | 401 Unauthorized |
| 6 | **Group/API access** `client_can_access_api(session, app_client_id, api_id)` | 403 Forbidden |
| 7 | **Client key** `client_id` (if client) or `ip:{ip}` (public API) for rate/concurrent | — |
| 8 | **Concurrent** `acquire_concurrent_slot(client_key, client_max)` | 503 Service Unavailable |
| 9 | **Rate limit** `check_rate_limit(rate_limit_key, effective_limit)`; if over limit → **release concurrent slot** then return | 429 Too Many Requests |
| 10 | **Parse params** `parse_params(request, path_params, method, params_definition)` | — |
| 11 | **Run** `runner_run(api, params, ...)` via `asyncio.to_thread(...)` (blocking run in thread pool) | 400/500, see Runner |
| 12 | **Finally** `release_concurrent_slot(client_key)` always | — |
| 13 | **Normalize** `normalize_api_result(result, engine)` → envelope `{ success, message, data }` | — |
| 14 | **Format** `format_response(normalized, request)` (optional camelCase) → JSONResponse | — |

**Why thread pool:** `runner_run` is synchronous (DB/script execution). Running it in the async handler would block the event loop and make the concurrent limit ineffective. `asyncio.to_thread` allows multiple requests in flight and correct slot counting.

---

## 2. Path and method resolution

**Files:** `backend/app/core/gateway/resolver.py` → `resolve_gateway_api(path, method, session)`

- **URL:** Gateway route is `/api/{path}`. Module is **not** part of the URL; it is used only for grouping and permissions.
- **Uniqueness:** (path, http_method) must be unique across all API assignments (enforced on create/update).
- **Resolution:** Over all active modules (by `sort_order`), over all published API assignments for that module and method, the first whose `ApiAssignment.path` (regex pattern) matches the incoming `path` wins. Returns (ApiAssignment, path_params, ApiModule).
- **Path pattern:** `ApiAssignment.path` supports placeholders `{name}`. Converted to regex: `{name}` → `(?P<name>[^/]+)`. Example: `users/{id}` matches request path `users/123` → `path_params = {"id": "123"}`.

---

## 3. Parameter handling

### 3.1 Merge order and sources

**File:** `backend/app/core/gateway/request_response.py` → `parse_params()`

- **Priority:** path > query > body > header (path always wins).
- **Path:** From resolver `path_params` (always included).
- **Query:** `request.query_params`.
- **Body:** `application/json` → `request.json()`; `application/x-www-form-urlencoded` or `multipart/form-data` → `request.form()` (as dict).
- **Header:** Only when **params_definition** is provided: for each param with `location="header"`, value is taken from `request.headers` (case-insensitive lookup by param name). If no params_definition, headers are **not** merged.

**When params_definition exists:** Only names defined there are taken from query/body/header; path params are always included. Unknown keys from query/body are **ignored**. Each param is taken only from its configured location.  
**When params_definition is missing:** Backward-compatible merge: `out = path_params` then `out.update(body)`, `out.update(query)`, `out.update(path_params)` again (path overwrites).

### 3.2 Request naming (camel → snake)

- Query `?naming=snake` (default) or `?naming=camel`. If **camel**, **body** and **query** keys are converted from camelCase to snake_case before merge. **Path** and **header** keys are not converted.

### 3.3 Runner: required and type coercion

**File:** `backend/app/core/gateway/runner.py`

After `parse_params`, the runner:

1. **Required check:** For each param in `params_definition` with `is_required=True`, if value is missing or empty string → 400, "Missing required parameters: ...".
2. **Type coercion:** `validate_and_coerce_params(params_definition, params)` (`backend/app/core/param_type.py`). Supported **data_type**: `string`, `number`, `integer`/`int`, `boolean`/`bool`, `array`, `object`/`obj`. Coercion rules:
   - **string:** strip.
   - **integer:** int or float with integer value; "123" → 123; boolean not allowed.
   - **number:** float.
   - **boolean:** true/false, 1/0, yes/no (string or int).
   - **array:** list, or JSON array string, or comma-separated string → list.
   - **object:** dict or JSON object string.
   - If value is None/empty and **default_value** is set, default is coerced and used.
   - Params not in params_definition are left unchanged.
3. **Param validates (script):** If `param_validates_definition` is set, `run_param_validates(...)` runs each validation script (RestrictedPython). Script must define `def validate(value, params=None): return True/False`. Raises 400 with `message_when_fail` on first failure.

### 3.4 Response naming (snake → camel)

**File:** `backend/app/core/gateway/request_response.py` → `format_response()`, `_response_naming()`

- If query `?naming=camel` or header `X-Response-Naming: camel`, the **entire response** dict is recursively key-converted from snake_case to camelCase before sending.

---

## 4. Concurrent limit

**File:** `backend/app/core/gateway/concurrent.py`

- **Purpose:** Limit how many requests a client (or IP) can have **in flight** at once.
- **Client key:** `app_client.client_id` (authenticated) or `f"ip:{ip}"` (public API).
- **Effective limit:** If `app_client.max_concurrent` is set and > 0, use it; else use global `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT`. If effective limit ≤ 0 → no limit (acquire always succeeds).
- **Acquire:** Before running the request. **Redis:** key `concurrent:gateway:{client_key}`, `INCR`; if value > max → `DECR` and return False (503). On first use, `EXPIRE` key 300s. **In-memory:** dict `client_key → count`; if count >= max return False, else increment. On Redis error: **fail-open** (allow).
- **Release:** In gateway **finally** block (always). **Redis:** `DECR` key. **In-memory:** decrement; if ≤ 0 remove key. Must always release so slots are freed even when global limit is 0 and client has per-client limit.
- **Order:** Concurrent is checked **before** rate limit. If 503, rate limit is not consumed. If 429 (rate limit), the slot acquired for concurrent is **released** before returning.
- **In-memory:** Not shared across processes; with multiple workers the effective limit is roughly max × workers. Use Redis for correct multi-worker behavior.

---

## 5. Rate limit

**File:** `backend/app/core/gateway/ratelimit.py`

- **Kill switch:** If `FLOW_CONTROL_RATE_LIMIT_ENABLED` is False, always allow.
- **Key:** Chosen in gateway: `api:{api_id}:{client_key}` when API has `rate_limit_per_minute` > 0; else `client:{client_key}` when client has `rate_limit_per_minute` > 0. If neither is set, rate limit is not applied (no key passed).
- **Algorithm:** Sliding window, 60 seconds. **Redis:** sorted set `ratelimit:gateway:{key}`; remove entries with score < now - 60; count; if count >= limit return False; else add current timestamp; set EXPIRE. **In-memory:** list of timestamps per key; prune old; if len >= limit return False; else append now. On Redis error: **fail-open** (allow).
- **In-memory:** Not shared across processes.

---

## 6. Gateway auth and API access

**File:** `backend/app/core/gateway/auth.py`

- **Token:** JWT from `POST /token/generate` (client_id, client_secret). Stored in payload `sub` = client_id.
- **Request:** `Authorization: Bearer <token>` or legacy `Authorization: <token>`. Decode with `SECRET_KEY`, verify expiry.
- **Client:** Lookup `AppClient` by `client_id` from payload, `is_active=True`.
- **API access (private only):** `client_can_access_api(session, app_client_id, api_id)` is True if:
  - There is a direct link `AppClientApiLink` for this client and API, or
  - There exists at least one `ApiGroup` linked to both the client (`AppClientGroupLink`) and the API (`ApiAssignmentGroupLink`).

---

## 7. Runner (execute API and access log)

**File:** `backend/app/core/gateway/runner.py` → `run()`

1. **Config:** `get_or_load_gateway_config(api, session)` → content, params_definition, param_validates_definition, result_transform_code, macros_jinja, macros_python. From Redis cache or DB (ApiContext + macro defs + version commit).
2. **Content:** For SQL: prepend `macros_jinja` to content; for SCRIPT: prepend `macros_python`. Then run single content string.
3. **Required params:** As in §3.3 → 400 if missing.
4. **Type coercion:** `validate_and_coerce_params` → 400 on ParamTypeError.
5. **Param validates:** `run_param_validates` (scripts) → 400 on ParamValidateError.
6. **Datasource:** If API has datasource and it is inactive → 500, "DataSource is inactive...".
7. **Execute:** `ApiExecutor().execute(engine, content, params, datasource_id=..., datasource=..., session, close_connection_after_execute)`. SQL → render Jinja2, run SQL, return `{"data": rows}` or `{"data": [], "rowcount": n}`. SCRIPT → ScriptExecutor with context, return `{"data": result}`.
8. **Result transform:** If `result_transform_code` is set, run Python transform (RestrictedPython) with result and params; macros prepended. On error → 400 (ResultTransformError).
9. **Access record:** On success write 200; on any exception write 500 then re-raise. Body/headers/params for log truncated or omitted per `GATEWAY_ACCESS_LOG_BODY`.

---

## 8. Response envelope and normalization

**File:** `backend/app/core/gateway/request_response.py` → `normalize_api_result()`

- **Envelope:** All gateway (and debug) responses use `{ "success": true|false, "message": str|null, "data": list }`. Extra keys (e.g. from result_transform: offset, limit, total) are preserved.
- **SQL:** If result is `{"data": ...}` and `data` is a single list (one result set), unwrap to `data = that list`. Otherwise wrap raw list in envelope.
- **SCRIPT:** If result has inner `{ success, message, data }`, normalize to top-level envelope; ensure `data` is a list. Otherwise wrap in envelope.
- **format_response:** After normalization, if `?naming=camel` or `X-Response-Naming: camel`, convert all keys recursively to camelCase.

---

## 9. Config cache (gateway)

**File:** `backend/app/core/gateway/config_cache.py`

- **Key:** `gateway:config:{api_assignment_id}`.
- **TTL:** `GATEWAY_CONFIG_CACHE_TTL_SECONDS` (default 60).
- **Stored:** content, params_definition, param_validates_definition, result_transform_code, macros_jinja, macros_python (and related IDs). Built from ApiContext + linked macro defs (with version commit snapshot when present). On Redis miss or error, load from DB and optionally set cache.
- **Used by:** `runner.run()` so each request does not hit DB for content/params/validates/transform.

---

## 10. SQL engine (Jinja2)

**Files:** `backend/app/engines/sql/template_engine.py`, `filters.py`, `extensions.py`

- **Render:** Jinja2 `Environment` with `autoescape=False`, custom filters and extensions. `SQLTemplateEngine.render(template, params)` → final SQL string. Params are passed as template variables; use `{{ name }}` or filters for safe quoting.
- **Filters (examples):** `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `sql_in_list` (for IN clauses), `sql_like`, `sql_like_start`, `sql_like_end`, etc. They escape quotes and format for SQL.
- **Extensions:** Custom tags e.g. `{% where %}...{% endwhere %}`, `{% set %}...{% endset %}` for conditional fragments.
- **Parse parameters:** `parse_parameters(template)` uses Jinja2 `meta.find_undeclared_variables(ast)` to list variable names (for UI/debug).
- **Data sources:** PostgreSQL (psycopg), MySQL (pymysql), Trino (trino). Databases that use a PostgreSQL or MySQL-compatible protocol (e.g. StarRocks, RisingWave) are supported via the corresponding `product_type`.
- **Execution:** Rendered SQL is executed via pool (`execute_sql` in pool manager); result rows or rowcount returned.

---

## 11. Script engine (Python sandbox)

**Files:** `backend/app/engines/script/executor.py`, `context.py`, `sandbox.py`

- **Sandbox:** RestrictedPython. Script cannot arbitrarily `import`; only names injected into globals are available.
- **Context (injected):** `db` (query, query_one, execute), `req` (merged params), `ds` (datasource metadata: id, name, product_type, host, port, database), `http`, `cache`, `env`, `log`, `tx` (transaction: begin, commit, rollback). Script must set `result`; that value is returned.
- **Extra modules:** `SCRIPT_EXTRA_MODULES` (comma-separated) whitelist. Only top-level names matching `^[a-zA-Z_][a-zA-Z0-9_]*$` are imported and injected (e.g. `pandas`, `numpy`). Submodules are not added via this setting.
- **Timeout:** `SCRIPT_EXEC_TIMEOUT` (seconds). On Unix, `signal.SIGALRM` raises `ScriptTimeoutError` after N seconds. On Windows (no SIGALRM), timeout is not applied.
- **Connection:** One connection per script run (or shared with `tx` if in transaction). `release_script_connection()` called in finally. Optional `close_connection_after_execute` for drivers that need a fresh connection per request.

---

## 12. Result transform and param validate (script)

**Files:** `backend/app/core/result_transform.py`, `backend/app/core/param_validate.py`

- **Result transform:** Python script (RestrictedPython) receives `result` (executor output) and `params`. Must assign to `result` (or return value, depending on implementation). Macros are prepended so helpers can be used. Raises `ResultTransformError` on failure → 400.
- **Param validate:** Per-parameter validation scripts. Each defines `def validate(value, params=None): return True/False`. Receives param value and full params dict. Macros prepended. Raises `ParamValidateError` with `message_when_fail` → 400.

---

## 13. Firewall

**File:** `backend/app/core/gateway/firewall.py`

- **Current behavior:** `check_firewall(ip, session)` always returns **True** (all IPs allowed). No CRUD API or UI for firewall rules. Model `FirewallRules` exists in DB for future use.

---

## Summary table (status codes)

| Cause | Status |
|-------|--------|
| Firewall deny | 403 |
| Module/path not found | 404 |
| Private API, no/invalid token | 401 |
| Client not allowed for this API | 403 |
| Over concurrent limit | 503 |
| Over rate limit | 429 |
| Missing required param | 400 |
| Param type/coercion error | 400 |
| Param validate script failure | 400 |
| Result transform error | 400 |
| ApiContext not found / DataSource inactive / execution error | 500 |
| Success | 200 |
