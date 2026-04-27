# Presidium Relay Protocol Alignment

**Status:** Accepted architecture decision  
**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Scope:** Web client ↔ production relay realtime messaging protocol

---

## 1. Purpose

Presidium currently has a working E2E client layer and a new production relay service, but their WebSocket protocols are not aligned yet. This document defines the canonical relay protocol and the migration plan required to make realtime encrypted messaging work reliably between users.

The goal is not to redesign the cryptography. The goal is to add a strict adapter layer between the existing E2E envelope model and the production relay message model.

---

## 2. Current production relay behavior

The canonical backend relay is:

```text
services/relay
```

The legacy relay:

```text
mini-services/relay-backend
```

is kept only for migration history and must not be used by the production Docker stack.

### 2.1 WebSocket authentication

The production relay performs authentication during the WebSocket upgrade phase. The JWT must be present in the connection URL:

```text
/ws?token=<JWT>
```

If the token is missing or invalid, the relay rejects the upgrade with `401 Unauthorized`.

### 2.2 Successful connection event

After successful upgrade/open, the production relay sends:

```json
{
  "type": "auth.success",
  "payload": {
    "userId": "...",
    "deviceId": "...",
    "tier": "free",
    "serverTime": 0
  },
  "timestamp": 0
}
```

### 2.3 Accepted WebSocket message types

The production relay router accepts the following message types:

```text
chat.message
chat.read
chat.typing
call.signal
story.view
presence.update
ping
```

Unknown message types are rejected with an error response.

### 2.4 Chat message payload expected by relay

For encrypted chat delivery, the backend handler expects:

```json
{
  "type": "chat.message",
  "payload": {
    "chatId": "uuid",
    "encryptedPayload": "opaque encrypted string",
    "nonce": "string",
    "type": "text",
    "replyTo": "optional-message-id",
    "clientTimestamp": 0,
    "id": "client-message-id"
  }
}
```

The relay treats `encryptedPayload` as opaque ciphertext. It stores metadata, validates membership, queues moderation metadata asynchronously, and delivers the encrypted payload to online or offline recipients.

---

## 3. Current frontend E2E behavior

The current frontend E2E client uses an `EncryptedEnvelope` model with fields such as:

```text
messageId
senderId
recipientId
ciphertext
iv
tag
header
timestamp
x3dhInitiate
```

It currently attempts to:

1. open the WebSocket without a token in the URL;
2. send a post-connect auth message `{ type: "auth", payload: { token } }`;
3. wait for a `connected` message;
4. send encrypted messages as `{ type: "relay.envelope", payload: ... }`.

That protocol belongs to the earlier relay design and is not compatible with `services/relay`.

---

## 4. Confirmed incompatibilities

### 4.1 Authentication mismatch

Frontend expects post-connect authentication. Backend requires query-token authentication during upgrade.

**Result:** WebSocket upgrade can fail before the frontend sends the auth payload.

### 4.2 Connection success event mismatch

Frontend expects:

```text
connected
```

Backend sends:

```text
auth.success
```

**Result:** even if the socket opens, the frontend may never mark relay as connected.

### 4.3 Message type mismatch

Frontend sends:

```text
relay.envelope
```

Backend accepts:

```text
chat.message
```

**Result:** backend rejects outgoing messages as unknown message types.

### 4.4 Payload model mismatch

Frontend sends a recipient-centric E2E envelope. Backend expects a chat-centric relay payload:

```text
chatId + encryptedPayload + nonce
```

**Result:** even after message type alignment, the payload must be adapted before delivery works.

---

## 5. Canonical protocol decision

The canonical realtime protocol for Presidium v1 is the production relay protocol implemented by:

```text
services/relay
```

The frontend must adapt to the relay protocol instead of the relay accepting multiple legacy protocols.

Reasoning:

1. `services/relay` is the monorepo production backend.
2. It already contains membership validation, PostgreSQL metadata storage, Redis delivery, offline queueing, presence, and moderation queue integration.
3. It matches the long-term architecture better than the legacy `relay.envelope` model.
4. A frontend adapter preserves the existing E2E encryption model without weakening cryptographic boundaries.

---

## 6. Adapter strategy

The existing `EncryptedEnvelope` remains the client-side E2E cryptographic envelope.

Before sending to relay, the frontend wraps it into the backend chat message payload:

```ts
{
  type: 'chat.message',
  payload: {
    chatId,
    encryptedPayload: JSON.stringify(envelope),
    nonce: envelope.iv,
    type: 'text',
    clientTimestamp: envelope.timestamp,
    id: envelope.messageId,
  },
}
```

On receiving a backend `chat.message`, the frontend unwraps:

```ts
envelope = JSON.parse(payload.encryptedPayload)
```

and passes the `EncryptedEnvelope` back to the existing decrypt path.

This keeps relay storage and transport chat-centric while leaving E2E cryptography client-owned.

---

## 7. Migration plan

### Commit 1 — WebSocket authentication alignment

**Goal:** make the frontend connect to `services/relay` successfully.

Changes:

1. Fetch relay JWT before opening the WebSocket.
2. Append token to the WebSocket URL:

```text
/ws?token=<JWT>
```

3. Stop sending `{ type: "auth" }` after connect.
4. Treat `auth.success` as the successful authenticated connection event.
5. Preserve existing auth retry/backoff behavior.

Expected result:

```text
WebSocket opens → relay sends auth.success → frontend marks relay connected
```

### Commit 2 — Outgoing message type alignment

**Goal:** stop sending legacy `relay.envelope` messages.

Changes:

1. Replace outgoing message type with `chat.message`.
2. Keep E2E envelope creation untouched.
3. Add an explicit adapter function that converts `EncryptedEnvelope` to relay chat payload.
4. Keep old method names where useful to reduce UI churn.

Expected result:

```text
frontend sends chat.message → relay router accepts the message
```

### Commit 3 — Incoming message adapter

**Goal:** support messages delivered by the production relay.

Changes:

1. Accept incoming `chat.message` events from relay.
2. Parse `payload.encryptedPayload` as `EncryptedEnvelope`.
3. Emit the existing frontend `message` event shape so `E2EChatIntegration` can decrypt without broad refactor.
4. Preserve compatibility with locally stored `EncryptedEnvelope` history.

Expected result:

```text
recipient receives chat.message → frontend extracts envelope → decrypt path runs
```

### Commit 4 — Typing and read receipt alignment

**Goal:** align secondary chat realtime events.

Changes:

1. Replace `typing.start` / `typing.stop` with `chat.typing`.
2. Replace `message_read` with `chat.read`.
3. Normalize incoming typing/read events to existing UI event shapes if required.

Expected result:

```text
typing and read receipts flow through production relay
```

---

## 8. Non-goals

This migration must not:

1. rewrite E2E cryptography;
2. remove IndexedDB/local message history;
3. redesign chat UI;
4. remove legacy relay files in the same commit;
5. add cloud AI moderation behavior;
6. change marketplace/admin/feed functionality.

---

## 9. Validation checklist

After the migration, the following must pass:

```text
1. user A obtains relay token
2. user A opens /ws?token=<JWT>
3. relay sends auth.success
4. frontend marks relay connected
5. user B connects the same way
6. user A sends chat.message with encryptedPayload
7. relay stores metadata and returns chat.ack
8. user B receives chat.message
9. user B unwraps encryptedPayload to EncryptedEnvelope
10. user B decrypts and displays message
11. offline user receives queued message after reconnect
```

---

## 10. Engineering rule

Every implementation step must be shipped as a small, reviewable commit:

```text
one scope → one commit → verify → next step
```

No broad refactors until the realtime message path is stable.
