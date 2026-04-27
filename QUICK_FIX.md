# PRESIDIUM — Быстрое исправление ошибок

## ⚡ Быстрый старт

### 1. Исправлено: Nested Button Error
Файл `src/components/messenger/e2e/encryption-status.tsx` — `<button>` заменен на `<span>` с `role="button"`.

### 2. Запуск Relay Backend (ОБЯЗАТЕЛЬНО!)

```bash
# В отдельном терминале:
cd mini-services/relay-backend

# Создать .env файл:
echo "PORT=3001
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=your-secret-key
RELAY_DATABASE_URL=file:./presidium.db
RELAY_DEV_OTP_PREVIEW=true" > .env

# Установить зависимости (первый раз):
bun install

# Инициализировать БД:
bun run db:push

# Запустить сервер:
bun run dev
```

### 3. Запуск Next.js App

```bash
# В другом терминале (из корня проекта):
bun run dev
```

---

## 🔴 Основные ошибки и решения

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `WebSocket connection failed` | Relay не запущен | Запустите `mini-services/relay-backend` |
| `POST /api/keys/upload 500` | Нет JWT_SECRET | Добавьте `JWT_SECRET` в `.env` relay |
| `GET /api/keys/xxx 404` | Пользователь не зарегистрирован | Перелогиньтесь после запуска relay |
| `<button> cannot contain <button>` | Nested buttons | ✅ Уже исправлено |

---

## 📋 Проверка работы

1. Откройте http://localhost:3001/health
   - Должно вернуть: `{"status":"ok"}`

2. Откройте http://localhost:3000 и войдите

3. В консоли должно появиться:
   ```
   [E2EChatIntegration] Pre-key bundle uploaded to relay
   ```

---

## 🛠️ Скрипты для автозапуска

**Windows (PowerShell):**
```powershell
.\start-dev.ps1
# или напрямую:
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

**Linux/Mac:**
```bash
./start-dev.sh
# или напрямую:
bash ./scripts/start-dev.sh
```

> `start-dev.ps1` и `start-dev.sh` в корне — это совместимые wrappers.
> Основные скрипты запуска находятся в `scripts/`.

---

## ⚠️ Важно

`JWT_SECRET` в `mini-services/relay-backend/.env` должен совпадать с `NEXTAUTH_SECRET` в основном `.env`!
