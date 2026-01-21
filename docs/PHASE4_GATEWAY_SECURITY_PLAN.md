# PHASE 4: Gateway & Security – Implementation Plan

> Based on `docs/MIGRATION_PLAN_SQLREST.md`.  
> **Prerequisites:** Phase 1 (models, migrations, config), Phase 2 (DataSource, ApiAssignment, ApiModule, ApiGroup, AppClient, FirewallRules, …), Phase 3 (Pool, SQL Jinja2, Script Python, ApiExecutor).  
> **Goal:** Dynamic gateway `/api/{module}/{path}` executes SQL/Script and returns JSON; token auth for clients; IP firewall; rate limiting; request/response normalization (form, JSON; camelCase, snake_case).

---

## 1. Overview

| Task | Directory / file | Description |
|------|------------------|-------------|
| **4.1** | `api/routes/gateway.py`, `core/gateway/` | Dynamic gateway: resolve module/path, call ApiExecutor, return JSON |
| **4.2** | `core/gateway/auth.py`, `core/gateway/firewall.py`, `core/gateway/ratelimit.py` | Token auth (client), IP firewall, rate limiting |
| **4.3** | `core/gateway/request_response.py` | Collect params (form, JSON, query, path); naming (camelCase, snake_case) |

**Technology:**

- **Auth:** JWT (client credentials) or `client_id`+`client_secret` (Basic / X-API-Key); `verify_password` (bcrypt) for `client_secret`.
- **Firewall:** `ipaddress` (stdlib) to check IP in CIDR; `FirewallRules` (allow/deny).
- **Rate limit:** Redis or in-memory; `slowapi` or custom middleware/dependency.

---

## 2. Implementation Order and Dependencies

```
4.2a Token auth (verify client)     ──┐
4.2b IP firewall                     ├──► 4.1 Gateway (route + resolve + execute)
4.2c Rate limiting                   ──┤
4.3 Request/response (params, naming)──┘
```

**Suggested order:**  
4.2a (auth) → 4.2b (firewall) → 4.2c (rate limit) → 4.3 (request/response) → 4.1 (gateway route, integrate all).

---

## 3. Task 4.1: Dynamic Gateway

**File route:** `backend/app/api/routes/gateway.py`  
**Core logic:** `backend/app/core/gateway/`

**URL pattern (per Migration Plan):**  
`/api/{module}/{path:path}`  
→ `{module}` = one segment (e.g. `v1`, `public`, `myapi`); `{path}` = the rest (e.g. `users`, `users/123`, `orders/1/items`).

**Note:** Gateway is mounted at app root with prefix `/api`; admin APIs remain at `{API_V1_STR}` = `/api/v1/...`.

---

### 3.1 Directory layout (core/gateway)

```
backend/app/core/
└── gateway/
    ├── __init__.py           # export: resolve_and_execute, GatewayRequest
    ├── resolver.py           # resolve_module, resolve_api_assignment, extract_path_params
    ├── auth.py               # verify_gateway_client (Bearer, Basic, X-API-Key) -> AppClient | None
    ├── firewall.py           # check_firewall(ip: str) -> bool  (True = allow)
    ├── ratelimit.py          # check_rate_limit(client_id|ip, ...) -> bool
    ├── request_response.py   # parse_params, normalize_naming, format_response
    └── runner.py             # build params, call ApiExecutor, format result, log AccessRecord
```

---

### 3.2 resolver.py – Resolve module and API

#### 3.2.1 `{module}` convention

- `ApiModule.path_prefix`: values like `"/"`, `"/v1"`, `"/public"`.
- **Gateway segment** to match: `path_prefix.strip("/")` or, if empty, normalized `name` (lowercase, replace spaces with `-`).
- **Recommendation:** Add column `gateway_key: str | None` (unique) to `ApiModule` for clearer URLs; Phase 4 may temporarily use: `gateway_key = (path_prefix or "/").strip("/") or _slug(module.name)`.
- If no `gateway_key`:  
  `segment = (m.path_prefix or "/").strip("/") or re.sub(r"[^a-z0-9\-]", "-", m.name.lower())`

