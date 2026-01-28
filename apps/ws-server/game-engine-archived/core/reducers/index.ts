/**
 * Reducer Composition Pattern
 * 
 * This module provides a unified interface to all specialized reducer modules.
 * It maintains backward compatibility with the monolithic reducer while 
 * organizing code into focused, testable modules.
 */

import {
  Table,
  PokerEvent,
  StateTransition,
} from "../types";

// Import all specialized reducer functions
import { startHand, postBlinds, endHand } from "./handLifecycle";
import { applyHoleCards, enterStreet } from "./cardDealing";
import { applyAction, handleTimeoutAutoFold } from "./actionProcessing";
import { closeStreet, processShowdown, processPayout } from "./potManagement";
import { addPlayer, removePlayer, sitOutPlayer, sitInPlayer } from "./tableManagement";
import { Table } from "../types";

function playerShowCards(table: Table, pid: string) {
  // Validate phase and that player has cards
  const validPhase = ["showdown", "payout"].includes(table.phase as any);
  if (!validPhase) return { nextState: table, sideEffects: [] };
  const seat = table.seats.find((s) => s.pid && s.pid.toLowerCase() === pid.toLowerCase());
  if (!seat || !seat.holeCards || seat.status === "folded") return { nextState: table, sideEffects: [] };
  const set = new Set((table.revealedPids || []).map((p) => p.toLowerCase()));
  set.add(pid.toLowerCase());
  const nextState = { ...table, revealedPids: Array.from(set) } as Table;
  return { nextState, sideEffects: [{ type: "EMIT_STATE_CHANGE", payload: { reason: "player_show_cards" } }] };
}

function playerMuckCards(table: Table, pid: string) {
  // Validate phase and that player has cards; winners cannot muck
  const validPhase = ["showdown", "payout"].includes(table.phase as any);
  if (!validPhase) return { nextState: table, sideEffects: [] };
  const seat = table.seats.find((s) => s.pid && s.pid.toLowerCase() === pid.toLowerCase());
  if (!seat || !seat.holeCards || seat.status === "folded") return { nextState: table, sideEffects: [] };
  const winners = new Set((table.winnersPids || []).map((p) => p.toLowerCase()));
  if (winners.has(pid.toLowerCase())) return { nextState: table, sideEffects: [] };
  const set = new Set((table.revealedPids || []).map((p) => p.toLowerCase()));
  set.delete(pid.toLowerCase());
  const nextState = { ...table, revealedPids: Array.from(set) } as Table;
  return { nextState, sideEffects: [{ type: "EMIT_STATE_CHANGE", payload: { reason: "player_muck_cards" } }] };
}

/**
 * Main reducer function - pure and deterministic
 * Processes events and returns new table state with side effects
 */
export function reduce(table: Table, event: PokerEvent): StateTransition {
  switch (event.t) {
    case "StartHand":
      return startHand(table, event.handNumber, event.timestamp);

    case "PostBlinds":
      return postBlinds(table, event.sb, event.bb, event.ante);

    case "DealHole":
      return applyHoleCards(table, event.cards);

    case "EnterStreet":
      return enterStreet(table, event.street, event.cards, event.isAutoDealt);

    case "Action":
      return applyAction(table, event.seat, event.action, event.amount);

    case "TimeoutAutoFold":
      return handleTimeoutAutoFold(table, event.seat);

    case "CloseStreet":
      return closeStreet(table);

    case "Showdown":
      return processShowdown(table, event.results);

    case "Payout":
      return processPayout(table, event.distributions);

    case "HandEnd":
      return endHand(table);


    case "PlayerJoin":
      return addPlayer(
        table,
        event.seat,
        event.pid,
        event.chips,
        event.nickname,
      );

    case "PlayerLeave":
      return removePlayer(table, event.seat, event.pid);

    case "PlayerSitOut":
      return sitOutPlayer(table, event.seat, event.pid, event.reason);

    case "PlayerSitIn":
      return sitInPlayer(table, event.seat, event.pid);

    case "PlayerShowCards":
      return playerShowCards(table, event.pid);

    case "PlayerMuckCards":
      return playerMuckCards(table, event.pid);

    default:
      // TypeScript ensures all cases are handled
      return { nextState: table, sideEffects: [] };
  }
}

// Export individual reducer functions for direct usage and testing
export {
  // Hand lifecycle
  startHand,
  postBlinds,
  endHand,
  
  // Card dealing
  applyHoleCards,
  enterStreet,
  
  // Action processing
  applyAction,
  handleTimeoutAutoFold,
  
  // Pot management
  closeStreet,
  processShowdown,
  processPayout,
  
  // Table management
  addPlayer,
  removePlayer,
  sitOutPlayer,
  sitInPlayer,
};

// Export types for convenience
export type { StateTransition } from "../types";
