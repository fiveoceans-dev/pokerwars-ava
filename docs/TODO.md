## Tournament follow-ups

- Refine finish order tracking and payouts: record precise bust positions; validate top-X/ticket payouts against entrants; consider emitting positions in API/WS.
- Improve balancing/table breaks: better heuristics (counts/thresholds), avoid mid-hand moves once engine hooks allow, and explicit table-break handling.
- Level events: decide if level-up should emit a dedicated WS event (vs. TOURNAMENT_UPDATED) and expose level schedule in detail API.
- Add blind schedule tables (`BlindSchedule`, `BlindLevel`) to replace `blindScheduleId` string and support reuse/versioning.
- Late reg capacity: enforce max tables/players during late reg; document current rules.
- UI: surface seats/positions/payouts/late-reg countdown more prominently; wire live updates to S&G and any tournament detail views.

## Build + Deploy

- Use a dedicated Cloud Run service account instead of default compute SA; reduces IAM surprises and audit noise.
- Split env generation into web/ws/prisma (done) but add a preflight check to fail fast if required vars are empty.
- Document `SKIP_PRISMA_BUILD` + `PRISMA_IMAGE_URI` reuse for faster Prisma job deploys (already supported in `scripts/run_prisma_job.sh`).

## Web App

- Runtime env injection is good; add a small `/debug/env` page to validate envs in prod.
- Lazy-load heavy wallet UI (AppKit) only on interaction to reduce bundle size.
- Remove unused console logs in production (especially wallet/game store logs).

## WS Server

- Add retry/backoff for DB at boot; right now Prisma errors crash early.
- Cache table configs and tournament lists in memory to reduce DB hits on startup.
- Move WS origin checks to a single normalized allowlist (trim & lowercase).
- Persist auth nonces + sessions (DB-backed) instead of in-memory maps.
- Add hand history table (cash + tournaments) for audit/replay and user-facing history.

## Prisma + DB

- Add an initial migration so you never fall back to `db push` in production.
- Add a bootstrap/grant step (script or doc) to ensure `DB_USER` has privileges on `DB_NAME.public` (avoid P1010). (done: `scripts/db_grant.sh`, `docs/env.md`)
- Add ledger config + block tables (done: `LedgerConfig`, `LedgerBlock`) and consider an audit API endpoint.
- Add `prisma migrate status` in CI to prevent drift.
- Use a Cloud Run Job for migrations (already), but tag images with commit SHA for traceability.
