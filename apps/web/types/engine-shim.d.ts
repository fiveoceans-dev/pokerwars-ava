// Type-only shim to avoid compiling @hyper-poker/engine in web build
// Prevents tsgo concurrency crash by keeping engine out of the TS program graph
declare module "@hyper-poker/engine" {
  export type Card = any;
  export type Table = any;
  export type Seat = any;
  export type Pot = any;
  export type Phase = any;
  export type Street = any;
  export type ActionType = any;
  export type SeatUIState = any;
  export type SeatStatus = any;
  export type PokerEvent = any;
  export type StateTransition = any;
  export type SideEffect = any;
  export type TimerEvent = any;
  export type GameSnapshot = any;
  export type ActionValidation = any;
  export type Suit = any;
  export type Rank = any;

  export type ServerEvent = any;
  export type ClientCommand = any;
  export type LobbyTable = any;

  export const RANKS: any;
  export const SUITS: any;
  export const HASH_SUITS: any;
  export const SMALL_BLIND: any;
  export const BIG_BLIND: any;
  export const ACTION_TIMEOUT_MS: any;
  export const GAME_START_COUNTDOWN_MS: any;
  export const MIN_PLAYERS_TO_START: any;
  export const MAX_PLAYERS_PER_TABLE: any;
  export const STREET_DEAL_DELAY_MS: any;
  export const NEW_HAND_DELAY_MS: any;
  export const STREETS: any;
  export const indexToCard: any;
  export const cardToIndex: any;
  export const hashIdToCard: any;
  export const cardToHashId: any;
  export const evaluateHand: any;
  export const evaluateCodes: any;
  export const setRNG: any;
  export const random: any;
  export const randomInt: any;
  export const seededRNG: any;
}
