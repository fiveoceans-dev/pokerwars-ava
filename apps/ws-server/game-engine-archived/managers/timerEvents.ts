/**
 * Timer Events System for Event-Driven Poker Engine
 * 
 * Event-sourced timer management:
 * - TurnStarted(player, deadline) events
 * - TimeoutAutoFold(player) events
 * - Clean separation from game logic
 * - Deterministic timeout handling
 */

import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import { TimerEvent } from '../core/types';
import { ACTION_TIMEOUT_MS } from '../core/constants';
import { getCountdownManager, type CountdownEvent } from './countdownManager';

/**
 * Timer state for active timers
 */
interface ActiveTimer {
  pid: string;
  seat: number;
  startTime: number;
  deadline: number;
  timeoutMs: number;
  nodeTimer: NodeJS.Timeout;
  creationTimestamp: number; // Add timestamp for race condition protection
}

/**
 * Timer event types
 */
export type TimerEventType = 
  | { type: "TurnStarted"; pid: string; seat: number; deadline: number }
  | { type: "TimeoutWarning"; pid: string; seat: number; remainingMs: number }
  | { type: "TimeoutAutoFold"; pid: string; seat: number }
  | { type: "TimerCleared"; pid: string; seat: number; reason: string };

/**
 * Event-sourced timer manager
 * Emits timer events instead of directly calling game functions
 */
export class TimerEventManager extends EventEmitter {
  private activeTimers = new Map<string, ActiveTimer>();
  private defaultTimeoutMs: number;
  private warningThresholdMs: number;
  private currentActorPid: string | null = null; // Track current actor to prevent unnecessary clears
  // Metrics
  private totalTimersCreated = 0;
  private totalTimeoutMs = 0; // Sum of timeouts for average calculation

  constructor(defaultTimeoutMs = ACTION_TIMEOUT_MS, warningThresholdMs = 5000) {
    super();
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.warningThresholdMs = warningThresholdMs;
    
    logger.info(`⏰ [TimerEventManager] Initialized with ${defaultTimeoutMs}ms timeout (from env)`);
  }

  /**
   * Start action timer for player with client-driven countdown
   * Emits TurnStarted event and schedules timeout
   */
  startActionTimer(timerData: TimerEvent, tableId: string): void {
    const { pid, seat, actionTimeoutMs } = timerData;
    const timeoutMs = actionTimeoutMs || this.defaultTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    
    // Clear ONLY the previous actor's timer (if different) to avoid race conditions
    if (this.currentActorPid && this.currentActorPid !== pid) {
      logger.debug(`⏰ [TimerEventManager] Clearing previous actor's timer: ${this.currentActorPid}`);
      this.clearTimer(this.currentActorPid, "new-actor-turn");
    }
    
    // If this player already has a timer, clear it to avoid multiple timeouts
    if (this.activeTimers.has(pid)) {
      this.clearTimer(pid, 'restart');
    }

    // Update current actor tracking
    this.currentActorPid = pid;
    logger.debug(`⏰ [TimerEventManager] Starting timer for ${pid} at seat ${seat} (${timeoutMs}ms)`);
    
    // Create client-driven countdown using CountdownManager
    const countdownManager = getCountdownManager(tableId);
    const countdownEvent = countdownManager.startCountdown(
      `action_${pid}_${Date.now()}`,
      "action",
      timeoutMs,
      {
        pid,
        seat,
        timeoutMs
      }
    );
    
    const creationTimestamp = Date.now();
    
    // Create timeout handler for server validation
    const nodeTimer = setTimeout(() => {
      this.handleTimeout(pid, seat, creationTimestamp);
    }, timeoutMs);
    
    // Store active timer with metadata
    this.activeTimers.set(pid, {
      pid,
      seat,
      startTime: creationTimestamp,
      deadline,
      timeoutMs,
      nodeTimer,
      creationTimestamp
    });

    // Update metrics
    this.totalTimersCreated += 1;
    this.totalTimeoutMs += timeoutMs;
    
    logger.debug(`⏰ [TimerEventManager] Timer stored for ${pid}, active timers: ${this.activeTimers.size}`);
    
    // Emit countdown event for clients (replaces TurnStarted)
    this.emit('actionCountdown', countdownEvent);
    
    // Schedule warning if applicable
    if (timeoutMs > this.warningThresholdMs) {
      const warningDelay = timeoutMs - this.warningThresholdMs;
      setTimeout(() => {
        if (this.activeTimers.has(pid)) {
          this.emitWarning(pid, seat);
        }
      }, warningDelay);
    }
    
    logger.debug(`⏰ [TimerEventManager] Started ${timeoutMs}ms timer for ${pid} at seat ${seat}`);
  }

