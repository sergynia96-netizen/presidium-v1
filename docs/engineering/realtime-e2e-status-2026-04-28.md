# Presidium Realtime / E2E Stabilization Status

**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Scope:** production relay, WebSocket lifecycle, E2E delivery bridge, pre-key exchange  
**Status:** stabilized transition layer; full Postgres migration still open

---

## 1. Executive summary

The project previously had two competing relay/backend paths:

```text
mini-services/relay-backend
services/relay
```

The production Docker stack now targets the monorepo relay:

```text
services/relay
```

The current web application still uses the legacy root Prisma/SQLite model for users/chats, including non-UUID `cuid()` identifiers. The relay uses the canonical Drizzle/PostgreSQL model with UUID identifiers.

To make encrypted realtime messaging work before the full data-model migration, a compatibility bridge has been added between the current web client and `services/relay`.

---

## 2. Stabilized areas

### 2.1 Production relay selection

The root Docker Compose stack now builds relay from:

```yaml
relay:
  build:
    context: .
    dockerfile: services/relay/Dockerfile
```

The legacy mini-service relay remains in the repository only for migration history.

### 2.2 Relay Docker build

`services/relay/Dockerfile` builds from root monorepo context because `@presidium/relay` depends on workspace packages from `packages/*`.

The Dockerfile builds workspace dependencies before building relay:

```text
@presidium/shared-types
@presidium/shared-api
@presidium/shared-crypto
@presidium/relay
```

### 2.3 WebSocket authentication

The production relay now supports two auth modes:

1. query-token auth for native/service clients;
2. post-connect auth for browser clients:

```json
{
  "type": "auth",
  "payload": {
    "token": "JWT"
  }
}
```

After successful auth, the relay emits:

```text
auth.success
connected
```

`auth.success` is canonical. `connected` is emitted for compatibility with the current web client.

### 2.4 Relay JWT compatibility

The web route:

```text
/api/relay/token
```

now issues tokens compatible with the relay verifier:

```text
issuer: presidium-api
audience: presidium-relay
```

### 2.5 WebSocket connection lifecycle

`src/lib/websocket-manager.ts` has been hardened:

1. one shared browser-tab socket;
2. explicit open timeout;
3. no false successful open resolves;
4. reconnect timer deduplication;
5. manual disconnect cancels reconnect;
6. stale socket callbacks are ignored;
7. keepalive ping frames are compatible with the relay.

### 2.6 Outgoing encrypted message protocol

The web client no longer sends legacy delivery messages as:

```text
relay.envelope
```

It now sends:

```text
chat.message
```

The E2E encrypted envelope remains opaque to the relay and is wrapped as:

```ts
{
  type: 'chat.message',
  payload: {
    chatId,
    recipientId,
    encryptedPayload: JSON.stringify(envelope),
    nonce: envelope.iv,
    type: 'text',
    clientTimestamp: envelope.timestamp,
    id: envelope.messageId,
  }
}
```

### 2.7 Incoming encrypted message protocol

Incoming `chat.message` events are unwrapped by the web client:

```ts
envelope = JSON.parse(payload.encryptedPayload)
```

The result is passed into the existing E2E decrypt path.

### 2.8 Message ack handling

The web client now supports relay `chat.ack` and normalizes it into the existing local ack flow so pending message promises can resolve.

### 2.9 Typing/read events

The web client now sends production relay event types:

```text
chat.typing
chat.read
```

Incoming relay events are normalized back to the current UI-level event shapes.

### 2.10 Legacy chat ID transport fallback

The relay now handles two paths:

#### Canonical path

```text
UUID chatId → Postgres chat_members validation → metadata insert → Redis delivery
```

#### Compatibility path

```text
legacy cuid chatId → recipientId transport fallback → Redis delivery/offline queue
```

This is required because the current root web app still creates chats through the legacy Prisma/SQLite model.

### 2.11 Legacy user ID compatibility

Relay HTTP auth middleware now tolerates non-UUID web user IDs after verifying the relay JWT cryptographically.

