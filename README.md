# pyDBAPI

DB API platform: connect to PostgreSQL, MySQL, Trino (and compatible DBs like StarRocks, RisingWave), define APIs with SQL (Jinja2) or Python scripts, and expose them via a gateway with auth, rate limiting, and versioning.

**Stack:** FastAPI, React (TypeScript, Vite, shadcn/ui), PostgreSQL, Redis. Single-port deployment (Nginx + FastAPI in one image). Optional: StarRocks, Trino in Docker Compose.

## Quick start

```bash
git clone https://github.com/viethqb/pydbapi.git
cd pydbapi
cp .env.example .env   # if present
# Edit .env: SECRET_KEY, POSTGRES_PASSWORD, FIRST_SUPERUSER, FIRST_SUPERUSER_PASSWORD
docker compose up -d
```

Open `http://localhost` (or `http://localhost:80`). Log in with `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD`.

## Config

Required in `.env`: `SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`. See [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) for all variables.

## Docs

- [docs/OVERVIEW.md](docs/OVERVIEW.md) — Setup, data sources, APIs, gateway, clients
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Architecture and diagrams
- [deployment.md](deployment.md) — Deployment
- [development.md](development.md) — Local development
- [backend/README.md](backend/README.md) — Backend dev
- [frontend/README.md](frontend/README.md) — Frontend dev

## License

MIT
