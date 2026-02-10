#! /usr/bin/env bash
# ------------------------------------------------------------------
# prestart.sh — runs BEFORE the backend container starts.
#
# Steps:
#   1. Wait for Postgres to be ready (retry loop in Python).
#   2. Back up current alembic revision (for rollback reference).
#   3. Run alembic upgrade head.
#   4. Verify the DB is now at head — fail loudly if not.
#   5. Seed initial data (superuser, roles, permissions).
# ------------------------------------------------------------------
set -euo pipefail

echo "======== prestart: waiting for DB ========"
python app/backend_pre_start.py

# Save the current revision before migrating (useful for rollback)
PREV_REV=$(alembic current 2>/dev/null | head -1 || echo "none")
echo "======== prestart: current alembic revision: ${PREV_REV} ========"

echo "======== prestart: running alembic upgrade head ========"
alembic upgrade head

# Verify migration landed at head
echo "======== prestart: verifying migration state ========"
CURRENT=$(alembic current 2>/dev/null | grep "(head)" || true)
if [ -z "${CURRENT}" ]; then
  echo "ERROR: alembic is NOT at head after upgrade!"
  echo "       current: $(alembic current 2>/dev/null)"
  echo "       This deployment is ABORTED."
  exit 1
fi
echo "======== prestart: migration verified — ${CURRENT} ========"

echo "======== prestart: seeding initial data ========"
python app/initial_data.py

echo "======== prestart: done ========"
