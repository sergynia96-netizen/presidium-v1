# presidium.su Domain Deployment Plan

**Date:** 2026-04-28  
**Domain:** `presidium.su`  
**Status:** domain purchased, hosting/VPS not purchased yet  
**Purpose:** prepare future deployment without spending money now  

---

## 1. Current status

The domain `presidium.su` is already owned/reserved.

No VPS or production hosting is currently available.

This document prepares the domain strategy so deployment can start quickly once hosting is purchased.

---

## 2. Future DNS target

When VPS is purchased, point DNS records to the VPS IPv4 address.

Recommended records:

```text
A      @       <VPS_IPV4>
A      www     <VPS_IPV4>
A      app     <VPS_IPV4>
A      relay   <VPS_IPV4>
A      api     <VPS_IPV4>
```

Optional IPv6 records if VPS IPv6 is available:

```text
AAAA   @       <VPS_IPV6>
AAAA   www     <VPS_IPV6>
AAAA   app     <VPS_IPV6>
AAAA   relay   <VPS_IPV6>
AAAA   api     <VPS_IPV6>
```

---

## 3. Recommended subdomain layout

### Public landing / web app

```text
https://presidium.su
https://www.presidium.su
```

### Application

```text
https://app.presidium.su
```

### Relay

```text
https://relay.presidium.su
wss://relay.presidium.su/ws
```

### API

```text
https://api.presidium.su
```

For early MVP, `presidium.su` may directly serve the web app and proxy relay separately.

---

## 4. Future Nginx reverse proxy plan

Nginx should terminate TLS and proxy to internal services.

Target internal services:

```text
web app:  http://127.0.0.1:3000
relay:    http://127.0.0.1:3001
relay ws: ws://127.0.0.1:3001/ws
```

Recommended external mapping:

```text
presidium.su          → web app
www.presidium.su      → redirect to presidium.su
app.presidium.su      → web app
relay.presidium.su    → relay HTTP + WebSocket
api.presidium.su      → future API gateway or web app API routes
```

---

## 5. TLS plan

Use Let's Encrypt with Certbot.

Initial certificate set:

```text
presidium.su
www.presidium.su
app.presidium.su
relay.presidium.su
api.presidium.su
```

Renewal should be automated through systemd timer or cron.

---

## 6. Environment variables for production domain

When deploying to VPS, update environment variables:

```text
NEXTAUTH_URL=https://app.presidium.su
NEXT_PUBLIC_RELAY_HTTP_URL=https://relay.presidium.su
NEXT_PUBLIC_RELAY_WS_URL=wss://relay.presidium.su/ws
CORS_ORIGINS=https://presidium.su,https://www.presidium.su,https://app.presidium.su
```

Relay must accept the web origin through CORS.

---

## 7. Security requirements

Before exposing any service publicly:

```text
firewall enabled
only 22/80/443 open
SSH key auth preferred
root password login disabled after setup
code-server protected by password and HTTPS
production secrets not committed
.env.local not committed
Docker services not directly exposed unless necessary
```

---

## 8. No-budget work possible now

Without hosting, we can still prepare:

```text
DNS record plan
Nginx config draft
TLS checklist
environment matrix
deployment issue
security checklist
```

Do not point DNS anywhere until VPS is purchased.

---

## 9. Deployment phases

### Phase 1 — domain reserved

Current state.

```text
presidium.su purchased
no hosting yet
no DNS target yet
```

### Phase 2 — VPS purchased

```text
install Ubuntu
configure firewall
install Docker/Node/pnpm/Bun
clone repository
configure .env.local
run CI-equivalent local checks
```

### Phase 3 — staging deployment

```text
app.presidium.su
relay.presidium.su
Postgres
Redis
MinIO
```

### Phase 4 — production hardening

```text
TLS auto-renew
backups
monitoring
log rotation
secret rotation
admin access policy
```

---

## 10. Rule

The domain is an asset, not a reason to rush production.

Do not publish Presidium publicly until:

```text
CI is green
Phase A smoke-test passes
basic auth/security is verified
secrets are rotated
firewall and TLS are configured
```
