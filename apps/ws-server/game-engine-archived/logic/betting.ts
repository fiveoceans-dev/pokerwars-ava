/**
 * Betting Logic for Event-Driven Poker Engine
 *
 * Pure functions for betting round management:
 * - enterStreet() - Initialize new betting round
 * - applyAction() - Process player actions
 * - Betting round invariants and completion detection
 */

import { Table, Street, ActionType, SeatStatus } from "../core/types";

import {
  getFirstActor,
  getNextActor,
  getBettingRoundState,
  getToCallAmount,
  canCheck,
} from "../utils/ringOrder";

import { validateAction } from "./validation";

/**
 * Enter new betting street with proper initialization
 */
export function enterStreet(
  table: Table,
  street: Street,
  communityCards?: number[],
): Table {
  const newSeats = table.seats.map((seat) => ({
    ...seat,
    streetCommitted: 0, // Reset street commitments
  }));

  const newCommunityCards = communityCards
    ? [...table.communityCards, ...communityCards]
    : table.communityCards;

  const firstActor = getFirstActor({ ...table, seats: newSeats }, false); // postflop

  return {
    ...table,
    phase: street,
    street,
    seats: newSeats,
    currentBet: 0,
    lastRaiseSize: table.bigBlind,
    lastAggressor: undefined,
    actor: firstActor,
    communityCards: newCommunityCards,
  };
}

/**
 * Apply player action with full validation and state updates
 */
export function applyAction(
  table: Table,
  seatId: number,
  action: ActionType,
  amount: number = 0,
): Table {
  const validation = validateAction(table, seatId, action, amount);

  if (!validation.valid) {
    return table; // Invalid action - no state change
  }

  const seat = table.seats[seatId];
  const newSeats = [...table.seats];
  let newCurrentBet = table.currentBet;
  let newLastAggressor = table.lastAggressor;
  let newLastRaiseSize = table.lastRaiseSize;

  const finalAmount = validation.normalizedAmount ?? amount;

  // Apply action to seat
  switch (action) {
    case "FOLD":
      newSeats[seatId] = {
        ...seat,
        status: "folded" as SeatStatus,
      };
      break;

    case "CHECK":
      // No state changes needed for check
      break;

    case "CALL": {
      const callAmount = finalAmount;

      newSeats[seatId] = {
        ...seat,
        chips: seat.chips - callAmount,
        committed: seat.committed + callAmount,
        streetCommitted: seat.streetCommitted + callAmount,
        status: seat.chips === callAmount ? "allin" : "active",
      };
      break;
    }

    case "BET":
    case "RAISE": {
      const betAmount = Math.min(finalAmount, seat.chips);
      const newStreetCommitted = seat.streetCommitted + betAmount;

      newSeats[seatId] = {
        ...seat,
        chips: seat.chips - betAmount,
        committed: seat.committed + betAmount,
        streetCommitted: newStreetCommitted,
        status: seat.chips === betAmount ? "allin" : "active",
      };

      const raiseSize = newStreetCommitted - table.currentBet;
      newCurrentBet = Math.max(newCurrentBet, newStreetCommitted);
      newLastAggressor = seatId;
      newLastRaiseSize = raiseSize;
      break;
    }

    case "ALLIN": {
      const allInAmount = seat.chips;
      const newStreetCommitted = seat.streetCommitted + allInAmount;

      newSeats[seatId] = {
        ...seat,
        chips: 0,
        committed: seat.committed + allInAmount,
        streetCommitted: newStreetCommitted,
        status: "allin" as SeatStatus,
      };

      // All-in can be a raise if it increases the current bet
      if (newStreetCommitted > table.currentBet) {
        newCurrentBet = newStreetCommitted;
        newLastAggressor = seatId;
        newLastRaiseSize = newStreetCommitted - table.currentBet;
      }
      break;
    }
  }

  // Calculate next actor
  const updatedTable = {
    ...table,
    seats: newSeats,
    currentBet: newCurrentBet,
    lastAggressor: newLastAggressor,
    lastRaiseSize: newLastRaiseSize,
  };

  const nextActorResult = getNextActor(updatedTable);

  return {
    ...updatedTable,
    actor: nextActorResult.actor,
  };
}


/**
 * Check if betting round is complete
 */
export function isBettingRoundComplete(table: Table): boolean {
  const state = getBettingRoundState(table);
  return state.isComplete;
}

/**
 * Get next street after current betting round completes
 */
export function getNextStreet(currentStreet: Street): Street | null {
  const streetOrder: Street[] = ["preflop", "flop", "turn", "river"];
  const currentIndex = streetOrder.indexOf(currentStreet);

  if (currentIndex === -1 || currentIndex === streetOrder.length - 1) {
    return null; // Invalid street or river (go to showdown)
  }

  return streetOrder[currentIndex + 1];
}

/**
 * Calculate betting statistics for UI display
 */
export interface BettingStats {
  potSize: number;
  toCall: number;
  minBet: number;
  minRaise: number;
  maxBet: number;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
}

export function getBettingStats(table: Table, seatId: number): BettingStats {
  const seat = table.seats[seatId];
  const toCall = seat ? getToCallAmount(seat, table.currentBet) : 0;
  const potSize =
    table.pots.reduce((sum, pot) => sum + pot.amount, 0) +
    table.seats.reduce((sum, s) => sum + s.committed, 0);

  if (!seat || seat.status !== "active" || table.actor !== seatId) {
    return {
      potSize,
      toCall: 0,
      minBet: 0,
      minRaise: 0,
      maxBet: 0,
      canCheck: false,
      canCall: false,
      canBet: false,
      canRaise: false,
    };
  }

  const minBet = table.bigBlind;
  const minRaise = table.lastRaiseSize || table.bigBlind;
  const maxBet = seat.chips;

  return {
    potSize,
    toCall,
    minBet,
    minRaise,
    maxBet,
    canCheck: canCheck(seat, table.currentBet),
    canCall: toCall > 0 && seat.chips > 0,
    canBet: table.currentBet === 0 && seat.chips >= minBet,
    canRaise: table.currentBet > 0 && seat.chips >= toCall + minRaise,
  };
}
