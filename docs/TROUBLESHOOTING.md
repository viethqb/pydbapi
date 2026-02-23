# Troubleshooting Guide

Common issues and their solutions when developing, deploying, or operating pyDBAPI.

---

## Table of Contents

- [Startup & Docker](#startup--docker)
- [Database & Migrations](#database--migrations)
- [Backend / API](#backend--api)
- [Gateway](#gateway)
- [Frontend](#frontend)
- [Authentication & Permissions](#authentication--permissions)
- [Performance](#performance)
- [Deployment & CI/CD](#deployment--cicd)

---

## Startup & Docker

### Container fails with "Variable not set"

```
POSTGRES_PASSWORD?Variable not set
```

**Cause:** Required environment variable is missing.  
**Fix:** Copy `.env.example` to `.env` and fill in all required values. See [ENV_REFERENCE.md](./ENV_REFERENCE.md) for the full list.

---

### `prestart` service fails — backend never starts

```
docker compose logs prestart
```

**Common causes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` loop | DB not ready | Check `db` health: `docker compose ps`. Increase `start_period` in db healthcheck if DB is slow to initialize. |
| `alembic upgrade head` error | Migration conflict or bad schema | See [Migration fails](#migration-fails-during-prestart) below. |
| `ERROR: alembic is NOT at head` | Migration applied but didn't reach head | Check `docker compose logs prestart` for the specific error. May need manual intervention — see [Rollback](#rolling-back-a-failed-migration). |

---

### Redis connection refused (but app starts)

Redis is **optional**. When unavailable, rate limiting and caching fall back to in-memory (per-process). This means:
- Rate limits are approximate (not shared across workers).
- Gateway config cache is per-worker, not shared.

**To fix:** Ensure the `redis` service is healthy: `docker compose ps redis`. Check `REDIS_HOST` is set to `redis` (inside Docker) or `localhost` (outside).

---

### Port conflicts

```
Error starting userland proxy: listen tcp4 0.0.0.0:5432: bind: address already in use
```

**Fix:** Stop the conflicting service or set a different port in `.env` (e.g. `APP_PORT=8080`) and use `docker compose up -d`.

---

## Database & Migrations

### Migration fails during prestart

```
alembic.util.exc.CommandError: Can't locate revision identified by '...'
```

**Cause:** The DB has a revision that doesn't exist in the code (e.g. manual migration was run then reverted in code).

**Fix:**
1. Check current revision: `docker compose exec app bash -c "cd /app/backend && alembic current"`
2. Check available heads: `docker compose exec app bash -c "cd /app/backend && alembic heads"`
3. If the DB revision is ahead of code, stamp it: `docker compose exec app bash -c "cd /app/backend && alembic stamp head"`
4. If the DB has a non-existent revision, set it manually:
   ```bash
   docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
     -c "UPDATE alembic_version SET version_num = '<correct_revision>';"
   ```

---

### Rolling back a failed migration

Use the rollback script:

```bash
# Roll back the last migration step
./scripts/rollback.sh --migrate -1

# Roll back to a specific revision
./scripts/rollback.sh --migrate abc123def

# Preview without executing
./scripts/rollback.sh --migrate -1 --dry-run
```

Or manually:

```bash
docker compose exec app bash -c "cd /app/backend && alembic downgrade -1"
docker compose restart app
```

---

### "relation does not exist" after migration

**Cause:** Migration ran but models reference a table/column that wasn't included.

**Fix:**
1. Check if migration is at head: `docker compose exec app bash -c "cd /app/backend && alembic current"`
2. If not, run: `docker compose exec app bash -c "cd /app/backend && alembic upgrade head"`
3. If already at head, the migration script may be incomplete — generate a new one:
   ```bash
   docker compose exec app bash -c "cd /app/backend && alembic revision --autogenerate -m 'add missing tables'"
   ```

---

## Backend / API

### `500 Internal Server Error` with no details

**In local/staging:** The global exception handler returns full error details when `ENVIRONMENT != "production"`.

**In production:** Only `"Internal server error"` is shown. Check server logs:
```bash
docker compose logs app --tail=100
```

If Sentry is configured (`SENTRY_DSN`), the full traceback appears there.

---

### Health check returns 503

```json
{"success": false, "message": "Service Unavailable", "data": ["postgres"]}
```

| Failure | Meaning | Fix |
|---------|---------|-----|
| `postgres` | Cannot reach the app database | Check `db` container health. Verify `POSTGRES_SERVER`, `POSTGRES_PORT`, credentials. |
| `redis` | Cannot reach Redis (only when `CACHE_ENABLED` or rate limiting is on) | Check `redis` container. If Redis is intentionally off, set `CACHE_ENABLED=False` and `FLOW_CONTROL_RATE_LIMIT_ENABLED=False`. |
| `migrations_not_at_head` | DB schema doesn't match code | Run `docker compose exec app bash -c "cd /app/backend && alembic upgrade head"` or redeploy. |

---

### Data source "Test" fails

```
Connection test failed: connection to server at "host" (...), port 5432 failed
```

**Checklist:**
1. Can the backend container reach the data source? (Network / firewall between Docker and target DB.)
2. Correct host, port, user, password, database name?
3. For Trino: verify the catalog and schema exist.
4. For StarRocks: use `product_type = mysql` (StarRocks speaks MySQL protocol).
5. Check `EXTERNAL_DB_CONNECT_TIMEOUT` — increase if the target DB is slow.

---

### Script API returns "ScriptTimeoutError"

**Cause:** Script exceeded `SCRIPT_EXEC_TIMEOUT` seconds.

**Fix:**
- Increase `SCRIPT_EXEC_TIMEOUT` if the script legitimately needs more time.
- Optimize the script (reduce data volume, add pagination).
- Note: timeout only works on **Unix** (uses `SIGALRM`). On Windows/macOS without signal support, no timeout is enforced.

---

### Script API: "NameError: name 'pandas' is not defined"

**Cause:** Module not in the whitelist.

**Fix:** Add it to `SCRIPT_EXTRA_MODULES`:
```bash
SCRIPT_EXTRA_MODULES=pandas,numpy
```
Only top-level module names are supported (not `pandas.io`).

---

## Gateway

### 404 on gateway call (`/api/{path}`)

**Checklist:**
1. Is the API **published**? Only published APIs are routed.
2. Does the request **path** match the API's `path`? (e.g. API path `users/{id}` → request `GET /api/users/123`). Module is not in the URL.
3. Does the HTTP **method** match? (GET vs POST, etc.) Path + method must be unique.
4. Is the module **active** (`is_active=True`)?
5. Config cache: after publishing, wait up to `GATEWAY_CONFIG_CACHE_TTL_SECONDS` (default 300s) or restart the app.

---

### 401 Unauthorized on gateway call

**Cause:** API has `access_type = private` and no valid token.

**Fix:**
1. Obtain a token: `POST /api/token/generate` (or `POST /token/generate`) with `client_id` and `client_secret`.
2. Pass it: `Authorization: Bearer <token>`.
3. Check token expiry (`GATEWAY_JWT_EXPIRE_SECONDS`, default 3600s).
4. Verify the client is **active** (`is_active=True`).

---

### 403 Forbidden on gateway call

**Cause:** Client doesn't have access to this API.

**Fix:** The client must be linked to the API either:
- **Directly**: via `AppClientApiLink` (client → API assignment), or
- **Via group**: client is in a group that includes this API.

Check in the UI: System → Clients → [client] → assigned groups and APIs.

---

### 429 Too Many Requests

**Cause:** Rate limit exceeded.

**Fix:**
- Wait and retry (sliding window resets within 60 seconds).
- Increase `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE` globally or per-API/per-client in the DB.
- Disable rate limiting: `FLOW_CONTROL_RATE_LIMIT_ENABLED=False`.

---

### 503 Service Unavailable (concurrent limit)

**Cause:** Too many requests in flight for this client/IP.

**Fix:**
- Wait for in-flight requests to complete and retry.
- Increase `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` or set per-client override in the DB.
- Set `CONCURRENT_DEBUG=1` to log acquire/release events for investigation.
- With in-memory mode (no Redis), the limit is per-worker, so the effective limit is `max × workers`.

---

## Frontend

### Blank page after deploy

**Checklist:**
1. Check browser console for errors (F12 → Console).
2. Verify `VITE_API_URL` was set correctly at **build time** (empty = same origin). For production behind one host, use empty or the same origin.
3. Check app is serving: `curl http://localhost/health` should return `ok`.

---

### API calls fail with CORS errors

```
Access to fetch at 'https://api.example.com' from origin 'https://dashboard.example.com' has been blocked by CORS policy
```

**Fix:** Add the frontend URL to `BACKEND_CORS_ORIGINS`:
```bash
BACKEND_CORS_ORIGINS="https://dashboard.example.com,http://localhost:5173"
```
`FRONTEND_HOST` is automatically added to the CORS allowed list.

---

### "Network Error" or requests hang

**Cause:** Frontend can't reach backend.

**Checklist:**
1. Is the app running and healthy? `docker compose ps app`
2. Is `VITE_API_URL` pointing to the correct backend URL?
3. Are there firewall/proxy rules blocking the connection?
4. Check browser Network tab (F12) for the actual request URL and response.

---

## Authentication & Permissions

### Can't log in with superuser after fresh deploy

**Checklist:**
1. Check `FIRST_SUPERUSER` and `FIRST_SUPERUSER_PASSWORD` in `.env`.
2. Check `prestart` logs — `initial_data.py` creates the superuser: `docker compose logs prestart`.
3. If the user already exists (from a previous deploy) with a different password, log in with the old password or reset via DB.

---

### Permission denied in the UI but user has the role

**Cause:** The role may not have the required permission for that resource.

**Fix:**
1. Admin → Roles → click the role → check its permissions.
2. Ensure the role has the correct `resource_type` + `action` (e.g. `datasource:read`, `client:update`).
3. Superusers bypass all permission checks — use a superuser to debug.

---

## Performance

### Dashboard loads slowly

- The dashboard fires 5 queries on mount (stats, requests-by-day, top-paths, recent-access, recent-commits).
- **Stale data:** React Query uses `staleTime: 30s` by default — navigating back won't refetch within 30s.
- **Large access log:** If `AccessRecord` has millions of rows, the overview queries may be slow. Consider using the StarRocks audit integration or adding database indexes.

---

### Gateway latency spikes

**Diagnosis:**
1. Check concurrent usage: `CONCURRENT_DEBUG=1` to log slot acquire/release.
2. Check if config cache is working: set `CACHE_ENABLED=True` and verify Redis is up.
3. Profile the SQL/script: use the Debug endpoint in the UI to time execution.
4. Check `EXTERNAL_DB_CONNECT_TIMEOUT` and `EXTERNAL_DB_STATEMENT_TIMEOUT`.

---

## Deployment & CI/CD

### CI deploy step fails: "Backend did not become healthy within 120s"

**Diagnosis:**
```bash
docker compose logs app --tail=100
docker compose logs prestart --tail=50
```

**Common causes:**
- Migration failed (prestart exited with error → backend never starts).
- DB is unreachable (wrong `POSTGRES_SERVER` or password).
- Resource limits too low (OOM kill) — check `docker inspect <container>` for OOM events.

---

### How to roll back a production deployment

```bash
# 1. Roll back containers only (keeps current DB schema)
./scripts/rollback.sh

# 2. Roll back containers AND last migration
./scripts/rollback.sh --migrate -1

# 3. Preview what would happen
./scripts/rollback.sh --migrate -1 --dry-run
```

After rollback, verify:
```bash
docker compose ps                    # all services running
docker compose exec app bash -c "cd /app/backend && alembic current"  # check migration state
curl -f http://localhost:8000/api/v1/utils/health-check/  # readiness
```

---

### "changethis" error on staging/production

```
ValueError: The value of SECRET_KEY is "changethis", for security, please change it
```

**Fix:** Set a real secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"` and update `.env` or the GitHub Actions secret.

---

## Useful Commands

```bash
# Container status
docker compose ps

# View logs (last 50 lines, follow)
docker compose logs app --tail=50 -f

# Run alembic inside container
docker compose exec app bash -c "cd /app/backend && alembic current"
docker compose exec app bash -c "cd /app/backend && alembic history --verbose"

# Open a Python shell in the backend
docker compose exec app bash -c "cd /app/backend && python"

# Open a psql shell in the app DB
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB

# Check Redis
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli keys "gateway:*"

# Restart a single service
docker compose restart app

# Rebuild and restart
docker compose up -d --build app
```
