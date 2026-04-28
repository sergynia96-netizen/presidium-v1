# Presidium Engineering Quality Standard

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Status:** mandatory engineering standard  
**Maintainer:** Sergey Karnaukh  

---

## 1. Mission

Presidium is not a demo, toy messenger, or chaotic AI-generated experiment.

The project must be developed as a professional, secure, privacy-first communication platform.

The target standard is:

```text
no uncontrolled chaos
no silent security regressions
no preventable data leaks
no unvalidated critical changes
no feature expansion on broken foundations
```

Every feature must pass through architecture, implementation, validation, and security review before being considered complete.

---

## 2. Core principles

### 2.1 Security first

Private user communication must be protected by design.

Rules:

```text
never expose plaintext private messages to the server
never log secrets
never log raw encrypted payloads unnecessarily
never commit .env files
never weaken auth to make a feature easier
never bypass E2EE boundaries for moderation convenience
```

### 2.2 Privacy by default

The default architecture must minimize server knowledge.

Rules:

```text
server stores metadata only when needed
private content remains client-side encrypted
recommendations must not read private E2EE messages
moderation of private messages must rely on reports, local safety, metadata, and explicit evidence packages
users must have privacy controls
```

### 2.3 Stability before expansion

Do not add large product features before the messaging foundation is stable.

Required order:

```text
CI green
manual smoke test
canonical users/chats
media/voice
moderation/admin
recommendations
stories/video notes
calls
local AI routing
fine-tuning/adapters
```

### 2.4 One phase, one gate

Each phase must have:

```text
GitHub issue or epic
technical specification
implementation checklist
acceptance criteria
CI validation
manual or automated smoke test
known limitations documented
```

### 2.5 Temporary bridges are not architecture

Compatibility bridges are allowed only when explicitly documented.

Rules:

```text
bridge must have a reason
bridge must have telemetry/log marker
bridge must have removal plan
bridge must not become hidden permanent behavior
```

Current known bridges:

```text
legacy web cuid user IDs
legacy cuid chat IDs
transport_fallback delivery
Redis pre-key bundle storage
```

---

## 3. Definition of done

A task is not done when code is written.

A task is done only when:

```text
implementation is committed
CI is green
security/privacy impact is checked
fallback behavior is documented if any
manual test path exists
regressions are considered
issue acceptance criteria are met
```

For critical messaging/security tasks, the definition of done also requires:

```text
two-user smoke test
negative/error path test
no auth loop
no reconnect storm
no accidental plaintext leakage
```

---

## 4. Required quality gates

### Gate 1 — Static validation

Required for active web/relay stack:

```text
shared packages build
relay typecheck
relay build
web typecheck
web build
docker compose config
```

### Gate 2 — Runtime smoke validation

Required for realtime/E2E changes:

```text
relay health
relay token
WebSocket auth
pre-key upload
pre-key fetch
A→B encrypted message
B→A encrypted message
chat.ack
offline queue delivery
```

### Gate 3 — Security review

Required for:

```text
auth
E2EE
key storage
moderation
admin actions
media upload
calls
AI memory/RAG
recommendations
marketplace payments
```

### Gate 4 — Operational readiness

Required before public deployment:

```text
TLS
firewall
secret rotation
backup plan
restore drill
log redaction
admin access policy
monitoring
rate limits
```

---

## 5. Bug prevention rules

### 5.1 No broad untested rewrites

Avoid large rewrites without a validation harness.

Prefer:

```text
small commits
one concern per commit
green CI after each meaningful step
clear rollback point
```

### 5.2 Typed contracts before runtime complexity

Before implementing complex features, define:

```text
event types
request/response schemas
DB schema
error codes
state transitions
privacy boundaries
```

### 5.3 Explicit error handling

Every critical path must handle:

```text
missing auth
expired token
network loss
reconnect
duplicate message
offline recipient
database error
Redis error
invalid payload
legacy compatibility edge case
```

### 5.4 No silent failures

If a feature degrades, it must expose controlled state:

```text
ack status
error code
retry possibility
log marker
user-safe UI state
```

---

## 6. Security and privacy checklist

Every new feature must answer:

```text
What data is stored?
Is any plaintext private content stored server-side?
Can the server read it?
Who can access it?
Is it logged?
Is it encrypted at rest or in transit?
Can it be deleted?
Can it be exported?
Can it be abused?
How is abuse detected without violating E2EE?
```

If these questions are not answered, the feature is not ready for implementation.

---

## 7. Feature ordering discipline

### Immediate foundation

```text
Phase A: realtime/E2E smoke test
Phase B: canonical users/chats/membership
```

### Next product layers

```text
media attachments
voice messages
moderation/admin foundation
recommendations foundation
video notes/stories
audio/video calls
local AI router
Qwen/fine-tuning/adapters
```

### Explicitly deferred until foundation is stable

```text
full local LLM fine-tuning
large recommendation ML
payments/escrow
public launch
large group calls
multi-device advanced sync
```

---

## 8. Admin and moderation standard

Moderation must protect users without breaking private encryption.

Allowed foundations:

```text
public content moderation
marketplace moderation
user reports
client-side safety checks
metadata/rate-limit abuse signals
admin review queue
appeals
audit logs
```

Forbidden shortcut:

```text
server-side plaintext scanning of private E2EE messages by default
```

Admin actions must be:

```text
role-based
audited
reversible where possible
reasoned
visible in logs
protected from abuse
```

---

## 9. AI system standard

Local AI must be introduced as architecture, not hype.

Correct order:

```text
model interface
capability registry
task router
local-first privacy rules
small model evaluation
benchmark harness
RAG boundaries
Qwen evaluation
LoRA/fine-tuning only after datasets and benchmarks are ready
```

AI must never become an excuse to weaken privacy or bypass deterministic product logic.

---

## 10. Deployment standard

The domain `presidium.su` is reserved, but public deployment must wait until minimum readiness.

Minimum public deployment criteria:

```text
CI green
Phase A smoke test passed
canonical auth/user/chat path in progress or complete
TLS configured
firewall configured
secrets rotated
admin access controlled
logs redacted
backup plan exists
```

---

## 11. Operating mode while no PC/VPS is available

During iPhone-only development periods, allowed work:

```text
docs
issues
architecture specs
API contracts
security checklists
roadmap decomposition
small safe GitHub API commits
```

Not allowed without runtime validation:

```text
large DB migrations
major runtime refactors
calls implementation
model training
production deployment
security-sensitive rewrites
```

---

## 12. Final rule

Presidium must be built like infrastructure for trust.

Every decision must support:

```text
privacy
security
reliability
clarity
maintainability
professional execution
```

If a task does not strengthen one of these, it should wait.
