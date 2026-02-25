# Environment Variable Reference

Complete reference for all environment variables used by pyDBAPI. Variables are loaded from `.env` (project root) and can be overridden by the shell environment or Docker Compose `environment:` blocks.

> **Tip:** Copy `.env.example` to `.env` and edit. Never commit `.env` to version control.

---

## Quick Start (minimum required)

```bash
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
POSTGRES_PASSWORD=<strong-password>
POSTGRES_USER=postgres
POSTGRES_DB=app
POSTGRES_SERVER=db            # "db" inside Docker, "localhost" outside
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=<strong-password>
PROJECT_NAME=pyDBAPI
DOCKER_IMAGE_BACKEND=pydbapi  # image name for app (unified Nginx+FastAPI)
TAG=latest
```

---

## Core Application

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SECRET_KEY` | string | *(random)* | **Yes** | Signing key for JWT tokens and password reset links. Must be changed from `"changethis"` in staging/production. |
| `PROJECT_NAME` | string | — | **Yes** | Project name displayed in API docs, emails, and the dashboard. |
| `ENVIRONMENT` | `local` \| `staging` \| `production` | `local` | No | Controls security warnings and error verbosity. In `local`, default secrets trigger a warning; in staging/production they raise an error. |
| `API_V1_STR` | string | `/api/v1` | No | URL prefix for the management API (not the gateway). |
| `FRONTEND_HOST` | string | `http://localhost:5173` | No | Full URL of the frontend; used in password-reset emails and CORS. |
| `BACKEND_CORS_ORIGINS` | string | `""` | No | Comma-separated allowed origins for CORS (e.g. `http://localhost,http://localhost:5173`). `FRONTEND_HOST` is always added automatically. **Production:** use explicit origins only; do not use `*` (invalid when credentials are sent). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `11520` (8 days) | No | Lifetime of dashboard JWT access tokens (minutes). |

---

## PostgreSQL (App Database)

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `POSTGRES_SERVER` | string | — | **Yes** | Hostname. Use `db` when running inside Docker Compose, `localhost` for local dev. |
| `POSTGRES_PORT` | int | `5432` | No | TCP port. |
| `POSTGRES_USER` | string | — | **Yes** | Database user. |
| `POSTGRES_PASSWORD` | string | `""` | **Yes** | Database password. Must be changed from `"changethis"` in staging/production. |
| `POSTGRES_DB` | string | `""` | **Yes** | Database name (e.g. `app`). |

Computed: `SQLALCHEMY_DATABASE_URI` is built as `postgresql+psycopg://{user}:{password}@{server}:{port}/{db}`.

---

## Redis

Redis is used for caching (gateway config), rate limiting, and concurrent-request limiting. If Redis is unavailable, the system falls back to in-memory (per-process) stores.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `REDIS_URL` | string | `None` | No | Full Redis URL (e.g. `redis://:password@host:6379/0`). If set, overrides individual `REDIS_*` fields. |
| `REDIS_HOST` | string | `localhost` | No | Redis hostname. Use `redis` inside Docker Compose. |
| `REDIS_PORT` | int | `6379` | No | Redis TCP port. |
| `REDIS_DB` | int | `0` | No | Redis database number. |
| `REDIS_PASSWORD` | string | `None` | No | Redis password (AUTH). |
| `REDIS_SSL` | bool | `False` | No | Use TLS (`rediss://` scheme). |
| `CACHE_ENABLED` | bool | `True` | No | Enable gateway config caching in Redis. When `False`, every gateway request loads config from PostgreSQL. |

---

