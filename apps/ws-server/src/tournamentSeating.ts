import { logger } from "@hyper-poker/engine/utils/logger";
import type { TournamentState } from "./tournamentManager";
import type { WebSocketFSMBridge } from "./pokerWebSocketServer";
import type { TournamentSeat } from "./tournamentTypes";
import { calculateBuyInLimits } from "./tableConfig";

/**
 * Seat players into a table using the engine's seat join flow.
 * Returns the list of seats successfully assigned.
 */
export async function seatPlayersAtTable(
  bridge: WebSocketFSMBridge,
  tournament: TournamentState,
  tableId: string,
  playerIds: string[],
  startingStack: number,
): Promise<TournamentSeat[]> {
  const seats: TournamentSeat[] = [];
  try {
    const engine = bridge.getEngine(tableId);
    const table = engine.getState();
    let seatIdx = 0;
    const bb = table.blinds?.bb ?? 50;
    const { min, max } = calculateBuyInLimits(bb);
    const stack = Math.max(min, Math.min(startingStack, max));
    if (stack !== startingStack) {
      logger.warn(
        `⚠️ [TournamentSeating] Clamped stack for ${tableId} from ${startingStack} to ${stack} (limits ${min}-${max})`,
      );
    }
    for (const pid of playerIds) {
      // find next empty seat
      while (seatIdx < table.seats.length && table.seats[seatIdx]?.pid) {
        seatIdx++;
      }
      if (seatIdx >= table.seats.length) break;
      // Use engine API to sit player
      try {
        await engine.dispatch({
          t: "PlayerJoin",
          pid,
          seat: seatIdx,
          chips: stack,
          nickname: pid.slice(0, 10),
        } as any);
        seats.push({ playerId: pid, tableId, seatIndex: seatIdx, stack });
        seatIdx++;
      } catch (err) {
        logger.error(`❌ Failed to seat ${pid} at ${tableId} seat ${seatIdx}`, err);
      }
    }
  } catch (err) {
    logger.error(`❌ Seat assignment failed for table ${tableId}`, err);
  }
  return seats;
}
