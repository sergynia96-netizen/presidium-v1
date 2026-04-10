# WORK_STRATEGY_203

## Goal
Sequentially verify and harden all 203 tasks from `ALL_TASKS.md` using evidence-based checks (code + tests + build), not only checklist marks.

## Baseline (2026-04-05)
- Source checklist: `ALL_TASKS.md`
- Path-normalized copy created: `ALL_TASKS_NORMALIZED.md`
- File reference check:
  - total referenced paths: 52
  - existing paths: 52
  - missing paths: 0
- Test status:
  - `vitest --run`: 63/63 passed
- Static verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed

## Execution protocol (one task at a time)
For each task we do:
1. Verify implementation file(s) exist and are wired into runtime flow.
2. Add/adjust tests if acceptance is not objectively covered.
3. Run relevant checks (unit + typecheck + build slice).
4. Record result in this file with evidence.

## Priority order
1. Stage 1 (E2E foundation)
2. Stage 2 (Relay stateless commutator)
3. Stage 3 (Client E2E integration)
4. Stage 7 (Security + bug fixes)
5. Remaining stages in listed order

## Current focus
### Stage 1 verification started
- Coverage evidence source: `src/__tests__/crypto.test.ts`
- Covered areas:
  - identity keys
  - pre-key bundles
  - X3DH
  - ratchet basics
  - fingerprint/safety numbers
  - crypto utils

### Stage 2 progress
- Task 2.6 (blocked-user check in router): completed and verified.
- Implemented server-side block checks for:
  - encrypted envelope routing
  - typing signals
  - call signaling
- Files updated:
  - `mini-services/relay-backend/src/relay/contacts-service.ts`

### AI Center de-stub progress (real conversations only)
- Implemented server-backed conversation history loading for AI Center:
  - added `GET /api/ai-chat` with authenticated Prisma read
  - returns user-owned conversations with message history
  - supports optional `conversationId` and `limit`
- AI Center now hydrates from backend instead of stale local phantom data:
  - loads conversations on open
  - normalizes server timestamps for sidebar/messages
  - reconciles active conversation id against server list
  - keeps send flow but updates UI from real server-backed conversation set
- Files updated:
  - `src/app/api/ai-chat/route.ts`
  - `src/lib/api-client.ts`
  - `src/components/messenger/ai-center/ai-center.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/app/api/ai-chat/route.ts src/components/messenger/ai-center/ai-center.tsx src/lib/api-client.ts` passed
  - `npm run -s build` passed

### Chat realtime/media polish progress
- Hardened websocket inbound handling in root shell:
  - accepts `relay.envelope`, `relay.group_envelope`, `relay.channel_envelope`
  - ACK delivered semantics now handle numeric aggregate values from group/channel ACKs
  - resolves fallback chat by `groupId/channelId` when `chatId` is absent in payload
- Media UX improvements:
  - removed localStorage token fallback from upload call (`/api/upload`) to rely on real session auth
  - video attachments now render playable inline previews in message bubbles
- Files updated:
  - `src/app/page.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/components/messenger/chat-view/message-bubble.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/app/page.tsx src/components/messenger/chat-view/chat-view.tsx src/components/messenger/chat-view/message-bubble.tsx` passed
  - `npm run -s build` passed

### Technical cleanup progress
- Cleaned transient technical garbage:
  - `upload/` purged from legacy extracted archives and temp artifacts; reset to `upload/.gitkeep`
  - `.zscripts/` runtime artifacts removed (`*.pid`, `*-lan*.log`)
  - kept only runnable script assets in `.zscripts/`
- Validation:
  - `npm run -s build` passed after cleanup

### Group creation de-stub progress
- Replaced mocked contacts in group creation flow with real user contacts from store/API sync.
- Replaced fake group creation endpoint (`/api/groups`) with real backend route (`POST /api/chats`).
- Added post-create chat sync and immediate navigation into created chat when backend returns chat id.
- Added UX guardrails:
  - disable create button while creating / with no selected members
  - explicit success/error toast feedback
- File updated:
  - `src/components/messenger/group-creation/group-creation.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/components/messenger/group-creation/group-creation.tsx` passed
  - `npm run -s build` passed

### Favorites de-stub progress
- Removed demo fallback data from profile favorites screen.
- Favorites now render strictly from real favorite message ids in persisted store.
- Favorite cards are now actionable:
  - click/keyboard opens the corresponding real chat
  - no phantom/demo records are shown when there is no real data
- File updated:
  - `src/components/messenger/profile/favorites-screen.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/components/messenger/profile/favorites-screen.tsx` passed
  - `npm run -s build` passed

### Profile devices de-stub progress
- Removed hardcoded devices import from `mock-data`.
- Devices dialog now renders real current-session device info derived from runtime browser context:
  - browser name
  - device type (desktop/mobile/tablet)
  - last active timestamp
- Security/settings row now reflects real device count from runtime session list instead of hardcoded `3`.
- File updated:
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/components/messenger/profile/profile-screen.tsx` passed
  - `npm run -s build` passed

### Edit profile wiring progress
- Fixed non-working profile save path:
  - frontend no longer calls missing `/api/users/me`
  - now calls real `PATCH /api/users/{id}`
- Added real state synchronization after successful save:
  - updates `useAppStore.user` with server response fields
  - success/error toast feedback added
- Backend profile update expanded:
  - added `email` support in validation schema
  - added unique-email conflict check (`409`)
  - includes `birthday` in update response payload
- Files updated:
  - `src/components/messenger/profile/edit-profile.tsx`
  - `src/app/api/users/[id]/route.ts`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/components/messenger/profile/edit-profile.tsx src/app/api/users/[id]/route.ts` passed
  - `npm run -s build` passed

