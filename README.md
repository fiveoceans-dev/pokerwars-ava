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
npm run db:migrate
npm run db:generate
```

For a one-shot local bootstrap (migrate + generate + optional seed), run:

```bash
AUTO_MIGRATE=true ./scripts/start_local.sh
```

Optional seed:
```bash
SEED_GAMES=true AUTO_MIGRATE=true ./scripts/start_local.sh
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

Recommended workflow:
- Use a root `.env` (or `.env.local`) as the source of truth.
- Sync into app-specific files with `./scripts/sync_env.sh`.
- Avoid wrapping values in quotes; some tools treat quoted strings literally.
- Most scripts read `.env` by default; you can override with `ENV_FILE=...` where noted.

Web app (`apps/web/.env.local`):
- Copy `apps/web/.env.example` to `.env.local`.
- Set `NEXT_PUBLIC_WS_URL` to the WebSocket server URL (e.g. `ws://localhost:8099`).
- Set `NEXT_PUBLIC_API_URL` to the HTTP API on the WebSocket server (e.g. `http://localhost:8099/api`).
- Set `NEXT_PUBLIC_APP_URL` in production to ensure correct Open Graph/Twitter metadata.
- Web3Modal uses `WALLETCONNECT_PROJECT_ID` or `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (required for QR connect).
- Avalanche mainnet/testnet require their `NEXT_PUBLIC_AVALANCHE_*` / `NEXT_PUBLIC_AVALANCHE_TESTNET_*` env vars. Hyperliquid remains supported via `NEXT_PUBLIC_HYPERLIQUID_*` / `NEXT_PUBLIC_HYPERLIQUID_TESTNET_*` if you need legacy tables.

WebSocket server (`apps/ws-server/.env`):
- Copy `apps/ws-server/.env.example` to `.env`.
- Set `ALLOWED_WS_ORIGINS` for production and `DEV_ALLOWED_WS_ORIGINS` for local development.
- Configure `PORT` if you need a different public port.

See `docs/env.md` for a full env matrix (local, docker, and Cloud Run).
You can sync root env into app-specific files with:
```bash
./scripts/sync_env.sh
```

## Production parity (local)

Run the same containers that Cloud Run uses:

```bash
AUTO_MIGRATE=true ./scripts/start_local.sh
```

To use a different env file:
```bash
ENV_FILE=.env.local AUTO_MIGRATE=true ./scripts/start_local.sh
```

Defaults:
- Web: http://localhost:8090
- WS: ws://localhost:8099

Override with environment variables if needed (e.g. `NEXT_PUBLIC_WS_URL`, `ALLOWED_WS_ORIGINS`).

## 🚀 GCP Deployment (Cloud Run + Cloud SQL)

Complete deployment guide for PokerWars full-stack application with automated database setup, migration, and service deployment.

### 📋 Prerequisites

1. **Google Cloud Project** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **Docker** installed locally
4. **Environment variables** configured

### 🔧 Environment Setup

1. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

2. **Configure required variables** in `.env`:
   ```bash
   # GCP Configuration
   PROJECT_ID=your-gcp-project-id
   REGION=us-central1
   REPO_NAME=pokerwars-repo

   # Service Names
   WEB_SERVICE_NAME=poker-web
   WS_SERVICE_NAME=poker-ws

   # Public URLs (will be set after deployment)
   WEB_PUBLIC_URL=https://poker-web-[hash].us-central1.run.app
   WS_PUBLIC_URL=https://poker-ws-[hash].us-central1.run.app

   # WebSocket Configuration
   ALLOWED_WS_ORIGINS=https://poker-web-[hash].us-central1.run.app

   # Database Configuration
   DB_INSTANCE=pokerwars-instance
   DB_NAME=pokerwars-database
   DB_USER=pokerwars-admin
   DB_PASSWORD=your-secure-password
   DB_TIER=db-g1-small

   # Wallet Configuration
   WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id

   # Optional: Avalanche Configuration
   NEXT_PUBLIC_AVALANCHE_CHAIN_ID=43114
   NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc

   # Development: Allow unverified wallets (bypasses authentication)
   # Set to 1 for testing without wallet verification
   ALLOW_UNVERIFIED_WALLETS=1
   ```

3. **Authenticate with Google Cloud**
   ```bash
   gcloud auth login
   ./scripts/gcp_use_env.sh
   ```
   `gcp_use_env.sh` reads `.env` in the repo root. The deploy scripts support `ENV_FILE=...` if you keep a separate GCP env file.

### 🗄️ Database Setup

#### Option 1: Automated Setup (Recommended)
   ```bash
