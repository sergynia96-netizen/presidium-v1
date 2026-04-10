# Docker Deployment Guide

## Quick Start

```bash
# 1. Setup environment variables
cp .env.production.example .env.production
# Edit .env.production with secure values

# 2. Start all services
docker compose up -d

# 3. Verify
docker compose ps
curl http://localhost:3000
```

## Architecture

```
app (:3000) ──┐
              ├── db (:5432) PostgreSQL
relay (:3001)─┤
              ├── redis (:6379)
minio (:9000)─┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| app | 3000 | Next.js application |
| relay | 3001 | Relay backend for E2E messaging |
| db | 5432 | PostgreSQL database |
| redis | 6379 | Redis for session storage |
| minio | 9000/9001 | S3-compatible object storage |

## Common Commands

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f app

# Run migrations
docker compose exec app npx prisma migrate deploy

# Restart service
docker compose restart relay

# Stop (keep data)
docker compose down

# Stop and delete data
docker compose down -v
```

## Environment Variables

See `.env.production.example` for all available variables.

Required:
- `NEXTAUTH_SECRET` - NextAuth.js secret
- `DB_PASSWORD` - PostgreSQL password
- `RELAY_DB_PASSWORD` - Relay database password

Generate secrets:
```bash
openssl rand -base64 32
```

## Troubleshooting

### Database not ready
```bash
docker compose logs db
docker compose restart db
```

### Migration errors
```bash
docker compose exec app npx prisma migrate reset
docker compose exec app npx prisma migrate deploy
```

### Port conflicts
Edit `docker-compose.yml` port mappings if ports are already in use.
