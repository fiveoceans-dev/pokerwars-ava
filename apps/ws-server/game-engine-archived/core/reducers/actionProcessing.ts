/**
 * Action Processing Reducer
 *
 * Handles player action events in the poker engine:
 * - Action: Process player actions (fold, check, call, bet, raise, allin)
 * - TimeoutAutoFold: Handle player timeouts with automatic fold
 */

import {
  Table,
  ActionType,
  Street,
  StateTransition,
  SideEffect,
} from "../types";
import { getNextActor, getBettingRoundState } from "../../utils/ringOrder";
import { validateAction as validatePokerAction } from "../../logic/validation";
import { getNextStreet } from "../../logic/betting";
import { ACTION_TIMEOUT_MS } from "../constants";

/**
 * Apply player action with immutable updates
 */
export function applyAction(
  table: Table,
  seatId: number,
  action: ActionType,
  amount: number = 0,
): StateTransition {
  const seat = table.seats[seatId];

  // Comprehensive validation logging for debugging
  console.log(
    `🎯 [Reducer] Action validation - Phase: ${table.phase}, Actor: ${table.actor}, Action: seat ${seatId} ${action} ${amount || ""}`,
  );
  console.log(
    `   Player: ${seat?.pid || "EMPTY"} (status: ${seat?.status || "N/A"}, chips: ${seat?.chips || 0})`,
  );
  console.log(
    `   Game State: currentBet=${table.currentBet}, streetCommitted=${seat?.streetCommitted || 0}`,
  );

  if (!seat || seat.status !== "active") {
    console.warn(
      `❌ [Reducer] Invalid player state - seat ${seatId}: ${!seat ? "NO SEAT" : `status=${seat.status}`}`,
    );
    return { nextState: table, sideEffects: [] }; // Invalid action
  }

  // VALIDATE: Is it this player's turn?
  if (table.actor !== seatId) {
    console.warn(
      `❌ [Reducer] Out of turn action - seat ${seatId} (${seat.pid}) acted, but current actor is seat ${table.actor}`,
    );
    const actorSeat =
      table.actor !== undefined ? table.seats[table.actor] : null;
    console.warn(
      `   Current actor details: ${actorSeat?.pid || "none"} at seat ${table.actor}`,
    );
    return { nextState: table, sideEffects: [] }; // State unchanged - invalid action
  }

  // Enforce action validity (min bet/raise, to-call, phase)
  const validation = validatePokerAction(table, seatId, action, amount);
  if (!validation.valid) {
    console.error(`❌ [Reducer] Action validation failed: ${validation.error}`);
    console.error(
      `   Validation context: ${action} action by ${seat.pid} for ${amount || "default"} chips`,
    );
    console.error(
      `   Table context: phase=${table.phase}, currentBet=${table.currentBet}, playerChips=${seat.chips}`,
    );
    return { nextState: table, sideEffects: [] };
  }

  const newSeats = [...table.seats];
  let newCurrentBet = table.currentBet;
  let newLastAggressor = table.lastAggressor;
  let newLastRaiseSize = table.lastRaiseSize;
  const finalAmount = validation.normalizedAmount ?? amount;

  switch (action) {
    case "FOLD":
      newSeats[seatId] = { ...seat, status: "folded" };
      break;

    case "CHECK":
      // Check only valid if no bet to call
      if (table.currentBet > seat.streetCommitted) {
        return { nextState: table, sideEffects: [] }; // Invalid check
      }
      break;

    case "CALL":
      const toCall = table.currentBet - seat.streetCommitted;
      const callAmount = Math.min(toCall, seat.chips);
      newSeats[seatId] = {
        ...seat,
        chips: seat.chips - callAmount,
        committed: seat.committed + callAmount,
        streetCommitted: seat.streetCommitted + callAmount,
        status: seat.chips === callAmount ? "allin" : "active",
      };
      break;

    case "BET": {
      // No existing bet: commit the bet amount
      const betAmount = Math.min(finalAmount, seat.chips);
      const newStreetCommitted = seat.streetCommitted + betAmount;
      newSeats[seatId] = {
        ...seat,
        chips: seat.chips - betAmount,
        committed: seat.committed + betAmount,
        streetCommitted: newStreetCommitted,
        status: seat.chips === betAmount ? "allin" : "active",
      };
      newCurrentBet = Math.max(newCurrentBet, newStreetCommitted);
      newLastAggressor = seatId;
      newLastRaiseSize = betAmount;
      break;
    }
    case "RAISE": {
      // Must first call up to currentBet, then add raise increment
      const toCall = Math.max(0, table.currentBet - seat.streetCommitted);
      const raiseInc = Math.min(finalAmount, Math.max(0, seat.chips - toCall));
      const totalPutIn = Math.min(seat.chips, toCall + raiseInc);
      const newStreetCommitted = seat.streetCommitted + totalPutIn;
      newSeats[seatId] = {
        ...seat,
        chips: seat.chips - totalPutIn,
        committed: seat.committed + totalPutIn,
        streetCommitted: newStreetCommitted,
        status: seat.chips === totalPutIn ? "allin" : "active",
      };
      newCurrentBet = Math.max(newCurrentBet, newStreetCommitted);
      newLastAggressor = seatId;
      newLastRaiseSize = raiseInc;
      break;
    }

    case "ALLIN":
      const allInAmount = seat.chips;
      const allInStreetCommitted = seat.streetCommitted + allInAmount;
      newSeats[seatId] = {
        ...seat,
        chips: 0,
        committed: seat.committed + allInAmount,
        streetCommitted: allInStreetCommitted,
        status: "allin",
      };

      // Handle all-in bet/raise logic with proper short all-in rules
      if (allInStreetCommitted > table.currentBet) {
        const raiseIncrement = allInStreetCommitted - table.currentBet;
        const minRaise = table.lastRaiseSize || table.bigBlind;

        // Only count as full raise if it meets minimum raise requirement
        if (raiseIncrement >= minRaise) {
          newLastRaiseSize = raiseIncrement;
          newLastAggressor = seatId;
          console.log(
            `🎯 [Reducer] All-in qualifies as full raise: $${raiseIncrement} (min: $${minRaise})`,
          );
        } else {
          console.log(
            `🎯 [Reducer] Short all-in: $${raiseIncrement} raise (min: $${minRaise}) - no aggressor change`,
          );
          // Don't change lastRaiseSize or lastAggressor for short all-ins
        }

        newCurrentBet = allInStreetCommitted;
      }
      break;
  }

  // Record action for UI display
  newSeats[seatId] = { ...newSeats[seatId], action };

  // Track BB action in preflop using game rules
  let bbHasActed = table.bbHasActed;
  if (table.phase === "preflop" && seatId === table.bbSeat) {
    bbHasActed = true;
    console.log(`💰 [Reducer] BB (seat ${seatId}) has now acted`);
  }

  // Track action sequence for proper round completion logic
  const playersActedThisRound = new Set(table.playersActedThisRound || []);
  playersActedThisRound.add(seatId);

  // Set round start actor if not already set (first action of the round)
  const roundStartActor = table.roundStartActor ?? seatId;

  console.log(
    `🎯 [Reducer] Player ${seatId} acted (${playersActedThisRound.size} players acted this round)`,
  );

  // Create intermediate table state to check betting round completion
  const updatedTable = {
    ...table,
    seats: newSeats,
    currentBet: newCurrentBet,
    lastAggressor: newLastAggressor,
    lastRaiseSize: newLastRaiseSize,
    bbHasActed,
    playersActedThisRound,
    roundStartActor,
  };

  // Use proper state machine logic for next actor
  const nextActorResult = getNextActor(updatedTable);

  const nextState = {
    ...updatedTable,
    actor: nextActorResult.actor,
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "action_applied" } },
  ];

  // STOP timer for current player who just acted
  if (seat.pid) {
    sideEffects.push({
      type: "STOP_TIMER",
      payload: { playerId: seat.pid },
    });
    console.log(`⏰ [Reducer] Stopping timer for ${seat.pid} who just acted`);
  }

  // Start timer for next actor if needed
  if (nextActorResult.actor !== undefined && nextActorResult.actor >= 0) {
    const nextSeat = nextState.seats[nextActorResult.actor];
    if (nextSeat.pid && nextSeat.status === "active") {
      sideEffects.push({
        type: "START_TIMER",
        payload: {
          playerId: nextSeat.pid,
          seatId: nextActorResult.actor,
          timeoutMs: ACTION_TIMEOUT_MS,
        },
      });
    }
  }

  // If betting round is complete, schedule next transition events
  const roundState = getBettingRoundState(nextState);
  if (roundState.isComplete) {
    // Collect into pots for current street
    sideEffects.push({
      type: "DISPATCH_EVENT",
      payload: { event: { t: "CloseStreet" } },
    });

    const currentStreet = nextState.street;
    const nextStreet = currentStreet
      ? getNextStreet(currentStreet as Street)
      : null;
    const atRiver = !nextStreet;

    if (roundState.reason === "fold-to-one") {
      // Immediate showdown on fold-to-one
      sideEffects.push({
        type: "DISPATCH_EVENT",
        payload: { event: { t: "Showdown", results: [] } },
      });
    } else if (roundState.reason === "all-players-allin") {
      // Auto-deal remaining streets before showdown
      if (nextStreet) {
        sideEffects.push({
          type: "DISPATCH_EVENT",
          payload: {
            event: { t: "EnterStreet", street: nextStreet, isAutoDealt: true },
          },
        });
      } else {
        sideEffects.push({
          type: "DISPATCH_EVENT",
          payload: { event: { t: "Showdown", results: [] } },
        });
      }
    } else if (atRiver) {
      sideEffects.push({
        type: "DISPATCH_EVENT",
        payload: { event: { t: "Showdown", results: [] } },
      });
    } else if (nextStreet) {
      sideEffects.push({
        type: "DISPATCH_EVENT",
        payload: { event: { t: "EnterStreet", street: nextStreet } },
      });
    }
  }

  return { nextState, sideEffects };
}

