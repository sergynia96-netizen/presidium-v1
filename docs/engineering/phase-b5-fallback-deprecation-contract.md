# Phase B5 Fallback Deprecation Contract

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B5  
**Issue:** #8 — instrument and deprecate transport fallback for legacy chats  
**Status:** contract/specification, not yet implemented  

---

## 1. Purpose

Phase B5 turns `transport_fallback` from a temporary compatibility bridge into an explicitly observable, controlled, deprecated legacy path.

The final target is:

```text
normal new private chats → postgres_metadata
legacy unresolved chats → transport_fallback only while migration is incomplete
```

`transport_fallback` must not remain hidden permanent architecture.

---

## 2. Current fallback purpose

`transport_fallback` exists because the project currently has two identity/chat systems during migration:

```text
legacy web users/chats: Prisma/SQLite cuid()
canonical relay users/chats: Drizzle/Postgres UUID
```

Fallback made encrypted realtime delivery possible before canonical user/chat migration was complete.

It is acceptable only as a transition layer.

---

## 3. Allowed fallback cases

Fallback is allowed only for clearly documented transition cases:

```text
legacy non-UUID chatId
legacy cuid chat created before Phase B2
temporary membership DB failure during transition when recipientId is available
old client payloads that still include recipientId but not canonical membership
```

The strongest allowed case is:

```text
non-UUID legacy chatId → recipientId fallback
```

---

## 4. Disallowed fallback cases

Fallback must not be silently used for:

```text
new UUID private chat
canonical chat with valid chat_members
canonical user ID mismatch
missing canonical membership caused by Phase B bug
invalid payload
auth failure
malformed encrypted payload
```

For canonical UUID chats, membership failures should become explicit errors or warnings, not silent fallback.

Recommended rule:

```text
UUID chatId + membership failure = NOT_MEMBER or CANONICAL_MEMBERSHIP_ERROR
non-UUID chatId + recipientId = transport_fallback allowed
```

---

## 5. Required observability

Every fallback invocation must record structured information.

Required log fields:

```text
event = relay.transport_fallback
reason
chatIdFormat = uuid | non_uuid | missing
senderIdFormat = uuid | non_uuid | missing
hasRecipientId = true | false
mode = transport_fallback
```

Allowed optional fields:

```text
clientMessageId
processingTimeMs
legacyCompatibility = true
```

Forbidden log fields:

```text
encryptedPayload
nonce
JWT
secrets
private keys
plaintext message content
raw key material
```

---

## 6. Fallback reason taxonomy

Allowed fallback reasons:

```text
NON_UUID_CHAT_ID
LEGACY_CHAT_ID
NOT_MEMBER_TRANSITION
MEMBERSHIP_DB_ERROR_TRANSITION
MESSAGE_DB_ERROR_TRANSITION
LEGACY_CLIENT_PAYLOAD
```

Reasons that should be treated as bugs for canonical chats:

```text
CANONICAL_CHAT_NOT_FOUND
CANONICAL_NOT_MEMBER
CANONICAL_MEMBER_MISSING
CANONICAL_MESSAGE_INSERT_FAILED
UNEXPECTED_UUID_FALLBACK
```

If a canonical reason occurs, log warning:

```text
relay.unexpected_canonical_fallback
```

---

## 7. Ack contract

Fallback ack must be explicit.

Required shape:

```json
{
  "type": "chat.ack",
  "payload": {
    "messageId": "client-or-generated-id",
    "clientId": "client-message-id",
    "status": "sent-or-delivered",
    "deliveredCount": 0,
    "offlineCount": 0,
    "totalMembers": 1,
    "mode": "transport_fallback",
    "reason": "NON_UUID_CHAT_ID"
  }
}
```

Canonical ack must remain:

```json
{
  "type": "chat.ack",
  "payload": {
    "mode": "postgres_metadata"
  }
}
```

Smoke tests must assert `mode`.

---

## 8. Metrics contract

Recommended counters:

