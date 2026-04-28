# Phase B3 Message Delivery Contract

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B3  
**Issue:** #6 — route new private chat messages through canonical membership path  
**Status:** contract/specification, not yet implemented  

---

## 1. Purpose

Phase B3 moves encrypted message delivery for new canonical private chats from the temporary `transport_fallback` path to the canonical relay/Postgres membership path.

The target delivery mode for new UUID private chats is:

```text
chat.ack.mode = postgres_metadata
```

This phase does not decrypt private messages and must not weaken E2EE.

---

## 2. Dependency chain

Phase B3 depends on Phase B1 and Phase B2.

Required from Phase B1:

```text
web user resolves canonical relay user UUID
relay JWT subject can be canonical UUID
legacy identity remains mapped safely
```

Required from Phase B2:

```text
new private chat ID is UUID
relay Postgres `chats` row exists
relay Postgres `chat_members` rows exist for both participants
frontend sends canonical UUID chatId for new chats
```

Do not implement B3 before B1/B2 contracts are respected.

---

## 3. Current delivery modes

The relay currently supports two delivery modes.

### 3.1 Canonical path

```text
UUID chatId
  ↓
chat_members membership check
  ↓
messages metadata insert in Postgres
  ↓
Redis publish/offline queue
  ↓
chat.ack.mode = postgres_metadata
```

### 3.2 Compatibility path

```text
legacy cuid chatId or membership failure
  ↓
recipientId transport fallback
  ↓
Redis publish/offline queue
  ↓
chat.ack.mode = transport_fallback
```

The compatibility path is temporary and exists only because old web chats still use legacy `cuid()` identifiers.

---

## 4. Target behavior for new private chats

For every new private chat created after Phase B2:

```text
chatId must be UUID
senderId must be canonical relay UUID
recipient must be a chat member
relay membership check must pass
message metadata must be inserted into Postgres
chat.ack.mode must be postgres_metadata
```

The relay must not silently use `transport_fallback` for a valid canonical UUID chat.

---

## 5. Message event contract

Frontend sends:

```ts
{
  type: 'chat.message',
  payload: {
    chatId: string,              // UUID for new canonical private chats
    recipientId?: string,        // allowed for legacy/fallback compatibility
    encryptedPayload: string,    // opaque JSON-serialized E2E envelope
    nonce: string,
    type: 'text' | string,
    clientTimestamp: number,
    id: string                   // client message id
  }
}
```

For canonical chats:

```text
chatId = UUID
recipientId may be present but must not be required for delivery
```

For legacy chats:

```text
chatId = cuid
recipientId is required for transport_fallback
```

---

## 6. Relay canonical processing contract

For canonical UUID `chatId`, relay processing must follow this order:

```text
1. validate required payload fields
2. deduplicate by senderId + client message id
3. verify chatId is UUID
4. verify sender membership in chat_members
5. insert message metadata into messages table
6. fetch other chat members
7. deliver to online members through Redis pub/sub
8. queue offline members in Redis offline list
9. update status if delivered
10. send chat.ack to sender
```

Required ack shape:

```json
{
  "type": "chat.ack",
  "payload": {
    "messageId": "server-message-uuid",
    "clientId": "client-message-id",
    "status": "sent-or-delivered",
    "deliveredCount": 0,
    "offlineCount": 0,
    "totalMembers": 1,
    "processingTimeMs": 0,
    "mode": "postgres_metadata"
  }
}
```

---

## 7. Postgres metadata contract

The `messages` row must store only encrypted message data and metadata.

Allowed fields:

```text
id
chatId
senderId
encryptedPayload
nonce
type
status
replyTo
clientTimestamp
createdAt
expiresAt
editedAt
deletedAt
```

Forbidden fields:

```text
plaintext content
plaintext attachments
private E2E session secrets
private keys
decrypted moderation text
```

Relay may store `encryptedPayload` as an opaque blob/string but must never inspect private plaintext.

---

## 8. Membership validation contract

For new canonical chats:

```text
sender must be present in chat_members
sender.leftAt must be null
chatId must reference active chat
```

If sender is not a member:

```text
return explicit NOT_MEMBER error or controlled failure
```