### Notifications/Privacy persistence progress
- Eliminated ephemeral profile/privacy/notifications toggles by wiring them to persisted `useAppStore.settings`.
- Store settings model expanded with new persistent flags:
  - notifications: `notifPreview`, `notifVibration`, `notifMutedAll`
  - privacy toggles: `readReceipts`, `typingIndicators`, `onlineStatus`
  - privacy levels: `privacyLastSeen`, `privacyProfilePhoto`, `privacyAbout`, `privacyGroupAdds`, `privacyCallFrom`
- Added robust settings migration on rehydrate:
  - persisted settings now merge with default settings schema to backfill missing fields safely
  - `openClawEnabled` remains enforced as mandatory
- UI wiring completed:
  - `profile-screen` privacy switches now read/write persisted settings
  - `notifications-settings` now reads/writes persisted settings (including mute-all behavior)
  - `privacy-settings` no longer calls missing `/api/users/me/privacy`; now updates persisted settings directly
- Chat behavior now honors persisted privacy settings:
  - read receipts are not sent when `settings.readReceipts` is disabled
  - typing events are not sent when `settings.typingIndicators` is disabled
- Files updated:
  - `src/store/use-app-store.ts`
  - `src/components/messenger/profile/profile-screen.tsx`
  - `src/components/messenger/profile/notifications-settings.tsx`
  - `src/components/messenger/profile/privacy-settings.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint` on touched files passed
  - `npm run -s build` passed

### Personal data save wiring progress
- Fixed non-persistent personal data edits (`bio`, `birthday`) in `personal-data` screen.
- Save actions now call real backend route `PATCH /api/users/{id}`.
- Successful responses now sync back into `useAppStore.user` (no visual-only save state).
- Added success/error toast feedback for these save actions.
- File updated:
  - `src/components/messenger/profile/personal-data.tsx`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint src/components/messenger/profile/personal-data.tsx` passed
  - `npm run -s build` passed
  - `mini-services/relay-backend/src/signaling/message-router.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

### Local legacy mock cleanup progress
- Closed a root cause of “phantom/stub chats/posts/AI dialogs” after upgrades:
  persisted local state could still contain legacy demo fixtures from earlier builds.
- Implemented explicit persisted-store sanitation + migration in `useAppStore`:
  - added `persist.version = 3` migration path
  - sanitizes legacy mock entities on hydrate/migrate:
    - chats/messages
    - feed posts
    - AI conversations
    - contacts
    - call history
  - invalidates old demo account (`user-1 / alex@presidium.app`) from auth state
  - preserves real persisted data and merges settings with defaults safely
- File updated:
  - `src/store/use-app-store.ts`
- Validation:
  - `npx eslint src/store/use-app-store.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Env/AI key hardening progress
- Fixed key-management risk and a frequent source of AI failures:
  - removed real secrets from `.env.example` and replaced with placeholders
  - hardened GLM key resolver:
    - ignores placeholder-like values
    - no longer uses `.env.example` as runtime credential source by default
    - optional opt-in only via `ALLOW_ENV_EXAMPLE_KEYS=1`
  - improved runtime error clarity for missing/placeholder GLM key
- Files updated:
  - `.env.example`
  - `src/lib/glm4.ts`
- Validation:
  - `npx eslint src/lib/glm4.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Relay offline UX progress
- Added explicit relay connectivity feedback in active chat UI:
  - offline/reconnecting banner when WS relay is unavailable
  - queued outbox count while disconnected
  - syncing queued outbox count when relay reconnects
- Wired UI to outbox runtime events (`presidium:outbox-updated`) for live updates.
- File updated:
  - `src/components/messenger/chat-view/chat-view.tsx`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Middleware trust/CSRF hardening progress
- Closed request-header spoofing vector:
  - middleware now always strips incoming `x-user-id` / `x-user-email`
  - trusted values are re-injected only from verified NextAuth token
- CSRF guard in middleware kept active for mutating API calls with same-origin checks.
- File updated:
  - `middleware.ts`
- Validation:
  - `npx eslint middleware.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Accent theme wiring progress
- Closed UI inconsistency where `accentColor` was persisted but barely affected visual theme.
- Implemented global accent application at app level (not tied to profile screen lifecycle):
  - `data-accent` is now applied from provider on every load/theme change.
- Expanded accent palettes to real design tokens for both light and dark:
  - `--primary`, `--primary-foreground`
  - `--ring`
  - `--sidebar-primary`, `--sidebar-ring`
  - `--bubble-me`, brand token alignment, chart lead color
- Result: accent switching now visibly changes primary UI surfaces/buttons/rings/chat bubbles.
- Files updated:
  - `src/app/globals.css`
  - `src/components/shared/matrix-theme-provider.tsx`
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npx eslint src/components/shared/matrix-theme-provider.tsx src/components/messenger/profile/profile-screen.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Login brute-force protection progress
- Added rate limiting directly in NextAuth credentials authorize path:
  - per-IP limiter for sign-in attempts
  - per-email limiter for sign-in attempts
- This protects the real login execution path (not only auxiliary routes).
- File updated:
  - `src/lib/auth-options.ts`
- Validation:
  - `npx eslint src/lib/auth-options.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Dead mock code removal progress
- Removed obsolete `src/data/mock-data.ts` (no runtime imports remained).
- This removes a large legacy demo fixture source that was causing audit noise/confusion.
- Validation:
  - import scan for `mock-data` in `src/` returned no matches
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### AI config diagnostics progress
- Improved AI/OpenClaw runtime diagnostics for missing/bad GLM key:
  - if GLM configuration error is detected, APIs now return explicit `503` with actionable setup message
  - replaced opaque generic `500` path for this case
- Updated endpoints:
  - `/api/ai-chat`
  - `/api/ai-in-chat`
  - `/api/openclaw/chat`
  - `/api/openclaw/profile`
  - `/api/openclaw/recommend`
