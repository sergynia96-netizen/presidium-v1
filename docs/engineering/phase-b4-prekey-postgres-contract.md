# Phase B4 Pre-key Postgres Contract

**Date:** 2026-04-28  
**Project:** Presidium Messenger  
**Phase:** B4  
**Issue:** #7 — migrate pre-key bundle storage from Redis to Postgres  
**Status:** contract/specification, not yet implemented  

---

## 1. Purpose

Phase B4 migrates pre-key bundle storage from temporary Redis transition storage to canonical relay/Postgres persistence.

This phase must preserve E2EE boundaries.

The server may store public key material required for session establishment, but must never store private keys or decrypted private message content.

---

## 2. Current state

The relay currently exposes compatibility pre-key routes:

```text
POST /api/keys/upload
GET  /api/keys/:userId
```

The same routes may also be mounted at:

```text
/keys/*
```

Current transition behavior:

```text
pre-key bundle stored in Redis
bundle key linked to current user identity
TTL-based transition storage
```

This was acceptable while web users and chats were still legacy `cuid()` based.

After Phase B1/B2, canonical users and chats should use Postgres-backed pre-key persistence.

---

## 3. Dependency chain

Phase B4 depends on Phase B1.

Required from Phase B1:

```text
web user resolves canonical relay user UUID
relay JWT subject can be canonical UUID
legacy web user ID is mapped uniquely
```

Recommended dependency from Phase B2/B3:

```text
new private chats use canonical relay user IDs
new messages can use canonical membership path
```

Reason:

```text
pre-key ownership must be tied to canonical relay user UUIDs
```

---

## 4. Security boundary

Allowed to store server-side:

```text
identity public key
signed pre-key public key
signed pre-key id
signed pre-key signature
one-time pre-key public keys
one-time pre-key ids
upload timestamps
device id if multi-device is introduced
```

Forbidden to store server-side:

```text
identity private key
signed pre-key private key
one-time pre-key private keys
E2E session secrets
plaintext private messages
decrypted attachments
raw local key store backups unless separately encrypted client-side
```

The server must not be able to decrypt private chat content.

---

## 5. Target data model

### 5.1 Identity key table

Recommended table:

```text
user_identity_keys
```

Fields:

