# Buy-in, Join/Rejoin, and Table Availability Review - 2026-02-17

## Scope
Reviewed cash, SNG, and MTT lifecycle for:
- buy-in validation and chip semantics,
- join eligibility and open-seat behavior,
- leave/rejoin workflow,
- UI action visibility and warnings,
- consistency between ws-server, DB, and web state.

## Current State

### Cash tables
- Buy-ins are validated server-side using BB limits (30-100 BB) via `validateBuyIn`.
  - `apps/ws-server/src/tableConfig.ts:102`
  - `apps/ws-server/src/pokerWebSocketServer.ts:824`
- Join is only possible on empty seats in UI (`Table` seat click only when seat is empty).
  - `apps/web/components/Table.tsx:177`
  - `apps/web/components/Table.tsx:197`
- Leave flow frees seat and allows another player to join.
  - `apps/ws-server/src/pokerWebSocketServer.ts:963`
- Cash amounts are displayed as `$` on table UI.
  - `apps/web/components/Table.tsx:250`

### SNG/MTT
- Registration buy-in is debited from wallet to tournament escrow.
  - `apps/ws-server/src/index.ts:1329`
  - `apps/ws-server/src/ledgerService.ts:256`
- Tournament entry and table seating are separate; seat assignment is orchestrator-driven.
  - `apps/ws-server/src/tournamentOrchestrator.ts:291`
- Tournament page Join button is hidden when late-reg is closed; finished entries are filtered.
  - `apps/web/components/TournamentTable.tsx:338`
  - `apps/web/components/TournamentTable.tsx:155`

## Gaps to Fix

1. Cash rejoin protection is missing
- Requirement: if player leaves and rejoins within 5 minutes, required buy-in should be at least prior leave stack.
- Current: no rejoin memory or minimum reentry floor exists.

2. SNG/MTT leave behavior is unsafe/unclear
- Players can send `LEAVE` on tournament tables (seat removed) without clear rejoin policy warning.
- Need explicit rule: leave table allowed, but tournament registration remains; reseat policy must be deterministic.

3. Registration status sync is incomplete
- DB status is mostly `REGISTERED`/`BUSTED`; `SEATED` transitions are not consistently maintained.
- UI `registeredIds` can become stale after bust/elimination because it is loaded once and only locally mutated on register/unregister.

4. Tournament table list can stale on client
- Table add/remove updates are not always propagated as full tournament snapshots after balancing/table break.

## Required Workflow Changes

### Cash (mandatory)
1. On cash leave, persist `leftStack`, `leftAt` by wallet+table (5-min TTL).
2. On SIT buy-in validation, enforce: `minBuyIn = max(tableMinBuyIn, leftStackWithinWindow)`.
3. If proposed buy-in is below required, return structured error and suggested minimum.
4. Reuse existing buy-in modal and error rendering (no new visual system).

### SNG/MTT (mandatory)
1. Block direct tournament `LEAVE` hard-exit semantics; convert to "temporary leave/sit-out" unless tournament busts player.
2. Add warning modal (reuse existing `Modal`/`GenericModal` styles):
   - "Leaving table does not unregister you. Rejoin may not be guaranteed if tournament state advances."
3. Disallow Join/Register buttons for eliminated players (`BUSTED`/`CASHED`) and remove Open action for those states.
4. Keep finished/cancelled tournaments hidden consistently in stream updates.

### Data/State consistency
1. Add/maintain `SEATED` registration updates on seat assignment and clear on bust/finish.
2. Broadcast tournament updates after table-break/remove-table so web gets fresh `tables[]`.
3. Keep a single status source in ws events for active tables + tournament participation.

## UI Notes (reuse existing components/styles)
- Reuse `TournamentTable` action column and existing modal components for warnings/confirmations.
- Reuse `BuyInModal` for cash rejoin floor messaging (`minimum required` hint).
- Do not add new style systems; follow current `tbtn`, modal, and table patterns.

## Acceptance Criteria
- Cash: player leaving with X chips cannot rejoin same table within 5 minutes for less than X.
- Cash: open seat is immediately joinable by others after leave.
- SNG/MTT: eliminated players cannot see Join/Open actions.
- SNG/MTT: leave warning is shown and behavior is explicit.
- UI lists remove closed/finished/cancelled entries without page reload.
