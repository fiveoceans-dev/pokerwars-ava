# Repository Guidelines

## Project Structure & Module Organization
- Frontend: `app/`, `components/`, `hooks/`, `styles/` (Next.js 15 + Tailwind/DaisyUI)
- Game Engine: `server/game-engine/` (TypeScript, event-driven poker FSM with tests)
- WebSocket Server: `server/` (Node/WS; entry `src/index.ts`)
- Assets: `assets/`, `public/`
- Tests: React tests in `app/**/*.test.tsx`; engine tests in `server/game-engine/**/__tests__/*.test.ts`

## Build, Test, and Development Commands
- Run app (Next.js): `npm run dev` → http://localhost:3005
- Build app: `npm run build` | Start prod: `npm run start`
- Lint/format: `npm run lint` | `npm run format` | check: `npm run format:check`
- Type-check: `npm run check-types`
- Unit tests (frontend): `npm test` | coverage: `npm run coverage`
- Engine/server tests: `cd server && npm run test`
- WebSocket server (dev): `cd server && npm run dev`

## Coding Style & Naming Conventions
- Language: TypeScript. Components in React 19 with client/server components.
- Formatting: Prettier (enforced by `npm run format`); ESLint for lint errors.
- Indentation: 2 spaces; avoid trailing whitespace.
- Naming: PascalCase React components (`components/FooBar.tsx`), camelCase for vars/functions, kebab-case for file paths when not components.

## Testing Guidelines
- Framework: Vitest (+ jsdom for React). Place tests next to files or under `__tests__`.
- Naming: `*.test.ts`/`*.test.tsx`.
- Engine tests cover action order, min-raise rules, timers, and showdown logic.
- Run selectively: `vitest -t "keyword"` or `vitest run path/to/file.test.ts`.

## Commit & Pull Request Guidelines
- Commits: Use clear, imperative subjects (e.g., "Fix BB option on preflop"). Keep scope focused.
- PRs: Include summary, screenshots (UI), reproduction/verification steps, and linked issues. Note any schema or env changes.
- CI expectations: lint, type-check, and tests should pass locally before opening PRs.

## Security & Configuration Tips
- Environment: copy `.env.example` → `.env`. Do not commit secrets.
- Networked services (Redis/WS) are optional in local dev; guard feature flags accordingly.
- Never log private keys or wallet secrets; use `utils/` helpers for masking addresses.

## Architecture Overview (Brief)
- UI (Next.js) renders table, controls, and wallet sync.
- Event-driven Poker Engine (server/game-engine) provides pure reducer + side effects.
- WebSocket adapter (`server`) bridges engine state to clients and timers.