#### 3.2.2 resolve_module(segment: str, session: Session) -> ApiModule | None

- Fetch `ApiModule` with `is_active=True` and `gateway_key=segment` (if present) or match `gateway_key` derived from `path_prefix`/`name` as above.
- If multiple modules share a segment: take by `sort_order`, `id`.

#### 3.2.3 resolve_api_assignment(module_id, path: str, method: str, session: Session) -> tuple[ApiAssignment, dict] | None

- `path`: the `{path}` part of the URL, no leading slash (e.g. `users/123`).
- Fetch `ApiAssignment` list in `module_id` with `is_published=True`, `http_method=method`.
- For each `ApiAssignment.path` (e.g. `users/{id}`), convert to regex:  
  `"users/\{id\}"` → `r"^users/(?P<id>[^/]+)$"`; `"users"` → `r"^users$"`.
- Match `path` against each pattern; use `groupdict()` as `path_params`.
- Return `(ApiAssignment, path_params)` for the first match; otherwise `None`.

**Helper:** `path_to_regex(pattern: str) -> re.Pattern`  
- Replace `{name}` with `(?P<name>[^/]+)`; escape regex special characters.

#### 3.2.4 An API may have no path params

- `ApiAssignment.path = "list"` → regex `^list$`; `path_params = {}`.

---

### 3.3 runner.py – Run API and log

#### 3.3.1 run(api: ApiAssignment, params: dict, *, session, app_client_id?, ip, http_method, request_path) -> dict | list

1. Load `ApiContext` (content), `DataSource` (if `datasource_id`).
2. `ApiExecutor.execute(engine=api.execute_engine, content=api_context.content, params=params, datasource_id=api.datasource_id, datasource=..., session=session)`.
3. Normalize result (see 3.6) → JSON-serializable.
4. Write `AccessRecord`: `api_assignment_id`, `app_client_id`, `ip_address`, `http_method`, `path=request_path`, `status_code=200`, `request_body` (policy-dependent: may omit or truncate to avoid secrets).

#### 3.3.2 Errors

- 4xx/5xx: still write `AccessRecord` with corresponding `status_code`; `request_body` is policy-dependent.

---

### 3.4 Gateway endpoint

**Mount:** Gateway router at `app.include_router(gateway_router, prefix="/api")`; route `/{module}/{path:path}`.

**Example:** `GET/POST/PUT/PATCH/DELETE /api/{module}/{path:path}`

**Processing flow (dependency / middleware):**

1. **Get IP:** `request.client.host` or `X-Forwarded-For` (use rightmost if multiple; beware spoofing).
2. **Firewall:** `firewall.check_firewall(ip)` → if `False` then `403 Forbidden`.
3. **Auth:** `auth.verify_gateway_client(request) -> AppClient | None`; if `None` → `401 Unauthorized`.
4. **Rate limit:** `ratelimit.check_rate_limit(key=app_client.client_id or ip)` → if exceeded then `429 Too Many Requests`.
5. **Resolve:** `resolve_module(module)`, `resolve_api_assignment(module_id, path, method)`; if not found → `404 Not Found`.
6. **ApiGroup authorization (optional):**  
   - If `AppClient`↔`ApiGroup` link table exists: ensure client has at least one group in common with `api.group_links`.  
   - If no link table: skip; any authenticated client may call any published API.
7. **Params:** `request_response.parse_params(request, path_params, api.http_method)`.
8. **Run:** `runner.run(api, params, session=..., app_client_id=app_client.id, ip=..., http_method=..., request_path=...)`.
9. **Response:** `format_response(result, request)` (naming, Content-Type) → JSONResponse.

---

### 3.5 Token endpoint (for clients to obtain JWT)

**Endpoint:** `POST /token/generate`  
**Request (JSON or form):**

- `client_id: str`
- `client_secret: str`
- `grant_type: str` = `"client_credentials"` (optional, default)

**Response:**

