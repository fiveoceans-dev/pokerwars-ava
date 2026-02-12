# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: Next.js + Tailwind UI and the `game-engine.ts` helper.
- `apps/ws-server`: Prisma-backed WebSocket service with schema, seeds, and tests.
- `packages/engine`: Shared poker logic compiled via `tsc` and consumed by both workspaces.
- `contracts/`: Foundry workspace for EVM contracts; treat build outputs as disposable.
- `docs/`, `scripts/`, and root helpers (`start.sh`, `sync_env.sh`) gather cross-cutting deployment and env guidance.

## Build, Test, and Development Commands
- `npm run dev` / `npm run dev:ws` launch the UI and WS server locally.
- `npm run build` or the workspace-specific `build:web`, `build:ws`, `build:packages` compiles production code.
- `npm run lint` and `npm run typecheck` enforce ESLint and TypeScript expectations.
- `npm run db:migrate` and `npm run db:generate` keep Prisma artifacts up to date.
- `AUTO_MIGRATE=true ./scripts/start_local.sh` recreates the Cloud Run stack (add `SEED_GAMES=true` when seeding).

## Coding Style & Naming Conventions
- TypeScript/TSX only; use PascalCase for React components, camelCase for helpers, and place tests in `__tests__/` or `*.test.ts[x]` files.
- `eslint.config.js` extends `@eslint/js`, `typescript-eslint`, React Hooks, and React Refresh rules—resolve warnings instead of silencing them.
- `apps/web` leans on Prettier (`npm run format` / `format:check`) and respects the shared aliases (`~~`, `../game-engine`).
- Keep imports grouped (external packages first, then workspace-relative paths) and minimize `any` usage.

## Testing Guidelines
- Vitest commands: `npm run test -w apps/ws-server`, `npx vitest run --config apps/web/vitest.config.ts`, and `npx vitest run --dir packages/engine`.
- Favor deterministic suites; mock timers or RNG when asserting engine rules before exercising WS flows.
- Naming conventions follow `*.test.ts[x]`, `test/`, or `__tests__/` so each workspace config picks them up automatically.

## Commit & Pull Request Guidelines
- History currently uses single-letter commits (e.g., `c`); prefer descriptive messages like `feat(ws): add table rejoin timeout`.
- PRs need a short summary, the commands you ran (lint/tests), any linked issues, and screenshots for UI changes.
- Call out new env vars or secrets so reviewers know what files or Cloud Run settings must update.

## Environment & Configuration Notes
- Treat the root `.env` (or `.env.local`) as the source of truth and sync it into `apps/web/.env.local` and `apps/ws-server/.env` via `./scripts/sync_env.sh`.
- Update `docs/env.md` when you add or drop required variables for local, Docker, or Cloud Run environments.
- `apps/web/.env.example` and `apps/ws-server/.env.example` show production-ready keys; never commit real secrets.
