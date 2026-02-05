# Plan 0: Robust Game Lifecycle & Persistence Architecture

## Objective
Fix state persistence issues where users appear registered after server restarts ("stale state"). Implement a strict separation between **Game Templates** (definitions) and **Game Instances** (active/running games) using unique UUIDs. Ensure the WebSocket server manages the lifecycle (Hydrate -> Run -> Finish -> Cleanup) correctly.

## 1. Schema & Data Strategy

### 1.1 Separation of Concerns
Currently, `tournaments.json` seeds items that act as both definitions and active games (e.g., id: "sng-9max"). We must split this:
- **GameTemplate (Static):** Defines structure (Buy-in, Blinds, Payouts, Name). ID: `sng-9max-template`. Status: `TEMPLATE`.
- **Tournament/Table (Dynamic):** A specific run of a game. ID: `UUID` (e.g., `sng-9max-a1b2c3d4`). Status: `REGISTERING`, `RUNNING`.

### 1.2 Unique IDs
- **SNG/MTT:** Users never register to "Daily SNG". They register to "Daily SNG #1024" (UUID).
- **Cash Tables:** Cash tables will also use unique IDs (e.g., `cash-100-200-<uuid>`) instead of static names, allowing us to spin up/down tables dynamically.

## 2. WebSocket Server Lifecycle

### 2.1 Server Startup (Hydration & Cleanup)
On `index.ts` startup, the server must:
1.  **Load Templates:** Load definitions from DB/JSON but **do not** make them playable.
2.  **Hydrate Running Games:** Query DB for `Tournament` and `TournamentTable` where `status` is `RUNNING` or `REGISTERING`.
    - Restore their in-memory `EventEngine` state.
    - If state cannot be restored (e.g., crash without snapshot), mark them as `CANCELLED/FAILED` in DB to clear stuck users.
3.  **Spawn Initial Instances:**
    - For every SNG Template, check if a `REGISTERING` instance exists. If not, spawn a new UUID instance.
    - For Cash Templates, ensure minimum required tables exist.

### 2.2 Registration Logic
- **Frontend:** Update `useTournaments` to group by "Template Name" but register to the specific `activeInstanceId`.
- **Backend:** `REGISTER_TOURNAMENT` command must accept the specific UUID.

### 2.3 Game Finish & Cleanup
When a game ends (`finishTournament` or empty cash table):
1.  **Mark Finished:** DB status update to `FINISHED`.
2.  **Archive/Delete:**
    - **Requirement:** User requested removal.
    - We will delete the `TournamentTable` and `TournamentRegistration` rows for finished games to keep the DB clean.
    - Optionally move summary data to a `History` table if stats are needed later (skipping for now based on "remove" instruction).
3.  **Respawn:** `TournamentOrchestrator` immediately spawns a fresh UUID instance for SNGs to replace the finished one.

## 3. Implementation Steps

### Step 1: Database & Seed Updates
- [ ] Modify `seed-tournaments.ts` to set IDs as `template-<name>` and status `TEMPLATE` (if not already supported, add status).
- [ ] Ensure `Tournament` model supports `TEMPLATE` status.

### Step 2: Tournament Orchestrator Refactor
- [ ] **Startup Check:** Implemenet `cleanStaleInstances()` on boot. Mark `RUNNING` games as `CANCELLED` if no snapshot exists.
- [ ] **Spawner:** Ensure `spawnReplacementSng` is the *only* way playable SNGs are created. The static config is read-only.
- [ ] **Registration:** Update logic to ensure players join the UUID instance.

### Step 3: Cash Table Manager
- [ ] Create `CashTableManager` (similar to TournamentManager) to handle dynamic spawning/despawning of cash tables with UUIDs.
- [ ] Remove static cash table definitions from `pokerWebSocketServer.ts` startup.

### Step 4: Cleanup Routine
- [ ] Implement `deleteFinishedGame(id)` in `TournamentManager`.
- [ ] Call this routine after Payouts are distributed and the "Congratulations" modal has had time to trigger (e.g., 5-minute delay).

## 4. Verification
- **Restart Test:** Register user -> Restart Server -> User should NOT be registered (unless game was actually running and restored). If game was just registering and not persisted, it should be wiped.
- **Flow Test:** Play SNG -> Finish -> Data removed from active DB tables -> New SNG appears with fresh UUID.
