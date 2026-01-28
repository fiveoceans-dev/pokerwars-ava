/**
 * Player State Manager
 * 
 * Unified manager for all player states including sit-out, timeouts, and auto-leave.
 * Follows the event-driven pattern with proper separation of concerns.
 * Single source of truth for all player state transitions.
 */

import { Table, Seat, SideEffect, PokerEvent } from "../core/types";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";

/**
 * Comprehensive player state management
 * Manages all player states externally from core game engine
 */
export class PlayerStateManager extends EventEmitter {
  private readonly sitOutPlayers = new Map<string, number>(); // playerId -> timestamp (SINGLE SOURCE OF TRUTH)
  private readonly timeoutCounts = new Map<string, number>();  // playerId -> count
  private readonly autoLeaveTimers = new Map<string, NodeJS.Timeout>(); // playerId -> timer
  
  private readonly MAX_TIMEOUTS = 2; // Industry standard: 2 timeouts → auto sit-out
  private readonly AUTO_LEAVE_MS = 5 * 60 * 1000; // 5 minutes auto-leave
  
  /**
   * Handle player timeout - unified timeout processing
   * Returns side effects including potential auto sit-out
   */
  handleTimeout(playerId: string, tableId: string): SideEffect[] {
    const count = this.incrementTimeoutCount(playerId);
    logger.warn(`⏰ [PlayerStateManager] Player ${playerId} timeout #${count}/${this.MAX_TIMEOUTS}`);
    
    if (count >= this.MAX_TIMEOUTS) {
      logger.warn(`😴 [PlayerStateManager] Auto-sitting out ${playerId} after ${count} timeouts`);
      return this.markSitOut(playerId, "timeout", tableId);
    }
    
    return [{
      type: "EMIT_STATE_CHANGE",
      payload: { reason: "player_timeout_counted" }
    }];
  }

  /**
   * Increment timeout count for player
   */
  private incrementTimeoutCount(playerId: string): number {
    const count = (this.timeoutCounts.get(playerId) || 0) + 1;
    this.timeoutCounts.set(playerId, count);
    return count;
  }

  /**
   * Mark player as sitting out with auto-leave timer (SINGLE SOURCE OF TRUTH)
   */
  markSitOut(playerId: string, reason: "voluntary" | "timeout" | "busted", tableId?: string): SideEffect[] {
    this.sitOutPlayers.set(playerId, Date.now());
    
    if (reason === "voluntary") {
      this.timeoutCounts.delete(playerId); // Reset on voluntary sit out
    }
    
    // Start auto-leave timer
    this.startAutoLeaveTimer(playerId, tableId);
    
    logger.info(`😴 [PlayerStateManager] Player ${playerId} sitting out (${reason})`);
    
    return [{
      type: "EMIT_STATE_CHANGE",
      payload: { reason: `player_sit_out_${reason}` }
    }];
  }

  /**
   * Start auto-leave timer for sitting out player
   */
  private startAutoLeaveTimer(playerId: string, tableId?: string): void {
    // Clear any existing timer
    this.clearAutoLeaveTimer(playerId);
    
    if (!tableId) {
      logger.warn(`⚠️ [PlayerStateManager] No tableId provided for auto-leave timer for ${playerId}`);
      return;
    }
    
    logger.info(`⏰ [PlayerStateManager] Starting ${this.AUTO_LEAVE_MS/1000}s auto-leave timer for ${playerId}`);
    
    const timer = setTimeout(() => {
      logger.info(`🚪 [PlayerStateManager] Auto-leaving ${playerId} after sitting out for ${this.AUTO_LEAVE_MS/1000}s`);
      
      // Emit auto-leave event for EventEngine to handle
      this.emit('autoLeave', {
        playerId,
        tableId,
        reason: 'auto_leave_timeout'
      });
    }, this.AUTO_LEAVE_MS);
    
    this.autoLeaveTimers.set(playerId, timer);
  }

