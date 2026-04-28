# Phase B Implementation Index

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B — Canonical Users/Chats Migration  
**Status:** implementation map, not runtime execution  
**Maintainer:** Sergey Karnaukh  

---

## 1. Purpose

This document is the single navigation point for Phase B implementation.

Phase B migrates Presidium from the temporary legacy compatibility path to the canonical relay/Postgres identity, chat, membership, pre-key, and message delivery path.

This index is intended for:

```text
human developer
ChatGPT technical lead
Codex cloud runtime tasks
future VPS/browser IDE execution
review before implementation
```

---

## 2. Phase B parent issue

```text
Issue #3 — Phase B: migrate users and chats to canonical relay/Postgres schema
```

Goal:

```text
new private chats use canonical UUID users/chats/membership
messages deliver through postgres_metadata
pre-keys persist in Postgres
transport_fallback becomes legacy-only and observable
```

---

## 3. Required reading order

Before writing runtime code, read in this exact order:

```text
1. docs/engineering/presidium-quality-standard.md
2. docs/engineering/phase-b-execution-plan.md
3. docs/engineering/phase-b1-user-identity-contract.md
4. docs/engineering/phase-b2-chat-creation-contract.md
5. docs/engineering/phase-b3-message-delivery-contract.md
6. docs/engineering/phase-b4-prekey-postgres-contract.md
7. docs/engineering/phase-b5-fallback-deprecation-contract.md
8. docs/qa/realtime-e2e-smoke-test.md
```

Do not start implementation from Issue #5, #6, #7, or #8 before understanding Issue #4.

---

## 4. Implementation issues

### B1 — User identity bridge

```text
Issue #4 — Phase B1: implement canonical user identity bridge
```

Contract:

```text
docs/engineering/phase-b1-user-identity-contract.md
```

Core target:

```text
legacyWebUserId cuid() → relayUserId UUID
JWT sub = canonical relay user UUID
```

Must happen before:

```text
B2 chat creation
B4 Postgres pre-key ownership
```

---

### B2 — Canonical private chat creation

```text
Issue #5 — Phase B2: migrate private chat creation to relay/Postgres UUID chats
```

Contract:

```text
docs/engineering/phase-b2-chat-creation-contract.md
```

Core target:

```text
new private chat → UUID chatId
chat_members rows for both canonical relay users
idempotent private chat creation
```

Must happen before:

```text
B3 canonical message delivery
```

---

### B3 — Canonical message delivery

```text
Issue #6 — Phase B3: route new private chat messages through canonical membership path
```

Contract:

```text
docs/engineering/phase-b3-message-delivery-contract.md
```

Core target:

```text
new UUID private chat messages → chat.ack.mode = postgres_metadata
```

Must not:

```text
silently fallback for valid UUID chats
decrypt private messages server-side
store plaintext content
```

---

### B4 — Pre-key Postgres persistence

```text
Issue #7 — Phase B4: migrate pre-key bundle storage from Redis to Postgres
```

Contract:

```text
docs/engineering/phase-b4-prekey-postgres-contract.md
```

Core target:

```text
canonical users upload/fetch public pre-key bundles through Postgres
Redis becomes compatibility-only
```

Must never store:

```text
private keys
E2E session secrets
plaintext private messages
```

---

### B5 — Fallback observability and deprecation

```text
Issue #8 — Phase B5: instrument and deprecate transport fallback for legacy chats
```

Contract:

```text
docs/engineering/phase-b5-fallback-deprecation-contract.md
```

Core target:

```text
transport_fallback is explicit, observable, reasoned, and legacy-only
```

Final rule:

```text
UUID chatId + membership failure = explicit error/warning
non-UUID legacy chatId + recipientId = fallback allowed during transition
```

---

## 5. Execution order

Strict order:

```text
B1 → B2 → B3 → B4 → B5 finalization
```

Detailed chain:

```text
canonical user identity
  ↓
canonical private chat creation
  ↓
canonical membership-based message delivery
  ↓
Postgres pre-key persistence
  ↓
fallback instrumentation/deprecation
```

---

## 6. Current temporary bridges

Current temporary bridges that Phase B must retire or reduce:

```text
legacy web cuid user IDs
legacy web cuid chat IDs
recipientId transport_fallback
Redis pre-key bundle storage
legacy token subject compatibility
```

These are allowed only as transition mechanisms.

They are not final architecture.

---

## 7. Required active CI gate

Every implementation step must keep the active CI green:

```text
shared packages build
relay typecheck
relay build
web typecheck
web build
docker compose config
```

Current active-stack CI was made green before Phase B planning.

Do not merge implementation changes that break this gate.

---

## 8. Required runtime validation

Runtime validation remains required.

Primary checklist:

```text
docs/qa/realtime-e2e-smoke-test.md
```

Minimum Phase B runtime validation:

```text
User A logs in
User B logs in
relay token works for both
WebSocket auth works for both
pre-key upload/fetch works
new private chat ID is UUID
chat_members contains both users
A→B encrypted message delivers
B→A encrypted message delivers
chat.ack.mode = postgres_metadata for new chats
offline queue works
transport_fallback is not used for normal new chats
```

---

## 9. Codex task boundaries

Codex can be used for:

```text
repository inspection
small implementation PRs
typecheck/build validation
unit/integration test creation
schema migration drafting
runtime checks inside cloud sandbox where possible
```

Codex must not be considered a replacement for:

```text
real VPS deployment
two-browser E2E smoke test
production security review
manual verification of WebSocket behavior in real browser sessions
```

Recommended Codex prompt style:

```text
Implement only Issue #4. Read docs/engineering/phase-b-implementation-index.md first. Do not touch B2-B5. Keep active CI green. Do not remove legacy compatibility. Open a PR with summary, tests, and risks.
```

---

## 10. Forbidden implementation shortcuts

Do not:

```text
replace all legacy user IDs globally in one migration
remove transport_fallback before canonical path passes
use email as the only identity mapping key
store private E2E keys server-side
store plaintext private messages server-side
log encrypted payloads, JWTs, secrets, or raw key material
create duplicate private chats for the same pair
make frontend assume chatId is always UUID or always cuid
skip chat_members validation
merge without green CI
```

---

## 11. Rollback principle

Every Phase B implementation must preserve the current compatibility path until the replacement path is validated.

Rollback rule:

```text
if canonical path fails, legacy fallback must still allow basic messaging during transition
```

Do not remove:

```text
legacy auth compatibility
legacy chat fallback
Redis pre-key fallback
```

until Phase B exit criteria pass.

---

## 12. Phase B completion criteria

Phase B is complete only when:

```text
canonical relay users exist and map to legacy web users
new private chats use UUID chat IDs
chat_members rows exist for both participants
new private chat messages use postgres_metadata mode
pre-key storage is Postgres-backed for canonical users
transport_fallback is legacy-only and observable
active CI is green
manual two-user smoke test passes
no private plaintext or key material leaks are introduced
```

---

## 13. Next allowed implementation task

The first allowed implementation task is:

```text
Issue #4 — Phase B1: implement canonical user identity bridge
```

Do not start B2-B5 implementation until B1 is complete or explicitly scaffolded behind safe compatibility boundaries.
