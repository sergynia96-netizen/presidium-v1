# Presidium Realtime / E2E Smoke Test Checklist

**Status:** manual validation spec  
**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Scope:** web app ↔ relay ↔ E2E messaging path

---

## 1. Purpose

This checklist validates the minimum realtime encrypted messaging path for Presidium after the relay protocol stabilization work.

The test must confirm that two users can:

1. authenticate in the web app;
2. obtain relay JWTs;
3. connect to `services/relay` through WebSocket;
4. upload/fetch pre-key bundles;
5. create an E2E session;
6. send an encrypted message;
7. receive the message through relay;
8. decrypt and render it locally;
9. receive acknowledgement from relay;
10. recover queued messages after reconnect/offline state.

---

## 2. Required environment

Run from the repository root.

Required services:

```bash
docker compose up -d db redis minio relay
```

Required application processes:

```bash
pnpm install
pnpm dev
```

Recommended validation commands before browser smoke test:

```bash
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

Expected relay health:

```bash
curl http://localhost:3001/health
```

Expected result:

```json
{
  "status": "ok"
}
```

---

## 3. Test accounts

Use two real web accounts:

```text
User A: sender
User B: recipient
```

Recommended browser setup:

```text
Browser 1 / Profile 1: User A
Browser 2 / Profile 2: User B
```

Do not run both users in the same browser profile/session.

---

## 4. Browser console instrumentation

Open DevTools console for both users.

Expected useful log markers:

```text
[WSManager] Connecting to ...
[WSManager] Connected
[RelayE2EClient] Token: present (... chars)
[RelayE2EClient] Auth response: ...
[E2EChatIntegration] Pre-key bundle uploaded to relay
```

Errors to watch for:

```text
AUTH_INVALID_TOKEN
AUTH_USER_NOT_FOUND
PREKEY_BUNDLE_NOT_FOUND
NOT_MEMBER
INVALID_FORMAT
Message send timeout
WebSocket open timeout
Relay auth is temporarily blocked
Invalid encrypted relay chat payload
```

---

## 5. Relay token validation

For both users, verify that the web app can issue a relay token.

Browser console:

```js
await fetch('/api/relay/token', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
}).then(r => r.json())
```

Expected:

```json
{
  "token": "...",
  "expiresIn": 7200,
  "issuer": "presidium-api",
  "audience": "presidium-relay"
}
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| `401 Unauthorized` | User is not logged in or NextAuth session is unavailable |
| `429 Too many token requests` | Rate limit was hit |
| `500 JWT secret is not configured` | Missing `JWT_SECRET`, `RELAY_JWT_SECRET`, or `NEXTAUTH_SECRET` |

---

## 6. WebSocket authentication validation

The web app should connect automatically through `RelayE2EClient`.

Expected connection flow:

```text
Browser opens ws://localhost:3001/ws
Relay sends auth.required
Client sends { type: "auth", payload: { token } }
Relay sends auth.success
Relay sends connected
Client marks relay connected
```

Expected console signs:

```text
[WSManager] Connected
[RelayE2EClient] Auth response: {"type":"auth.success",...}
```

Acceptable compatibility sign:

```text
[RelayE2EClient] Auth response: {"type":"connected",...}
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| `auth_required` after client auth | Auth payload did not reach relay or was malformed |
| `Authentication failed` | JWT signature/issuer/audience/expiry mismatch |
| `WebSocket closed before open` | Relay not running or CORS/network/runtime issue |
| repeated reconnect | Auth or URL mismatch |

---

## 7. Pre-key upload validation

After E2E initialization, each user should upload their pre-key bundle.

Expected web client call:

```text
POST http://localhost:3001/api/keys/upload
Authorization: Bearer <relay JWT>
```

Expected response:

```json
{
  "success": true,
  "data": {
    "userId": "...",
    "uploadedAt": 0,
    "oneTimePreKeyCount": 0,
    "ttlSeconds": 2592000
  }
}
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| `AUTH_MISSING` | Authorization header was not attached |
| `AUTH_INVALID_TOKEN` | Relay token verifier mismatch |
| `VALIDATION_ERROR` | Client upload format does not match relay schema |

---

## 8. Pre-key fetch validation

From User A context, fetch User B bundle.

Expected web client call:

```text
GET http://localhost:3001/api/keys/<userBId>
Authorization: Bearer <relay JWT>
```

Expected response shape:

