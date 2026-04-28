# Presidium CI Validation Plan

**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Scope:** GitHub Actions active stack validation gate  
**Workflow:** `.github/workflows/ci.yml`

---

## 1. Purpose

The CI workflow is a baseline guardrail for the current active Presidium stack. It is designed to catch obvious breakage on every push and pull request to `main`.

It is not a replacement for the two-user realtime/E2E browser smoke test. The browser smoke test remains documented separately in:

```text
docs/qa/realtime-e2e-smoke-test.md
```

---

## 2. Intended active-stack CI checks

The workflow runs on:

```text
push to main
pull_request to main
```

The intended baseline validation scope is the active MVP path:

```text
shared packages
web app
services/relay
Docker Compose config
```

Target commands:

```text
pnpm install --frozen-lockfile
@presidium/shared-types build
@presidium/shared-api build
@presidium/shared-crypto build
@presidium/shared-ui build
@presidium/relay typecheck
@presidium/relay build
@presidium/web typecheck
@presidium/web build
docker compose config
```

Desktop and mobile packages are intentionally outside the first CI gate until their platform-specific dependency chains are stabilized.

---

## 3. Why shared packages build first

The relay and web app depend on workspace packages:

```text
@presidium/shared-types
@presidium/shared-api
@presidium/shared-ui
@presidium/shared-crypto
```

Several workspace packages expose `dist/*` files through package metadata. Building them before relay/web reduces false failures and mirrors the production relay Dockerfile strategy.

---

## 4. CI environment placeholders

The workflow uses non-production placeholder values only for build/config validation. These values are not production secrets and must not be reused outside CI.

The real production deployment must provide separate rotated values through the deployment environment.

---

## 5. Checks intentionally not included yet

The current CI intentionally does not run:

```text
docker compose build relay
browser smoke test
real two-user WebSocket integration test
real Redis offline queue integration test
real Postgres migrations against a live DB
desktop Tauri build
mobile Capacitor build
```

Reason: the project is still in a transition phase between legacy root Prisma/SQLite web data and canonical relay/Postgres data. The first CI gate should be fast, deterministic, and cheap.

---

## 6. Next CI phases

### Phase 1 — active stack baseline

```text
install → shared builds → relay typecheck/build → web typecheck/build → compose config
```

### Phase 2 — relay container build

Add:

```bash
docker compose build relay
```

after the relay Dockerfile is validated locally.

### Phase 3 — service integration

Add service containers:

```text
PostgreSQL
Redis
MinIO
relay
```

Then test:

```text
GET /health
POST /api/keys/upload
GET /api/keys/:userId
WebSocket auth
chat.message → chat.ack
```

### Phase 4 — browser E2E smoke

Add Playwright or equivalent browser automation for:

```text
User A login
User B login
pre-key exchange
A→B encrypted message
B→A encrypted message
offline queue drain
```

This phase should only start after the canonical data migration plan is underway.

### Phase 5 — platform workflows

Add separate workflows for:

```text
desktop Tauri build
mobile Capacitor build
```

These should not block the web/relay MVP gate until platform apps are actively maintained.

---

## 7. Rule

A green active-stack CI run means:

```text
the web/relay MVP stack builds and the static validation gate passed
```

It does not yet mean:

```text
two-user encrypted messaging passed in the browser
```

Realtime/E2E readiness must be validated through the smoke-test checklist until automated integration tests are added.
