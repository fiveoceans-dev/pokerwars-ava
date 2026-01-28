# PokerWars WebSocket Server

Production WebSocket server for multiplayer poker. It forwards client commands to the shared EventEngine and broadcasts state updates.

## Architecture

```
apps/ws-server/
├── src/
│   ├── index.ts                # WebSocket server entrypoint
│   ├── pokerWebSocketServer.ts # FSM bridge
│   ├── sessionManager.ts       # Session tracking
│   ├── persistence.ts          # Table state persistence
│   ├── tableConfig.ts          # Table definitions
│   └── utils/                  # Server utilities
├── dist/                       # Compiled output
├── tests/                      # Vitest integration tests
└── game-engine-archived/       # Legacy engine snapshot (not used)
```

## Local development

From repo root:

```bash
npm install
cp apps/ws-server/.env.example apps/ws-server/.env
npm run dev:ws
```

Or from this folder:

```bash
npm run dev
```

The server defaults to port 8081. In development it falls back to 8099 if 8081 is busy (see startup log for the actual port).

## Environment variables

Key variables (see `.env.example`):

- `PORT` - server port (defaults to 8081, dev fallback 8099)
- `NODE_ENV` - development or production
- `ALLOWED_WS_ORIGINS` - production origin allowlist for WebSocket upgrades
- `DEV_ALLOWED_WS_ORIGINS` - extra allowlist for local development
- `REDIS_URL` - optional Redis persistence
- `DATABASE_URL` - Postgres/Cloud SQL for Prisma-backed tournaments

## Cloud Run deployment

Use the root scripts that build the shared image and deploy this service:

```bash
cp .env.gcp.example .env.gcp
./scripts/deploy/gcp/gcp_deploy_ws.sh
```

Notes:
- Cloud Run uses `PORT=8080`; the deploy script sets it explicitly.
- The script sets `--timeout=3600` so WebSocket connections can stay open.
- `ALLOWED_WS_ORIGINS` must include the web app URL.

## Tables

Available tables are defined in `apps/ws-server/src/tableConfig.ts` and include multiple stake tiers (micro, low, mid, high, whale).

## WebSocket API

### Client commands

```typescript
{ cmdId: "uuid", type: "LIST_TABLES" }
{ cmdId: "uuid", type: "JOIN_TABLE", tableId: "table-id" }
{ cmdId: "uuid", type: "CREATE_TABLE", name: "Table Name" }
{ cmdId: "uuid", type: "REATTACH", sessionId: "..." }
{ cmdId: "uuid", type: "ATTACH", userId: "wallet-address" }

{ cmdId: "uuid", type: "SIT", tableId: "table-id", seat: 0, buyIn: 2000, playerId?: "...", nickname?: "..." }
{ cmdId: "uuid", type: "LEAVE" }
{ cmdId: "uuid", type: "SIT_OUT" }
{ cmdId: "uuid", type: "SIT_IN" }

{ cmdId: "uuid", type: "POST_BLIND", blindType: "SMALL" | "BIG" }
{ cmdId: "uuid", type: "ACTION", action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALLIN", amount?: number }
{ cmdId: "uuid", type: "REBUY", amount: number }
{ cmdId: "uuid", type: "SHOW_CARDS" }
{ cmdId: "uuid", type: "MUCK_CARDS" }
```

### Server events

```typescript
{ type: "SESSION", sessionId: string, userId?: string }
{ type: "TABLE_LIST", tables: LobbyTable[] }
{ type: "TABLE_CREATED", table: LobbyTable }
{ type: "TABLE_SNAPSHOT", table: Table }
{ type: "GAME_START_COUNTDOWN", countdown: number }
{ type: "ACTION_PROMPT", actingIndex: number, betToCall: number, minRaise: number, timeLeftMs: number }
{ type: "PLAYER_JOINED", seat: number, playerId: string }
{ type: "PLAYER_LEFT", seat: number, playerId: string }
{ type: "ERROR", code: string, msg: string }
```

See `packages/engine/src/network/networking.ts` for the full schema.

## Testing

```bash
npm test
```

Manual WebSocket check:

```bash
npm install -g wscat
wscat -c ws://localhost:8081
```
