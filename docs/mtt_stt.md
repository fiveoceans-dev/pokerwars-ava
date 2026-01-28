# PokerWars Tournament Spec (STT + MTT)

## Overview

We are adding tournament orchestration on top of the existing table-level engine. The WS server owns tournament lifecycle and table balancing, while the engine continues to run single tables.

### Implementation snapshot
- Persistence: Prisma + Postgres (Cloud SQL) for tournaments, levels, registrations, tables, events, payouts.
- API: `/api/tournaments` (list) and `/api/tournaments/:id` (detail) include `lateRegEndAt`, `currentLevel`, `payouts`, `tables`.
- WS: events include `TOURNAMENT_LIST`, `TOURNAMENT_UPDATED`, `TOURNAMENT_SEAT`, `TOURNAMENT_PAYOUTS`.
- Orchestration: S&G auto-starts when full; MTT starts at scheduled time, supports late reg, seats late entrants, balances (fullest→emptiest), advances blind levels via timers, updates table blinds, and pays out when one player remains. Bust order tracking still needs refinement.
- Frontend: MTT page consumes live WS updates; shows level/late-reg and payout summary.

## Tournament types

### STT (Single Table Tournament)
- Starts when the table is full.
- Uses one table only.
- Ends when a single player remains.
- Lobby always shows two STT variants (6-max + 9-max). When a STT starts, a new STT of the same size is created.

### MTT (Multi Table Tournament)
- Starts on a scheduled time.
- Uses multiple tables (spawned as registrations require).
- Supports late registration (configurable duration).
- Ends when a single player remains (or when payout rules are met).
- **No bots for MTT.**

## Registration + economy

- Registration uses either chips or tickets (configurable per tournament).
- Tournaments can award tickets to all finishers or top X finishers, with configurable quantities.
- Ticket-based buy-ins currently use `ticket_x` (X tier).

## Late registration (MTT only)

Allowed durations (minutes):
- 60
- 90
- 120
- 180

Late reg ends after the configured window from tournament start.

## Payout rules

Supported payout modes:

1) Top X split
- Distribute prize pool across top X finishers.
- X is configurable per tournament.
- Split logic configurable (flat, weighted, or structured ladder).

2) Ticket awards
- All finishers get tickets, or only top X.
- Ticket quantity configurable (1, X, or per-rank ladder).

Status: implemented with simple equal split; ticket mode supported. Finish-order tracking needs improvement for precise positions.

## Table balancing

MTT table balancing triggers:
- End of each level (blind level).
- When a table breaks (too few players).

Balancing logic:
- Prefer moving players from short tables into fuller tables.
- Minimize disruption to active hands.
- Never move players mid-hand.

Status: simple fullest→emptiest move after seating/late-reg; needs better heuristics and explicit table-break handling.

## Required tournament fields (baseline)

- id
- name
- type: "stt" | "mtt"
- startMode: "full" | "scheduled"
- startAt (MTT only)
- buyIn:
  - currency: "chips" | "tickets"
  - amount
- lateRegMinutes (MTT only)
- maxPlayers
- startingStack
- blindScheduleId or explicit blind schedule
- payout:
  - mode: "top_x_split" | "tickets"
  - topX
  - ticketCount (optional)
- tableConfigId (blinds + buy-in caps)

## WS contract additions (high-level)

Client commands:
- LIST_TOURNAMENTS
- REGISTER_TOURNAMENT
- UNREGISTER_TOURNAMENT
- TOURNAMENT_STATUS
- START_SNG_WITH_BOTS (S&G only; fills empty seats with bots and starts immediately; requires >=1 human registered)

Server events:
- TOURNAMENT_LIST
- TOURNAMENT_UPDATED
- TOURNAMENT_STARTED
- TOURNAMENT_FINISHED
- TOURNAMENT_PLAYER_ELIMINATED
- TOURNAMENT_TABLE_ASSIGNED
- TOURNAMENT_SEAT
- TOURNAMENT_PAYOUTS

## UI requirements (MTT page)

- Show tournaments, not raw tables.
- Start column must support:
  - Scheduled date (Jan 21, 00:00)
  - Countdown (00 minute(s))
  - Late Reg. (180:00)
- Sortable columns.

## UI requirements (S&G page)

- Columns: Name, Players, Buy-in, Status, Start (last).
- **Status column** shows:
  - `Join` (register action),
  - `Cancel` (unregister action),
  - `Started` (no buttons).
- **Start column** shows `Start w/ bots` for STT only; no disabled state in UI.

## Dev/prod parity

- Same container entrypoint for dev/prod (root Dockerfile + start.sh).
- Tournament configs sourced from server config (env or JSON), not hardcoded in UI.
- WS server enforces same rules in dev and prod.
- Persistence uses Cloud SQL (Postgres) via Prisma; `DATABASE_URL` required in prod.