```json
{
  "identityKey": "...",
  "signedPreKey": {
    "keyId": 0,
    "publicKey": "...",
    "signature": "..."
  },
  "oneTimePreKeys": [
    {
      "keyId": 0,
      "publicKey": "..."
    }
  ],
  "userId": "...",
  "uploadedAt": 0
}
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| `404 PREKEY_BUNDLE_NOT_FOUND` | Recipient has not initialized/uploaded E2E keys yet |
| `500 PREKEY_BUNDLE_CORRUPTED` | Redis bundle format is invalid |

---

## 9. Online message delivery test

### 9.1 Setup

1. Keep User A and User B both online.
2. Open the same one-to-one chat from both sessions.
3. Make sure both consoles show relay connected.

### 9.2 Action

User A sends:

```text
Smoke test message A→B <timestamp>
```

### 9.3 Expected sender behavior

User A should see message status progress:

```text
pending/sending → sent/delivered
```

Expected relay ack:

```json
{
  "type": "chat.ack",
  "payload": {
    "clientId": "...",
    "status": "delivered" | "sent",
    "mode": "postgres_metadata" | "transport_fallback"
  }
}
```

For current legacy web chats, this is acceptable:

```text
mode: transport_fallback
```

### 9.4 Expected recipient behavior

User B should receive a `chat.message`, unwrap `encryptedPayload`, decrypt locally, and display the plaintext message.

Expected successful path:

```text
relay chat.message received
EncryptedEnvelope parsed
decrypt path succeeds
message appears in chat UI
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| `Message send timeout` | Sender did not receive chat.ack |
| `Invalid encrypted relay chat payload` | Relay payload could not be parsed back into EncryptedEnvelope |
| message appears as encrypted fallback | Decrypt path/session setup failed |
| `PREKEY_BUNDLE_NOT_FOUND` | Sender could not establish E2E session |

---

## 10. Reverse online delivery test

Repeat the same test from User B to User A.

User B sends:

```text
Smoke test message B→A <timestamp>
```

Expected result:

```text
User A receives and decrypts the message
User B receives chat.ack
```

Both directions must work.

---

## 11. Offline queue delivery test

### 11.1 Setup

1. User A remains online.
2. User B closes browser tab or disconnects network.
3. Wait 5–10 seconds.

### 11.2 Action

User A sends:

```text
Offline queue smoke test A→B <timestamp>
```

### 11.3 Expected sender behavior

Relay may return:

```text
status: sent
offlineCount: 1
```

### 11.4 Reconnect recipient

User B reconnects/logs in again.

Expected result:

```text
relay drains offline:<userBId>
queued chat.message is delivered
User B decrypts and sees the message
```

Failure interpretation:

| Failure | Meaning |
|---|---|
| no message on reconnect | offline Redis queue was not written or not drained |
| duplicate messages | local/offline dedup issue |
| decrypt failure | session/pre-key mismatch |

---

## 12. Typing/read receipt smoke check

Typing/read are secondary. They must not break message delivery.

### 12.1 Typing

User A starts typing in a chat.

Expected client event:

```text
chat.typing
```

For legacy `cuid` chats, relay may ignore typing events until canonical chat migration.

### 12.2 Read receipt

User B reads a received message.

Expected client event:

```text
chat.read
```

For legacy `cuid` chats, relay may return:

```text
status: ignored_legacy_chat
mode: transport_fallback
```

This is acceptable during transition.

---

## 13. Pass/fail criteria

### Required pass

```text
/api/relay/token works for both users
WebSocket auth works for both users
pre-key upload works for both users
pre-key fetch works sender→recipient
A→B online encrypted message displays decrypted
B→A online encrypted message displays decrypted
sender receives chat.ack
offline queue delivers after reconnect
```

### Acceptable transition behavior

```text
chat.ack mode = transport_fallback
read receipt ignored for legacy chats
typing ignored for legacy chats
message metadata not persisted in relay Postgres when fallback path is used
```

### Not acceptable

```text
message send timeout
pre-key bundle validation error
relay auth failure
recipient never receives message
recipient receives but cannot parse EncryptedEnvelope
reconnect storm
Postgres UUID-cast errors for legacy cuid IDs
```

---

## 14. Debug commands

Relay logs:

```bash
docker compose logs -f relay
```

Redis inspect examples:

```bash
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" keys 'prekeys:*'
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" keys 'offline:*'
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" keys 'presence:*'
```

Health:

```bash
curl http://localhost:3001/health
```

Docker rebuild:

```bash
docker compose build relay
docker compose up -d relay
```

---

## 15. Next automation target

After manual validation passes, create an automated integration test for:

```text
relay token fixture → two WebSocket clients → auth → pre-key upload/fetch → chat.message → chat.ack → offline queue
```

This should become a CI gate before removing compatibility bridges.
