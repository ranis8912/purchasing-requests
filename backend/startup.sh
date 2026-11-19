#!/usr/bin/env bash
# App Service startup command: bash /home/site/wwwroot/startup.sh
# Python packages live in a venv on /home (persistent) and are reinstalled only when requirements.txt changes,
# so restarts are fast. One uvicorn process: SQLite on /home must have a single writer.
set -euo pipefail

APP_DIR=/home/site/wwwroot
VENV=/home/site/purreq-venv
mkdir -p /home/data

HASH=$(sha256sum "$APP_DIR/requirements.txt" | cut -d" " -f1)
if [ ! -f "$VENV/.req-hash" ] || [ "$(cat "$VENV/.req-hash")" != "$HASH" ]; then
  echo "startup: installing Python packages (requirements changed)"
  rm -rf "$VENV"
  python -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --no-cache-dir -r "$APP_DIR/requirements.txt"
  echo "$HASH" > "$VENV/.req-hash"
fi

cd "$APP_DIR"
exec "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
