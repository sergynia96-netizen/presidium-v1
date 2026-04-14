# 📌 PRESIDIUM — Current State (April 14, 2026)

> Snapshot date: **April 14, 2026**  
> Scope: frontend + relay + E2E + profile/contacts/media  
> Source: actual local checks in this workspace

---

## 1) Verified now

| Area | Status | Evidence |
|------|--------|----------|
| Frontend typecheck | ✅ Pass | `npm run -s typecheck` |
| Frontend production build | ✅ Pass | `npm run -s build` |
| Relay typecheck | ✅ Pass | `npm run -s relay:typecheck` |
| Relay health endpoint | ✅ Pass | `GET http://localhost:3001/health` returns `status: ok` |
| Relay WS auth flow | ✅ Pass | direct WS check returned `{"type":"connected",...}` |

---

## 2) Important implemented fixes

### Security
1. **Identity private key encryption at rest** in IndexedDB.
   - `src/lib/crypto/vault.ts`: PBKDF2 + AES-GCM vault.
   - `src/lib/crypto/store.ts`: encrypted `identity_encrypted` storage + legacy migration path.
   - `src/components/providers/e2e-provider.tsx`: vault unlock dialog before E2E init.

### Messaging/media
2. **Media fallback integrated** (not only created).
   - `src/components/messenger/media-fallback.tsx`
   - `src/components/messenger/chat-view/message-bubble.tsx`
   - Images/videos now use fallback wrappers for unavailable media URLs.

### Profile
3. **Avatar upload implemented end-to-end.**
   - API: `src/app/api/upload/avatar/route.ts`
   - UI: `src/components/messenger/profile/edit-profile.tsx`
   - Saves avatar to `/public/uploads/avatars/<userId>/...` and updates `user.avatar`.

### Relay / E2E client
4. **Relay auth/connectivity path corrected and validated.**
   - token flow, auth payload format, ws URL normalization, and reconnect logging in `src/lib/crypto/relay-client.ts`.
   - token helpers in `src/lib/relay-auth.ts`.

### Contacts / profile correctness
5. **Username/phone/profile update flow repaired** in API + UI.
   - Contacts lookup/add path updated.
   - Profile edit and header display updated (phone/username).

---

## 3) Known limitations still open

1. `useWebSocket` remains a **stub** intentionally; runtime relies on `RelayE2EClient`.
2. `src/lib/websocket-manager.ts` exists but is **not fully integrated** as single runtime transport.
3. Vault password is session-scoped (sessionStorage): UX hardening can be improved.
4. Full browser smoke test still recommended after each env change:
   - login
   - `/api/relay/token`
   - relay WS connected in browser console
   - send/receive encrypted message between two accounts

---

## 4) Environment reality check (current workspace)

1. `.env.local` currently uses local dev DB (`file:./dev.db`) and relay URLs on `localhost:3001`.
2. Relay `.env` has `PORT=3001` and `JWT_SECRET` aligned with web.
3. Production readiness still requires final secret rotation and production env hardening.

---

## 5) Next recommended actions

1. Integrate `websocket-manager.ts` as the single transport layer.
2. Add automated E2E smoke test for relay auth/connect/send/receive.
3. Add cleanup/retention strategy for uploaded avatars in `/public/uploads/avatars`.
4. Finalize production env template with explicit required variables and examples.
