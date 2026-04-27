# ============================================
# PRESIDIUM - Relay Production Dockerfile
# ============================================
# Build context must be the repository root because @presidium/relay
# depends on workspace packages from packages/*.
#
# Used by root docker-compose.yml:
#   build:
#     context: .
#     dockerfile: services/relay/Dockerfile
# ============================================

FROM node:20-alpine AS base

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    libc6-compat \
    openssl \
  && curl -fsSL https://bun.sh/install | bash \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/relay/package.json ./services/relay/package.json
COPY services/relay/tsconfig.json ./services/relay/tsconfig.json
COPY services/relay/drizzle.config.ts ./services/relay/drizzle.config.ts

RUN pnpm install --frozen-lockfile --filter @presidium/relay...

FROM deps AS builder

COPY services/relay/src ./services/relay/src
COPY services/relay/drizzle.config.ts ./services/relay/drizzle.config.ts
COPY services/relay/tsconfig.json ./services/relay/tsconfig.json
COPY packages ./packages

RUN pnpm --filter @presidium/relay typecheck
RUN pnpm --filter @presidium/relay build

FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 presidium \
  && adduser --system --uid 1001 relay

COPY --from=deps --chown=relay:presidium /app/node_modules ./node_modules
COPY --from=deps --chown=relay:presidium /app/services/relay/node_modules ./services/relay/node_modules
COPY --from=deps --chown=relay:presidium /app/packages ./packages
COPY --from=builder --chown=relay:presidium /app/services/relay/dist ./services/relay/dist
COPY --from=builder --chown=relay:presidium /app/services/relay/package.json ./services/relay/package.json
COPY --from=builder --chown=relay:presidium /app/services/relay/drizzle.config.ts ./services/relay/drizzle.config.ts

USER relay
EXPOSE 3001

CMD ["bun", "services/relay/dist/index.js"]