- Validation:
  - `npx eslint` on touched API files passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### OpenClaw UI bypass hardening progress
- Hardened moderation action flow in chat UI:
  - `Use suggestion` now **always** re-runs moderation before sending
  - if re-check fails or is unsafe, sending is blocked
  - removed legacy behavior that could send fallback/original text from suggestion path
  - removed attaching previous unsafe moderation result to newly sent suggested message
- File updated:
  - `src/components/messenger/chat-view/chat-view.tsx`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

### Stage 3 progress
- Root app shell restored on `/` (instead of static landing placeholder):
  - onboarding flow rendering
  - authenticated messenger view routing
  - desktop split layout (sidebar + chats + active chat)
  - mobile view + bottom nav
- WebSocket client protocol aligned with Relay v2:
  - `relay.envelope` / `relay.group_envelope`
  - `typing.start` / `typing.stop`
  - read receipts via encrypted envelope payload
  - bridge wiring into Zustand realtime actions
- Realtime message pipeline hardened end-to-end:
  - relay ACK enriched with `messageId/chatId/event` metadata for status reconciliation
  - client ACK handlers for `relay.ack`, `relay.group_ack`, `relay.channel_ack`
  - monotonic message status transitions in store (`sending -> sent -> delivered -> read`, no rollback)
  - incoming envelope event handling for `edit` and `delete`
  - outgoing messages/media now start as `sending` and transition via runtime ACK/read flow
- Files updated:
  - `src/app/page.tsx`
  - `src/hooks/use-websocket.ts`
  - `src/store/use-app-store.ts`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run -s typecheck` passed
  - `npm run -s build` passed
  - `npm run relay:typecheck` passed

### Feed de-mock progress
- Replaced local-only feed behavior with API-backed persistence:
  - new server endpoints:
    - `GET/POST /api/feed/posts`
    - `GET/POST /api/feed/posts/[id]/comments`
    - `POST /api/feed/posts/[id]/reactions`
  - feed UI now reads/writes through API:
    - post creation
    - like/dislike/repost toggles
    - comments load/create
  - removed local-only reaction inflation path in feed UI
- DB schema updated with feed entities:
  - `FeedPost`
  - `FeedComment`
  - `FeedReaction`
- Files updated:
  - `prisma/schema.prisma`
  - `src/app/api/feed/posts/route.ts`
  - `src/app/api/feed/posts/[id]/comments/route.ts`
  - `src/app/api/feed/posts/[id]/reactions/route.ts`
  - `src/components/messenger/feed/feed-screen.tsx`
  - `src/components/messenger/feed/create-post.tsx`
  - `src/components/messenger/feed/comment-popup.tsx`
  - `src/lib/api-client.ts`
- Validation:
  - `npm run -s typecheck` passed
  - `npx eslint ...` (touched files) passed
  - `npm run -s build` passed
  - `npx prisma db push` applied schema successfully (SQLite synced)

- Task 2.13 (GLM-4 rate limiting): completed and verified.
- Implemented:
  - global GLM-4 call limiter in `src/lib/glm4.ts` (configurable key/max/window)
  - dedicated `GLM4RateLimitError` with `retryAfterMs`
  - API routes upgraded to return HTTP `429` on GLM limiter hit:
    - `/api/ai-chat`
    - `/api/ai-in-chat`
    - `/api/openclaw/chat`
    - `/api/openclaw/profile`
    - `/api/openclaw/recommend`
- Files updated:
  - `src/lib/glm4.ts`
  - `src/app/api/ai-chat/route.ts`
  - `src/app/api/ai-in-chat/route.ts`
  - `src/app/api/openclaw/chat/route.ts`
  - `src/app/api/openclaw/profile/route.ts`
  - `src/app/api/openclaw/recommend/route.ts`
- Validation:
  - `npm run -s typecheck` passed

- Task 2.14 (anti-spam filters): completed and verified.
- Implemented:
  - relay anti-spam service with envelope-level heuristics:
    - sender throughput window
    - duplicate ciphertext flood detection
    - fan-out recipient limit
    - payload length policy
  - anti-spam checks wired into:
    - direct envelope routing
    - group envelope routing
    - channel envelope routing
  - anti-spam stats added to `/health`
  - anti-spam window cleanup integrated into maintenance loop
- Files updated:
  - `mini-services/relay-backend/src/security/anti-spam-service.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

- Task 2.11 (OpenClaw report system): completed and verified.
- Implemented:
  - relay-side moderation report service with strict validation
  - report persistence (`ModerationReport`) with category/severity/stat indexes
  - authenticated API endpoints:
    - `POST /api/openclaw/reports`
    - `GET /api/openclaw/reports`
    - `GET /api/openclaw/reports/stats`
  - aggregated report statistics (by category/severity and time range)
- Files updated:
  - `mini-services/relay-backend/prisma/schema.prisma`
  - `mini-services/relay-backend/src/relay/openclaw-report-service.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `cd mini-services/relay-backend && bun run db:generate` passed
  - `npm run relay:typecheck` passed

- Task 2.12 (moderation metadata in relay protocol): completed and verified.
- Implemented:
  - protocol types extended with `RelayModerationMetadata` and moderation flags
  - safe metadata parser/sanitizer in WS ingress pipeline
  - moderation metadata pass-through for:
    - direct envelopes
    - group fan-out envelopes
    - channel fan-out envelopes
  - metadata persisted through normal router/offline-queue delivery path
- Files updated:
  - `mini-services/relay-backend/src/types/index.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

- Task 2.10 (group/channel message routing): completed and verified.
- Implemented:
  - encrypted group broadcast over WS (`relay.group_envelope` → `relay.group_ack`)
  - encrypted channel broadcast over WS (`relay.channel_envelope` → `relay.channel_ack`)
  - sender membership/subscription validation before fan-out
  - per-recipient routing via existing direct router (including block checks and offline queue)
  - delivery aggregation counters (delivered/offline/failed) in ACK payload
