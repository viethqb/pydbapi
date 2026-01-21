#!/usr/bin/env bash
# Create .venv and install dependencies for development and testing.
# Prefer: uv (https://docs.astral.sh/uv/). Fallback: python -m venv + pip.

set -e
cd "$(dirname "$0")/.."

if command -v uv &>/dev/null; then
  uv venv
  uv sync
  echo "venv ready. Use: source .venv/bin/activate or uv run <cmd>"
elif command -v python3 &>/dev/null; then
  python3 -m venv .venv
  # shellcheck disable=SC1091
  . .venv/bin/activate
  pip install -e ./backend
  pip install pytest mypy ruff prek types-passlib coverage
  echo "venv ready. Use: source .venv/bin/activate"
else
  echo "Need python3 or uv. Install uv: https://docs.astral.sh/uv/"
  exit 1
fi
