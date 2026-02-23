#!/usr/bin/env bash
# Integration test: start db+redis with docker-compose.yml,
# run alembic migrate and pytest, then tear down.

set -e
cd "$(dirname "$0")/.."

# Load .env if present (for SECRET_KEY, FIRST_SUPERUSER, PROJECT_NAME, etc.)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Override to point at local Docker services (must match docker-compose.yml)
export POSTGRES_SERVER=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=app
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=app
export MYSQL_PASSWORD=app
export MYSQL_DATABASE=app
export REDIS_HOST=localhost
export ENVIRONMENT=${ENVIRONMENT:-local}
export PROJECT_NAME=${PROJECT_NAME:-pyDBAPI}
export SECRET_KEY=${SECRET_KEY:-secret-key-for-integration-test}
export FIRST_SUPERUSER=${FIRST_SUPERUSER:-admin@example.com}
export FIRST_SUPERUSER_PASSWORD=${FIRST_SUPERUSER_PASSWORD:-changethis}

echo "Starting db and redis (docker-compose.yml)..."
docker compose up -d db redis --wait

cleanup() {
  echo "Stopping docker-compose..."
  docker compose down
}
trap cleanup EXIT

echo "Running migrations..."
(cd backend && uv run alembic upgrade head)

echo "Running pytest..."
(cd backend && uv run pytest tests/ -v)

echo "Integration tests passed."