- Files updated:
  - `mini-services/relay-backend/src/relay/groups-channels-service.ts`
  - `mini-services/relay-backend/src/index.ts`
  - `mini-services/relay-backend/src/types/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

- Task 2.8 (relay rate limiting): completed for MVP runtime and verified.
- Implemented:
  - HTTP rate limits by client IP (read/write/auth/search policies)
  - WS auth-attempt limit by client IP
  - WS message throughput limit by authenticated account
  - standard 429 response with `Retry-After` and rate-limit headers
  - rate-limit bucket cleanup + health metrics exposure
- Files updated:
  - `mini-services/relay-backend/src/security/rate-limit-service.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

- Task 2.9 (presence service scoped to contacts): completed and verified.
- Implemented:
  - audience resolution from contact graph (outgoing + incoming contacts)
  - block-aware filtering for presence recipients
  - removal of global presence broadcast
  - offline transition routed through the same scoped presence pipeline
- Files updated:
  - `mini-services/relay-backend/src/relay/contacts-service.ts`
  - `mini-services/relay-backend/src/presence/presence-service.ts`
- Validation:
  - `npm run relay:typecheck` passed

Next action: Stage 2 task 2.7 deep check — offline queue behavior and delivery guarantees.

- Task 2.7 (offline queue + deferred delivery guarantees): completed and verified.
- Implemented:
  - in-memory encrypted envelope queue with per-recipient/global limits and TTL
  - deferred delivery on websocket re-auth (`deliverQueued`)
  - sender acknowledgement payload for relay result (`relay.ack`)
  - queued-delivery summary event to recipient on reconnect (`relay.queue.delivered`)
  - expired queue cleanup in periodic maintenance loop
  - queue visibility in relay health endpoint (`/health.offlineQueue`)
- Files updated:
  - `mini-services/relay-backend/src/signaling/message-router.ts`
  - `mini-services/relay-backend/src/index.ts`
- Validation:
  - `npm run relay:typecheck` passed

- Task 1.5 (chat moderation suggestion bypass hardening): completed and verified.
- Implemented:
  - removed unsafe fallback to original blocked text in suggestion flow
  - enforced non-empty suggestion before send
  - added mandatory re-moderation of suggested text before sending
  - stopped attaching previous unsafe moderation metadata to newly sent suggested message
- Files updated:
  - `src/components/messenger/chat-view/chat-view.tsx`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

- Task 1.6 (auth API compatibility cleanup): completed and verified.
- Implemented:
  - migrated client auth flow in API store to NextAuth-native calls:
    - `signIn('credentials', { redirect: false })`
    - `signOut({ redirect: false })`
    - `getSession()`
  - removed dependence on non-existent JSON endpoints:
    - `/api/auth/signin`
    - `/api/auth/signout`
    - `/api/auth/session`
  - removed obsolete auth client methods that pointed to those endpoints
  - added safe session-user mapper for consistent local `User` shape
- Files updated:
  - `src/store/use-api-store.ts`
  - `src/lib/api-client.ts`
- Validation:
  - `npx eslint src/store/use-api-store.ts src/lib/api-client.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.7 deep check — complete chat pipeline status transitions (`sent -> delivered -> read`) with server-ack reconciliation and retry safety.

- Task 1.7 (chat status lifecycle + outbox flush runtime): completed and verified.
- Implemented:
  - added global message status persistence from realtime events:
    - `relay.ack` with delivery confirmation now persists `delivered` via `PATCH /api/messages/:id`
    - incoming `read_receipt` now persists `read` via `PATCH /api/messages/:id`
  - introduced centralized outbox processor execution in app runtime:
    - periodic flush loop (every 3s) while authenticated
    - immediate flush on browser `online` event
  - connected all queued task kinds to real processors:
    - `ws_broadcast` uses active relay transport and defers when disconnected
    - `api_persist` posts deferred message payloads to `/api/messages`
    - `api_request` replays deferred API mutations with method/path/body
  - retry/defer/drop policy hardened:
    - `401/403` -> `defer`
    - `429/5xx/timeout-class` -> `retry`
    - invalid client errors -> `drop`
- Files updated:
  - `src/app/page.tsx`
- Validation:
  - `npx eslint src/app/page.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.8 deep check — clean remaining chat UX stubs (GIF/stickers picker mock source + placeholder handlers) to eliminate visible non-real artifacts.

- Task 1.8 (GIF picker de-stub + real chat send flow): completed and verified.
- Implemented:
  - added real backend GIF search endpoint:
    - `GET /api/gifs/search`
    - provider: Tenor v2 (`TENOR_API_KEY`)
    - includes input validation + rate limiting + error-safe fallback
  - removed mocked GIF result generation from picker UI
  - wired picker to live API with debounce, loading and error states
  - integrated GIF picker into message composer UI
  - implemented full GIF message send pipeline in chat view:
    - persist to `/api/messages`
    - local optimistic render + status transitions
    - relay WS broadcast + outbox fallback
  - added i18n/ARIA label for GIF picker control
  - documented Tenor key in `.env.example`
- Files updated:
  - `src/app/api/gifs/search/route.ts`
  - `src/components/messenger/chat-view/stickers-gif-picker.tsx`
  - `src/components/messenger/chat-view/message-input.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/lib/i18n.ts`
  - `.env.example`
