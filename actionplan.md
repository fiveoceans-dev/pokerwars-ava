# Action Plan

## Mission
Perform a full-scope audit of the game engine, WebSocket server, web client, and database so the shared poker state truly has a single source of truth and the UI reflects every ws-server event without a manual page refresh—just like a mature PokerStars/WPT rollout where the engine drives every decision and each client is a thin, real-time consumer.

## Pillar 1: Game Engine as Canonical Authority
- [x] Inventory all exported types/events in `packages/engine/src/network/networking.ts` and confirm both workspaces import the same package build (`@hyper-poker/engine`).
- [x] Trace the reducers/event engine in `packages/engine/src/core` to ensure no other module reimplements rules (especially around action resolution, pot calculation, and timing). 
- [x] Identify any gaps where the server or client reaches into their own logic instead of deferring to the engine and mark them for refactoring or delegation.
- [x] Add a “DOM-minimal” checklist that ensures the UI layer never reimplements engine decisions (pot math, timers, action validation) and that every rendering pass is simply replaying sanitized `ServerEvent` payloads.
- [x] Deliverable: `docs/ENGINE_EVENTS.md` mapping each domain event to the engine module that owns it.

## Pillar 2: WebSocket Server & Persistence
- [x] Review `apps/ws-server/src/pokerWebSocketServer.ts`, `sessionManager.ts`, and `persistence.ts` to confirm every outbound event is sourced directly from the engine state and every inbound command routes through the engine event engine.
- [x] Ensure persistence layers (Redis + fallback maps) keep a single copy of the `Table`/`Session` state, and document how `apps/ws-server/prisma/schema.prisma` and the migrations keep tournament/ledger data aligned with runtime state.
- [x] Run `npx prisma migrate status -w apps/ws-server` and `npm run db:migrate` in a dev database to validate no drift between schema and migrations.
- [x] Add a restore pass that rehydrates persisted `Table` snapshots into `WebSocketFSMBridge` on startup so Redis/memory persistence actually survives restarts and replay timers/countdowns.
- [x] Deliverable: Checklist verifying event broadcast, persistence, and DB schema/migration parity.

## Pillar 5: Ledgered Economy, Claims, and Prize Distribution
- [x] Map every claim/convert, buy-in, escrow refund, and payout path spanning `ledgerService.ts`, `chainAdapter.ts`, `pokerWebSocketServer.ts`, and the HTTP admin endpoints so the DB ledger, engine, and client share a single truth.
- [x] Validate that free claims respect treasury limits/cooldowns and that every buy-in/refund/payout transaction produces the expected `LedgerTransaction`+`LedgerBlock` rows.
- [x] Surface these balance changes as WebSocket events (or table snapshot extensions) so the web client sees coin/ticket deltas immediately instead of relying on HTTP polling.
- [x] Deliverable: Ledger invariants checklist + sample test cases verifying claims/buyins/prize splits emit canonical events.
- [x] Expand the ledger model to support segmented accounts (promo banks, per-tournament/SNG/cash escrows) and document a workflow for “topping up” these sub-ledgers so the main treasury only funds them once instead of being drained per transaction.
- [x] Add governance roles (admins, managers, promoters) with clear permissions for modifying cash/SNG/MTT templates, assigning promo balances, and moving coins/tickets between wallets; document the workflow for requesting tokens from the treasury and returning unused balances at shift end.
- [x] Model buy-ins and payouts as coins, tickets, or hybrid mixes so every table/tournament template can opt into multi-asset entry fees and multi-currency prize pools—ensure the ledger entries record both asset types when applicable.


## Pillar 3: Web Client Real-Time Sync
- [x] Audit `apps/web/hooks/useGameStore.ts`, `useBalances.ts`, `useActiveStatus.ts`, and components like `GamesTableSection` to confirm they consume only the WebSocket store/state and do not fetch static snapshots from other sources.
- [x] Build regression tests (Vitest + jsdom) that feed mocked server events into `useGameStore` and assert that the store mutations flow through the selectors consumed by `app/game` components, ensuring no manual refresh is required.
- [x] Verify every client-side action (join, sit, bet) waits for a live event confirmation before mutating local store; add instrumentation/logging for discrepancies.
- [x] Deliverable: Test cases and notes on any UI pieces that still rely on stale data.

## Pillar 4: Operational Runbook
- [ ] Capture commands (build engine, run ws server, start web, sync env, apply migrations) and the order they need to run so new devs can rebuild the single-source stack locally.
- [ ] Define acceptance criteria for the “live update” requirement: e.g., table list updates when the server emits `TABLE_CREATED`, player actions land in UI within 100 ms, no page reload needed.
- [ ] Add monitoring steps (logs, WS health checks) referencing `apps/ws-server/src/health.ts` and session events so operators know when the real-time feed is broken.
- [x] Design a governance console (starting from `apps/web/app/account` → new `governance` view) with sidebar navigation, role management widgets, promo balance assignment, and editable cash/SNG/MTT template tables so managers/admins/promo staff can oversee coins/tickets without hitting the console.

## Gap remediation addendum
- [x] Ensure persisted rooms (`persistence.ts`) are restored into the FSM bridge at startup so the “single source of truth” table state survives restarts instead of being discarded.  
- [x] Expand the WebSocket event surface (or explicit WS balance events) so `apps/web` no longer depends on intermittent HTTP refreshes for balances/registrations; every UI mutation should edge-event off the engine stream.  
- [x] Gate server startup on success when loading table configs from Prisma (fail fast on missing templates) and elevate logs/alerts so DB schema drift never leads to mismatched stakes.
- [x] Rewire the UI layer to rely only on engine-sanctioned `ServerEvent` payloads (dom-minimal), eliminating client-side pot/timer math and ensuring the web view mirrors the state broadcasted by the WS server.
- [x] Build an internal admin UI for managers to edit table templates (blinds, buy-in ranges, prize splits) and assign balances (promo bank, daily funds) with approval hooks so casino-style checks and balances live in the tooling.

## New Features & Updates
- **Governance Console**: A new `/account/governance` page allows admins to view/manage game templates and system configuration.
- **Template Management**: Admins can view SNG/MTT/Cash templates directly from the database via the governance console.
- **Hot-Reload**: Implemented a system to increment `templatesVersion` in `SystemConfig`, triggering a reload of templates across all server instances without downtime.
- **Real-Time Balance Updates**: The server now pushes `BALANCE_UPDATE` events via WebSocket whenever a user's coin/ticket balance changes, removing the need for client-side polling.
- **Real-Time Status Updates**: The server pushes `USER_STATUS_UPDATE` events to notify clients of active game participation (Cash/SNG/MTT), ensuring the UI reflects current status instantly.
- **Segmented Ledger**: Added `PROMO` account type and `UserRole` model to support more granular financial tracking and permissions.

## Next Steps
1.  **Operational Documentation**: Complete Pillar 4 by documenting the build/run commands and monitoring steps in `README.md` or a dedicated `OPS.md`.
2.  **Testing**: Expand regression tests to cover the new governance and real-time update features.
3.  **Promo Workflow**: Implement the specific API endpoints or UI flows for funding promo accounts and distributing promo tokens, leveraging the new ledger capabilities.
4.  **Role-Based Access Control (RBAC)**: Fully integrate the `UserRole` model into the application logic to replace hardcoded admin checks where appropriate.