#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

while true; do
  echo "[$(date)] Starting relay-backend..." >> "$SCRIPT_DIR/backend.log"
  bun src/index.ts >> "$SCRIPT_DIR/backend.log" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] relay-backend exited with code $EXIT_CODE, restarting in 2s..." >> "$SCRIPT_DIR/backend.log"
  sleep 2
done
