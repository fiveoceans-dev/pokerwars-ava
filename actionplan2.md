# Action Plan Status vs actionplan.md

## Implemented highlights (matching actionplan expectations)
- Server restart resilience has been delivered: `loadAllRooms()` now loops through persisted tables and calls `bridge.rehydrateEngine`, fulfilling Pillar 2's restore pass requirement (see `actionplan.md`, Pillar 2 bullet 4).
- Real-time economy signals are live (`BALANCE_UPDATE`, `USER_STATUS_UPDATE` events plus the WebSocket/engine hooks), so the UI now reflects buy-ins/refunds/claims without polling and the global store reacts immediately, in line with Pillar 3 and Pillar 5's balance-event goals.
- Governance tooling exists (`apps/web/app/account/governance`) with admin-only access, template listing, and hot-reload controls, matching the Gap Remediation goal for an admin console and the Pillar 4 governance console note.

## Remaining work (actionplan.md items still unfulfilled)
1. **Pillar 1 documentation & DOM-minimal checklist:** there is no published mapping of engine modules to domain events nor a documented checklist that keeps the UI strictly replaying sanctioned `ServerEvent` payloads; these deliverables are still missing from Pillar 1.
2. **Pillar 3 regression/tests:** useGameStore now consumes events, but we still lack the promised Vitest/jsdom regression suite that mocks server events and validates selectors/components, and there is no instrumentation proving every user action waits for canonical events before mutating UI state (Pillar 3 bullets 2–3).
3. **Active status polling:** `useActiveStatus` still issues HTTP fetches instead of relying solely on the store’s real-time data, so the “poll removal” promise in the recent enhancement summary is only partially met and should be revisited.
4. **Pillar 5 ledger segmentation & multi-asset buy-ins/payouts:** the schema and services still treat tournaments/cash tables as single escrow flows; there is no explicit promo-bank/segmented-account workflow nor multi-asset ticket/coin combination support as requested under Pillar 5.
5. **Gap remediation – template load gating:** server startup still logs an error and continues with defaults if fetching templates fails; it does not fail fast or block accepting connections, so the “single source of truth” guarantee in the Gap addendum remains at risk.

## Suggested next actions
- Draft the missing engine-event ownership doc plus the DOM-minimal checklist mentioned in actionplan.md Pillar 1.
- Build the regression suite described in Pillar 3 and ensure `useActiveStatus` subscribes purely to WebSocket updates (remove the redundant API polling).
- Extend the ledger model and workflow to include promo banks, per-table escrows with multi-asset support, and a documented process for topping up/returning balances as outlined in Pillar 5.
- Update server startup to abort or retry when template loading fails so the runtime and database stay aligned (Gap remediation point).