export CREATE_CLOUDSQL=true
export AUTO_GRANT_DB=true
export AUTO_MIGRATE=true
export CREATE_VPC_CONNECTOR=true
export USE_VPC_CONNECTOR=true

./scripts/gcp_deploy_ws.sh
```

#### Option 2: Manual Database Setup
   ```bash
# 1. Create Cloud SQL instance
CREATE_CLOUDSQL=true ./scripts/gcp_deploy_ws.sh

# 2. Grant database permissions
./scripts/db_grant.sh

# 3. Run database migrations
   ./scripts/run_prisma_job.sh
   ```

### 🌐 Service Deployment

#### Deploy WebSocket Server
```bash
export AUTO_MIGRATE=true
export AUTO_GRANT_DB=true
./scripts/gcp_deploy_ws.sh
```

#### Deploy Web Application
```bash
./scripts/gcp_deploy_web.sh
```

#### Complete One-Command Deployment
```bash
# Full automated deployment
export CREATE_CLOUDSQL=true
export AUTO_GRANT_DB=true
export AUTO_MIGRATE=true
export CREATE_VPC_CONNECTOR=true
export USE_VPC_CONNECTOR=true

./scripts/gcp_deploy_ws.sh
./scripts/gcp_deploy_web.sh
```

### 🔄 Redeployment Procedures

#### Quick Redeploy (Code Changes Only)
```bash
# Redeploy WS server only
./scripts/gcp_deploy_ws.sh

# Redeploy web app only
./scripts/gcp_deploy_web.sh

# Redeploy both
./scripts/gcp_deploy_ws.sh && ./scripts/gcp_deploy_web.sh
```

#### Database Schema Changes
```bash
# Update Prisma schema, then redeploy
npm run db:generate
./scripts/run_prisma_job.sh
./scripts/gcp_deploy_ws.sh
```

#### Environment Variable Changes
```bash
# Update .env file, then redeploy
./scripts/gcp_deploy_ws.sh
./scripts/gcp_deploy_web.sh
```

#### Database Reset (⚠️ Destroys Data)
```bash
# Drop and recreate database
./drop_db_psql.sh
gcloud sql databases create pokerwars-database --instance=pokerwars-instance
./scripts/db_grant.sh
./scripts/run_prisma_job.sh
```

### 📊 Verification & Monitoring

#### Check Deployment Status
```bash
# List all services
gcloud run services list --region=us-central1

# Check service URLs
gcloud run services describe poker-ws --region=us-central1 --format="value(status.url)"
gcloud run services describe poker-web --region=us-central1 --format="value(status.url)"
```

#### Monitor Logs
```bash
# WS server logs (real-time)
gcloud run services logs read poker-ws --region=us-central1 --follow

# Web app logs (real-time)
gcloud run services logs read poker-web --region=us-central1 --follow

# Migration job logs
gcloud run jobs logs read --region=us-central1 --job=pokerwars-prisma-migrate
```

#### Health Checks
```bash
# WS server health
curl https://poker-ws-[hash].us-central1.run.app/health

# Web app status
curl -I https://poker-web-[hash].us-central1.run.app
```

#### Database Verification
```bash
# Check tables
gcloud sql databases execute pokerwars-instance \
  --command="SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

# Connect directly
gcloud sql connect pokerwars-instance --user=pokerwars-admin
```

### 🛠️ Troubleshooting

#### Deployment Issues
```bash
# Diagnose deployment problems
./scripts/diagnose_deployment.sh

# Check migration status
./debug_migration_job.sh
```

#### Common Problems

**"Permission denied" during database setup**
```bash
# Reset database permissions
./scripts/db_grant.sh
```

**"[[: not found" in Cloud Run logs**
```bash
# Fixed in v1.0+ - Cloud Run job now uses bash instead of sh
# If you see this error, redeploy with updated scripts
./scripts/run_prisma_job.sh
```

**Migration failures**
```bash
# Check migration logs
gcloud run jobs logs read --region=us-central1 --job=pokerwars-prisma-migrate

# Rerun migrations
./scripts/run_prisma_job.sh
```

**Service startup failures**
```bash
# Check environment variables
./scripts/build_cloudrun_env.sh
cat .env.generated/env.ws.env

# Redeploy with updated config
./scripts/gcp_deploy_ws.sh
```

**WebSocket connection issues**
```bash
# Verify WS server is healthy
curl https://poker-ws-[hash].us-central1.run.app/health

