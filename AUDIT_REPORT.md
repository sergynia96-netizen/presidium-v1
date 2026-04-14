# 🔬 PRESIDIUM — Полный аудит состояния проекта

> **Дата:** 14 апреля 2026 г.  
> **Версия:** 0.2.0  
> **Фреймворк:** Next.js 16.2.1 (Turbopack) + React 19.0.0  
> **Статус:** ✅ Build, Typecheck, Relay Health и WS Auth-check проходят  
> **Runtime:** Bun 1.3.4

---

## 1. Executive Summary

PRESIDIUM — мессенджер с End-to-End шифрованием (Signal Protocol: X3DH + Double Ratchet). Архитектура: **Next.js (фронтенд, порт 3000) + Relay Backend (WebSocket signaling, порт 3001) + PostgreSQL + Redis + MinIO**.

### Текущее состояние одним предложением:

**Критичные баги по профилю/контактам/relay-client закрыты, relay backend доступен на порту 3001, E2E WS-auth подтверждён прямой проверкой.**

### Сводная таблица:

| Категория | Статус | Детали |
|-----------|--------|--------|
| Build (`npm run -s build`) | ✅ Проходит | Next.js production build успешен |
| Typecheck (`npm run -s typecheck`) | ✅ Проходит | 0 ошибок TypeScript |
| Relay typecheck (`npm run -s relay:typecheck`) | ✅ Проходит | Relay backend TS без ошибок |
| WebSocket архитектура | ⚠️ Частично | useWebSocket → stub, relay-client активен, relay health = ok |
| E2E криптография | ✅ Готова | X3DH + Double Ratchet + PreKey Bundles |
| Профиль пользователя | ✅ Работает | Phone, Save, Edit — всё есть |
| Поиск контактов | ✅ Работает | Реальный API через contactsApi.add() |
| Медиа файлы | ✅ Улучшено | MediaFallback интегрирован в message-bubble |
| Avatar upload | ✅ Добавлено | `POST /api/upload/avatar` + UI upload в Edit Profile |
| Docker deployment | ⚠️ Готов | Требует актуальной `.env.local`/relay `.env` конфигурации |

---

## 0. Актуализация на 14.04.2026

### Проверено командами

| Проверка | Результат |
|----------|-----------|
| `npm run -s typecheck` | ✅ |
| `npm run -s build` | ✅ |
| `npm run -s relay:typecheck` | ✅ |
| `curl http://localhost:3001/health` | ✅ `status: ok` |
| Direct WS auth-check (`ws://localhost:3001/ws`) | ✅ `type: connected` |

### Что добавлено/закрыто после предыдущей версии отчёта

1. **Шифрование identity private key в IndexedDB**
   - Добавлен `src/lib/crypto/vault.ts` (PBKDF2 + AES-GCM).
   - `store.ts` переведён на encrypted-at-rest хранение (`identity_encrypted`) с миграцией legacy-ключей.
   - `e2e-provider.tsx` добавляет unlock диалог vault-пароля.
2. **MediaFallback интегрирован в chat bubble**
   - `message-bubble.tsx` использует `EncryptedImage`/`EncryptedVideo` для не-blob URL.
3. **Avatar upload реализован end-to-end**
   - Добавлен API route: `POST /api/upload/avatar`.
   - `edit-profile.tsx` подключён к file picker + upload + обновлению `avatar` в store.
4. **Relay connectivity подтверждена**
   - Прямая проверка WS auth возвращает `connected`.
   - `/health` relay отвечает корректно.

### Открытые вопросы (на 14.04.2026)

1. `useWebSocket` остаётся stub-реализацией (архитектурное решение до интеграции manager).
2. `websocket-manager.ts` создан, но ещё не является единой точкой подключения в runtime.
3. Требуется финальный UI smoke-test под авторизованной сессией: login → relay token → connected в браузерной консоли.

---

## 2. История изменений

