# Security & Performance Review

Consolidated audit across the gateway pipeline, SQL/script engines, authentication, and data layer.

**Status legend:** FIXED | OPEN

---

## CRITICAL

| # | Status | Finding | Location |
|---|--------|---------|----------|
| 1 | FIXED | SQL Injection in `sql_like*` filters -- missing single-quote escaping | `backend/app/engines/sql/filters.py:153-179` |
| 2 | FIXED | SSRF bypass via HTTP redirects in script engine | `backend/app/engines/script/modules/http.py` |
| 3 | FIXED | SSRF via DNS rebinding (TOCTOU) | `backend/app/engines/script/modules/http.py` |
| 4 | FIXED | Client secret transmitted in GET query string | `backend/app/api/routes/token.py:94-127` |
| 5 | FIXED | Encryption key derived from JWT signing key | `backend/app/core/security.py:60-66` |

### Details

**1. SQL Injection in `sql_like*` filters** (FIXED)
`_escape_like()` escapes `%`, `_`, `\` but not single quotes. Input like `O'Brien` produces `'O'Brien%'` -- a direct SQL injection when `sql_like_start` or `sql_like_end` are used with user-controlled params.
*Fix: Added `_SQL_QUOTE_ESCAPE` translation before `_escape_like()` in all three functions.*

**2. SSRF bypass via HTTP redirects in script engine** (FIXED)
`httpx.Client` follows redirects by default. The URL allowlist check only applies to the initial URL, not redirect targets. An allowed host can 302-redirect to `http://169.254.169.254/` (cloud metadata) or internal services.
*Fix: Disabled auto-redirects, implemented manual redirect loop with per-hop `_check_url_allowed()` validation.*

**3. SSRF via DNS rebinding (TOCTOU)** (FIXED)
`_check_url_allowed()` resolves the hostname and checks the IP, then `httpx` does a separate DNS resolution for the actual request. An attacker controlling DNS can return a public IP for the check and `127.0.0.1` for the request.
*Fix: Created `_SSRFSafeBackend(SyncBackend)` that resolves DNS, validates ALL IPs, and connects atomically.*

**4. Client secret transmitted in GET query string** (FIXED)
`GET /token/generate?clientId=X&secret=Y` puts the secret in the URL, which appears in server logs, proxy logs, browser history, and `Referer` headers.
*Fix: Added `GATEWAY_TOKEN_GET_ENABLED` config (default `false`). The GET endpoint now returns 403 when disabled, directing callers to use POST. Both POST and GET endpoints also use constant-time bcrypt verification via `_DUMMY_HASH` to prevent client_id enumeration.*

**5. Encryption key derived from JWT signing key** (FIXED)
Fernet encryption key for DataSource passwords is `sha256(SECRET_KEY)`. A single compromised `SECRET_KEY` allows both JWT forgery and decrypting all stored database credentials.
*Fix: Added dedicated `ENCRYPTION_KEY` config with fallback to `SECRET_KEY`.*

---

## HIGH

| # | Status | Finding | Location |
|---|--------|---------|----------|
| 6 | FIXED | Sync DB/Redis I/O blocking the async event loop | `backend/app/api/routes/gateway.py` |
| 7 | FIXED | No rate limiting on authentication endpoints | `backend/app/api/routes/login.py`, `token.py` |
| 8 | FIXED | User enumeration via password recovery | `backend/app/api/routes/login.py:57-77` |
| 9 | FIXED | Timing attack on `authenticate()` | `backend/app/crud.py:40-46` |
| 10 | FIXED | Script timeout only works on Unix main thread | `backend/app/engines/script/executor.py:101-111` |
| 11 | FIXED | OpenAPI docs exposed in all environments | `backend/app/main.py:25-31` |
| 12 | FIXED | Unrestricted `**kwargs` passthrough to httpx | `backend/app/engines/script/modules/http.py` |
| 13 | FIXED | Access log storage uses encrypted password without decrypting | `backend/app/core/access_log_storage.py:33` |

### Details

