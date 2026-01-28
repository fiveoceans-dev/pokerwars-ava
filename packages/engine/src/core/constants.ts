import type { Rank, Suit, Street } from "./types";

/** Card ordering (low → high) */
export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];

// Suits are represented using single lowercase letters:
// s = spades, h = hearts, d = diamonds, c = clubs
export const SUITS: Suit[] = ["s", "h", "d", "c"];

// Hash evaluator format suits order (for hash ID calculations)
// Hash format: id = rankIdx * 4 + suitIdx where suitIdx ∈ [0,1,2,3] 
export const HASH_SUITS: Suit[] = ["c", "d", "h", "s"];

/** Blind levels (edit to taste) */
export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;

/** Timing constants from environment variables */
export const ACTION_TIMEOUT_MS = (parseInt(process.env.ACTION_TIMEOUT_SECONDS || "15") * 1000);
export const GAME_START_COUNTDOWN_MS = (parseInt(process.env.GAME_START_COUNTDOWN_SECONDS || "10") * 1000);
export const MIN_PLAYERS_TO_START = parseInt(process.env.MIN_PLAYERS_TO_START || "2");
export const MAX_PLAYERS_PER_TABLE = parseInt(process.env.MAX_PLAYERS_PER_TABLE || "9");
export const STREET_DEAL_DELAY_MS = (parseInt(process.env.STREET_DEAL_DELAY_SECONDS || "3") * 1000);
export const NEW_HAND_DELAY_MS = (parseInt(process.env.NEW_HAND_DELAY_SECONDS || "5") * 1000);

/** Streets in order (betting streets only) */
export const STREETS: Street[] = [
  "preflop",
  "flop",
  "turn",
  "river",
];