- Success: `{"access_token": "...", "token_type": "bearer", "expires_in": 3600}`.
- JWT payload: `sub=client_id`, `exp`, `iat`; use `SECRET_KEY` and `ALGORITHM` as for web login (or separate `GATEWAY_JWT_SECRET` if needed).

**Logic:**

- Find `AppClient` by `client_id`, `is_active=True`.
- `verify_password(plain=client_secret, hashed=client.client_secret)`.
- `create_access_token(subject=client_id, expires_delta=timedelta(seconds=3600))`.

**Note:** `POST /token/generate` must **not** require Bearer (this is where the token is obtained). Firewall + rate limit by IP may be applied separately if needed.

---

### 3.6 format_response (request_response.py)

- Take `result` from `ApiExecutor` (e.g. `{"data": [...]}`, `{"rowcount": 5}`).
- Query `?naming=snake|camel` or `Accept` / header per design: if `camel`, recursively convert keys to camelCase.
- Return JSON: `{"data": ...}` or `{"rowcount": ...}` (preserve structure from ApiExecutor).

---

## 4. Task 4.2: Token auth, IP firewall, Rate limiting

---

### 4.1 Task 4.2a: Token auth for client (auth.py)

**Goal:** Authenticate requests to the Gateway (not applied to `POST /token/generate`).

#### 4.2a.1 Supported methods

| Method | How to send | How to verify |
|--------|-------------|---------------|
| **Bearer JWT** | `Authorization: Bearer <jwt>` | Decode JWT, `sub` = `client_id` → load `AppClient`, check `is_active`. |
| **Basic** | `Authorization: Basic base64(client_id:client_secret)` | Decode, find `AppClient` by `client_id`, `verify_password(plain, hashed)`. |
| **X-API-Key** (optional) | `X-API-Key: base64(client_id:client_secret)` | Same as Basic. |

**Priority order:** Bearer → Basic → X-API-Key. Stop at the first method that has a value.

#### 4.2a.2 verify_gateway_client(request: Request, session: Session) -> AppClient | None

- Read `Authorization`; if `Bearer ` → JWT: `jwt.decode(..., options=verify_exp)`; `sub` = `client_id`.
- If `Basic ` → decode base64 → `client_id:client_secret`; verify with `verify_password`.
- If `X-API-Key` (and supported) → same as Basic.
- Load `AppClient` by `client_id`; if not found or `not is_active` → `None`.
- Return `AppClient` model (for `id`, `client_id` in rate limit and AccessRecord).

#### 4.2a.3 JWT for Gateway

- May use existing `create_access_token` and `SECRET_KEY`; or `GATEWAY_JWT_SECRET`, `GATEWAY_JWT_EXPIRE_SECONDS` if separated.
- `create_access_token(subject=client_id, expires_delta=...)` (in `core/security.py` or `gateway/auth.py`).

---

### 4.2 Task 4.2b: IP Firewall (firewall.py)

**Source:** `FirewallRules` (rule_type: allow/deny, ip_range: CIDR or single IP, is_active, sort_order).

#### 4.2b.1 check_firewall(ip: str, session: Session) -> bool

- `True` = allow; `False` = deny (return 403).
- Normalize `ip` (IPv4/IPv6); if unparseable, may deny or follow policy.
- Query `FirewallRules` with `is_active=True`, order by `sort_order`, `id`.
- For each rule:
  - `ip_range`: use `ipaddress.ip_network(ip_range, strict=False)` and `ip_address(ip) in network` (or equivalent).
  - If `rule_type == DENY` and IP is in `ip_range` → return `False` (deny).
  - If `rule_type == ALLOW` and IP is in `ip_range` → return `True` (allow).
- **Default (no rule matches):** `GATEWAY_FIREWALL_DEFAULT_ALLOW: bool` (e.g. `True` = allow; `False` = deny). Phase 4 default `True` for compatibility.

**Note:** DENY should take precedence: if a DENY rule matches, deny immediately. Suggested: iterate by `sort_order`; on DENY match → `False`; on ALLOW match → `True`; after list → default.

---

### 4.3 Task 4.2c: Rate limiting (ratelimit.py)

