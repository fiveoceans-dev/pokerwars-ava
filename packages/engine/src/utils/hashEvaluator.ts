import type { Card, Rank, Suit } from "../core/types";
import {
  BINARIES_BY_ID,
  SUITBIT_BY_ID,
  DP,
  SUITS,
  FLUSH,
  NO_FLUSH_5,
  NO_FLUSH_6,
  NO_FLUSH_7,
} from "../hashTables";

const NO_FLUSHES: Record<number, number[]> = {
  5: NO_FLUSH_5,
  6: NO_FLUSH_6,
  7: NO_FLUSH_7,
};

const RANK_MAP: Record<Rank, number> = {
  "2": 0,
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

// Map suit letters to the indices expected by the evaluator tables
const SUIT_MAP: Record<Suit, number> = {
  c: 0, // clubs
  d: 1, // diamonds
  h: 2, // hearts
  s: 3, // spades
};

function cardToId(card: Card): number {
  return RANK_MAP[card.rank] * 4 + SUIT_MAP[card.suit];
}

function hashQuinary(quinary: number[], numCards: number): number {
  let sum = 0;
  const length = quinary.length;
  for (let rank = 0; rank < length; rank++) {
    const cnt = quinary[rank];
    if (cnt) {
      sum += DP[cnt][length - rank - 1][numCards];
      numCards -= cnt;
    }
  }
  return sum;
}

/**
 * Evaluate a set of 5 to 7 cards and return a numeric rank.
 * Smaller ranks are stronger hands.
 */
export function evaluateHand(cards: Card[]): number {
  const ids = cards.map(cardToId);
  const handSize = ids.length;
  const noFlush = NO_FLUSHES[handSize];
  if (!noFlush) {
    throw new Error(
      `The number of cards must be between 5 and 7. passed size: ${handSize}`,
    );
  }

  let suitHash = 0;
  for (const id of ids) suitHash += SUITBIT_BY_ID[id];
  const flushSuit = SUITS[suitHash] - 1;
  if (flushSuit !== -1) {
    let handBinary = 0;
    for (const id of ids) {
      if (id % 4 === flushSuit) handBinary |= BINARIES_BY_ID[id];
    }
    return FLUSH[handBinary];
  }

  const quinary = new Array(13).fill(0);
  for (const id of ids) quinary[Math.floor(id / 4)]++;
  return noFlush[hashQuinary(quinary, handSize)];
}

/**
 * Direct evaluator using hash format IDs (0..51).
 * Cards are now generated directly in hash evaluator format: id = rankIdx * 4 + suitIdx
 * where suitIdx ∈ [0,1,2,3] for [c,d,h,s]
 */
export function evaluateCodes(codes: number[]): number {
  const ids = codes; // Cards already in hash format - no conversion needed
  const handSize = ids.length;
  const noFlush = NO_FLUSHES[handSize];
  if (!noFlush) {
    throw new Error(
      `The number of cards must be between 5 and 7. passed size: ${handSize}`,
    );
  }

  let suitHash = 0;
  for (const id of ids) suitHash += SUITBIT_BY_ID[id];
  const flushSuit = SUITS[suitHash] - 1; // -1 if no flush
  if (flushSuit !== -1) {
    let handBinary = 0;
    for (const id of ids) {
      if (id % 4 === flushSuit) handBinary |= BINARIES_BY_ID[id];
    }
    return FLUSH[handBinary];
  }

  const quinary = new Array(13).fill(0);
  for (const id of ids) quinary[Math.floor(id / 4)]++;
  return noFlush[hashQuinary(quinary, handSize)];
}
