# Presidium Post-CI Engineering Roadmap

**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Status:** active engineering roadmap after green web/relay CI  

---

## 1. Current checkpoint

The active web/relay CI gate is green.

Validated by CI:

```text
shared packages build
relay typecheck
relay build
web typecheck
web build
docker compose config
```

This means the active MVP stack now has a baseline static quality gate.

It does not yet mean the full realtime product is production-ready. The next mandatory validation is the real two-user browser smoke test tracked in:

```text
Issue #2 — Phase A: validate realtime E2E smoke test for web/relay stack
```

---

## 2. Engineering rule from this point

No chaotic feature expansion.

Every new development block must follow:

```text
one phase → one issue/epic → implementation → CI green → smoke validation → next phase
```

Large systems such as local AI routing, model fine-tuning, audio/video calls, stories, video notes, and voice messages must not be mixed into one development sprint.

---

## 3. Mandatory next phase: Phase B

### Phase B — Canonical user/chat migration

This is the next engineering foundation.

Reason: the current web app still uses legacy Prisma/SQLite user/chat models with `cuid()` identifiers, while `services/relay` uses canonical Drizzle/PostgreSQL with UUID identifiers.

Temporary bridges currently exist for:

```text
legacy web user IDs
legacy cuid chat IDs
recipientId transport fallback
Redis pre-key storage
```

These bridges are acceptable for transition, but they must not become the permanent architecture.

Phase B goal:

```text
move user/chat identity and chat membership to the canonical relay/Postgres schema
```

Exit criteria:

```text
new chats are UUID-based
chat_members is canonical
relay no longer needs transport fallback for normal private chats
pre-key storage can move from Redis to Postgres
E2E delivery uses canonical membership path
```

---

## 4. Product feature phases after Phase B

### Phase C — Media and voice messages

Priority after canonical migration.

Scope:

```text
file/image attachments
voice messages
encrypted media metadata
upload/download through MinIO/S3 path
local playback UI
message status for media
```

Why before calls/stories:

```text
media transport is simpler than calls
voice messages reuse existing message delivery
attachments establish storage/security foundations
```

### Phase D — Video notes and stories

Scope:

```text
video circles / video notes
short ephemeral stories
story privacy controls
encrypted or access-controlled media delivery
expiration lifecycle
```

Why after media:

```text
stories and video circles require stable media upload, metadata, and playback infrastructure
```

### Phase E — Audio/video calls

Scope:

```text
call signaling
WebRTC session negotiation
ICE/STUN/TURN configuration
audio calls
video calls
call status events
missed call history
```

Why after media/stories:

```text
calls introduce realtime signaling complexity and require reliable WebSocket/session lifecycle
```

### Phase F — Local AI foundation

Scope:

```text
local model runtime abstraction
model capability registry
local task router
small local models first
privacy-safe local context layer
prompt templates
basic local RAG
```

Do not start with fine-tuning.

Start with routing and model interface contracts.

### Phase G — Qwen/Open local model adaptation

Scope:

```text
Qwen-family local model evaluation
quantization strategy
LoRA/fine-tuning experiments
small task-specific adapters
local benchmark harness
model update/versioning pipeline
```

This phase is large and must only start after the local AI foundation is stable.

---

## 5. Recommended next three issues

```text
Issue #2 — Phase A smoke test: complete manually
Issue #3 — Phase B canonical user/chat migration
Issue #4 — Phase C media and voice message foundation
```

AI routing and fine-tuning should be documented as a future epic, not started as immediate implementation.

---

## 6. Priority decision

Immediate priority:

```text
1. Complete Issue #2 smoke test
2. Implement Phase B canonical migration
3. Then build voice/media messages
4. Then stories/video notes
5. Then calls
6. Then local AI routing
7. Then fine-tuning/adapters
```

This order minimizes rework and keeps Presidium moving as a professional product, not as a collection of disconnected experiments.
