/**
 * Reusable Countdown Manager for Client-Driven Architecture
 * 
 * Manages countdown metadata on server-side for validation while 
 * allowing clients to handle display updates locally.
 */

export type CountdownType = 
  | "game_start" 
  | "action" 
  | "street_deal" 
  | "new_hand" 
  | "reconnect";

export interface CountdownData {
  startTime: number;
  duration: number;
  type: CountdownType;
  metadata?: any;
}

export interface CountdownEvent {
  type: "COUNTDOWN_START";
  countdownType: CountdownType;
  startTime: number;
  duration: number;
  metadata?: any;
}

/**
 * Manages countdown metadata for server validation
 * Does NOT create intervals - clients handle display updates
 */
export class CountdownManager {
  private countdowns = new Map<string, CountdownData>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup expired countdowns every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.clearExpiredCountdowns();
    }, 30000);
    
    console.log(`🧹 [CountdownManager] Auto-cleanup started (30s interval)`);
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      console.log(`🧹 [CountdownManager] Auto-cleanup stopped`);
    }
  }

  /**
   * Start a new countdown and return event data for client
   */
  startCountdown(
    id: string,
    type: CountdownType,
    duration: number,
    metadata?: any
  ): CountdownEvent {
    // Validation
    if (!id || id.trim().length === 0) {
      throw new Error("Countdown ID cannot be empty");
    }
    
    if (duration <= 0) {
      throw new Error(`Invalid countdown duration: ${duration} (must be > 0)`);
    }
    
    if (duration > 300000) { // 5 minutes max
      console.warn(`⚠️ [CountdownManager] Very long countdown duration: ${duration}ms`);
    }
    
    // Clear existing countdown with same ID if it exists
    if (this.countdowns.has(id)) {
      console.log(`🔄 [CountdownManager] Replacing existing countdown: ${id}`);
      this.cancelCountdown(id);
    }
    const startTime = Date.now();
    
    this.countdowns.set(id, { 
      startTime, 
      duration, 
      type,
      metadata 
    });
    
    console.log(`⏱️ [CountdownManager] Started ${type} countdown: ${id} (${duration}ms)`);
    
    return {
      type: "COUNTDOWN_START",
      countdownType: type,
      startTime,
      duration,
      metadata
    };
  }

  /**
   * Validate that countdown has completed
   * Returns true if enough time has elapsed
   */
  validateCountdown(id: string): boolean {
    const countdown = this.countdowns.get(id);
    if (!countdown) {
      console.warn(`⚠️ [CountdownManager] No countdown found for validation: ${id}`);
      return false;
    }
    
    const elapsed = Date.now() - countdown.startTime;
    const isComplete = elapsed >= countdown.duration;
    
    console.log(`🔍 [CountdownManager] Validating ${countdown.type}: ${id} - ${elapsed}ms/${countdown.duration}ms (${isComplete ? 'COMPLETE' : 'PENDING'})`);
    
    return isComplete;
  }

  /**
   * Get countdown data for inspection
   */
  getCountdown(id: string): CountdownData | undefined {
    return this.countdowns.get(id);
  }

  /**
   * Get remaining time for countdown
   */
  getRemainingTime(id: string): number {
    const countdown = this.countdowns.get(id);
    if (!countdown) return 0;
    
    const elapsed = Date.now() - countdown.startTime;
    return Math.max(0, countdown.duration - elapsed);
  }

  /**
   * Cancel/remove countdown
   */
  cancelCountdown(id: string): void {
    const countdown = this.countdowns.get(id);
    if (countdown) {
      console.log(`❌ [CountdownManager] Cancelled ${countdown.type} countdown: ${id}`);
      this.countdowns.delete(id);
    }
  }

  /**
   * Get all active countdowns (for debugging)
   */
  getActiveCountdowns(): Map<string, CountdownData> {
    return new Map(this.countdowns);
  }

  /**
   * Clear expired countdowns (cleanup utility)
   */
  clearExpiredCountdowns(): void {
    const now = Date.now();
    let cleared = 0;
    
    for (const [id, countdown] of this.countdowns.entries()) {
      const elapsed = now - countdown.startTime;
      if (elapsed > countdown.duration + 5000) { // 5s grace period
        this.countdowns.delete(id);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`🧹 [CountdownManager] Cleared ${cleared} expired countdowns`);
    }
  }
}

/**
 * Global countdown manager instances per table
 */
const countdownManagers = new Map<string, CountdownManager>();

/**
 * Get or create countdown manager for table
 */
export function getCountdownManager(tableId: string): CountdownManager {
  let manager = countdownManagers.get(tableId);
  if (!manager) {
    manager = new CountdownManager();
    countdownManagers.set(tableId, manager);
    console.log(`📋 [CountdownManager] Created for table ${tableId}`);
  }
  return manager;
}

/**
 * Remove countdown manager for table cleanup
 */
export function removeCountdownManager(tableId: string): void {
  const manager = countdownManagers.get(tableId);
  if (manager) {
    manager.shutdown();
  }
  countdownManagers.delete(tableId);
  console.log(`🗑️ [CountdownManager] Removed for table ${tableId}`);
}

/**
 * Clear all countdown managers (for testing/cleanup)
 */
export function clearAllCountdownManagers(): void {
  for (const manager of countdownManagers.values()) {
    manager.shutdown();
  }
  countdownManagers.clear();
  console.log(`🧹 [CountdownManager] Cleared all managers`);
}