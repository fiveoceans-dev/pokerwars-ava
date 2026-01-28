/**
 * Event-Driven Poker Engine
 *
 * Core engine with event-sourced architecture featuring:
 * - Pure reducer functions for state updates
 * - Event queue for deterministic processing
 * - Complete event sourcing for auditability
 * - Timer integration for automated actions
 */

import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import {
  Table,
  PokerEvent,
  GameSnapshot,
  ActionType,
  TimerEvent,
  StateTransition,
  SideEffect,
} from "./types";
import { getSitOutManager } from "../managers/sitOutManager";
import { reduce } from "./reducer";
import { validateAction, getAvailableActions } from "../logic/validation";
import { getBettingRoundState } from "../utils/ringOrder";
import { calculatePayouts, handleUncalledBet } from "../logic/potManager";
import { getNextStreet } from "../logic/betting";
import * as CardLedger from "../logic/cardLedger";
import { validateCardInvariants } from "../logic/invariants";
import { logHandStartAudit } from "../utils/audit";
import {
  evaluateHand,
  determineWinners,
  type PlayerHand,
} from "../logic/handEvaluationAdapter";
import { evaluateCodes } from "../utils/hashEvaluator";
import {
  STREET_DEAL_DELAY_MS,
  NEW_HAND_DELAY_MS,
  GAME_START_COUNTDOWN_MS,
  MIN_PLAYERS_TO_START,
} from "./constants";
import { getCountdownManager } from "../managers/countdownManager";

/**
 * Event queue entry for processing
 */
interface QueuedEvent {
  event: PokerEvent;
  timestamp: number;
  id: string;
}

/**
 * External command interface (from WebSocket/API)
 */
export interface GameCommand {
  type: "join" | "leave" | "action" | "start_hand";
  playerId?: string;
  seatId?: number;
  action?: ActionType;
  amount?: number;
  chips?: number;
  nickname?: string;
}

/**
 * Event Engine manages table state through pure event processing
 */
export class EventEngine extends EventEmitter {
  private table: Table;
  private eventLog: PokerEvent[] = [];
  private eventQueue: QueuedEvent[] = [];
  private processing = false;
  private processingPromise?: Promise<void>;
  private timerManager?: any; // Will be injected
  private waitingPlayers = new Set<string>(); // Players waiting for next hand
  private gameStartTimer?: NodeJS.Timeout; // Active countdown timer
  // Note: Transition logic now handled by reducer through side effects

  constructor(tableId: string, smallBlind: number, bigBlind: number) {
    super();

    // Initialize table with empty state
    this.table = {
      id: tableId,
      seats: Array.from({ length: 9 }, (_, i) => ({
        id: i,
        chips: 0,
        committed: 0,
        streetCommitted: 0,
        status: "empty",
      })),
      button: 0,
      smallBlind,
      bigBlind,
      phase: "waiting",
      currentBet: 0,
      lastRaiseSize: bigBlind,
      pots: [],
      communityCards: [],
      blinds: { sb: smallBlind, bb: bigBlind },
      handNumber: 0,
      timestamp: Date.now(),
    };

    // Set up PlayerStateManager auto-leave event listener
    this.setupPlayerStateManager();

    logger.info(`🎮 [EventEngine] Created for table ${tableId}`);
  }

  /**
   * Set up PlayerStateManager event listeners for auto-leave
   */
  private setupPlayerStateManager(): void {
    const playerStateManager = getSitOutManager(this.table.id);

    // Listen for auto-leave events
    playerStateManager.on("autoLeave", (event) => {
      const { playerId, tableId, reason } = event;

      if (tableId === this.table.id) {
        logger.info(
          `🚪 [EventEngine] Processing auto-leave for ${playerId} (${reason})`,
        );

        // Find player's seat
        const seat = this.table.seats.find((s) => s.pid === playerId);
        if (seat) {
          // Dispatch leave event
          this.dispatch({
            t: "PlayerLeave",
            seat: seat.id,
            pid: playerId,
          });
        } else {
          logger.warn(
            `⚠️ [EventEngine] Auto-leave: Player ${playerId} not found in table`,
          );
        }
      }
    });
  }

  /**
   * Get current table state with derived action field for sit-out flag
   */
  getState(): Table {
    const sitOutManager = getSitOutManager(this.table.id);

    const tableWithActions = {
      ...this.table,
      seats: this.table.seats.map((seat) => ({
        ...seat,
        action:
          seat.pid && sitOutManager.isPlayerSittingOut(seat.pid)
            ? "SITTING_OUT"
            : seat.action,
      })),
    };

    return tableWithActions;
  }

  /**
   * Get complete event log
   */
  getEventLog(): PokerEvent[] {
    return [...this.eventLog]; // Immutable copy
  }

  /**
   * Get game snapshot for debugging/replay
   */
  getSnapshot(): GameSnapshot {
    return {
      table: { ...this.table },
      eventLog: [...this.eventLog],
      timestamp: Date.now(),
      handNumber: this.table.handNumber,
    };
  }

  /**
   * Process external command and convert to internal events
   */
  async processCommand(command: GameCommand): Promise<boolean> {
    try {
      const events = this.commandToEvents(command);

      if (!events || events.length === 0) {
        throw new Error(
          `Invalid or unsupported command: ${JSON.stringify(command)}`,
        );
      }

      for (const event of events) {
        await this.dispatch(event);
      }

      return true;
    } catch (error) {
      console.error(`❌ [EventEngine] Command failed:`, error);
      this.emit("error", { command, error });
      return false;
    }
  }

