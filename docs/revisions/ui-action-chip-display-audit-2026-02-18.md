# UI Action + Chip Display Audit - 2026-02-18

## Scope
Investigate UI inconsistencies where:
- a player **checks** but UI still shows bet chips, and
- a player **calls** but UI shows **more chips** than the current call.

Also review all code related to allowed actions, action order, button display, and chip rendering to identify inconsistencies.

## Root Cause Summary
The UI performs **optimistic chip/bet updates** using `PLAYER_ACTION_APPLIED.amount`, but the server emits `amount` from the **client command**, not the **actual committed delta** computed by the reducer. For raises (and some call flows), the committed delta can differ from the raw command. This causes the bet chip stack to drift until the next snapshot.

Additionally, action labels and chip rendering are tied to this optimistic event path, so a `CHECK` or `CALL` with `amount=0` can still leave stale bet chips visible if the round reset or snapshot hasn’t landed yet.

## Evidence (Code)
- UI adjusts bets/chips optimistically on action event:
  - `apps/web/hooks/useGameStore.ts:397` (PLAYER_ACTION_APPLIED handler)
  - `apps/web/hooks/useGameStore.ts:433` (chips/bets decremented by `msg.amount`)
- Server emits `PLAYER_ACTION_APPLIED.amount` from event/command:
  - `apps/ws-server/src/pokerWebSocketServer.ts:645`
  - `apps/ws-server/src/pokerWebSocketServer.ts:653`
- UI renders bet chips from `playerBets[]`:
  - `apps/web/components/Table.tsx:236`

## Additional Inconsistencies (Action Rules + UI)
- **CALL 0 normalization is not reflected in UI labels**
  - Engine allows `CALL` with `toCall=0` and normalizes to CHECK, but UI logs “CALL”.
  - `packages/engine/src/logic/validation.ts:161`
  - `apps/web/hooks/useGameStore.ts:421`

- **Raise boundary mismatch**
  - UI requires `>` for min raise, engine allows `>=`.
  - `apps/web/components/PlayerActionButtons.tsx:42`
  - `packages/engine/src/logic/validation.ts:299`

- **Bet eligibility mismatch**
  - UI hardcodes `myChips >= 50` for BET; engine min bet is `bigBlind`.
  - `apps/web/hooks/usePokerActions.ts:174`
  - `packages/engine/src/logic/validation.ts:261`

- **Duplicate round-completion paths in engine**
  - `ringOrder` and `gameRules` both implement completion logic; divergence risks action order bugs.
  - `packages/engine/src/utils/ringOrder.ts:145`
  - `packages/engine/src/logic/gameRules.ts:248`

## Impact
- **CHECK shows chips** if:
  - UI last saw a bet and did not yet receive street reset or fresh snapshot.
- **CALL shows more chips** if:
  - `PLAYER_ACTION_APPLIED.amount` represents a client request, not actual delta.
- **RAISE drift** is common because actual delta is `toCall + raiseIncrement`, but UI subtracts raw `amount`.

## Recommended Fixes (Priority)
1. **Server-side normalize action payload**
   - Emit `appliedAmount` and `normalizedAction` from reducer results, not raw command.
2. **UI: stop optimistic chip/bet mutation**
   - Treat `PLAYER_ACTION_APPLIED` as **label/log only**.
   - Use `TABLE_SNAPSHOT` as the single source of truth for chips and bets.
3. **Align UI gates to engine rules**
   - Use `>=` for min raise.
   - Remove hardcoded `50` threshold for bet eligibility.
4. **Consolidate round-completion logic**
   - Use a single canonical path to avoid action-order divergence.

## Status
- Not fixed yet. The UI is currently using non-authoritative action amounts and can drift until the next snapshot.

