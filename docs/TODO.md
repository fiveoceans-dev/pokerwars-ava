## Tournament follow-ups

- Refine finish order tracking and payouts: record precise bust positions; validate top-X/ticket payouts against entrants; consider emitting positions in API/WS.
- Improve balancing/table breaks: better heuristics (counts/thresholds), avoid mid-hand moves once engine hooks allow, and explicit table-break handling.
- Level events: decide if level-up should emit a dedicated WS event (vs. TOURNAMENT_UPDATED) and expose level schedule in detail API.
- Late reg capacity: enforce max tables/players during late reg; document current rules.
- UI: surface seats/positions/payouts/late-reg countdown more prominently; wire live updates to S&G and any tournament detail views.
