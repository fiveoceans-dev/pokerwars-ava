# Bot Fill Guide (short-handed tables)

Goal: automatically sit house bots so real players can start/continue games when tables are short. This is about when/where to place bots, not how to connect a bot client.

## Placement rules
- **Trigger:** Monitor lobby tables; if active seats < `minPlayersToStart` (e.g., 2 for HU, 3–4 for 6-max/9-max) and at least one human is waiting, schedule bot seats.
- **Cap bots:** Never exceed `maxBotSeatsPerTable` (e.g., 2 for 6-max, 3 for 9-max). Prefer fewer bots when possible.
- **Exit logic:** When humans join and the table has enough players, park bots at next blind or immediately if they are out of hand. If humans drop and table risks breaking, re-seat bots.
- **Table selection:** Prefer the most active table per stake before opening new ones; do not seat bots at private/invite-only tables.

## Behavior & fairness
- **Strategy:** Simple and predictable by type (random/tight/loose/aggressive) with a clear upgrade path for ranges later.
- **Timing:** Add 200–600 ms randomized response delay to mimic humans but stay within action timeouts.
- **Bankroll:** Give bots deterministic stacks (e.g., table default buy-in); auto-rebuy to the minimum so they never bust and leave holes.
- **Seating:** Multiple bots can sit together; keep behavior predictable and non-collusive by not sharing hole-card logic.
- **Identity:** Bot display names must start with `bot_00000`, incrementing or randomizing the trailing digits for uniqueness.
- **Bounty:** Each bot has a fixed ticket bounty (`ticket_x`) that is awarded to the player who busts the bot; surface this in table metadata if possible.

## Seating algorithm (high level)
1) Poll lobby (or subscribe to table events) every N seconds.
2) For each public table:
   - compute `humans = occupied - bots`.
   - if `humans > 0` and `occupied < minToStart` → seat up to `minToStart - occupied` bots (respecting caps).
   - if `humans >= minToStart` and `bots > 0` → mark bots to leave as soon as not in-hand.
3) Apply seats/leaves with a small stagger (e.g., 1–2 seconds) to avoid bursts.

## S&G manual start with bots
- A “Start w/ bots” trigger is available for Sit & Go only (no bots for MTT).
- When invoked, fill all remaining empty seats with bots (respect caps), mark the tournament running, and start immediately.
- Require at least one human registered before allowing the start trigger.
- Broadcast a tournament update so clients see status change and bot-filled seats.
- Bots seated via this trigger should use the `bot_00000xxxxx` naming and carry their ticket bounty as described above.
- Bots only choose **valid available actions** (never random illegal actions). If `check` is not valid, they choose between `call`, `fold`, or a size from the allowed raise list.
- Bot styles available now: `random` (default), `tight`, `loose`, `aggressive`. Table-level style selection is supported; stake-based mapping can be added easily.

## Server hooks to add (if missing)
- Flag bot seats: extend seat state with `isBot: true` and surface in snapshots/events.
- Bot allowlist: config for `maxBotSeatsPerTable`, `minPlayersToStart`, and stake-level enablement.
- Admin controls: runtime toggles to enable/disable bots per stake, plus metrics (seated, hands played, exits).

## Testing checklist
- Tables start with 1 human + bots filling to min seats.
- Bots leave within one hand after humans fill required seats.
- Bots never exceed cap; do not seat on private tables.
- Action timing stays under server timeouts; no ERROR spam.
