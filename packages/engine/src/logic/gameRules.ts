/**
 * Pure Game Rules Module for Poker Engine
 *
 * Centralizes all poker rules logic following FSM principles:
 * - Pure functions with no side effects
 * - Deterministic and testable
 * - Follows official poker rules
 * - Supports both heads-up and multi-way play
 */

import { Table, Seat, SeatStatus, Phase, Street } from "../core/types";
import {
  isActionable,
  getNextActionableIndex,
  countActivePlayers,
  countPlayersInHand,
} from "../utils/ringOrder";

export interface BlindPositions {
  sb: number; // Small blind seat index
  bb: number; // Big blind seat index
}

export interface ActionOrderResult {
  actor: number; // Next actor seat index (-1 if none)
  isHeadsUp: boolean; // Whether this is heads-up play
  activeCount: number; // Number of active players
}

// Core player state helpers are centralized in utils/ringOrder

/**
 * Get blind positions according to poker rules
 *
 * Rules:
 * - Heads-up (2 players): Button = Small Blind, Other = Big Blind
 * - Multi-way (3+ players): Button → SB → BB (clockwise)
 */
export function getBlindPositions(
  seats: Seat[],
  button: number,
): BlindPositions | null {
  // Consider players in hand (occupied), regardless of current "active" vs "allin"
  const occupied = seats
    .map((s, i) => (s.pid ? i : -1))
    .filter((i) => i !== -1);

  if (occupied.length < 2) return null;

  if (occupied.length === 2) {
    // Heads-up: Button = Small Blind, other = Big Blind
    // Ensure button points to one of the occupied seats
    const buttonSeatIndex = seats[button]?.pid ? button : occupied[0];
    const sbIndex = buttonSeatIndex;
    const bbIndex = occupied.find((i) => i !== sbIndex)!;
    return { sb: sbIndex, bb: bbIndex };
  }

  // Multi-way: Button → next occupied = SB → next occupied = BB
  const n = seats.length;
  const nextOccupiedFrom = (start: number): number => {
    for (let step = 1; step <= n; step++) {
      const idx = (start + step) % n;
      if (seats[idx]?.pid) return idx;
    }
    return -1;
  };

  const sbIndex = nextOccupiedFrom(button);
  if (sbIndex === -1) return null;
  const bbIndex = nextOccupiedFrom(sbIndex);
  if (bbIndex === -1) return null;
  return { sb: sbIndex, bb: bbIndex };
}

/**
 * Get first actor for a betting round according to poker rules
 *
 * Rules:
 * - Heads-up preflop: Button (Small Blind) acts first
 * - Heads-up postflop: Big Blind acts first
 * - Multi-way preflop: Left of Big Blind (UTG) acts first
 * - Multi-way postflop: Left of Button acts first
 */
export function getFirstActor(
  table: Table,
  isPreflop: boolean,
): ActionOrderResult {
  const { seats, button } = table;
  const activeCount = countActivePlayers(seats);
  const inHandCount = countPlayersInHand(seats);
  const isHeadsUp = inHandCount === 2; // heads-up if exactly two players remain in hand

  // If fewer than 2 players in hand, no betting actor
  if (inHandCount < 2) {
    return { actor: -1, isHeadsUp, activeCount };
  }
  // If no actionable players (everyone all-in), no actor
  if (activeCount === 0) {
    return { actor: -1, isHeadsUp, activeCount };
  }

  if (isPreflop) {
    if (isHeadsUp) {
      // Heads-up preflop: Button (Small Blind) acts first
      const blindPositions = getBlindPositions(seats, button);
      if (!blindPositions) {
        return { actor: -1, isHeadsUp, activeCount };
      }
      // If SB not actionable (e.g., posted all-in), choose next actionable clockwise
      const candidate = isActionable(seats[blindPositions.sb])
        ? blindPositions.sb
        : getNextActionableIndex(seats, blindPositions.sb);
      return { actor: candidate, isHeadsUp, activeCount };
    } else {
      // Multi-way preflop: Left of Big Blind (UTG) acts first
      const blindPositions = getBlindPositions(seats, button);
      if (!blindPositions) {
        return { actor: -1, isHeadsUp, activeCount };
      }

      // Start from UTG and find first actionable
      const utg = getNextActionableIndex(seats, blindPositions.bb);
      const actor = utg;
      return { actor, isHeadsUp, activeCount };
    }
  } else {
    // Postflop
    if (isHeadsUp) {
      // Heads-up postflop: Big Blind acts first
      const blindPositions = getBlindPositions(seats, button);
      if (!blindPositions) {
        return { actor: -1, isHeadsUp, activeCount };
      }
      // If BB not actionable (all-in), choose next actionable clockwise
      const candidate = isActionable(seats[blindPositions.bb])
        ? blindPositions.bb
        : getNextActionableIndex(seats, blindPositions.bb);
      return { actor: candidate, isHeadsUp, activeCount };
    } else {
      // Multi-way postflop: Left of Button acts first
      const firstActor = getNextActionableIndex(seats, button);
      return { actor: firstActor, isHeadsUp, activeCount };
    }
  }
}