- Validation:
  - `npx eslint src/app/api/gifs/search/route.ts src/components/messenger/chat-view/stickers-gif-picker.tsx src/components/messenger/chat-view/message-input.tsx src/components/messenger/chat-view/chat-view.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.9 deep check — complete sticker send pipeline (local sticker catalog -> real media message event) and remove remaining placeholder behavior in chat context actions.

- Task 1.9 (chat context placeholder removal — new window): completed and verified.
- Implemented:
  - replaced placeholder action in chat context menu (`ctx.newWindow`) with real behavior:
    - opens a new tab/window with `?chatId=<id>`
  - added URL-based chat bootstrap in app shell:
    - when authenticated and chat exists, app auto-opens the target chat from query param
- Files updated:
  - `src/components/messenger/chat-view/chat-context-menu.tsx`
  - `src/app/page.tsx`
- Validation:
  - `npx eslint src/app/page.tsx src/components/messenger/chat-view/chat-context-menu.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.10 deep check — finish sticker send pipeline (picker trigger + sticker-as-media message flow) to remove the last composer-level placeholder capability.

- Task 1.10 (sticker picker -> real send pipeline): completed and verified.
- Implemented:
  - integrated sticker picker into composer UI with dedicated control
  - added robust picker visibility handling (outside click / Escape / mutual exclusion with GIF picker)
  - connected sticker selection to real message pipeline:
    - persist to `/api/messages`
    - optimistic local update + status transition to `sent`
    - relay WS broadcast + outbox fallback for retries
  - added ARIA translations for sticker picker control
- Files updated:
  - `src/components/messenger/chat-view/message-input.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/lib/i18n.ts`
- Validation:
  - `npx eslint src/components/messenger/chat-view/message-input.tsx src/components/messenger/chat-view/chat-view.tsx src/lib/i18n.ts src/components/messenger/chat-view/stickers-gif-picker.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.11 deep check — replace remaining ephemeral profile/settings state with durable store + API sync where handlers still only emulate success.

- Task 1.11 (durable preferences persistence + real PIN toggle): completed and verified.
- Implemented:
  - extended server-side `UserSettings` schema with full app settings coverage:
    - notification toggles
    - privacy visibility controls
    - typing/read/online flags
    - auto-delete mode
  - added authenticated preferences API:
    - `GET /api/users/[id]/preferences`
    - `PATCH /api/users/[id]/preferences`
    - includes validation + rate limiting + OpenClaw forced-on policy
  - wired client runtime sync in app shell:
    - load preferences from backend after auth
    - debounce-persist local changes (`settings`, `locale`, `accentColor`) back to backend
    - prevents stale “saved only locally” behavior in profile/settings flows
  - made PIN switch in profile screen real (not visual only):
    - `PATCH /api/users/[id]` with `pinEnabled`
    - store sync + user feedback toast
  - updated user API schema/response to support `pinEnabled`
- Files updated:
  - `prisma/schema.prisma`
  - `src/app/api/users/[id]/preferences/route.ts`
  - `src/app/page.tsx`
  - `src/app/api/users/[id]/route.ts`
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npx prisma generate --no-engine` passed (used due local file lock on engine DLL)
  - `npm run -s db:push` completed schema sync
  - `npx eslint src/app/api/users/[id]/route.ts src/app/api/users/[id]/preferences/route.ts src/components/messenger/profile/profile-screen.tsx src/app/page.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.12 deep check — remove remaining no-op actions in privacy/data screens (`export data`, `blocked users`, `delete account`) with safe functional handlers.

- Task 1.12 (privacy screen no-op actions -> real handlers): completed and verified.
- Implemented:
  - replaced `no-op` action buttons in privacy screen with working flows:
    - `Export data` now performs real export (`user + contacts + chats + messages + settings`) to JSON download
    - `Blocked users` now opens a functional dialog backed by `/api/contacts` and supports unblock via `PATCH /api/contacts/:id`
    - `Delete account` now uses a guarded confirmation dialog (`DELETE`) and executes real account deletion (`DELETE /api/users/:id`) + session sign-out
  - added loading/error/success feedback states to these actions
  - upgraded action row component to support disabled/loading state
- Files updated:
  - `src/components/messenger/profile/privacy-settings.tsx`
- Validation:
  - `npx eslint src/components/messenger/profile/privacy-settings.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.13 deep check — reconcile `src/lib/data-export.ts` with real API surface (remove stale `/api/users/me`, `/api/chats/:id/export`, session/cache phantom endpoints) and align helper module with current backend contracts.

- Task 1.13 (data-export helper aligned with real API contracts): completed and verified.
- Implemented:
  - created a dedicated export/account helper module:
    - `buildDataExportPayload()`
    - `exportAllDataToFile()` (JSON + HTML)
    - `exportSingleChatToFile()` (JSON + HTML)
    - `deleteOwnAccount()`
    - `getCurrentSessionSnapshot()`
  - export logic now uses only existing endpoints:
    - `/api/users/:id`
    - `/api/users/:id/preferences`
    - `/api/contacts`
    - `/api/chats`
    - `/api/messages`
    - `/api/ai-chat`
    - `/api/auth/session`
  - removed in-component duplicated export/delete networking logic from privacy screen and switched UI to the new helper module.
  - upgraded devices/session view to pull real current session snapshot from auth API (instead of static hardcoded runtime mock list).
- Files updated:
  - `src/lib/data-export.ts`
  - `src/components/messenger/profile/privacy-settings.tsx`
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npx eslint src/lib/data-export.ts src/components/messenger/profile/privacy-settings.tsx src/components/messenger/profile/profile-screen.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.14 deep check — finish real active session management API surface (`/api/sessions` list/revoke semantics) and wire revoke actions in devices UI.

- Task 1.14 (active sessions API + devices revoke wiring): completed and verified.
- Implemented:
  - added real sessions endpoint:
    - `GET /api/sessions` returns active session list for current user
    - `DELETE /api/sessions` supports revoke by `sessionId` and `revokeAllOthers`
    - includes auth checks + per-user rate limiting
  - bridged helper layer:
    - `listActiveSessions()`
    - `revokeActiveSession()`
    - `revokeAllOtherSessions()`
    - `getCurrentSessionSnapshot()` now prefers real sessions API
  - devices UI now uses real session source (no hardcoded-only list) and supports revoke action for non-current sessions.
