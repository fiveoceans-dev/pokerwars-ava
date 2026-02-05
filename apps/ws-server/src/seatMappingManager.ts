/**
 * Professional Seat Mapping Manager
 * 
 * Provides bidirectional mapping between players and seats with built-in consistency
 * checking and recovery mechanisms. This is the single source of truth for 
 * player-seat associations across all tables.
 */

import { logger } from "@hyper-poker/engine/utils/logger";

/**
 * Manages bidirectional seat mappings with consistency guarantees
 */
export class SeatMappingManager {
  private playerToSeat = new Map<string, Map<string, number>>();  // tableId -> playerId -> seat
  private seatToPlayer = new Map<string, Map<number, string>>();  // tableId -> seat -> playerId

  /**
   * Set seat mapping with consistency checking
   * Automatically cleans up any conflicting mappings
   */
  setSeatMapping(tableId: string, playerId: string, seat: number): void {
    if (!playerId || seat < 0 || seat > 8) {
      logger.error(`❌ [SeatMapping] Invalid mapping: ${playerId} -> seat ${seat}`);
      return;
    }

    // Initialize tables if needed
    if (!this.playerToSeat.has(tableId)) {
      this.playerToSeat.set(tableId, new Map());
      this.seatToPlayer.set(tableId, new Map());
    }

    const playerMap = this.playerToSeat.get(tableId)!;
    const seatMap = this.seatToPlayer.get(tableId)!;

    // Clean up any previous seat for this player
    const oldSeat = playerMap.get(playerId);
    if (oldSeat !== undefined && oldSeat !== seat) {
      seatMap.delete(oldSeat);
      logger.debug(`🧹 [SeatMapping] Cleaned up old seat ${oldSeat} for player ${playerId}`);
    }

    // Clean up any previous player for this seat
    const oldPlayer = seatMap.get(seat);
    if (oldPlayer && oldPlayer !== playerId) {
      playerMap.delete(oldPlayer);
      logger.debug(`🧹 [SeatMapping] Cleaned up old player ${oldPlayer} from seat ${seat}`);
    }

    // Set the new mapping
    playerMap.set(playerId, seat);
    seatMap.set(seat, playerId);

    logger.debug(`✅ [SeatMapping] Set mapping: ${playerId} -> seat ${seat} at table ${tableId}`);
  }

  /**
   * Find seat for a player
   */
  findSeat(tableId: string, playerId: string): number | undefined {
    return this.playerToSeat.get(tableId)?.get(playerId);
  }

  /**
   * Find player at a seat
   */
  findPlayer(tableId: string, seat: number): string | undefined {
    return this.seatToPlayer.get(tableId)?.get(seat);
  }

  /**
   * Remove player from all mappings
   */
  removePlayer(tableId: string, playerId: string): void {
    const seat = this.findSeat(tableId, playerId);
    if (seat !== undefined) {
      this.playerToSeat.get(tableId)?.delete(playerId);
      this.seatToPlayer.get(tableId)?.delete(seat);
      logger.debug(`🗑️ [SeatMapping] Removed player ${playerId} from seat ${seat}`);
    }
  }

  /**
   * Remove seat mapping (when seat becomes empty)
   */
  removeSeat(tableId: string, seat: number): void {
    const playerId = this.findPlayer(tableId, seat);
    if (playerId) {
      this.playerToSeat.get(tableId)?.delete(playerId);
      this.seatToPlayer.get(tableId)?.delete(seat);
      logger.debug(`🗑️ [SeatMapping] Removed seat ${seat} (player: ${playerId})`);
    }
  }

  /**
   * Get all mappings for a table (debugging)
   */
  getTableMappings(tableId: string): { playerId: string; seat: number }[] {
    const playerMap = this.playerToSeat.get(tableId);
    if (!playerMap) return [];

    return Array.from(playerMap.entries()).map(([playerId, seat]) => ({
      playerId,
      seat
    }));
  }

  /**
   * Validate consistency between both maps
   */
  validateConsistency(tableId: string): boolean {
    const playerMap = this.playerToSeat.get(tableId);
    const seatMap = this.seatToPlayer.get(tableId);

    if (!playerMap || !seatMap) return true; // Empty is consistent

    let isConsistent = true;

    // Check player -> seat -> player consistency
    for (const [playerId, seat] of playerMap) {
      if (seatMap.get(seat) !== playerId) {
        logger.error(`❌ [SeatMapping] Inconsistency: player ${playerId} -> seat ${seat}, but seat ${seat} -> ${seatMap.get(seat)}`);
        isConsistent = false;
      }
    }

    // Check seat -> player -> seat consistency
    for (const [seat, playerId] of seatMap) {
      if (playerMap.get(playerId) !== seat) {
        logger.error(`❌ [SeatMapping] Inconsistency: seat ${seat} -> player ${playerId}, but player ${playerId} -> seat ${playerMap.get(playerId)}`);
        isConsistent = false;
      }
    }

    return isConsistent;
  }

  /**
   * Clear all mappings for a table
   */
  clearTable(tableId: string): void {
    this.playerToSeat.delete(tableId);
    this.seatToPlayer.delete(tableId);
    logger.debug(`🧹 [SeatMapping] Cleared all mappings for table ${tableId}`);
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    totalTables: number;
    totalMappings: number;
    tablesWithMappings: string[];
  } {
    const tablesWithMappings = Array.from(this.playerToSeat.keys());
    const totalMappings = tablesWithMappings.reduce((sum, tableId) => {
      return sum + (this.playerToSeat.get(tableId)?.size || 0);
    }, 0);

    return {
      totalTables: this.playerToSeat.size,
      totalMappings,
      tablesWithMappings
    };
  }

  /**
   * List tables where the given player is seated
   */
  getTablesForPlayer(playerId: string): string[] {
    if (!playerId) return [];
    const tables: string[] = [];
    for (const [tableId, map] of this.playerToSeat.entries()) {
      if (map.has(playerId)) tables.push(tableId);
    }
    return tables;
  }
}

/**
 * Global seat mapping manager instance
 */
export const globalSeatMappings = new SeatMappingManager();
