# Technical Reference

Detailed technical logic of the gateway, parameters, engines, and related components. Code references use the `backend/app/` layout.

---

## 1. Gateway Request Flow

**Route:** `GET|POST|PUT|PATCH|DELETE /api/{path:path}`
**Handler:** `app/api/routes/gateway.py` -> `gateway_proxy()`

| Step | Action | On failure |
|------|--------|------------|
| 1 | **Client IP** from `X-Forwarded-For` (if `TRUSTED_PROXY_COUNT > 0`) or `request.client.host` | --- |
| 2 | **Firewall** `check_firewall(ip, session)` | 403 |
| 3 | **Resolve** `resolve_gateway_api(path, method, session)` -> ApiAssignment + path_params + ApiModule | 404 |
| 4 | **Access type** check — if private, require auth | --- |
| 5 | **Auth** `verify_gateway_client(request, session)` via JWT | 401 |
| 6 | **API access** `client_can_access_api(session, client_id, api_id)` | 403 |
| 7 | **Client key** = `client_id` (authenticated) or `ip:{ip}` (public) | --- |
| 8 | **Concurrent** `acquire_concurrent_slot(client_key, max)` | 503 |
| 9 | **Rate limit** `check_rate_limit(key, limit)` — releases concurrent slot on failure | 429 |
| 10 | **Parse params** `parse_params(request, path_params, method, params_definition)` | --- |
| 11 | **Run** `runner_run(api, params, ...)` via `asyncio.to_thread()` | 400/500 |
| 12 | **Finally** `release_concurrent_slot(client_key)` — always executes | --- |
| 13 | **Normalize** `normalize_api_result(result, engine)` -> `{ success, message, data }` | --- |
| 14 | **Format** `format_response(normalized, request)` — optional camelCase | --- |

`runner_run` is synchronous (DB/script execution). `asyncio.to_thread` prevents blocking the event loop and ensures correct concurrent slot counting.

---

## 2. Path and Method Resolution

**File:** `app/core/gateway/resolver.py`

- **URL:** Gateway route is `/api/{path}`. Module is **not** part of the URL.
- **Uniqueness:** `(path, http_method)` must be globally unique across all API assignments.
- **Resolution:** Iterates active modules (by `sort_order`), then published assignments for the matching method. First regex match wins.
- **Path patterns:** `{name}` placeholders are converted to `(?P<name>[^/]+)`. Example: `users/{id}` matches `users/123` -> `path_params = {"id": "123"}`.

---

## 3. Parameter Handling

### 3.1 Merge Order and Sources

**File:** `app/core/gateway/request_response.py` -> `parse_params()`

- **Priority:** path > query > body > header (path always wins).
- **Sources:**
  - **Path:** From resolver `path_params`.
  - **Query:** `request.query_params`.
  - **Body:** JSON (`application/json`) or form data (`application/x-www-form-urlencoded`, `multipart/form-data`).
  - **Header:** Only when `params_definition` is provided — each param with `location="header"` reads from `request.headers`.

**With params_definition:** Only defined names are extracted from their configured location. Unknown keys are ignored.
**Without params_definition:** Backward-compatible merge: `path_params` -> `body` -> `query` -> `path_params` again (path overwrites).

### 3.2 Request Naming (camel -> snake)

Query `?naming=camel` converts body and query keys from camelCase to snake_case before merge. Path and header keys are not converted.

### 3.3 Type Coercion

**File:** `app/core/param_type.py`

After parsing, the runner applies type coercion for each defined parameter:

| `data_type` | Coercion rules |
|-------------|---------------|
| `string` | Strip whitespace |
| `integer` / `int` | `int()` or float with integer value. Booleans rejected. |
| `number` | `float()` |
| `boolean` / `bool` | true/false, 1/0, yes/no (string or int) |
| `array` | List, JSON array string, or comma-separated string |
| `object` / `obj` | Dict or JSON object string |

- If value is None/empty and `default_value` is set, the default is coerced and used.
- Params not in `params_definition` are left unchanged.