# Check web app configuration
gcloud run services logs read poker-web --region=us-central1
```

**API authentication errors (401 Unauthorized)**
```bash
# For testing without wallet verification, set:
export ALLOW_UNVERIFIED_WALLETS=1

# Then redeploy WS server
./scripts/gcp_deploy_ws.sh
```

### 📋 Deployment Scripts Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `gcp_deploy_ws.sh` | Deploy WS server + DB setup | Main deployment |
| `gcp_deploy_web.sh` | Deploy web application | After WS deployment |
| `run_prisma_job.sh` | Run database migrations | After DB creation |
| `db_grant.sh` | Grant DB permissions | First-time setup |
| `drop_db_psql.sh` | Drop database safely | Reset operations |
| `diagnose_db_deployment.sh` | Debug deployment issues | Troubleshooting |

### 🌱 Database Seeding

### Initial Data Setup

After database deployment, seed initial platform data:

```bash
# Seed all initial data (recommended)
npm run seed:all

# Or seed specific components
npm run seed:initial    # Treasury, ledger, blind schedules
npm run seed:games      # Game templates (cash, S&G, MTT)
```

### Seeding During Deployment

Enable automatic seeding during deployment:

```bash
export AUTO_SEED=true
./scripts/run_prisma_job.sh
```

Or for full deployment:
```bash
export CREATE_CLOUDSQL=true AUTO_GRANT_DB=true AUTO_MIGRATE=true AUTO_SEED=true
./scripts/gcp_deploy_ws.sh
```

### What Gets Seeded

| Component | Description | Status |
|-----------|-------------|---------|
| **Treasury** | 5B coin supply, ticket reserves | ✅ Auto-seeded |
| **Ledger** | Genesis block and transaction | ✅ Auto-seeded |
| **Blind Schedules** | STT/MTT tournament levels | ✅ Auto-seeded |
| **Game Templates** | Cash games, S&G, MTT configs | ✅ Auto-seeded |
| **Test Data** | Development user accounts | ⚠️ Optional |

### Manual Seeding Scripts

```bash
cd apps/ws-server

# Seed treasury and system accounts
npx ts-node scripts/seed-initial-data.ts

# Seed game templates
npx ts-node scripts/seed-game-templates.ts

# Seed with test data (development only)
SEED_TEST_DATA=true npx ts-node scripts/seed-initial-data.ts
```

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] Database instance created and accessible
- [ ] VPC connector configured (if using private IP)
- [ ] Services deployed successfully
- [ ] **Database seeded with initial data**
- [ ] Health endpoints responding
- [ ] WebSocket connections working
- [ ] Database operations functional
- [ ] Monitoring and logging configured

### 🚀 Quick Commands

```bash
# One-time setup
cp .env.example .env  # Configure variables
gcloud auth login
./scripts/gcp_use_env.sh

# Full deployment
export CREATE_CLOUDSQL=true AUTO_GRANT_DB=true AUTO_MIGRATE=true CREATE_VPC_CONNECTOR=true USE_VPC_CONNECTOR=true
./scripts/gcp_deploy_ws.sh && ./scripts/gcp_deploy_web.sh

# Health check
curl https://poker-ws-[hash].us-central1.run.app/health

# Monitor logs
gcloud run services logs read poker-ws --region=us-central1 --follow
```

### 🧪 Full Stack Integration Testing

After deployment, verify all components work together:

1. **Health Check**: `curl https://poker-ws-[hash].us-central1.run.app/health`
2. **Web App**: Open `https://poker-web-[hash].us-central1.run.app`
3. **WebSocket Connection**: Check browser dev tools for WS connections
4. **Database Operations**: Create user → verify in database
5. **Real-time Features**: Test live updates between browser tabs

### 🔄 CI/CD Integration

For automated deployments in CI/CD pipelines:

```bash
# Set required environment variables
export CREATE_CLOUDSQL=true
export AUTO_GRANT_DB=true
export AUTO_MIGRATE=true
export CREATE_VPC_CONNECTOR=true
export USE_VPC_CONNECTOR=true

# Deploy in sequence
./scripts/gcp_deploy_ws.sh
./scripts/gcp_deploy_web.sh

# Verify deployment
curl https://poker-ws-[hash].us-central1.run.app/health
```

### 📝 Additional Notes

