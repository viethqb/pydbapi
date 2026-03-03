# Troubleshooting

Common issues and solutions for developing, deploying, and operating pyDBAPI.

---

## Startup and Docker

### Container fails with "Variable not set"

```text
POSTGRES_PASSWORD?Variable not set
```

**Fix:** Copy `.env.example` to `.env` and fill in all required values. See [ENV_REFERENCE.md](./ENV_REFERENCE.md).

### Prestart service fails — backend never starts

Check logs: `docker compose logs prestart`

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` loop | DB not ready | Check `db` health: `docker compose ps`. Increase `start_period` if DB is slow to initialize. |
| `alembic upgrade head` error | Migration conflict | See [Migration fails](#migration-fails-during-prestart) below. |
| `ERROR: alembic is NOT at head` | Migration didn't reach head | Check prestart logs for the specific error. |

### Redis connection refused (but app starts)

Redis is optional. When unavailable, rate limiting and caching fall back to in-memory (per-process), meaning:
- Rate limits are approximate (not shared across workers).
- Gateway config cache is per-worker.

**Fix:** Ensure Redis is healthy: `docker compose ps redis`. Check `REDIS_HOST` is `redis` (Docker) or `localhost` (local dev).

### Port conflicts

```text
Error starting userland proxy: listen tcp4 0.0.0.0:5432: bind: address already in use
```

**Fix:** Stop the conflicting service or change the port in `.env` (e.g. `APP_PORT=8080`).

---

## Database and Migrations

### Migration fails during prestart

```text
alembic.util.exc.CommandError: Can't locate revision identified by '...'
```

**Cause:** DB has a revision that doesn't exist in code.

**Fix:**

```bash
# Check current revision
docker compose exec app bash -c "cd /app/backend && alembic current"

# Check available heads
docker compose exec app bash -c "cd /app/backend && alembic heads"

# If DB revision is ahead of code, stamp it
docker compose exec app bash -c "cd /app/backend && alembic stamp head"

# If DB has a non-existent revision, set manually
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "UPDATE alembic_version SET version_num = '<correct_revision>';"
```

### Rolling back a migration

```bash
# Roll back last migration
./scripts/rollback.sh --migrate -1

# Roll back to specific revision
./scripts/rollback.sh --migrate abc123def

# Preview without executing
./scripts/rollback.sh --migrate -1 --dry-run
```

Or manually:

```bash
docker compose exec app bash -c "cd /app/backend && alembic downgrade -1"
docker compose restart app
```

### "relation does not exist" after migration

**Cause:** Migration ran but doesn't include all required tables/columns.

**Fix:**

```bash
# Check if at head
docker compose exec app bash -c "cd /app/backend && alembic current"

# If not at head, upgrade
docker compose exec app bash -c "cd /app/backend && alembic upgrade head"

# If already at head, generate a new migration
docker compose exec app bash -c "cd /app/backend && alembic revision --autogenerate -m 'add missing tables'"
```

---

## Backend / API

### 500 Internal Server Error with no details

- **Local/staging:** The exception handler returns full error details when `ENVIRONMENT != "production"`.
- **Production:** Only `"Internal server error"` is shown. Check logs: `docker compose logs app --tail=100`
- If `SENTRY_DSN` is configured, full tracebacks appear in Sentry.

### Health check returns 503

```json
{"success": false, "message": "Service Unavailable", "data": ["postgres"]}
```

| Failure | Fix |
|---------|-----|
| `postgres` | Check `db` container. Verify `POSTGRES_SERVER`, `POSTGRES_PORT`, credentials. |
| `redis` | Check `redis` container. If Redis is off, set `CACHE_ENABLED=False`. |
| `migrations_not_at_head` | Run `alembic upgrade head` or redeploy. |

### Data source "Test" fails

**Checklist:**
1. Can the backend container reach the data source? (Check network/firewall.)
2. Correct host, port, user, password, database name?
3. For Trino: verify catalog and schema exist.
4. For StarRocks: use `product_type = mysql` (MySQL protocol).
5. Increase `EXTERNAL_DB_CONNECT_TIMEOUT` if the target DB is slow.

### Script API returns "ScriptTimeoutError"

**Cause:** Script exceeded `SCRIPT_EXEC_TIMEOUT` seconds.

**Fix:**
- Increase `SCRIPT_EXEC_TIMEOUT`.
- Optimize the script (reduce data volume, add pagination).

### Script API: "NameError: name 'pandas' is not defined"

**Cause:** Module not whitelisted.

**Fix:** Add to `SCRIPT_EXTRA_MODULES`:

```bash
SCRIPT_EXTRA_MODULES=pandas,numpy
```

Only top-level module names are supported (not `pandas.io`).

---

## SQL Template Errors

### "UndefinedError: 'variable' is undefined"

**Cause:** Template references a variable not passed as a parameter.

**Fix:**
1. Define the parameter in **Basic Info → Parameters** with the correct name.
2. Use `{% if name is defined %}` guards around optional parameters.
3. Set a default value: `{% set name = name if name is defined else 'fallback' %}`.

### "TemplateSyntaxError: unexpected ..."

**Cause:** Invalid Jinja2 syntax.

**Common mistakes:**

| Error | Fix |
|-------|-----|
| `{{ name }}` without filter | Use `{{ name \| sql_string }}` |
| Missing `{% endif %}` | Every `{% if %}` needs `{% endif %}` |
| `{% where }` missing `%` | Use `{% where %}` |
| `{{ name | sql_in_list }}` | Filter is `in_list`, not `sql_in_list` |
| Using `{% include %}` | Not supported — use macros instead |

### "SQL template exceeds maximum size"

**Cause:** Template source exceeds `SQL_TEMPLATE_MAX_SIZE` (default 1 MB) or rendered output exceeds `SQL_RENDERED_MAX_SIZE` (default 10 MB).

**Fix:** Reduce template size, or increase limits in `.env`.

### Multi-statement SQL returns unexpected structure

**Cause:** Multi-statement SQL returns `[[rows1], [rows2], ...]` instead of a flat list.

**Fix:** Add a **Result Transform** to reshape the data:

```python
def transform(result, params=None):
    d = result.get("data", [])
    if isinstance(d, list) and len(d) >= 2:
        result["data"] = d[0] if isinstance(d[0], list) else d[0]
        result["total"] = d[1][0].get("total", 0) if d[1] else 0
    return result
