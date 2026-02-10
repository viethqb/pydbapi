#!/usr/bin/env bash
# ------------------------------------------------------------------
# rollback.sh — Roll back a failed deployment.
#
# Usage:
#   ./scripts/rollback.sh                  # rollback containers only (images)
#   ./scripts/rollback.sh --migrate -1     # also rollback last alembic revision
#   ./scripts/rollback.sh --migrate <rev>  # rollback to a specific alembic revision
#
# Flags:
#   --migrate <target>   Run alembic downgrade <target> before restarting.
#                         Use "-1" for one step back, or a revision hash.
#   --dry-run            Print what would happen without executing.
#   --help               Show this help.
#
# Prerequisites:
#   - Docker Compose project must already be running (or images available).
#   - Run from the project root directory.
#   - .env file must be present with DOCKER_IMAGE_BACKEND, STACK_NAME, etc.
# ------------------------------------------------------------------
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
MIGRATE_TARGET=""
DRY_RUN=false

usage() {
  head -25 "$0" | tail -21
  exit 0
}

log() { echo "[rollback] $(date '+%H:%M:%S') $*"; }
die() { echo "[rollback] ERROR: $*" >&2; exit 1; }

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrate)
      shift
      MIGRATE_TARGET="${1:?--migrate requires a target (e.g. -1 or revision hash)}"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      die "Unknown argument: $1 (try --help)"
      ;;
  esac
done

# --- Validate environment ---
if [ ! -f "${COMPOSE_FILE}" ]; then
  die "Cannot find ${COMPOSE_FILE}. Run this script from the project root."
fi

PROJECT_NAME="${STACK_NAME:-$(basename "$(pwd)")}"
log "Project: ${PROJECT_NAME}"

run() {
  if $DRY_RUN; then
    log "[dry-run] $*"
  else
    "$@"
  fi
}

# --- Step 1: Alembic downgrade (optional) ---
if [ -n "${MIGRATE_TARGET}" ]; then
  log "Step 1: Rolling back alembic to '${MIGRATE_TARGET}'"
  log "  Current migration state:"
  docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
    run --rm --no-deps backend alembic current 2>/dev/null || true

  run docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
    run --rm --no-deps backend alembic downgrade "${MIGRATE_TARGET}"

  log "  Migration state after rollback:"
  docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
    run --rm --no-deps backend alembic current 2>/dev/null || true
else
  log "Step 1: Skipping alembic rollback (no --migrate flag)"
fi

# --- Step 2: Restart services with previous images ---
log "Step 2: Stopping services"
run docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
  stop backend frontend prestart

log "Step 3: Starting services (will use current images)"
run docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
  up -d backend frontend

# --- Step 4: Wait for health check ---
log "Step 4: Waiting for backend health check (up to 60s)..."
if ! $DRY_RUN; then
  BACKEND_CONTAINER=$(docker compose -f "${COMPOSE_FILE}" --project-name "${PROJECT_NAME}" \
    ps -q backend 2>/dev/null || true)
  if [ -n "${BACKEND_CONTAINER}" ]; then
    TRIES=0
    MAX_TRIES=12
    while [ $TRIES -lt $MAX_TRIES ]; do
      HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "${BACKEND_CONTAINER}" 2>/dev/null || echo "unknown")
      if [ "${HEALTH}" = "healthy" ]; then
        log "Backend is healthy!"
        break
      fi
      TRIES=$((TRIES + 1))
      log "  Health: ${HEALTH} (attempt ${TRIES}/${MAX_TRIES})"
      sleep 5
    done
    if [ $TRIES -eq $MAX_TRIES ]; then
      log "WARNING: Backend did not become healthy within 60s"
      log "Check logs: docker compose -f ${COMPOSE_FILE} --project-name ${PROJECT_NAME} logs backend"
    fi
  fi
fi

log "Rollback complete."
log ""
log "Useful commands:"
log "  docker compose -f ${COMPOSE_FILE} --project-name ${PROJECT_NAME} logs backend --tail=50"
log "  docker compose -f ${COMPOSE_FILE} --project-name ${PROJECT_NAME} ps"
