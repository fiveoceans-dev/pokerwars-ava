/**
 * Pot Manager with Commitment-Level Algorithm
 * 
 * Implements the battle-tested side pot algorithm:
 * 1. Collect committed amounts by level
 * 2. Sort commitment levels ascending
 * 3. Create layer-based pots with proper eligibility
 * 
 * This handles complex all-in scenarios automatically and correctly.
 */

import { Table, Seat, Pot, PotCalculation, PayoutDistribution } from '../core/types';
import { logger } from '../utils/logger';

/**
 * Player commitment data for pot calculations
 */
interface PlayerCommitment {
  pid: string;
  seatId: number;
  committed: number;
  isInHand: boolean; // not folded
}

/**
 * Commitment level for side pot creation
 */
interface CommitmentLevel {
  level: number;
  contributors: PlayerCommitment[];
}

/**
 * Collect all committed chips into main and side pots
 * Uses the commitment-level algorithm for correct side pot handling
 */
export function collectIntoPots(seats: Seat[]): PotCalculation {
  // Extract player commitments
  const commitments: PlayerCommitment[] = seats
    .filter(seat => seat.pid && seat.committed > 0)
    .map(seat => ({
      pid: seat.pid!,
      seatId: seat.id,
      committed: seat.committed,
      isInHand: seat.status === "active" || seat.status === "allin"
    }));

  if (commitments.length === 0) {
    return { pots: [], totalCollected: 0 };
  }

  // Sort unique commitment levels ascending
  const levels = Array.from(new Set(commitments.map(c => c.committed)))
    .sort((a, b) => a - b);

  const pots: Pot[] = [];
  let totalCollected = 0;
  let prevLevel = 0;

  for (const level of levels) {
    const layerWidth = level - prevLevel;
    
    // Find contributors at this level or higher
    const contributors = commitments.filter(c => c.committed >= level);
    
    // Only players still in hand are eligible to win
    const eligiblePids = contributors
      .filter(c => c.isInHand)
      .map(c => c.pid);

    const potAmount = layerWidth * contributors.length;

    if (potAmount > 0 && eligiblePids.length > 0) {
      pots.push({
        amount: potAmount,
        eligiblePids,
        cap: level
      });
      totalCollected += potAmount;
    }

    prevLevel = level;
  }

  return { pots, totalCollected };
}

/**
 * Add current street commitments to existing pots
 * Called at the end of each betting round
 */
export function addToPots(existingPots: Pot[], seats: Seat[]): PotCalculation {
  const streetCalculation = collectIntoPots(seats);
  
  if (streetCalculation.pots.length === 0) {
    return { pots: existingPots, totalCollected: 0 };
  }

  // Merge with existing pots
  const mergedPots = [...existingPots];
  let totalAdded = 0;

  streetCalculation.pots.forEach(newPot => {
    // Try to merge with existing pot that has same eligibility
    const existingPot = mergedPots.find(pot => 
      pot.cap === newPot.cap && 
      arraysEqual(pot.eligiblePids.sort(), newPot.eligiblePids.sort())
    );

    if (existingPot) {
      existingPot.amount += newPot.amount;
    } else {
      mergedPots.push(newPot);
    }
    
    totalAdded += newPot.amount;
  });

  return { 
    pots: mergedPots, 
    totalCollected: totalAdded 
  };
}

/**
 * Calculate payout distributions for showdown
 * Handles ties and multiple side pots correctly
 */
export function calculatePayouts(
  pots: Pot[], 
  handRankings: { pid: string; rank: number; description: string }[]
): PayoutDistribution[] {
  const distributions: PayoutDistribution[] = [];
  
  pots.forEach((pot, potIndex) => {
    // Get eligible players for this pot
    const eligibleRankings = handRankings.filter(ranking => 
      pot.eligiblePids.includes(ranking.pid)
    );

    if (eligibleRankings.length === 0) {
      // No eligible winners - this shouldn't happen but handle gracefully
      logger.warn(`Pot ${potIndex} has no eligible winners`);
      return;
    }

    // Find best hand rank among eligible players (lower is better)
    const bestRank = Math.min(...eligibleRankings.map(r => r.rank));
    const winners = eligibleRankings.filter(r => r.rank === bestRank);

    // Split pot among winners
    const winAmount = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;

    winners.forEach((winner, index) => {
      const amount = winAmount + (index < remainder ? 1 : 0); // distribute remainder
      distributions.push({
        pid: winner.pid,
        amount,
        potIndex,
        reason: winners.length > 1 ? "tie" : "win"
      });
    });
  });

  return distributions;
}

