# Codex Task Brief — Phase B1 Canonical User Identity Bridge

**Project:** Presidium Messenger  
**Repository:** `sergynia96-netizen/presidium-v1`  
**Issue:** #4 — Phase B1: implement canonical user identity bridge  
**Mode:** focused implementation PR  
**Do not implement:** Phase B2-B5  

---

## 1. Read first

Before editing code, read these files in order:

```text
docs/engineering/presidium-quality-standard.md
docs/engineering/phase-b-implementation-index.md
docs/engineering/phase-b-execution-plan.md
docs/engineering/phase-b1-user-identity-contract.md
docs/qa/realtime-e2e-smoke-test.md
```

Then inspect the current code paths:

```text
src/app/api/relay/token/route.ts
src/lib/auth-options.ts
prisma/schema.prisma
services/relay/src/db/schema.ts
services/relay/src/middleware/auth.ts
services/relay/src/routes/keys.ts
```

If a file path differs, search the repository for the equivalent auth/session/relay-token code.

---

## 2. Goal

Implement Phase B1 only:

```text
legacyWebUserId cuid() → relayUserId UUID
```

The web app currently issues relay JWTs with the legacy web `session.user.id` as `sub`.

Target behavior for new relay tokens:

```text
JWT sub = canonical relay users.id UUID
JWT id = canonical relay users.id UUID
JWT legacyWebUserId = current web session.user.id
JWT email = current session.user.email
issuer = presidium-api
audience = presidium-relay
```

Legacy compatibility must remain intact.

---

## 3. Required implementation

### 3.1 Relay schema mapping

Add a canonical mapping field to relay users:

```text
legacy_web_user_id text unique nullable
```

In Drizzle schema, use project naming style and add an index/unique index equivalent:

```text
legacyWebUserId
```

Do not remove existing `email` uniqueness.

### 3.2 Migration

Add the corresponding Drizzle migration if the repository has an established migration folder/process.

Expected SQL shape:

```sql
ALTER TABLE users ADD COLUMN legacy_web_user_id text;
CREATE UNIQUE INDEX users_legacy_web_user_id_idx ON users(legacy_web_user_id) WHERE legacy_web_user_id IS NOT NULL;
```

If migrations are not currently generated, document the required migration in the PR summary and add the schema change only.

### 3.3 Server-side identity resolver

Create a focused server-side helper, preferably:

```text
src/lib/server/relay-identity.ts
```

Responsibilities:

```text
accept current NextAuth session user data
resolve or create canonical relay user UUID
upsert safe profile fields only
return canonical relayUserId
preserve legacyWebUserId mapping
```

Safe profile fields:

```text
name
email
avatar
legacyWebUserId
```

Do not move private keys or private E2E state.

### 3.4 Relay token route update

Update:

```text
src/app/api/relay/token/route.ts
```

Current behavior:

```text
sub = session.user.id
id = session.user.id
```

Target behavior:

```text
const relayIdentity = await resolveRelayIdentity(session.user)
sub = relayIdentity.relayUserId
id = relayIdentity.relayUserId
legacyWebUserId = session.user.id
```

Keep:

```text
rate limiting
issuer = presidium-api
audience = presidium-relay
expiresIn = 7200
secret selection behavior
```

### 3.5 Relay auth compatibility

Inspect relay auth middleware. Ensure it accepts canonical UUID users normally and still does not crash on legacy tokens during transition.

Do not remove legacy compatibility in this task.

---

## 4. Hard constraints

Do not:

```text
implement B2 chat creation
implement B3 message delivery changes
implement B4 pre-key Postgres storage
implement B5 fallback deprecation
remove transport_fallback
remove legacy token compatibility
replace all web Prisma IDs globally
use email as the only mapping key
store private E2E keys server-side
store plaintext private messages server-side
log full JWTs
log secrets
commit .env files
```

---

## 5. Expected tests/checks

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

If Docker Compose config requires `.env.local`, create temporary CI-safe local values only inside the sandbox. Do not commit them.

---

## 6. Acceptance criteria

The PR is acceptable only if:

```text
active CI remains green
relay users schema supports legacyWebUserId mapping
relay identity resolver is idempotent
/api/relay/token can issue canonical UUID subject for new tokens
legacyWebUserId remains available as a separate claim
legacy compatibility is not removed
no private keys or plaintext messages are stored/logged
PR summary explains migration impact and rollback plan
```

---

## 7. PR requirements

Open a PR, do not push directly to `main`.

PR title:

```text
Phase B1: implement canonical user identity bridge
```

PR body must include:

```text
Summary
Files changed
Security/privacy impact
Migration notes
Tests run
Known limitations
Rollback plan
```

If any test cannot be run, state exactly why.