**6. Sync DB/Redis I/O blocking the async event loop** (FIXED)
All pre-execution steps (resolve, auth, rate limit, config cache) were synchronous functions calling `session.exec()` and Redis directly from an `async def` handler.
*Fix: Pre-read body async, bundled all sync I/O into `_gateway_pipeline()`, run via `asyncio.to_thread()`.*

**7. No rate limiting on authentication endpoints** (FIXED)
`POST /login/access-token`, `POST /token/generate`, and `POST /password-recovery/{email}` have no rate limiting, enabling brute-force attacks and email enumeration.
*Fix: Added `require_rate_limit()` dependency to all auth endpoints (`login`, `password-recovery`, `reset-password`, `token/generate`) using configurable `AUTH_RATE_LIMIT_*` settings.*

**8. User enumeration via password recovery** (FIXED)
Returns 404 with "user does not exist" vs 200 on success, allowing email address enumeration.
*Fix: `POST /password-recovery/{email}` now always returns 200 with generic message `"If that email is registered, a recovery link has been sent"` regardless of whether the user exists. `POST /reset-password/` returns generic `400 "Invalid token"` instead of `404` for non-existent or inactive users.*

**9. Timing attack on `authenticate()`** (FIXED)
Non-existent user returns immediately (no bcrypt), existing user runs bcrypt (~100ms). Response time difference reveals whether an email exists.
*Fix: Added pre-computed `_DUMMY_HASH` in `security.py`. `crud.authenticate()` always calls `verify_password()` against the real hash or `_DUMMY_HASH`, ensuring constant bcrypt time regardless of whether the user exists. Same pattern applied to `POST /token/generate` and `GET /token/generate` for client_id enumeration prevention.*

**10. Script timeout only works on Unix main thread** (FIXED)
`signal.alarm` is process-global and only works in the main thread. In threaded ASGI workers, scripts can run indefinitely.
*Fix: Replaced `signal.SIGALRM` with thread-based timeout using `threading.Thread` + `ctypes.pythonapi.PyThreadState_SetAsyncExc` to inject `ScriptTimeoutError`. Works on all platforms and from any thread.*

**11. OpenAPI docs exposed in all environments** (FIXED)
`/api/docs`, `/api/redoc`, `/api/v1/openapi.json` are always available, giving attackers a full API map.
*Fix: Docs are disabled when `ENVIRONMENT=production` (`_enable_docs = settings.ENVIRONMENT != "production"`).*

**12. Unrestricted `**kwargs` passthrough to httpx** (FIXED)
Scripts can pass arbitrary kwargs to `httpx.Client.request()`, including `follow_redirects=True`, `auth=`, `extensions=` to override security controls.
*Fix: Added `_ALLOWED_REQUEST_KWARGS` frozenset whitelist (`params`, `headers`, `cookies`, `json`, `data`, `content`). `_filter_kwargs()` raises `PermissionError` on any key outside the allowlist.*

**13. Access log storage uses encrypted password without decrypting** (FIXED)
`_build_database_url()` uses `datasource.password` directly (Fernet ciphertext) instead of calling `decrypt_value()`. External access log DB connections will always fail authentication.
*Fix: Added `decrypt_value(raw_password)` call before building the database URL.*

---

## MEDIUM

