/**
 * Pure Reducer for Event-Driven Poker Engine
 *
 * This file now delegates to modular reducers for better organization.
 * All reducer logic has been extracted into focused modules under ./reducers/
 * 
 * Core principle: reduce(table: Table, event: PokerEvent) -> Table
 * - Pure functions with no side effects
 * - Immutable state updates
 * - Deterministic and testable
 * - Complete event sourcing support
 */

import { Table, PokerEvent, StateTransition } from "./types";
import { reduce as modularReduce } from "./reducers";

/**
 * Main reducer function - pure and deterministic
 * Processes events and returns new table state with side effects
 * 
 * This function now delegates to the modular reducer composition.
 */
export function reduce(table: Table, event: PokerEvent): StateTransition {
  return modularReduce(table, event);
}

// All reducer functions have been moved to ./reducers/ modules
// This file now serves as a compatibility layer

// Re-export individual functions for backward compatibility
export {
  startHand,
  postBlinds,
  endHand,
  applyHoleCards,
  enterStreet,
  applyAction,
  handleTimeoutAutoFold,
  closeStreet,
  processShowdown,
  processPayout,
  addPlayer,
  removePlayer,
  sitOutPlayer,
  sitInPlayer,
} from "./reducers";