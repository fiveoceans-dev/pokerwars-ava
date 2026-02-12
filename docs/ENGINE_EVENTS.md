# Engine Event Ownership

This document maps all domain events in the PokerWars ecosystem to the specific engine module that owns their logic. This enforces the "Single Source of Truth" architecture where the `EventEngine` drives all state changes, and the WebSocket server/client merely consume these events.

## Core Gameplay Events (Hand Lifecycle)

| Event Type | Owning Module | Description | Triggered By |
| :--- | :--- | :--- | :--- |
| `StartHand` | `handLifecycle.ts` | Initializes a new hand, shuffles deck, posts blinds. | `checkGameStart()` or manual command |
| `PostBlinds` | `handLifecycle.ts` | Deducts chips for SB/BB/Ante and sets initial pot. | Automatically triggered by `StartHand` |
| `DealHole` | `cardDealing.ts` | Distributes private hole cards to active players. | Automatically triggered by `PostBlinds` |
| `EnterStreet` | `cardDealing.ts` | Advances game phase (Flop, Turn, River) and deals community cards. | Betting round completion |
| `Action` | `actionProcessing.ts` | Processes player moves (Fold, Check, Call, Bet, Raise). | Client `ACTION` command |
| `TimeoutAutoFold` | `actionProcessing.ts` | Forces a fold when a player's action timer expires. | `TimerIntegration` |
| `CloseStreet` | `potManagement.ts` | Aggregates bets into the main/side pots at end of street. | Betting round completion |
| `Showdown` | `potManagement.ts` | Reveals cards and evaluates hands at the end of the game. | `EnterStreet` (River complete) or All-in |
| `Payout` | `potManagement.ts` | Distributes pot winnings to the best hand(s). | `Showdown` or Fold-to-one |
| `HandEnd` | `handLifecycle.ts` | Cleans up table state, resets deck, moves button. | `Payout` completion |

## Player Management Events

| Event Type | Owning Module | Description | Triggered By |
| :--- | :--- | :--- | :--- |
| `PlayerJoin` | `tableManagement.ts` | Seats a new player with chips. | Client `SIT` command |
| `PlayerLeave` | `tableManagement.ts` | Removes a player from the table. | Client `LEAVE` command |
| `PlayerSitOut` | `tableManagement.ts` | Marks a player as sitting out (skips hands). | Client `SIT_OUT` or timeout |
| `PlayerSitIn` | `tableManagement.ts` | Marks a player as active again. | Client `SIT_IN` command |
| `PlayerShowCards` | `tableManagement.ts` | Reveals a player's cards to the table (post-hand). | Client `SHOW_CARDS` |
| `PlayerMuckCards` | `tableManagement.ts` | Hides a player's cards (post-hand). | Client `MUCK_CARDS` |

## System & Tournament Events

| Event Type | Owning Module | Description | Triggered By |
| :--- | :--- | :--- | :--- |
| `GameCountdownStart` | `CountdownManager` | Starts a synced countdown (e.g., game start, reconnect). | Engine logic |
| `UpdateBlinds` | `handLifecycle.ts` | Updates SB/BB levels for tournaments. | `TournamentOrchestrator` |
| `BALANCE_UPDATE` | `LedgerService` | Pushes real-time coin/ticket balance changes. | Buy-in, Payout, Claim |
| `USER_STATUS_UPDATE`| `WebSocketFSMBridge`| Pushes active table/tournament participation status. | Join/Leave/Register |

## Architecture Notes

1.  **Reducers are Pure**: All state changes happen in `packages/engine/src/core/reducers`. They return a new `Table` state and a list of `SideEffects`.
2.  **Side Effects Drive IO**: The `EventEngine` executes side effects (like starting timers or dispatching delayed events) *after* the state transition is committed.
3.  **Bridge is Dumb**: The `WebSocketFSMBridge` (`pokerWebSocketServer.ts`) simply forwards client commands to the engine and broadcasts the resulting `Table` state snapshots. It does not calculate pots, valid actions, or winners.