```text
relay_transport_fallback_total
relay_transport_fallback_by_reason_total
relay_unexpected_canonical_fallback_total
relay_postgres_metadata_delivery_total
```

If no metrics stack exists yet, structured logs are acceptable as Phase B5 MVP.

Future observability can export these counters to Prometheus/OpenTelemetry.

---

## 9. Migration stages

### Stage 1 — observe

Add log markers and ack reason.

Target:

```text
fallback visible in logs and client ack
```

### Stage 2 — separate canonical from legacy

Enforce behavior:

```text
UUID chatId → canonical path or explicit error
non-UUID chatId → fallback allowed
```

### Stage 3 — confirm new chats no longer fallback

After Phase B2/B3:

```text
new private chats must produce chat.ack.mode = postgres_metadata
```

### Stage 4 — restrict fallback

Fallback allowed only for legacy chats.

```text
fallback reason must be LEGACY_CHAT_ID or NON_UUID_CHAT_ID
```

### Stage 5 — remove fallback

Only after legacy chat migration or deliberate archival strategy.

Removal requires:

```text
migration report
no fallback usage for target window
manual smoke test
CI green
rollback plan
```

---

## 10. Runtime validation checklist

When PC/VPS/Codex sandbox is available:

```text
1. Send message in legacy cuid chat
2. Confirm ack.mode = transport_fallback
3. Confirm reason = NON_UUID_CHAT_ID or LEGACY_CHAT_ID
4. Confirm no encryptedPayload/plaintext in logs
5. Create new canonical UUID private chat
6. Send message in canonical chat
7. Confirm ack.mode = postgres_metadata
8. Confirm no fallback log for canonical chat
9. Force invalid canonical membership in test
10. Confirm explicit error/warning, not silent fallback
```

---

## 11. Security constraints

Fallback must remain E2EE-safe.

Allowed:

```text
routing by recipientId
Redis pub/sub
Redis offline queue
encryptedPayload forwarding as opaque blob
```

Forbidden:

```text
decrypting messages server-side
reading plaintext
logging encrypted payloads unnecessarily
logging private key material
admin plaintext access
```

---

## 12. Legacy compatibility policy

Legacy compatibility exists to avoid breaking current users and old chats during migration.

It must not block professional architecture.

Policy:

```text
preserve legacy path while migrating
observe every fallback
prefer canonical path for every new flow
delete fallback after migration evidence is sufficient
```

---

## 13. Error behavior

Required explicit error codes:

```text
FALLBACK_REQUIRES_RECIPIENT_ID
CANONICAL_CHAT_NOT_FOUND
CANONICAL_NOT_MEMBER
CANONICAL_MEMBERSHIP_ERROR
UNEXPECTED_CANONICAL_FALLBACK
LEGACY_FALLBACK_DISABLED
```

Errors must not expose:

```text
JWT
secrets
encryptedPayload contents
plaintext
DB connection strings
Redis connection strings
```

---

## 14. Codex/cloud validation use

Codex can help implement and validate:

```text
unit tests for fallback reason taxonomy
relay typecheck/build
integration-style tests for ack.mode
log marker assertions if test harness exists
```

Codex is useful for proving code-level behavior, but final validation still requires:

```text
real two-user browser smoke test
real WebSocket auth
real pre-key exchange
real message delivery
```

---

## 15. Forbidden shortcuts

Do not:

```text
remove fallback before canonical messaging is proven
hide fallback mode from ack
fallback silently for new UUID chats
log payload contents to debug fallback
treat recipientId routing as permanent canonical architecture
skip metrics/log markers
merge fallback removal without rollback plan
```

---

## 16. Phase B5 exit criteria

Phase B5 is complete only when:

```text
fallback usage is observable
fallback reason is explicit
new canonical UUID chats use postgres_metadata
legacy non-UUID chats can still fallback safely during transition
unexpected canonical fallback is logged as warning/error
no payload plaintext or key material is logged
active CI is green
runtime validation passes
fallback removal plan is documented
```

After B5, Phase B can be considered structurally prepared for canonical migration execution.
