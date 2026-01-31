# Environment Variables Guide

This repo uses **three scopes** of environment variables:

1) **Script env** (root `.env` / `.env.gcp`)  
   Used by deploy scripts in `scripts/`.
2) **Web app env** (`apps/web/.env.local`)  
   Client-facing values only (`NEXT_PUBLIC_*`).
3) **WS server env** (`apps/ws-server/.env`)  
   Server-only values like database URLs and allowlists.

## Local development

### 1) Root `.env` (for scripts)
Copy:
```
cp .env.example .env
```
Common values:
```
PROJECT_ID=your-gcp-project
REGION=us-central1
REPO_NAME=pokerwars-repo
WEB_SERVICE_NAME=poker-web
WS_SERVICE_NAME=poker-ws
```

### 2) Web app (`apps/web/.env.local`)
```
NEXT_PUBLIC_APP_URL=http://localhost:8090
NEXT_PUBLIC_WS_URL=ws://localhost:8099
NEXT_PUBLIC_API_URL=http://localhost:8099/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-wc-project-id
```

### 3) WS server (`apps/ws-server/.env`)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pokerwars?schema=public
ALLOWED_WS_ORIGINS=http://localhost:8090
DEV_ALLOWED_WS_ORIGINS=http://localhost:8090
REDIS_URL=
```

### 4) Docker dev overrides (optional)
`scripts/docker_up.sh` reads `.env.docker` if present:
```
# .env.docker
NEXT_PUBLIC_APP_URL=http://localhost:8090
NEXT_PUBLIC_WS_URL=ws://localhost:8099
NEXT_PUBLIC_API_URL=http://localhost:8099/api
ALLOWED_WS_ORIGINS=http://localhost:8090
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/pokerwars?schema=public
```

If you want to run migrations automatically on startup:
```
AUTO_MIGRATE=true ./scripts/docker_up.sh
```

Optional seed:
```
SEED_GAMES=true AUTO_MIGRATE=true ./scripts/docker_up.sh
```

## Cloud Run + Cloud SQL (production)

### Script env (`.env` or `.env.gcp`)
```
PROJECT_ID=...
REGION=...
REPO_NAME=...
WEB_SERVICE_NAME=poker-web
WS_SERVICE_NAME=poker-ws
WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
DB_NAME=pokerwars-db
DB_USER=pokerwars-admin
DB_PASSWORD=your-password
DB_INSTANCE=your-cloudsql-instance
DATABASE_URL_CLOUD=postgresql://user:pass@/pokerwars?host=/cloudsql/PROJECT:REGION:INSTANCE
DB_INSTANCE=your-cloudsql-instance
ALLOWED_WS_ORIGINS=https://your-web-domain
WEB_PUBLIC_URL=https://your-web-domain
WS_PUBLIC_URL=https://your-ws-domain
AUTO_MIGRATE=true
```

Notes:
- If your DB password includes special characters (like `@`), prefer `DB_USER`/`DB_PASSWORD`/`DB_NAME` and let the deploy scripts build an encoded URL.

### DB grants bootstrap (avoid Prisma P1010)
If migrations fail with permission errors, run the grants script using an admin role:
```
export DB_ADMIN_USER=postgres
export DB_ADMIN_PASSWORD=your-admin-password
./scripts/db_grant.sh
```

Optional: use an explicit admin URL instead of user/pass:
```
export DATABASE_URL_ADMIN="postgresql://admin:pass@10.63.208.3:5432/pokerwars-db"
./scripts/db_grant.sh
```

If you need to grant a different role than `DB_USER`, set:
```
export GRANT_USER=some-other-user
```

To run grants automatically before Prisma migrations, set:
```
export AUTO_GRANT_DB=true
```

### Cloud Run service envs
These are set by `scripts/gcp_deploy_web.sh` and `scripts/gcp_deploy_ws.sh` using generated env files:
- Web: `NEXT_PUBLIC_*`, `WALLETCONNECT_PROJECT_ID`
- WS: `DATABASE_URL`, `ALLOWED_WS_ORIGINS`, `REDIS_URL` (optional)

### Secrets
For production, store secrets in **Secret Manager** and mount them as env vars in Cloud Run.
Avoid committing secrets into any `.env` checked into git.

## Common pitfalls
- Client code **cannot** read non-`NEXT_PUBLIC_*` vars.
- `DATABASE_URL` must be set for Prisma to connect.
- `ALLOWED_WS_ORIGINS` must match your web app origin exactly.
