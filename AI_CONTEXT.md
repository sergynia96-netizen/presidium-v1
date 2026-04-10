# AI Context: `nextjs_tailwind_shadcn_ts`

## 1) Краткое описание проекта
`nextjs_tailwind_shadcn_ts` — это Next.js 16 (App Router) приложение-мессенджер/социальная платформа с несколькими доменами:
- чат/сообщения и контакты;
- AI-функции (`/api/ai-chat`, `/api/ai-in-chat`, `/api/openclaw/*`);
- лента (`/api/feed/posts*`);
- stories (`/api/stories*`);
- библиотека/книги (`/api/books*`, часть через relay);
- push, сессии, пользовательские настройки, 2FA.

Есть отдельный relay-backend в `mini-services/relay-backend` (WebSocket/HTTP relay), интегрированный через `/api/relay/token`, `/api/proxy/[...path]`, `NEXT_PUBLIC_RELAY_*`.

---

## 2) Точный технологический стек

### Ядро
- Next.js: `16.2.1` (установлено), App Router (`src/app`)
- React: `19.0.0`
- TypeScript: `5.9.3`

### UI / Styling
- Tailwind CSS `v4` (`tailwindcss`, `@tailwindcss/postcss`)
- shadcn/ui + Radix UI (`@radix-ui/*`)
- Framer Motion
- Lucide React

### Формы / валидация / контент
- `react-hook-form`
- `zod`
- `@hookform/resolvers`
- `react-markdown`
- `react-syntax-highlighter`
- `dompurify`

### State / data fetching
- Zustand (`zustand`, `persist`)
- TanStack Query (`@tanstack/react-query`)

### Auth / security
- NextAuth (`next-auth`)
- Prisma adapter for Auth (`@auth/prisma-adapter`)
- JWT (`jsonwebtoken`)
- bcryptjs
- otplib (2FA/TOTP)

### ORM / БД
- Prisma (`@prisma/client`, `prisma`)
- Основная БД: SQLite (по `prisma/schema.prisma`)
- Relay service также использует Prisma + SQLite (в текущем состоянии)

### Realtime / media / network
- WebSocket (`ws`)
- WebRTC (через `src/lib/webrtc.ts`)
- `sharp` (обработка медиа)

### Тесты / качество
- Vitest
- ESLint (`eslint`, `eslint-config-next`)

---

## 3) Полное дерево `src/app/` с назначением