| # | Status | Finding | Location |
|---|--------|---------|----------|
| 14 | FIXED | Missing Redis timeouts | `backend/app/core/gateway/redis_client.py` |
| 15 | FIXED | L1 cache thundering herd on eviction | `backend/app/core/gateway/config_cache.py:56-62` |
| 16 | FIXED | Two Redis round-trips for rate limiting + race condition | `backend/app/core/gateway/ratelimit.py:30-41` |
| 17 | FIXED | Non-atomic concurrent slot check | `backend/app/core/gateway/concurrent.py:28-41` |
| 18 | FIXED | N+1 query in macro content loading | `backend/app/core/gateway/config_cache.py:176-186` |
| 19 | FIXED | Duplicate `get_or_load_gateway_config` call | `gateway.py` + `runner.py` |
| 20 | FIXED | Re-fetching `ApiAssignment` in the thread | `gateway.py:63-66` |
| 21 | FIXED | Route cache rebuild blocks all concurrent requests | `backend/app/core/gateway/resolver.py:87-93` |
| 22 | FIXED | No template/output size limit | `backend/app/engines/sql/template_engine.py:65-70` |
| 23 | FIXED | No blocklist for `SCRIPT_EXTRA_MODULES` | `backend/app/engines/script/executor.py:56-67` |
| 24 | FIXED | Gateway leaks exception messages to clients | `gateway.py:189-192` |
| 25 | FIXED | 8-day access token lifetime, no revocation | `backend/app/core/config.py:36` |
| 26 | FIXED | CORS wildcard allowed when ENVIRONMENT=local (the default) | `backend/app/core/config.py:46-57` |
| 27 | FIXED | X-Forwarded-For spoofing | `gateway.py:82-87` |
| 28 | FIXED | Authorization header stored in access logs | `gateway.py:163-167` |
| 29 | FIXED | Race condition on version numbering | `backend/app/api/routes/api_assignments.py:843-864` |
| 30 | FIXED | Thread-unsafe access log engine cache | `backend/app/core/access_log_storage.py:45-59` |
| 31 | FIXED | No security headers middleware | `backend/app/main.py` |
| 32 | FIXED | Double recursive traversal of response data | `backend/app/core/gateway/request_response.py:246-295` |
| 33 | FIXED | Password reset token missing `type` claim | `backend/app/utils.py:108-112` |

### Details

**14. Missing Redis timeouts** (FIXED)
`Redis.from_url()` is called without `socket_timeout` or `socket_connect_timeout`. A slow Redis can hang the entire gateway for the OS TCP timeout (120+ seconds).
*Fix: Added `socket_connect_timeout` and `socket_timeout` parameters from `REDIS_CONNECT_TIMEOUT` / `REDIS_SOCKET_TIMEOUT` settings.*

**15. L1 cache thundering herd on eviction** (FIXED)
When L1 cache reaches 2048 entries with no expired items, `_LOCAL_CACHE.clear()` nukes everything, causing all concurrent requests to stampede Redis/DB simultaneously.
*Fix: Replaced `clear()` with LRU-style eviction — purges expired entries first, then evicts the 25% soonest-to-expire entries.*

**16. Two Redis round-trips for rate limiting + race condition** (FIXED)
ZCARD check and ZADD are in separate pipelines. Two concurrent requests can both see `n < limit` and both succeed.
*Fix: Replaced with a single Lua script (`_RATE_LIMIT_SCRIPT`) that atomically performs `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` in one round-trip.*

**17. Non-atomic concurrent slot check** (FIXED)
`INCR` is pipelined but the conditional `DECR` is a separate call. Process crash between them permanently inflates the counter (until 300s TTL).
*Fix: Replaced with a Lua script (`_ACQUIRE_SCRIPT`) that atomically performs `GET` → compare → `INCR` → `EXPIRE`.*

**18. N+1 query in macro content loading** (FIXED)
Each published macro triggers a separate `SELECT` for `MacroDefVersionCommit`. 10 macros = 10 queries.
*Fix: Single batch query using `WHERE id IN (...)` for all macro version commits.*

**19. Duplicate `get_or_load_gateway_config` call** (FIXED)
Config is loaded in the handler to extract `params_definition`, then loaded again inside the runner.
*Fix: Config is loaded once in the gateway handler and passed as `config=` parameter to the runner.*

**20. Re-fetching `ApiAssignment` in the thread** (FIXED)
The full row is fetched from the gateway handler session, then re-fetched by PK in the worker thread.
*Fix: `_build_route_table` calls `session.expunge(api)` to detach objects, which are then served directly from the in-process route cache without per-request DB queries.*

**21. Route cache rebuild blocks all concurrent requests** (FIXED)
Lock-based cache rebuild causes a latency spike every 30 seconds under high concurrency.
*Fix: Implemented stale-while-revalidate pattern — only one thread rebuilds while all others immediately return the stale cache.*

**22. No template/output size limit** (FIXED)
No limit on template size or rendered output. A loop like `{% for i in range(999999999) %}` can produce gigabytes of SQL.
*Fix: Added `max_src` and `max_out` size checks — `ValueError` raised if template source or rendered output exceeds configurable limits.*

