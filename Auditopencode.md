# 🔍 ПОЛНЫЙ АУДИТ ПРОЕКТА PRESIDIUM

**Дата:** 16 апреля 2026  
**Версия:** 0.2.0  
**Тип:** Комплексный аудит для AI-агентов

---

## 📋 СОДЕРЖАНИЕ

1. [Обзор проекта](#1-обзор-проекта)
2. [Технический стек](#2-технический-стек)
3. [API Routes - Полный аудит](#3-api-routes---полный-аудит)
4. [Lib файлы - Полный аудит](#4-lib-файлы---полный-аудит)
5. [Hooks - Полный аудит](#5-hooks---полный-аудит)
6. [Компоненты UI](#6-компоненты-ui)
7. [База данных](#7-база-данных)
8. [Критичные проблемы](#8-критичные-проблемы)
9. [Готовность к MVP](#9-готовность-к-mvp)
10. [Рекомендации для AI](#10-рекомендации-для-ai)

---

## 1. ОБЗОР ПРОЕКТА

### Описание
PRESIDIUM — это приватный мессенджер с End-to-End шифрованием (Signal Protocol), встроенным AI ассистентом (GLM-4), и P2P возможностями.

### Архитектура
```
┌─────────────────────────────────────────────────────────────┐
│                     PRESIDIUM Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌───────────┐ │
│   │   Frontend  │──────│   Relay     │──────│  Database │ │
│   │   :3000     │◄────►│   :3001     │      │  (Postgre)│ │
│   └──────┬──────┘      └──────┬──────┘      └───────────┘ │
│          │                     │                           │
│          │                     │      ┌───────────┐       │
│          │                     └─────►│   Redis   │       │
│          │                           └───────────┘       │
│          │      ┌───────────┐                              │
│          └─────►│   MinIO   │ (S3 storage)               │
│                 └───────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Статус сборки (проверено 16.04.2026)
| Команда | Результат |
|---------|-----------|
| `npm run typecheck` | ✅ Проходит (0 ошибок) |
| `npm run build` | ✅ Проходит |
| `npm run lint` | ⚠️ 16 warnings (без errors) |
| `npm run relay:typecheck` | ✅ Проходит |

---

## 2. ТЕХНИЧЕСКИЙ СТЕК

### Фронтенд
- **Framework:** Next.js 16.1.1 (App Router)
- **React:** 19.0.0
- **UI:** Tailwind CSS 4 + shadcn/ui (Radix UI)
- **State:** Zustand 5.x
- **Language:** TypeScript 5

### Бэкенд
- **Runtime:** Node.js 22 LTS / Bun 1.3.4
- **Database:** SQLite (dev) / PostgreSQL 15 (prod)
- **ORM:** Prisma 6.11.1
- **Auth:** NextAuth.js 4.24.11
- **Relay:** WebSocket server (port 3001)

### Инфраструктура
- **Container:** Docker + Docker Compose
- **Storage:** MinIO (S3-compatible)
- **Cache:** Redis 7
- **AI:** GLM-4 (Zhipu AI)

---

## 3. API ROUTES - ПОЛНЫЙ АУДИТ

### Статистика
| Категория | Количество |
|-----------|------------|
| Всего API routes | 60 |
| Работающих | 57 |
| Заглушек (stub) | 2 |
| Прокси | 5 |

### 3.1 Authentication Routes (6 endpoints)

| Endpoint | Метод | Статус | Описание |
|----------|-------|--------|----------|
| `/api/auth/register` | POST | ✅ Работает | Регистрация пользователя |
| `/api/auth/forgot-password` | POST | ✅ Работает | Запрос сброса пароля |
| `/api/auth/send-code` | POST | ✅ Работает | Отправка OTP кода |
| `/api/auth/reset-password` | POST | ✅ Работает | Сброс пароля по токену |
| `/api/auth/verify-code` | POST | ✅ Работает | Верификация email |
| `/api/auth/[...nextauth]` | GET/POST | ✅ Работает | NextAuth handler |

**Безопасность:**
- Rate limiting (IP + email based)
- Generic error messages (защита от enumeration)
- Password hashing (bcrypt)
- Token expiration

### 3.2 User Routes (4 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/users` | GET | ✅ Работает |
| `/api/users/[id]` | GET/PATCH/DELETE | ✅ Работает |
| `/api/users/[id]/preferences` | GET/PATCH | ✅ Работает |
| `/api/users/[id]/2fa` | GET/POST | ✅ Работает |

**Функции:**
- Пагинация и поиск
- Обновление профиля (имя, username, email, bio, phone, birthday, avatar)
- Настройки пользователя
- 2FA (TOTP, QR коды)

### 3.3 Contact Routes (4 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/contacts` | GET/POST | ✅ Работает |
| `/api/contacts/[id]` | PATCH/DELETE | ✅ Работает |
| `/api/contacts/invite` | POST | ⚠️ Заглушка (не отправляет) |
| `/api/contacts/sync` | POST | ✅ Работает |

### 3.4 Chat Routes (4 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/chats` | GET/POST | ✅ Работает |
| `/api/chats/[id]/draft` | GET/POST | ✅ Работает |
| `/api/chats/[id]/notifications` | PATCH | ✅ Работает |
| `/api/chats/archive` | POST | ✅ Работает |

### 3.5 Message Routes (3 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/messages` | GET/POST | ✅ Работает |
| `/api/messages/[id]` | GET/PATCH/DELETE | ✅ Работает |
| `/api/messages/mark-read` | POST | ✅ Работает |

### 3.6 Stories Routes (6 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/stories` | POST | ✅ Работает |
| `/api/stories/feed` | GET | ✅ Работает |
| `/api/stories/by-source/[type]/[id]` | GET | ✅ Работает |
| `/api/stories/by-id/[id]` | DELETE | ✅ Работает |
| `/api/stories/by-id/[id]/view` | POST | ✅ Работает |
| `/api/stories/by-id/[id]/reply` | POST | ✅ Работает |

### 3.7 Feed Routes (3 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/feed/posts` | GET/POST | ✅ Работает |
| `/api/feed/posts/[id]/comments` | GET/POST | ✅ Работает |
| `/api/feed/posts/[id]/reactions` | POST | ✅ Работает |

### 3.8 AI Routes (6 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/ai-chat` | GET/POST/DELETE | ✅ Работает |
| `/api/ai-in-chat` | POST/DELETE | ✅ Работает |
| `/api/openclaw/moderate` | POST | ✅ Работает |
| `/api/openclaw/recommend` | POST | ✅ Работает |
| `/api/openclaw/profile` | POST | ✅ Работает |
| `/api/openclaw/chat` | POST/DELETE | ✅ Работает |

### 3.9 Upload Routes (2 endpoints)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/upload` | POST | ✅ Работает |
| `/api/upload/avatar` | POST | ✅ Работает |

### 3.10 Utility Routes (остальные)

| Endpoint | Метод | Статус |
|----------|-------|--------|
| `/api/relay/token` | POST | ✅ Работает |
| `/api/search` | GET | ✅ Работает |
| `/api/flags` | GET | ✅ Работает |
| `/api/keys` | GET/POST | ✅ Работает |
| `/api/keys/[keyId]` | DELETE | ✅ Работает |
| `/api/bots` | GET/POST | ✅ Работает |
| `/api/bots/[botId]` | GET/PATCH/DELETE | ✅ Работает |
| `/api/bots/[botId]/message` | POST | ✅ Работает |
| `/api/sessions` | GET/DELETE | ✅ Работает |
| `/api/push/subscribe` | POST | ✅ Работает |
| `/api/push/unsubscribe` | POST | ✅ Работает |
| `/api/gifs/search` | GET | ✅ Работает |
| `/api/link-preview` | POST | ✅ Работает |
| `/api/devices/link` | POST/DELETE | ✅ Работает |
| `/api/books/*` | GET/POST | ✅ Работает (прокси) |
| `/api/proxy/[...path]` | ALL | ✅ Работает |
| `/api/ws` | GET | ⚠️ Заглушка (426) |

### 3.11 Security Issues

| Issue | Severity | Routes |
|-------|----------|--------|
| Нет аутентификации на GIF search | Medium | `/api/gifs/search` |
| Нет аутентификации на feature flags | Low | `/api/flags` |
| Proxy позволяет произвольные вызовы | Medium | `/api/proxy/*` |
| Link preview fetching | Medium | `/api/link-preview` (mitigated) |
| Invite contacts stub | Low | `/api/contacts/invite` |
| WebSocket deprecated | Low | `/api/ws` |

---

## 4. LIB ФАЙЛЫ - ПОЛНЫЙ АУДИТ

### Статистика
| Категория | Количество |
|-----------|------------|
| Основные lib | 52 файла |
| Криптография | 19 файлов |
| Синхронизация | 3 файла |
| **Итого** | **74 файла** |

### 4.1 Инфраструктура

| Файл | Назначение | Статус |
|------|------------|--------|
| `db.ts` | Prisma Client | ✅ Готов |
| `utils.ts` | Утилиты (cn) | ✅ Готов |
| `sanitizer.ts` | XSS защита | ⚠️ Частично |
| `rate-limit.ts` | Rate limiting | ⚠️ Не для prod |
| `email.ts` | Email отправка | ✅ Готов |

### 4.2 Аутентификация

| Файл | Назначение | Статус |
|------|------------|--------|
| `auth-options.ts` | NextAuth конфиг | ✅ Готов |
| `auth-utils.ts` | Хеширование паролей | ✅ Готов |
| `api-key-auth.ts` | API key auth | ✅ Готов |
| `two-factor.ts` | TOTP 2FA | ✅ Готов |
| `otp.ts` | OTP генерация | ✅ Готов |
| `password-reset.ts` | Сброс пароля | ✅ Готов |
| `device-link.ts` | Привязка устройств | ✅ Готов |
| `secure-secret.ts` | Шифрование секретов | ✅ Готов |

### 4.3 WebSocket и Realtime

| Файл | Назначение | Статус |
|------|------------|--------|
| `websocket.ts` | Серверный WS | ⚠️ Не для serverless |
| `websocket-manager.ts` | Клиентский WS | ✅ Готов |
| `realtime-events.ts` | События | ✅ Готов |
| `realtime-inbound.ts` | Входящие события | ✅ Готов |
| `relay-auth.ts` | Relay токены | ✅ Готов |
| `relay-base-url.ts` | Relay URLs | ✅ Готов |

### 4.4 Сообщения и контент

| Файл | Назначение | Статус |
|------|------------|--------|
| `messages.ts` | AI сообщения | ✅ Готов |
| `stories.ts` | Stories клиент | ✅ Готов |
| `stories-server.ts` | Stories сервер | ✅ Готов |
| `markdown.ts` | Markdown парсинг | ✅ Готов |
| `media.ts` | Медиа обработка | ✅ Готов |
| `reactions.ts` | Реакции | ⚠️ Неполный |
| `message-outbox.ts` | Очередь сообщений | ✅ Готов |

### 4.5 Группы и поиск

| Файл | Назначение | Статус |
|------|------------|--------|
| `group-management.ts` | Управление группами | ✅ Готов (799 строк) |
| `search.ts` | Поиск | ✅ Готов |

### 4.6 Боты и AI

| Файл | Назначение | Статус |
|------|------------|--------|
| `bots.ts` | Bot API | ✅ Готов |
| `bot-platform.ts` | Bot платформа | ✅ Готов |
| `glm4.ts` | GLM-4 AI | ✅ Готов |
| `openclaw.ts` | AI модерация | ✅ Готов |

### 4.7 Коммуникации

| Файл | Назначение | Статус |
|------|------------|--------|
| `webrtc.ts` | WebRTC звонки | ✅ Готов (1155 строк) |
| `push-notifications.ts` | Push уведомления | ✅ Готов |

### 4.8 Приватность

| Файл | Назначение | Статус |
|------|------------|--------|
| `chat-lock.ts` | Блокировка чатов | ⚠️ Заглушки |
| `disappearing-messages.ts` | Исчезающие сообщения | ✅ Готов |
| `data-export.ts` | Экспорт данных | ✅ Готов |

### 4.9 Утилиты

| Файл | Назначение | Статус |
|------|------------|--------|
| `i18n.ts` | Интернационализация | ✅ Готов (1126+ строк) |
| `feature-flags.ts` | Feature flags | ✅ Готов |
| `accessibility.ts` | Accessibility | ✅ Готов |
| `storage-usage.ts` | Хранилище | ✅ Готов |
| `webhooks.ts` | Webhooks | ✅ Готов |
| `sentry.ts` | Логирование | ✅ Готов |
| `public-api.ts` | Public API | ✅ Готов |

### 4.10 КРИПТОГРАФИЯ (src/lib/crypto/)

| Файл | Назначение | Статус |
|------|------------|--------|
| `index.ts` | Public API | ✅ Готов |
| `utils.ts` | Утилиты | ✅ Готов |
| `identity.ts` | Identity keys (Ed25519) | ✅ Готов |
| `fingerprint.ts` | Safety numbers | ✅ Готов |
| `prekeys.ts` | Pre-key bundle | ✅ Готов |
| `x3dh.ts` | Key exchange (X3DH) | ✅ Готов |
| `ratchet.ts` | Double Ratchet | ✅ Готов |
| `encrypt.ts` | Высокоуровневое шифрование | ✅ Готов |
| `session-manager.ts` | Управление сессиями | ✅ Готов |
| `message-processor.ts` | Обработка сообщений | ✅ Готов |
| `relay-client.ts` | Relay коммуникация | ✅ Готов |
| `use-e2e.ts` | React hook для E2E | ✅ Готов |
| `rotation.ts` | Key rotation | ✅ Готов |
| `sender-key.ts` | Group encryption | ✅ Готов |
| `multi-recipient.ts` | Multi-recipient | ✅ Готов |
| `store.ts` | IndexedDB storage | ✅ Готов |
| `vault.ts` | Key vault (PBKDF2+AES-GCM) | ✅ Готов |

---

## 5. HOOKS - ПОЛНЫЙ АУДИТ

### Статистика
| Хук | Статус | Проблемы |
|-----|--------|----------|
| `useWebSocket` | ⚠️ Заглушка | Полностью отключён |
| `useDraftAutosave` | ✅ Полный | Silent fail |
| `useMarkAsRead` | ✅ Полный | Silent fail |
| `useOutboxStatus` | ✅ Полный | Polling каждые 5с |
| `useAuthSync` | ✅ Полный | Hardcoded значения |
| `useToast` | ✅ Полный | Утечка памяти |
| `useErrorHandler` | ✅ Полный | Только console |
| `useIsMobile` | ✅ Полный | Hydration mismatch |

### 5.1 useWebSocket (ЗАГЛУШКА)

```typescript
// Файл: src/hooks/use-websocket.ts
// Проблема: Полностью отключён из-за двойного подключения
// Решение: Мигрировать на getWebSocketManager()
```

### 5.2 useDraftAutosave

```typescript
// Файл: src/hooks/use-draft-autosave.ts
// Проблемы:
// - Нет статуса сохранения
// - Silent fail (ошибки не показываются)
```

### 5.3 useOutboxStatus

```typescript
// Файл: src/hooks/use-outbox-status.ts
// Проблемы:
// - Polling каждые 5 секунд (ресурсоёмко)
// - Нет WebSocket подписки
```

---

## 6. КОМПОНЕНТЫ UI

### Messenger Components (~54 файла)

| Категория | Файлы | Статус |
|-----------|-------|--------|
| Chat List | 6 | ✅ Готов |
| Chat View | 10 | ✅ Готов |
| Profile | 12 | ✅ Готов |
| E2E | 3 | ✅ Готов |
| Onboarding | 5 | ✅ Готов |
| Stories | 1 | ✅ Готов |
| Feed | 6 | ✅ Готов |
| AI Center | 2 | ✅ Готов |
| Shared | 5 | ✅ Готов |
| Group Creation | 1 | ✅ Готов |

### UI Components (~50 файлов)
- All shadcn/ui components (Radix UI)
- Fully working

---

## 7. БАЗА ДАННЫХ

### Schema (prisma/schema.prisma)

| Модель | Поля | Статус |
|--------|------|--------|
| User | id, name, email, passwordHash, avatar, status, pinEnabled, pinHash, bio, username, phone, birthday | ✅ |
| Account | (NextAuth) | ✅ |
| Session | (NextAuth) | ✅ |
| VerificationToken | (NextAuth) | ✅ |
| Chat | id, type, name, avatar, lastMessage, unreadCount, isPinned, isMuted, isEncrypted | ✅ |
| ChatMember | id, userId, chatId, role, draftContent, notificationLevel | ✅ |
| Message | id, chatId, senderId, content, type, status, mediaUrl, isPinned, isEdited | ✅ |
| Contact | id, userId, contactId, name, isFavorite, isBlocked | ✅ |
| UserSettings | Все настройки уведомлений, приватности | ✅ |
| AIConversation | AI чаты | ✅ |
| FeedPost | Посты ленты | ✅ |
| FeedComment | Комментарии | ✅ |
| FeedReaction | Реакции | ✅ |
| Story | Истории | ✅ |
| StoryView | Просмотры историй | ✅ |
| StoryReply | Ответы на истории | ✅ |
| PushSubscription | Push подписки | ✅ |
| Bot | AI боты | ✅ |
| ApiKey | API ключи | ✅ |
| Webhook | Вебхуки | ✅ |

---

## 8. КРИТИЧНЫЕ ПРОБЛЕМЫ

### 🔴 Высокий приоритет

1. **useWebSocket - Заглушка**
   - Файл: `src/hooks/use-websocket.ts`
   - Проблема: Полностью отключён
   - Решение: Интегрировать `websocket-manager.ts`

2. **WebSocket Manager не интегрирован**
   - Файл: `src/lib/websocket-manager.ts`
   - Проблема: Создан, но не используется
   - Риск: Параллельные WS клиенты

3. **Vault password - session-scoped**
   - Файл: `src/lib/crypto/vault.ts`
   - Проблема: Пароль в sessionStorage
   - Решение: Опция "запомнить устройство"

### 🟠 Средний приоритет

4. **Rate limiting - in-memory**
   - Файл: `src/lib/rate-limit.ts`
   - Проблема: Не работает в кластере
   - Решение: Redis-based rate limiting

5. **Chat lock - заглушки**
   - Файл: `src/lib/chat-lock.ts`
   - Проблема: biometric/PIN возвращают false
   - Решение: Реализовать аутентификацию

6. **Sanitizer - неполный**
   - Файл: `src/lib/sanitizer.ts`
   - Проблема: Серверная сторона не очищает

### 🟡 Низкий приоритет (улучшения)

7. **Большие файлы** - требуют рефакторинга:
   - `i18n.ts` (1126+ строк)
   - `group-management.ts` (799 строк)
   - `webrtc.ts` (1155 строк)

8. **ESLint warnings** - 16 предупреждений
9. **Relay health не показан в UI**

---

## 9. ГОТОВНОСТЬ К MVP

### Оценка готовности: ~65%

| Категория | Готовность |
|-----------|------------|
| Сборка (build/typecheck) | ✅ 100% |
| API Routes | ✅ 95% (57/60) |
| Lib файлы | ✅ 94% (70/74) |
| Hooks | ⚠️ 75% (6/8) |
| UI компоненты | ✅ 90% |
| E2E Криптография | ✅ 90% |
| Docker | ⚠️ 80% |
| Безопасность | ⚠️ 75% |

### Функции для MVP

| # | Функция | Статус |
|---|---------|--------|
| 1 | Регистрация/вход | ✅ Готово |
| 2 | Список чатов | ✅ Готово |
| 3 | Сообщения | ✅ Готово |
| 4 | E2E шифрование | ✅ Готово |
| 5 | Профиль | ✅ Готово |
| 6 | Контакты | ✅ Готово |
| 7 | Stories | ✅ Готово |
| 8 | AI ассистент | ✅ Готово |
| 9 | Feed/посты | ✅ Готово |
| 10 | Docker deploy | ⚠️ Конфигурация |
| 11 | WebSocket | ⚠️ Интеграция |

### Время до MVP

| Задача | Дней |
|--------|------|
| WebSocket интеграция | 1-2 |
| Docker production | 1-2 |
| E2E smoke test | 1 |
| Полировка | 1-2 |
| **Итого** | **4-7 дней** |

---

## 10. РЕКОМЕНДАЦИИ ДЛЯ AI

### При работе с проектом учитывай:

1. **WebSocket полностью отключён** - используй `websocket-manager.ts` вместо `useWebSocket`

2. **E2E криптография работает** - все crypto файлы в `src/lib/crypto/` готовы

3. **Relay backend работает на порту 3001** - WebSocket signaling через него

4. **Rate limiting in-memory** - не использовать в production без Redis

5. **Sanitizer неполный** - серверная сторона не очищает HTML

6. **Chat lock заглушки** - biometric/PIN аутентификация не реализована

7. **Все API routes работают** - кроме `/api/contacts/invite` (stub) и `/api/ws` (deprecated)

8. **i18n поддерживает EN/RU** - в `src/lib/i18n.ts`

9. **GLM-4 API требует ключ** - в `.env.local` (GLM4_API_KEY)

10. **Docker Compose готов** - `docker-compose.yml` включает app, relay, db, redis, minio

### Структура проекта для навигации:

```
src/
├── app/api/          # 60 API endpoints
├── lib/              # 52 lib файлов
│   └── crypto/       # 19 crypto модулей
├── hooks/            # 8 hooks (1 заглушка)
├── components/       # UI компоненты
│   └── messenger/    # Мессенджер UI
└── store/            # Zustand stores
```

---

*Аудит создан: 16.04.2026*  
*Проверено: npm run typecheck, npm run build, npm run lint, npm run relay:typecheck*