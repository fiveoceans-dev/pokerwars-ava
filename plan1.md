# Plan 1: Tournament & Table Lifecycle Workflow Refinement

## Objective
Refine and harden the workflow for Cash, SNG, and MTT games. Ensure strict synchronization between the WebSocket Server (Orchestrator/Engine) and the Database (`Tournament`, `TournamentTable`, `TournamentPayout`). Guarantee unique IDs for every game instance and proper "Finished" state archiving.

## 1. Core Concepts & Relations

### 1.1 Tournaments (The Container)
- **SNG (Sit & Go):** A tournament instance spawned from a template. Starts when full.
- **MTT (Multi-Table Tournament):** A scheduled tournament instance. Starts at specific time.
- **Cash Games:** Currently treated as persistent tables. *Refinement:* Treat them as long-running "Sessions" or "Instances" that can be closed and archived, spawned from a "Cash Template".

### 1.2 Tables (The Engine)
- **Tournament Tables:** Belong to a specific `Tournament`. Dynamic lifecycle (Created -> Active -> Broken/Merged -> Closed).
- **Cash Tables:** Standalone entities. Currently static. *Refinement:* Should have unique instance IDs (e.g., `cash-100-200-<uuid>`) to allow history tracking.

### 1.3 Prizes
- **Payouts:** Calculated at the end of a tournament based on finish order and structure. Persisted to `TournamentPayout`.

## 2. Detailed Workflows

### 2.1 SNG Workflow
1.  **Spawn:** `TournamentOrchestrator` finds `TEMPLATE` (e.g., "Daily SNG"). Checks for active `REGISTERING` instance. If none, spawns `sng-<uuid>` from template.
2.  **Register:** Users join `sng-<uuid>`. DB: `TournamentRegistration` created.
3.  **Start:** When `registered.length === maxPlayers`:
    - Status -> `RUNNING`.
    - `TournamentOrchestrator` spawns *replacement* SNG (`sng-<new_uuid>`) immediately for next players.
    - **Table Creation:** One table `sng-<uuid>-table-1` created. Engine initialized.
4.  **Play:** Game proceeds. Blinds increase via `LevelTimer`.
5.  **Finish:**
    - Winner determined.
    - Payouts calculated & persisted to `TournamentPayout`.
    - Ledger transfers funds.
    - Tournament Status -> `FINISHED`.
    - Table Status -> `CLOSED`.

### 2.2 MTT Workflow
1.  **Spawn:** Scheduled by cron/startup based on `MTT_DAILY_SLOTS`. IDs: `mtt-<date>-<time>`. Status: `SCHEDULED` -> `REGISTERING`.
2.  **Register:** Users join.
3.  **Start:** At `startAt` time:
    - Status -> `RUNNING`.
    - **Table Allocation:** Orchestrator calculates needed tables (Players / 9).
    - Spawns tables `mtt-<id>-table-1`, `table-2`, etc.
    - Seats players randomly.
4.  **Play & Balance:**
    - Players bust -> `TournamentRegistration` updated (`BUSTED`, position).
    - `TournamentOrchestrator` checks table balances. Moves players or breaks tables.
    - Empty tables -> `CLOSED`.
5.  **Finish:** Last player standing. Payouts distributed. Status -> `FINISHED`.

### 2.3 Cash Game Workflow (Refined)
*Current State:* Static IDs from `listTableConfigs` (e.g., `cash-low`).
*Target State:*
1.  **Template:** DB has `GameTemplate` (Type: CASH).
2.  **Spawn:** Server startup or demand-based.
    - Check active tables for template.
    - If active tables full > spawns new `cash-<template>-<uuid>`.
    - If active tables empty for X minutes -> Close & Archive.
3.  **Persistence:**
    - `TournamentTable` model is currently tied to `Tournament`.
    - *Decision:* We need a unified `GameTable` model or reuse `TournamentTable` with nullable tournamentId? Or keep Cash separate.
    - *Decision:* Let's use `GameInstance` concept for Cash to track session start/end.

## 3. Database Schema Enhancements

To support the refined Cash workflow and strict table management:

```prisma
// Existing
model TournamentTable {
  id            String     @id @default(cuid())
  engineTableId String     @unique // The actual UUID used in WS
  tournamentId  String?    // Nullable for Cash Games? Or use separate model.
  status        String     // ACTIVE, CLOSED
  // ...
}
```

*Proposal:* Use `TournamentTable` for tournament tables only. For Cash, we might not need a DB row *per table* unless we want strict history. For now, we focus on SNG/MTT perfection.

## 4. Implementation Plan

### 4.1 Table Management (WS Server)
- **`TableManager` Class:** centralized logic for creating/closing engines.
- Ensure every `EventEngine` created has a corresponding DB entry in `TournamentTable` (if tournament) or is tracked in memory (if cash).
- **Cleanup:** When a tournament finishes, strictly close all its engines.

### 4.2 Payouts
- Ensure `TournamentPayout` is populated correctly.
- Add `TournamentWinModal` in frontend (Done).

### 4.3 Refactoring `TournamentOrchestrator`
- It currently handles too much (bot spawning, table creation, balancing).
- We should split `TableLifecycle` logic out.

## 5. Execution Steps
1.  **Review `TournamentOrchestrator`:** Ensure `closeTable` is called for ALL tables when MTT finishes.
2.  **Verify SNG Lifecycle:** Test the "Spawn Replacement" -> "Start" -> "Finish" loop.
3.  **Bot Cleanup:** Verify `checkBotOnlyTournaments` handles the DB status updates correctly.

This plan confirms the direction: **Unique IDs for everything active.** Templates are just blueprints.