  /**
   * Clear auto-leave timer for player
   */
  private clearAutoLeaveTimer(playerId: string): void {
    const timer = this.autoLeaveTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.autoLeaveTimers.delete(playerId);
      logger.debug(`🧹 [PlayerStateManager] Cleared auto-leave timer for ${playerId}`);
    }
  }

  /**
   * Mark player as sitting in - clears all timers
   */
  markSitIn(playerId: string): SideEffect[] {
    this.sitOutPlayers.delete(playerId);
    this.timeoutCounts.delete(playerId);
    this.clearAutoLeaveTimer(playerId);
    
    logger.info(`🪑 [PlayerStateManager] Player ${playerId} sitting in`);
    
    return [{
      type: "EMIT_STATE_CHANGE",
      payload: { reason: "player_sit_in" }
    }];
  }

  /**
   * Check if specific player is sitting out (SINGLE SOURCE OF TRUTH)
   */
  isPlayerSittingOut(playerId: string): boolean {
    return this.sitOutPlayers.has(playerId);
  }
  
  /**
   * Reset timeout count when player sits in
   */
  resetTimeouts(playerId: string): void {
    this.timeoutCounts.delete(playerId);
    logger.info(`🔄 [SitOutManager] Reset timeout count for ${playerId}`);
  }
  
  /**
   * Check if player should be auto sat out after timeouts
   */
  shouldAutoSitOut(playerId: string): boolean {
    const timeouts = this.timeoutCounts.get(playerId) || 0;
    return timeouts >= this.MAX_TIMEOUTS;
  }
  
  /**
   * Get active players (not sitting out and have chips)
   */
  getActivePlayers(table: Table): Seat[] {
    return table.seats.filter(seat => 
      seat.pid && 
      !this.sitOutPlayers.has(seat.pid) && 
      seat.chips > 0 &&
      seat.status !== "empty"
    );
  }
  
  /**
   * Check if we have enough active players for a game (2+)
   */
  canStartGame(table: Table): boolean {
    const activePlayers = this.getActivePlayers(table);
    return activePlayers.length >= 2;
  }
  
  /**
   * Get timeout count for player
   */
  getTimeoutCount(playerId: string): number {
    return this.timeoutCounts.get(playerId) || 0;
  }
  
  /**
   * Handle player leaving - comprehensive cleanup
   * Clears all state and timers for clean rejoin
   */
  handlePlayerLeave(playerId: string): void {
    this.sitOutPlayers.delete(playerId);
    this.timeoutCounts.delete(playerId);
    this.clearAutoLeaveTimer(playerId);
    logger.info(`🧹 [PlayerStateManager] Comprehensive cleanup for leaving player ${playerId}`);
  }

  /**
   * Clear all tracking for a player (legacy compatibility)
   */
  clearPlayer(playerId: string): void {
    this.handlePlayerLeave(playerId);
  }

  /**
   * Find player's seat in table (utility method)
   */
  findPlayerSeat(playerId: string, table: Table): Seat | null {
    return table.seats.find(seat => seat.pid === playerId) || null;
  }
  
  /**
   * Get count of active players
   */
  getActivePlayerCount(table: Table): number {
    return this.getActivePlayers(table).length;
  }
  
  /**
   * Check if player has chips and is not sitting out
   */
  isPlayerEligibleForHand(playerId: string, table: Table): boolean {
    const seat = table.seats.find(s => s.pid === playerId);
    if (!seat) return false;
    
    return !this.sitOutPlayers.has(playerId) && 
           seat.chips > 0 && 
           seat.status !== "empty";
  }
}

/**
 * Global player state manager instances per table
 * Following existing pattern for manager storage
 */
const playerStateManagers = new Map<string, PlayerStateManager>();

/**
 * Get or create player state manager for table
 */
export function getPlayerStateManager(tableId: string): PlayerStateManager {
  let manager = playerStateManagers.get(tableId);
  if (!manager) {
    manager = new PlayerStateManager();
    playerStateManagers.set(tableId, manager);
    logger.debug(`📋 [PlayerStateManager] Created for table ${tableId}`);
  }
  return manager;
}

/**
 * Remove player state manager for table cleanup
 */
export function removePlayerStateManager(tableId: string): void {
  const manager = playerStateManagers.get(tableId);
  if (manager) {
    // Clear all timers before removing
    manager.removeAllListeners();
    playerStateManagers.delete(tableId);
    logger.debug(`🗑️ [PlayerStateManager] Removed for table ${tableId}`);
  }
}

/**
 * Clear all player state managers (for testing/cleanup)
 */
export function clearAllPlayerStateManagers(): void {
  // Clear all timers in all managers
  for (const [tableId, manager] of playerStateManagers) {
    manager.removeAllListeners();
  }
  playerStateManagers.clear();
  logger.debug(`🧹 [PlayerStateManager] Cleared all managers`);
}

// Legacy compatibility exports
export const getSitOutManager = getPlayerStateManager;
export const removeSitOutManager = removePlayerStateManager;
export const clearAllSitOutManagers = clearAllPlayerStateManagers;
export { PlayerStateManager as SitOutManager };