### 3.4 Parameter Validation (Scripts)

**File:** `app/core/param_validate.py`

If `param_validates_definition` is set, each validation script (RestrictedPython) runs:

```python
def validate(value, params=None):
    return True  # or False
```

Raises 400 with `message_when_fail` on first failure. Macros are prepended so helper functions are available.

### 3.5 Response Naming (snake -> camel)

**File:** `app/core/gateway/request_response.py` -> `format_response()`

If `?naming=camel` or `X-Response-Naming: camel`, all response keys are recursively converted to camelCase.

---

## 4. Concurrent Limit

**File:** `app/core/gateway/concurrent.py`

- **Purpose:** Limit in-flight requests per client or IP.
- **Client key:** `app_client.client_id` (authenticated) or `ip:{ip}` (public).
- **Effective limit:** Per-client `max_concurrent` if set and > 0, else global `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT`. If <= 0, no limit.
- **Redis:** Key `concurrent:gateway:{client_key}`, `INCR` + check + `EXPIRE 300s`. Over limit -> `DECR` + return False.
- **In-memory:** Dict-based counter. Not shared across workers.
- **Release:** Always in the `finally` block. Slots are freed regardless of success, 429, or 5xx.
- **Order:** Checked **before** rate limit. If 503, rate limit is not consumed.
- **Fail-open:** On Redis error, requests are allowed through.
- **Debug:** Set `CONCURRENT_DEBUG=1` to log acquire/release events.

---

## 5. Rate Limit

**File:** `app/core/gateway/ratelimit.py`

- **Kill switch:** `FLOW_CONTROL_RATE_LIMIT_ENABLED=False` disables all rate limiting.
- **Key selection:** `api:{api_id}:{client_key}` if the API has `rate_limit_per_minute > 0`, else `client:{client_key}` if the client has a limit. If neither is set, rate limiting is skipped.
- **Algorithm:** Sliding window, 60-second window.
  - **Redis:** Sorted set with timestamp scores. Remove expired entries, count, reject if >= limit.
  - **In-memory:** List of timestamps per key. Not shared across workers.
- **Fail-open:** On Redis error, requests are allowed.

---

## 6. Gateway Auth and API Access

**File:** `app/core/gateway/auth.py`

- **Token:** JWT from `POST /token/generate` with `client_id` and `client_secret`. Payload `sub` = `client_id`.
- **Expiry:** Per-client `token_expire_seconds` if set, otherwise global `GATEWAY_JWT_EXPIRE_SECONDS` (default 3600s).
- **Request header:** `Authorization: Bearer <token>`.
- **Client lookup:** Find `AppClient` by `client_id` from JWT payload, must be `is_active=True`.
- **API access (private only):** `client_can_access_api()` returns True if:
  - Direct link exists (`AppClientApiLink`), or
  - Client is in a group (`AppClientGroupLink`) that includes the API (`ApiAssignmentGroupLink`).

---

## 7. Runner

**File:** `app/core/gateway/runner.py`

1. **Load config:** `get_or_load_gateway_config(api, session)` -> content, params, validates, result_transform, macros. From Redis cache or DB.
2. **Prepend macros:** SQL macros prepended to SQL content; Python macros prepended to script content.
3. **Required check:** Missing required params -> 400.
4. **Type coercion:** `validate_and_coerce_params()` -> 400 on `ParamTypeError`.
5. **Param validation:** `run_param_validates()` -> 400 on `ParamValidateError`.
6. **Datasource check:** Inactive datasource -> 500.
7. **Execute:** Dispatch to SQL or Script engine via `ApiExecutor`.
8. **Result transform:** Optional post-processing script (RestrictedPython). On error -> 400.
9. **Access log:** Write `AccessRecord` with status 200 on success, 500 on error.

---

## 8. Response Envelope

**File:** `app/core/gateway/request_response.py`

All gateway responses use a standard envelope:

```json
{"success": true, "message": null, "data": [...]}
```

### How results are normalized

**SQL engine (single statement):**

```json
{"success": true, "message": null, "data": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}
```

