# pyDBAPI

A database API platform that turns SQL queries and Python scripts into secure, versioned HTTP APIs — with authentication, rate limiting, concurrency control, and a management dashboard.

Connect your databases, write a query or script, publish, and call it via REST.

**Supported databases:** PostgreSQL, MySQL, Trino, and compatible protocols (StarRocks, RisingWave, etc.)

**Stack:** FastAPI + React (TypeScript / Vite / shadcn/ui), PostgreSQL, Redis. Single-port Docker deployment (Nginx + FastAPI in one image).

## Quick Start

```bash
git clone https://github.com/viethqb/pydbapi.git
cd pydbapi
cp .env.example .env
# Edit .env — at minimum set these four:
#   SECRET_KEY, POSTGRES_PASSWORD, FIRST_SUPERUSER, FIRST_SUPERUSER_PASSWORD
docker compose up -d
```

Open `http://localhost` and log in with `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`.

Management API docs: `http://localhost/api/docs`

## How It Works

```text
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  Dashboard   │──────▶│  Management API  │──────▶│  PostgreSQL  │
│  (React UI)  │       │  /api/v1/...     │       │  (app DB)    │
└──────────────┘       └──────────────────┘       └──────────────┘

┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│  External   │──────▶│  Gateway         │──────▶│  Your DB     │
│  Client     │       │  /api/{path}     │       │  (PG/MySQL/  │
└─────────────┘       └──────────────────┘       │   Trino)     │
                                                 └──────────────┘
```

1. **Connect** — Add a data source (PostgreSQL, MySQL, Trino, or compatible DBs) in the dashboard
2. **Define** — Create an API endpoint: write SQL (Jinja2 template) or Python script, define parameters, set access type (public/private)
3. **Publish** — Version and publish the API to the gateway
4. **Call** — Consumers call the live endpoint:

```bash
# Public API — no auth needed
curl "http://localhost/api/users?limit=10"

# Private API — get a JWT token first
TOKEN=$(curl -s -X POST http://localhost/api/token/generate \
  -H "Content-Type: application/json" \
  -d '{"client_id":"my-app","client_secret":"secret123"}' | jq -r '.access_token')

curl -H "Authorization: Bearer $TOKEN" "http://localhost/api/orders?status=1"
```

## Configuration

Required environment variables (set in `.env`):

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | JWT signing key — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `POSTGRES_PASSWORD` | App database password |
| `FIRST_SUPERUSER` | Initial admin username |
| `FIRST_SUPERUSER_PASSWORD` | Initial admin password |

See [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) for the complete reference (50+ variables for Redis, rate limits, script sandbox, etc.).

## Documentation

| Document | Description |
|----------|-------------|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | End-to-end flow, features, and capabilities |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, diagrams, and data model |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Gateway internals, engines, parameters, and limits |
| [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) | Complete environment variable reference |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [deployment.md](deployment.md) | Production deployment guide |
| [development.md](development.md) | Local development setup |
| [backend/README.md](backend/README.md) | Backend development |
| [frontend/README.md](frontend/README.md) | Frontend development |

## License

MIT
