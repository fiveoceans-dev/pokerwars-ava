/**
 * Hand Evaluation Adapter for Hash Tree Evaluator
 * 
 * Adapts the existing high-performance hash tree based evaluator to work
 * with the event-driven poker engine's card index format.
 */

import { evaluateCodes as hashEvaluateCodes } from "../utils/hashEvaluator";

// Hand ranking descriptions (hash evaluator uses lower numbers for better hands)
const HAND_DESCRIPTIONS = [
  "Invalid",
  "Straight Flush",
  "Four of a Kind", 
  "Full House",
  "Flush",
  "Straight",
  "Three of a Kind",
  "Two Pair",
  "One Pair",
  "High Card"
];

export interface HandRank {
  score: number;      // Evaluator score (lower is better)
  cards: number[];    // Card indices used
  description: string; // Human-readable description (best-effort)
}

export interface PlayerHand {
  pid: string;
  handRank: HandRank;
  holeCards: [number, number];
}

/**
 * Convert numeric card indices to Card objects and evaluate using hash evaluator
 */
export function evaluateHand(holeCards: [number, number], board: number[]): HandRank {
  const allCardIndices = [...holeCards, ...board];
  const score = hashEvaluateCodes(allCardIndices);
  const rankCategory = Math.min(Math.max(Math.ceil(score / 1000), 1), 9);
  const description = HAND_DESCRIPTIONS[rankCategory] || "Unknown Hand";
  return {
    score,
    cards: allCardIndices,
    description,
  };
}

/**
 * Compare two hands - returns positive if hand1 wins, negative if hand2 wins, 0 for tie
 */
export function compareHands(hand1: HandRank, hand2: HandRank): number {
  // Lower score is better
  return hand1.score - hand2.score;
}

/**
 * Evaluate all players' hands and determine winners with rankings
 */
export function determineWinners(players: PlayerHand[]): Array<{
  pid: string;
  rank: number; // evaluator score (lower is better)
  description: string;
  handRank: HandRank;
}> {
  // Sort ascending score (best first)
  const sorted = [...players].sort((a, b) => compareHands(a.handRank, b.handRank));
  return sorted.map((player) => ({
    pid: player.pid,
    rank: player.handRank.score,
    description: player.handRank.description,
    handRank: player.handRank,
  }));
}
