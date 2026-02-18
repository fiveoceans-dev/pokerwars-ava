# Bet/Turn Workflow Audit - 2026-02-17

## Scope
- Engine turn order and action validation (`packages/engine`).
- WS command path + event forwarding (`apps/ws-server`).
- Web action controls and optimistic state updates (`apps/web`).
- DB/ledger/persistence interaction for live game continuity.
- Focus: bet amounts, legal actions, player turns, sit-out behavior, and single source of truth.

## What Works Well
- Turn ownership and action legality are enforced in reducer path (`packages/engine/src/core/reducers/actionProcessing.ts:50`, `packages/engine/src/logic/validation.ts:25`).
- Short all-in handling preserves no-reopen semantics for insufficient raises (`packages/engine/src/core/reducers/actionProcessing.ts:157`, `packages/engine/src/logic/validation.ts:228`).
- Betting round completion tracks both action sequence and matching commitments (`packages/engine/src/utils/ringOrder.ts:145`).
- Timer + timeout auto-fold flow exists and protects against stalls (`packages/engine/src/managers/timerEvents.ts:397`, `packages/engine/src/core/reducers/actionProcessing.ts:300`, `apps/ws-server/src/pokerWebSocketServer.ts:433`).
- Real-time table sync is already event-driven: engine `stateChanged` -> WS `TABLE_SNAPSHOT` -> web `applySnapshot` (no page reload required) (`apps/ws-server/src/pokerWebSocketServer.ts:404`, `apps/ws-server/src/index.ts:1071`, `apps/web/hooks/useGameStore.ts:225`).
- Room persistence/rehydration exists for game continuity after restart (`apps/ws-server/src/pokerWebSocketServer.ts:414`, `apps/ws-server/src/index.ts:1738`).

## Sit-Out Card Dealing Verification
- `PlayerSitOut` updates the player-state manager (single source for sit-out state), not transient UI-only flags (`packages/engine/src/core/reducers/tableManagement.ts:160`).
- At `StartHand`, seats are rebuilt and players marked sit-out are not eligible to participate (`packages/engine/src/core/reducers/handLifecycle.ts:101`, `packages/engine/src/core/reducers/handLifecycle.ts:110`).
- `DealHole` only deals to seats with `status === "active"` (`packages/engine/src/core/reducers/cardDealing.ts:34`).
- Conclusion: a sit-out player should not receive hole cards in the next hand.  
- Remaining gap: this rule is not protected by an explicit automated test and should be added.

## Findings (By Severity)

### Critical
- Engine regression confidence is currently weak because core rule tests fail:
  - Turn-order failures (`packages/engine/src/test/rules/turnOrder.test.ts`).
  - Blind-posting failures (`packages/engine/src/test/rules/blinds.test.ts`).
  - Hand-end test enters timer loop and showdown evaluation with invalid card count (`packages/engine/src/core/handEndEvent.test.ts`).
- Impact: production behavior may be correct in many cases, but invariants are not defended by passing automated tests.

### High
- WS emits `PLAYER_ACTION_APPLIED.amount` from client command amount, not actual committed delta (`apps/ws-server/src/pokerWebSocketServer.ts:653`).
- Web consumes that amount as real chip/bet delta (`apps/web/hooks/useGameStore.ts:433`).
- For `RAISE`, reducer commits `toCall + raiseIncrement` (`packages/engine/src/core/reducers/actionProcessing.ts:126`), so optimistic UI can be temporarily wrong until next snapshot.

### High
- Web min-raise source is inconsistent:
  - Snapshot uses `room.minRaise` fallback, but table snapshots mainly expose `lastRaiseSize`/`bigBlind` (`apps/web/hooks/useGameStore.ts:701`).
  - `ACTION_PROMPT` updates `minRaise`, but WS path does not actively emit `ACTION_PROMPT` events in current forwarding flow.
- Impact: slider/button min raise can drift from engine reality and generate avoidable rejected actions.

### Medium
- `usePokerActions` has hardcoded bet threshold `myChips >= 50` instead of blinds/min-bet rules (`apps/web/hooks/usePokerActions.ts:174`).

### Medium
- `PlayerActionButtons` raise enablement uses `>` instead of `>=` for `toCall + minRaise` (`apps/web/components/PlayerActionButtons.tsx:38`), blocking exact-min-raise boundary cases.

### Medium
- WS workspace has no discovered test files under current config (`apps/ws-server/package.json` + current test include output), so server-side command/event behavior is under-tested.

### Medium
- Web performs extra `JOIN_TABLE` resync on `PLAYER_SIT_OUT` / `PLAYER_SAT_IN` events (`apps/web/hooks/useGameStore.ts:281`, `apps/web/hooks/useGameStore.ts:297`) even though snapshots are already pushed live.
- Impact: unnecessary command traffic and occasional UI churn; should trust pushed snapshots as canonical state.