```text
src/app/
├─ globals.css                                  # Глобальные стили, темы, CSS variables
├─ layout.tsx                                   # Root layout App Router
├─ page.tsx                                     # Главный клиентский shell приложения (роут "/")
├─ login/
│  └─ page.tsx                                  # Страница логина (email/password + device link режим)
├─ forgot-password/
│  └─ page.tsx                                  # UI восстановления пароля
├─ reset-password/
│  └─ page.tsx                                  # UI сброса пароля
└─ api/                                          # Route Handlers (server endpoints)
   ├─ ai-chat/
   │  └─ route.ts                               # AI center: conversations/messages API
   ├─ ai-in-chat/
   │  └─ route.ts                               # AI в контексте конкретного чата
   ├─ auth/
   │  ├─ [...nextauth]/                         # Dynamic catch-all NextAuth endpoint
   │  │  └─ route.ts                            # /api/auth/* from NextAuth
   │  ├─ forgot-password/
   │  │  └─ route.ts                            # Запрос на сброс пароля
   │  ├─ register/
   │  │  └─ route.ts                            # Регистрация пользователя
   │  ├─ reset-password/
   │  │  └─ route.ts                            # Применение нового пароля
   │  ├─ send-code/
   │  │  └─ route.ts                            # Отправка verification-кода
   │  └─ verify-code/
   │     └─ route.ts                            # Проверка verification-кода
   ├─ books/
   │  ├─ route.ts                               # Каталог книг (прокси/агрегация)
   │  ├─ categories/
   │  │  └─ route.ts                            # Категории книг
   │  ├─ library/
   │  │  └─ route.ts                            # Библиотека пользователя
   │  └─ [id]/                                  # Dynamic route по id книги
   │     ├─ route.ts                            # Детали книги
   │     └─ progress/
   │        └─ route.ts                         # Прогресс чтения книги
   ├─ chats/
   │  └─ route.ts                               # CRUD/list чатов
   ├─ contacts/
   │  ├─ route.ts                               # CRUD/list контактов
   │  ├─ invite/
   │  │  └─ route.ts                            # Инвайт контакта
   │  ├─ sync/
   │  │  └─ route.ts                            # Синхронизация контактов
   │  └─ [id]/                                  # Dynamic route по id контакта
   │     └─ route.ts                            # Update/delete контакта
   ├─ devices/
   │  └─ link/
   │     └─ route.ts                            # Device linking endpoints
   ├─ feed/
   │  └─ posts/
   │     ├─ route.ts                            # Лента постов (list/create)
   │     └─ [id]/                               # Dynamic route по id поста
   │        ├─ comments/
   │        │  └─ route.ts                      # Комментарии к посту
   │        └─ reactions/
   │           └─ route.ts                      # Реакции/лайки/дизлайки/репост
   ├─ gifs/
   │  └─ search/
   │     └─ route.ts                            # Поиск GIF (Tenor)
   ├─ messages/
   │  ├─ route.ts                               # Список/создание сообщений
   │  └─ [id]/                                  # Dynamic route по id сообщения
   │     └─ route.ts                            # Get/patch/delete сообщения
   ├─ openclaw/
   │  ├─ chat/
   │  │  └─ route.ts                            # OpenClaw chat mode
   │  ├─ moderate/
   │  │  └─ route.ts                            # Модерация контента
   │  ├─ profile/
   │  │  └─ route.ts                            # AI-профиль пользователя
   │  └─ recommend/
   │     └─ route.ts                            # AI-рекомендации
   ├─ proxy/
   │  └─ [...path]/                             # Catch-all dynamic proxy path
   │     └─ route.ts                            # Проксирование в relay backend
   ├─ push/
   │  ├─ subscribe/
   │  │  └─ route.ts                            # Подписка push
   │  └─ unsubscribe/
   │     └─ route.ts                            # Отписка push
   ├─ relay/
   │  └─ token/
   │     └─ route.ts                            # Выдача relay access token
   ├─ search/
   │  └─ route.ts                               # Глобальный/чатовый поиск
   ├─ sessions/
   │  └─ route.ts                               # Управление активными сессиями
   ├─ stories/
   │  ├─ route.ts                               # CRUD/list stories
   │  ├─ feed/
   │  │  └─ route.ts                            # Stories feed
   │  ├─ by-id/
   │  │  └─ [id]/                               # Dynamic route по id story
   │  │     ├─ route.ts                         # Story by id (delete)
   │  │     ├─ reply/
   │  │     │  └─ route.ts                      # Ответ на story
   │  │     └─ view/
   │  │        └─ route.ts                      # Отметка просмотра story
   │  └─ by-source/
   │     └─ [sourceType]/
   │        └─ [sourceId]/                      # Dynamic route по sourceType/sourceId
   │           └─ route.ts                      # Stories by source
   ├─ upload/
   │  └─ route.ts                               # Загрузка файлов/медиа
   ├─ users/
   │  ├─ route.ts                               # List users
   │  └─ [id]/                                  # Dynamic route по id пользователя
   │     ├─ route.ts                            # Get/patch/delete user
   │     ├─ 2fa/
   │     │  └─ route.ts                         # Настройки 2FA
   │     └─ preferences/
   │        └─ route.ts                         # Пользовательские preferences
   └─ ws/
      └─ route.ts                               # WebSocket route stub (переезд в relay)
```

### Динамические маршруты stories (текущее состояние)
- Конфликт slug-имен устранён через статические префиксы:
  - `/api/stories/by-id/[id]`
  - `/api/stories/by-source/[sourceType]/[sourceId]`

---

## 4) Ключевые команды разработки / сборки / запуска

### Основные
- `npm run dev` — dev-сервер Next.js (`-p 3000 --webpack`)
- `npm run build` — production build (с подготовкой standalone assets)
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check
- `npm run test` — Vitest tests

### LAN/утилиты
- `npm run dev:lan`
- `npm run dev:lan:stop`
- `npm run cleanup:artifacts`
- `npm run cleanup:artifacts:deep`

### БД (main app)
- `npm run db:generate`
- `npm run db:push`
- `npm run db:migrate`
- `npm run db:reset`
- `npm run db:studio`

### Relay backend
- `npm run relay:dev`
- `npm run relay:start`
- `npm run relay:typecheck`
- `npm run relay:db:push`

### Важное предупреждение по запуску production
- В проекте включен `output: "standalone"` (см. `next.config.ts`).
- Для production-запуска используйте standalone сервер:
  - `node .next/standalone/server.js`
- Не используйте `next start` для standalone режима.
- В текущем `package.json` `start` прописан через Bun (`bun .next/standalone/server.js`), что тоже работает, но Node-команда выше — каноничная для standalone.

