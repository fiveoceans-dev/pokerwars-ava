import { createHash } from 'crypto';
import type { Table, Seat } from '../core/types';

/**
 * CardLedger: canonical card operations using numeric codes (0..51).
 * Centralizes shuffling, drawing, burning, and dealing for deterministic FSM.
 */

// Generate a shuffled deck of numeric codes using hash evaluator format
export function shuffle(seed: string): number[] {
  const deck: number[] = [];
  
  // Generate deck in hash evaluator format: id = rankIdx * 4 + suitIdx
  // where rankIdx ∈ [0,12] and suitIdx ∈ [0,3] for [c, d, h, s]
  for (let rank = 0; rank < 13; rank++) {
    for (let suit = 0; suit < 4; suit++) {
      deck.push(rank * 4 + suit);
    }
  }
  
  // Simple deterministic shuffle (Fisher–Yates with seeded RNG)
  let s = xmur3(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const r = s();
    const j = Math.floor(r * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Draw next N cards from deckCodes
export function drawNext(
  deckCodes: number[],
  deckIndex: number,
  count: number
): { cards: number[]; nextIndex: number } {
  if (deckIndex + count > deckCodes.length) {
    throw new Error(`Deck underflow: need ${count}, have ${deckCodes.length - deckIndex}`);
  }
  const cards = deckCodes.slice(deckIndex, deckIndex + count);
  return { cards, nextIndex: deckIndex + count };
}

// Deal hole cards in round-robin order (one per player each round)
export function dealHole(
  table: Table,
  seatOrder: number[]
): { assignments: Map<number, [number, number]>; nextIndex: number } {
  const deckCodes = table.deckCodes || [];
  const startIdx = table.deckIndex || 0;
  const playerCount = seatOrder.length;
  if (playerCount === 0) return { assignments: new Map(), nextIndex: startIdx };

  // First round
  const round1 = drawNext(deckCodes, startIdx, playerCount);
  const round2 = drawNext(deckCodes, round1.nextIndex, playerCount);

  const assignments = new Map<number, [number, number]>();
  for (let i = 0; i < playerCount; i++) {
    const seatId = seatOrder[i];
    assignments.set(seatId, [round1.cards[i], round2.cards[i]]);
  }
  return { assignments, nextIndex: round2.nextIndex };
}

// Burn 1, then draw 3 for flop
export function dealFlop(table: Table): {
  burn: number;
  cards: number[];
  nextIndex: number;
} {
  const deckCodes = table.deckCodes || [];
  let idx = table.deckIndex || 0;
  const burn = drawNext(deckCodes, idx, 1);
  idx = burn.nextIndex;
  const cards3 = drawNext(deckCodes, idx, 3);
  idx = cards3.nextIndex;
  return { burn: burn.cards[0], cards: cards3.cards, nextIndex: idx };
}

// Burn 1, then draw 1 for turn and river
export function dealTurnOrRiver(table: Table): {
  burn: number;
  card: number;
  nextIndex: number;
} {
  const deckCodes = table.deckCodes || [];
  let idx = table.deckIndex || 0;
  const burn = drawNext(deckCodes, idx, 1);
  idx = burn.nextIndex;
  const card1 = drawNext(deckCodes, idx, 1);
  idx = card1.nextIndex;
  return { burn: burn.cards[0], card: card1.cards[0], nextIndex: idx };
}

// Cryptographic commitment of the deck order (sha256)
export async function commit(deckCodes: number[]): Promise<string> {
  const payload = Uint8Array.from(deckCodes);
  const hash = createHash('sha256');
  hash.update(Buffer.from(payload));
  return hash.digest('hex');
}

// Deterministic PRNG seed function
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h = Math.imul(h ^ ch, 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    // 0..1
    return (h >>> 0) / 4294967296;
  };
}
