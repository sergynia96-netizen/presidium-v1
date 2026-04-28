# Phase B2 Chat Creation Contract

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B2  
**Issue:** #5 — migrate private chat creation to relay/Postgres UUID chats  
**Status:** contract/specification, not yet implemented  

---

## 1. Purpose

Phase B2 migrates creation of new private chats from the legacy web Prisma/SQLite model to the canonical relay/Postgres schema.

This phase must make new private chats use UUID chat IDs and canonical `chat_members`, while preserving compatibility with existing legacy `cuid()` chats.

---

## 2. Current chat state

### 2.1 Legacy web chat model

The root web app currently owns chats through Prisma/SQLite.

Current legacy models:

```text
Chat.id = String @id @default(cuid())
ChatMember.id = String @id @default(cuid())
ChatMember.userId = String
ChatMember.chatId = String
```

Therefore current web-created private chats usually have:

```text
legacyChatId = cuid()
legacyUserId = cuid()
```

### 2.2 Canonical relay chat model

The relay owns the target Postgres schema:

```text
chats.id = uuid defaultRandom primary key
chat_members.id = uuid defaultRandom primary key
chat_members.user_id = uuid references users.id
chat_members.chat_id = uuid references chats.id
```

Target canonical private chats must have:

```text
chatId = UUID
member userIds = canonical relay user UUIDs
```

---

## 3. Dependency on Phase B1

Phase B2 must not be implemented before Phase B1 is designed and at least partially implemented.

Reason:

```text
canonical chat_members require canonical relay users
```

Required from Phase B1:

```text
legacyWebUserId cuid() → relayUserId UUID
/api/relay/token can resolve canonical user identity
web server can resolve recipient canonical relay user ID
```

---

## 4. Target behavior

When User A starts a new private chat with User B:

```text
1. Web session resolves User A canonical relayUserId
2. Web request identifies User B
3. System resolves User B canonical relayUserId
4. Relay/Postgres creates or returns existing private chat
5. Relay/Postgres creates chat_members rows for A and B
6. Web UI receives canonical UUID chatId
7. Future chat.message uses this UUID chatId
```

Expected result:

```text
new private chat → UUID chatId → canonical membership → postgres_metadata delivery
```

---

## 5. Private chat uniqueness

The system must avoid duplicate one-to-one private chats for the same pair.

Recommended invariant:

```text
one active private chat per unordered pair of canonical relay user IDs
```

Potential implementation strategies:

### Option A — pair key column

Add to `chats`:

```text
private_pair_key text unique nullable
```

For private chats only:

```text
private_pair_key = sort(userAId, userBId).join(':')
```

Pros:

```text
simple duplicate prevention
fast lookup
clear constraint
```

Cons:

```text
adds migration column
must ensure only private chats use it
```

### Option B — lookup through chat_members

Find all private chats where both users are members.

Pros:

```text
no extra column
normalized
```

Cons:

```text
more complex query
harder unique constraint
risk of duplicate chats under race conditions
```

Recommended for Phase B2:

```text
Option A with private_pair_key
```

Reason: lower risk, easier idempotent chat creation, better for MVP reliability.

---

## 6. Required DB contract

### 6.1 chats

For private chats:

```text
type = 'private'
isEncrypted = true
createdBy = requester relayUserId
private_pair_key = stable sorted pair key
```

### 6.2 chat_members

Each canonical private chat must have exactly two active members:

```text
member A: userId = requester relayUserId
member B: userId = recipient relayUserId
```

Both rows must reference the same canonical UUID `chatId`.

### 6.3 Atomicity requirement

Chat row and member rows must be created in one transaction.

Required behavior:

```text
if chat creation succeeds but member creation fails → rollback
if duplicate pair exists → return existing chat
if one member exists and another is missing → repair or fail explicitly
```

---

## 7. API contract

### 7.1 Preferred endpoint shape

A canonical chat creation route should behave like:

```text
POST /api/chats/private
```

Input:

```json
{
  "recipientId": "legacy-web-user-id-or-canonical-relay-user-id"
}
```

Output:

```json
{
  "success": true,
  "chat": {
    "id": "uuid-chat-id",
    "type": "private",
    "memberIds": ["relay-user-uuid-a", "relay-user-uuid-b"],
    "mode": "canonical_postgres"
  }
}
```

Error examples:

```text
NO_WEB_SESSION
REQUESTER_IDENTITY_NOT_RESOLVED
RECIPIENT_NOT_FOUND
RECIPIENT_IDENTITY_NOT_RESOLVED
PRIVATE_CHAT_CREATE_FAILED
PRIVATE_CHAT_MEMBERSHIP_FAILED
```

### 7.2 Compatibility requirement

Existing legacy chat APIs must not be removed immediately.

During transition:

```text
old chats may still use legacy cuid chatId
new private chats should use UUID chatId
UI must tolerate both formats
```

---

## 8. Frontend contract

The frontend chat layer must treat chat IDs as opaque strings.

Required behavior:

```text
legacy cuid chatId must still render
new UUID chatId must render
sendEncryptedMessage(chatId, envelope) must work with both
```

Forbidden assumption:

```text
chatId is always cuid
chatId is always UUID
```

Instead:

```text
chatId is opaque
relay decides canonical/fallback path based on format and membership
```

---

## 9. Message delivery consequence

After Phase B2, messages sent in new private chats should be eligible for canonical delivery.

Expected in Phase B3:

```text
chat.ack.mode = postgres_metadata
```

Phase B2 alone does not need to remove fallback, but it must produce data that makes canonical delivery possible:

```text
UUID chatId
chat_members rows
canonical relay users
```

---

## 10. Forbidden shortcuts

Do not:

```text
rewrite all legacy chats at once
remove transport_fallback during B2
store plaintext private message content server-side
create chat without both member rows
create duplicate private chats for the same user pair
use legacy cuid user IDs in relay chat_members
make frontend depend on chat ID format
break old chat list rendering
```

---

## 11. Validation checklist

After Phase B2 implementation:

```text
active CI is green
User A canonical relay ID resolves
User B canonical relay ID resolves
new private chat id is UUID
relay Postgres chats row exists
relay Postgres chat_members rows exist for both users
same pair request returns existing private chat, not duplicate
legacy chats still render
legacy chats can still use fallback
```

---

## 12. Runtime smoke checklist

When PC/VPS is available:

```text
1. Login User A
2. Login User B
3. User A starts new private chat with User B
4. Verify returned chatId is UUID
5. Verify DB has chat row
6. Verify DB has two chat_members rows
7. Send message A→B
8. Expect Phase B3 target: chat.ack.mode = postgres_metadata
```

For B2 alone, delivery may still be validated in B3.

---

## 13. Security and privacy notes

Private chat creation may store metadata:

```text
participants
chat type
creation time
creator
membership
```

It must not store:

```text
plaintext private messages
private keys
E2E session secrets
unnecessary contact graph beyond membership
```

---

## 14. Phase B2 exit criteria

Phase B2 is complete only when:

```text
new private chat creation produces UUID chatId
both participants are canonical relay UUID users
chat_members rows are present
creation is idempotent for the same pair
legacy chats remain compatible
active CI is green
```

Only then should Phase B3 canonical message delivery be implemented.
