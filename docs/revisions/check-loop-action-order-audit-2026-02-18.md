# Check-Loop + Action Order Audit (All Players) - 2026-02-18

## Scope
Audit of the reported “check loop” deadlock (affects bots and human players) and a wider review of action-order workflow, source-of-truth boundaries, and priority/decision rules for timers and round completion.

## Executive Summary
The root cause (Set serialization in persisted table state) is plausible, but the implementation is incomplete and currently unsafe in production. The engine does not compile cleanly, round-completion logic is inconsistent across code paths, and there is no migration guard for previously persisted tables. The action-order workflow is mostly centralized in the engine, but there are duplicated rule paths that can diverge, creating risks for loops and premature street transitions.

## Source Of Truth & Responsibility (Current Design)
- **Single source of truth**: `EventEngine` table state.
  - All game state changes must go through engine reducers.
  - WS layer is a transport/adapter only; it should not mutate game state directly.
- **Authority for action legality & turn order**: engine reducer + rules (`actionProcessing.ts`, `ringOrder.ts`, `gameRules.ts`).
- **Timer authority**: `TimerIntegration` + `TimerEventManager` in engine. Timer events dispatch `TimeoutAutoFold` into engine, which is authoritative.
- **Persistence**: ws-server persists raw engine table state to Redis/memory; rehydrate loads that state back into `EventEngine`.

Key flows:
1. Client sends command -> WS validates -> engine `dispatch`.
2. Reducer applies action -> emits `START_TIMER`/`STOP_TIMER` side effects -> engine executes timers.
3. Engine emits `stateChanged` -> ws broadcasts `TABLE_SNAPSHOT` -> web updates UI.
4. Engine snapshot is persisted after every state change.

## Action Order & Priority Rules (Observed)
- **Primary rule**: `getNextActor` from `ringOrder.ts` determines turn order and round completion.
- **Round-complete gating** (priority order):
  1. Fold-to-one or all-players-all-in finishes round immediately.
  2. BB-option check (preflop) prevents early round close.
  3. Action tracking (`playersActedThisRound`) + committed amounts must align.
  4. Fallback: last aggressor or committed-amount checks.
- **Timer priority**: timers are started/stopped as side effects of the action reducer.
  - A timeout triggers `TimeoutAutoFold` which re-enters the reducer; this is a higher-priority event than waiting for human input.

## Critical Findings
- **Migration gap**: persisted rooms can still contain `playersActedThisRound` as `{}` (from Set serialization). Reducer spreads with `[...]` will throw on `{}` and crash action processing. Needs normalization on rehydrate or before use.
  - `packages/engine/src/core/reducers/actionProcessing.ts:190`
  - `packages/engine/src/core/eventEngine.ts:210`
  - `apps/ws-server/src/persistence.ts:103`

- **Engine build currently fails**:
  - `playersActedThisRound` now array, but `gameRules` still uses `.has` (Set API).
  - `SeatStatus` mismatch: reducer uses `"sittingOut"` literal not in union.
  - `packages/engine/src/logic/gameRules.ts:250`
  - `packages/engine/src/core/reducers/tableManagement.ts:165`

## High Findings
- **Duplicate round-completion logic**: `ringOrder` updated to array semantics, `gameRules` still uses Set semantics. Different call paths can disagree on whether a round is complete, which can produce action loops or early transitions.
  - `packages/engine/src/utils/ringOrder.ts:145`
  - `packages/engine/src/logic/gameRules.ts:248`

## Medium Findings
- **CALL when `toCall=0` is accepted but not normalized to CHECK**: can pollute action history and UI labels.
  - `packages/engine/src/logic/validation.ts:161`
  - `packages/engine/src/core/reducers/actionProcessing.ts:95`

## What Was Implemented Correctly
- `playersActedThisRound` converted to `number[]` and reducer uses `includes` with uniqueness guard.
  - `packages/engine/src/core/types.ts:126`
  - `packages/engine/src/core/reducers/actionProcessing.ts:190`
- Action tracking reset in hand/street reducers uses `[]`.
  - `packages/engine/src/core/reducers/handLifecycle.ts:86`
  - `packages/engine/src/core/reducers/cardDealing.ts:176`
- Timer-to-engine dispatch path is consistent: timeout drives `TimeoutAutoFold`, which re-enters reducer.
  - `packages/engine/src/managers/timerEvents.ts:397`
  - `packages/engine/src/core/reducers/actionProcessing.ts:305`

## Required Fixes (Minimum)
1. **Normalize persisted state on rehydrate**:
   - If `playersActedThisRound` is not an array, coerce to `[]` (or best-effort array) before reducer use.
2. **Unify round-completion logic**:
   - Replace `gameRules` `.has` with `includes`, or remove the redundant `gameRules.isBettingRoundComplete` and use one canonical path.
3. **Fix SeatStatus mismatch**:
   - Either add `"sittingOut"` to `SeatStatus` union or map to existing valid status.
4. **Normalize `CALL 0` to `CHECK`**:
   - In reducer, map action to `CHECK` when `toCall==0` to keep history/UI coherent.

## Professional Workflow Recommendation
- **Canonical action pipeline**: only engine decides action validity, next actor, and round completion. WS/UI never mutate table state.
- **Timer priority**: timer events preempt delayed UI input and must never be blocked by transport or UI state. This is already true, but should be preserved.
- **State durability**: add a migration guard in rehydrate to ensure older persisted states cannot break runtime.

## Status
- **Partially implemented**. Core idea is valid, but migration and rules consistency are incomplete.
- **Not production-ready** until the required fixes are applied and engine compiles.