**Config (already in config):**

- `FLOW_CONTROL_RATE_LIMIT_ENABLED: bool`
- `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE: int`
- May add: `FLOW_CONTROL_RATE_LIMIT_PER_CLIENT`, `FLOW_CONTROL_RATE_LIMIT_PER_IP` (if split).

#### 4.2c.1 Key

- If authenticated: `client_id` (or `app_client.client_id`).
- If not authenticated (not used for main gateway since auth is required; can be used for `POST /token/generate`): `ip`.

#### 4.2c.2 Algorithm

- **Sliding or fixed window** (e.g. 60 req/min).
- **Redis:** key `ratelimit:gateway:{key}`, `INCR`, `EXPIRE`; or use `slidingwindow`.
- **In-memory (fallback):** dict `{key: [timestamp, ...]}`; prune timestamps older than 1 minute; if `len >= PER_MINUTE` → deny. Note: in-memory is not shared across instances.

**API:** `check_rate_limit(key: str) -> bool`  
- `True` = allow; `False` = over limit → 429.

**Response headers (optional):**  
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

---

### 4.4 Additional config (config.py)

```python
# Gateway
GATEWAY_STR: str = "/api"                   # gateway prefix for /api/{module}/{path:path} (optional, for reverse-proxy)
GATEWAY_JWT_EXPIRE_SECONDS: int = 3600      # JWT for client (if separate)
GATEWAY_FIREWALL_DEFAULT_ALLOW: bool = True # When no rule matches
GATEWAY_AUTH_X_API_KEY_ENABLED: bool = True # Allow X-API-Key or not
GATEWAY_ACCESS_LOG_BODY: bool = False       # Log request_body to AccessRecord or not
```

---

## 5. Task 4.3: Request / Response (form, JSON; naming)

---

### 5.1 parse_params (request_response.py)

**Input:** `request: Request`, `path_params: dict`, `http_method: str`.

**Parameter sources:**

- **Path:** `path_params` (from resolver): `{"id": "123", ...}`.
- **Query:** `request.query_params` (GET, or any method if allowed).
- **Body:**
  - `Content-Type: application/json` → `request.json()`.
  - `Content-Type: application/x-www-form-urlencoded` → `request.form()`.
  - `multipart/form-data`: may support `request.form()` (fields only, no files) or skip in Phase 4.

**Merge:** `path_params` + `query` + `body`; on key conflict: path > query > body (or body > query > path — pick one; suggested: path has highest priority).

**Returns:** `dict[str, Any]` for `ApiExecutor.execute(..., params=...)`.

---

### 5.2 Naming: camelCase / snake_case

**Request:**

- Query `?naming=snake` or `?naming=camel` (default `snake`).
- If `camel`: convert all keys in body/query from camelCase to snake_case before merge (e.g. `userId` → `user_id`).  
- May be skipped: client sends snake_case as in Jinja2/script.

**Response:**

- Query `?naming=camel` or header `X-Response-Naming: camel`: recursively convert keys of `data`/`rowcount` structure to camelCase.
- Default: leave as-is (snake_case if DB/engine returns snake).

**Functions:**

- `keys_to_snake(d: dict) -> dict`
- `keys_to_camel(d: dict) -> dict` (e.g. `userId`, `firstName`).

---

### 5.3 Content-Type response

- Always `application/json` for Gateway (except 204 No Content if used).  
- Naming only affects JSON content, not Content-Type.

---

## 6. Client authorization – ApiGroup (optional)

**Current state:** `ApiAssignment` ↔ `ApiGroup` (ApiAssignmentGroupLink). No `AppClient` ↔ `ApiGroup` yet.

**Option A – Skip in Phase 4:**  
Any authenticated client may call any published API. Can be added later.

**Option B – Fine-grained:**  
Add table `app_client_group_link` (app_client_id, api_group_id). Gateway:  
- Get `group_ids` of `ApiAssignment` from `group_links`.  
- If `group_ids` is empty → allow (API belongs to no group).  
- If not empty: client must have at least one matching `api_group_id` → allow; otherwise 403.

