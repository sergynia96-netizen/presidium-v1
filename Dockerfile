# ============================================
# PRESIDIUM - Production Dockerfile
# ============================================

FROM node:20-alpine AS base

# 2. Установка зависимостей
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install --legacy-peer-deps

# 3. Сборка приложения
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_RELAY_HTTP_URL=http://localhost:3001
ARG NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:3001/ws
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ARG NEXT_PUBLIC_STORAGE_QUOTA_MB=1024
ENV NEXT_PUBLIC_RELAY_HTTP_URL=$NEXT_PUBLIC_RELAY_HTTP_URL
ENV NEXT_PUBLIC_RELAY_WS_URL=$NEXT_PUBLIC_RELAY_WS_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_STORAGE_QUOTA_MB=$NEXT_PUBLIC_STORAGE_QUOTA_MB

# Заменяем схему на PostgreSQL и генерируем Prisma Client
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 4. Финальный образ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl wget
RUN npm install -g prisma@6.19.2

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Копируем Prisma для миграций
COPY --from=builder /app/prisma ./prisma

# Ensure runtime-writable uploads directory for /api/upload
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public /app/prisma

USER nextjs

EXPOSE 3000

# Используем Prisma CLI, зафиксированный по версии проекта
CMD ["sh", "-c", "prisma db push --skip-generate && node server.js"]