**SQL engine (multi-statement):** Returns nested arrays — use a result transform to reshape:

```json
{"success": true, "message": null, "data": [[{"id": 1, "name": "Alice"}], [{"total": 42}]]}
```

**Script engine:** If the script returns `{"success": ..., "message": ..., "data": ...}`, those keys are promoted to the top-level envelope. Otherwise the return value is wrapped in `data`.

**Max rows:** `GATEWAY_MAX_RESPONSE_ROWS` (default 10,000) caps `data` length.

**Extra keys** from result transforms (e.g. `offset`, `limit`, `total`) are preserved alongside the standard envelope keys.

---

## 9. Config Cache

**File:** `app/core/gateway/config_cache.py`

- **Key:** `gateway:config:{api_assignment_id}`
- **TTL:** `GATEWAY_CONFIG_CACHE_TTL_SECONDS` (default 300s)
- **Contents:** content, params_definition, param_validates, result_transform, macros (Jinja2 and Python)
- **Source:** ApiContext + linked macro definitions + version commit snapshot
- **Behavior:** Redis miss or error -> load from DB and cache. Used by the runner to avoid DB hits per request.

---

## 10. SQL Engine (Jinja2)

**Files:** `app/engines/sql/template_engine.py`, `filters.py`, `extensions.py`, `app/engines/sql/executor.py`

### 10.1 Template Rendering

- **Environment:** Jinja2 `Environment` with `autoescape=False`, custom filters and extensions. Request parameters are passed as template variables.
- **Size limits:** `SQL_TEMPLATE_MAX_SIZE` (source), `SQL_RENDERED_MAX_SIZE` (rendered output). Exceeding either raises an error.
- **Parameter discovery:** `parse_parameters(template)` uses the Jinja2 AST to list undeclared variables — used by the Debug UI to auto-suggest parameters.

### 10.2 Filters

All filters handle `None` → `NULL`. Always use a filter on user-provided values — never output raw `{{ param }}`.

| Filter | Output | Example |
|--------|--------|---------|
| `sql_string` | `'escaped''value'` or `NULL` | `{{ name \| sql_string }}` |
| `sql_int` | `42` or `NULL` | `{{ age \| sql_int }}` |
| `sql_float` | `3.14` or `NULL` | `{{ price \| sql_float }}` |
| `sql_bool` | `TRUE` / `FALSE` or `NULL` | `{{ active \| sql_bool }}` |
| `sql_date` | `'2024-01-15'` or `NULL` | `{{ start \| sql_date }}` |
| `sql_datetime` | `'2024-01-15T10:30:00'` or `NULL` | `{{ ts \| sql_datetime }}` |
| `in_list` | `(1, 2, 3)` or `(SELECT 1 WHERE 1=0)` | `{{ ids \| in_list }}` |
| `sql_like` | `'%escaped%'` or `NULL` | `{{ q \| sql_like }}` |
| `sql_like_start` | `'prefix%'` | `{{ q \| sql_like_start }}` |
| `sql_like_end` | `'%suffix'` | `{{ q \| sql_like_end }}` |
| `json` | `'{"key": "val"}'` (JSON string) | `{{ payload \| json }}` |
| `fromjson` | Parses JSON string → dict/list | `{% set f = param \| fromjson %}` |
| `compare` | `> 100.0` or `BETWEEN 100.0 AND 500.0` | `{{ duration_ms \| compare }}` |
| `sql_ident` | `column_name` (safe identifier, no quoting) | `{{ col \| sql_ident }}` |

### 10.3 Extensions

- **`{% where %}...{% endwhere %}`** — Generates a `WHERE` clause only if at least one inner condition is present. Automatically strips the leading `AND` or `OR` (case-insensitive) from the first condition. Outputs nothing if all inner blocks are empty.
- **`{% set %}...{% endset %}`** — Set local template variables with optional default values.

### 10.4 Comparison Filters (`compare`, `sql_ident`, `fromjson`)

These filters work together to support dynamic numeric comparison queries from structured JSON parameters.

