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

For a one-shot local bootstrap (migrate + generate + optional seed), run:

```bash
AUTO_MIGRATE=true ./scripts/docker_up.sh
```

Optional seed:
```bash
SEED_GAMES=true AUTO_MIGRATE=true ./scripts/docker_up.sh
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
   npm run dev      # http://localhost:8080 with NEXT_PUBLIC_API_URL=http://localhost:8099/api set in apps/web/.env.local
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

See `docs/env.md` for a full env matrix (local, docker, and Cloud Run).
You can sync root `.env` into app-specific files with:
```bash
./scripts/sync_env.sh
```

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
The runtime image uses Debian (bookworm-slim) so Prisma engines target OpenSSL 3 and are compatible with Cloud Run.

### Step-by-step (production deploy)

1) **Prepare env**
   ```bash
   cp .env.example .env
   ```
   Fill at minimum:
   - `PROJECT_ID`, `REGION`, `REPO_NAME`
   - `WEB_SERVICE_NAME`, `WS_SERVICE_NAME`
   - `WEB_PUBLIC_URL`, `WS_PUBLIC_URL`
   - `WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - `ALLOWED_WS_ORIGINS`
   - `DB_INSTANCE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (and optionally `DB_TIER`)
   - `NEXT_PUBLIC_HYPERLIQUID_*` / `NEXT_PUBLIC_HYPERLIQUID_TESTNET_*`

2) **Login + set gcloud defaults**
   ```bash
   gcloud auth login
   ./scripts/gcp_use_env.sh
   ```

3) **Create Cloud SQL (optional, automated)**
   ```bash
   CREATE_CLOUDSQL=true ./scripts/gcp_deploy_ws.sh
   ```
   This creates the instance/db/user if missing, builds the image, and deploys WS.

4) **Grant DB privileges (first-time only)**
   If migrations fail with permission errors (P1010), grant privileges using an admin role:
   ```bash
   export DB_ADMIN_USER=postgres
   export DB_ADMIN_PASSWORD=your-admin-password
   ./scripts/db_grant.sh
   ```
   Or use a direct admin URL:
   ```bash
   export DATABASE_URL_ADMIN="postgresql://admin:pass@10.63.208.3:5432/pokerwars-database"
   ./scripts/db_grant.sh
   ```

5) **Run Prisma migrations**
   ```bash
   ./scripts/run_prisma_job.sh
   ```
   Tip: you can fully automate grants + migrations by setting:
   ```bash
   export AUTO_GRANT_DB=true
   export AUTO_MIGRATE=true
   ```
   Then run:
   ```bash
   ./scripts/gcp_deploy_ws.sh
   ```

6) **Deploy WS**
   ```bash
   ./scripts/gcp_deploy_ws.sh
   ```
   Notes:
   - Attaches Cloud SQL if `DB_INSTANCE` is set.
   - Uses `.env` → generated env files for Cloud Run.

7) **Deploy Web**
   ```bash
   ./scripts/gcp_deploy_web.sh
   ```

8) **Verify**
   ```bash
   gcloud run services list
   gcloud run jobs executions list
   gcloud logs read --project "$PROJECT_ID" --limit 100
   ```

### Fully automated deploy (copy/paste)
```bash
export AUTO_GRANT_DB=true
export AUTO_MIGRATE=true
export CREATE_CLOUDSQL=true
export CREATE_VPC_CONNECTOR=true
export USE_VPC_CONNECTOR=true

./scripts/gcp_deploy_ws.sh
./scripts/gcp_deploy_web.sh
```

### Troubleshooting Database Deployment

If tables are not created after deployment:

1. **Run diagnostics**:
   ```bash
   ./scripts/diagnose_db_deployment.sh
   ```

2. **Test database connection setup**:
   ```bash
   ./test_db_connection.sh
   ```

3. **Check migration job logs**:
   ```bash
   gcloud run jobs logs read --region=$REGION --job=pokerwars-prisma-migrate
   ```

4. **Manual migration** (if automated fails):
   ```bash
   ./scripts/run_prisma_job.sh
   ```

**Common Issues:**
- **Empty DATABASE_URL in logs**: Environment variables not set correctly in Cloud Run job
- **"DATABASE_URL cannot be specified multiple times"**: Fixed in v1.0+ - env file now uses Cloud SQL socket path
- **"relation does not exist"**: Migration assumes existing state - now uses `db push` for fresh databases
- **Connection timeout**: Private IP database without VPC connector
- **Permission denied**: Database user lacks privileges
- **Migration files missing**: Schema changes not committed

**Common Issues:**
- **Missing tables**: Deployment uses `prisma migrate deploy` (fixed in v1.0+), not `db push`
- **Permission errors**: Set `AUTO_GRANT_DB=true` to auto-grant DB privileges
- **VPC connectivity**: Ensure `USE_VPC_CONNECTOR=true` for private IP Cloud SQL

### Optional single-service deploy script
If you want a single generic deploy entrypoint:
```bash
SERVICE_NAME="$WEB_SERVICE_NAME" SERVICE_TYPE=web ./scripts/gcp_deploy.sh
SERVICE_NAME="$WS_SERVICE_NAME" SERVICE_TYPE=ws-server ./scripts/gcp_deploy.sh
```

### Notes
- Postgres 15 is supported.
- Env files for Cloud Run are generated under `.env.generated/`.
- To auto-run migrations before WS deploy, set `AUTO_MIGRATE=true`.
- Deploy scripts now fail fast if `DATABASE_URL` contains unresolved `$VARS` or if a production deploy uses a localhost URL.

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

## Template note

`gcp-project/` contains a separate minimal template (Next.js + Fastify) for reference only; production deploys should use the root scripts above.