  /**
   * Dispatch event for processing
   */
  async dispatch(event: PokerEvent): Promise<void> {
    logger.debug(
      `🚀 [EventEngine] Dispatching event: ${event.t} (queue length: ${this.eventQueue.length}, processing: ${this.processing})`,
    );

    // Check for excessive queueing (indicates logic error)
    if (this.eventQueue.length > 50) {
      logger.error(
        `❌ Event queue overflow! ${this.eventQueue.length} events queued`,
      );
      logger.error(
        `Queue contents: ${this.eventQueue.map((e) => e.event.t).join(", ")}`,
      );

      // Clear queue and reset state machine
      this.eventQueue = [];
      this.processing = false;

      throw new Error(`Event queue overflow - possible infinite loop detected`);
    }

    const queuedEvent: QueuedEvent = {
      event,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.eventQueue.push(queuedEvent);
    logger.debug(
      `   📥 Added to queue: ${event.t} (new queue length: ${this.eventQueue.length})`,
    );

    // If we're already processing, just add to queue and return immediately
    // The current processing session will handle it in the while loop
    if (this.processing) {
      logger.debug(
        `   🔄 Already processing - event added to queue, will be processed in current session`,
      );
      return;
    }

    // Start new processing session and wait for it to complete
    logger.debug(`   🎬 Starting new processing session for ${event.t}`);
    this.processingPromise = this.processEventQueue();

    // Wait for the processing to complete
    logger.debug(`   ⌛ Waiting for processing to complete for ${event.t}...`);
    await this.processingPromise;
    logger.debug(`   ✅ Processing completed for ${event.t}`);

    logger.debug(`🏁 [EventEngine] Dispatch complete for ${event.t}`);
  }

  /**
   * Process event queue sequentially for deterministic behavior
   */
  private async processEventQueue(): Promise<void> {
    if (this.processing) {
      logger.debug(
        `⚠️ [EventEngine] processEventQueue called while already processing - returning early`,
      );
      return; // Already processing
    }

    this.processing = true;
    logger.debug(
      `🔄 [EventEngine] Starting event queue processing (${this.eventQueue.length} events queued)`,
    );

    try {
      let processedCount = 0;
      // Keep processing until queue is completely empty
      // This handles events added during automatic transitions
      while (this.eventQueue.length > 0) {
        const queuedEvent = this.eventQueue.shift()!;
        processedCount++;
        logger.debug(
          `   📨 Processing event ${processedCount}: ${queuedEvent.event.t} (${this.eventQueue.length} remaining)`,
        );
        await this.processEvent(queuedEvent);
        logger.debug(
          `   ✅ Completed event ${processedCount}: ${queuedEvent.event.t} (${this.eventQueue.length} remaining)`,
        );

        // Continue processing any events that were added during processEvent
        // (e.g., from automatic transitions)
      }
      logger.debug(
        `🎯 [EventEngine] Event queue processing complete (processed ${processedCount} events total)`,
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process individual event
   */
  private async processEvent(queuedEvent: QueuedEvent): Promise<void> {
    const { event, timestamp } = queuedEvent;

    // No paused gating: on invariant failure we auto-reset hand

    // Clear event processing state on new hand
    if (event.t === "StartHand") {
      logger.info(`🧹 [EventEngine] Starting new hand ${event.handNumber}`);
    }

    // Enhanced logging for player events
    if (event.t === "PlayerJoin") {
      logger.info(
        `👤 [EventEngine] Processing PlayerJoin for ${event.pid} at seat ${event.seat}`,
      );
    }

    // Add phase-specific validation to prevent wrong-phase events
    if (event.t === "Payout" && this.table.phase !== "showdown") {
      logger.warn(
        `⚠️ [EventEngine] Ignoring Payout event in wrong phase: ${this.table.phase}`,
      );
      return;
    }

    if (event.t === "HandEnd" && this.table.phase === "waiting") {
      logger.warn(
        `⚠️ [EventEngine] Ignoring HandEnd - already in waiting phase`,
      );
      return;
    }

    logger.debug(
      `📨 [EventEngine] Processing event: ${event.t} ${JSON.stringify(event)}`,
    );

    // IMMEDIATE timer cancellation for actions to prevent race conditions
    if (event.t === "Action" && this.timerManager) {
      const seat = this.table.seats[event.seat];
      if (seat?.pid && this.table.actor === event.seat) {
        logger.debug(
          `⏰ [EventEngine] Immediately cancelling timer for acting player ${seat.pid} at seat ${event.seat}`,
        );
        this.timerManager.clearTimer(seat.pid);
      }
    }

    // Apply event through pure reducer
    const transition = reduce(this.table, event);

    // Check if state actually changed - if not, it may be a no-op managerial event or a validation failure
    if (transition.nextState === this.table) {
      logger.warn(
        `⚠️ [EventEngine] Event ${event.t} produced no state change - validation failed`,
      );

      // Allow idempotent managerial events without hard failure
      if (event.t === "PlayerSitOut" || event.t === "PlayerSitIn") {
        logger.info(
          `ℹ️ [EventEngine] ${event.t} had no effect (idempotent or invalid seat) - continuing`,
        );
        // Still emit current state so clients can reconcile
        this.emit("stateChanged", this.getState());
        this.emit("eventProcessed", event, this.getState());
        return;
      }

      // For PlayerJoin events, determine specific error type
      if (event.t === "PlayerJoin") {
        const seat = this.table.seats[event.seat];

        // Check specific validation failures
        if (event.seat < 0 || event.seat >= this.table.seats.length) {
          throw new Error("Invalid seat index");
        } else if (seat.pid) {
          throw new Error("Seat already taken");
        } else if (this.table.seats.find((s) => s.pid === event.pid)) {
          throw new Error("Player already seated");
        } else if (event.chips <= 0) {
          throw new Error("Invalid chips amount");
        } else {
          throw new Error("Failed to add player");
        }
      }

      // Special handling for TimeoutAutoFold - race conditions are expected
      if (event.t === "TimeoutAutoFold") {
        logger.warn(
          `⏰ [EventEngine] TimeoutAutoFold for seat ${event.seat} had no effect - player likely already acted or not current actor`,
        );
        // Don't throw error - this is expected behavior when timers race
        // Just execute any side effects (like notifications) and continue
        await this.executeSideEffects(transition.sideEffects);
        this.emit("eventProcessed", event, this.table);
        return;
      }

      // Comprehensive Action event validation diagnostics
      if (event.t === "Action") {
        const seat = this.table.seats[event.seat];
        const actorSeat =
          this.table.actor !== undefined
            ? this.table.seats[this.table.actor]
            : null;

        // Log full validation context for debugging
        logger.error(
          `❌ [EventEngine] Action validation failed - Full Context:`,
        );
        logger.error(`   Table Phase: ${this.table.phase}`);
        logger.error(
          `   Current Actor: seat ${this.table.actor} (${actorSeat?.pid || "none"})`,
        );
        logger.error(
          `   Action Details: seat ${event.seat}, action ${event.action}, amount ${event.amount}`,
        );
        logger.error(
          `   Player Status: ${seat?.pid || "EMPTY"} (status: ${seat?.status || "N/A"})`,
        );
        logger.error(
          `   Current Bet: ${this.table.currentBet}, Player Street Committed: ${seat?.streetCommitted || 0}`,
        );

        // Specific validation failure detection
        if (event.seat < 0 || event.seat >= this.table.seats.length) {
          throw new Error(
            `Invalid seat index: ${event.seat} (valid range: 0-${this.table.seats.length - 1})`,
          );
        }

        if (!seat) {
          throw new Error(`Seat ${event.seat} does not exist`);
        }

        if (!seat.pid) {
          throw new Error(`Seat ${event.seat} is empty - no player seated`);
        }

        if (seat.status !== "active") {
          throw new Error(
            `Player ${seat.pid} cannot act - status is '${seat.status}' (must be 'active')`,
          );
        }

        if (this.table.actor === undefined) {
          throw new Error(
            `No current actor defined - phase '${this.table.phase}' may not allow actions`,
          );
        }

        if (this.table.actor !== event.seat) {
          throw new Error(
            `Not player's turn: current actor is seat ${this.table.actor} (${actorSeat?.pid}), but seat ${event.seat} (${seat.pid}) tried to act`,
          );
        }

        // Phase validation
        const bettingPhases = ["preflop", "flop", "turn", "river"];
        if (!bettingPhases.includes(this.table.phase)) {
          throw new Error(
            `Cannot take actions during '${this.table.phase}' phase - actions only allowed in: ${bettingPhases.join(", ")}`,
          );
        }

        // If we reach here, it's likely a specific action validation failure (betting amounts, etc.)
        const toCall = Math.max(
          0,
          this.table.currentBet - (seat.streetCommitted || 0),
        );
        throw new Error(
          `Invalid ${event.action} action: ${seat.pid} (${event.amount || "no amount"}) - Current bet: ${this.table.currentBet}, To call: ${toCall}, Chips: ${seat.chips}`,
        );
      }

      // For other events, throw generic validation error
      throw new Error(`Event validation failed: ${event.t}`);
    }

    // Update state and log event
    this.table = transition.nextState;
    this.eventLog.push(event);

    // Deck commitment logging on StartHand for auditability
    if (event.t === "StartHand") {
      try {
        if (this.table.deckCodes && this.table.deckCodes.length === 52) {
          void (async () => {
            const commit = await CardLedger.commit(this.table.deckCodes!);
            logger.info(
              `🧾 [EventEngine] Deck commit (sha256) for hand ${event.handNumber}: ${commit}`,
            );
            // Structured audit record (future: persist)
            logHandStartAudit(
              this.table,
              event.handNumber,
              this.table.deckSeed,
              commit,
            );
          })();
        }
      } catch (e) {
        logger.error(`❌ [EventEngine] Failed to compute deck commit:`, e);
      }
    }

    // Execute side effects returned by the reducer
    await this.executeSideEffects(transition.sideEffects);

    // Invariant checks for card state (graceful handling)
    try {
      const inv = validateCardInvariants(this.table);
      if (!inv.ok) {
        logger.error(
          `❌ [EventEngine] Card invariants failed after ${event.t}:`,
          inv.errors,
        );
        // Professional recovery: end hand and start a new one if eligible
        await this.dispatch({ t: "HandEnd" });
        // Count eligible players (chips > 0 and seated)
        const eligible = this.table.seats.filter(
          (s) => s.pid && s.chips > 0,
        ).length;
        if (
          eligible >= MIN_PLAYERS_TO_START &&
          this.table.phase === "waiting"
        ) {
          await this.dispatch({
            t: "StartHand",
            handNumber: this.table.handNumber + 1,
            timestamp: Date.now(),
          });
        }
      }
    } catch (e) {
      logger.error(`❌ [EventEngine] Invariant validation error:`, e);
    }

    // Handle player join/leave events with countdown logic
    if (event.t === "PlayerJoin") {
      // If countdown is active, mark new player as waiting for next hand
      if (this.gameStartTimer && this.table.phase === "waiting") {
        this.waitingPlayers.add(event.pid);
        logger.info(
          `⏰ [EventEngine] Player ${event.pid} joined during countdown - will wait for next hand`,
        );
        this.emit("playerWaitingForNextHand", { pid: event.pid });
      } else {
        // Normal join - check if game should start
        await this.checkGameStart();
      }
    }

    if (event.t === "PlayerLeave") {
      // Remove from waiting players if they were waiting
      this.waitingPlayers.delete(event.pid);
      await this.checkGameStart();
    }

    // Clean up waiting players when hand ends
    if (event.t === "HandEnd") {
      const waitingCount = this.waitingPlayers.size;
      if (waitingCount > 0) {
        logger.info(
          `🧹 [EventEngine] Hand ended - cleared ${waitingCount} waiting players; they can now participate`,
        );
        this.waitingPlayers.clear();
        this.emit("waitingPlayersCleared", { count: waitingCount });
      }
    }

    // Log actor state for debugging (transitions now handled by reducer)
    if (this.table.actor === undefined || this.table.actor === -1) {
      logger.warn(
        `⚠️ [EventEngine] Invalid actor after state update: ${this.table.actor} in phase: ${this.table.phase}`,
      );
      // Note: State transitions are now handled by the reducer through side effects
    }

    // Reducer-driven side effects start/stop timers explicitly.
    // Avoid starting duplicate timers here to prevent race conditions.

    // Emit state change for external listeners AFTER state is fully consistent
    // Use getState() to include derived action field
    const stateWithSittingOut = this.getState();
    this.emit("stateChanged", stateWithSittingOut);
    this.emit("eventProcessed", event, stateWithSittingOut);

    console.log(`✅ [EventEngine] Event ${event.t} processed successfully`);
  }

  // Note: Automatic transitions now handled by reducer through side effects

  /**
   * Start betting rounds after deal phase
   */
  private async startBettingRounds(): Promise<void> {
    logger.info(`🎲 [EventEngine] Starting betting rounds from deal phase`);

    // Post blinds and start preflop
    logger.debug(`   → Dispatching PostBlinds...`);
    await this.dispatch({
      t: "PostBlinds",
      sb: this.table.blinds.sb,
      bb: this.table.blinds.bb,
      ante: this.table.blinds.ante,
    });
    logger.debug(`   ✅ PostBlinds completed`);

    // Generate and deal hole cards to all active players
    logger.debug(
      `   → Dispatching DealHole (cards will be generated by reducer)...`,
    );
    await this.dispatch({
      t: "DealHole",
      cards: {}, // Empty - let reducer generate from table deck
    });
    logger.debug(`   ✅ DealHole completed`);
    logger.info(`🎯 [EventEngine] Betting rounds setup completed`);
  }

  /**
   * Process showdown phase with real hand evaluation
   */
  private async processShowdown(): Promise<void> {
    logger.info(`🃏 [EventEngine] Processing showdown - evaluating hands`);

    // Get players still in hand with their hole cards
    const playersInHand = this.table.seats.filter(
      (seat) =>
        seat.pid &&
        seat.holeCards &&
        (seat.status === "active" || seat.status === "allin"),
    );

    if (playersInHand.length === 0) {
      logger.error(`❌ [EventEngine] No players in hand for showdown`);
      return;
    }

    if (playersInHand.length === 1) {
      // Only one player left - they win without showing cards
      const winner = playersInHand[0];
      logger.info(
        `🏆 [EventEngine] ${winner.pid} wins by elimination (fold-to-one scenario)`,
      );

      // Handle uncalled bets properly using potManager logic
      const distributions = handleUncalledBet(this.table);

      if (distributions.length === 0) {
        // No uncalled bet scenario - winner gets all pots
        const totalPotAmount = this.table.pots.reduce(
          (sum, pot) => sum + pot.amount,
          0,
        );
        distributions.push({
          pid: winner.pid!,
          amount: totalPotAmount,
          potIndex: 0,
          reason: "win" as const,
        });
        logger.info(
          `💰 [EventEngine] ${winner.pid} wins ${totalPotAmount} chips (no uncalled bet)`,
        );
      } else {
        logger.info(
          `💰 [EventEngine] Uncalled bet handling: ${distributions.length} distributions`,
        );
        distributions.forEach((dist) => {
          logger.info(`   ${dist.pid}: ${dist.amount} chips (${dist.reason})`);
        });
      }

      await this.dispatch({ t: "Payout", distributions });
      return;
    }

    // Evaluate each player's hand
    const evaluatedHands: PlayerHand[] = playersInHand.map((seat) => {
      const handRank = evaluateHand(seat.holeCards!, this.table.communityCards);

      logger.info(`   🃏 ${seat.pid}: ${handRank.description}`);

      return {
        pid: seat.pid!,
        handRank,
        holeCards: seat.holeCards!,
      };
    });

    // Determine winners and rankings
    const results = determineWinners(evaluatedHands);

    // Log results
    results.forEach((result) => {
      if (result.rank === 1) {
        logger.info(
          `🏆 [EventEngine] Winner: ${result.pid} with ${result.description}`,
        );
      } else {
        logger.info(
          `   ${result.rank}. ${result.pid} with ${result.description}`,
        );
      }
    });

    // Calculate payouts based on hand rankings
    const distributions = calculatePayouts(this.table.pots, results);

    // Dispatch payout after a brief delay to show cards
    await this.dispatch({ t: "Payout", distributions });
  }

  /**
   * Schedule remaining streets when all players are all-in
   */
  private async scheduleAllInShowdown(): Promise<void> {
    const remainingStreets = this.getRemainingStreets();

    logger.info(
      `🎯 [EventEngine] Scheduling all-in showdown for streets: ${remainingStreets.join(", ")}`,
    );

    // Schedule streets with proper async delays and client-driven countdowns
    for (const street of remainingStreets) {
      logger.debug(
        `   ⏱️ Waiting ${STREET_DEAL_DELAY_MS}ms before dealing ${street}...`,
      );

      // Start client-driven countdown for street delay
      const countdownManager = getCountdownManager(this.table.id);
      const countdownEvent = countdownManager.startCountdown(
        `street_deal_${this.table.id}_${street}_${Date.now()}`,
        "street_deal",
        STREET_DEAL_DELAY_MS,
        { street },
      );

      // Emit countdown event for clients
      this.emit("streetDealCountdown", countdownEvent);

      await this.delay(STREET_DEAL_DELAY_MS);

      await this.dispatch({
        t: "EnterStreet",
        street: street as any,
        cards: [], // Empty - let reducer generate from table deck
        isAutoDealt: true,
      });
    }

    // Schedule showdown after all streets with final delay
    logger.debug(`   ⏱️ Waiting ${STREET_DEAL_DELAY_MS}ms before showdown...`);

    // Start client-driven countdown for showdown delay
    const countdownManager = getCountdownManager(this.table.id);
    const showdownCountdownEvent = countdownManager.startCountdown(
      `showdown_delay_${this.table.id}_${Date.now()}`,
      "street_deal",
      STREET_DEAL_DELAY_MS,
      { phase: "showdown" },
    );

    // Emit countdown event for clients
    this.emit("streetDealCountdown", showdownCountdownEvent);

    await this.delay(STREET_DEAL_DELAY_MS);
    await this.dispatch({ t: "Showdown", results: [] });
  }

  /**
   * Get remaining streets to deal for all-in showdown
   */
  private getRemainingStreets(): string[] {
    const currentStreet = this.table.street;
    const allStreets = ["preflop", "flop", "turn", "river"];
    const currentIndex = currentStreet ? allStreets.indexOf(currentStreet) : -1;

    if (currentIndex === -1) return allStreets.slice(1); // Start from flop if no street

    return allStreets.slice(currentIndex + 1);
  }

  /**
   * Process payout phase with delay before next hand
   * NOTE: This method should NOT be called from checkAutomaticTransitions to prevent loops
   */
  private async processPayout(): Promise<void> {
    logger.info(
      `💰 [EventEngine] Payout complete, waiting ${NEW_HAND_DELAY_MS}ms before signaling ready`,
    );

    // Start client-driven countdown for new hand delay
    const countdownManager = getCountdownManager(this.table.id);
    const countdownEvent = countdownManager.startCountdown(
      `new_hand_${this.table.id}_${Date.now()}`,
      "new_hand",
      NEW_HAND_DELAY_MS,
      { handNumber: this.table.handNumber },
    );

    // Emit countdown event for clients
    this.emit("newHandCountdown", countdownEvent);

    // Just wait for the delay - don't dispatch HandEnd here
    // HandEnd will be dispatched by the reducer when processing the Payout event
    await this.delay(NEW_HAND_DELAY_MS);

    // Deck is now managed by table state - no manual reset needed

    // Emit ready for new hand instead of dispatching events
    this.emit("readyForNewHand");
    console.log(`🔄 [EventEngine] Ready for new hand after payout delay`);
  }

  /**
   * Convert external commands to internal events
   */
  private commandToEvents(command: GameCommand): PokerEvent[] {
    switch (command.type) {
      case "join":
        if (
          command.playerId &&
          command.seatId !== undefined &&
          command.chips &&
          command.chips > 0
        ) {
          return [
            {
              t: "PlayerJoin",
              seat: command.seatId,
              pid: command.playerId,
              chips: command.chips,
              nickname: command.nickname,
            },
          ];
        }
        throw new Error(
          "JOIN command missing required fields (playerId, seatId, chips>0)",
        );

      case "leave":
        if (command.playerId && command.seatId !== undefined) {
          return [
            {
              t: "PlayerLeave",
              seat: command.seatId,
              pid: command.playerId,
            },
          ];
        }
        throw new Error(
          "LEAVE command missing required fields (playerId, seatId)",
        );

      case "action":
        if (command.seatId !== undefined && command.action) {
          return [
            {
              t: "Action",
              seat: command.seatId,
              action: command.action,
              amount: command.amount,
            },
          ];
        }
        throw new Error(
          "ACTION command missing required fields (seatId, action)",
        );

      case "start_hand":
        return [
          {
            t: "StartHand",
            handNumber: this.table.handNumber + 1,
            timestamp: Date.now(),
          },
        ];
    }
    throw new Error(`Unsupported command type: ${(command as any).type}`);
  }

  /**
   * Check if game should start and initiate countdown
   * Only counts active (non-waiting, non-sitting-out) players
   */
  private async checkGameStart(): Promise<void> {
    const sitOutManager = getSitOutManager(this.table.id);

    // Count only active players (not in waiting state and not sitting out)
    const eligibleSeats = this.table.seats.filter((s) => {
      if (!s.pid) return false; // Empty seat
      if (this.waitingPlayers.has(s.pid)) return false; // Waiting for next hand
      if (sitOutManager.isPlayerSittingOut(s.pid)) return false; // Sitting out
      return s.chips > 0; // Has chips to play
    });

    const activePlayerCount = eligibleSeats.length;
    const totalPlayerCount = this.table.seats.filter((s) => s.pid).length;
    const sittingOutCount = this.table.seats.filter(
      (s) => s.pid && sitOutManager.isPlayerSittingOut(s.pid),
    ).length;

    console.log(
      `🎮 [EventEngine] Checking game start: ${activePlayerCount}/${MIN_PLAYERS_TO_START} active players (${totalPlayerCount} total, ${sittingOutCount} sitting out)`,
    );

    // Only start if we have enough active players and game is waiting
    if (
      activePlayerCount >= MIN_PLAYERS_TO_START &&
      this.table.phase === "waiting"
    ) {
      // Don't start multiple countdowns
      if (this.gameStartTimer) {
        console.log(`⏰ [EventEngine] Game countdown already in progress`);
        return;
      }

      console.log(
        `🚀 [EventEngine] Starting game countdown: ${GAME_START_COUNTDOWN_MS}ms`,
      );

      // Start client-driven countdown using CountdownManager
      const countdownManager = getCountdownManager(this.table.id);
      const countdownEvent = countdownManager.startCountdown(
        `game_start_${this.table.id}_${Date.now()}`,
        "game_start",
        GAME_START_COUNTDOWN_MS,
        {
          activePlayerCount,
          totalPlayerCount,
          sittingOutCount,
        },
      );

      // Emit countdown event for clients
      this.emit("gameStartCountdown", countdownEvent);

      // From now on, new players joining will be marked as waiting
      this.scheduleGameStart();
    }
  }

  /**
   * Schedule game start with countdown (runs in background)
   */
  private scheduleGameStart(): void {
    console.log(
      `⏰ [EventEngine] Starting ${GAME_START_COUNTDOWN_MS / 1000}s countdown...`,
    );

    // Clear any existing timer
    if (this.gameStartTimer) {
      clearTimeout(this.gameStartTimer);
    }

    this.gameStartTimer = setTimeout(async () => {
      try {
        const sitOutManager = getSitOutManager(this.table.id);

        // Count eligible players at countdown end (not waiting and not sitting out)
        const eligibleSeats = this.table.seats.filter((s) => {
          if (!s.pid) return false; // Empty seat
          if (this.waitingPlayers.has(s.pid)) return false; // Waiting for next hand
          if (sitOutManager.isPlayerSittingOut(s.pid)) return false; // Sitting out
          return s.chips > 0; // Has chips to play
        });
        const activePlayerCount = eligibleSeats.length;

        if (
          activePlayerCount >= MIN_PLAYERS_TO_START &&
          this.table.phase === "waiting"
        ) {
          console.log(
            `✅ [EventEngine] Countdown complete, starting hand with ${activePlayerCount} active players`,
          );

          // Clear the timer
          this.gameStartTimer = undefined;

          // Start the hand with active players only
          await this.dispatch({
            t: "StartHand",
            handNumber: this.table.handNumber + 1,
            timestamp: Date.now(),
          });

          // Emit game started event
          this.emit("gameStarted", { activePlayerCount });
        } else {
          console.log(
            `❌ [EventEngine] Countdown cancelled - insufficient players (${activePlayerCount}) or game already started`,
          );

          // Clear the timer
          this.gameStartTimer = undefined;

          // If still waiting but insufficient players, may need to restart countdown when more join
          if (this.table.phase === "waiting") {
            console.log(
              `⏰ [EventEngine] Will restart countdown when more players join`,
            );
          }
        }
      } catch (error) {
        console.error(`❌ [EventEngine] Error in game start countdown:`, error);
        this.gameStartTimer = undefined;
      }
    }, GAME_START_COUNTDOWN_MS);

    const sitOutManager = getSitOutManager(this.table.id);
    const currentEligibleCount = this.table.seats.filter(
      (s) =>
        s.pid &&
        !this.waitingPlayers.has(s.pid) &&
        !sitOutManager.isPlayerSittingOut(s.pid) &&
        s.chips > 0,
    ).length;

    // Emit countdown started event
    this.emit("countdownStarted", {
      countdownMs: GAME_START_COUNTDOWN_MS,
      activePlayerCount: currentEligibleCount,
    });
  }

  /**
   * Promise-based delay utility for timing
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set timer manager for automated actions
   */
  setTimerManager(timerIntegration: any): void {
    this.timerManager = timerIntegration; // Store integration, not just manager
    logger.info(`⏰ [EventEngine] Timer connected to state machine`);

    // Timer events are handled through TimerIntegration, not directly here
  }

  /**
   * Start action timer for current player
   */
  private startActionTimer(): void {
    if (!this.timerManager || this.table.actor === undefined) {
      logger.error(
        `❌ [EventEngine] Timer not initialized or no actor: timer=${!!this.timerManager}, actor=${this.table.actor}`,
      );
      return;
    }

    const seat = this.table.seats[this.table.actor];
    if (!seat?.pid) {
      return;
    }

    // Call correct method on TimerIntegration
    this.timerManager.startActionTimer(seat.pid, this.table.actor);
    logger.debug(
      `⏰ [EventEngine] Started timer for ${seat.pid} at seat ${this.table.actor}`,
    );
  }

  /**
   * Start action timer if we're in a betting phase with an active player
   */
  private startActionTimerIfNeeded(): void {
    const bettingPhases = ["preflop", "flop", "turn", "river"];

    if (
      !bettingPhases.includes(this.table.phase) ||
      this.table.actor === undefined
    ) {
      return; // Not in betting phase or no active player
    }

    const currentSeat = this.table.seats[this.table.actor];
    if (!currentSeat.pid || currentSeat.status !== "active") {
      return; // Invalid current player
    }

    console.log(
      `⏰ [EventEngine] Starting action timer for player ${currentSeat.pid} (seat ${this.table.actor})`,
    );
    this.startActionTimer();
  }

  /**
   * Legacy compatibility methods
   */

  // Add player (legacy interface)
  addPlayer(playerData: {
    id: string;
    seat: number;
    chips: number;
    nickname?: string;
  }): boolean {
    this.dispatch({
      t: "PlayerJoin",
      seat: playerData.seat,
      pid: playerData.id,
      chips: playerData.chips,
      nickname: playerData.nickname,
    });
    return true;
  }

  // Remove player (legacy interface)
  removePlayer(playerId: string): boolean {
    const seat = this.table.seats.find((s) => s.pid === playerId);
    if (seat) {
      this.dispatch({
        t: "PlayerLeave",
        seat: seat.id,
        pid: playerId,
      });
      return true;
    }
    return false;
  }

  // Handle action (legacy interface)
  handleAction(
    playerId: string,
    action: { type: string; amount?: number },
  ): boolean {
    const seat = this.table.seats.find((s) => s.pid === playerId);
    if (!seat) {
      return false;
    }

    this.dispatch({
      t: "Action",
      seat: seat.id,
      action: action.type as ActionType,
      amount: action.amount,
    });

    return true;
  }

  // Start hand (legacy interface)
  startHand(): void {
    this.dispatch({
      t: "StartHand",
      handNumber: this.table.handNumber + 1,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute side effects returned by the reducer
   */
  private async executeSideEffects(sideEffects: SideEffect[]): Promise<void> {
    for (const effect of sideEffects) {
      await this.executeSideEffect(effect);
    }
  }

  /**
   * Execute individual side effect
   */
  private async executeSideEffect(effect: SideEffect): Promise<void> {
    logger.debug(
      `🔄 [EventEngine] Executing side effect: ${effect.type} ${JSON.stringify(effect.payload)}`,
    );

    switch (effect.type) {
      case "START_TIMER":
        if (this.timerManager) {
          const { playerId, seatId, timeoutMs } = effect.payload;
          this.timerManager.startActionTimer(playerId, seatId, timeoutMs);
        }
        break;

      case "STOP_TIMER":
        if (this.timerManager) {
          const { playerId } = effect.payload;
          if (playerId) {
            this.timerManager.clearTimer(playerId);
          } else {
            this.timerManager.clearAllTimers();
          }
        }
        break;

      case "DISPATCH_EVENT": {
        let { event, delayMs } = effect.payload as any;
        if (delayMs) {
          await this.delay(delayMs);
        }
        // Card generation is now handled by the reducer using table deck
        // No manual card generation needed here
        await this.dispatch(event);
        break;
      }

      case "EMIT_STATE_CHANGE":
        const { reason } = effect.payload;
        console.log(`📡 [EventEngine] Emitting state change: ${reason}`);
        this.emit("stateChanged", this.getState());
        this.emit("eventProcessed", reason, this.table);
        break;

      case "CHECK_GAME_START": {
        const { delayMs } = effect.payload as any;
        if (delayMs && delayMs > 0) {
          await this.delay(delayMs);
        }
        await this.checkGameStart();
        break;
      }

      case "CLEAR_TIMERS":
        if (this.timerManager) {
          this.timerManager.clearAllTimers();
        }
        break;

      case "EVALUATE_HANDS": {
        // Evaluate hands and compute pot-aware payouts
        try {
          // Collect players still in hand
          const playersInHand = this.table.seats.filter(
            (seat) =>
              seat.pid &&
              seat.holeCards &&
              (seat.status === "active" || seat.status === "allin"),
          );

          if (playersInHand.length === 0) {
            logger.error(`❌ [EventEngine] No players in hand for showdown`);
            break;
          }

          if (playersInHand.length === 1) {
            // Single player wins everything including uncalled bet handling
            const solo = playersInHand[0]!;
            const dists = handleUncalledBet(this.table);
            if (dists.length === 0) {
              const totalPotAmount = this.table.pots.reduce(
                (sum, pot) => sum + pot.amount,
                0,
              );
              dists.push({
                pid: solo.pid!,
                amount: totalPotAmount,
                potIndex: 0,
                reason: "win" as const,
              });
            }
            await this.dispatch({ t: "Payout", distributions: dists });
            break;
          }

          // Evaluate in hash format (lower score is better)
          const evaluated = playersInHand.map((seat) => ({
            pid: seat.pid!,
            score: evaluateCodes([
              ...(seat.holeCards as number[]),
              ...this.table.communityCards,
            ]),
            holeCards: seat.holeCards as [number, number],
          }));

          // Compute rank numbers (1 = best), ties share same rank
          const sorted = [...evaluated].sort((a, b) => a.score - b.score);
          const ranks = new Map<string, number>();
          let currentRank = 1;
          for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i].score !== sorted[i - 1].score) {
              currentRank = i + 1;
            }
            ranks.set(sorted[i].pid, currentRank);
          }

          const handRankings = evaluated.map((e) => ({
            pid: e.pid,
            rank: ranks.get(e.pid) || 999,
            description: `score ${e.score}`,
          }));

          // Calculate payouts using pot manager (handles side pots and ties)
          const distributions = calculatePayouts(this.table.pots, handRankings);
          await this.dispatch({ t: "Payout", distributions });
        } catch (err) {
          logger.error(`❌ [EventEngine] Showdown evaluation failed:`, err);
        }
        break;
      }

      default:
        console.warn(`⚠️ [EventEngine] Unknown side effect type:`, effect);
        break;
    }
  }

  /**
   * Evaluate hands using hash format (cards are already in correct format)
   */
  private async evaluateHandsWithHashFormat(): Promise<any[]> {
    logger.info(`🃏 [EventEngine] Evaluating hands using hash format`);

    // Get players still in hand with their hole cards
    const playersInHand = this.table.seats.filter(
      (seat) =>
        seat.pid &&
        seat.holeCards &&
        (seat.status === "active" || seat.status === "allin"),
    );

    if (playersInHand.length === 0) {
      logger.error(`❌ [EventEngine] No players in hand for showdown`);
      return [];
    }

    if (playersInHand.length === 1) {
      // Only one player left - they win without showing cards
      const winner = playersInHand[0];
      logger.info(`🏆 [EventEngine] ${winner.pid} wins by elimination`);

      const totalPotAmount = this.table.pots.reduce(
        (sum, pot) => sum + pot.amount,
        0,
      );
      return [
        {
          pid: winner.pid!,
          amount: totalPotAmount,
          potIndex: 0,
          reason: "win" as const,
        },
      ];
    }

    // Evaluate each player's hand using hash format (no conversion needed)
    const evaluatedHands = playersInHand.map((seat) => {
      const allCards = [...seat.holeCards!, ...this.table.communityCards];
      const handRank = evaluateCodes(allCards);

      logger.info(`   🃏 ${seat.pid}: Score ${handRank}`);

      return {
        pid: seat.pid!,
        handRank,
        holeCards: seat.holeCards!,
      };
    });

    // Determine winners (lower score is better)
    const sortedHands = evaluatedHands.sort((a, b) => a.handRank - b.handRank);
    const bestScore = sortedHands[0].handRank;
    const winners = sortedHands.filter((h) => h.handRank === bestScore);

    logger.info(
      `🏆 [EventEngine] Winners determined: ${winners.map((w) => w.pid).join(", ")}`,
    );

    // Calculate distributions (simple equal split for now)
    const totalPotAmount = this.table.pots.reduce(
      (sum, pot) => sum + pot.amount,
      0,
    );
    const amountPerWinner = Math.floor(totalPotAmount / winners.length);

    return winners.map((winner) => ({
      pid: winner.pid,
      amount: amountPerWinner,
      potIndex: 0,
      reason: "win" as const,
    }));
  }

  /**
   * Cleanup method for proper resource management
   */
  cleanup(): void {
    // Clear game start timer if active
    if (this.gameStartTimer) {
      clearTimeout(this.gameStartTimer);
      this.gameStartTimer = undefined;
      logger.info(`🧹 [EventEngine] Cleaned up game start timer`);
    }

    // Clear waiting players
    if (this.waitingPlayers.size > 0) {
      this.waitingPlayers.clear();
      logger.info(`🧹 [EventEngine] Cleared waiting players`);
    }

    // Clear timer manager if available
    if (this.timerManager) {
      this.timerManager.clearAllTimers("engine-cleanup");
      logger.info(`🧹 [EventEngine] Cleared all action timers`);
    }

    logger.info(`🧹 [EventEngine] Cleanup complete`);
  }

  /**
   * Get available actions for a specific player seat
   * Provides server-side truth for frontend consistency
   */
  getPlayerAvailableActions(seatId: number): ActionType[] {
    try {
      return getAvailableActions(this.table, seatId);
    } catch (error) {
      logger.error(
        `❌ [EventEngine] Error getting available actions for seat ${seatId}:`,
        error,
      );
      return [];
    }
  }
}
