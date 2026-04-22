#!/usr/bin/env bash
set -euo pipefail

# Run FastAPI dev server from the project root so `backend` is importable
# as a package — the same layout Vercel uses, which keeps `from .routes...`
# imports working in both environments.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

uvicorn backend.main:app \
  --host 127.0.0.1 \
  --port 5500 \
  --reload \
  --reload-dir backend \
  --reload-exclude "**/.venv/*" \
  --reload-exclude "**/__pycache__/*"
