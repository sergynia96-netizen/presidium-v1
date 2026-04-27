# PRESIDIUM Messenger — Отчет об ошибках и решениях

## 📋 Общая информация

Дата анализа: 2026-04-16
Репозиторий: https://github.com/sergynia96-netizen/presidium-v1

---

## 🔴 Проблема 1: Nested Buttons (HTML Validation Error)

### Описание
В компоненте `EncryptionStatusBadge` используется `<button>` внутри другого `<button>` элемента в `chat-view.tsx`. Это вызывает:
- Hydration ошибку в React
- Невалидный HTML
- Потенциальные проблемы с accessibility

### Локация
- **chat-view.tsx**: строка ~2482 — внешняя кнопка
- **encryption-status.tsx**: строка 79 — внутренняя кнопка

### Исправление ✅

Файл: `src/components/messenger/e2e/encryption-status.tsx`

```tsx
// БЫЛО:
<button onClick={onClick} ...>
  {config.icon}
  <span>{config.label}</span>
</button>

// СТАЛО:
<span 
  onClick={onClick}
  role={onClick ? 'button' : undefined}
  tabIndex={onClick ? 0 : undefined}
  onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
  className={...}
>
  {config.icon}
  <span>{config.label}</span>
</span>
```

**Уже исправлено** в текущей сессии.

---

## 🔴 Проблема 2: Relay Backend не запущен

### Ошибки в консоли
```
WebSocket connection to 'ws:<URL>/ws' failed
POST http://localhost:3001/api/keys/upload 500 (Internal Server Error)
GET http://localhost:3001/api/keys/{userId} 404 (Not Found)
```

### Причина
Relay backend — это отдельный сервер, который должен быть запущен на порту 3001. Без него:
- Не работает E2E шифрование
- Не загружаются pre-key bundles
- Не работает WebSocket сигналинг

### Решение ✅

#### Шаг 1: Настройка переменных окружения

Создайте файл `mini-services/relay-backend/.env`:

```env
PORT=3001
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JWT_SECRET=your-secret-key-here
RELAY_DATABASE_URL=file:./presidium.db
RELAY_DEV_OTP_PREVIEW=true
```

**Важно**: `JWT_SECRET` должен совпадать с `NEXTAUTH_SECRET` из основного приложения!

#### Шаг 2: Установка зависимостей

```bash
cd mini-services/relay-backend
bun install
```

#### Шаг 3: Инициализация базы данных

```bash
cd mini-services/relay-backend
bun run db:push
```

#### Шаг 4: Запуск relay сервера

```bash
# В отдельном терминале
cd mini-services/relay-backend
bun run dev
```

Или из корня проекта:
```bash
npm run relay:dev
```

---

## 🔴 Проблема 3: Pre-key Bundle не найден (404)

### Ошибка
```
GET http://localhost:3001/api/keys/cmo0hloa0000usw24v1lwgx0p 404 (Not Found)
```

### Причина
Пользователь `cmo0hloa0000usw24v1lwgx0p` не зарегистрирован в relay backend или его ключи не были загружены.

### Решение ✅

После запуска relay backend:

1. **Перелогиньтесь** в приложение — это вызовет повторную инициализацию E2E
2. **Проверьте логи relay backend** — должно быть сообщение:
   ```
   [Auth] Auto-provisioned relay account for NextAuth user: {userId}
   ```

3. **Если проблема persists** — возможно нужно очистить localStorage и перезагрузить страницу:
   ```javascript
   localStorage.removeItem('e2e-identity');
   localStorage.removeItem('e2e-sessions');
   ```

---

## 🔴 Проблема 4: 500 Internal Server Error при upload

### Ошибка
```
POST http://localhost:3001/api/keys/upload 500 (Internal Server Error)
```

### Причина
Скорее всего, одна из следующих:
1. Не установлен `JWT_SECRET`
2. Неверный формат JWT токена
3. Проблема с базой данных (таблица не создана)

### Решение ✅

1. Проверьте, что `JWT_SECRET` установлен и совпадает с `NEXTAUTH_SECRET`
2. Убедитесь, что выполнили `bun run db:push`
3. Проверьте логи relay backend для детальной ошибки

---

## 🚀 Полный порядок запуска

### Терминал 1: Relay Backend
```bash
cd mini-services/relay-backend
bun install          # если еще не установлено
bun run db:push      # инициализация БД
bun run dev          # запуск сервера
```

### Терминал 2: Next.js App
```bash
# Из корня проекта
bun install          # если еще не установлено
bun run db:push      # инициализация основной БД
bun run dev          # запуск приложения
```

### Проверка работы
1. Откройте http://localhost:3000
2. Войдите в систему
3. Откройте DevTools → Console
4. Должно появиться:
   ```
   [E2EChatIntegration] Pre-key bundle uploaded to relay
   [E2E SessionManager] Session created: {...}
   ```

---

## 📁 Измененные файлы

1. `src/components/messenger/e2e/encryption-status.tsx` — исправлен nested button
2. `scripts/start-dev.ps1` — основной Windows-скрипт запуска
3. `scripts/start-dev.sh` — основной Linux/Mac-скрипт запуска
4. `start-dev.ps1` — wrapper для обратной совместимости
5. `start-dev.sh` — wrapper для обратной совместимости

---

## 📝 Дополнительные рекомендации

### Для разработки (Windows)
Если используете PowerShell, можно запустить оба сервера одновременно:

```powershell
# Из корня проекта (wrapper):
.\start-dev.ps1

# Или напрямую каноничный скрипт:
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

`start-dev.ps1` в корне оставлен специально для удобства и не требует ручного переноса.

### Проверка WebSocket подключения
В DevTools Console выполните:
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
ws.onopen = () => console.log('WS Connected!');
ws.onerror = (e) => console.error('WS Error:', e);
```

---

## ❓ FAQ

**Q: Почему появляется 404 для ключей?**
A: Пользователь еще не загрузил свои pre-keys в relay. Это происходит автоматически при первой инициализации E2E после успешной авторизации.

**Q: Можно ли отключить E2E для тестирования?**
A: В текущей реализации E2E инициализируется автоматически. Можно временно закомментировать вызов `initE2E()` в `chat-view.tsx`.

**Q: Как проверить, что relay работает?**
A: Откройте http://localhost:3001/health — должен вернуть `{"status":"ok"}`.