## Gateway & Flow Control

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GATEWAY_JWT_EXPIRE_SECONDS` | int | `3600` | No | Lifetime of gateway client JWTs issued by `POST /token/generate`. |
| `GATEWAY_FIREWALL_DEFAULT_ALLOW` | bool | `True` | No | Default action when no firewall rule matches. (Firewall is currently always-allow.) |
| `GATEWAY_ACCESS_LOG_BODY` | bool | `False` | No | When `True`, store `request_body`, `request_headers`, and `request_params` in `AccessRecord`. Increases storage usage. |
| `GATEWAY_CONFIG_CACHE_TTL_SECONDS` | int | `300` | No | Time-to-live (seconds) for cached API config in Redis. Set to `0` to disable caching. |
| `FLOW_CONTROL_RATE_LIMIT_ENABLED` | bool | `True` | No | Master switch for gateway rate limiting. When `False`, no requests are ever rate-limited. |
| `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE` | int | `60` | No | Default sliding-window rate limit (requests/minute). Can be overridden per-API or per-client in the DB. |
| `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` | int | `10` | No | Max in-flight requests per client (or per IP for public APIs). `0` = no limit. Can be overridden per-client in the DB. |
| `CONCURRENT_DEBUG` | string | `"0"` | No | Set to `"1"`, `"true"`, or `"yes"` to log concurrent acquire/release to stdout (useful for debugging 503 issues). |

---

## External Database Connections

These control the connection pool for **external data sources** (not the app DB).

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `EXTERNAL_DB_POOL_SIZE` | int | `5` | No | Max connections in the pool per data source. |
| `EXTERNAL_DB_CONNECT_TIMEOUT` | int | `10` | No | TCP connect timeout (seconds) for external DBs. |
| `EXTERNAL_DB_STATEMENT_TIMEOUT` | int \| None | `None` | No | Statement execution timeout (seconds). `None` = no timeout. Supported for PostgreSQL and MySQL. |

---

## Script Engine

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRIPT_EXEC_TIMEOUT` | int \| None | `None` | No | Maximum execution time (seconds) for Python script APIs. Uses `SIGALRM` — **Unix only** (no effect on Windows). |
| `SCRIPT_EXTRA_MODULES` | string | `""` | No | Comma-separated list of Python module names whitelisted for use in script APIs (e.g. `"pandas,numpy"`). Only top-level modules; submodules are not added. |

---

## Email (SMTP)

Email is used for password-reset flows. If `SMTP_HOST` and `EMAILS_FROM_EMAIL` are both empty, email features are silently disabled.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SMTP_HOST` | string | `None` | No | SMTP server hostname. |
| `SMTP_PORT` | int | `587` | No | SMTP port. |
| `SMTP_USER` | string | `None` | No | SMTP username. |
| `SMTP_PASSWORD` | string | `None` | No | SMTP password. |
| `SMTP_TLS` | bool | `True` | No | Use STARTTLS. |
| `SMTP_SSL` | bool | `False` | No | Use implicit SSL/TLS (port 465). |
| `EMAILS_FROM_EMAIL` | email | `None` | No | Sender email address (e.g. `noreply@example.com`). |
| `EMAILS_FROM_NAME` | string | `PROJECT_NAME` | No | Sender display name. |
| `EMAIL_RESET_TOKEN_EXPIRE_HOURS` | int | `48` | No | Password-reset token lifetime (hours). |

---

## First Superuser

Created automatically on first startup (by `initial_data.py`).

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `FIRST_SUPERUSER` | email | — | **Yes** | Email of the initial superuser account. |
| `FIRST_SUPERUSER_PASSWORD` | string | — | **Yes** | Password. Must be changed from `"changethis"` in staging/production. |

---

## Monitoring

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SENTRY_DSN` | URL | `None` | No | Sentry DSN for error tracking. Leave empty to disable. |

---

## Docker & Deployment

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DOCKER_IMAGE_BACKEND` | string | `pydbapi` | No | Docker image name for the app (unified Nginx + FastAPI). |
| `TAG` | string | `latest` | No | Docker image tag. |
| `APP_PORT` | int | `80` | No | Port exposed by the app container (e.g. `80` or `8080`). |
| `DOMAIN` | string | `localhost` | No | Domain for emails and optional reverse-proxy config. |
| `STACK_NAME` | string | — | No | Docker Compose project name (optional; used by some CI workflows). |

---

## Frontend (Build-time)

These are Vite build-time variables, set as Docker build args or in `frontend/.env`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VITE_API_URL` | URL | `""` | Backend API base URL baked into the frontend build. Empty = same origin (recommended when app is served from one host). |
| `NODE_ENV` | string | `development` | `"production"` enables minification and optimizations. |

---

## GitHub Actions Secrets

These are configured in GitHub repository settings, not in `.env`.

| Secret | Used in | Description |
|--------|---------|-------------|
| `DOMAIN_STAGING` | deploy-staging | Staging domain. |
| `DOMAIN_PRODUCTION` | deploy-production | Production domain. |
| `STACK_NAME_STAGING` | deploy-staging | Staging stack name. |
| `STACK_NAME_PRODUCTION` | deploy-production | Production stack name. |
| `SECRET_KEY` | Both deploys | JWT signing key. |
| `FIRST_SUPERUSER` | Both deploys | Superuser email. |
| `FIRST_SUPERUSER_PASSWORD` | Both deploys | Superuser password. |
| `POSTGRES_PASSWORD` | Both deploys | Database password. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Both deploys | Email config. |
| `EMAILS_FROM_EMAIL` | Both deploys | Sender address. |
| `SENTRY_DSN` | Both deploys | Error tracking. |
