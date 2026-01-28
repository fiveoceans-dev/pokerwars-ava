/**
 * Pure Event-Driven FSM Poker Engine
 *
 * Professional production architecture featuring:
 * - Event-sourced state management with complete audit trail
 * - Pure functional state transitions via reducer pattern
 * - Single source of truth through EventEngine
 * - Deterministic replay and testing capabilities
 */

// Core Event-Driven FSM Architecture
export { EventEngine } from "./core/eventEngine";
export { reduce } from "./core/reducer";

// Import for type annotations
import { EventEngine } from "./core/eventEngine";

// Pure FSM Types (Table is single source of truth)
export type {
  Table,
  Seat,
  Pot,
  Phase,
  Street,
  ActionType,
  SeatAction,
  SeatStatus,
  SeatUIState,
  PokerEvent,
  StateTransition,
  SideEffect,
  TimerEvent,
  GameSnapshot,
  ActionValidation,
  Card,
  Suit,
  Rank,
} from "./core/types";

// Game Logic Modules
export * from "./logic/betting";
export * from "./logic/potManager";
export {
  validateAction,
  getAvailableActions,
  getBettingLimits,
} from "./logic/validation";

// Utility Functions
export * from "./utils/ringOrder";
export {
  indexToCard,
  cardToIndex,
  hashIdToCard,
  cardToHashId,
} from "./utils/utils";
export * from "./utils/hashEvaluator";
export * from "./utils/rng";

// Timer System
export * from "./managers/timerEvents";

// Networking Types (Table format only)
export type {
  ServerEvent,
  ClientCommand,
  LobbyTable,
} from "./network/networking";

// Hand Evaluation
export * from "./hashTables";

/**
 * Create EventEngine instance for direct integration
 * NO ADAPTER LAYER - Pure FSM integration
 */
export function createEventEngine(
  tableId: string,
  smallBlind = 5,
  bigBlind = 10,
): EventEngine {
  return new EventEngine(tableId, smallBlind, bigBlind);
}

// Engine loaded - using logger from individual components
