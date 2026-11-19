#!/usr/bin/env bash
# App Service startup command: bash /home/site/wwwroot/startup.sh
# Python packages are bundled in packages/ by scripts/package.py, so nothing is installed at boot.
# One uvicorn process: SQLite on /home must have a single writer.
set -euo pipefail

APP_DIR=/home/site/wwwroot
mkdir -p /home/data
cd "$APP_DIR"
export PYTHONPATH="$APP_DIR/packages"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