**Phase 4 recommendation:** Use **Option A**; design a placeholder call for “gateway_check_groups(api, app_client)” for easy addition of Option B later.

---

## 7. Route registration and mount

### 7.1 main.py (app)

- Gateway may need `Session` but does **not** use `CurrentUser` (auth is client token).  
- Create `Session` via `get_session`/`SessionDep` or middleware; `get_db` may use `yield` as in other routes.

### 7.2 api/main.py

```python
from app.api.routes import gateway

# Gateway: app.include_router(gateway_router, prefix="/api") in main.py (after api_router).
# Route: /{module}/{path:path} → full URL /api/{module}/{path:path}
```

**Note:** `POST /token/generate` is mounted at app root. The gateway `/{module}/{path:path}` is under `/api`, so no conflict. Admin APIs stay at `/api/v1/...`.

---

### 7.3 Gateway router structure

```python
# gateway.py

# In app/api/routes/token.py (mounted at app root):
@router.post("/generate")  # prefix /token → POST /token/generate
def token_generate(...): ...

# In app/api/routes/gateway.py (mounted at /api):
@router.api_route("/{module}/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"])
def gateway_proxy(module: str, path: str, request: Request, session: SessionDep): ...
```

---

## 8. Files to create or update

### Create

| File | Notes |
|------|-------|
| `app/core/gateway/__init__.py` | Export: resolve_and_execute, verify_gateway_client, check_firewall, check_rate_limit, parse_params, format_response |
| `app/core/gateway/resolver.py` | resolve_module, resolve_api_assignment, path_to_regex, extract_path_params |
| `app/core/gateway/auth.py` | verify_gateway_client (Bearer, Basic, X-API-Key) |
| `app/core/gateway/firewall.py` | check_firewall(ip, session) |
| `app/core/gateway/ratelimit.py` | check_rate_limit(key) — Redis + fallback in-memory |
| `app/core/gateway/request_response.py` | parse_params, keys_to_snake, keys_to_camel, format_response |
| `app/core/gateway/runner.py` | run(api, params, session, app_client_id, ip, http_method, request_path); write AccessRecord |
| `app/api/routes/token.py` | POST /generate (prefix /token → POST /token/generate) |
| `app/api/routes/gateway.py` | GET/POST/PUT/PATCH/DELETE /{module}/{path:path}; call firewall → auth → rate limit → resolve → parse_params → run → format_response |

### Update

| File | Changes |
|------|---------|
| `app/core/config.py` | GATEWAY_STR, GATEWAY_JWT_EXPIRE_SECONDS, GATEWAY_FIREWALL_DEFAULT_ALLOW, GATEWAY_AUTH_X_API_KEY_ENABLED, GATEWAY_ACCESS_LOG_BODY |
| `app/main.py` | include_router(gateway_router, prefix="/api") – after api_router |
| `app/main.py` | include_router(token_router) at app root for POST /token/generate |
| `app/models_dbapi.py` | (Option B) Add `AppClientGroupLink` and `gateway_key` on `ApiModule`; Alembic migration |
| `app/core/security.py` | (If separate) create_gateway_token, verify_gateway_token; or reuse create_access_token with GATEWAY_JWT_EXPIRE_SECONDS |

### Dependencies (pyproject.toml)

- `slowapi` (optional, for rate limit): `slowapi>=0.1.9`  
- Or implement with `redis` (already present).  
- `ipaddress` (stdlib).  
- `jwt`, `passlib` (already present).

---

## 9. Testing (suggested)

### Unit

- **resolver:** `path_to_regex("users/{id}")` matches `users/123` → `{id: "123"}`; `resolve_module` with fake DB; `resolve_api_assignment` with a few ApiAssignments.
- **auth:** Mock request with Bearer/Basic/X-API-Key; `verify_gateway_client` returns AppClient or None.
- **firewall:** `check_firewall` with allow/deny rules and IP inside/outside CIDR; default allow/deny.
- **ratelimit:** `check_rate_limit` with Redis mock or in-memory; over limit → False.
- **request_response:** `parse_params` with query, JSON body, form; merge path; `keys_to_camel` / `keys_to_snake`.