For legacy web users, it sets:

```text
auth.source = legacy-web
```

For UUID relay users, it uses the canonical Postgres user lookup.

### 2.12 Pre-key exchange

The relay now exposes compatibility endpoints for the current web E2E client:

```text
POST /api/keys/upload
GET  /api/keys/:userId
```

The same routes are also mounted at:

```text
/keys/*
```

Pre-key bundles are stored in Redis as a transition layer.

The final target is Postgres-backed pre-key storage after the user/chat API migration.

### 2.13 Keepalive compatibility

The relay WebSocket handler now accepts keepalive frames without a payload:

```json
{
  "type": "ping",
  "timestamp": 0
}
```

It no longer rejects them as malformed messages.

---

## 3. Current expected realtime/E2E flow

```text
1. user logs in through current web app
2. web requests /api/relay/token
3. relay JWT is issued with relay-compatible issuer/audience
4. WebSocket opens
5. web sends post-connect auth payload
6. relay validates token and registers socket/presence in Redis
7. web uploads pre-key bundle to /api/keys/upload
8. peer fetches /api/keys/:userId
9. E2E session is created client-side
10. sender creates EncryptedEnvelope
11. sender sends chat.message with encryptedPayload
12. relay uses canonical Postgres path if chatId is UUID and membership exists
13. relay uses transport fallback if chatId is legacy cuid/non-canonical
14. recipient receives chat.message
15. recipient unwraps encryptedPayload to EncryptedEnvelope
16. recipient decrypts locally
17. sender receives chat.ack
```

---

## 4. Known transition debt

### 4.1 Root web app still owns users/chats through Prisma/SQLite

Current web app models are not yet migrated to the canonical relay/Postgres schema.

This is why the relay contains temporary compatibility code for:

```text
legacy web user IDs
legacy cuid chat IDs
recipientId transport fallback
Redis pre-key storage
```

### 4.2 Transport fallback does not persist canonical message metadata

When relay fallback is used, the message is delivered/offline-queued through Redis but not inserted into the canonical Postgres `messages` table.

This is acceptable for the transition phase because the current web app still keeps local encrypted history in IndexedDB.

### 4.3 Typing/read for legacy chats is intentionally limited

Typing and read receipts are canonical Postgres-chat features. For legacy `cuid` chats, relay avoids Postgres membership checks and may ignore these secondary events until chat migration is complete.

### 4.4 Pre-key storage is Redis-backed temporarily

Redis pre-key storage is sufficient for transition testing but should become Postgres-backed before production hardening.

### 4.5 Build/runtime checks still required locally

The changes were committed through GitHub API. A local or CI validation pass is required:

```bash
pnpm install
pnpm --filter @presidium/shared-types build
pnpm --filter @presidium/shared-api build
pnpm --filter @presidium/shared-crypto build
pnpm --filter @presidium/relay typecheck
pnpm --filter @presidium/relay build
pnpm typecheck
pnpm build
docker compose config
docker compose build relay
```

---

## 5. Recommended next engineering phase

### Phase A — validation

1. Run relay typecheck/build.
2. Run frontend typecheck/build.
3. Build relay Docker image.
4. Run browser smoke test with two users.

### Phase B — canonical data migration

1. Introduce canonical user sync from web auth to relay Postgres.
2. Migrate chat creation to relay/Postgres UUID chats.
3. Migrate chat membership creation to relay `chat_members`.
4. Move pre-key storage from Redis to Postgres.
5. Remove transport fallback once canonical path is verified.

### Phase C — production hardening

1. Add automated realtime smoke tests.
2. Add relay integration tests for auth, pre-key upload/fetch, chat.message, offline delivery.
3. Add structured audit logging without leaking encrypted payloads or secrets.
4. Rotate and document required secrets.
5. Add CI job for monorepo typecheck/build/docker config.

---

## 6. Engineering rule

Until the canonical data migration is complete:

```text
one scope → one commit → verify → next step
```

No broad feature work should be layered on top of realtime messaging until the validation phase passes.
