# Используем Bun для Relay
FROM oven/bun:1.1.42-alpine AS builder
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Копируем исходники и Prisma-схему
COPY prisma ./prisma
COPY src ./src

# 🔥 ВАЖНО: заменяем схему на PostgreSQL и генерируем клиент
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma
RUN bunx prisma generate

# Финальный образ
FROM oven/bun:1.1.42-alpine AS runner
WORKDIR /app

# Копируем node_modules, сгенерированный клиент и исходники
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://presidium:password@db:5432/relay?schema=public

EXPOSE 3001

# Запускаем сервер (без db push, т.к. схема уже синхронизируется отдельно или при первом запуске)
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun src/index.ts"]
