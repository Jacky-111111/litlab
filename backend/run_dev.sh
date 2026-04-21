#!/usr/bin/env bash
set -euo pipefail

# Run FastAPI dev server with focused reload scope.
# This avoids watchfiles loops from virtualenv/site-packages changes.
uvicorn main:app \
  --host 127.0.0.1 \
  --port 5500 \
  --reload \
  --reload-dir "." \
  --reload-exclude ".venv/*" \
  --reload-exclude "**/.venv/*" \
  --reload-exclude "**/__pycache__/*"
