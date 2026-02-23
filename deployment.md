# Deployment

Deploy with Docker Compose. The app runs as a single service (Nginx + FastAPI) on one port.

## Preparation

- Server with Docker installed.
- DNS (optional): point your domain to the server IP if you use a custom domain.

## Environment variables

Set in `.env` or as environment variables before starting:

- **Required:** `SECRET_KEY`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`
- **Deploy:** `ENVIRONMENT=production`, `DOMAIN=your-domain.com` (if used)
- **Optional:** `BACKEND_CORS_ORIGINS`, `SMTP_*`, `SENTRY_DSN`, `REDIS_HOST=redis`, etc.

See [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) for the full list.

Generate a secret key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Deploy with Docker Compose

```bash
docker compose up -d
```

This starts: db (PostgreSQL), redis, prestart (migrations + seed), app (Nginx + FastAPI). The app listens on port 80 by default; override with `APP_PORT` (e.g. `APP_PORT=8080`).

Use only `docker-compose.yml` (no override file) so production is predictable.

## HTTPS / reverse proxy

For HTTPS, run a reverse proxy (e.g. Nginx, Caddy, Traefik) on the host or in front of Docker, and proxy to the app (e.g. `http://127.0.0.1:80`). Configure TLS and optional `BACKEND_CORS_ORIGINS` for the frontend origin.

## CI/CD (e.g. GitHub Actions)

Use repository secrets for `SECRET_KEY`, `POSTGRES_PASSWORD`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, and any `SMTP_*` or `SENTRY_DSN`. Run `docker compose up -d` on the target server (e.g. via a self-hosted runner or SSH).

## URLs after deploy

- App (dashboard + API): `http://<host>:80` or `https://<your-domain>` if you put a reverse proxy in front.
- API docs: `http://<host>/api/docs`