- Files updated:
  - `src/app/api/sessions/route.ts`
  - `src/lib/data-export.ts`
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npx eslint src/app/api/sessions/route.ts src/lib/data-export.ts src/components/messenger/profile/profile-screen.tsx` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.15 deep check — add “revoke all other sessions” control in devices dialog and wire secure sign-out guidance for current session termination.

- Task 1.15 (revoke all other sessions control): completed and verified.
- Implemented:
  - devices dialog now has `Revoke all other sessions` action when non-current sessions exist.
  - action is wired to real backend revoke API (`DELETE /api/sessions` with `revokeAllOthers: true`).
  - added loading/disabled safeguards during revoke operations.
  - kept current session protection intact (current session termination still via sign-out flow).
- Files updated:
  - `src/components/messenger/profile/profile-screen.tsx`
- Validation:
  - `npx eslint src/components/messenger/profile/profile-screen.tsx src/app/api/sessions/route.ts src/lib/data-export.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.16 deep check — tighten session visibility metadata (device name/last-active derivation, i18n labels, and API documentation for `/api/sessions`).

- Task 1.16 (session metadata + i18n + docs hardening): completed and verified.
- Implemented:
  - improved `/api/sessions` payload quality:
    - added derived `deviceType` (`desktop|mobile|tablet|unknown`)
    - added derived `deviceName` (browser family)
    - removed fake metadata for non-current DB sessions (`lastActiveAt/ipAddress/userAgent` now `null` when unknown)
    - enriched current-session rows (including DB-matched current row) with real request-derived metadata
  - updated session helper types/mapping in `data-export`:
    - supports `deviceType`, `deviceName`, nullable `userAgent/ipAddress/lastActiveAt`
  - removed hardcoded English labels from devices dialog and moved session UI strings to i18n:
    - loading, revoke-all, revoking, expires, unknown, success/fail toasts
  - documented new sessions API surface in `API_DOCUMENTATION.md`:
    - `GET /sessions`
    - `DELETE /sessions` (single/all-others revoke)
- Files updated:
  - `src/app/api/sessions/route.ts`
  - `src/lib/data-export.ts`
  - `src/components/messenger/profile/profile-screen.tsx`
  - `src/lib/i18n.ts`
  - `API_DOCUMENTATION.md`
- Validation:
  - `npx eslint src/app/api/sessions/route.ts src/lib/data-export.ts src/components/messenger/profile/profile-screen.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.17 deep check — remove remaining session-related UI hardcodes (device naming fallback/localization edge cases) and add session-list UX polish (explicit “no other sessions” state).

- Task 1.17 (session dialog i18n/UX polish): completed and verified.
- Implemented:
  - removed remaining hardcoded dialog labels in sessions UI:
    - loading state
    - revoke-all button text
    - revoking state text
  - added explicit “no other active sessions” state when only current session exists.
  - added localized unknown-device fallback in the sessions list.
  - expanded translation keys for sessions UX in both EN/RU.
- Files updated:
  - `src/components/messenger/profile/profile-screen.tsx`
  - `src/lib/i18n.ts`
- Validation:
  - `npx eslint src/components/messenger/profile/profile-screen.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.18 deep check — chat pipeline continuation: finalize composer/attachment path (file send + render parity across message types) and remove remaining chat-level placeholders.

- Task 1.18 (chat composer placeholder cleanup, i18n hardening): partial completed and verified.
- Implemented:
  - removed hardcoded RU strings from sticker/GIF picker UI and moved them to i18n EN/RU:
    - search placeholders
    - tab labels
    - empty-state messages
    - GIF unavailable/error hints
    - sticker count labels
  - preserved current real send pipeline wiring for:
    - sticker select
    - GIF select
    - file/audio/image upload path
- Files updated:
  - `src/components/messenger/chat-view/stickers-gif-picker.tsx`
  - `src/lib/i18n.ts`
- Validation:
  - `npx eslint src/components/messenger/chat-view/stickers-gif-picker.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.18 (continue) — complete attachment/render parity audit for edge media cases (video-circle + unknown media fallback + composer validation UX).

- Task 1.18 (continue: attachment/render parity edge-cases): completed and verified.
- Implemented:
  - composer-side pre-validation for uploads before network call:
    - max file size guard (50MB)
    - allowed MIME type guard aligned with `/api/upload`
    - localized user-facing error toasts
  - message rendering parity improvements:
    - added dedicated video rendering path for `video-circle` messages
    - added unknown-media fallback card when `mediaUrl` exists but no explicit renderer matches
    - preserved existing image/audio/video/file rendering behavior
  - i18n extensions for new upload validation messages.
- Files updated:
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/components/messenger/chat-view/message-bubble.tsx`
  - `src/lib/i18n.ts`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx src/components/messenger/chat-view/message-bubble.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.19 deep check — connect message-input keyboard UX to explicit shortcut behavior (`Ctrl+Enter` send, `Shift+Enter` newline) and add composer draft preservation per chat.

- Task 1.19 (composer keyboard + drafts): completed and verified.
- Implemented:
  - keyboard behavior in composer is now explicit:
    - `Enter` send
    - `Ctrl+Enter` / `Cmd+Enter` send
    - `Shift+Enter` newline
  - per-chat draft persistence:
    - message draft stored by key `presidium:draft:{chatId}`
    - draft restored on chat reopen/switch
    - draft cleared after successful send
    - editing mode is isolated from draft buffer
- Files updated:
  - `src/components/messenger/chat-view/message-input.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
- Validation:
  - `npx eslint src/components/messenger/chat-view/message-input.tsx src/components/messenger/chat-view/chat-view.tsx src/components/messenger/chat-view/message-bubble.tsx src/lib/i18n.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.20 deep check — verify and harden realtime message-status transitions (`sending -> sent -> delivered -> read`) under reconnect/outbox replay scenarios.