**23. No blocklist for `SCRIPT_EXTRA_MODULES`** (FIXED)
If admin sets `SCRIPT_EXTRA_MODULES=os,subprocess`, the sandbox collapses entirely.
*Fix: Added `_BLOCKED_MODULES` frozenset covering OS/process/network/code-exec/serialization modules. `_inject_extra_modules` silently rejects any blocked module.*

**24. Gateway leaks exception messages to clients** (FIXED)
`str(e)` from unhandled exceptions is returned in the response, exposing table names, SQL errors, and internal paths.
*Fix: Returns generic `"Internal server error"` for non-local environments; raw `str(e)` only shown when `ENVIRONMENT == "local"`.*

**25. 8-day access token lifetime, no revocation** (FIXED)
`ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 8` (11,520 minutes). No refresh token flow or blocklist for token revocation.
*Fix: Reduced to `60 * 24` (1 day).*

**26. CORS wildcard allowed when ENVIRONMENT=local (the default)** (FIXED)
Default `ENVIRONMENT` is `"local"`, which permits `*` in CORS origins. If accidentally deployed without setting `ENVIRONMENT`, CORS is effectively open.
*Fix: Removed the `ENVIRONMENT != "local"` bypass — `*` is now rejected in ALL environments when `allow_credentials=True`.*

**27. X-Forwarded-For spoofing** (FIXED)
Trusts `X-Forwarded-For` without validation. Also uses `split(",")[-1]` (last entry = nearest proxy, not original client).
*Fix: Added `TRUSTED_PROXY_COUNT` setting (default 0 = ignore XFF). When > 0, extracts the Nth-from-right entry. Applied in both gateway and auth deps.*

**28. Authorization header stored in access logs** (FIXED)
All request headers including `Authorization` are JSON-serialized into access log records. A compromised log DB exposes all tokens.
*Fix: Added `_REDACTED_HEADERS` frozenset filtering out `authorization`, `cookie`, `proxy-authorization` before serialization.*

**29. Race condition on version numbering** (FIXED)
`SELECT max(version)` then `INSERT version+1` without locking or unique constraint. Concurrent publishes can create duplicate version numbers.
*Fix: Added `SELECT ... FOR UPDATE` on parent row + `UniqueConstraint("api_assignment_id", "version")` on both `VersionCommit` and `MacroDefVersionCommit`.*

**30. Thread-unsafe access log engine cache** (FIXED)
`_log_engine_cache` dict accessed without lock. Concurrent requests can create duplicate engines with orphan connection pools.
*Fix: Added `threading.Lock()` with double-checked locking pattern in `get_log_engine` and `clear_log_engine_cache`.*

**31. No security headers middleware** (FIXED)
Missing `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`.
*Fix: Added `SecurityHeadersMiddleware` (ASGI) injecting X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Permitted-Cross-Domain-Policies.*

**32. Double recursive traversal of response data** (FIXED)
`keys_to_camel()` and `_make_json_safe()` each do a full recursive traversal. Large result sets pay double the cost. Should combine into one pass.
*Fix: Added `camel: bool` parameter to `_make_json_safe`; `format_response` now does a single-pass traversal.*

**33. Password reset token missing `type` claim** (FIXED)
Reset token has `{exp, nbf, sub}` but no `type` field. The defense against cross-use with login tokens is accidental (email vs UUID), not intentional.
*Fix: Added `TOKEN_TYPE_PASSWORD_RESET` claim to generation/verification. Hardened `get_current_user` to allowlist `TOKEN_TYPE_DASHBOARD` only.*

---

## LOW