### Фикс #1: useWebSocket отключён (reconnect loop)

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/hooks/use-websocket.ts` |
| **Проблема** | Два параллельных WS клиента создавали 12+ соединений/минуту |
| **Решение** | Заменён на stub-реализацию (возвращает dummy values) |
| **Строки** | Весь файл (~60 строк вместо 400) |
| **Статус** | ✅ Применён |

**До (400 строк, создавал WS):**
```typescript
export function useWebSocket(options: UseWebSocketOptions = {}) {
  // ... 400 строк кода с new WebSocket(wsBaseUrl)
  // reconnect loop: 5 attempts × 3000ms
}
```

**После (stub, не создаёт WS):**
```typescript
export function useWebSocket(_options: UseWebSocketOptions = {}) {
  return {
    isConnected: false,
    readyState: WebSocket.CLOSED,
    sendMessage: () => false,
    joinChat: (chatId: string) => Boolean(chatId),
    // ... остальные stub methods
  };
}
```

---

### Фикс #2: Format mismatch в relay-client.ts

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/lib/crypto/relay-client.ts` |
| **Строки** | ~385-398 (метод `sendEncryptedMessage`) |
| **Проблема** | Клиент отправлял `to` на верхнем уровне, сервер искал внутри `payload` |
| **Статус** | ✅ Применён |

**До:**
```typescript
this.ws!.send(JSON.stringify({
  type: 'relay.envelope',
  to: envelope.recipientId,        // ← Сервер НЕ ВИДЕЛ это!
  payload: envelope,                // ← Сервер искал to ЗДЕСЬ
}));
```

**После:**
```typescript
this.ws!.send(JSON.stringify({
  type: 'relay.envelope',
  payload: {
    type: 'message',
    to: envelope.recipientId,       // ← Теперь внутри payload ✓
    content: JSON.stringify(envelope),
    timestamp: envelope.timestamp,
  },
}));
```

---

### Фикс #3: Env variable mismatch

| Параметр | Значение |
|----------|----------|
| **Файлы** | `src/lib/crypto/relay-client.ts` (~строка 100), `src/lib/relay-base-url.ts` |
| **Проблема** | `process.env.RELAY_HTTP_URL` недоступен на клиенте (нет префикса `NEXT_PUBLIC_`) |
| **Статус** | ✅ Применён |

**relay-client.ts — До:**
```typescript
const DEFAULT_CONFIG: RelayConfig = {
  httpBaseUrl: getRelayHttpBaseUrl(),  // → RELAY_HTTP_URL (undefined на клиенте!)
  wsBaseUrl: (process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://127.0.0.1:3001'),
};
```

**relay-client.ts — После:**
```typescript
const DEFAULT_CONFIG: RelayConfig = {
  httpBaseUrl: process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001',
  wsBaseUrl: process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://127.0.0.1:3001/ws',
};
```

**relay-base-url.ts — До:**
```typescript
export function getRelayHttpBaseUrl(): string {
  return (process.env.RELAY_HTTP_URL || process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
}
```

**relay-base-url.ts — После:**
```typescript
export function getRelayHttpBaseUrl(): string {
  // Client-side: must use NEXT_PUBLIC_ prefix
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  }
  // Server-side: can use non-NEXT_PUBLIC_ as fallback
  return (process.env.RELAY_HTTP_URL || process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
}
```

---

### Фикс #4: relay-auth.ts — добавлены функции управления токеном

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/lib/relay-auth.ts` |
| **Новые функции** | `setRelayAccessToken()`, `clearRelayAccessToken()` |
| **Статус** | ✅ Применён |

**Добавлено:**
```typescript
export function setRelayAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('presidium_access_token', token);
}

export function clearRelayAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('presidium_access_token');
}
```

---

### Фикс #5: MediaFallback компонент создан

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/components/messenger/media-fallback.tsx` |
| **Строк** | 193 |
| **Экспорты** | `MediaFallback`, `EncryptedImage`, `EncryptedVideo` |
| **Статус** | ✅ Создан, ⚠️ не интегрирован |

---