  /**
   * Clear timer for specific player
   */
  clearTimer(pid: string, reason = "action-taken"): boolean {
    const timer = this.activeTimers.get(pid);
    
    if (!timer) {
      logger.debug(`⏰ [TimerEventManager] No active timer to clear for ${pid} (${reason})`);
      return false; // No active timer
    }
    
    logger.debug(`⏰ [TimerEventManager] Clearing timer for ${pid} at seat ${timer.seat} (${reason})`);
    
    // Clear Node.js timeout
    clearTimeout(timer.nodeTimer);
    
    // Remove from active timers
    this.activeTimers.delete(pid);
    
    // Reset current actor tracking if this was the current actor
    if (this.currentActorPid === pid) {
      this.currentActorPid = null;
      logger.debug(`⏰ [TimerEventManager] Reset current actor tracking after clearing ${pid}`);
    }
    
    // Emit timer cleared event
    this.emit('timerEvent', {
      type: "TimerCleared",
      pid: timer.pid,
      seat: timer.seat,
      reason
    } as TimerEventType);
    
    logger.debug(`⏰ [TimerEventManager] Cleared timer for ${pid}: ${reason}`);
    return true;
  }

  /**
   * Clear all active timers
   */
  clearAllTimers(reason = "table-reset"): number {
    const clearedCount = this.activeTimers.size;
    
    for (const [pid] of this.activeTimers) {
      this.clearTimer(pid, reason);
    }
    
    // Reset current actor tracking when all timers cleared
    this.currentActorPid = null;
    
    logger.info(`⏰ [TimerEventManager] Cleared ${clearedCount} timers: ${reason}`);
    return clearedCount;
  }