- Task 1.20 (realtime status transition hardening): completed and verified.
- Implemented:
  - ACK status reliability in app shell:
    - `relay.ack / group_ack / channel_ack` now resolve `chatId` with fallback to `groupId/channelId` when `chatId` is absent.
  - Outbox replay now synchronizes local statuses after successful flush:
    - `ws_broadcast` success -> local status promoted to `sent`
    - `api_persist` success -> local status promoted to `sent`
    - `api_request` PATCH with `body.status` success -> local status synchronized to requested status
  - Message list merge logic hardened to prevent status downgrade on resync:
    - `setMessagesForChat` now merges duplicates by message id
    - keeps monotonic max status (`sending < sent < delivered < read`)
    - preserves richer payload fields (`media*`, `replyTo`, `forwardedFrom`, pin/edit flags)
- Files updated:
  - `src/app/page.tsx`
  - `src/store/use-app-store.ts`
- Validation:
  - `npx eslint src/app/page.tsx src/store/use-app-store.ts` passed
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.21 deep check — normalize inbound realtime status semantics (`relay.queue.delivered`, read receipts in grouped chats) and add regression coverage for status monotonicity during server resync.

- Task 1.21 (inbound status semantics + regression coverage): completed and verified.
- Implemented:
  - normalized inbound realtime status handling in app shell:
    - `relay.queue.delivered` now triggers `syncChats()` when deferred envelopes were delivered, keeping chat list metadata aligned after reconnect.
    - `read_receipt` handling now supports grouped/channel contexts via fallback chat resolution (`chatId` -> `groupId/channelId` -> member match).
    - `read_receipt` now supports both single `messageId` and batched `messageIds` payloads.
  - extended read-receipt transport in websocket hook:
    - `sendReadReceipt()` now routes by chat kind:
      - private -> `relay.envelope`
      - group -> `relay.group_envelope`
      - channel-like runtime chat -> `relay.channel_envelope`
  - added regression coverage for monotonic message status guarantees:
    - exported pure status helpers in store (`getHigherMessageStatus`, `mergeMessagesPreservingStatus`)
    - added unit tests for no-downgrade behavior during server resync and store status updates.
- Files updated:
  - `src/app/page.tsx`
  - `src/hooks/use-websocket.ts`
  - `src/store/use-app-store.ts`
  - `src/__tests__/message-status-merge.test.ts`
- Validation:
  - `npx eslint src/app/page.tsx src/hooks/use-websocket.ts src/store/use-app-store.ts src/__tests__/message-status-merge.test.ts` passed
  - `npm run -s test -- src/__tests__/message-status-merge.test.ts` passed (5/5)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.22 deep check — add dedicated UI signal for deferred-queue replay result (`relay.queue.delivered`) and close remaining realtime UX gaps (read-receipt visibility for group threads).

- Task 1.22 (queue replay UX signal + grouped read-receipt semantics): completed and verified.
- Implemented:
  - added dedicated relay queue replay runtime event:
    - new shared event constant `RELAY_QUEUE_DELIVERED_EVENT`
    - app shell now dispatches event with normalized payload `{ delivered, dropped, remaining }` on `relay.queue.delivered`.
  - improved reconnect consistency:
    - `relay.queue.delivered` now triggers chat sync when queued messages were delivered.
  - chat UI now shows explicit queue replay feedback banner:
    - ephemeral success/info line with delivered/remaining/dropped counters.
  - read-receipt transport extended by chat kind:
    - private chats -> `relay.envelope`
    - group chats -> `relay.group_envelope`
    - channel-like runtime chats -> `relay.channel_envelope`
  - i18n added for queue replay summary text (EN/RU).
- Files updated:
  - `src/lib/realtime-events.ts`
  - `src/app/page.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/hooks/use-websocket.ts`
  - `src/lib/i18n.ts`
- Validation:
  - `npx eslint src/app/page.tsx src/components/messenger/chat-view/chat-view.tsx src/lib/i18n.ts src/lib/realtime-events.ts src/hooks/use-websocket.ts src/store/use-app-store.ts src/__tests__/message-status-merge.test.ts` passed
  - `npm run -s test -- src/__tests__/message-status-merge.test.ts` passed (5/5)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.23 deep check — add automated coverage for queue-delivered UI event handling path and close residual realtime UX gaps (status badges/read markers in grouped threads).

- Task 1.23 (queue-delivered coverage + grouped read/status UX): completed and verified.
- Implemented:
  - moved queue-delivered normalization into shared realtime helper:
    - added `parseRelayQueueDeliveredPayload()`
    - added `shouldShowRelayQueueDeliveredBanner()`
  - app shell now uses normalized queue payload before dispatching relay queue event and sync trigger.
  - chat view now consumes normalized queue payload for banner logic (single source of truth).
  - added automated unit coverage for queue-delivered path:
    - new `src/__tests__/realtime-events.test.ts` with numeric/string/invalid payload scenarios.
  - improved outgoing status UX for grouped threads:
    - `MessageBubble` now supports optional status text label near status icon.
    - chat view enables this label for group/channel-like chats.
    - added i18n keys for status labels and status aria text.
  - removed dead, unused conversion code from chat view (`ApiMessageResponse` + old mapping helpers) to keep strict TS clean.
- Files updated:
  - `src/lib/realtime-events.ts`
  - `src/app/page.tsx`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/components/messenger/chat-view/message-bubble.tsx`
  - `src/lib/i18n.ts`
  - `src/__tests__/realtime-events.test.ts`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx src/components/messenger/chat-view/message-bubble.tsx src/lib/realtime-events.ts src/app/page.tsx src/lib/i18n.ts src/__tests__/realtime-events.test.ts` passed
  - `npm run -s test -- src/__tests__/realtime-events.test.ts src/__tests__/message-status-merge.test.ts` passed (9/9)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.24 deep check — add integration-level coverage for realtime inbound handlers in app shell (`relay.ack`, `read_receipt`, `relay.queue.delivered`) via extracted pure parser/dispatcher helpers and close remaining non-localized UX text in chat runtime banners.