### Фикс #6: WebSocket Manager (singleton) создан

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/lib/websocket-manager.ts` |
| **Строк** | ~280 |
| **Экспорты** | `getWebSocketManager()`, `resetWebSocketManager()`, `WebSocketManager` class |
| **Статус** | ✅ Создан, ⏳ не интегрирован |

---

### Фикс #7: RelayE2EClient token flow

| Параметр | Значение |
|----------|----------|
| **Файл** | `src/lib/crypto/relay-client.ts` |
| **Метод** | `ensureRelayToken()` (строки ~148-176) |
| **Изменение** | Автоматический запрос токена через `/api/relay/token` если не найден в localStorage |
| **Статус** | ✅ Применён |

**Текущая реализация:**
```typescript
private async ensureRelayToken(): Promise<string> {
  const existing = getRelayAccessToken();
  if (existing) return existing;  // ← Сначала проверяем localStorage

  if (typeof window === 'undefined') {
    throw new Error('Relay token is missing');
  }

  // ← Если нет — запрашиваем через API
  const response = await fetch('/api/relay/token', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get relay token (${response.status})`);
  }

  const data = (await response.json().catch(() => ({}))) as { token?: string };
  const token = typeof data.token === 'string' ? data.token : '';
  if (!token) {
    throw new Error('Relay token response is invalid');
  }

  setRelayAccessToken(token);  // ← Сохраняем в localStorage
  return token;
}
```

---

## 3. Текущее состояние системы

### Что работает ✅

| Функция | Файлы | Статус |
|---------|-------|--------|
| **Next.js приложение** | `src/app/page.tsx` и все маршруты | ✅ Запускается, билдится |
| **TypeScript** | Вся кодовая база | ✅ 0 ошибок typecheck |
| **E2E криптография** | `src/lib/crypto/*` (17 файлов) | ✅ X3DH + Double Ratchet готовы |
| **PreKey Bundle** | `relay-client.ts` upload/fetch | ✅ Методы работают |
| **Профиль — Phone** | `edit-profile.tsx:232` | ✅ Поле есть |
| **Профиль — Save** | `edit-profile.tsx:60-110` | ✅ PATCH /api/users/[id] |
| **Профиль — Toast** | `edit-profile.tsx:108-116` | ✅ "Profile updated" |
| **Контакты — API** | `new-contact.tsx:60-130` | ✅ contactsApi.add() |
| **Контакты — Chat** | `new-contact.tsx:120-130` | ✅ chatsApi.create() |
| **API: /api/relay/token** | `src/app/api/relay/token/route.ts` | ✅ JWT 2 часа |
| **API: /api/users/[id]** | `src/app/api/users/[id]/route.ts` | ✅ GET + PATCH + DELETE |
| **API: /api/search** | `src/app/api/search/route.ts` | ✅ Глобальный поиск |
| **API: /api/contacts** | `src/app/api/contacts/route.ts` | ✅ GET + POST |
| **API: /api/chats** | `src/app/api/chats/route.ts` | ✅ GET + POST |
| **Docker Compose** | `docker-compose.yml` | ✅ 5 сервисов |
| **Health endpoint** | `relay-backend/src/index.ts:/health` | ✅ Работает |

### Что НЕ работает ❌

| Функция | Причина | Файл(ы) | Приоритет |
|---------|---------|---------|-----------|
| **RelayE2EClient WS подключение** | Relay backend не запущен на порту 3001 | `relay-client.ts`, `e2e-provider.tsx` | 🔴 Критично |
| **MediaFallback не используется** | Компонент создан, но не импортирован | `media-fallback.tsx`, `message-bubble.tsx` | 🟡 Средний |
| **WebSocket Manager не интегрирован** | Создан, но relay-client использует свой WS | `websocket-manager.ts`, `relay-client.ts` | 🟢 Низкий |

### Частично работает ⚠️

| Функция | Статус | Детали |
|---------|--------|--------|
| **useWebSocket** | Stub | Намеренно отключён для предотвращения дублирования |
| **CoTURN/WebRTC** | Закомментирован | В docker-compose.yml закоментирован |
| **OTP preview** | Dev mode | `DEV_OTP_PREVIEW="true"` — OTP на экране, не email |
| **Приватные ключи** | В открытом виде | IndexedDB хранит private keys без шифрования |

---

## 4. Проблемы: Критические

### 🔴 Проблема 1: RelayE2EClient не подключается к WebSocket

**Симптом:**
```
[RelayE2EClient] Reconnecting in 1000ms (attempt 1)
[RelayE2EClient] Reconnecting in 2000ms (attempt 2)
[RelayE2EClient] Reconnecting in 4000ms (attempt 3)
...
```

**Диагностика проведена:**

| Проверка | Файл | Строки | Результат |
|----------|------|--------|-----------|
| Token flow | `relay-client.ts` | 148-176 | ✅ `ensureRelayToken()` работает: проверяет localStorage → если нет → POST /api/relay/token → сохраняет |
| Auth message format | `relay-client.ts` | 203 | ✅ `{ type: 'auth', payload: { token } }` — правильный формат |
| Token save | `relay-auth.ts` | 10-12 | ✅ `setRelayAccessToken()` → `localStorage.setItem('presidium_access_token', token)` |
| Token clear on error | `relay-client.ts` | 218-220 | ✅ `clearRelayAccessToken()` при 4001/4002 |
| WS URL resolution | `relay-client.ts` | 106-124 | ✅ `resolveRelayWebSocketUrl()` корректно добавляет `/ws` |
| Reconnect logic | `relay-client.ts` | 272-286 | ✅ Exponential backoff, max 10 attempts |
| E2EProvider вызов | `e2e-provider.tsx` | 100 | ✅ `relayClient.connect()` вызывается при auth ready |

**Корневая причина:** Relay backend сервер НЕ ЗАПУЩЕН на порту 3001.

**Решение (пошагово):**

```bash
# 1. Проверить что relay-backend доступен
cd mini-services/relay-backend

# 2. Создать .env файл
cp .env.example .env
# В .env указать:
# PORT=3001
# JWT_SECRET=тот-же-что-в-главном-.env.local
# CORS_ORIGINS=http://localhost:3000

# 3. Установить зависимости
bun install

# 4. Запустить
bun run dev
```

**Или через Docker:**
```bash
docker compose up -d relay
docker compose logs -f relay
```

**Ожидаемый результат после запуска:**
```
[RelayE2EClient] Token: present (234 chars)
[RelayE2EClient] Connected to ws://localhost:3001/ws
[RelayE2EClient] Auth response: {"type":"connected","payload":{"accountId":"...","onlineCount":1}}
```

---

### 🔴 Проблема 2: Приватные ключи X3DH хранятся в открытом виде

**Файлы:**
- `src/lib/crypto/store.ts` — IndexedDB storage
- `src/lib/crypto/identity.ts` — генерация ключей

**Текущее состояние:**
```typescript
// store.ts — ключи сохраняются БЕЗ шифрования
export async function saveIdentityKeys(keys: SerializedIdentityKeyPair): Promise<void> {
  const db = await openDB();
  await db.put('identity', 'keys', keys);  // ← Открытый текст!
}
```

**Риск:** XSS атака → кража `privateKey` → расшифровка всех сообщений

**Решение (будущее):**
```typescript
// Использовать Web Crypto API для шифрования перед сохранением
async function encryptPrivateKey(privateKey: Uint8Array, password: string): Promise<EncryptedKey> {
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    privateKey
  );
  return { encrypted: new Uint8Array(encrypted), iv };
}
```

**Приоритет:** 🟡 Средний (требует значительной переработки crypto модуля)

---

## 5. Проблемы: Средние

### 🟡 Проблема 3: MediaFallback не интегрирован

| Параметр | Значение |
|----------|----------|
| **Компонент** | `src/components/messenger/media-fallback.tsx` |
| **Строк** | 193 |
| **Импортов в коде** | **0** (нигде не используется) |
| **Целевой файл** | `src/components/messenger/chat-view/message-bubble.tsx` |

**Где нужно интегрировать:** `message-bubble.tsx` строки ~408-456 (рендеринг изображений, видео, аудио, документов)

**Текущий код message-bubble.tsx (строка ~408):**
```typescript
<a href={displayMediaUrl} target="_blank" rel="noreferrer" className="mb-2 block">
  <img
    src={displayMediaUrl}
    alt={message.mediaName || 'Attachment'}
    className="max-w-xs rounded-lg cursor-pointer"
    onError={() => {/* пусто — будет broken image */}}
  />
</a>
```

**Что должно быть:**
```typescript
import { EncryptedImage, EncryptedVideo } from '@/components/messenger/media-fallback';

// Вместо <img src={displayMediaUrl} ... />:
<EncryptedImage
  fileId={message.mediaId || message.id}
  alt={message.mediaName || 'Attachment'}
  className="max-w-xs rounded-lg cursor-pointer"
/>
```

**Требуемое изменение:**
1. Извлечь `fileId` из `message.mediaUrl` (убрать `/uploads/` и `.enc`)
2. Заменить `<img>`, `<video>`, `<audio>` на обёртки с MediaFallback
3. Добавить обработку 404 → показ "🔒 Файл недоступен"

---

### 🟡 Проблема 4: Нет API endpoint для загрузки аватара

| Параметр | Значение |
|----------|----------|
| **UI** | `edit-profile.tsx:152-169` — camera overlay кнопка есть |
| **API** | Нет endpoint'а для POST /api/users/[id]/avatar |
| **Хранение** | MinIO S3 должен хранить файлы |

**Текущий код (строка ~152):**
```tsx
<button type="button" className="relative group">
  <Avatar className="size-28">
    <AvatarFallback>{initials}</AvatarFallback>
  </Avatar>
  <div className="absolute inset-0 ...">
    <Camera className="size-5 text-foreground" />
  </div>
</button>
```

**Кнопка не имеет `onClick` handler** — просто визуальный элемент.

**Требуемый endpoint:**
```
POST /api/upload/avatar
Content-Type: multipart/form-data
Body: { file: File }
Response: { url: string }
```

---

## 6. Проблемы: Будущие улучшения

### 🟢 Проблема 5: Объединение WebSocket клиентов

| Параметр | Значение |
|----------|----------|
| **Текущее состояние** | `websocket-manager.ts` создан (~280 строк), но не используется |
| **Цель** | Единый WS singleton для всего приложения |
| **Что мигрировать** | `relay-client.ts` → `getWebSocketManager()` |

**Текущая архитектура:**
```
RelayE2EClient → свой WebSocket (единственный активный)
useWebSocket   → stub (отключён)
```

**Целевая архитектура:**
```
WebSocketManager (singleton)
  ├── RelayE2EClient → через manager.send() / manager.onMessage()
  └── UI компоненты  → через manager.onStateChange()
```

**Шаги миграции:**
1. Заменить `this.ws = new WebSocket(wsUrl)` в relay-client.ts на `this.manager = getWebSocketManager()`
2. Заменить `this.ws.send()` на `this.manager.send()`
3. Заменить `this.ws.onmessage` на `this.manager.onMessage(handler)`
4. Удалить reconnect logic из relay-client.ts (manager управляет этим)

---

### 🟢 Проблема 6: CoTURN / WebRTC NAT traversal

| Параметр | Значение |
|----------|----------|
| **Файл** | `docker-compose.yml` строки ~140-160 |
| **Статус** | Закомментирован |
| **Причина** | Требует `network_mode: "host"` |

**Текущий код:**
```yaml
# coturn:
#   image: coturn/coturn:latest
#   container_name: presidium-coturn
#   restart: unless-stopped
#   network_mode: "host"
#   ...
```

**Следствие:** WebRTC звонки работают только в LAN (нет NAT traversal).

**Решение:**
1. Раскомментировать секцию CoTURN
2. Настроить TURN credentials
3. Добавить ICE server config в `src/lib/webrtc.ts`

---

### 🟢 Проблема 7: OTP preview в dev режиме

| Параметр | Значение |
|----------|----------|
| **Переменная** | `DEV_OTP_PREVIEW="true"` в `.env.local` |
| **Релей** | `RELAY_DEV_OTP_PREVIEW=false` в relay `.env` |
| **Поведение** | OTP код показывается в API ответе |

**Это нормально для разработки.** Для production:
```bash
# .env.local
DEV_OTP_PREVIEW="false"

# mini-services/relay-backend/.env
RELAY_DEV_OTP_PREVIEW=false
```

---

## 7. Checklist

### Build & Typecheck
- [x] `bun run typecheck` — 0 ошибок
- [x] `bun run build` — Compiled за 21.5s
- [x] Все 44 страницы сгенерированы
- [x] TypeScript компиляция успешна

### WebSocket & Relay
- [x] useWebSocket → stub (не создаёт WS)
- [x] relay-client.ts → format mismatch исправлен
- [x] relay-client.ts → env variables исправлены
- [x] relay-client.ts → token flow работает (ensureRelayToken)
- [x] relay-auth.ts → setRelayAccessToken / clearRelayAccessToken добавлены
- [ ] **Relay backend запущен на порту 3001** ← ТРЕБУЕТСЯ
- [ ] WS подключение успешно: `[RelayE2EClient] Connected` ← ЗАВИСИТ ОТ RELAY

### E2E Crypto
- [x] X3DH key exchange реализован
- [x] Double Ratchet шифрование
- [x] PreKey Bundle upload/fetch
- [x] Key rotation (signed prekey, identity keys)
- [x] Safety numbers / fingerprint verification
- [ ] Приватные ключи шифруются в IndexedDB ← БУДУЩЕЕ

### Profile & Contacts
- [x] Profile Edit — поле Phone есть
- [x] Profile Save — рабочая кнопка с API
- [x] Profile Toast — уведомления об успехе/ошибке
- [x] Contact Search — реальный API (contactsApi.add)
- [x] Private chat создание — chatsApi.create
- [ ] Avatar upload — не реализован

### Media
- [x] MediaFallback компонент создан
- [ ] MediaFallback интегрирован в message-bubble ← СЛЕДУЮЩИЙ ШАГ
- [ ] Encrypted file upload/download ← ЧАСТИЧНО ГОТОВО

### Docker
- [x] docker-compose.yml — 5 сервисов
- [x] Health checks настроены
- [x] Volumes настроены
- [ ] CoTURN раскомментирован ← БУДУЩЕЕ

---

## 8. Рекомендации

### Что сделать сейчас (Приоритет 1):

1. **Запустить Relay Backend:**
   ```bash
   cd mini-services/relay-backend && bun install && bun run dev
   ```
   Или: `docker compose up -d relay`

2. **Проверить WS подключение:**
   Откройте консоль браузера → ищите:
   ```
   [RelayE2EClient] Token: present (XXX chars)
   [RelayE2EClient] Connected to ws://localhost:3001/ws
   ```

3. **Если токен не получается:**
   ```javascript
   // В консоли браузера:
   localStorage.getItem('presidium_access_token')
   // Должно вернуть JWT строку
   
   // Если null — проверить:
   fetch('/api/relay/token', { method: 'POST', credentials: 'include' })
     .then(r => r.json()).then(console.log)
   ```

### Что сделать в ближайшее время (Приоритет 2):

4. **Интегрировать MediaFallback** в `message-bubble.tsx`
5. **Добавить Avatar Upload** — endpoint + UI handler
6. **Протестировать E2E обмен сообщениями** между двумя пользователями

### Что запланировать (Приоритет 3):

7. **Миграция на websocket-manager.ts** singleton
8. **Шифрование приватных ключей** в IndexedDB
9. **Раскомментировать CoTURN** для WebRTC звонков
10. **Production .env** — установить `DEV_OTP_PREVIEW=false`

---

## 9. Зависимости между модулями

```
E2EProvider (src/components/providers/e2e-provider.tsx)
  ├── sessionManager (src/lib/crypto/session-manager.ts)
  │     ├── getIdentityKeys() → store.ts (IndexedDB)
  │     ├── getPreKeys() → store.ts (IndexedDB)
  │     └── restoreSessions() → store.ts (IndexedDB)
  │
  └── relayClient (src/lib/crypto/relay-client.ts)
        ├── getRelayAccessToken() → relay-auth.ts → localStorage
        ├── ensureRelayToken() → POST /api/relay/token → setRelayAccessToken()
        ├── WebSocket(wsUrl) → ws://localhost:3001/ws
        ├── fetchPreKeyBundle(userId) → GET /api/keys/{userId}
        ├── uploadPreKeyBundle(bundle) → POST /api/keys/upload
        └── sendEncryptedMessage(envelope) → WS: relay.envelope

Relay Backend (mini-services/relay-backend/src/index.ts)
  ├── HTTP API: /api/auth/*, /api/keys/*, /api/contacts, /api/groups, /api/channels
  ├── WebSocket: /ws → session-manager → message-router
  ├── PostgreSQL: prisma/schema.prisma
  ├── Redis (optional): distributed-state.ts → presence + queue
  └── Rate Limiting + Anti-Spam

Next.js App (src/app/)
  ├── API Routes: /api/relay/token, /api/users/*, /api/contacts, /api/search, /api/chats
  ├── Pages: page.tsx → E2EProvider → UI components
  └── Middleware: proxy, auth, rate limiting
```

---

## 10. Карта файлов проекта

```
PRESIDIUM/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Главная страница (роутинг views)
│   │   └── api/
│   │       ├── relay/token/route.ts           # JWT для relay auth ✅
│   │       ├── users/[id]/route.ts            # Profile CRUD ✅
│   │       ├── search/route.ts                # Глобальный поиск ✅
│   │       ├── contacts/route.ts              # Контакты ✅
│   │       └── chats/route.ts                 # Чаты ✅
│   │
│   ├── lib/
│   │   ├── crypto/                            # E2E криптография
│   │   │   ├── relay-client.ts                # WS + HTTP relay клиент ✅ исправлен
│   │   │   ├── encrypt.ts                     # X3DH + Double Ratchet ✅
│   │   │   ├── identity.ts                    # Ed25519 identity keys ✅
│   │   │   ├── x3dh.ts                        # X3DH key exchange ✅
│   │   │   ├── ratchet.ts                     # Double Ratchet ✅
│   │   │   ├── prekeys.ts                     # PreKey Bundles ✅
│   │   │   ├── store.ts                       # IndexedDB storage ⚠️ без шифрования
│   │   │   └── ...                            # (17 файлов всего)
│   │   │
│   │   ├── relay-auth.ts                      # Token management ✅ исправлен
│   │   ├── relay-base-url.ts                  # Relay URL helpers ✅ исправлен
│   │   └── websocket-manager.ts               # Unified WS manager ✅ создан
│   │
│   ├── hooks/
│   │   └── use-websocket.ts                   # WS hook → STUB ✅ отключён
│   │
│   ├── components/
│   │   ├── providers/
│   │   │   └── e2e-provider.tsx               # E2E initialization ✅
│   │   │
│   │   ├── messenger/
│   │   │   ├── profile/
│   │   │   │   ├── profile-screen.tsx         # Профиль ✅
│   │   │   │   ├── edit-profile.tsx            # Редактирование ✅
│   │   │   │   └── contacts-list.tsx           # Список контактов ✅
│   │   │   │
│   │   │   ├── chat-list/
│   │   │   │   └── new-contact.tsx             # Добавление контакта ✅
│   │   │   │
│   │   │   ├── chat-view/
│   │   │   │   ├── message-bubble.tsx          # Сообщения ⚠️ нет MediaFallback
│   │   │   │   └── chat-view.tsx               # Основной чат ✅
│   │   │   │
│   │   │   ├── e2e/
│   │   │   │   ├── encryption-status.tsx       # Бейджи статуса ✅
│   │   │   │   └── safety-number-verification.tsx # Верификация ✅
│   │   │   │
│   │   │   └── media-fallback.tsx              # 404 handler ✅ создан
│   │
│   └── store/
│       ├── use-app-store.ts                    # Основной Zustand store ✅
│       └── use-api-store.ts                    # API caching ✅
│
├── mini-services/
│   └── relay-backend/
│       ├── src/
│       │   ├── index.ts                        # Entry point (HTTP + WS) ✅
│       │   ├── auth/auth-service.ts            # JWT, OTP, register ✅
│       │   ├── signaling/session-manager.ts    # WS sessions ✅
│       │   ├── signaling/message-router.ts     # Message routing ✅
│       │   ├── presence/presence-service.ts    # Online/offline ✅
│       │   └── signaling/distributed-state.ts  # Redis presence + queue ✅
│       │
│       ├── prisma/schema.prisma                # Relay DB schema ✅
│       └── Dockerfile                          # Relay container ✅
│
├── prisma/schema.prisma                        # Main DB schema ✅
├── docker-compose.yml                          # 5 сервисов ✅
├── next.config.ts                              # Security headers, CORS ✅
└── package.json                                # Dependencies ✅
```

---

> **Итог:** Проект в хорошем состоянии. Все критичные баги исправлены, build проходит. **Ключевой блокирующий фактор** — relay backend должен быть запущен на порту 3001 для работы WebSocket и E2E шифрования. Без relay сервера `RelayE2EClient` будет бесконечно переподключаться — это ожидаемое поведение, не баг.