/**
 * Handle uncalled bet scenarios (fold to one player)
 */
export function handleUncalledBet(table: Table): PayoutDistribution[] {
  const { seats, pots } = table;
  const playersInHand = seats.filter(seat => 
    seat.status === "active" || seat.status === "allin"
  );

  if (playersInHand.length !== 1) {
    return []; // Not a fold-to-one scenario
  }

  const winner = playersInHand[0];
  if (!winner.pid) {
    return [];
  }

  const distributions: PayoutDistribution[] = [];

  // Winner gets all pots they're eligible for
  pots.forEach((pot, potIndex) => {
    if (pot.eligiblePids.includes(winner.pid!)) {
      distributions.push({
        pid: winner.pid!,
        amount: pot.amount,
        potIndex,
        reason: "win"
      });
    }
  });

  // Handle uncalled portion of last bet/raise
  const uncalledAmount = calculateUncalledAmount(table);
  if (uncalledAmount > 0) {
    distributions.push({
      pid: winner.pid!,
      amount: uncalledAmount,
      potIndex: -1, // special index for uncalled bet
      reason: "uncalled"
    });
  }

  return distributions;
}

/**
 * Calculate uncalled bet amount to return to last aggressor
 */
function calculateUncalledAmount(table: Table): number {
  const { seats, lastAggressor } = table;
  
  if (lastAggressor === undefined) {
    return 0;
  }

  const aggressor = seats[lastAggressor];
  if (!aggressor) {
    return 0;
  }

  // Find second highest commitment to determine uncalled amount
  const commitments = seats
    .filter(seat => seat.pid && seat.committed > 0)
    .map(seat => seat.committed)
    .sort((a, b) => b - a); // descending

  if (commitments.length < 2) {
    return 0; // No second player to compare
  }

  const highestCommitment = commitments[0];
  const secondHighestCommitment = commitments[1];
  
  return Math.max(0, highestCommitment - secondHighestCommitment);
}

/**
 * Get pot information for display
 */
export function getPotInfo(pots: Pot[]): {
  mainPot: number;
  sidePots: Array<{ amount: number; playerCount: number }>;
  totalPot: number;
} {
  if (pots.length === 0) {
    return { mainPot: 0, sidePots: [], totalPot: 0 };
  }

  const mainPot = pots[0]?.amount || 0;
  const sidePots = pots.slice(1).map(pot => ({
    amount: pot.amount,
    playerCount: pot.eligiblePids.length
  }));
  const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);

  return { mainPot, sidePots, totalPot };
}

/**
 * Validate pot integrity (for debugging)
 */
export function validatePots(pots: Pot[], expectedTotal: number): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let calculatedTotal = 0;

  // Check each pot
  pots.forEach((pot, index) => {
    if (pot.amount <= 0) {
      errors.push(`Pot ${index}: Invalid amount ${pot.amount}`);
    }

    if (pot.eligiblePids.length === 0) {
      errors.push(`Pot ${index}: No eligible players`);
    }

    calculatedTotal += pot.amount;
  });

  // Check total matches expected
  if (Math.abs(calculatedTotal - expectedTotal) > 0.01) {
    errors.push(`Total mismatch: calculated ${calculatedTotal}, expected ${expectedTotal}`);
  }

  // Check side pot ordering (caps should be ascending)
  for (let i = 1; i < pots.length; i++) {
    const prevCap = pots[i-1].cap || 0;
    const currentCap = pots[i].cap || 0;
    
    if (currentCap <= prevCap) {
      errors.push(`Pot ordering error: pot ${i-1} cap ${prevCap} >= pot ${i} cap ${currentCap}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Helper function to compare arrays for equality
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

/**
 * Create rake calculation for tournament/cash game fees
 */
export function calculateRake(
  totalPot: number,
  rakePercent: number = 0.05,
  rakeCap: number = 3
): number {
  const rakeAmount = Math.min(totalPot * rakePercent, rakeCap);
  return Math.max(0, rakeAmount);
}

/**
 * Apply rake to pot distributions
 */
export function applyRake(
  distributions: PayoutDistribution[],
  rakeAmount: number
): PayoutDistribution[] {
  const totalDistributed = distributions.reduce((sum, dist) => sum + dist.amount, 0);
  
  if (rakeAmount >= totalDistributed) {
    return distributions; // Don't take more rake than total pot
  }

  const rakeRatio = (totalDistributed - rakeAmount) / totalDistributed;
  
  return distributions.map(dist => ({
    ...dist,
    amount: Math.floor(dist.amount * rakeRatio)
  }));
}