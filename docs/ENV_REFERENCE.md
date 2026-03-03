# Environment Variable Reference

Complete reference for all environment variables used by pyDBAPI. Variables are loaded from `.env` (project root) and can be overridden by the shell environment or Docker Compose `environment:` blocks.

> **Tip:** Copy `.env.example` to `.env` and edit. Never commit `.env` to version control.

---

## Quick Start (Minimum Required)

```bash
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
POSTGRES_PASSWORD=<strong-password>
POSTGRES_USER=postgres
POSTGRES_DB=app
POSTGRES_SERVER=db            # "db" inside Docker, "localhost" outside
FIRST_SUPERUSER=admin
FIRST_SUPERUSER_PASSWORD=<strong-password>
PROJECT_NAME=pyDBAPI
DOCKER_IMAGE_BACKEND=pydbapi
TAG=latest
```

---

## Core Application

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SECRET_KEY` | string | *(random)* | **Yes** | Signing key for JWT tokens and password reset links. Must be changed from `"changethis"` in staging/production. |
| `ENCRYPTION_KEY` | string | --- | No | Fernet key for encrypting data source credentials. Auto-derived from `SECRET_KEY` if not set. |
| `PROJECT_NAME` | string | --- | **Yes** | Project name displayed in API docs, emails, and dashboard. |
| `ENVIRONMENT` | `local` \| `staging` \| `production` | `local` | No | Controls error verbosity. In `local`, default secrets trigger a warning; in staging/production they raise an error. OpenAPI docs are disabled in `production`. |
| `API_V1_STR` | string | `/api/v1` | No | URL prefix for the management API. |
| `FRONTEND_HOST` | string | `http://localhost:5173` | No | Frontend URL; used in password-reset emails and CORS. |
| `BACKEND_CORS_ORIGINS` | string | `""` | No | Comma-separated allowed CORS origins. `FRONTEND_HOST` is always added automatically. `*` is rejected (incompatible with `allow_credentials=True`). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `1440` (24h) | No | Lifetime of dashboard JWT access tokens (minutes). |

---

## PostgreSQL (App Database)

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `POSTGRES_SERVER` | string | --- | **Yes** | Hostname. Use `db` inside Docker Compose, `localhost` for local dev. |
| `POSTGRES_PORT` | int | `5432` | No | TCP port. |
| `POSTGRES_USER` | string | --- | **Yes** | Database user. |
| `POSTGRES_PASSWORD` | string | `""` | **Yes** | Database password. Must be changed from `"changethis"` in staging/production. |
| `POSTGRES_DB` | string | `""` | **Yes** | Database name (e.g. `app`). |

Computed: `SQLALCHEMY_DATABASE_URI` = `postgresql+psycopg://{user}:{password}@{server}:{port}/{db}`.

---

## Redis

Redis is used for config caching, rate limiting, and concurrent-request limiting. If unavailable, the system falls back to in-memory (per-process) stores.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `REDIS_URL` | string | `None` | No | Full Redis URL (e.g. `redis://:password@host:6379/0`). Overrides individual `REDIS_*` fields. |
| `REDIS_HOST` | string | `localhost` | No | Redis hostname. Use `redis` inside Docker Compose. |
| `REDIS_PORT` | int | `6379` | No | Redis TCP port. |
| `REDIS_DB` | int | `0` | No | Redis database number. |
| `REDIS_PASSWORD` | string | `None` | No | Redis AUTH password. |
| `REDIS_SSL` | bool | `False` | No | Use TLS (`rediss://` scheme). |
| `REDIS_CONNECT_TIMEOUT` | float | `2.0` | No | Connection timeout in seconds. |
| `REDIS_SOCKET_TIMEOUT` | float | `2.0` | No | Socket read/write timeout in seconds. |
| `CACHE_ENABLED` | bool | `True` | No | Enable gateway config caching in Redis. When `False`, every request loads config from PostgreSQL. |

---

## Gateway and Flow Control

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `TRUSTED_PROXY_COUNT` | int | `0` | No | Number of trusted reverse proxies. `0` = ignore `X-Forwarded-For` (use socket IP). `1` = single proxy (Nginx in Docker), use rightmost XFF entry. Set to match your proxy stack. |
| `GATEWAY_TOKEN_GET_ENABLED` | bool | `False` | No | Enable legacy `GET /token/generate` endpoint. **Disabled by default** because credentials in query params leak into logs and browser history. Use `POST /token/generate`. |
| `GATEWAY_JWT_EXPIRE_SECONDS` | int | `3600` | No | Default lifetime of gateway client JWTs. Can be overridden per-client via `token_expire_seconds`. |
| `GATEWAY_MAX_RESPONSE_ROWS` | int | `10000` | No | Maximum number of rows returned by gateway responses. |
| `GATEWAY_FIREWALL_DEFAULT_ALLOW` | bool | `True` | No | Default action when no firewall rule matches. Firewall is currently always-allow. |
| `GATEWAY_ACCESS_LOG_BODY` | bool | `False` | No | Store `request_body`, `request_headers`, and `request_params` in access records. Increases storage. |
| `GATEWAY_CONFIG_CACHE_TTL_SECONDS` | int | `300` | No | TTL for cached API config in Redis. `0` = disable caching. |
| `FLOW_CONTROL_RATE_LIMIT_ENABLED` | bool | `True` | No | Master switch for gateway rate limiting. |
| `FLOW_CONTROL_RATE_LIMIT_PER_MINUTE` | int | `60` | No | Default sliding-window rate limit (requests/minute). Can be overridden per-API or per-client. |
| `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` | int | `10` | No | Max in-flight requests per client/IP. `0` = no limit. Can be overridden per-client. |
| `CONCURRENT_DEBUG` | string | `"0"` | No | Set to `"1"` to log concurrent acquire/release events. Read from `os.environ` at runtime, not from app Settings. |

