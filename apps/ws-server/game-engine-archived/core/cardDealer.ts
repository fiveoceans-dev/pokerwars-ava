/**
 * Card Generation Module
 * 
 * Handles the generation of cards for poker hands using the table's deck.
 * This module creates card data structures that are then applied to game state
 * via the reducer functions.
 * 
 * Naming convention:
 * - generate*() functions: Create card data from deck
 * - apply*() functions: Update game state (in reducer.ts)
 */

import { Table, Seat, Street, Card } from './types';
import { drawHoleCards, drawCards, getCardCountForStreet } from '../logic/deckManager';

/**
 * Generate hole cards for all active players using table's deck
 * 
 * @param table - Current table state with deck
 * @returns Object containing player card assignments and next deck index
 */
export function generateHoleCards(table: Table): {
  cards: Record<string, [number, number]>;
  nextIndex: number;
} {
  if (!table.deck || table.deckIndex === undefined) {
    throw new Error('No deck available in table state for dealing hole cards');
  }

  // Get active players in dealing order (starting from left of button)
  const activePlayers: { pid: string; seatIndex: number }[] = [];
  const seatCount = table.seats.length;
  const buttonIndex = table.button;
  
  // Collect active players in dealing order
  for (let offset = 1; offset <= seatCount; offset++) {
    const seatIndex = (buttonIndex + offset) % seatCount;
    const seat = table.seats[seatIndex];
    
    if (seat.pid && seat.status === "active") {
      activePlayers.push({ pid: seat.pid, seatIndex });
    }
  }
  
  if (activePlayers.length === 0) {
    return { cards: {}, nextIndex: table.deckIndex };
  }
  
  // Draw cards for all players
  const { cards: drawnCards, nextIndex } = drawHoleCards(
    table.deck,
    table.deckIndex,
    activePlayers.length
  );
  
  // Distribute cards to players (2 per player, dealt one at a time)
  const playerCards: Record<string, [number, number]> = {};
  const playerCount = activePlayers.length;
  
  for (let i = 0; i < playerCount; i++) {
    const player = activePlayers[i];
    // First card is at index i, second card is at index i + playerCount
    playerCards[player.pid] = [
      drawnCards[i],
      drawnCards[i + playerCount]
    ];
  }
  
  console.log(`🎴 [CardDealer] Generated hole cards for ${activePlayers.length} players`);
  
  return {
    cards: playerCards,
    nextIndex
  };
}

/**
 * Generate community cards for the given street using table's deck
 * 
 * @param table - Current table state with deck
 * @param street - The street to deal cards for
 * @param burn - Whether to burn a card before dealing (default: true)
 * @returns Object containing card indices and next deck index
 */
export function generateBoardCards(
  table: Table,
  street: Street,
  burn: boolean = true
): {
  cards: number[];
  nextIndex: number;
} {
  if (!table.deck || table.deckIndex === undefined) {
    throw new Error('No deck available in table state for dealing board cards');
  }

  const cardCount = getCardCountForStreet(street);
  
  if (cardCount === 0) {
    console.warn(`⚠️ [CardDealer] No cards to deal for street: ${street}`);
    return { cards: [], nextIndex: table.deckIndex };
  }

  // Draw the cards with optional burn
  const { cards, nextIndex } = drawCards(
    table.deck,
    table.deckIndex,
    cardCount,
    burn
  );
  
  console.log(`🎴 [CardDealer] Generated ${cards.length} cards for ${street}`);
  
  return {
    cards,
    nextIndex
  };
}

/**
 * DEPRECATED: Use table's deck instead
 * @deprecated
 */
export function createShuffledDeck(seed: string): Card[] {
  console.warn('⚠️ [CardDealer] createShuffledDeck is deprecated. Use deckManager.createDeck instead');
  throw new Error('createShuffledDeck is deprecated. Deck should be managed in table state');
}

/**
 * Validate that enough cards remain in deck for the operation
 */
export function validateDeckSize(table: Table, operation: string, required: number): boolean {
  if (!table.deck || table.deckIndex === undefined) {
    console.error(`❌ [CardDealer] No deck available for ${operation}`);
    return false;
  }
  
  const remaining = table.deck.length - table.deckIndex;
  
  if (remaining < required) {
    console.error(`❌ [CardDealer] Not enough cards for ${operation}: need ${required}, have ${remaining}`);
    return false;
  }
  
  return true;
}