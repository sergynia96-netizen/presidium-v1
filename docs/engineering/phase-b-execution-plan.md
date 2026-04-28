# Phase B Execution Plan — Canonical Users/Chats Migration

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B  
**Status:** planned, not yet implemented  
**Maintainer:** Sergey Karnaukh  

---

## 1. Purpose

Phase B migrates the active messaging foundation from legacy web-owned Prisma/SQLite identities to canonical relay/Postgres identities.

This phase is required before implementing major user-facing features such as:

```text
voice messages
media attachments
stories
video notes
audio/video calls
local AI routing
recommendations
marketplace production flows
```

The goal is not to add visible features. The goal is to remove architectural instability from the core messenger.

---

## 2. Current technical state

Current stabilized transition path:

```text
web app login/session
        ↓
relay-compatible JWT
        ↓
services/relay WebSocket auth
        ↓
pre-key compatibility routes
        ↓
chat.message
        ↓
canonical path or transport_fallback
```

Current temporary bridges:

```text
legacy web user IDs: cuid()
legacy web chat IDs: cuid()
relay users: UUID in Postgres
relay chats: UUID in Postgres
pre-key bundles: Redis transition storage
legacy message delivery: recipientId transport_fallback
```

These bridges are useful but temporary. They must not become permanent architecture.

---

## 3. Phase B issue breakdown

Phase B parent:

```text
Issue #3 — Phase B: migrate users and chats to canonical relay/Postgres schema
```

Implementation children:

```text
Issue #4 — Phase B1: canonical user identity bridge
Issue #5 — Phase B2: private chat creation to relay/Postgres UUID chats
Issue #6 — Phase B3: canonical message delivery path
Issue #7 — Phase B4: pre-key storage from Redis to Postgres
Issue #8 — Phase B5: instrument/deprecate transport_fallback
```

---

## 4. Execution order

### Step 0 — Phase A smoke-test remains required

Before heavy runtime implementation, complete or at least attempt:

```text
Issue #2 — realtime/E2E smoke test
```

If no PC/VPS is available, Phase B can still be specified and prepared, but runtime migration code should wait for validation capacity.

### Step 1 — User identity bridge

Implement Issue #4 first.

Reason:

```text
No canonical chat can exist without canonical users.
```

Deliverables:

```text
canonical relay user UUID resolution
safe user upsert/sync
legacy user compatibility preserved
relay JWT path prepared for canonical user ID
```

### Step 2 — Canonical private chat creation

Implement Issue #5 after Issue #4.

Reason:

```text
chat_members requires canonical user IDs for both participants.
```

Deliverables:

```text
new private chat ID is UUID
chats row exists
chat_members rows exist
web UI receives UUID chatId
legacy chats still do not crash
```

### Step 3 — Canonical message delivery

Implement Issue #6 after Issue #5.

Reason:

```text
message delivery must pass relay membership validation against canonical chat_members.
```

Deliverables:

```text
chat.ack.mode = postgres_metadata
message metadata inserted in relay Postgres
encrypted payload remains opaque
recipient receives and decrypts locally
```

### Step 4 — Pre-key Postgres persistence

Implement Issue #7 after user identity is canonical.

Reason:

```text
pre-key storage must be keyed by canonical user identity.
```

Deliverables:

```text
identity public keys in Postgres
signed pre-keys in Postgres
one-time pre-keys in Postgres
Redis no longer primary for canonical users
```

### Step 5 — Fallback instrumentation/deprecation

Implement Issue #8 throughout Phase B, finalized after Issues #4-#7.

Reason:

```text
fallback must be observable before it can be safely removed.
```

Deliverables:

```text
fallback reason logs
no payload plaintext logs
unexpected fallback warning for canonical chats
legacy fallback retained only where needed
```

---

## 5. Non-negotiable constraints

### 5.1 No plaintext server access

The relay must never decrypt private messages.

Allowed:

```text
encryptedPayload storage
metadata storage
public key material storage
membership checks
rate limit signals
```

Forbidden:

```text
server-side private message plaintext scanning
plaintext message logs
admin plaintext access to private messages
```

### 5.2 No hidden fallback for new canonical chats

After Phase B2/B3, a new private chat with UUID IDs must not silently fall back.

If fallback happens unexpectedly, it must be visible through:

```text
log marker
ack mode
fallback reason
```

### 5.3 No broad rewrites

Every implementation must be small and reversible.

Preferred pattern:

```text
one issue
one focused change set
CI green
smoke check
next issue
```

---

## 6. Required validation gates

### Gate A — Active CI

Must remain green after each implementation step:

```text
shared packages build
relay typecheck
relay build
web typecheck
web build
docker compose config
```

### Gate B — Auth validation

After Issue #4:

```text
web session resolves canonical relay user
relay token remains valid
legacy user fallback does not crash
```

### Gate C — Chat creation validation

After Issue #5:

```text
new private chat ID is UUID
chat_members contains both participants
legacy chat list still renders
```

### Gate D — Message validation

After Issue #6:

```text
A→B encrypted message passes
B→A encrypted message passes
chat.ack.mode = postgres_metadata for new chats
recipient decrypts locally
```

### Gate E — Pre-key validation

After Issue #7:

```text
pre-key upload writes to Postgres
pre-key fetch reads from Postgres
Redis fallback still works only for legacy path
```

### Gate F — Fallback validation

After Issue #8:

```text
fallback is observable
canonical chats do not fallback silently
no encrypted payload/plaintext/secrets in logs
```

---

## 7. Risk register

### Risk 1 — Duplicate user identities

Cause:

```text
same web user creating multiple relay users
```

Mitigation:

```text
unique legacy identity mapping
idempotent upsert
explicit conflict handling
```

### Risk 2 — Existing chats break

Cause:

```text
web UI expects legacy cuid chat IDs
```

Mitigation:

```text
legacy compatibility retained during transition
new chat creation moved first
old chat migration deferred
```

### Risk 3 — Membership mismatch

Cause:

```text
chat_members not created or user ID mismatch
```

Mitigation:

```text
atomic chat + member creation
strict validation
smoke test with two users
```

### Risk 4 — Pre-key lookup mismatch

Cause:

```text
pre-keys stored by legacy user ID while chat uses canonical UUID
```

Mitigation:

```text
Phase B1 identity mapping before Phase B4 key persistence
compatibility fallback during migration
```

### Risk 5 — Hidden fallback masks broken canonical path

Cause:

```text
relay falls back instead of failing loudly for new UUID chats
```

Mitigation:

```text
fallback instrumentation
unexpected fallback warning
ack mode assertions in smoke test
```

---

## 8. Rollback strategy

Every Phase B change must preserve the current compatibility path until the replacement path is validated.

Rollback rule:

```text
if canonical path fails, legacy fallback must still allow basic messaging
```

Do not remove:

```text
legacy auth compatibility
legacy chat fallback
Redis pre-key fallback
```

until Phase B exit criteria pass.

---

## 9. Phase B exit criteria

Phase B is complete only when:

```text
new private chats use UUID ids
canonical relay users exist
chat_members exists for participants
new private chat messages use postgres_metadata mode
pre-key storage is Postgres-backed for canonical users
transport_fallback is not used for normal new private chats
active CI is green
manual two-user smoke test passes
no plaintext/private content leaks are introduced
```

---

## 10. What must wait until after Phase B

Do not implement until Phase B is stable:

```text
voice messages
media attachments
stories
video notes
audio/video calls
recommendation ranking
local AI routing
Qwen fine-tuning
marketplace payment flows
```

These features depend on a stable identity/chat/membership foundation.