- Task 1.24 (inbound realtime helper extraction + integration-grade coverage): completed and verified.
- Implemented:
  - extracted pure inbound realtime helpers into dedicated module:
    - `resolveAckStatusUpdate()`
    - `resolveFallbackGroupOrChannelId()`
    - `parseEnvelopeContent()`
    - `resolveReadReceiptUpdate()`
  - rewired app shell inbound handler (`src/app/page.tsx`) to use the helper module for:
    - `relay.ack / relay.group_ack / relay.channel_ack`
    - `read_receipt` envelope handling
    - fallback chat id resolution
  - kept runtime semantics unchanged while improving testability and reducing inline parsing complexity.
  - added focused automated coverage for inbound parsing/dispatch inputs:
    - new `src/__tests__/realtime-inbound.test.ts` (9 tests)
    - covers valid/malformed ack, fallback id precedence, envelope parsing, read-receipt id dedupe + fallback resolution.
- Files updated:
  - `src/lib/realtime-inbound.ts`
  - `src/app/page.tsx`
  - `src/__tests__/realtime-inbound.test.ts`
- Validation:
  - `npx eslint src/lib/realtime-inbound.ts src/app/page.tsx src/__tests__/realtime-inbound.test.ts` passed
  - `npm run -s test -- src/__tests__/realtime-inbound.test.ts src/__tests__/realtime-events.test.ts src/__tests__/message-status-merge.test.ts` passed (18/18)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.25 deep check — close remaining chat runtime localization gaps (hardcoded RU/EN strings in ChatView runtime toasts/errors) and add regression coverage for i18n-safe status/relay banners.

- Task 1.25 (chat runtime localization hardening + i18n regression coverage): completed and verified.
- Implemented:
  - removed remaining hardcoded runtime RU/EN strings from `ChatView` toast/error paths:
    - decrypt failure toast
    - E2E initialization/session/encryption/reinit error fallbacks
    - plaintext fallback warning after E2E failure
    - safety verification success toast
  - localized fail-closed moderation text generated in `moderateBeforeSend`:
    - fail-closed flag description and warning now use i18n key instead of inline EN text.
  - added new translation keys (EN/RU) for chat runtime/E2E/moderation messages:
    - `chat.decryptFailed`
    - `chat.e2eInitFailed`
    - `chat.e2eSessionFailed`
    - `chat.e2eEncryptFailed`
    - `chat.e2eReinitFailed`
    - `chat.sentWithoutEncryption`
    - `chat.contactVerified`
    - `moderation.serviceUnavailableBlocked`
  - added i18n regression coverage for chat runtime/status/relay banner keys:
    - new `src/__tests__/chat-runtime-i18n-keys.test.ts`.
  - fixed hook dependency hygiene after i18n wiring (`t` in relevant effect deps).
- Files updated:
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/lib/i18n.ts`
  - `src/__tests__/chat-runtime-i18n-keys.test.ts`
- Validation:
  - `npx eslint src/components/messenger/chat-view/chat-view.tsx src/lib/i18n.ts src/__tests__/chat-runtime-i18n-keys.test.ts` passed
  - `npm run -s test -- src/__tests__/chat-runtime-i18n-keys.test.ts src/__tests__/realtime-inbound.test.ts src/__tests__/realtime-events.test.ts src/__tests__/message-status-merge.test.ts` passed (19/19)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.26 deep check — finish chat runtime resilience for outbound retry UX (explicit per-message queued/retry indicator in message bubble, not only global outbox banner) and add tests for indicator state transitions.

- Task 1.26 (per-message queued/retry indicator + state transition coverage): completed and verified.
- Implemented:
  - added per-message outbox indicator model in outbox module:
    - `OutboxMessageIndicator`
    - `buildOutboxMessageIndicators(tasks, chatId)`
    - `getOutboxMessageIndicators(chatId)`
  - chat runtime now tracks outbox state per `messageId` for active chat and refreshes on every outbox update event.
  - message bubble now renders per-message queue state for outgoing messages:
    - `Queued`
    - `Retrying (N)`
    - with dedicated ARIA label for accessibility.
  - i18n coverage extended for queue indicator labels/aria in EN/RU.
  - regression tests added for indicator state transitions and grouping behavior.
- Files updated:
  - `src/lib/message-outbox.ts`
  - `src/components/messenger/chat-view/chat-view.tsx`
  - `src/components/messenger/chat-view/message-bubble.tsx`
  - `src/lib/i18n.ts`
  - `src/__tests__/message-outbox-indicators.test.ts`
  - `src/__tests__/chat-runtime-i18n-keys.test.ts`
- Validation:
  - `npx eslint src/lib/message-outbox.ts src/components/messenger/chat-view/chat-view.tsx src/components/messenger/chat-view/message-bubble.tsx src/lib/i18n.ts src/__tests__/message-outbox-indicators.test.ts src/__tests__/chat-runtime-i18n-keys.test.ts` passed
  - `npm run -s test -- src/__tests__/message-outbox-indicators.test.ts src/__tests__/chat-runtime-i18n-keys.test.ts src/__tests__/realtime-inbound.test.ts src/__tests__/realtime-events.test.ts src/__tests__/message-status-merge.test.ts` passed (23/23)
  - `npm run -s typecheck` passed
  - `npm run -s build` passed

Next action: Stage 1 task 1.27 deep check — close message lifecycle UX by surfacing offline/queued reason on failed persistence paths and adding deterministic tests for outbox dedupe/retry backoff behavior.
