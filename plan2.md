# Plan 2: Advanced Tournament Lifecycle & MTT Validation

## Objective
Refine the lifecycle management of SNG/MTT tournaments to strictly separate "Playable" instances from "Finished/Closed" ones. Implement a minimum player threshold for MTTs to prevent premature starts. Ensure the frontend only displays relevant, joinable, or active games.

## 1. Workflow Refinements

### 1.1 Status Transitions & Visibility
*   **TEMPLATE:** Pure definition (Database only).
*   **REGISTERING:** Visible in Lobby. Players can Join.
*   **RUNNING:** Visible in Lobby. Players can Open.
    *   *Transition:* Occurs when SNG is full OR MTT start time arrives (and meets min players).
*   **FINISHED:** Hidden from "Active" Lobby (or moved to "History" tab).
    *   *Transition:* Last player stands.
*   **CANCELLED:** Hidden from Lobby.
    *   *Transition:* MTT fails min player check.

### 1.2 "Results" Status
To handle the "second status" request:
*   We will rely on `TournamentStatus.FINISHED` as the primary flag.
*   We will ensure that queries for the Lobby filters out `FINISHED` / `CANCELLED` games unless specifically requested (e.g., history view).
*   The `TournamentPayout` table already acts as the definitive "Results" record.

## 2. MTT Minimum Player Logic

### 2.1 The Rule
*   **Constraint:** MTT must have at least **5% of Max Players** registered to start.
*   **Calculation:** `minPlayers = Math.ceil(maxPlayers * 0.05)`.
*   **Failure:** If `registeredCount < minPlayers` at `startAt`:
    *   Cancel Tournament.
    *   Refund all players.
    *   Broadcast cancellation.

## 3. Implementation Plan

### Step 1: Database & Logic (Backend)
*   **TournamentOrchestrator:**
    *   Modify `startMtt` method.
    *   Add check: `if (registered.size < maxPlayers * 0.05) -> cancel`.
    *   Ensure `cleanupBotOnlyTournaments` logic remains robust.

### Step 2: Frontend Visibility
*   **useTournaments:** (Already done) Filters out `template`.
*   **Refinement:** Ensure it also filters out `finished` and `cancelled` from the default "Upcoming/Active" list to keep the lobby clean.
*   **Table Management:** Verify `TournamentTable` rows are correctly marked `CLOSED` so they don't appear as "ghost" tables in any potential debug views.

### Step 3: "New Instance" Spawning
*   **SNG:** Already handled by `spawnReplacementSng`.
*   **MTT:** Scheduled by `ensureDailyMttSchedule`. We need to verify that if an MTT is cancelled/finished, the schedule generation picks up the *next* valid slot (already logic exists, just verify).

## 4. Execution
1.  **Modify `TournamentOrchestrator.ts`:** Add 5% min player check to `startMtt`.
2.  **Verify Frontend Filtering:** Ensure `finished` games are hidden.
3.  **Review Cash Table logic:** Ensure "Closed" cash tables (if implemented later) follow similar "hide from lobby" rules.
