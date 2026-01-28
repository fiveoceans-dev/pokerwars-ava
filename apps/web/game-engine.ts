// Client bridge: type-only re-exports from shim + runtime values via wrapper

// Types only (resolved via tsconfig paths to types/engine-shim.d.ts)
export type {
  Card,
  Table,
  Seat,
  Pot,
  Phase,
  Street,
  ActionType,
  SeatUIState,
  SeatStatus,
  PokerEvent,
  StateTransition,
  SideEffect,
  TimerEvent,
  GameSnapshot,
  ActionValidation,
  Suit,
  Rank,
  ServerEvent,
  ClientCommand,
  LobbyTable,
} from "@hyper-poker/engine";

// Runtime values from local wrapper (to avoid TS analyzing the engine sources)
export {
  RANKS,
  SUITS,
  HASH_SUITS,
  SMALL_BLIND,
  BIG_BLIND,
  ACTION_TIMEOUT_MS,
  GAME_START_COUNTDOWN_MS,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_PER_TABLE,
  STREET_DEAL_DELAY_MS,
  NEW_HAND_DELAY_MS,
  STREETS,
  indexToCard,
  cardToIndex,
  hashIdToCard,
  cardToHashId,
  evaluateHand,
  evaluateCodes,
  setRNG,
  random,
  randomInt,
  seededRNG,
} from "./utils/engine-runtime";

// Local client-safe utilities
export { shortAddress, randomAddress } from "./utils/address";

console.log("🎮 [ClientGameEngine] Pure FSM architecture loaded for UI");
