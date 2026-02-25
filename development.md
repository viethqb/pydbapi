# Development

## Docker Compose

Single stack: `docker-compose.yml` (no override or separate test compose).

- **Start:** `docker compose up -d` — runs db, redis, prestart, app (Nginx + FastAPI on port 80). Optional: starrocks, trino.
- **Logs:** `docker compose logs` or `docker compose logs app`
- **Stop:** `docker compose down`

Open the app at `http://localhost` (or `http://localhost:80`). API docs: `http://localhost/api/docs`.

## Local development (without full Docker stack)

Run backend and frontend on the host for faster iteration.

1. **Backend:** from project root, ensure Postgres and Redis are running (e.g. `docker compose up -d db redis`). Then:
   ```bash
   cd backend && uv run uvicorn app.main:app --reload
   ```
   Backend: `http://localhost:8000`, docs: `http://localhost:8000/docs`.

2. **Frontend:** in another terminal:
   ```bash
   cd frontend && bun run dev
   ```
   Frontend: `http://localhost:5173`. Vite proxies `/api` and `/token` to `http://localhost:8000` (see `frontend/vite.config.ts`). Set `VITE_API_URL=` in `frontend/.env` so the app uses relative URLs.

## Kubernetes (dev with kind)

Besides Docker Compose, you can run the full stack on Kubernetes (kind) for a deployment-like environment.

See **`k8s/k8s.md`** for the full guide. Summary:

1. Create kind cluster: `kind create cluster --config k8s/kind.yaml`
2. Install ingress-nginx, PostgreSQL, Redis (exact commands in `k8s/k8s.md`)
3. Deploy pyDBAPI: `kubectl apply -f k8s/pydbapi/`
4. Add dev host: `echo "127.0.0.1 pydbapi.local" | sudo tee -a /etc/hosts`
5. Open app at `http://pydbapi.local`, API docs at `http://pydbapi.local/api/docs`

## pyDBAPI: venv, tests, migrations

- **Venv:** `make venv` or `./scripts/setup-venv.sh` (prefer [uv](https://docs.astral.sh/uv/)).

- **Unit tests:** `make test` (requires running Postgres with migrations; see `.env`).

- **Integration tests:** `make integration-test` — starts db + redis via `docker compose up -d db redis`, runs migrations and pytest, then `docker compose down`.

- **Migrations:**
  - Apply: `make migrate` or `cd backend && uv run alembic upgrade head`
  - New migration from models: `make migrate-new msg=add_foo`
  - Regenerate from scratch (empty DB, single revision): remove all files in `backend/app/alembic/versions/` except `.keep`, then `cd backend && uv run alembic revision --autogenerate -m "001_schema"`

If the DB was created with old migrations, reset: drop DB (or `docker compose down -v`), create/start DB again, then `alembic upgrade head`.

## Config and env

Docker Compose uses `.env` at the project root. Required: `SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`. See [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md).

After changing variables, restart: `docker compose up -d`.

## Pre-commit / lint (prek)

We use [prek](https://prek.j178.dev/) for linting and formatting before commits.

- Install hook (from repo root): `cd backend && uv run prek install -f`
- Run manually: `cd backend && uv run prek run --all-files`

## URLs (default)

| What        | URL |
|------------|-----|
| App (prod) | `http://localhost` |
| API docs   | `http://localhost/api/docs` |
| Local backend | `http://localhost:8000` (when running uvicorn) |
| Local frontend | `http://localhost:5173` (when running `bun run dev`) |