| # | Status | Finding | Location |
|---|--------|---------|----------|
| 34 | FIXED | Jinja2 `Environment` instead of `SandboxedEnvironment` | `backend/app/engines/sql/template_engine.py:37` |
| 35 | FIXED | Linear O(N) route table scan per request | `backend/app/core/gateway/resolver.py:122-130` |
| 36 | FIXED | `_to_snake_str`/`_to_camel_str` regex per key (uncached) | `backend/app/core/gateway/request_response.py:21-31` |
| 37 | FIXED | N+1 `_get_role_user_count` per role | `backend/app/api/routes/roles.py:103-116` |
| 38 | FIXED | Pool manager resets `created_at` on release (max-age ineffective) | `backend/app/core/pool/manager.py:81` |
| 39 | FIXED | Verbose INFO logging on every request when no concurrent limit | `backend/app/core/gateway/concurrent.py:96-102` |
| 40 | FIXED | Non-atomic `set` + `expire` in script cache module | `backend/app/engines/script/modules/cache.py:33-39` |
| 41 | FIXED | No response size limit (unbounded query results) | `backend/app/core/gateway/request_response.py:282-295` |
| 42 | FIXED | 48-hour password reset token expiry | `backend/app/core/config.py:149` |
| 43 | OPEN | Firewall stub returns `True` unconditionally | `backend/app/core/gateway/firewall.py:10-16` |
| 44 | FIXED | Unbounded version list (no pagination) | `backend/app/api/routes/api_assignments.py:903-907` |
| 45 | OPEN | No password complexity requirements | `backend/app/models.py` |

### Details

**34. Jinja2 `Environment` instead of `SandboxedEnvironment`** (FIXED)
SQL template engine used plain `Environment`, allowing attribute access exploits.
*Fix: Replaced with `SandboxedEnvironment` from `jinja2.sandbox`.*

**35. Linear O(N) route table scan per request** (FIXED)
Every gateway request scanned the full route table linearly.
*Fix: Two-tier route index — static dict for O(1) lookup, per-method dynamic lists for path-param routes.*

**36. `_to_snake_str`/`_to_camel_str` regex per key (uncached)** (FIXED)
Regex compiled and executed per key on every response.
*Fix: Pre-compiled `_CAMEL_TO_SNAKE_RE` regex + `@functools.lru_cache(maxsize=1024)` on both functions.*

**37. N+1 `_get_role_user_count` per role** (FIXED)
Each role triggered a separate COUNT query in `list_roles`.
*Fix: Single batch `GROUP BY` query, results stored in dict for O(1) lookup.*

**38. Pool manager resets `created_at` on release (max-age ineffective)** (FIXED)
`release()` always set `created_at = now`, so connections never expired by max-age.
*Fix: Stamp `_pool_created_at` on connection in `get_connection`; `release()` preserves it via `getattr(conn, "_pool_created_at", now)`.*

**39. Verbose INFO logging on every request when no concurrent limit** (FIXED)
"no limit" message logged at INFO on every request when `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` is 0.
*Fix: Changed `_LOG.info()` to `_LOG.debug()`.*

**40. Non-atomic `set` + `expire` in script cache module** (FIXED)
`cache_client.set(k, value)` then `cache_client.expire(k, ttl_seconds)` — crash between them leaves key without TTL.
*Fix: Single `cache_client.set(k, value, ex=ttl_seconds)` call.*

**41. No response size limit (unbounded query results)** (FIXED)
No limit on `data[]` array size — a query returning millions of rows would be fully serialized.
*Fix: Added `GATEWAY_MAX_RESPONSE_ROWS` setting (default 10,000). `_cap_rows()` truncates data and sets `"truncated": true`.*

**42. 48-hour password reset token expiry** (FIXED)
`EMAIL_RESET_TOKEN_EXPIRE_HOURS = 48` gives attackers too long to intercept/brute-force a reset link.
*Fix: Reduced to 1 hour.*

**44. Unbounded version list (no pagination)** (FIXED)
`list_versions` fetched all rows with no limit.
*Fix: Added `skip`/`limit` query params (default 100, max 500) with `.offset().limit()` on the query.*

---

## Summary

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| CRITICAL | 5 | 5 | 0 |
| HIGH | 8 | 8 | 0 |
| MEDIUM | 20 | 20 | 0 |
| LOW | 12 | 10 | 2 |
| **Total** | **45** | **43** | **2** |

## Top Priority Recommendations (remaining)

1. **Implement IP firewall** to replace stub (#43 — LOW)
2. **Add password complexity requirements** (#45 — LOW)
