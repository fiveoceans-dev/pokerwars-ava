import { logger } from "@hyper-poker/engine/utils/logger";
import type { TournamentState } from "./tournamentManager";

export type BalanceMove = {
  fromTable: string;
  toTable: string;
  playerId: string;
  seatIndex?: number;
};

/**
 * Compute simple balance moves: move one player from the fullest table to the emptiest
 * when the seat count difference is >= 2. This is a placeholder that will be
 * executed by the orchestrator; seating application is engine-dependent.
 */
export function computeBalanceMoves(
  tournament: TournamentState,
  tableSeatCounts: Record<string, number>,
): BalanceMove[] {
  const entries = Object.entries(tableSeatCounts).sort(
    (a, b) => b[1] - a[1],
  );
  if (entries.length < 2) return [];

  const [fullestId, fullestCount] = entries[0];
  const [emptiestId, emptiestCount] = entries[entries.length - 1];
  if (fullestCount - emptiestCount < 2) return [];

  // We don't know which player to move until we inspect the engine state;
  // orchestrator will decide. Here we only suggest the direction.
  logger.info(
    `🔄 Balance suggested for ${tournament.id}: move 1 from ${fullestId} (${fullestCount}) to ${emptiestId} (${emptiestCount})`,
  );
  return [
    {
      fromTable: fullestId,
      toTable: emptiestId,
      playerId: "", // to be filled by orchestrator based on engine state
    },
  ];
}