### Порт
- По скриптам по умолчанию: `3000` (web) и `3001` (relay).
- Если порт занят, dev/runtime может перейти на другой порт (например `3100`), поэтому лучше явно задавать `--port`.

---

## 5) Переменные окружения, используемые в коде (только ключи)

### Web / Next.js
- `AI_PROVIDER`
- `ALLOW_ANON_AI`
- `ALLOW_ENV_EXAMPLE_KEYS`
- `DEV_OTP_PREVIEW`
- `DEV_PASSWORD_RESET_PREVIEW`
- `GLM_API_KEY`
- `GLM4_API_KEY`
- `GLM4_RATE_LIMIT_DISABLED`
- `GLM4_RATE_LIMIT_MAX`
- `GLM4_RATE_LIMIT_WINDOW_MS`
- `JWT_SECRET`
- `NEXT_PUBLIC_ENV`
- `NEXT_PUBLIC_RELAY_HTTP_URL`
- `NEXT_PUBLIC_RELAY_WS_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_TURN_PASSWORD`
- `NEXT_PUBLIC_TURN_URL`
- `NEXT_PUBLIC_TURN_USERNAME`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NODE_ENV`
- `PIN_PEPPER`
- `RELAY_HTTP_URL`
- `TENOR_API_KEY`
- `TWO_FACTOR_ISSUER`
- `TWO_FACTOR_SECRET_KEY`

### Relay backend (`mini-services/relay-backend/src`)
- `CORS_ORIGINS`
- `JWT_SECRET`
- `NEXTAUTH_SECRET`
- `NODE_ENV`
- `PORT`
- `REDIS_CLUSTER_NODES`
- `REDIS_URL`
- `RELAY_DEV_OTP_PREVIEW`
- `RELAY_NODE_ID`
- `RELAY_QUEUE_PER_RECIPIENT_LIMIT`
- `RELAY_QUEUE_TOTAL_LIMIT`
- `RELAY_QUEUE_TTL_MS`
- `RELAY_SESSION_TTL_MS`
- `RELAY_SPAM_MAX_DUPLICATE`
- `RELAY_SPAM_MAX_FANOUT`
- `RELAY_SPAM_MAX_MESSAGES`
- `RELAY_SPAM_MAX_PAYLOAD_LENGTH`
- `RELAY_SPAM_WINDOW_MS`

---

## 6) Особенности архитектуры

- Используется `src/` layout: вся App Router структура в `src/app`.
- API реализовано как Route Handlers внутри `src/app/api/**/route.ts`.
- Корневой UI-роут: `src/app/page.tsx` (толстый client shell + навигация/views).
- Глобальные провайдеры задаются через root layout + providers.
- Middleware (`middleware.ts`) делает:
  - CSRF origin/referer/fetch-site checks для mutating API;
  - нормализацию/инъекцию trusted `x-user-id`/`x-user-email` из токена.
- Состояние приложения на клиенте: Zustand stores (`src/store/*`).
- ORM/DB слой: Prisma (`src/lib/db.ts`, `prisma/schema.prisma`).
- Realtime и relay-взаимодействие: `src/hooks/use-websocket.ts`, `src/lib/websocket.ts`, `src/app/api/relay/token`, `src/app/api/proxy/[...path]`.
- Отдельный relay сервис расположен в `mini-services/relay-backend`.
- Route groups вида `(group)` и приватные сегменты `_components` внутри `src/app` не используются в текущей структуре.

---

## 7) Известные проблемы / TODO / FIXME

### Критичное
- На текущем шаге критичный конфликт stories-роутов закрыт (см. раздел про `by-id` / `by-source`).
- Это ломает runtime API (500) с ошибкой slug name conflict.

### TODO из кода
- `src/lib/crypto/chat-integration.ts`:
  - `senderName: envelope.senderId` // TODO: Get from contacts
- `src/lib/crypto/session-manager.ts`:
  - `recipientDeviceId: 'web'` // TODO: Multi-device
- `src/lib/reactions.ts`:
  - TODO: Send encrypted reaction via relay
- `src/lib/feature-flags.ts`:
  - TODO: Check user segments
- `src/app/api/chats/route.ts`:
  - TODO: Calculate `unreadCount` from read receipts
  - TODO: Add `isPinned` to ChatMember model
  - TODO: Add `isMuted` to ChatMember model

### Дополнительно замечено при проверке
- Есть клиентские вызовы API, для которых нет route handlers в `src/app/api`:
  - `/api/link-preview`
  - `/api/bots/*`
  - `/api/webhooks/*`
  - `/api/v1/*`
  - `/api/keys/*`
  - `/api/flags`
- Это потенциальные runtime gaps для соответствующих UI/SDK модулей.
