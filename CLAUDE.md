# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

pyDBAPI is a database API platform where users define API endpoints using SQL (Jinja2 templates) or Python scripts (RestrictedPython sandbox), then expose them via a dynamic gateway with auth, rate limiting, and versioning. Stack: FastAPI + React (TypeScript/Vite/shadcn), PostgreSQL, Redis. Deployed as a single Docker image (Nginx + FastAPI).

## Common Commands

### Backend

```bash
cd backend && uv sync                          # Install dependencies
cd backend && uv run pytest tests/ -v          # Run all tests (or: make test)
cd backend && uv run pytest tests/path/test_file.py -v          # Run single test file
cd backend && uv run pytest tests/path/test_file.py::test_name  # Run single test
cd backend && uv run uvicorn app.main:app --reload              # Dev server (port 8000)
cd backend && uv run alembic upgrade head      # Apply migrations (or: make migrate)
make migrate-new msg="description"             # Create new migration from models
cd backend && uv run prek run --all-files      # Lint + format (ruff via prek)
```

### Frontend

```bash
cd frontend && bun install && bun run dev      # Dev server (port 5173, proxies /api to :8000)
cd frontend && bun run build                   # Production build
```

### Docker / Integration

```bash
docker compose up -d                           # Full stack (db, redis, app on port 80)
docker compose up -d db redis                  # Just infra (for local backend dev)
make integration-test                          # Spins up db+redis, migrates, runs pytest, tears down
```

### Frontend Client Generation

```bash
./scripts/generate-client.sh                   # Regenerate TypeScript client from OpenAPI schema
```

## Architecture

### Two API Layers

1. **Management API** (`/api/v1/...`) — Admin CRUD for users, roles, data sources, modules, API assignments, clients, groups, access logs. Standard REST with RBAC.

2. **Gateway** (`/api/{path:path}`) — Dynamic endpoint execution. Request flow:
   firewall → resolve (path+method → ApiAssignment) → auth (JWT, if private) → concurrent limit → rate limit → parse params → execute (SQL or Script engine) → format response → access log (background).

### Key Backend Directories

- `app/api/routes/` — Route handlers (gateway.py is the dynamic gateway catch-all)
- `app/core/gateway/` — Gateway pipeline: resolver, auth, runner, ratelimit, concurrent, config_cache, firewall
- `app/engines/sql/` — Jinja2 SQL template engine with custom filters (`sql_string`, `sql_int`, `sql_in_list`) and tags (`{% where %}`, `{% set %}`)
- `app/engines/script/` — RestrictedPython executor with sandboxed context (`db`, `http`, `cache`, `req`, `tx`, `ds`, `env`, `log`)
- `app/models_dbapi.py` — All domain models (DataSource, ApiAssignment, ApiContext, ApiModule, AppClient, etc.)
- `app/schemas_dbapi.py` — Pydantic request/response schemas
- `app/core/config.py` — Pydantic Settings (all env vars)
- `app/alembic/` — Database migrations

### Key Frontend Structure

- `src/components/` — Feature-grouped: ApiDev, DataSource, Dashboard, Admin, Security, System
- `src/client/` — Auto-generated OpenAPI client (regenerate with `scripts/generate-client.sh`)
- `src/routes/` — TanStack Router pages
- Uses TanStack Query for server state, Monaco Editor for SQL/Python editing

### Data Model Essentials

- **DataSource** — DB connection (PostgreSQL/MySQL/Trino) with encrypted credentials (Fernet)
- **ApiModule** — Groups APIs (organizational only, not part of gateway URL)
- **ApiAssignment** — Endpoint definition (path + HTTP method = globally unique). Links to DataSource and engine type (SQL or SCRIPT)
- **ApiContext** — SQL/Python content + parameter definitions for an API
- **AppClient** — Gateway consumer with client_id/secret for private API auth
- **VersionCommit** — Tracks published versions of API content and macros

## Testing

Tests require a running PostgreSQL (with migrations applied) and use `FastAPI TestClient`. The `db` fixture is session-scoped and runs `init_db` to seed data. Use `make integration-test` for a self-contained run that manages Docker infra.

## Linting & Formatting

Python: **ruff** (configured in `backend/pyproject.toml`). Pre-commit via **prek** — install hook: `cd backend && uv run prek install -f`. Frontend: **Biome** (`frontend/biome.json`).

## Environment

Required env vars: `SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`. Full reference: `docs/ENV_REFERENCE.md`. Docker Compose reads `.env` at project root (see `.env.example`).
