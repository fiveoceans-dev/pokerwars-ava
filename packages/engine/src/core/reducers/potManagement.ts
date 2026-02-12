/**
 * Pot Management Reducer
 * 
 * Handles pot-related events in the poker engine:
 * - CloseStreet: Collect committed chips into pots
 * - Showdown: Process showdown and determine winners
 * - Payout: Distribute winnings to players
 */

import {
  Table,
  Phase,
  StateTransition,
  SideEffect,
  PayoutDistribution,
} from "../types";
import { collectIntoPots } from "../../logic/potManager";

/**
 * Close current betting street and collect chips into pots
 */
export function closeStreet(table: Table): StateTransition {
  // Collect committed chips into pots
  const { pots } = collectIntoPots(table.seats);

  const nextState = {
    ...table,
    pots,
    actor: undefined,
  };

  const sideEffects: SideEffect[] = [
    { type: "CLEAR_TIMERS", payload: {} },
    { type: "EMIT_STATE_CHANGE", payload: { reason: "street_closed" } },
  ];

  return { nextState, sideEffects };
}

/**
 * Process showdown results
 * Note: Hand evaluation is done by the EventEngine, reducer just transitions state
 */
export function processShowdown(table: Table, results: any[]): StateTransition {
  // Count players still in hand
  const playersInHand = table.seats.filter(seat => 
    seat.pid && 
    (seat.status === "active" || seat.status === "allin")
  ).length;

  console.log(`🃏 [Reducer] Starting showdown with ${playersInHand} players`);

  const nextState = {
    ...table,
    phase: "showdown" as Phase,
    // Clear the actor since no more betting
    actor: undefined,
    // Keep existing revealedPids (explicit reveals)
    revealedPids: (table.revealedPids || []).map((p) => p.toLowerCase()),
    autoRevealAll: false, // Don't force face-up for everyone
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "showdown_started" } },
    // Pure FSM: dispatch hand evaluation as side effect
    { type: "EVALUATE_HANDS", payload: {} },
  ];

  return {
    nextState,
    sideEffects,
  };
}

/**
 * Process payout distributions with winner announcements
 */
export function processPayout(
  table: Table,
  distributions: PayoutDistribution[],
): StateTransition {
  const newSeats = [...table.seats];

  console.log(`💰 [Reducer] Processing payouts for ${distributions.length} distributions`);

  // Distribute winnings and log winners
  distributions.forEach((dist) => {
    const seatIndex = newSeats.findIndex((seat) => seat.pid === dist.pid);
    if (seatIndex !== -1) {
      const oldChips = newSeats[seatIndex].chips;
      newSeats[seatIndex] = {
        ...newSeats[seatIndex],
        chips: oldChips + dist.amount,
      };
      
      console.log(`💰 [Reducer] ${dist.pid} wins $${dist.amount} (${dist.reason}) - ${oldChips} → ${oldChips + dist.amount} chips`);
    }
  });

  // Calculate total pot distributed
  const totalPayout = distributions.reduce((sum, dist) => sum + dist.amount, 0);
  const totalPots = table.pots.reduce((sum, pot) => sum + pot.amount, 0);
  
  console.log(`💰 [Reducer] Total distributed: $${totalPayout} from $${totalPots} in pots`);

  // Compute winners set (pids with positive payout)
  const winners = Array.from(
    new Set(
      distributions.filter((d) => d.amount > 0).map((d) => d.pid.toLowerCase()),
    ),
  );

  // Merge winners into revealedPids (winners must show)
  const revealedSet = new Set(
    (table.revealedPids || []).map((p) => p.toLowerCase()),
  );
  winners.forEach((pid) => revealedSet.add(pid));

  // Immediately transition to handEnd phase to prevent infinite loops
  const nextState = {
    ...table,
    phase: "handEnd" as Phase,
    seats: newSeats,
    pots: [], // Clear pots after payout
    actor: undefined,
    lastAggressor: undefined,
    currentBet: 0,
    lastRaiseSize: table.bigBlind,
    winnersPids: winners,
    revealedPids: Array.from(revealedSet),
  };

  // Side effects: announce winners and schedule next hand
  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "winners_announced" } },
    { type: "EMIT_STATE_CHANGE", payload: { reason: "payout_complete" } },
    {
      type: "DISPATCH_EVENT",
      payload: { event: { t: "HandEnd" }, delayMs: 5000 },
    },
  ];

  return { nextState, sideEffects };
}