### Medium
- DB availability currently affects ledger endpoints and returns `503` when unavailable (`apps/ws-server/src/index.ts:758`, `apps/ws-server/src/index.ts:797`).
- Impact: table gameplay can continue in memory/persistence, but economy/auth flows degrade. This should be explicit in operational runbooks and health alerts.

## Proper Workflow (Target Architecture)
1. Client sends command over WS (`ACTION`, `SIT_OUT`, etc.) with `cmdId`.
2. WS validates command shape and session/seat ownership.
3. WS dispatches event to engine only (no direct state mutation in WS/web).
4. Engine reducer applies rules and computes authoritative state.
5. Engine emits `stateChanged`; WS broadcasts sanitized `TABLE_SNAPSHOT` to every seated client.
6. Web updates UI from snapshot/state events only; no page refresh, no polling dependency for table state.
7. WS persists table snapshot (`saveRoom`) for restart continuity; closed tables are removed from persistence.
8. DB/ledger is authoritative for balances/transactions; table runtime is authoritative for hand/turn state.

## Professional Fix Order
1. **Stabilize test baseline first**  
   - Make turn/blind/hand-end tests green or replace incorrect expectations with current canonical rules.
   - Add explicit regression test: "sitting-out player receives no hole cards on next hand".
2. **Normalize action amount semantics at transport boundary**  
   - Emit both `requestedAmount` and `appliedAmount` (or only applied delta) from WS after reducer result.
3. **Single source of truth for action limits**  
   - Drive web controls from snapshot-derived values (`currentBet`, `streetCommitted`, `lastRaiseSize`, `bigBlind`) and remove stale fallbacks.
4. **UI correctness cleanup**  
   - Replace hardcoded `50` with rule-driven min bet.
   - Fix raise boundary `>` to `>=`.
   - Remove forced `JOIN_TABLE` resync on sit-out/sit-in and trust live snapshots.
5. **Add protocol-level integration tests**  
   - WS: action -> reducer -> emitted event payload consistency.
   - Web store: remove/limit optimistic balance-chips mutation and assert snapshot-driven reconciliation.
6. **Operational alignment (web/ws/engine/db)**  
   - Document degraded-mode behavior (engine live, ledger down) and alerting thresholds for DB/Redis failures.
   - Keep local and GCP env/run scripts aligned so ws-server always resolves the intended `DATABASE_URL`.

## Exit Criteria
- No failed engine rule tests for turn order, blinds, hand-end lifecycle.
- Sit-out regression test proves no hole cards dealt to sit-out players.
- Web controls never offer illegal actions relative to engine state.
- WS action event payloads exactly represent applied state deltas.
- No temporary chip/bet misreporting after raise/call before snapshot arrives.
- Table state (players, actions, cards, turns) updates live via WS snapshots/events without manual page refresh.

## Implementation Status (Code Check)

### Implemented
- Sit-out players are excluded from next-hand hole-card dealing path (`packages/engine/src/core/reducers/handLifecycle.ts:101`, `packages/engine/src/core/reducers/cardDealing.ts:34`).
- Real-time table updates are snapshot-driven (engine -> ws -> web) without requiring page refresh (`apps/ws-server/src/pokerWebSocketServer.ts:404`, `apps/web/hooks/useGameStore.ts:225`).
- Room persistence + startup rehydration loop exists (`apps/ws-server/src/pokerWebSocketServer.ts:414`, `apps/ws-server/src/index.ts:1738`).
- Local startup script syncs computed runtime DB URL into ws env (`scripts/start_local_nodocker.sh:154`, `scripts/start_local_nodocker.sh:158`).

### Partial
- Operational env alignment work exists in local script, but ws-server env loading still uses overriding dotenv mode (`apps/ws-server/src/index.ts:13`), which can reintroduce stale env precedence issues.
- DB/ledger degraded behavior is partially handled through `503` responses, but not represented as explicit runtime mode/health policy (`apps/ws-server/src/index.ts:758`, `apps/ws-server/src/index.ts:797`).

### Not Implemented Yet
- WS action payload semantics are still not normalized (`PLAYER_ACTION_APPLIED.amount` still reflects command/event amount, not guaranteed applied delta) (`apps/ws-server/src/pokerWebSocketServer.ts:653`).
- Web action limits still rely on inconsistent min-raise sources (`apps/web/hooks/useGameStore.ts:701`, `apps/web/hooks/useGameStore.ts:394`).
- `usePokerActions` still has hardcoded `myChips >= 50` betting threshold (`apps/web/hooks/usePokerActions.ts:174`).
- `PlayerActionButtons` raise gate still uses `>` instead of `>=` (`apps/web/components/PlayerActionButtons.tsx:38`).
- Web still force-resyncs with `JOIN_TABLE` on sit-out/sit-in events (`apps/web/hooks/useGameStore.ts:281`, `apps/web/hooks/useGameStore.ts:297`).
- Dedicated sit-out/no-hole-cards regression test is not present yet.
