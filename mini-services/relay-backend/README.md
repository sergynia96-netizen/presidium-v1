# Relay Backend (Mini-Service)

This service is imported from `backend.tar` and integrated as a sidecar relay backend.

It provides:
- JWT auth (`/api/auth/*`)
- contacts, groups, channels APIs
- WebSocket signaling relay on `/ws`
- basic presence tracking

## Run

```bash
bun install
bun run dev
```

By default it runs on `http://localhost:3001`.

## Environment

Copy `.env.example` to `.env` in this folder and set values.

Important:
- `JWT_SECRET` (or inherited `NEXTAUTH_SECRET`) is required.
- `CORS_ORIGINS` is comma-separated list of allowed web origins.

## Notes

- This backend is integrated as a mini-service. Your root `.zscripts/dev.sh` will auto-start it when scanning `mini-services/*`.
- Current frontend integration is optional via `NEXT_PUBLIC_RELAY_WS_URL`.

