# Gemini Context: PokerWars Project

This document provides a comprehensive overview of the PokerWars project, its architecture, and development conventions to guide future AI-assisted development.

## 1. Project Overview

PokerWars is a full-stack, real-time multiplayer online poker platform. It is built as a TypeScript monorepo and features a database-driven system for dynamically managing game offerings.

### Architecture & Technologies

*   **Monorepo**: The project uses **npm workspaces** to manage multiple packages and applications.
*   **Frontend (`apps/web`)**: A **Next.js 15** application using **React**, **TypeScript**, and **Tailwind CSS**. Wallet connectivity is handled by **Wagmi** and **AppKit** (Web3Modal).
*   **Backend (`apps/ws-server`)**: A **Node.js** and **TypeScript** server responsible for game logic and data persistence. It uses:
    *   The `ws` library for real-time WebSocket communication.
    *   A simple, built-in router for REST-like API endpoints (e.g., `/api/tournaments`).
    *   **Prisma** as the ORM to interact with the database.
*   **Database**: **PostgreSQL** is the database, with its schema managed by Prisma.
*   **Shared Logic (`packages/engine`)**: A shared **TypeScript** package containing the core poker game engine logic, consumed by both the frontend and backend.
*   **Smart Contracts (`contracts/`)**: A **Foundry** workspace for Solidity-based smart contracts.

### Key Features

*   **Real-time Gameplay**: Communication between the client and server is handled via WebSockets for instant game state updates.
*   **Database-Driven Game Templates**: All game types (Cash, SNG, MTT) are defined as templates in the `GameTemplate` database table. The server loads these at startup and can "hot-reload" them if the configuration changes, allowing for dynamic game management without server restarts.
*   **On-chain Integration**: The platform integrates with Ethereum-based wallets for authentication and potentially for handling on-chain assets.
*   **Deployment**: The project is designed for deployment on **Google Cloud Platform (GCP)** using **Cloud Run** for services and **Cloud SQL** for the database. A suite of shell scripts in the `/scripts` directory automates the deployment process.

## 2. Building and Running

### Local Development

1.  **Installation**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    *   Copy the `.env.example` file to `.env` in the root directory.
    *   Fill in the required variables, especially the local `DATABASE_URL`.
    *   Run the sync script to propagate environment variables to the workspaces:
        ```bash
        ./scripts/sync_env.sh
        ```

3.  **Database**:
    *   Ensure a local PostgreSQL instance is running.
    *   Run the database migrations and seeding:
        ```bash
        # Apply schema changes
        npm run db:migrate

        # Seed the database with initial data and game templates
        npm run seed:all -w apps/ws-server
        ```

4.  **Running the Servers**:
    *   Start the WebSocket server (backend):
        ```bash
        npm run dev:ws
        ```
    *   In a separate terminal, start the Next.js web application (frontend):
        ```bash
        npm run dev
        ```

### Production Parity (Docker)

To run the application locally using the same container setup as production:

```bash
# This script manages the Docker Compose setup, including DB and services.
./scripts/start_local.sh
```

### Build & Quality Checks

*   **Build all packages**:
    ```bash
    npm run build
    ```
*   **Lint the codebase**:
    ```bash
    npm run lint
    ```
*   **Run type-checking**:
    ```bash
    npm run typecheck
    ```

## 3. Development Conventions

*   **Single Source of Truth**: The **database is the single source of truth** for game configurations via the `GameTemplate` table. The `apps/ws-server/game-templates-seed.json` file is used *only* to seed this table.
*   **Environment Management**: All environment variables should be added to the root `.env` file and then synchronized into the workspaces using the `./scripts/sync_env.sh` script.
*   **Database Changes**: All schema changes must be done through Prisma migrations (`npm run db:migrate`).
*   **Hot Reloading**: The `TournamentManager` polls the `SystemConfig` table in the database. To trigger a live reload of game templates on the server, increment the `templatesVersion` in this table.
*   **API Endpoints**: The `ws-server` provides both a WebSocket endpoint for gameplay and a set of RESTful endpoints under `/api/` for fetching read-only data like tournament lists.
*   **Code Style**: The project uses ESLint for code linting. Adhere to the existing style found in the codebase.