#### `compare`

Converts a JSON comparison object into a safe SQL expression. Accepts a JSON string or dict with `combinator` and `values` keys.

**Supported operators:** `>`, `>=`, `<`, `<=`, `=`, `!=`, `between`

```sql
{# Parameter data type should be "object" for best compatibility #}

{% if duration_ms %}AND duration_ms {{ duration_ms | compare }}{% endif %}
```

| Input | Output |
|-------|--------|
| `{"combinator": ">", "values": "100"}` | `> 100.0` |
| `{"combinator": "<=", "values": "999.99"}` | `<= 999.99` |
| `{"combinator": "between", "values": "100,500"}` | `BETWEEN 100.0 AND 500.0` |
| `None` or invalid | `` (empty string) |

- Operators are **whitelisted** — unknown operators return empty (no SQL injection).
- Values are parsed as `float` — non-numeric values return empty.
- Also accepts `value` as an alias for the `values` key.

#### `sql_ident`

Outputs a SQL identifier (column/table name) without quoting. Only allows safe characters: `[A-Za-z_][A-Za-z0-9_.]*`. Invalid input returns empty string.

Use `sql_ident` with `compare` in a `for` loop to avoid repeating the same pattern for many compare parameters:

```sql
{% set compare_fields = [
  ("duration_ms", duration_ms),
  ("total_amount", total_amount),
  ("balance", balance)
] %}

SELECT * FROM my_table
{% where %}
  {% if status %}AND status = {{ status | sql_string }}{% endif %}
  {% for col, val in compare_fields %}
    {% if val %}AND {{ col | sql_ident }} {{ val | compare }}{% endif %}
  {% endfor %}
{% endwhere %}
ORDER BY created_at DESC;
```

#### `fromjson`

Parses a JSON string into a Python dict/list for manual field access in templates. Returns `None` on invalid input.

```sql
{% set f = my_param | fromjson %}
{% if f %}AND col {{ f.combinator }} {{ f['values'] | sql_float }}{% endif %}
```

> **Note:** The `compare` filter handles JSON parsing internally, so `fromjson` is only needed when you want to access individual fields of a JSON parameter manually.

### 10.5 Multi-Statement SQL

Separate multiple SQL statements with `;`. The engine splits on semicolons (respecting string quotes, `$$` dollar-quoting, and comments) and executes each statement sequentially.

- **Single statement:** Returns one result set.
- **Multiple statements:** Returns a list of per-statement results: `[result1, result2, ...]`.
  - `SELECT` / `WITH` statements → `list[dict]` (rows)
  - `INSERT` / `UPDATE` / `DELETE` → `int` (affected row count)

**Common pattern** — data query + count query:

```sql
-- Statement 1: fetch rows
SELECT id, name, price FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}
{% endwhere %}
ORDER BY id DESC
LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};

-- Statement 2: total count
SELECT COUNT(*) AS total FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}
{% endwhere %};
```

Result: `[[{id, name, price}, ...], [{total: 42}]]`. Use a **result transform** to reshape this into `{data: [...], total: 42}`.

### 10.6 Execution

Rendered SQL runs via the connection pool for the configured data source. Supported databases: PostgreSQL (psycopg), MySQL (pymysql), Trino (trino). Compatible-protocol DBs (StarRocks, RisingWave) work via the corresponding type.

---

## 11. Script Engine (Python Sandbox)

**Files:** `app/engines/script/executor.py`, `context.py`, `sandbox.py`, `app/engines/script/modules/`

### 11.1 Sandbox

RestrictedPython — no arbitrary imports, no file system access, no `exec`/`eval`/`compile`/`__import__`.

**Safe built-ins** available as globals: `dict`, `list`, `set`, `tuple`, `str`, `int`, `float`, `bool`, `range`, `type`, `len`, `min`, `max`, `sum`, `abs`, `round`, `sorted`, `enumerate`, `zip`, `map`, `filter`, `json` (loads/dumps), `datetime`, `date`, `time`, `timedelta`.

