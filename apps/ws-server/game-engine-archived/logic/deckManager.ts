/**
 * Deck Manager Module
 * 
 * Manages deck operations for the event-driven poker engine.
 * Ensures deterministic card dealing with seed-based shuffling.
 * All functions are pure - no side effects.
 */

import { Card } from '../core/types';
import { freshDeck, cardToIndex } from '../utils/utils';

/**
 * Create a shuffled deck with the given seed
 * @param seed - Seed string for deterministic shuffling
 * @returns Shuffled deck of cards
 */
export function createDeck(seed: string): Card[] {
  return freshDeck(seed);
}

/**
 * Draw cards from the deck and return their indices
 * @param deck - The deck to draw from
 * @param startIndex - Current position in the deck
 * @param count - Number of cards to draw
 * @param burn - Whether to burn a card first (for community cards)
 * @returns Object containing drawn card indices and next deck position
 */
export function drawCards(
  deck: Card[],
  startIndex: number,
  count: number,
  burn: boolean = false
): {
  cards: number[];
  nextIndex: number;
} {
  if (!deck || deck.length === 0) {
    throw new Error('Cannot draw from empty or undefined deck');
  }

  let currentIndex = startIndex;
  const cards: number[] = [];

  // Validate we have enough cards
  const cardsNeeded = count + (burn ? 1 : 0);
  if (currentIndex + cardsNeeded > deck.length) {
    throw new Error(
      `Not enough cards in deck: need ${cardsNeeded}, have ${deck.length - currentIndex}`
    );
  }

  // Burn a card if requested (standard for community cards)
  if (burn) {
    currentIndex++;
  }

  // Draw the requested cards
  for (let i = 0; i < count; i++) {
    const card = deck[currentIndex];
    cards.push(cardToIndex(card));
    currentIndex++;
  }

  return {
    cards,
    nextIndex: currentIndex
  };
}

/**
 * Draw cards for hole cards (two per player)
 * @param deck - The deck to draw from
 * @param startIndex - Current position in the deck
 * @param playerCount - Number of players to deal to
 * @returns Card indices and next deck position
 */
export function drawHoleCards(
  deck: Card[],
  startIndex: number,
  playerCount: number
): {
  cards: number[];
  nextIndex: number;
} {
  // Deal 2 cards per player, one at a time (casino style)
  const cards: number[] = [];
  let currentIndex = startIndex;

  // First card to each player
  for (let i = 0; i < playerCount; i++) {
    if (currentIndex >= deck.length) {
      throw new Error('Deck underflow during hole card dealing');
    }
    cards.push(cardToIndex(deck[currentIndex]));
    currentIndex++;
  }

  // Second card to each player
  for (let i = 0; i < playerCount; i++) {
    if (currentIndex >= deck.length) {
      throw new Error('Deck underflow during hole card dealing');
    }
    cards.push(cardToIndex(deck[currentIndex]));
    currentIndex++;
  }

  return {
    cards,
    nextIndex: currentIndex
  };
}

/**
 * Get the number of cards needed for a street
 * @param street - The street to deal
 * @returns Number of cards to deal
 */
export function getCardCountForStreet(street: string): number {
  switch (street) {
    case 'flop':
      return 3;
    case 'turn':
    case 'river':
      return 1;
    default:
      return 0;
  }
}

/**
 * Generate a deterministic deck seed
 * @param handNumber - The hand number
 * @param timestamp - Optional timestamp
 * @returns Seed string
 */
export function generateDeckSeed(handNumber: number, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `hand-${handNumber}-${ts}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate deck integrity
 * @param deck - The deck to validate
 * @returns True if deck is valid
 */
export function validateDeck(deck: Card[]): boolean {
  if (!deck || deck.length !== 52) {
    return false;
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const card of deck) {
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) {
      return false; // Duplicate card found
    }
    seen.add(key);
  }

  return true;
}