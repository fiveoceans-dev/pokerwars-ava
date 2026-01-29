# PokerWars Monorepo

This repository hosts the PokerWars web client, the real-time WebSocket game server, and the shared poker engine.

## Directory layout

- `apps/web` - Next.js 15 app (Tailwind + DaisyUI + PWA) with wallet connectivity via wagmi + Web3Modal.
- `apps/ws-server` - WebSocket server that orchestrates multiplayer games using the shared engine.
- `packages/engine` - Shared poker engine consumed by both the web client and server.
- `contracts/` - Foundry workspace for EVM smart contracts.

## Quick start (local dev)

```bash
npm install
npm run build:packages

# Web app (default http://localhost:8080)
npm run dev

# WebSocket server (default ws://localhost:8081; falls back to 8099 in dev if 8081 is busy)
npm run dev:ws
```

Backend uses Postgres via Prisma. After changing schema run:

```bash
cd apps/ws-server
npx prisma migrate dev -n ledger_blockchain
npx prisma generate
```

### Local run checklist (full stack)

1) Postgres: start locally (example)
   ```bash
   docker run --name pokerwars-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pokerwars -p 5432:5432 -d postgres:16
   ```
2) Set `DATABASE_URL` in `apps/ws-server/.env` (format: `postgresql://user:pass@localhost:5432/pokerwars?schema=public`).
3) Run migrations + generate:
   ```bash
   npm run db:migrate
   npm run db:generate
   ```
4) Start WebSocket server:
   ```bash
   npm run dev:ws   # ws://localhost:8099 by default
   ```
5) Start web app (in another shell):
   ```bash
   npm run dev      # http://localhost:8080 with NEXT_PUBLIC_WS_URL=http://localhost:8099/api set in apps/web/.env.local
   ```

## Environment setup

Web app (`apps/web/.env.local`):
- Copy `apps/web/.env.example` to `.env.local`.
- Set `NEXT_PUBLIC_WS_URL` to the WebSocket server URL (e.g. `ws://localhost:8099`).
- Set `NEXT_PUBLIC_API_URL` to the HTTP API on the WebSocket server (e.g. `http://localhost:8099/api`).
- Set `NEXT_PUBLIC_APP_URL` in production to ensure correct Open Graph/Twitter metadata.
- Web3Modal uses `WALLETCONNECT_PROJECT_ID` or `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (required for QR connect).
- Hyperliquid mainnet/testnet require their `NEXT_PUBLIC_HYPERLIQUID_*` / `NEXT_PUBLIC_HYPERLIQUID_TESTNET_*` env vars.

WebSocket server (`apps/ws-server/.env`):
- Copy `apps/ws-server/.env.example` to `.env`.
- Set `ALLOWED_WS_ORIGINS` for production and `DEV_ALLOWED_WS_ORIGINS` for local development.
- Configure `PORT` if you need a different public port.

## Production parity (local)

Run the same containers that Cloud Run uses:

```bash
docker compose -f docker-compose.prod.yml up --build
```

Defaults:
- Web: http://localhost:8090
- WS: ws://localhost:8099

Override with environment variables if needed (e.g. `NEXT_PUBLIC_WS_URL`, `ALLOWED_WS_ORIGINS`).

## GCP deployment (Cloud Run)

We deploy both services from the same image (root `Dockerfile`) and select the runtime via `SERVICE`.

1) Copy the template and fill values:

```bash
cp .env.example .env
```

2) Deploy the WebSocket server first (sets long timeout for WS):

```bash
./scripts/gcp_deploy_ws.sh
```

3) Deploy the web app:

```bash
./scripts/gcp_deploy_web.sh
```

Notes:
- `ALLOWED_WS_ORIGINS` must include the web app URL.
- `NEXT_PUBLIC_WS_URL` should use `wss://` and `NEXT_PUBLIC_API_URL` should use `https://.../api`.
- Cloud Run injects `PORT=8080`; the scripts do not set `PORT` (reserved by Cloud Run).

## Build and run

```bash
# Build shared engine, web app, and ws server
npm run build

# Start via root entrypoint (defaults to web)
SERVICE=web npm start
SERVICE=ws-server npm start
```

## Scripts (root)

- `npm run dev` - web app
- `npm run dev:ws` - ws server
- `npm run build:packages` - build shared engine
- `npm run build:web` - build web app
- `npm run build:ws` - build ws server
- `npm run lint` - lint repo TypeScript sources
- `npm run typecheck` - typecheck web + engine
- `npm run db:generate` - regenerate Prisma client (ws-server schema)
- `npm run db:migrate` - run Prisma migrate dev (ws-server schema)

## Economy (ledger-first)

- Ledger + accounts + treasury act as a “vanilla blockchain” (see `docs/vanilla-blockchain.md`).
- Treasury total supply: 5,000,000,000 coins. Tickets: `ticket_x`, `ticket_y`, `ticket_z`.
- Free claim: 1,000 coins every 10 hours (`POST /api/user/claim`).
- Conversions: coins ↔ tickets with buy/sell rates (server enforced).
- Buy-ins, refunds, payouts flow through tournament escrow accounts and are recorded in the ledger.

## Bots

- S&G only (no bots in MTT). “Start w/ bots” fills empty S&G seats and starts immediately (requires ≥1 human).
- Bot names start with `bot_00000…`; each carries a ticket_x bounty on bust.
- Bot styles: random, tight, loose, aggressive; bots choose only valid available actions.
See `docs/bot-guide.md`.

## UI notes

- New terminal/HUD dark theme with bracket buttons.
- Content width is unified across navbar, hero, and pages.
- Learn page has 5 authored lessons; Free page offers timed coin claims; Account page uses DB-backed balances and convert modal.
Details in `docs/mtt_stt.md` and `docs/vanilla-blockchain.md`.

## GCP deploy (main repo)

- Use root `scripts/gcp_deploy_ws.sh` and `scripts/gcp_deploy_web.sh`.
- Required env: `PROJECT_ID`, `REGION`, `REPO_NAME`, `WS_SERVICE_NAME`, `WEB_SERVICE_NAME`, `DATABASE_URL`, `ALLOWED_WS_ORIGINS` (or `WEB_PUBLIC_URL`), plus `NEXT_PUBLIC_*` for the web.
- Both services build from the root `Dockerfile`; select service via `SERVICE` env at runtime.
- See `.env.example` for a template.

`gcp-project/` contains a separate minimal template (Next.js + Fastify) for reference only; production deploys should use the root scripts above.