**Extra modules:** `SCRIPT_EXTRA_MODULES` (comma-separated). Only top-level module names matching `^[a-zA-Z_][a-zA-Z0-9_]*$`. Modules must be installed in the backend environment. Injected as globals (no import needed).

### 11.2 Context Objects

| Object | Methods | Description |
|--------|---------|-------------|
| `req` | Dict access (`req.get(key)`, `req[key]`, `req.items()`) | Merged parameters (path > query > body > header) |
| `db` | `query(sql, params?)` → `list[dict]`, `query_one(sql, params?)` → `dict\|None`, `execute(sql, params?)` → `int` | Database operations against the configured data source. Use `%s` placeholders. |
| `tx` | `begin()`, `commit()`, `rollback()` | Explicit transactions. All db calls within tx share one connection. |
| `http` | `get(url, **kw)`, `post(url, **kw)`, `put(url, **kw)`, `delete(url, **kw)` | Outbound HTTP. Supports `params`, `headers`, `cookies`, `json`, `data`, `content` kwargs. 30s default timeout. Restricted by `SCRIPT_HTTP_ALLOWED_HOSTS`. |
| `cache` | `get(key)`, `set(key, value, ttl_seconds?)`, `delete(key)`, `exists(key)` → `bool`, `incr(key, amount?)` → `int`, `decr(key, amount?)` → `int` | Redis cache. Keys auto-prefixed with `script:`. No-ops when Redis unavailable. |
| `log` | `info(msg, extra?)`, `warning(msg, extra?)`, `error(msg, extra?)`, `debug(msg, extra?)` | Backend logger with script context. |
| `env` | `get(key, default?)`, `get_int(key, default?)`, `get_bool(key, default?)` | Whitelisted environment variables. Prevents secret leakage. |
| `ds` | Dict access: `ds["name"]`, `ds["product_type"]`, `ds["host"]`, `ds["port"]`, `ds["database"]` | Read-only data source metadata. |

### 11.3 Returning Results

The executor checks for results in this order:

1. **Function style (preferred):** If the script defines `def execute(params=None)`, it is called with `req` (the merged params dict), and its return value becomes the result.
2. **Variable style:** If the script assigns to the global `result` variable, that value is returned.
3. **Neither:** Returns `None` (gateway wraps it as `{"success": true, "data": null}`).

### 11.4 Execution

- **Timeout:** `SCRIPT_EXEC_TIMEOUT` seconds. Thread-based, works on all platforms.
- **Connection:** One database connection per script run (or shared across calls when inside `tx.begin()`). Released in `finally`.
- **Macros:** Python macros from Macro Definitions are string-concatenated before the script content, making macro functions callable directly.

---

## 12. Result Transform

**File:** `app/core/result_transform.py`

- Python script (RestrictedPython) receives `result` (executor output) and `params`.
- Must assign to `result`.
- Macros are prepended for helper functions.
- Raises `ResultTransformError` on failure -> 400.

---

## 13. Firewall

**File:** `app/core/gateway/firewall.py`

- `check_firewall(ip, session)` currently always returns True (all IPs allowed).
- No CRUD API or UI. Model exists for future use.
- Default behavior controlled by `GATEWAY_FIREWALL_DEFAULT_ALLOW`.

---

## Status Code Summary

| Cause | Code |
|-------|------|
| Firewall deny | 403 |
| Path/method not found | 404 |
| Private API, no/invalid token | 401 |
| Client not allowed for API | 403 |
| Over concurrent limit | 503 |
| Over rate limit | 429 |
| Missing required param | 400 |
| Param type/coercion error | 400 |
| Param validation script failure | 400 |
| Result transform error | 400 |
| DataSource inactive / execution error | 500 |
| Success | 200 |

---

## See Also

- [OVERVIEW.md](./OVERVIEW.md) — End-to-end flow, features, and concepts
- [EXAMPLES.md](./EXAMPLES.md) — Cookbook-style recipes for SQL and Script APIs
- [ENV_REFERENCE.md](./ENV_REFERENCE.md) — Environment variable reference
