# Relay Auth Compatibility Decision

**Status:** Accepted  
**Date:** 2026-04-28  
**Maintainer:** Sergey Karnaukh  
**Scope:** `services/relay` WebSocket authentication compatibility

---

## Summary

The production relay now supports two WebSocket authentication paths:

1. native/service clients may authenticate during the connection upgrade;
2. browser clients may connect first and immediately send an auth envelope.

This decision keeps the existing web client compatible while preserving the production relay as the canonical backend.

---

## Rationale

The existing browser client already performs post-connect WebSocket authentication. Forcing browser clients to put access credentials into the connection URL would increase migration risk and may expose sensitive material through browser, proxy, or server logs.

The relay therefore accepts a socket without an upgrade credential, keeps it unauthenticated, and rejects all normal traffic until a valid auth envelope is received.

---

## Implemented behavior

When a socket connects without upgrade credentials:

1. relay opens the connection;
2. relay sends `auth.required`;
3. client sends `auth` with its access credential in the payload;
4. relay verifies it;
5. relay marks the socket authenticated;
6. relay registers local socket state, Redis socket state, and presence;
7. relay sends `auth.success`;
8. relay also sends `connected` for backward compatibility with the current web client.

When a socket connects with upgrade credentials:

1. relay verifies during upgrade/open;
2. relay marks the socket authenticated;
3. relay sends `auth.success` and `connected`.

Unauthenticated sockets cannot route chat, call, story, presence, typing, or read messages.

---

## Compatibility boundary

This compatibility layer is intentionally limited to authentication and connection state.

It does not make the relay accept legacy message delivery types. The next migration step is still to replace the old outgoing `relay.envelope` message with the production `chat.message` protocol.

---

## Next implementation step

Implement an outgoing message adapter in the web relay client:

```text
EncryptedEnvelope -> chat.message payload
```

The adapter must not rewrite E2E cryptography. It should wrap the existing encrypted envelope as an opaque encrypted payload for relay transport and metadata storage.