- **Postgres 15** is supported
- **Environment files** for Cloud Run are generated under `.env.generated/`
- **Docker images** use Debian (bookworm-slim) for OpenSSL 3 compatibility
- **Prisma engines** target native binary for optimal performance
- **VPC connectors** enable private IP database access
- **Cloud SQL proxy** provides secure database connections

### 🔧 Development Scripts

```bash
# Build all packages
npm run build:packages

# Start development servers
npm run dev         # Web app (port 8080)
npm run dev:ws      # WS server (port 8099)

# Database operations
npm run db:generate # Regenerate Prisma client
npm run db:migrate  # Run dev migrations
```

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

## 🧩 Core Architecture: Templates & Instances

PokerWars uses a strict separation between **Game Templates** and **Active Instances** to ensure data integrity and clean state:
- **Game Templates:** Static definitions stored in the DB (e.g., "Daily SNG 9-Max"). They define buy-ins, blinds, and payouts.
- **Active Instances:** Dynamic game runs with unique UUIDs (e.g., `sng-a1b2...`). Every tournament table has a unique ID, ensuring registrations are isolated from template names.
- **Lifecycle Management:** The WebSocket server automatically hydrates running games on startup and cleans up "stale" or "bot-only" instances to keep the database lean.

## 🎨 UI & UX Improvements

- **Unified Pro HUD:** Player seats are standardized at 140x50px with integrated action states. No more overlapping overlays—actions like "CALL" or "FOLD" replace the profile photo temporarily for a cleaner interface.
- **Integrated Controls:** Responsive control panel centered at the bottom, with Dealer logs on the bottom-left and Player Chat on the bottom-right.
- **Dynamic Feedback:** Real-time glow animations for active turns (blue) and winners (gold).
- **Tournament Win Modals:** Automatic "Congratulations" modal for prize winners, displaying rank and earnings (coins/tickets).

## 💰 Economy (ledger-first)

- Ledger + accounts + treasury act as a “vanilla blockchain” (see `docs/vanilla-blockchain.md`).
- Treasury total supply: 5,000,000,000 coins. Tickets: `ticket_x`, `ticket_y`, `ticket_z`.
- Free claim: 3,000 coins every 5 hours (`POST /api/user/claim`).
- Conversions: coins ↔ tickets with buy/sell rates (server enforced).
- **Hardened Payouts:** Tournament payouts are strictly persisted to the DB and distributed via the LedgerPort once a tournament hits the `FINISHED` state.

## 🤖 Bots

- **Dynamic Spawning:** S&G only. “Start w/ bots” fills empty seats and starts immediately.
- **Auto-Cleanup:** The server periodically checks for "bot-only" SNGs (running games with no humans) and automatically closes them to reclaim resources.
- Bot styles: random, tight, loose, aggressive; bots choose only valid available actions.
See `docs/bot-guide.md`.

## UI notes

- New terminal/HUD dark theme with bracket buttons.
- Content width is unified across navbar, hero, and pages.
- Learn page has 5 authored lessons; Free page offers timed coin claims; Account page uses DB-backed balances and convert modal.
Details in `docs/mtt_stt.md` and `docs/vanilla-blockchain.md`.

## 🎯 Architecture Overview

```
🌐 Web App (Next.js + Cloud Run)
    ↓ WebSocket
🖥️ WS Server (Node.js + Cloud Run)
    ↓ Database
🗄️ Cloud SQL (PostgreSQL + Private IP)
    ↓ Secure Access
🔒 VPC Connector (Private Networking)
```

**Key Features:**
- **Real-time multiplayer** poker with WebSocket connections
- **Blockchain integration** via wallet connectivity
- **Ledger-based economy** with tournament escrow
- **Automated scaling** with Cloud Run
- **Secure database** with private IP and VPC

## 📚 Additional Documentation

- `docs/env.md` - Complete environment variable reference
- `docs/vanilla-blockchain.md` - Economy and ledger system
- `docs/bot-guide.md` - Bot player configuration
- `docs/mtt_stt.md` - Tournament and game mechanics

## 🤝 Contributing

1. **Local Development**: Use `npm run dev` and `npm run dev:ws`
2. **Database Changes**: Update schema, run `npm run db:generate`
3. **Testing**: Verify health endpoints and core flows before deployment
4. **Deployment**: Use the GCP deployment scripts above

## 📄 License

This project is part of the PokerWars ecosystem. See individual package licenses for details.

---

**PokerWars**: Real-time multiplayer poker with blockchain economy, deployed on Google Cloud Platform.
