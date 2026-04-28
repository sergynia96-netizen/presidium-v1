# Codex Task Brief — Phase B2 Canonical Private Chat Creation

**Project:** Presidium Messenger  
**Repository:** `sergynia96-netizen/presidium-v1`  
**Issue:** #5 — Phase B2: migrate private chat creation to relay/Postgres UUID chats  
**Mode:** focused implementation PR  
**Do not implement:** Phase B3-B5, media, calls, AI, recommendations  

---

## 1. Important context

Phase B1 code has been merged, but full runtime validation remains pending because the Codex sandbox could not run a complete Postgres/Redis/Relay/WebSocket stack.

Therefore Phase B2 must be implemented conservatively:

```text
small PR
strict scope
legacy compatibility preserved
active CI green
no removal of fallback paths
no broad rewrites
```

Do not assume Phase B1 runtime is fully accepted. Build B2 behind safe compatibility boundaries.

---

## 2. Read first

Before editing code, read these files in order:

```text
docs/engineering/presidium-quality-standard.md
docs/engineering/phase-b-implementation-index.md
docs/engineering/phase-b-execution-plan.md
docs/engineering/phase-b1-post-merge-checklist.md
docs/engineering/phase-b2-chat-creation-contract.md
docs/qa/realtime-e2e-smoke-test.md
```

Then inspect current code paths:

```text
src/app/api/chats/route.ts
src/app/api/relay/token/route.ts
src/lib/server/relay-identity.ts
services/relay/src/db/schema.ts
services/relay/src/routes/internal.ts
services/relay/src/ws/handler.ts
prisma/schema.prisma
```

If file paths differ, search for the equivalent chat creation, chat list, Prisma chat model, relay schema, and relay identity code.

---

## 3. Goal

Implement Phase B2 only:

```text
new private chat creation should produce canonical relay/Postgres UUID chat records and chat_members rows
```

Target behavior:

```text
new private chat → UUID chatId
both participants are canonical relay users
relay Postgres chats row exists
relay Postgres chat_members rows exist for both participants
legacy chats remain compatible
```

---

## 4. Required implementation scope

### 4.1 Canonical private chat creation path

Create or update a server-side route/helper so that new private chats can be created in relay/Postgres.

Preferred server-side route shape:

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

If the project already has a different private chat creation route, adapt the existing route carefully instead of adding duplicate behavior.

### 4.2 Canonical user resolution

Use the Phase B1 identity bridge for the requester.

For recipient resolution, implement the smallest safe resolver that can map:

```text
legacy web user id → canonical relay user id
```

Do not use email as the only permanent mapping key.

If recipient canonical identity does not exist yet, create/sync it safely through the same identity bridge pattern where possible.

### 4.3 Relay/Postgres chat rows

Create canonical rows in relay Postgres:

```text
chats.type = private
chats.isEncrypted = true
chats.createdBy = requester canonical relay UUID
chat_members rows for requester and recipient
```

Creation must be idempotent for the same pair.

### 4.4 Duplicate private chat prevention

Implement a safe duplicate-prevention strategy.

Preferred from contract:

```text
private_pair_key = sort(userAId, userBId).join(':')
```

If adding this column is too broad for the current schema, use a transaction and documented lookup strategy. But the PR must explain duplicate-prevention behavior clearly.

### 4.5 Legacy compatibility

Do not break legacy chats.

The UI/server must tolerate both:

```text
legacy cuid chatId
canonical UUID chatId
```

Do not remove old Prisma chat routes unless replaced with a compatibility wrapper and validated.

---

## 5. Hard constraints

Do not:

```text
implement B3 message delivery migration
implement B4 Postgres pre-key storage
implement B5 fallback removal/deprecation
remove transport_fallback
remove legacy token compatibility
rewrite all legacy chats at once
store plaintext private messages server-side
store private E2EE keys server-side
log JWTs, secrets, raw key material, or encrypted payloads
make frontend assume chatId is always UUID
break old chat list rendering
```

---

## 6. Expected DB changes

If using `private_pair_key`, add a migration and schema change similar to:

```text
chats.private_pair_key text nullable
unique index on private_pair_key where private_pair_key is not null
```

Rules:

```text
only private chats should use private_pair_key
pair key must be stable and sorted
pair key must not contain plaintext message data
```

If you choose a different strategy, document it in the PR body.

---

## 7. Required tests/checks

Run as much as the environment allows:

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @presidium/shared-types build
pnpm --filter @presidium/shared-api build
pnpm --filter @presidium/shared-crypto build
pnpm --filter @presidium/shared-ui build
pnpm --filter @presidium/relay typecheck
pnpm --filter @presidium/relay build
pnpm --filter @presidium/web typecheck
pnpm --filter @presidium/web build
docker compose config
```

If sandbox limitations block commands, state exactly why.

If adding tests is feasible, add minimal tests for:

```text
pair key generation
idempotent private chat create behavior
legacy id does not crash route handling
```

---

## 8. Acceptance criteria

The PR is acceptable only if:

```text
active CI remains green
new canonical private chat path returns UUID chatId
relay Postgres schema supports canonical chat rows and member rows
both participants are canonical relay UUIDs
creation is idempotent for the same pair
legacy chat compatibility is preserved
transport_fallback is not removed
no E2EE/privacy boundary is weakened
PR clearly documents runtime limitations and rollback plan
```

---

## 9. PR requirements

Open a PR, do not push directly to `main`.

PR title:

```text
Phase B2: implement canonical private chat creation
```

PR body must include:

```text
Summary
Files changed
DB/migration notes
Security/privacy impact
Legacy compatibility impact
Tests run
Known limitations
Rollback plan
```

If any required validation cannot be run, state exactly why.

---

## 10. Final instruction

Implement only Phase B2.

Do not continue to Phase B3 after this task.
