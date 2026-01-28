import { RANKS, SUITS, HASH_SUITS } from "../core/constants";
import type { Card } from "../core/types";
import { randomInt, seededRNG } from "./rng";

/* ─────── Random + Deck helpers ─────── */

export function freshDeck(seed?: string): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return seed ? shuffleWithSeed(deck, seed) : shuffle(deck);
}

/** Convenience alias used by higher level room logic */
export const dealDeck = freshDeck;

/** Fisher-Yates in-place shuffle (returns same ref for convenience) */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Deterministic shuffle using a string seed */
export function shuffleWithSeed<T>(array: T[], seed: string): T[] {
  const rng = seededRNG(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Draws & returns the **top** card (mutates deck) */
export function draw(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) throw new Error("Deck underflow");
  return card;
}

/** Convert a numeric card code (0..51) into a Card object */
export function indexToCard(code: number): Card {
  const rank = RANKS[code % RANKS.length];
  const suit = SUITS[Math.floor(code / RANKS.length)];
  return { rank, suit };
}

/** Convert a Card object back into its numeric code (0..51) */
export function cardToIndex(card: Card): number {
  return SUITS.indexOf(card.suit) * RANKS.length + RANKS.indexOf(card.rank);
}

/** Convert a hash format ID (0..51) into a Card object */
export function hashIdToCard(id: number): Card {
  const rank = RANKS[Math.floor(id / 4)];
  const suit = HASH_SUITS[id % 4];
  return { rank, suit };
}

/** Convert a Card object into its hash format ID (0..51) */
export function cardToHashId(card: Card): number {
  return RANKS.indexOf(card.rank) * 4 + HASH_SUITS.indexOf(card.suit);
}
