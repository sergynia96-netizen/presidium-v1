# Phase B1 Post-Merge Checklist

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B1 — Canonical User Identity Bridge  
**PR:** #9 — Phase B1: implement canonical user identity bridge  
**Merge commit:** `0f08f386a22fea38ff694a479545d53be9b6e0be`  
**Status:** code merged, runtime validation pending  

---

## 1. What was merged

Phase B1 introduced the canonical user identity bridge.

Implemented behavior:

```text
legacy web cuid user id → canonical relay/Postgres UUID user id
```

Merged components:

```text
relay users.legacy_web_user_id mapping
unique partial index for legacy_web_user_id
internal relay sync endpoint
web server relay identity resolver
/api/relay/token canonical UUID subject
legacyWebUserId JWT claim
pre-key Redis compatibility alias for legacyWebUserId
internal bridge configuration documented in env examples
```

---

## 2. What changed

Before Phase B1:

```text
relay token subject = web Prisma/SQLite user cuid
```

After Phase B1:

```text
relay token subject = relay/Postgres user UUID
legacyWebUserId claim = web Prisma/SQLite user cuid
```

This prepares Phase B2 and Phase B3.

---

## 3. What this phase does not do

Phase B1 does not implement:

```text
canonical private chat creation
canonical chat_members migration
postgres_metadata message delivery for new chats
Postgres pre-key persistence
transport_fallback removal
voice/media/calls/stories/AI features
```

---

## 4. Runtime configuration requirement

Before runtime validation, make sure the web server and relay server share the same internal bridge credential and that the web server can reach the relay HTTP endpoint.

Do not commit real runtime credentials.

---

## 5. Database migration requirement

Apply the Phase B1 relay migration before relying on runtime behavior:

```text
services/relay/drizzle/0000_phase_b1_identity_bridge.sql
```

Expected effect:

```text
users table gains legacy_web_user_id
legacy_web_user_id becomes unique when present
```

---

## 6. Runtime validation checklist

When PC, VPS, or Codex runtime is available, validate:

### 6.1 Identity bridge

```text
login as a web user
call POST /api/relay/token
confirm request succeeds
confirm token subject is UUID
confirm legacyWebUserId claim equals old web cuid
confirm email claim remains present
```

### 6.2 Relay DB row

```text
relay users row exists
users.id is UUID
users.legacy_web_user_id equals web cuid
repeated token requests do not create duplicates
```

### 6.3 Internal bridge authorization

```text
missing bridge credential fails
wrong bridge credential fails
matching bridge credential succeeds
sensitive values do not appear in logs
```

### 6.4 WebSocket auth

```text
use new relay token
connect WebSocket
send auth payload
confirm auth.success
confirm relay auth source is canonical relay user
```

### 6.5 Pre-key compatibility alias

```text
upload pre-key bundle with canonical UUID token
fetch bundle by canonical UUID
fetch bundle by legacyWebUserId alias
both lookups resolve during transition
no key material appears in logs
```

---

## 7. Known transition notes

### 7.1 publicKey placeholder

The relay users table currently requires a public_key value.

Phase B1 may create relay users with a temporary `pending:` placeholder.

This placeholder is not E2E key material and must not be used for cryptography.

Real E2E public key material remains managed by pre-key upload/fetch flows and will be migrated properly in Phase B4.

### 7.2 Pre-key Redis compatibility

During transition:

```text
canonical UUID token upload → primary Redis key
legacyWebUserId alias → compatibility lookup
```

This exists to prevent pre-key lookup failures while the frontend still passes legacy user IDs.

---

## 8. Rollback plan

If Phase B1 causes runtime failure:

```text
revert PR #9 / merge commit
restore relay token subject to previous legacy mode
disable internal identity sync route
keep or drop legacy_web_user_id only after checking dependencies
re-run active CI
re-run Phase A smoke-test
```

Do not rollback by weakening auth or exposing plaintext/private key material.

---

## 9. Phase B1 completion definition

Code-level B1 is merged.

Full B1 is complete only when:

```text
active CI on main is green
Phase B1 migration is applied in runtime DB
/api/relay/token returns canonical UUID subject
relay DB user mapping is idempotent
WebSocket auth succeeds with canonical token
pre-key alias compatibility works
no private key/plaintext leaks are introduced
```

---

## 10. Next phase rule

Do not start Phase B2 implementation until this checklist is either validated in runtime or explicitly deferred with a documented reason.

Next implementation after B1 validation:

```text
Issue #5 — Phase B2: migrate private chat creation to relay/Postgres UUID chats
```