```

---

## Script Engine Errors

### "NameError: name 'module' is not defined"

**Cause:** Trying to use a module not in the sandbox.

**Fix:**
- For `pandas`, `numpy`, etc.: add to `SCRIPT_EXTRA_MODULES` (admin setting).
- For `os`, `subprocess`, `socket`, etc.: **blocked by design** — these are security-restricted.
- For `json`, `datetime`, etc.: already available as globals — no import needed.

### "SyntaxError: not allowed in RestrictedPython"

**Cause:** Using Python features blocked by RestrictedPython.

**Common blocked patterns:**
- `exec()`, `eval()`, `compile()`, `__import__()`
- Accessing `__dict__`, `__class__`, `__bases__` (double-underscore attributes)
- `open()`, `os.system()`, `subprocess.run()`

### "ScriptTimeoutError"

**Cause:** Script exceeded `SCRIPT_EXEC_TIMEOUT` seconds.

**Fix:**
- Increase `SCRIPT_EXEC_TIMEOUT` in `.env`.
- Optimize: reduce data volume, add pagination, use `db.query_one` instead of `db.query` when only one row is needed.

### Script returns null / empty

**Cause:** Script does not properly return data.

**Fix:** Ensure your script uses one of:

```python
# Option 1: define an execute() function (preferred)
def execute(params=None):
    return {"data": [...], "total": 42}

# Option 2: assign to the global result variable
result = {"data": [...], "total": 42}
```

If neither pattern is used, the API returns `null`.

### "ConnectionError" in http calls

**Cause:** Script's outbound HTTP is restricted by `SCRIPT_HTTP_ALLOWED_HOSTS`.

**Fix:** Ask an admin to add the target hostname to `SCRIPT_HTTP_ALLOWED_HOSTS` (comma-separated). Empty value = all hosts allowed.

---

## Gateway

### 404 on gateway call

**Checklist:**
1. Is the API **published**? Only published APIs are routed.
2. Does the request **path** match? (e.g. API path `users/{id}` -> `GET /api/users/123`). Module is not in the URL.
3. Does the HTTP **method** match?
4. Is the module **active**?
5. Config cache: after publishing, wait up to `GATEWAY_CONFIG_CACHE_TTL_SECONDS` (default 300s) or restart the app.

### 401 Unauthorized

**Cause:** API is private and no valid token provided.

**Fix:**
1. Get a token: `POST /api/token/generate` with `client_id` and `client_secret`.
2. Pass it: `Authorization: Bearer <token>`.
3. Check token expiry (`GATEWAY_JWT_EXPIRE_SECONDS` or per-client `token_expire_seconds`).
4. Verify the client is active.

### 403 Forbidden

**Cause:** Client doesn't have access to the API.

**Fix:** Link the client to the API either:
- **Directly** via client -> API assignment link, or
- **Via group** where the client is in a group that includes the API.

Check in UI: System -> Clients -> [client] -> assigned groups and APIs.

### 429 Too Many Requests

**Cause:** Rate limit exceeded.

**Fix:**
- Wait and retry (sliding window resets within 60 seconds).
- Increase `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE` or per-API/per-client limits.
- Disable: `FLOW_CONTROL_RATE_LIMIT_ENABLED=False`.

### 503 Service Unavailable (concurrent limit)

**Cause:** Too many in-flight requests for this client/IP.

**Fix:**
- Wait for in-flight requests to complete.
- Increase `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` or per-client override.
- Set `CONCURRENT_DEBUG=1` to log acquire/release events.
- With in-memory mode (no Redis), the effective limit is `max x workers`.

---

## Frontend

### Blank page after deploy

**Checklist:**
1. Check browser console (F12 -> Console).
2. Verify `VITE_API_URL` was set correctly at **build time** (empty = same origin).
3. Check app is serving: `curl http://localhost/health`

