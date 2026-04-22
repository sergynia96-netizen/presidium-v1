#!/usr/bin/env bash

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;37m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELAY_PATH="$PROJECT_ROOT/mini-services/relay-backend"
RELAY_ENV="$RELAY_PATH/.env"
RELAY_DB="$RELAY_PATH/presidium.db"

read_env_value() {
  local file="$1"
  local key="$2"

  [ -f "$file" ] || return 1
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  [ -n "$line" ] || return 1

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  touch "$file"
  if grep -q -E "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { updated = 0 }
      {
        if (!updated && $0 ~ ("^" k "=")) {
          print k "=" v
          updated = 1
          next
        }
        print
      }
    ' "$file" > "${file}.tmp"
    mv "${file}.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

is_port_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1
    return $?
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .
    return $?
  fi
  return 1
}

open_in_terminal() {
  local title="$1"
  local command="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -lc "$command; exec bash"
    return 0
  fi
  if command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="$title" -e "bash -lc '$command; exec bash'"
    return 0
  fi
  if command -v kitty >/dev/null 2>&1; then
    kitty --title "$title" bash -lc "$command; exec bash"
    return 0
  fi

  return 1
}

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}     PRESIDIUM Messenger Dev Launcher      ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${GRAY}📁 Project root: $PROJECT_ROOT${NC}"
echo ""

if ! command -v bun >/dev/null 2>&1; then
  echo -e "${RED}❌ Bun не найден. Установите Bun: https://bun.sh/${NC}"
  exit 1
fi

if [ ! -d "$RELAY_PATH" ]; then
  echo -e "${RED}❌ Relay backend не найден: $RELAY_PATH${NC}"
  exit 1
fi

if is_port_busy 3000; then
  echo -e "${YELLOW}⚠️ Порт 3000 уже занят (возможно Next.js уже запущен).${NC}"
fi
if is_port_busy 3001; then
  echo -e "${YELLOW}⚠️ Порт 3001 уже занят (возможно Relay уже запущен).${NC}"
fi

NEXTAUTH_SECRET_VALUE="$(read_env_value "$PROJECT_ROOT/.env.local" "NEXTAUTH_SECRET" || true)"
if [ -z "$NEXTAUTH_SECRET_VALUE" ]; then
  NEXTAUTH_SECRET_VALUE="$(read_env_value "$PROJECT_ROOT/.env" "NEXTAUTH_SECRET" || true)"
fi
if [ -z "$NEXTAUTH_SECRET_VALUE" ]; then
  NEXTAUTH_SECRET_VALUE="dev-secret-key-change-in-production"
  echo -e "${YELLOW}⚠️ NEXTAUTH_SECRET не найден в .env.local/.env. Использую dev-ключ.${NC}"
fi

upsert_env "$RELAY_ENV" "PORT" "3001"
upsert_env "$RELAY_ENV" "CORS_ORIGINS" "http://localhost:3000,http://127.0.0.1:3000"
upsert_env "$RELAY_ENV" "JWT_SECRET" "$NEXTAUTH_SECRET_VALUE"
upsert_env "$RELAY_ENV" "RELAY_DATABASE_URL" "file:./presidium.db"
upsert_env "$RELAY_ENV" "RELAY_DEV_OTP_PREVIEW" "true"

echo -e "${GREEN}✅ mini-services/relay-backend/.env синхронизирован (JWT_SECRET = NEXTAUTH_SECRET).${NC}"

if [ ! -d "$RELAY_PATH/node_modules" ]; then
  echo -e "${YELLOW}📦 Установка зависимостей relay...${NC}"
  (cd "$RELAY_PATH" && bun install)
fi

if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  echo -e "${YELLOW}📦 Установка зависимостей приложения...${NC}"
  (cd "$PROJECT_ROOT" && bun install)
fi

if [ ! -f "$RELAY_DB" ]; then
  echo -e "${YELLOW}🗄️ Инициализация relay БД (bun run db:push)...${NC}"
  (cd "$RELAY_PATH" && bun run db:push)
fi

RELAY_CMD="cd \"$RELAY_PATH\" && bun run dev"
NEXT_CMD="cd \"$PROJECT_ROOT\" && bun run dev"

echo -e "${GREEN}🚀 Запуск Relay Backend...${NC}"
if ! open_in_terminal "Relay Backend" "$RELAY_CMD"; then
  bash -lc "$RELAY_CMD" &
  echo -e "${YELLOW}⚠️ Не найден GUI-терминал, Relay запущен в фоне текущей сессии.${NC}"
fi

sleep 2

echo -e "${GREEN}🚀 Запуск Next.js App...${NC}"
if ! open_in_terminal "Next.js App" "$NEXT_CMD"; then
  bash -lc "$NEXT_CMD" &
  echo -e "${YELLOW}⚠️ Не найден GUI-терминал, Next.js запущен в фоне текущей сессии.${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Оба сервера запущены${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}📱 App:   http://localhost:3000${NC}"
echo -e "${CYAN}🔌 Relay: http://localhost:3001${NC}"
echo -e "${CYAN}💊 Health: http://localhost:3001/health${NC}"
