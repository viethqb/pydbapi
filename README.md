# pyDBAPI

**pyDBAPI** is a DB API platform: manage data sources (PostgreSQL, MySQL, Trino, and DBs using PostgreSQL/MySQL protocol such as StarRocks, RisingWave), define API endpoints with SQL (Jinja2) or Python scripts, and expose them through a dynamic gateway with auth, rate limiting, and versioning.

## Technology Stack and Features

- ⚡ [**FastAPI**](https://fastapi.tiangolo.com) for the Python backend API.
  - 🧰 [SQLModel](https://sqlmodel.tiangolo.com) for the app database (PostgreSQL).
  - 💾 **DataSources**: connect to external PostgreSQL, MySQL, Trino, and PostgreSQL/MySQL-compatible DBs (e.g. StarRocks, RisingWave); connection pool and health checks.
  - 📝 **API Assignments**: define APIs with SQL (Jinja2 templates) or Python scripts (RestrictedPython sandbox).
  - 🚪 **Gateway**: dynamic `/{module}/{path}` routing (no `/api` prefix), JWT auth (from POST /token/generate), rate limiting (Redis or in-memory).
  - 📌 Modules, groups, clients, version commits (api-assignments, macro-defs).
- 🚀 [**React**](https://react.dev) for the frontend (TypeScript, Vite, Tailwind, shadcn/ui).
  - 🤖 Auto-generated OpenAPI client.
  - 🦇 Dark mode support.
- 🐋 [**Docker Compose**](https://www.docker.com) for development and production.
- 📞 [**Traefik**](https://traefik.io) as reverse proxy with HTTPS (Let’s Encrypt).
- 🔒 Secure password hashing, JWT auth, email-based password recovery.
- ✅ Tests with [Pytest](https://pytest.org); CI/CD with GitHub Actions.

### Screenshots

#### Login

[![Login](img/login.png)](img/login.png)  

#### Dashboard

[![Dashboard](img/dashboard.png)](img/dashboard.png)
[![Dashboard2](img/dashboard2.png)](img/dashboard2.png)  

#### Connection

[![Connection](img/connection.png)](img/connection.png)
[![Connection2](img/connection2.png)](img/connection2.png)

#### API Dev/Modules

[![Modules](img/modules.png)](img/modules.png)

#### API Dev/Macro-defs

[![Macro-defs](img/macro-defs.png)](img/macro-defs.png)

#### Api Dev/APIs

**List API**
[![Api-dev1](img/api-dev1.png)](img/api-dev1.png)

**Create/Edit API**
[![Api-dev2](img/api-dev2.png)](img/api-dev2.png)
[![Api-dev3](img/api-dev3.png)](img/api-dev3.png)
[![Api-dev4](img/api-dev4.png)](img/api-dev4.png)

**API Detail**
[![Api-dev5](img/api-dev5.png)](img/api-dev5.png)
[![Api-dev6](img/api-dev6.png)](img/api-dev6.png)
[![Api-dev7](img/api-dev7.png)](img/api-dev7.png)
[![Api-dev8](img/api-dev8.png)](img/api-dev8.png)

**API Repository**
[![API Repository](img/api-repository.png)](img/api-repository.png)

#### Group

[![Group](img/groups.png)](img/groups.png)

#### Clients

[![Clients](img/clients.png)](img/clients.png)

#### Access Logs

[![Access Logs](img/access-logs.png)](img/access-logs.png)

#### RBAC

[![RBAC](img/rbac.png)](img/rbac.png)

## Documentation

- **[docs/OVERVIEW.md](docs/OVERVIEW.md)** — End-to-end flow (setup → data sources → APIs → gateway → clients), feature list, and main configuration.
- **[docs/TECHNICAL.md](docs/TECHNICAL.md)** — Technical logic: gateway flow, module/path resolution, parameters, concurrent and rate limits, SQL/Jinja2 and script engines, config cache.

## How To Use It

Clone the repository and run with Docker Compose:

```bash
git clone https://github.com/viethqb/pydbapi.git
cd pydbapi
cp .env.example .env   # if present; otherwise create .env from deployment docs
# Edit .env: SECRET_KEY, POSTGRES_PASSWORD, FIRST_SUPERUSER, FIRST_SUPERUSER_PASSWORD
docker compose up -d
```

### Configure

Set at least these in `.env` before deployment:

- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`

You can (and should) pass these as environment variables from secrets.

See [deployment.md](./deployment.md) for details.

### Generate Secret Keys

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Use the output as password or secret key; run again for additional keys.

## Backend Development

See [backend/README.md](./backend/README.md).

## Frontend Development

See [frontend/README.md](./frontend/README.md).

## Deployment

See [deployment.md](./deployment.md).

## Development

See [development.md](./development.md) (Docker Compose, local domains, `.env`).

## Release Notes

See [release-notes.md](./release-notes.md).

## License

pyDBAPI is licensed under the MIT license.
