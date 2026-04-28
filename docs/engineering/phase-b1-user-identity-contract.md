# Phase B1 User Identity Contract

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B1  
**Issue:** #4 — canonical user identity bridge  
**Status:** contract/specification, not yet implemented  

---

## 1. Purpose

Phase B1 introduces a safe bridge between the current web application identity and the canonical relay/Postgres identity.

This is the first required step before canonical chat creation, canonical membership checks, and canonical message persistence.

---

## 2. Current identity state

### 2.1 Web identity

The root web app uses Prisma/SQLite.

Current web user model:

```text
prisma/schema.prisma
User.id = String @id @default(cuid())
```

Therefore current web users look like:

```text
legacyWebUserId = cuid()
```

Current relay token route:

```text
src/app/api/relay/token/route.ts
```

currently signs:

```ts
{
  sub: session.user.id,
  id: session.user.id,
  email: session.user.email || '',
}
```

So today the relay JWT subject is usually the legacy web `cuid()`.

### 2.2 Relay identity

The production relay uses Drizzle/Postgres.

Current relay user model:

```text
services/relay/src/db/schema.ts
users.id = uuid('id').defaultRandom().primaryKey()
```

Therefore canonical relay users must use:

```text
relayUserId = UUID
```

---

## 3. Problem

The active system currently has two incompatible user identity formats:

```text
web/Prisma user id: cuid()
relay/Postgres user id: UUID
```

Compatibility middleware currently tolerates legacy `cuid()` values so that realtime/E2E can keep working.

That compatibility is temporary and must not become permanent architecture.

---

## 4. Required target state

For new canonical flows, the relay JWT should identify the canonical relay user:

```text
JWT sub = relay users.id UUID
```

The legacy web user ID must remain available as a mapping key, but must not be used as the canonical relay identity for new chat/membership/message flows.

Target conceptual mapping:

```text
legacyWebUserId cuid()  →  relayUserId UUID
```

---

## 5. Required mapping strategy

### 5.1 Mapping field

Relay/Postgres needs a stable way to map web users to canonical relay users.

Recommended schema addition:

```text
users.legacy_web_user_id text unique nullable
```

Reason:

```text
email may change or be absent in some auth modes
legacy cuid is stable inside the current web app
unique nullable mapping avoids duplicate relay identities
```

Alternative future names:

```text
external_id
legacy_user_id
web_user_id
```

Recommended name for clarity during migration:

```text
legacy_web_user_id
```

### 5.2 User upsert rule

User sync must be idempotent.

Pseudo-rule:

```text
find relay user by legacy_web_user_id
if found → update safe profile fields
if not found → create relay user with generated UUID and legacy_web_user_id
return relay user UUID
```

### 5.3 Safe profile fields

Allowed to copy from web session/user:

```text
name
email
avatar
```

Do not copy:

```text
passwordHash unless intentionally migrated
private keys
local E2E state
message content
sensitive settings without explicit design
```

---

## 6. Relay token contract

### 6.1 Current temporary token

Current token:

```ts
sub = session.user.id // legacy cuid
id = session.user.id
email = session.user.email
```

### 6.2 Target token after Phase B1

Target token:

```ts
sub = relayUser.id // UUID
id = relayUser.id
legacyWebUserId = session.user.id // cuid
email = session.user.email
```

Required claims:

```text
issuer = presidium-api
audience = presidium-relay
expiresIn = 7200 seconds
```

### 6.3 Compatibility requirement

During migration, relay must still tolerate old tokens with legacy `cuid()` subject.

Do not remove existing legacy compatibility until:

```text
Phase B1-B3 smoke tests pass
all active web token issuing paths use relay UUID subject
legacy chats remain safe
```

---

## 7. Required implementation components

### 7.1 Relay schema

Add to `services/relay/src/db/schema.ts`:

```text
legacyWebUserId text unique nullable
```

Recommended indexes:

```text
unique index on legacyWebUserId
existing unique email index remains
```

### 7.2 Relay migration

Add migration for:

```sql
ALTER TABLE users ADD COLUMN legacy_web_user_id text;
CREATE UNIQUE INDEX users_legacy_web_user_id_idx ON users(legacy_web_user_id) WHERE legacy_web_user_id IS NOT NULL;
```

Exact generated SQL should follow the project's Drizzle migration strategy.

### 7.3 Web-side relay identity helper

Create a server-side helper that:

```text
accepts current NextAuth session user
calls/uses relay user upsert path
returns canonical relayUserId UUID
```

Potential location:

```text
src/lib/server/relay-identity.ts
```

### 7.4 Relay upsert endpoint or direct server bridge

Two possible approaches:

#### Option A — Relay HTTP endpoint

```text
POST /users/sync-web-user
Authorization: internal server credential or signed relay token
```

Pros:

```text
clean service boundary
relay owns relay DB
```

Cons:

```text
requires internal auth design
more moving parts
```

#### Option B — Web server writes relay Postgres through shared DB access

Pros:

```text
simpler for monorepo transition
fewer network calls
```

Cons:

```text
web app becomes coupled to relay DB schema
```

Recommended for professional architecture:

```text
Option A, but only if internal auth is implemented safely.
```

Pragmatic transition option:

```text
Option B is acceptable temporarily if documented and isolated in one helper.
```

---

## 8. Forbidden implementation shortcuts

Do not:

```text
replace all web User.id values with UUID in one broad migration
remove legacy compatibility immediately
use email as the only canonical mapping key
log full JWTs
log secrets
copy private E2E keys server-side
make relay users without a unique mapping
silently create duplicate relay users
break existing NextAuth sessions
```

---

## 9. Validation checklist

After Phase B1 implementation:

```text
active CI green
relay user row created for logged-in web user
relay user ID is UUID
legacyWebUserId maps to current web User.id
/api/relay/token returns JWT with UUID sub
JWT still has issuer presidium-api
JWT still has audience presidium-relay
WebSocket auth still succeeds
old legacy-token compatibility does not crash
```

---

## 10. Error handling requirements

Required explicit errors:

```text
NO_WEB_SESSION
RELAY_USER_SYNC_FAILED
RELAY_USER_CONFLICT
RELAY_JWT_SECRET_MISSING
RELAY_IDENTITY_UNAVAILABLE
```

Errors must not leak:

```text
JWT contents
secret values
password hashes
private keys
raw DB connection strings
```

---

## 11. Security notes

The identity bridge is security-sensitive.

It must preserve:

```text
existing auth behavior
JWT issuer/audience correctness
rate limiting on token issue
no plaintext private message exposure
no private key movement
```

The only data moved in Phase B1 should be identity metadata needed for canonical relay membership:

```text
legacy web user id
name
email
avatar
status/default fields
```

---

## 12. Phase B1 exit criteria

Phase B1 is complete only when:

```text
web user can resolve canonical relay UUID
relay JWT subject is canonical UUID for new tokens
legacy web user id is mapped uniquely
WebSocket auth passes with canonical UUID token
active CI is green
no legacy compatibility path was removed prematurely
```

Only then should Phase B2 private chat creation migration begin.
