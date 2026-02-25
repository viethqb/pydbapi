# ==============================================================
# Stage 1: Build frontend
# ==============================================================
FROM oven/bun:1 AS frontend-build

WORKDIR /app

COPY package.json bun.lock /app/
COPY frontend/package.json /app/frontend/

WORKDIR /app/frontend
RUN bun install

COPY ./frontend /app/frontend

# Empty VITE_API_URL = frontend calls same origin (same port as nginx)
ARG VITE_API_URL=""
RUN bun run build

# ==============================================================
# Stage 2: Install Python dependencies
# ==============================================================
FROM python:3.12-slim AS backend-build

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-workspace --package pydbapi-backend

COPY ./backend/scripts /app/backend/scripts
COPY ./backend/pyproject.toml ./backend/alembic.ini /app/backend/
COPY ./backend/app /app/backend/app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=backend/pyproject.toml,target=backend/pyproject.toml \
    uv sync --frozen --package pydbapi-backend --group script-extras

# ==============================================================
# Stage 3: Final unified image (nginx + FastAPI)
# ==============================================================
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python venv from backend build
COPY --from=backend-build /app/.venv /app/.venv
COPY --from=backend-build /app/backend /app/backend

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Copy frontend build output into nginx html dir
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# Copy nginx + supervisord configs from docker/
COPY docker/nginx-unified.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Remove default nginx site
RUN rm -f /etc/nginx/sites-enabled/default

EXPOSE 80

STOPSIGNAL SIGTERM

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
