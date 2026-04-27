# Day 1 Commit Notes

## Scope
Monorepo foundation for Presidium v2.6: workspace layout, turbo pipeline, shared types package.

## File-level notes
- `pnpm-workspace.yaml`: Defined workspace discovery for `apps/*`, `packages/*`, `services/*`.
- `turbo.json`: Added Turborepo task graph (`build`, `dev`, `lint`, `typecheck`) for multi-package orchestration.
- `package.json`: Switched root scripts to Turbo workspace commands and pinned toolchain metadata (`pnpm`, Node engine).
- `.gitignore`: Replaced with Day 1 baseline and added cache ignores for Turborepo/NPM local cache.
- `packages/shared-types/package.json`: Created publishable shared types package with build/typecheck scripts.
- `packages/shared-types/tsconfig.json`: Added strict TS build config for declaration output.
- `packages/shared-types/src/index.ts`: Added initial domain contract types (chat, e2ee, stories, feed, presence, ws protocol).
- `apps/web/package.json`: Added workspace package scaffold for web app module.
- `apps/desktop/package.json`: Added workspace package scaffold for desktop module.
- `apps/mobile/package.json`: Added workspace package scaffold for mobile module.
- `packages/shared-crypto/package.json`: Added workspace package scaffold for shared crypto module.
- `packages/shared-api/package.json`: Added workspace package scaffold for shared API module.
- `packages/shared-ui/package.json`: Added workspace package scaffold for shared UI module.
- `services/relay/package.json`: Added workspace package scaffold for relay service and db script stubs.
- `services/ai-worker/package.json`: Added workspace package scaffold for moderation/AI worker service.
- `infra/docker-compose.yml`: Added Day 1 infrastructure placeholder.
- `proto/relay.proto`: Added Day 1 gRPC contract placeholder.
- `LICENSE`, `AUTHORS`, `COPYRIGHT`: Added initial IP/legal metadata files for repository baseline.

## Validation
- `pnpm --filter @presidium/shared-types build` passed.
- `pnpm turbo run typecheck` passed across all workspace packages.