### Integration

- Create AppClient, ApiModule (path_prefix/gateway_key), published ApiAssignment + ApiContext (simple SQL), DataSource.
- Call `POST /token/generate` with client_id/secret → receive JWT.
- Call `GET /api/{module}/{path}` with `Authorization: Bearer <jwt>` → 200, JSON body.
- Call without token → 401.
- Add FirewallRules DENY for test IP → 403.
- Call over rate limit → 429.
- Call `POST /api/{module}/{path}` with JSON body, `?naming=camel` → verify params to SQL and response naming.

### Test locations

- `tests/core/gateway/test_resolver.py`
- `tests/core/gateway/test_auth.py`
- `tests/core/gateway/test_firewall.py`
- `tests/core/gateway/test_ratelimit.py`
- `tests/core/gateway/test_request_response.py`
- `tests/api/routes/test_gateway.py` (integration)

---

## 10. Implementation checklist

- [ ] **4.2a** `core/gateway/auth.py`: verify_gateway_client (Bearer, Basic, X-API-Key); `create_access_token` / GATEWAY_JWT_EXPIRE
- [ ] **4.2a** `POST /token/generate`: client_id, client_secret → JWT
- [ ] **4.2b** `core/gateway/firewall.py`: check_firewall(ip, session); config GATEWAY_FIREWALL_DEFAULT_ALLOW
- [ ] **4.2c** `core/gateway/ratelimit.py`: check_rate_limit(key); Redis + in-memory; config FLOW_CONTROL_*
- [ ] **4.3** `core/gateway/request_response.py`: parse_params (path, query, JSON, form); keys_to_snake, keys_to_camel; format_response
- [ ] **4.1** `core/gateway/resolver.py`: resolve_module (path_prefix/gateway_key), resolve_api_assignment (path pattern → path_params)
- [ ] **4.1** `core/gateway/runner.py`: run(api, params, ...), ApiExecutor, AccessRecord
- [ ] **4.1** `api/routes/token.py`: POST /token/generate; `api/routes/gateway.py`: /{module}/{path:path}; middleware/deps: IP → firewall → auth → rate limit → resolve → parse_params → run → format
- [ ] `app/main.py`: include_router(gateway_router, prefix="/api") after api_router
- [ ] `config.py`: GATEWAY_*; verify FLOW_CONTROL_*
- [ ] (Optional) `ApiModule.gateway_key` + migration; `AppClientGroupLink` if using group-based authorization
- [ ] Unit tests: resolver, auth, firewall, ratelimit, request_response
- [ ] Integration: test_gateway (token, 200, 401, 403, 429, naming)

---

## 11. Security notes

- **Token:** Short-lived JWT; refresh may be added in a later phase. Do not log `client_secret` or passwords.
- **AccessRecord.request_body:** Default off (GATEWAY_ACCESS_LOG_BODY=False); if enabled, truncate or exclude sensitive fields.
- **Firewall:** Only trust `X-Forwarded-For` when behind a trusted proxy; may add `GATEWAY_TRUSTED_PROXY_COUNT`.
- **Rate limit:** Key by client_id to avoid one client exhausting capacity; IP-based limit for `POST /token/generate` to mitigate brute-force.
- **Path traversal:** `path` from Starlette `{path:path}` should not contain `//` or special segments with standard routing; still validate `module` and `path` for `..` or invalid characters if needed.

---

## 12. Extensions after Phase 4

- **AppClient ↔ ApiGroup:** Link table + 403 logic when client is not in the API’s group.
- **Webhook / alarm:** On Gateway 5xx or rate limit 429, invoke UnifyAlarm (Phase 6).
- **Caching:** Cache response by (module, path, params) with TTL (Phase 6).
- **Async:** Async Gateway; async ApiExecutor when Pool/engines move to async.
- **API versioning:** `ApiModule.path_prefix` or `gateway_key` already supports it (e.g. v1, v2).