Do not silently fallback for canonical UUID chats unless an explicitly documented transition flag is active.

Recommended behavior:

```text
UUID chat + membership failure = error, not fallback
legacy cuid chat = fallback allowed
```

---

## 9. Fallback rule

`transport_fallback` remains allowed only for:

```text
legacy non-UUID chatId
known transition cases documented in logs
```

For canonical UUID chat IDs, fallback must be treated as suspicious.

Required logging if fallback happens for UUID chat:

```text
unexpected_canonical_fallback
reason
chatId format
senderId format
no encryptedPayload content
no JWT
no secrets
```

---

## 10. Recipient delivery contract

The recipient receives:

```ts
{
  type: 'chat.message',
  payload: {
    id: string,
    chatId: string,
    senderId: string,
    encryptedPayload: string,
    nonce: string,
    type: string,
    createdAt: number,
    clientTimestamp?: number
  }
}
```

Frontend must:

```text
parse encryptedPayload back into EncryptedEnvelope
decrypt locally
render plaintext only on client
never send plaintext back to relay
```

---

## 11. Offline queue contract

If recipient is offline:

```text
message is pushed to Redis offline:<recipientUserId>
offline list has TTL
recipient receives queued message after reconnect/auth
```

Required behavior:

```text
sender receives chat.ack with offlineCount > 0
recipient receives message after reconnect
recipient decrypts locally
no duplicate storm
```

---

## 12. Deduplication contract

Deduplication key:

```text
senderId + client message id
```

Dedup must happen only after required payload validation.

Required behavior:

```text
same valid message id from same sender returns deduplicated ack
malformed message must not poison dedup cache
client retry must be safe
```

---

## 13. Error codes

Required explicit error cases:

```text
VALIDATION_ERROR
INVALID_CHAT_ID
NOT_MEMBER
CHAT_NOT_FOUND
MESSAGE_DB_ERROR
MEMBERSHIP_DB_ERROR
REDIS_DELIVERY_ERROR
INVALID_ENCRYPTED_PAYLOAD_SHAPE
```

Errors must not leak:

```text
JWT
secrets
encryptedPayload contents
private plaintext
DB connection string
```

---

## 14. Runtime validation checklist

When PC/VPS/Codex sandbox is available, validate:

```text
1. Create canonical private chat
2. Confirm chatId is UUID
3. Confirm chat_members contains both users
4. Send A→B encrypted message
5. Confirm sender receives chat.ack
6. Confirm chat.ack.mode = postgres_metadata
7. Confirm Postgres messages row exists
8. Confirm encryptedPayload remains opaque
9. Confirm recipient receives chat.message
10. Confirm recipient decrypts locally
11. Repeat B→A
12. Test offline queue
13. Confirm no transport_fallback for new UUID chat
```

---

## 15. Codex/cloud runtime validation use

Codex can be used to run repository-level checks in a cloud sandbox:

```text
pnpm install
pnpm --filter @presidium/relay typecheck
pnpm --filter @presidium/relay build
pnpm --filter @presidium/web typecheck
pnpm --filter @presidium/web build
unit/integration tests if added
```

Codex can help create a relay integration test for B3, but it does not replace the final real two-browser smoke test.

Required final validation still remains:

```text
real User A browser session
real User B browser session
real WebSocket auth
real pre-key exchange
real encrypted delivery
```

---

## 16. Forbidden shortcuts

Do not:

```text
keep using transport_fallback for new canonical chats
store plaintext content in Postgres
decrypt message server-side
skip membership validation
remove legacy fallback before old chats are safe
log encrypted payloads or secrets
assume recipientId is enough for canonical delivery
ignore ack mode in tests
```

---

## 17. Phase B3 exit criteria

Phase B3 is complete only when:

```text
new UUID private chat messages use postgres_metadata mode
sender membership validation passes
message metadata is inserted into Postgres
recipient receives encrypted payload
recipient decrypts locally
sender receives chat.ack
offline delivery works for canonical chat
transport_fallback is not used for normal new private chats
active CI is green
manual or Codex-assisted integration validation passes
```

After B3 passes, Phase B4 pre-key Postgres persistence can proceed.
