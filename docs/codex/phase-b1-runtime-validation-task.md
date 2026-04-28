# Codex Task Brief — Phase B1 Runtime Validation

**Project:** Presidium Messenger  
**Repository:** `sergynia96-netizen/presidium-v1`  
**Phase:** B1 — Canonical User Identity Bridge  
**Status:** validation task after PR #9 merge  
**Mode:** runtime/check task, not feature implementation  

---

## 1. Read first

Before running or editing anything, read:

```text
docs/engineering/presidium-quality-standard.md
docs/engineering/phase-b-implementation-index.md
docs/engineering/phase-b1-user-identity-contract.md
docs/engineering/phase-b1-post-merge-checklist.md
docs/qa/realtime-e2e-smoke-test.md
```

Then inspect the merged implementation:

```text
src/app/api/relay/token/route.ts
src/lib/server/relay-identity.ts
services/relay/src/routes/internal.ts
services/relay/src/routes/keys.ts
services/relay/src/middleware/auth.ts
services/relay/src/db/schema.ts
services/relay/drizzle/0000_phase_b1_identity_bridge.sql
.env.example
.env.production.example
```

---

## 2. Goal

Validate Phase B1 after merge.

Do not implement Phase B2-B5.

The goal is to prove that the canonical user identity bridge can work in runtime or identify exact blockers.

Expected Phase B1 behavior:

```text
legacy web cuid user id → canonical relay/Postgres UUID user id
/api/relay/token returns JWT with canonical UUID subject
legacyWebUserId remains available in JWT
pre-key Redis compatibility alias works during transition
WebSocket auth accepts canonical UUID token
```

---

## 3. Strict scope

Allowed:

```text
run installs/builds/typechecks
run local service checks if sandbox allows
apply/test local migration in disposable DB if possible
write small validation tests if needed
fix clearly blocking test-only or config issues inside B1 scope
open a PR only if code changes are necessary
```

Forbidden:

```text
implement B2 chat creation
implement B3 message delivery migration
implement B4 Postgres pre-key persistence
implement B5 fallback removal/deprecation
remove transport_fallback
remove legacy token compatibility
store private E2EE keys server-side
store plaintext private messages server-side
log JWTs, secrets, raw key material, or encrypted payloads
```

---

## 4. Baseline checks

Run:

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

If a command cannot run because of sandbox limits, state the exact reason.

---

## 5. Runtime validation targets

Try to validate as many as possible in Codex environment.

### 5.1 Relay migration

Check whether the Phase B1 migration can be applied to a disposable Postgres database:

```text
services/relay/drizzle/0000_phase_b1_identity_bridge.sql
```

Expected DB effect:

```text
users.legacy_web_user_id exists
users_legacy_web_user_id_idx exists and is unique when value is present
```

### 5.2 Internal user sync endpoint

Validate:

```text
POST /internal/users/sync-web-user
```

Cases:

```text
missing internal bridge credential → failure
wrong internal bridge credential → failure
valid internal bridge credential → success
repeated same legacyWebUserId → same relayUserId / no duplicate
same email with empty legacy mapping → safe claim/update behavior
conflict cases return explicit error code
```

Do not print or persist real credentials.

### 5.3 Relay token route

Validate:

```text
POST /api/relay/token
```

Expected behavior:

```text
JWT sub is UUID
JWT id is same UUID
JWT legacyWebUserId equals legacy web cuid
issuer = presidium-api
audience = presidium-relay
expiresIn remains 7200 seconds
rate limit behavior remains present
```

Do not log full JWT in PR output. Only state decoded claim shape.

### 5.4 WebSocket auth

If sandbox allows relay runtime:

```text
connect WebSocket
send auth with canonical UUID token
expect auth.success
```

If not possible, state why.

### 5.5 Pre-key compatibility alias

Validate with current Redis-backed transition storage:

```text
upload pre-key bundle using canonical UUID token
fetch by canonical UUID
fetch by legacyWebUserId alias
both lookups should work
```

Confirm no private key material is logged.

---

## 6. Expected report

If no code changes are needed, leave a PR/issue comment with:

```text
Runtime validation summary
Commands run
Commands blocked and why
Identity bridge result
Migration result
Token claim shape result
Pre-key alias result
WebSocket auth result
Remaining blockers
Recommendation: B1 runtime accepted or not accepted
```

If code changes are needed, open a PR titled:

```text
Phase B1: fix runtime validation blockers
```

PR body must include:

```text
Summary
Why changes were needed
Files changed
Security/privacy impact
Tests run
Remaining limitations
Rollback plan
```

---

## 7. Acceptance criteria

Phase B1 runtime validation is acceptable if:

```text
active CI-equivalent checks pass or known sandbox limits are documented
migration is valid or migration blocker is explicit
internal sync endpoint is idempotent
/api/relay/token can issue canonical UUID subject
legacyWebUserId remains present as compatibility claim
pre-key alias works or blocker is explicit
WebSocket auth works or sandbox limitation is explicit
no private key/plaintext/JWT/secret leakage is introduced
```

---

## 8. Final instruction

Do not continue to Phase B2.

This task is validation-only for Phase B1.