---

## Auth Rate Limits

Separate rate limits for authentication endpoints to prevent brute-force attacks.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `AUTH_RATE_LIMIT_LOGIN` | int | `5` | No | Max login attempts per minute per IP. |
| `AUTH_RATE_LIMIT_PASSWORD_RECOVERY` | int | `3` | No | Max password recovery requests per minute per IP. |
| `AUTH_RATE_LIMIT_RESET_PASSWORD` | int | `5` | No | Max password reset attempts per minute per IP. |
| `AUTH_RATE_LIMIT_TOKEN_GENERATE` | int | `10` | No | Max gateway token generation requests per minute per IP. |

---

## External Database Connections

Controls the connection pool for **external data sources** (not the app database).

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `EXTERNAL_DB_POOL_SIZE` | int | `5` | No | Max connections per data source. |
| `EXTERNAL_DB_CONNECT_TIMEOUT` | int | `10` | No | TCP connect timeout (seconds). |
| `EXTERNAL_DB_STATEMENT_TIMEOUT` | int \| None | `None` | No | Statement execution timeout (seconds). `None` = no timeout. Supported for PostgreSQL and MySQL. |

---

## SQL Engine

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SQL_TEMPLATE_MAX_SIZE` | int | `1048576` (1 MB) | No | Maximum size of SQL template source in bytes. |
| `SQL_RENDERED_MAX_SIZE` | int | `10485760` (10 MB) | No | Maximum size of rendered SQL output in bytes. |

---

## Script Engine

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRIPT_EXEC_TIMEOUT` | int \| None | `None` | No | Maximum execution time (seconds) for Python script APIs. Thread-based, works on all platforms. `None` = no timeout. |
| `SCRIPT_EXTRA_MODULES` | string | `""` | No | Comma-separated module whitelist for script APIs (e.g. `"pandas,numpy"`). Top-level names only (`^[a-zA-Z_][a-zA-Z0-9_]*$`). Modules must be installed in the backend Python environment. |
| `SCRIPT_HTTP_ALLOWED_HOSTS` | string | `""` | No | Comma-separated hostnames that scripts are allowed to make HTTP requests to. Empty = all hosts allowed. Example: `"api.example.com,data.internal.com"`. |

**Script `env` whitelist:** The `env` context object in scripts can only read these environment variables by default: `PROJECT_NAME`, `ENVIRONMENT`, `API_V1_STR`, `EXTERNAL_DB_POOL_SIZE`, `EXTERNAL_DB_CONNECT_TIMEOUT`, `CACHE_ENABLED`. Other variables are hidden to prevent secret leakage.

---

## Email (SMTP)

Used for password-reset flows. If `SMTP_HOST` and `EMAILS_FROM_EMAIL` are both empty, email features are disabled.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SMTP_HOST` | string | `None` | No | SMTP server hostname. |
| `SMTP_PORT` | int | `587` | No | SMTP port. |
| `SMTP_USER` | string | `None` | No | SMTP username. |
| `SMTP_PASSWORD` | string | `None` | No | SMTP password. |
| `SMTP_TLS` | bool | `True` | No | Use STARTTLS. |
| `SMTP_SSL` | bool | `False` | No | Use implicit SSL/TLS (port 465). |
| `EMAILS_FROM_EMAIL` | email | `None` | No | Sender email address. |
| `EMAILS_FROM_NAME` | string | `PROJECT_NAME` | No | Sender display name. |
| `EMAIL_RESET_TOKEN_EXPIRE_HOURS` | int | `1` | No | Password-reset token lifetime (hours). |

---

## First Superuser

Created automatically on first startup by the prestart seed.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `FIRST_SUPERUSER` | string | --- | **Yes** | Username of the initial superuser account. |
| `FIRST_SUPERUSER_PASSWORD` | string | --- | **Yes** | Password. Must be changed from `"changethis"` in staging/production. |
| `FIRST_SUPERUSER_EMAIL` | string | `None` | No | Optional email for the superuser (used for password recovery). |

---

## Monitoring

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SENTRY_DSN` | URL | `None` | No | Sentry DSN for error tracking. Leave empty to disable. |

---

## Docker and Deployment

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DOCKER_IMAGE_BACKEND` | string | `pydbapi` | No | Docker image name for the app (Nginx + FastAPI). |
| `TAG` | string | `latest` | No | Docker image tag. |
| `APP_PORT` | int | `80` | No | Port exposed by the app container. |
| `DOMAIN` | string | `localhost` | No | Domain for emails and optional reverse-proxy config. |
| `STACK_NAME` | string | --- | No | Docker Compose project name (used by some CI workflows). |

---

## Frontend (Build-time)

Vite build-time variables, set as Docker build args or in `frontend/.env`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VITE_API_URL` | URL | `""` | Backend API base URL baked into the frontend build. Empty = same origin (recommended). |
| `NODE_ENV` | string | `development` | `"production"` enables minification and optimizations. |

