# PyDBAPI – common targets
# Requires: uv (https://docs.astral.sh/uv/) or use scripts directly

.PHONY: venv install test migrate integration-test docker-up docker-down

venv:
	@./scripts/setup-venv.sh

install: venv
	@uv sync

test:
	@cd backend && uv run pytest tests/ -v

migrate:
	@cd backend && uv run alembic upgrade head

migrate-new:
	@cd backend && uv run alembic revision --autogenerate -m "$(if $(msg),$(msg),change)"

# Integration test: start db+redis via Docker, run migrations + pytest, then down
integration-test:
	@./scripts/integration-test.sh

docker-up:
	@docker compose -f docker-compose.test.yml up -d --wait

docker-down:
	@docker compose -f docker-compose.test.yml down