/**
 * Calculate next button position for the following hand
 *
 * Rules:
 * - Button advances clockwise to next player with chips
 * - Skip players with 0 chips or who are sitting out
 * - If no valid next position, keep current button
 */
export function calculateNextButton(
  seats: Seat[],
  currentButton: number,
): number {
  const seatsWithChips = seats.filter(
    (seat) =>
      seat.pid &&
      seat.chips > 0 &&
      seat.status !== "empty" &&
      seat.action !== "SITTING_OUT",
  );

  if (seatsWithChips.length <= 1) {
    return currentButton; // Keep current button if not enough players
  }

  // Find next player with chips clockwise from current button
  for (let i = 1; i <= seats.length; i++) {
    const index = (currentButton + i) % seats.length;
    const seat = seats[index];

    if (
      seat.pid &&
      seat.chips > 0 &&
      seat.status !== "empty" &&
      seat.action !== "SITTING_OUT"
    ) {
      return index;
    }
  }

  return currentButton; // Fallback to current button
}

/**
 * Check if Big Blind should get option to raise
 *
 * Rules:
 * - Only applies in preflop
 * - BB hasn't acted yet
 * - Current bet equals big blind amount (no raises)
 * - Action has returned to BB
 */
export function shouldGiveBBOption(table: Table, nextActor: number): boolean {
  return (
    table.phase === "preflop" &&
    table.bbSeat !== undefined &&
    !table.bbHasActed &&
    table.currentBet === table.bigBlind &&
    nextActor === table.bbSeat
  );
}

/**
 * Check if betting round is complete
 *
 * Rules:
 * - All active players have matched current bet or are all-in
 * - OR only one player remains in hand
 * - OR all remaining players are all-in
 * - Special case: BB gets option in preflop
 */
export function isBettingRoundComplete(
  table: Table,
  nextActor: number,
): boolean {
  const { seats, currentBet, lastAggressor } = table;
  const activeCount = countActivePlayers(seats);
  const inHandCount = countPlayersInHand(seats);

  // Only one player left in hand
  if (inHandCount <= 1) {
    return true;
  }

  // Everyone is all-in
  if (activeCount === 0) {
    return true;
  }

  // BB option check (preflop only)
  if (shouldGiveBBOption(table, nextActor)) {
    console.log(`💺 [GameRules] BB gets option to raise`);
    return false; // Round not complete - BB can act
  }

  // Check if all active players have matching street commitments
  const activePlayers = seats.filter(isActionable);
  const allMatched = activePlayers.every(
    (seat) => seat.streetCommitted === currentBet,
  );

  if (allMatched) {
    return true;
  }

  // Action returns to last aggressor and others have called
  if (lastAggressor !== undefined && nextActor === lastAggressor) {
    const otherPlayers = activePlayers.filter(
      (seat) => seat.id !== lastAggressor,
    );
    const othersMatched = otherPlayers.every(
      (seat) => seat.streetCommitted === currentBet || seat.status === "allin",
    );
    return othersMatched;
  }

  return false;
}

/**
 * Validate button position and fix if invalid
 */
export function validateAndFixButton(seats: Seat[], button: number): number {
  // Check if current button position is valid
  if (button >= 0 && button < seats.length && isActionable(seats[button])) {
    return button; // Valid button position
  }

  // Find first active player as new button
  const firstActive = seats.findIndex(isActionable);

  if (firstActive !== -1) {
    console.log(
      `🔧 [GameRules] Fixed invalid button from ${button} to ${firstActive}`,
    );
    return firstActive;
  }

  console.warn(`⚠️ [GameRules] No active players found for button position`);
  return button; // Return original if no active players (edge case)
}
