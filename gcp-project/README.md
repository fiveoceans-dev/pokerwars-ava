# Temp Template (Next.js + Fastify + Prisma)

This folder is a **reference template** for Cloud Run + Cloud SQL. The production PokerWars app deploys from the repo root using `scripts/deploy/gcp/*`. Keep env shapes aligned: `PROJECT_ID`, `REGION`, `REPO_NAME`, service names, and `DATABASE_URL` / `DATABASE_URL_CLOUD`.

## Structure
```
apps/
  web/            # Next.js (React)
  api/            # Fastify (Node)
packages/
  db/             # Prisma schema + client
  shared/         # Zod schemas / shared types
scripts/          # GCP deploy + Cloud SQL setup
```

## Local dev
```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev:api
npm run dev:web
```

## Cloud SQL setup
```bash
./scripts/cloudsql_setup.sh
```

## Deploy to Cloud Run
```bash
./scripts/gcp_deploy_api.sh
./scripts/gcp_deploy_web.sh
```
