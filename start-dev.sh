#!/usr/bin/env bash

# Backward-compatible wrapper.
# Canonical script lives in scripts/start-dev.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="$SCRIPT_DIR/scripts/start-dev.sh"

if [ ! -f "$TARGET_SCRIPT" ]; then
  echo "❌ Не найден скрипт запуска: $TARGET_SCRIPT" >&2
  exit 1
fi

exec bash "$TARGET_SCRIPT" "$@"