/**
 * Handle player timeout with automatic fold
 */
export function handleTimeoutAutoFold(
  table: Table,
  seatId: number,
): StateTransition {
  console.log(`⏰ [Reducer] Processing timeout auto-fold for seat ${seatId}`);

  // Check if seat is still the current actor
  if (table.actor !== seatId) {
    console.log(
      `⏰ [Reducer] Ignoring timeout for seat ${seatId} - no longer actor (current: ${table.actor})`,
    );

    // Return unchanged state with notification side effect
    return {
      nextState: table,
      sideEffects: [
        { type: "EMIT_STATE_CHANGE", payload: { reason: "timeout_ignored" } },
      ],
    };
  }

  // Validate seat exists and is actionable
  const seat = table.seats[seatId];
  if (!seat || seat.status !== "active" || !seat.pid) {
    console.warn(
      `⏰ [Reducer] Cannot timeout seat ${seatId} - invalid state: ${seat?.status}`,
    );

    return {
      nextState: table,
      sideEffects: [
        {
          type: "EMIT_STATE_CHANGE",
          payload: { reason: "timeout_invalid_seat" },
        },
      ],
    };
  }

  console.log(`⏰ [Reducer] Auto-folding ${seat.pid} at seat ${seatId}`);

  // Apply fold for current actor - this will handle timer cleanup
  const foldResult = applyAction(table, seatId, "FOLD");

  // Handle timeout through PlayerStateManager for unified state management
  const { getPlayerStateManager } = require("../../managers/sitOutManager");
  const playerStateManager = getPlayerStateManager(table.id);
  const stateManagerEffects = playerStateManager.handleTimeout(
    seat.pid,
    table.id,
  );

  // Add timeout-specific side effects
  const timeoutSideEffects: SideEffect[] = [
    ...foldResult.sideEffects,
    ...stateManagerEffects,
    { type: "EMIT_STATE_CHANGE", payload: { reason: "player_timeout_folded" } },
  ];

  // If player was auto-sat out, dispatch PlayerSitOut event
  const hasSitOutEffect = stateManagerEffects.some(
    (effect: SideEffect) =>
      effect.type === "EMIT_STATE_CHANGE" &&
      "reason" in effect.payload &&
      typeof effect.payload.reason === "string" &&
      effect.payload.reason.includes("sit_out_timeout"),
  );

  if (hasSitOutEffect) {
    timeoutSideEffects.push({
      type: "DISPATCH_EVENT",
      payload: {
        event: {
          t: "PlayerSitOut",
          seat: seatId,
          pid: seat.pid,
          reason: "timeout",
        },
      },
    });
  }

  return {
    nextState: foldResult.nextState,
    sideEffects: timeoutSideEffects,
  };
}
