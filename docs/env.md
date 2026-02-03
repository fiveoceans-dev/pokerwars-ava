# Environment Variables Guide

This project follows professional standards for containerized Next.js and Node.js applications.

## 核心原则 (Core Principles)

1.  **Build-Time Variables (`NEXT_PUBLIC_*`)**: These are baked into the JavaScript bundle during the build process. They are accessible to the browser. In Docker, these must be passed as `build-args`.
2.  **Runtime Variables (Server-only)**: These are secrets or backend configs (e.g., `DATABASE_URL`, `JWT_SECRET`). They are injected when the container starts. They should **never** be baked into the image.
3.  **Isolation**: Local `.env` files are ignored by Docker (`.dockerignore`). Configuration must be passed explicitly via Docker Compose or Cloud Run to ensure consistency and security.

---

## Local Development (Docker Compose)

The local workflow uses a single root `.env` file as the **Source of Truth**.

### 1. Setup
Copy the example and configure your variables:
```bash
cp .env.example .env
```

### 2. Startup
Use the provided script to ensure variables are correctly exported and containers are restarted:
```bash
# Starts Postgres, rebuilds containers with .env variables, and runs migrations
AUTO_MIGRATE=true ./scripts/start_local.sh
```

### 3. How it works (Internals)
- **Build**: `docker-compose.prod.yml` maps `.env` variables to `args`. The `Dockerfile` receives these via `ARG` and embeds them using `ENV`.
- **Runtime**: `docker-compose.prod.yml` uses `env_file: .env` to inject variables into the running container.
- **Database**: The script starts a `pokerwars-pg` container. The app connects via `host.docker.internal` (Mac/Win) or the container network.

---

## Production Deployment (GCP)

### 1. Web Application (Cloud Run)
Next.js requires `NEXT_PUBLIC_*` variables during the Cloud Build phase.

- **Build**: `scripts/gcp_deploy_web.sh` reads your local/CI env and passes variables as `--substitutions` to `gcloud builds submit`.
- **Mapping**: `cloudbuild.yaml` receives these substitutions and passes them as `--build-arg` to the Docker build.
- **Runtime**: `scripts/build_cloudrun_env.sh` generates a YAML file used during `gcloud run deploy` to set runtime environment variables.

### 2. WebSocket Server (Cloud Run)
The WS server primarily uses **Runtime** variables.

- **Database**: Connects to Cloud SQL via the Cloud SQL Proxy (configured in the deploy script).
- **Security**: Wallet verification is enforced unless `ALLOW_UNVERIFIED_WALLETS=1` is set.

---

## Troubleshooting

### "Missing Environment Variables" in Browser
- **Cause**: The variable was missing during `npm run build`.
- **Fix**: 
    1. Check if the variable is in your root `.env`.
    2. Check if the variable is listed in the `args` section of `docker-compose.prod.yml`.
    3. Check if the variable is declared as an `ARG` in the `Dockerfile`.
    4. Rebuild without cache: `docker compose build --no-cache`.

### "Can't reach database"
- **Cause**: Incorrect hostname or timing.
- **Fix**: The `start_local.sh` script handles this with an automated health check (`pg_isready`). Ensure you use the script rather than raw docker commands.