  /**
   * Get remaining time for player
   */
  getRemainingTime(pid: string): number {
    const timer = this.activeTimers.get(pid);
    
    if (!timer) {
      return 0;
    }
    
    const remaining = timer.deadline - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Check if player has active timer
   */
  hasActiveTimer(pid: string): boolean {
    return this.activeTimers.has(pid);
  }

  /**
   * Get all active timer info for debugging
   */
  getActiveTimers(): Array<{
    pid: string;
    seat: number;
    remainingMs: number;
    totalMs: number;
  }> {
    const now = Date.now();
    
    return Array.from(this.activeTimers.values()).map(timer => ({
      pid: timer.pid,
      seat: timer.seat,
      remainingMs: Math.max(0, timer.deadline - now),
      totalMs: timer.timeoutMs
    }));
  }

  /**
   * Handle timer expiration with race condition protection
   */
  private handleTimeout(pid: string, seat: number, expectedTimestamp: number): void {
    const timer = this.activeTimers.get(pid);
    
    if (!timer) {
      logger.debug(`⏰ [TimerEventManager] Timer for ${pid} was already cleared - ignoring timeout`);
      return; // Timer was already cleared
    }
    
    // Race condition protection: verify this is the expected timer
    if (timer.creationTimestamp !== expectedTimestamp) {
      logger.debug(`⏰ [TimerEventManager] Timer for ${pid} is stale (expected: ${expectedTimestamp}, actual: ${timer.creationTimestamp}) - ignoring timeout`);
      return; // This is an old timer, ignore
    }
    
    // Double-check the timer is for the right seat (paranoid validation)
    if (timer.seat !== seat) {
      logger.warn(`⏰ [TimerEventManager] Timer seat mismatch for ${pid}: expected ${seat}, got ${timer.seat}`);
      this.activeTimers.delete(pid);
      return;
    }
    
    // Check if this player is still the current actor (prevents race conditions)
    if (this.currentActorPid !== pid) {
      logger.debug(`⏰ [TimerEventManager] Timer expired for ${pid} but they're no longer current actor (now ${this.currentActorPid})`);
      this.activeTimers.delete(pid);
      return;
    }
    
    logger.info(`⏰ [TimerEventManager] Timer expired for ${pid} at seat ${seat} after ${Date.now() - timer.startTime}ms`);
    
    // Remove from active timers
    this.activeTimers.delete(pid);
    
    // Emit timeout event
    this.emit('timerEvent', {
      type: "TimeoutAutoFold",
      pid,
      seat
    } as TimerEventType);
    
    logger.debug(`⏰ [TimerEventManager] Timer expired for ${pid} at seat ${seat}`);
  }

  /**
   * Emit warning event
   */
  private emitWarning(pid: string, seat: number): void {
    const remainingMs = this.getRemainingTime(pid);
    
    if (remainingMs > 0) {
      this.emit('timerEvent', {
        type: "TimeoutWarning",
        pid,
        seat,
        remainingMs
      } as TimerEventType);
      
      logger.debug(`⚠️ [TimerEventManager] Warning for ${pid}: ${remainingMs}ms remaining`);
    }
  }

  /**
   * Set default timeout for new timers
   */
  setDefaultTimeout(timeoutMs: number): void {
    this.defaultTimeoutMs = timeoutMs;
    logger.info(`⏰ [TimerEventManager] Default timeout set to ${timeoutMs}ms`);
  }

  /**
   * Set warning threshold
   */
  setWarningThreshold(thresholdMs: number): void {
    this.warningThresholdMs = thresholdMs;
    logger.info(`⏰ [TimerEventManager] Warning threshold set to ${thresholdMs}ms`);
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    activeTimerCount: number;
    totalTimersCreated: number;
    averageTimeoutMs: number;
  } {
    const avg = this.totalTimersCreated > 0
      ? Math.round(this.totalTimeoutMs / this.totalTimersCreated)
      : this.defaultTimeoutMs;
    return {
      activeTimerCount: this.activeTimers.size,
      totalTimersCreated: this.totalTimersCreated,
      averageTimeoutMs: avg
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    const clearedCount = this.clearAllTimers("shutdown");
    this.removeAllListeners();
    logger.info(`⏰ [TimerEventManager] Shutdown complete, cleared ${clearedCount} timers`);
  }
}

/**
 * Timer integration helper for EventEngine
 */
export class TimerIntegration {
  private timerManager: TimerEventManager;
  private eventEngine: any; // EventEngine reference
  private tableId: string;

  constructor(eventEngine: any, tableId: string, timeoutMs = 30000) {
    this.eventEngine = eventEngine;
    this.tableId = tableId;
    this.timerManager = new TimerEventManager(timeoutMs);
    
    // Connect timer events to event engine
    this.setupEventHandlers();
    
    logger.info(`🔗 [TimerIntegration] Connected timer manager to event engine for table ${tableId}`);
  }

  /**
   * Setup event handlers between timer manager and event engine
   */
  private setupEventHandlers(): void {
    this.timerManager.on('timerEvent', (timerEvent: TimerEventType) => {
      // Handle async timer events - don't block the timer manager
      this.handleTimerEvent(timerEvent).catch(error => {
        logger.error(`❌ [TimerIntegration] Error handling timer event ${timerEvent.type}: ${error instanceof Error ? error.message : String(error)}`);
      });
    });

    // Handle action countdown events (client-driven countdown)
    this.timerManager.on('actionCountdown', (countdownEvent: CountdownEvent) => {
      this.eventEngine.emit('actionCountdown', countdownEvent);
    });
  }

  /**
   * Handle timer events and dispatch to event engine
   */
  private async handleTimerEvent(timerEvent: TimerEventType): Promise<void> {
    switch (timerEvent.type) {
      case "TurnStarted":
        // Notify external systems (WebSocket, UI)
        this.eventEngine.emit('turnStarted', {
          pid: timerEvent.pid,
          seat: timerEvent.seat,
          deadline: timerEvent.deadline
        });
        break;
        
      case "TimeoutWarning":
        this.eventEngine.emit('actionWarning', {
          pid: timerEvent.pid,
          seat: timerEvent.seat,
          remainingMs: timerEvent.remainingMs
        });
        break;
        
      case "TimeoutAutoFold":
        // Dispatch auto-fold event to game engine with proper async handling
        await this.eventEngine.dispatch({
          t: "TimeoutAutoFold",
          seat: timerEvent.seat
        });
        break;
        
      case "TimerCleared":
        this.eventEngine.emit('timerCleared', {
          pid: timerEvent.pid,
          seat: timerEvent.seat,
          reason: timerEvent.reason
        });
        break;
    }
  }

  /**
   * Start timer for player action
   */
  startActionTimer(pid: string, seat: number, timeoutMs?: number): void {
    const timerData: TimerEvent = {
      pid,
      seat,
      deadline: Date.now() + (timeoutMs || 30000),
      actionTimeoutMs: timeoutMs || 30000
    };
    
    this.timerManager.startActionTimer(timerData, this.tableId);
  }

  /**
   * Clear timer for player
   */
  clearTimer(pid: string): boolean {
    return this.timerManager.clearTimer(pid);
  }

  /**
   * Clear all timers (table-wide)
   */
  clearAllTimers(reason = 'table-reset'): number {
    return this.timerManager.clearAllTimers(reason);
  }

  /**
   * Get timer manager reference
   */
  getTimerManager(): TimerEventManager {
    return this.timerManager;
  }

  /**
   * Shutdown integration
   */
  shutdown(): void {
    this.timerManager.shutdown();
    logger.info(`🔗 [TimerIntegration] Shutdown complete`);
  }
}
