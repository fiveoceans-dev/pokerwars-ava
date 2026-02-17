# Game Lifecycle Audit - 2026-02-16

## Scope
Audit of game/table lifecycle across engine, ws-server, web, and DB with focus on:
- closing SNG/MTT/cash tables correctly,
- preventing stalled games,
- deleting finished tables from active runtime state,
- keeping only results/ledger history in DB.

## Critical Gaps

1. Ghost tournament tables are not fully closed during balancing
- In table-break logic, tables are removed from tournament metadata without calling `bridge.closeTable(tableId)`.
- Impact: stale engine instances and persisted rooms can survive and rehydrate as ghost tables.
- References:
  - `apps/ws-server/src/tournamentOrchestrator.ts:369`
  - `apps/ws-server/src/tournamentOrchestrator.ts:402`
  - `apps/ws-server/src/index.ts:1642`

2. `closeTable` does not always clear seat mappings
- Mapping cleanup is inside cash-ledger path and only for `seat.chips > 0`.
- Tournament tables and busted players can leave stale mappings (`activeStatus` pollution).
- References:
  - `apps/ws-server/src/pokerWebSocketServer.ts:1266`
  - `apps/ws-server/src/pokerWebSocketServer.ts:1268`
  - `apps/ws-server/src/pokerWebSocketServer.ts:1277`

3. Disconnect expiry does not enforce player/table cleanup
- On socket close, server emits reconnect countdown only.
- After grace expiry, session is dropped but no forced table cleanup is triggered.
- References:
  - `apps/ws-server/src/index.ts:1591`
  - `apps/ws-server/src/index.ts:1603`
  - `apps/ws-server/src/sessionManager.ts:75`

## High Priority Gaps

4. Level timers may continue after tournament close
- `LevelTimer` has `clear`, but cancel/finish flows do not explicitly clear timers.
- References:
  - `apps/ws-server/src/tournamentLevels.ts:24`
  - `apps/ws-server/src/tournamentOrchestrator.ts:485`

5. Tournament seating/rebalance dispatches are not awaited
- Async dispatches are invoked without awaiting completion.
- Impact: race conditions, transient inconsistent state.
- References:
  - `apps/ws-server/src/tournamentSeating.ts:39`
  - `apps/ws-server/src/tournamentOrchestrator.ts:343`

6. Startup race around cash template loading
- Cash templates load async, while persistent tables are created immediately.
- References:
  - `apps/ws-server/src/index.ts:194`
  - `apps/ws-server/src/index.ts:1636`

## Medium Priority Gaps

7. Cash lobby table list is not live-updating
- Web page fetches `TABLE_LIST` once on mount and does not subscribe/refresh.
- Closed tables may remain visible until reload.
- References:
  - `apps/web/components/GamesTableSection.tsx:77`

8. Tournament UI filtering mismatch
- Tournament pages can re-add cancelled tournaments via stream updates.
- Table component filters `finished` only.
- References:
  - `apps/web/app/sng/page.tsx:15`
  - `apps/web/components/TournamentTable.tsx:155`

## Current State (What Works)
- Tournament finish path closes remaining tables and writes payouts.
  - `apps/ws-server/src/tournamentOrchestrator.ts:489`
  - `apps/ws-server/src/tournamentOrchestrator.ts:500`
- Room persistence + rehydration is wired.
  - `apps/ws-server/src/persistence.ts:118`
  - `apps/ws-server/src/index.ts:1646`

## Required Remediation Plan

1. Make table closure authoritative
- In all removal paths, call `await bridge.closeTable(tableId)` before `removeTable`.

2. Always clear seat mappings on table close
- Clear for all seated players regardless of chips, table type, or ledger path.

3. Enforce disconnect-expiry cleanup
- On expiry, auto-sit-out or auto-leave and clean runtime mappings/state.

4. Stop level timers on cancel/finish
- Explicitly call `levels.clear(tournamentId)` in all tournament terminal states.

5. Await tournament dispatches
- `await` joins/leaves in seating and balancing workflows.

6. Gate startup on DB table template load
- Ensure runtime table creation waits for DB-backed configs.

7. Make web table/tournament lists strongly consistent
- Subscribe to WS-driven table lifecycle updates (or poll with short interval).
- Apply consistent status filtering (`finished` + `cancelled`) in stream updates.
