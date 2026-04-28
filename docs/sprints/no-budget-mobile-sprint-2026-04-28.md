# No-Budget Mobile Development Sprint

**Date:** 2026-04-28  
**Duration:** 7 days  
**Context:** no PC access, no VPS budget yet, iPhone-only workflow  
**Project:** Presidium Messenger  
**Mode:** GitHub + ChatGPT mobile + CI + issues/docs/specs  

---

## 1. Situation

The development machine is temporarily unavailable and VPS hosting has not been purchased yet.

This must not stop project progress.

The repository already has a green active-stack CI gate for:

```text
shared packages build
relay typecheck
relay build
web typecheck
web build
docker compose config
```

Therefore, the next week should be used for work that can be completed from mobile without paid infrastructure.

---

## 2. Sprint principle

No chaotic development.

During this no-budget sprint, we only do work that is valuable without a local machine:

```text
architecture
technical specs
GitHub issues
API contracts
migration plans
security policies
moderation/admin/recommendation design
CI/QA planning
small safe repository changes through GitHub API
```

We do not attempt heavy local builds, Docker runtime tests, or model experiments until a PC/VPS is available.

---

## 3. Main objective for the week

Prepare Presidium for the next engineering phase so that, when a PC or VPS is available, implementation can start immediately and professionally.

The main target remains:

```text
Phase B — canonical user/chat migration to relay/Postgres
```

---

## 4. What can be done from iPhone only

### 4.1 GitHub project organization

- [ ] Keep active issues clean and phase-based.
- [ ] Break Phase B into smaller implementation issues.
- [ ] Document acceptance criteria for each issue.
- [ ] Record dependencies between phases.
- [ ] Keep roadmap synchronized with real engineering status.

### 4.2 Architecture work

- [ ] Specify canonical user identity bridge.
- [ ] Specify canonical private chat creation flow.
- [ ] Specify chat membership migration.
- [ ] Specify pre-key Postgres persistence.
- [ ] Specify fallback deprecation plan.

### 4.3 Product systems design

- [ ] Moderation architecture.
- [ ] Admin system architecture.
- [ ] Recommendation system architecture.
- [ ] Media/voice message architecture.
- [ ] Stories/video notes architecture.
- [ ] Calls architecture.
- [ ] Local AI router architecture.

### 4.4 Deployment preparation

- [ ] Document `presidium.su` domain strategy.
- [ ] Prepare DNS plan.
- [ ] Prepare future VPS setup checklist.
- [ ] Prepare production/staging environment variable matrix.
- [ ] Prepare security checklist for browser IDE/code-server.

### 4.5 Code-level work possible through GitHub API

Small safe changes only:

- [ ] Documentation.
- [ ] Type/interface contracts.
- [ ] Issue templates.
- [ ] Config comments.
- [ ] QA checklists.
- [ ] Non-runtime architectural scaffolding.

Avoid broad runtime refactors until local/VPS validation is available.

---

## 5. Seven-day sprint plan

### Day 1 — Phase B decomposition

Goal:

```text
Turn Phase B into precise implementation issues.
```

Deliverables:

- canonical user bridge issue;
- canonical chat creation issue;
- canonical membership issue;
- pre-key Postgres issue;
- fallback deprecation issue.

### Day 2 — Domain and deployment plan

Goal:

```text
Prepare presidium.su for future VPS deployment.
```

Deliverables:

- DNS plan;
- Nginx reverse proxy plan;
- TLS/Let's Encrypt plan;
- environment variable matrix;
- staging/production separation.

### Day 3 — Moderation and admin architecture

Goal:

```text
Define practical Trust & Safety foundation.
```

Deliverables:

- moderation taxonomy;
- report flow;
- admin roles;
- audit logs;
- strike system;
- private E2EE-safe moderation boundaries.

### Day 4 — Recommendations architecture

Goal:

```text
Define privacy-safe recommendation surfaces.
```

Deliverables:

- feed ranking v1;
- story ranking v1;
- marketplace ranking v1;
- anti-spam/risk penalties;
- user opt-out/reset policy.

### Day 5 — Media/voice architecture

Goal:

```text
Prepare the next user-facing feature after Phase B.
```

Deliverables:

- encrypted media upload contract;
- voice message lifecycle;
- metadata schema draft;
- MinIO/S3 usage plan;
- playback UI states.

### Day 6 — Calls/stories/local AI ordering

Goal:

```text
Prevent feature chaos by defining strict implementation order.
```

Deliverables:

- video notes plan;
- stories plan;
- calls signaling plan;
- local AI router plan;
- Qwen adaptation deferred roadmap.

### Day 7 — Review and execution package

Goal:

```text
Prepare the repository so implementation can resume immediately on PC/VPS.
```

Deliverables:

- updated roadmap;
- issue dependencies;
- Phase B execution checklist;
- VPS setup checklist;
- next commit plan.

---

## 6. What not to do this week

Do not start:

```text
Qwen fine-tuning
local model training
large runtime refactors
calls implementation
stories implementation
marketplace payments
major database migration code without runtime validation
```

Reason: these tasks need a reliable development environment and runtime testing.

---

## 7. Free tools for the week

Use only zero-cost tools:

```text
ChatGPT mobile
GitHub mobile/web
GitHub Issues
GitHub Actions
repository docs
GitHub API commits through ChatGPT
```

Optional from iPhone:

```text
GitHub mobile app
Working Copy app if already available
Safari GitHub web editor
```

No VPS is required for this sprint.

---

## 8. Definition of done

The no-budget mobile sprint is successful if, by the end of the week:

```text
Phase B is fully decomposed
moderation/admin/recommendations are specified
presidium.su deployment plan exists
future VPS setup plan exists
media/voice/calls/AI phases are ordered
repository has clean docs/issues for execution
```

This keeps Presidium moving professionally even without a PC or hosting budget.