```text
id uuid primary key
user_id uuid not null references users(id) on delete cascade
identity_key text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraint:

```text
unique(user_id)
```

### 5.2 Signed pre-key table

Recommended table:

```text
user_signed_pre_keys
```

Fields:

```text
id uuid primary key
user_id uuid not null references users(id) on delete cascade
key_id integer not null
public_key text not null
signature text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
rotated_at timestamptz nullable
```

Constraint:

```text
unique(user_id, key_id)
```

Recommended lookup:

```text
latest active signed pre-key per user
```

### 5.3 One-time pre-key table

Recommended table:

```text
user_one_time_pre_keys
```

Fields:

```text
id uuid primary key
user_id uuid not null references users(id) on delete cascade
key_id integer not null
public_key text not null
claimed_at timestamptz nullable
claimed_by uuid nullable references users(id) on delete set null
created_at timestamptz not null default now()
expires_at timestamptz nullable
```

Constraints:

```text
unique(user_id, key_id)
index(user_id, claimed_at)
index(expires_at)
```

---

## 6. Upload contract

Endpoint:

```text
POST /api/keys/upload
```

Authentication:

```text
Authorization: Bearer <relay JWT>
```

Required identity:

```text
JWT sub = canonical relay user UUID for canonical path
```

Input shape:

```json
{
  "identityKey": "base64-or-encoded-public-key",
  "signedPreKey": {
    "keyId": 1,
    "publicKey": "base64-or-encoded-public-key",
    "signature": "base64-or-encoded-signature"
  },
  "oneTimePreKeys": [
    {
      "keyId": 1001,
      "publicKey": "base64-or-encoded-public-key"
    }
  ]
}
```

Required behavior:

```text
upsert identity key by user_id
upsert signed pre-key by user_id + key_id
insert/upsert one-time pre-keys by user_id + key_id
reject invalid or oversized payloads
never store private keys
return safe upload metadata
```

Response shape:

```json
{
  "success": true,
  "data": {
    "userId": "canonical-relay-user-uuid",
    "uploadedAt": 0,
    "oneTimePreKeyCount": 0,
    "storage": "postgres"
  }
}
```

---

## 7. Fetch contract

Endpoint:

```text
GET /api/keys/:userId
```

Authentication:

```text
Authorization: Bearer <relay JWT>
```

Path parameter:

```text
canonical relay user UUID preferred
legacy user id allowed only through compatibility resolver during migration
```

Required behavior:

```text
fetch identity public key
fetch latest active signed pre-key
claim one available one-time pre-key atomically if possible
return public bundle
```

Response shape:

```json
{
  "identityKey": "public-key",
  "signedPreKey": {
    "keyId": 1,
    "publicKey": "public-key",
    "signature": "signature"
  },
  "oneTimePreKeys": [
    {
      "keyId": 1001,
      "publicKey": "public-key"
    }
  ],
  "userId": "canonical-relay-user-uuid",
  "uploadedAt": 0,
  "storage": "postgres"
}
```

---

## 8. One-time pre-key claim strategy

Recommended canonical behavior:

```text
fetch one unclaimed pre-key
mark claimed_at and claimed_by in one transaction
return it in bundle
```

If no one-time pre-key is available:

```text
return identity key + signed pre-key only
include low_prekey_count marker
client should upload refill batch
```

Do not fail hard unless the client protocol requires one-time pre-key strictly.

Recommended warning:

```text
LOW_ONE_TIME_PREKEY_COUNT
```

---

## 9. Limits and validation

Required limits:

```text
max identity key length
max signed pre-key length
max signature length
max one-time pre-keys per upload
max one-time pre-keys stored per user
```

Recommended initial limits:

```text
identityKey <= 8192 chars
signedPreKey.publicKey <= 8192 chars
signedPreKey.signature <= 8192 chars
oneTimePreKeys per upload <= 100
stored unclaimed oneTimePreKeys per user <= 500
```

Invalid payloads must return:

```text
VALIDATION_ERROR
```

without logging key contents.

---

## 10. Redis compatibility during migration

During Phase B4, Redis fallback may remain for legacy users.

Allowed behavior:

```text
canonical UUID user → Postgres primary
legacy unresolved user → Redis compatibility fallback
```

Required response marker:

```text
storage = postgres | redis_compat
```

Fallback must be observable but must not leak key material into logs.

---

## 11. Error codes

Required errors:

```text
AUTH_MISSING
AUTH_INVALID_TOKEN
USER_NOT_FOUND
PREKEY_BUNDLE_NOT_FOUND
PREKEY_BUNDLE_CORRUPTED
PREKEY_UPLOAD_FAILED
PREKEY_FETCH_FAILED
PREKEY_CLAIM_FAILED
VALIDATION_ERROR
```

Errors must not expose:

```text
private keys
public key raw values in logs
JWT
secrets
DB connection strings
```

---

## 12. Logging policy

Allowed logs:

```text
userId
storage mode
oneTimePreKeyCount
low pre-key count warning
error code
latency
```

Forbidden logs:

```text
identityKey value
signedPreKey public key value
signature value
oneTimePreKey public key values
JWT contents
private key material
```

---

## 13. Rotation policy

Initial MVP policy:

```text
identity key: stable, replace only on account/device reset
signed pre-key: client may rotate periodically
one-time pre-keys: consumed/claimed per session setup
```

Future policy:

```text
multi-device keys
key transparency
safety number UX
compromised device reset
signed pre-key rotation schedule
```

Future policy is out of scope for B4.

---

## 14. Runtime validation checklist

When PC/VPS/Codex sandbox is available:

```text
1. Create canonical relay user
2. Upload pre-key bundle
3. Confirm Postgres identity key row exists
4. Confirm Postgres signed pre-key row exists
5. Confirm Postgres one-time pre-key rows exist
6. Fetch recipient pre-key bundle
7. Confirm one-time pre-key is claimed or returned according to strategy
8. Confirm Redis is not primary for canonical user
9. Confirm legacy fallback still does not crash
10. Establish E2E session using fetched bundle
11. Send A→B encrypted message
12. Send B→A encrypted message
13. Confirm no private keys or public key contents are logged
```

---

## 15. Codex/cloud validation use

Codex can help validate B4 by running:

```text
relay typecheck
relay build
schema tests if added
pre-key route unit/integration tests
```

Codex can help create tests for:

```text
upload validation
Postgres upsert behavior
one-time pre-key claim behavior
Redis compatibility fallback
```

Codex does not replace final two-browser E2E validation.

---

## 16. Forbidden shortcuts

Do not:

```text
store private keys
store plaintext messages
log public key raw values
use Redis as permanent primary storage for canonical users
key pre-key bundles only by email
ignore canonical relay user UUID
make one-time pre-key claim non-atomic
allow unbounded one-time pre-key growth
remove Redis compatibility before legacy path is safe
```

---

## 17. Phase B4 exit criteria

Phase B4 is complete only when:

```text
canonical users upload pre-key bundles to Postgres
canonical users fetch pre-key bundles from Postgres
one-time pre-key strategy is implemented or explicitly deferred with safe behavior
Redis is compatibility-only for unresolved legacy cases
no private key material is stored server-side
no key material is logged
active CI is green
E2E session setup still works
manual or Codex-assisted integration validation passes
```

After B4 passes, Phase B5 fallback instrumentation/deprecation can be finalized.