### CORS errors

```text
Access to fetch at 'https://api.example.com' ... has been blocked by CORS policy
```

**Fix:** Add the frontend URL to `BACKEND_CORS_ORIGINS`:

```bash
BACKEND_CORS_ORIGINS="https://dashboard.example.com,http://localhost:5173"
```

`FRONTEND_HOST` is automatically added. Never use `*` in production (incompatible with `allow_credentials=True`).

### "Network Error" or requests hang

**Checklist:**
1. Is the app running? `docker compose ps app`
2. Is `VITE_API_URL` correct?
3. Firewall/proxy rules blocking?
4. Check browser Network tab for the actual request URL and response.

---

## Authentication

### Can't log in after fresh deploy

**Checklist:**
1. Check `FIRST_SUPERUSER` and `FIRST_SUPERUSER_PASSWORD` in `.env`.
2. Check prestart logs: `docker compose logs prestart` — `initial_data.py` creates the superuser.
3. Login uses **username** (not email). Enter the `FIRST_SUPERUSER` value.
4. If the user already exists from a previous deploy, the password is not updated.

### Permission denied but user has the role

**Cause:** The role may lack the required permission.

**Fix:**
1. Admin -> Roles -> click the role -> check permissions.
2. Ensure the role has the correct `resource_type` + `action` (e.g. `datasource:read`, `client:update`).
3. Superusers bypass all permission checks.

---

## Performance

### Dashboard loads slowly

- Dashboard fires several queries on mount (stats, charts, recent access, recent commits).
- TanStack Query uses `staleTime: 30s` — navigating back won't refetch within 30s.
- If `AccessRecord` has millions of rows, overview queries may be slow. Consider database indexes.

### Gateway latency spikes

**Diagnosis:**
1. Enable concurrent debug: `CONCURRENT_DEBUG=1`.
2. Verify config cache is working: `CACHE_ENABLED=True` + Redis is up.
3. Use the Debug endpoint in the UI to time execution.
4. Check `EXTERNAL_DB_CONNECT_TIMEOUT` and `EXTERNAL_DB_STATEMENT_TIMEOUT`.

---

## Deployment and CI/CD

### CI fails: "Backend did not become healthy within 120s"

```bash
docker compose logs app --tail=100
docker compose logs prestart --tail=50
```

**Common causes:**
- Migration failed (prestart exited with error -> backend never starts).
- DB unreachable (wrong `POSTGRES_SERVER` or password).
- OOM kill — check `docker inspect <container>`.

### Rolling back a production deployment

```bash
# Roll back containers only (keeps current schema)
./scripts/rollback.sh

# Roll back containers AND last migration
./scripts/rollback.sh --migrate -1

# Preview
./scripts/rollback.sh --migrate -1 --dry-run
```

Verify after rollback:

```bash
docker compose ps
docker compose exec app bash -c "cd /app/backend && alembic current"
curl -f http://localhost:8000/api/v1/utils/health-check/
```

### "changethis" error on staging/production

```text
ValueError: The value of SECRET_KEY is "changethis", for security, please change it
```

**Fix:** Generate a real secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Using the Debug Endpoint

Before publishing, test your API with the **Debug** tab in the API editor:

1. Open **API Dev → APIs** → select your API → **Debug** tab.
2. Enter test parameter values.
3. Click **Run** — this executes the API against the real data source without going through the gateway pipeline (no auth, rate limit, or concurrent limit).
4. Review the result to verify your SQL/Python is correct.

**Debug tip:** For SQL APIs, the Debug tab also shows the rendered SQL after Jinja2 processing, so you can see exactly what query will be executed.

---

## Useful Commands

```bash
# Container status
docker compose ps

# View logs (follow)
docker compose logs app --tail=50 -f

# Alembic inside container
docker compose exec app bash -c "cd /app/backend && alembic current"
docker compose exec app bash -c "cd /app/backend && alembic history --verbose"

# Python shell in backend
docker compose exec app bash -c "cd /app/backend && python"

# psql shell
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB

# Redis check
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli keys "gateway:*"

# Restart single service
docker compose restart app

# Rebuild and restart
docker compose up -d --build app
```
