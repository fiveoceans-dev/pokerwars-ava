/**
 * Professional Production WebSocket-FSM Bridge
 *
 * Direct integration between WebSocket server and EventEngine FSM:
 * - No adapter layer - pure event-driven communication
 * - EventEngine is single source of truth
 * - All state changes through event dispatch
 * - Complete event sourcing and audit trail
 */

import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { EventEngine, Table, PokerEvent, TimerEvent, getActiveCountdownsForTable } from "@hyper-poker/engine";
import type { ServerEvent, ClientCommand, LobbyTable } from "@hyper-poker/engine";
import { SessionManager, Session } from "./sessionManager";
import { getSitOutManager } from "@hyper-poker/engine/managers/sitOutManager";
import { TimerIntegration } from "@hyper-poker/engine/managers/timerEvents";
import { logger } from "@hyper-poker/engine/utils/logger";
import {
  getTableConfig,
  getRecommendedBuyIn,
  validateBuyIn,
  listTableConfigs,
} from "./tableConfig";
import { globalSeatMappings } from "./seatMappingManager";
import { saveSession, saveRoom, removeRoom } from "./persistence";
import { BotManager, type BotConfig } from "./botManager";
import { verifiedWallets } from "./security";
import { Asset, PrismaClient } from "@prisma/client";
import { LedgerPort } from "./ledgerPort";
import { cashRejoinManager } from "./cashRejoinManager";

/**
 * Custom JSON replacer to handle BigInt values
 */
const bigIntReplacer = (_key: string, value: any) => {
  return typeof value === "bigint" ? value.toString() : value;
};

/**
 * Professional WebSocket-FSM Bridge
 *
 * Provides clean translation between WebSocket client commands and EventEngine FSM events.
 * Maintains separation of concerns with proper error handling and validation.
 *
 * @extends EventEmitter
 * @example
 * ```typescript
 * const bridge = new WebSocketFSMBridge(sessions);
 * bridge.on('broadcast', (roomId, event) => broadcast(roomId, event));
 * await bridge.handleCommand(ws, session, command);
 * ```
 */
class WebSocketFSMBridge extends EventEmitter {
  private engines = new Map<string, EventEngine>();
  private tableMaxPlayers = new Map<string, number>();
  private sessions: SessionManager;
  // Simple rate limiter state: sessionId -> { windowStartMs, count }
  private rl = new Map<string, { t: number; c: number }>();
  private onPlayerBust?: (tableId: string, playerId: string) => void;
  private botManager?: BotManager;
  private idleTables = new Map<string, number>(); // tableId -> lastActiveTimestamp
  private reaperInterval: NodeJS.Timeout;

  constructor(
    sessions: SessionManager,
    private ledgerService?: LedgerPort | null,
    private prisma?: PrismaClient | null,
  ) {
    super();
    this.sessions = sessions;
    this.reaperInterval = setInterval(() => this.checkIdleTables(), 60_000); // Check every minute
  }

  shutdown() {
    if (this.reaperInterval) clearInterval(this.reaperInterval);
  }

  private async checkIdleTables() {
    const IDLE_TIMEOUT_MS = 5 * 60_000; // 5 minutes
    const now = Date.now();

    for (const [tableId, engine] of this.engines.entries()) {
      // Only reap cash tables; tournaments are managed by TournamentOrchestrator
      if (!tableId.startsWith("cash-")) continue;

      const table = engine.getState();
      const activePlayers = table.seats.filter(s => s.pid).length;

      if (activePlayers === 0) {
        const lastActive = this.idleTables.get(tableId) || now;
        if (!this.idleTables.has(tableId)) {
          this.idleTables.set(tableId, now);
        } else if (now - lastActive > IDLE_TIMEOUT_MS) {
          logger.info(`🧹 [Reaper] Closing idle cash table ${tableId} (empty for 5m)`);
          await this.closeTable(tableId);
          this.idleTables.delete(tableId);
        }
      } else {
        this.idleTables.delete(tableId);
      }
    }
  }

  setBustHandler(handler: (tableId: string, playerId: string) => void) {
    this.onPlayerBust = handler;
  }

  setBotManager(manager: BotManager) {
    this.botManager = manager;
  }

  setBotStyle(tableId: string, cfg: BotConfig) {
    this.botManager?.setTableStyle(tableId, cfg);
  }

  setTableMaxPlayers(tableId: string, maxPlayers: number) {
    if (!Number.isFinite(maxPlayers) || maxPlayers <= 0) return;
    this.tableMaxPlayers.set(tableId, Math.floor(maxPlayers));
  }

  rehydrateEngine(table: Table) {
    const engine = this.getEngine(table.id, table.smallBlind, table.bigBlind);
    engine.rehydrate(table);
    logger.info(`♻️ [Bridge] Rehydrated engine for table ${table.id}`);
  }

  getMaxPlayers(tableId: string, table?: Table): number {
    return this.resolveMaxPlayers(tableId, table);
  }

  private resolveMaxPlayers(tableId: string, table?: Table): number {
    const override = this.tableMaxPlayers.get(tableId);
    if (override) return override;
    const config = getTableConfig(tableId);
    if (config?.maxPlayers) return config.maxPlayers;
    return table?.seats?.length ?? 9;
  }

  private resolveTableType(tableId: string): "cash" | "stt" | "mtt" {
    if (tableId.startsWith("stt-")) return "stt";
    if (tableId.startsWith("mtt-")) return "mtt";
    return "cash";
  }

  /**
   * Get canonical identity for consistent lookups
   * Priority: 1) Command playerId 2) Session wallet 3) Session ID
   */
  private async getCanonicalId(
    session: Session,
    command?: any,
  ): Promise<string> {
    const requireVerified = (id: string) => {
      // Temporary dev bypass: allow seating without prior auth; production should enforce verified wallets
      if (process.env.ALLOW_UNVERIFIED_WALLETS === "1") return;
      if (id && id.startsWith("0x") && !verifiedWallets.has(id.toLowerCase())) {
        throw new Error("wallet not verified");
      }
    };

    // If command provides identity, bind it to session if not already bound
    if (command?.playerId) {
      const normalizedPlayerId = this.normalizePlayerId(command.playerId);
      logger.debug(
        `🔍 [Identity] Command playerId: ${normalizedPlayerId}, Session userId: ${session.userId}`,
      );
      requireVerified(normalizedPlayerId);

      if (!session.userId) {
        // Bind wallet identity to session
        const success = this.sessions.updateBinding(
          session,
          normalizedPlayerId,
        );
        if (success) {
          // CRITICAL: Persist the session binding
          try {
            await saveSession(session);
            logger.info(
              `✅ [Identity] Bound and persisted wallet ${normalizedPlayerId} to session ${session.sessionId}`,
            );
          } catch (error) {
            logger.error(
              `❌ [Identity] Failed to persist session binding:`,
              error,
            );
          }
        } else {
          logger.warn(
            `⚠️ [Identity] Failed to bind ${normalizedPlayerId} to session ${session.sessionId}`,
          );
        }
      } else if (session.userId !== normalizedPlayerId) {
        logger.warn(
          `🔄 [Identity] Wallet mismatch: session has ${session.userId}, command has ${normalizedPlayerId}`,
        );
      } else {
        // Already bound correctly - ensure it's persisted
        try {
          await saveSession(session);
          logger.debug(
            `📦 [Identity] Session already bound correctly, ensured persistence`,
          );
        } catch (error) {
          logger.error(
            `❌ [Identity] Failed to persist existing session binding:`,
            error,
          );
        }
      }

      return normalizedPlayerId;
    }

    // Opportunistic recovery: if userId missing but we know seat, bind from FSM table state
    try {
      if (!session.userId && session.roomId !== undefined && session.seat !== undefined) {
        const engine = this.engines.get(session.roomId);
        if (engine) {
          const table = engine.getState();
          const seat = table.seats[session.seat];
          if (seat?.pid) {
            const recovered = this.normalizePlayerId(seat.pid);
            requireVerified(recovered);
            const success = this.sessions.updateBinding(session, recovered);
            if (success) {
              await saveSession(session);
              logger.warn(
                `🔧 [Identity] Recovered and bound userId from FSM seat: ${recovered} (table ${session.roomId}, seat ${session.seat})`,
              );
              return recovered;
            }
          }
        }
      }
    } catch (e) {
      logger.error(`❌ [Identity] Seat-based recovery failed:`, e);
    }

    // Use session's bound wallet or fall back to session ID
    const canonicalId = this.normalizePlayerId(
      session.userId || session.sessionId,
    );
    requireVerified(canonicalId);
    logger.debug(
      `🎯 [Identity] Resolved canonical ID: ${canonicalId} (from ${session.userId ? "userId" : "sessionId"})`,
    );
    return canonicalId;
  }

  /**
   * Resolve seat mapping with self-healing recovery
   */
  private async resolveSeatMapping(
    session: Session,
    tableId: string,
    command?: any,
  ): Promise<number | undefined> {
    const canonicalId = await this.getCanonicalId(session, command);
    logger.debug(
      `🔍 [SeatResolve] Resolving seat for canonical ID: ${canonicalId}`,
    );

    // Try direct lookup
    let seatId = globalSeatMappings.findSeat(tableId, canonicalId);
    logger.debug(`🔍 [SeatResolve] Direct lookup result: ${seatId}`);

    if (seatId === undefined) {
      logger.warn(
        `⚠️ [SeatResolve] No direct mapping found, attempting FSM recovery...`,
      );
      // Attempt recovery from FSM state
      try {
        const table = this.getTableState(tableId);
        logger.debug(
          `🔍 [SeatResolve] FSM table seats:`,
          table.seats.map((s) => ({ id: s.id, pid: s.pid })),
        );
        logger.debug(
          `🔍 [SeatResolve] Looking for canonicalId: ${canonicalId}`,
        );

        // Search through seats by index since FSM uses array-based seats
        for (let i = 0; i < table.seats.length; i++) {
          const seat = table.seats[i];
          if (seat?.pid) {
            const normalizedSeatPid = this.normalizePlayerId(seat.pid);
            logger.debug(
              `🔍 [SeatResolve] Comparing seat ${i}: "${normalizedSeatPid}" vs "${canonicalId}"`,
            );

            if (normalizedSeatPid === canonicalId) {
              // Repair the mapping
              globalSeatMappings.setSeatMapping(tableId, canonicalId, i);
              logger.warn(
                `🔧 [Recovery] Recovered seat mapping: ${canonicalId} -> seat ${i}`,
              );
              return i;
            }
          }
        }

        // Player not found in FSM
        logger.error(
          `❌ [Recovery] Player ${canonicalId} not found in FSM table state`,
        );
      } catch (error) {
        logger.error(
          `❌ [Identity] Failed to recover seat mapping for ${canonicalId}:`,
          error,
        );
      }
    }

    // If still not found, try raw sessionId as last resort
    if (seatId === undefined && session.sessionId !== canonicalId) {
      logger.warn(
        `⚠️ [SeatResolve] Trying sessionId fallback: ${session.sessionId}`,
      );
      seatId = globalSeatMappings.findSeat(tableId, session.sessionId);
      if (seatId !== undefined) {
        // Repair the mapping with correct canonical ID
        globalSeatMappings.setSeatMapping(tableId, canonicalId, seatId);
        logger.warn(
          `🔧 [Recovery] Found seat using sessionId, repaired mapping: ${canonicalId} -> seat ${seatId}`,
        );
      }
    }

    logger.debug(
      `🎯 [SeatResolve] Final seat result: ${seatId} for ${canonicalId}`,
    );
    return seatId;
  }

  /**
   * Get or create EventEngine for table
   *
   * Creates a new EventEngine instance if one doesn't exist for the given table.
   * Each table has its own isolated EventEngine with complete event sourcing.
   * Uses table configuration for blind levels.
   *
   * @param tableId - Unique identifier for the poker table
   * @param smallBlind - Optional small blind override
   * @param bigBlind - Optional big blind override
   * @returns EventEngine instance for the specified table
   * @throws {Error} If tableId is invalid or configuration not found
   */
  getEngine(
    tableId: string,
    smallBlind?: number,
    bigBlind?: number,
  ): EventEngine {
    let engine = this.engines.get(tableId);
    if (!engine) {
      // Get table configuration or use provided blinds
      const config = getTableConfig(tableId);
      const sb = smallBlind ?? config?.blinds.small ?? 5;
      const bb = bigBlind ?? config?.blinds.big ?? 10;

      engine = new EventEngine(tableId, sb, bb);
      this.engines.set(tableId, engine);

      // Forward FSM events to WebSocket clients
      this.setupEngineEventForwarding(engine, tableId);
      // Attach bot runner
      this.botManager?.attach(engine, tableId);

      // Initialize action timer integration for this engine (FSM side effects drive timers)
      try {
        const timeoutMs =
          parseInt(process.env.ACTION_TIMEOUT_SECONDS || "15") * 1000;
        const timerIntegration = new TimerIntegration(
          engine as any,
          tableId,
          timeoutMs,
        );
        engine.setTimerManager(timerIntegration);
      } catch (e) {
        logger.error(
          `❌ Failed to initialize timer integration for ${tableId}:`,
          e,
        );
      }

      logger.info(
        `🎯 Created EventEngine for table ${tableId} with blinds ${sb}/${bb}`,
      );
    }

    return engine;
  }

  /**
   * Setup pure event forwarding from FSM to WebSocket
   * No state conversion - forward Table format directly
   */
  private setupEngineEventForwarding(
    engine: EventEngine,
    tableId: string,
  ): void {
    // State changes - send Table format directly to clients
    engine.on("stateChanged", (table: Table) => {
      const maxPlayers = this.resolveMaxPlayers(tableId, table);
      const tableType = this.resolveTableType(tableId);
      const now = Date.now();
      const countdowns = getActiveCountdownsForTable(tableId).filter((c) => {
        const elapsed = now - c.startTime;
        return elapsed < c.duration;
      });
      this.emit("broadcast", tableId, {
        type: "TABLE_SNAPSHOT",
        table, // Send Table directly - clients adapt
        tableType,
        maxPlayers,
        countdowns,
      });
      // Persist table state for crash recovery
      void saveRoom(table);
    });

    // Action countdown events (client-driven model)
    engine.on("actionCountdown", (countdownEvent: any) => {
      this.emit("broadcast", tableId, {
        type: "COUNTDOWN_START",
        countdownType: countdownEvent.countdownType,
        startTime: countdownEvent.startTime,
        duration: countdownEvent.duration,
        metadata: countdownEvent.metadata,
      });
    });

    engine.on("actionTimeout", (data: any) => {
      this.emit("broadcast", tableId, {
        type: "TIMER",
        countdown: 0,
      });
      // Failsafe: if actor is still this seat, force auto-fold to avoid stalling
      try {
        const state = engine.getState();
        if (state.actor !== undefined && state.actor !== null && state.actor >= 0) {
          const seat = state.seats[state.actor];
          if (seat?.pid) {
            logger.warn(`⏳ [Timeout] Forcing auto-fold for ${seat.pid} on ${tableId}`);
            void engine.dispatch({
              t: "TimeoutAutoFold",
              seat: state.actor,
            });
          }
        }
      } catch (err) {
        logger.error(`❌ Failed to force auto-fold on timeout for ${tableId}`, err);
      }
    });

    // Game countdown events - now using client-driven model
    engine.on("gameStartCountdown", (countdownEvent: any) => {
      this.emit("broadcast", tableId, {
        type: "COUNTDOWN_START",
        countdownType: countdownEvent.countdownType,
        startTime: countdownEvent.startTime,
        duration: countdownEvent.duration,
        metadata: countdownEvent.metadata,
      });
    });

    // Street deal countdown events
    engine.on("streetDealCountdown", (countdownEvent: any) => {
      this.emit("broadcast", tableId, {
        type: "COUNTDOWN_START",
        countdownType: countdownEvent.countdownType,
        startTime: countdownEvent.startTime,
        duration: countdownEvent.duration,
        metadata: countdownEvent.metadata,
      });
    });

    // New hand countdown events
    engine.on("newHandCountdown", (countdownEvent: any) => {
      this.emit("broadcast", tableId, {
        type: "COUNTDOWN_START",
        countdownType: countdownEvent.countdownType,
        startTime: countdownEvent.startTime,
        duration: countdownEvent.duration,
        metadata: countdownEvent.metadata,
      });
    });

    // Reconnect countdown events
    engine.on("reconnectCountdown", (countdownEvent: any) => {
      this.emit("broadcast", tableId, {
        type: "COUNTDOWN_START",
        countdownType: countdownEvent.countdownType,
        startTime: countdownEvent.startTime,
        duration: countdownEvent.duration,
        metadata: countdownEvent.metadata,
      });
    });

    // Game flow events
    engine.on("eventProcessed", (event: PokerEvent, table: Table) => {
      this.handleEventForwarding(event, table, tableId);

      // Attach bust detection
      if (event.t === "HandEnd" && this.onPlayerBust) {
        try {
          table.seats.forEach((seat) => {
            if (seat?.pid && seat.chips <= 0) {
              this.onPlayerBust?.(tableId, seat.pid);
            }
          });
        } catch (err) {
          logger.error("❌ Failed to detect bust on HandEnd", err);
        }
      }
    });

    // Forward waiting player info so UI can show proper 'waiting' status
    engine.on("playerWaitingForNextHand", ({ pid }: { pid: string }) => {
      try {
        const table = this.getTableState(tableId);
        const seat = table.seats.find(
          (s) => s.pid && s.pid.toLowerCase() === pid.toLowerCase(),
        );
        if (seat) {
          this.emit("broadcast", tableId, {
            tableId,
            type: "PLAYER_WAITING",
            seat: seat.id,
            playerId: pid,
            nickname: seat.nickname || this.shortAddress(pid),
          } as any);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to broadcast PLAYER_WAITING for ${pid} on ${tableId}:`,
          error,
        );
      }
    });
  }

  /**
   * Forward specific FSM events to WebSocket format
   */
  private handleEventForwarding(
    event: PokerEvent,
    table: Table,
    tableId: string,
  ): void {
    switch (event.t) {
      case "PlayerJoin":
        this.emit("broadcast", tableId, {
          type: "PLAYER_JOINED",
          seat: (event as any).seat,
          playerId: (event as any).pid,
          nickname:
            (event as any).nickname || this.shortAddress((event as any).pid),
        } as any);
        this.broadcastTableList();
        break;

      case "PlayerLeave":
        this.emit("broadcast", tableId, {
          type: "PLAYER_LEFT",
          seat: (event as any).seat,
          playerId: (event as any).pid,
        } as any);
        this.broadcastTableList();
        break;

      case "PlayerSitOut":
        this.emit("broadcast", tableId, {
          type: "PLAYER_SAT_OUT",
          seat: (event as any).seat,
          playerId: (event as any).pid,
          reason: (event as any).reason,
        } as any);
        break;

      case "PlayerSitIn":
        this.emit("broadcast", tableId, {
          type: "PLAYER_SAT_IN",
          seat: (event as any).seat,
          playerId: (event as any).pid,
        } as any);
        break;

      case "StartHand":
        this.emit("broadcast", tableId, { type: "HAND_START" });
        break;

      case "DealHole":
        // Emit DealHole event - will be sanitized by broadcast() to only show to owner
        this.emit("broadcast", tableId, {
          type: "DEAL_HOLE",
          tableId,
          // Forward the raw cards map; broadcast() handles per-player filtering
          cards: (event as any).cards, 
        } as any);
        break;

      case "EnterStreet":
        if (event.street === "flop" && table.communityCards.length >= 3) {
          this.emit("broadcast", tableId, {
            type: "DEAL_FLOP",
            cards: table.communityCards.slice(0, 3),
          });
        } else if (
          event.street === "turn" &&
          table.communityCards.length >= 4
        ) {
          this.emit("broadcast", tableId, {
            type: "DEAL_TURN",
            card: table.communityCards[3],
          });
        } else if (
          event.street === "river" &&
          table.communityCards.length >= 5
        ) {
          this.emit("broadcast", tableId, {
            type: "DEAL_RIVER",
            card: table.communityCards[4],
          });
        }
        break;

      case "Showdown": {
        // Engine now forces all remaining hands face-up; broadcast reveals for all active/allin seats
        const toReveal = table.seats.filter(
          (s) =>
            s.pid &&
            s.holeCards &&
            (s.status === "active" || s.status === "allin"),
        );
        toReveal.forEach((seat) => {
          this.emit("broadcast", tableId, {
            type: "PLAYER_REVEALED",
            seat: seat.id,
            playerId: seat.pid!,
          } as any);
        });
        break;
      }

      case "HandEnd":
        this.emit("broadcast", tableId, { type: "HAND_END" });
        break;

      case "Action": {
        const seat = table.seats[(event as any).seat];
        if (seat?.pid) {
          this.emit("broadcast", tableId, {
            type: "PLAYER_ACTION_APPLIED",
            tableId,
            playerId: seat.pid,
            // Use authoritative seat action from state when available (handles CALL->CHECK normalization)
            action: (seat as any).action ?? (event as any).action,
            amount: (event as any).amount,
            seat: (event as any).seat,
          } as any);
        }
        break;
      }

      case "Payout": {
        try {
          const distributions = (event as any).distributions || [];
          // Aggregate winners by pid with positive amounts
          const winnersMap = new Map<string, number>();
          let total = 0;
          for (const d of distributions) {
            if (d.amount > 0) {
              const prev = winnersMap.get(d.pid) || 0;
              winnersMap.set(d.pid, prev + d.amount);
              total += d.amount;
            }
          }
          if (winnersMap.size > 0) {
            const winners = Array.from(winnersMap.keys()).map((pid) => {
              const seat = table.seats.find(
                (s) => s.pid && s.pid.toLowerCase() === pid.toLowerCase(),
              );
              return { seat: seat ? seat.id : -1, playerId: pid };
            });

            this.emit("broadcast", tableId, {
              type: "WINNER_ANNOUNCEMENT",
              winners,
              potAmount: total,
            } as any);
            // Broadcast explicit reveals for all winners to minimize UI lag
            winners.forEach((w) => {
              if (w.seat >= 0) {
                this.emit("broadcast", tableId, {
                  type: "PLAYER_REVEALED",
                  seat: w.seat,
                  playerId: w.playerId,
                } as any);
              }
            });
          }
        } catch (e) {
          logger.error(`❌ [Bridge] Failed to emit WINNER_ANNOUNCEMENT:`, e);
        }
        break;
      }
    }
  }

  /**
   * Process WebSocket command by dispatching FSM events
   * Pure event-driven - no direct state manipulation
   */
  async handleCommand(
    ws: WebSocket,
    session: Session,
    command: ClientCommand,
  ): Promise<void> {
    try {
      // Rate limit commands per session (window 5s, max 40 cmds)
      const now = Date.now();
      const w = 5000;
      const max = 40;
      const key = session.sessionId;
      const state = this.rl.get(key) || { t: now, c: 0 };
      if (now - state.t > w) {
        state.t = now;
        state.c = 0;
      }
      state.c++;
      this.rl.set(key, state);
      if (state.c > max) {
        this.emit("error", session.roomId || "", {
          type: "ERROR",
          code: "RATE_LIMIT",
          msg: `Too many commands; try again later`,
        } as any);
        return;
      }

      switch (command.type) {
        case "SIT":
          await this.handleSitCommand(session, command);
          break;

        case "ACTION":
          await this.handleActionCommand(session, command);
          break;

        case "LEAVE":
          await this.handleLeaveCommand(session);
          break;

        case "SIT_OUT":
          await this.handleSitOutCommand(session);
          break;

        case "SIT_IN":
          await this.handleSitInCommand(session);
          break;

        case "SHOW_CARDS":
          await this.handleShowCardsCommand(session);
          break;

        case "MUCK_CARDS":
          await this.handleMuckCardsCommand(session);
          break;

        default:
          this.emit("error", session.roomId || "", {
            type: "ERROR",
            code: "UNKNOWN_COMMAND",
            msg: (command as any).type,
          });
      }
    } catch (error) {
      const errEvent = {
        type: "ERROR",
        code: "COMMAND_FAILED",
        msg: error instanceof Error ? error.message : String(error),
      } as ServerEvent;
      this.emit("error", session.roomId || "", errEvent);

      // Graceful recovery: broadcast fresh snapshot to resync UI
      try {
        if (session.roomId) {
          const table = this.getTableState(session.roomId);
          const maxPlayers = this.resolveMaxPlayers(session.roomId, table);
          this.emit("broadcast", session.roomId, {
            tableId: session.roomId,
            type: "TABLE_SNAPSHOT",
            table,
            maxPlayers,
          } as ServerEvent);
        }
      } catch (snapErr) {
        logger.error(`❌ Failed to broadcast snapshot after error:`, snapErr);
      }
    }
  }

  /**
   * Handle SIT command with unified identity management
   */
  private async handleSitCommand(
    session: Session,
    command: any,
  ): Promise<void> {
    try {
      // Validate input
      if (!command.tableId || typeof command.seat !== "number") {
        throw new Error("Invalid SIT command: missing tableId or seat");
      }

      const maxPlayers = this.resolveMaxPlayers(command.tableId);
      if (command.seat < 0 || command.seat >= maxPlayers) {
        throw new Error(
          `Invalid seat number: must be 0-${maxPlayers - 1}`,
        );
      }

      // Get canonical identity (binds wallet to session if needed)
      logger.info(
        `🪑 [SIT] Starting seat join for session ${session.sessionId}, seat ${command.seat}`,
      );
      logger.debug(
        `🔍 [SIT] Session state before: userId=${session.userId}, playerId from command=${command.playerId}`,
      );

      const canonicalId = await this.getCanonicalId(session, command);

      logger.debug(
        `🔍 [SIT] Session state after binding: userId=${session.userId}`,
      );
      logger.info(`✅ [SIT] Canonical ID resolved: ${canonicalId}`);

      // Validate canonical ID
      if (!canonicalId || canonicalId.length === 0) {
        throw new Error("Invalid canonical identity");
      }

      const engine = this.getEngine(command.tableId);

      // 1. Fetch required minimum from rejoin protection (5-min window)
      const rejoinMin = await cashRejoinManager.getRequiredBuyIn(canonicalId, command.tableId);

      // 2. Calculate buy-in based on table configuration and rejoin rules
      const requestedChips = command.chips;
      const recommendedBuyIn = getRecommendedBuyIn(command.tableId);
      
      const clampToConfig = (val: number) => {
        const validation = validateBuyIn(command.tableId, val, rejoinMin ?? undefined);
        if (validation.valid) return val;
        if (validation.suggested) return validation.suggested;
        throw new Error(validation.error || "Invalid buy-in amount");
      };
      
      const buyInChips = clampToConfig(
        typeof requestedChips === "number" ? requestedChips : recommendedBuyIn,
      );

      // Debit user balance into per-table escrow (ledger-first for cash)
      if (!this.ledgerService) {
        throw new Error("Ledger unavailable");
      }
      await this.ledgerService.buyIn(
        canonicalId,
        command.tableId,
        Asset.COINS,
        buyInChips,
      );

      // Push real-time balance update after buy-in
      void this.pushBalanceUpdate(canonicalId);
      // Push real-time status update
      void this.pushUserStatusUpdate(canonicalId);

      // Dispatch PlayerJoin event through FSM with canonical ID
      await engine.dispatch({
        t: "PlayerJoin",
        seat: command.seat,
        pid: canonicalId,
        chips: buyInChips,
        nickname: command.nickname || this.shortAddress(canonicalId),
      });

      // Update session state
      session.roomId = command.tableId;
      session.seat = command.seat;
      session.chips = buyInChips;
      session.userId = canonicalId; // CRITICAL: Set userId to canonical ID

      // Persist complete session with userId
      await saveSession(session);

      // Store seat mapping with canonical ID
      logger.info(
        `💺 [SIT] Storing seat mapping: ${canonicalId} -> seat ${command.seat} on table ${command.tableId}`,
      );
      globalSeatMappings.setSeatMapping(
        command.tableId,
        canonicalId,
        command.seat,
      );

      logger.info(
        `✅ Player ${canonicalId} successfully joined table ${command.tableId} at seat ${command.seat} with ${buyInChips} chips`,
      );
    } catch (error) {
      logger.error(`❌ SIT command failed:`, error);
      throw error; // Re-throw for higher level handler
    }
  }

  /**
   * Handle ACTION command with self-healing recovery
   */
  private async handleActionCommand(
    session: Session,
    command: any,
  ): Promise<void> {
    try {
      logger.info(
        `🎮 [ACTION] Starting action processing for session ${session.sessionId}, command: ${command.action}`,
      );
      logger.debug(
        `🔍 [ACTION] Session state: userId=${session.userId}, roomId=${session.roomId}, seat=${session.seat}`,
      );

      if (!session.roomId) {
        throw new Error("Player not in any room");
      }

      // Validate action
      const validActions = ["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALLIN"];
      if (!validActions.includes(command.action)) {
        throw new Error(`Invalid action: ${command.action}`);
      }

      // Validate amount for betting actions
      if (["BET", "RAISE"].includes(command.action)) {
        if (typeof command.amount !== "number" || command.amount <= 0) {
          throw new Error("Invalid amount for betting action");
        }
      }

      const engine = this.getEngine(session.roomId);

      // Use self-healing seat resolution
      logger.debug(
        `🔍 [ACTION] Resolving seat mapping for session ${session.sessionId}...`,
      );
      const seatId = await this.resolveSeatMapping(session, session.roomId, command);

      if (seatId === undefined) {
        logger.error(
          `❌ [ACTION] Seat resolution failed - session: ${session.sessionId}, userId: ${session.userId}, roomId: ${session.roomId}`,
        );
        // Log current seat mappings for debugging
        const mappings = globalSeatMappings.getTableMappings(session.roomId);
        logger.error(`💺 [ACTION] Current seat mappings:`, mappings);
        throw new Error("Player not found at table (no valid seat mapping)");
      }

      logger.info(
        `✅ [ACTION] Resolved seat ${seatId} for session ${session.sessionId}`,
      );

      // Professional normalization: treat BET as RAISE if a bet already exists
      try {
        const state = engine.getState();
        const seat = state.seats[seatId];
        const toCall = Math.max(
          0,
          state.currentBet - (seat?.streetCommitted || 0),
        );
        if (command.action === "BET" && state.currentBet > 0) {
          logger.debug(
            `🔁 [ACTION] Normalizing BET->RAISE (currentBet=${state.currentBet}, toCall=${toCall})`,
          );
          command.action = "RAISE";
        }
      } catch (e) {
        logger.warn(`⚠️ [ACTION] Failed to normalize action (using raw):`, e);
      }

      // Dispatch Action event through FSM
      await engine.dispatch({
        t: "Action",
        seat: seatId,
        action: command.action,
        amount: command.amount,
      });

      const canonicalId = await this.getCanonicalId(session);
      logger.debug(
        `🎮 Player ${canonicalId} executed ${command.action}${command.amount ? ` (${command.amount})` : ""} from seat ${seatId}`,
      );
    } catch (error) {
      logger.error(`❌ ACTION command failed:`, error);
      throw error;
    }
  }

  /**
   * Handle LEAVE command via FSM events
   */
  private async handleLeaveCommand(session: Session): Promise<void> {
    if (!session.roomId) return;

    const tableId = session.roomId;
    const tableType = this.resolveTableType(tableId);
    const engine = this.getEngine(tableId);
    const canonicalId = await this.getCanonicalId(session);
    const seatId = await this.resolveSeatMapping(session, tableId);

    if (seatId === undefined) return;

    // 1. Auto-fold if it's player's turn (professional poker rule)
    const tableState = engine.getState();
    if (
      tableState.actor === seatId &&
      ["preflop", "flop", "turn", "river"].includes(tableState.phase)
    ) {
      logger.info(
        `🚪 [WebSocket] Auto-folding ${canonicalId} before leaving (player's turn)`,
      );
      await engine.dispatch({
        t: "Action",
        seat: seatId,
        action: "FOLD",
      });
    }

    // 2. Tournament vs Cash behavior
    if (tableType === "stt" || tableType === "mtt") {
      // TOURNAMENT: "Leave" means sit-out and disconnect, but keep registration/seat
      logger.info(`🚪 [Tournament] Player ${canonicalId} performing temporary leave from ${tableId}`);
      
      // Dispatch SIT_OUT to engine so they don't hold up the game (will timeout/auto-fold)
      await engine.dispatch({
        t: "PlayerSitOut",
        seat: seatId,
        pid: canonicalId,
        reason: "voluntary",
      });

      // Clear session room/seat but DON'T remove from engine
      session.roomId = undefined;
      session.seat = undefined;
      
      // We don't remove mapping here because they might REATTACH
      // but we should probably mark it as 'away' if we had that state.
      // For now, just clearing session is enough to stop broadcasts.
    } else {
      // CASH: Hard exit - remove seat and refund
      logger.info(`🚪 [Cash] Player ${canonicalId} performing hard exit from ${tableId}`);

      const tableStateBeforeLeave = engine.getState();
      const seatBeforeLeave = tableStateBeforeLeave.seats[seatId];
      const remaining = seatBeforeLeave?.chips ?? 0;

      await engine.dispatch({
        t: "PlayerLeave",
        seat: seatId,
        pid: canonicalId,
      });

      // Refund remaining stack from escrow to user
      const config = getTableConfig(tableId);
      if (this.ledgerService && config) {
        try {
          if (remaining > 0) {
            // Record stack for rejoin protection (5-min window)
            if (canonicalId) {
              void cashRejoinManager.setLeftStack(canonicalId, tableId, remaining);
            }

            await this.ledgerService.refund(
              canonicalId,
              tableId,
              Asset.COINS,
              remaining,
            );
            // Push real-time balance update after refund
            void this.pushBalanceUpdate(canonicalId);
            // Push real-time status update
            void this.pushUserStatusUpdate(canonicalId);
          }
        } catch (err) {
          logger.error(`❌ Refund on leave failed for ${canonicalId} on ${tableId}:`, err);
        }
      }

      // Clean up mappings for cash exit
      globalSeatMappings.removePlayer(tableId, canonicalId);
      session.roomId = undefined;
      session.seat = undefined;
    }
  }

  /**
   * Handle sit out via SitOutManager integration with auto-fold
   */
  private async handleSitOutCommand(session: Session): Promise<void> {
    if (!session.roomId || session.seat === undefined) return;

    const canonicalId = await this.getCanonicalId(session);
    const engine = this.engines.get(session.roomId);

    if (!engine) {
      console.error(
        `❌ [WebSocket] No engine found for table ${session.roomId}`,
      );
      return;
    }

    // Professional poker: Auto-fold if player has active hand (following handleLeaveCommand pattern)
    const tableState = engine.getState();
    const seat = tableState.seats[session.seat];

    // Check if player needs to fold (has cards or is current actor)
    const needsFold =
      (seat?.holeCards && seat.holeCards.length > 0) ||
      tableState.actor === session.seat;

    if (
      needsFold &&
      ["preflop", "flop", "turn", "river"].includes(tableState.phase)
    ) {
      logger.info(
        `😴 [WebSocket] Auto-folding ${canonicalId} before sitting out (has active hand)`,
      );

      // Auto-fold first using existing Action event pattern
      await engine.dispatch({
        t: "Action",
        seat: session.seat,
        action: "FOLD",
      });
    }

    // Then dispatch PlayerSitOut event to FSM (authoritative path)
    await engine.dispatch({
      t: "PlayerSitOut",
      seat: session.seat,
      pid: canonicalId,
      reason: "voluntary",
    });

    // No direct broadcast of PLAYER_SIT_OUT; engine's stateChanged snapshot is the source of truth
  }

  /**
   * Handle sit in via SitOutManager integration
   */
  private async handleSitInCommand(session: Session): Promise<void> {
    if (!session.roomId || session.seat === undefined) return;

    const canonicalId = await this.getCanonicalId(session);
    const engine = this.engines.get(session.roomId);

    if (!engine) {
      console.error(
        `❌ [WebSocket] No engine found for table ${session.roomId}`,
      );
      return;
    }

    // Dispatch PlayerSitIn event to FSM (authoritative path)
    await engine.dispatch({
      t: "PlayerSitIn",
      seat: session.seat,
      pid: canonicalId,
    });
    // No direct broadcast; rely on engine's stateChanged snapshots
  }

  /**
   * Handle SHOW_CARDS command - reveal player's cards during showdown
   */
  private async handleShowCardsCommand(session: Session): Promise<void> {
    if (!session.roomId || session.seat === undefined) return;

    const canonicalId = await this.getCanonicalId(session);
    const engine = this.engines.get(session.roomId);

    if (!engine) {
      console.error(
        `❌ [WebSocket] No engine found for table ${session.roomId}`,
      );
      return;
    }

    // Get current table state to validate showdown context
    const tableState = engine.getState();
    const isValidPhase = ["showdown", "payout"].includes(tableState.phase);

    if (!isValidPhase) {
      logger.warn(
        `⚠️ [SHOW_CARDS] Invalid phase for showing cards: ${tableState.phase}`,
      );
      return;
    }

    // Validate player has cards to show (not folded and has hole cards)
    const seat = tableState.seats[session.seat];
    if (!seat || seat.status === "folded" || !seat.holeCards || seat.holeCards.length !== 2) {
      logger.warn(`⚠️ [SHOW_CARDS] No cards to show for ${canonicalId}`);
      return;
    }

    logger.info(
      `🃏 [SHOW_CARDS] Player ${canonicalId} revealing cards at seat ${session.seat}`,
    );

    // Dispatch PlayerShowCards to the engine (authoritative)
    await engine.dispatch({ t: "PlayerShowCards", pid: canonicalId });

    // Broadcast immediate reveal for UI responsiveness
    this.emit("broadcast", session.roomId, {
      type: "PLAYER_REVEALED",
      seat: session.seat,
      playerId: canonicalId,
    } as any);
  }

  /**
   * Handle MUCK_CARDS command - hide player's cards during showdown
   */
  private async handleMuckCardsCommand(session: Session): Promise<void> {
    if (!session.roomId || session.seat === undefined) return;

    const canonicalId = await this.getCanonicalId(session);
    const engine = this.engines.get(session.roomId);

    if (!engine) {
      console.error(
        `❌ [WebSocket] No engine found for table ${session.roomId}`,
      );
      return;
    }

    // Get current table state to validate showdown context
    const tableState = engine.getState();
    const isValidPhase = ["showdown", "payout"].includes(tableState.phase);

    if (!isValidPhase) {
      logger.warn(
        `⚠️ [MUCK_CARDS] Invalid phase for mucking cards: ${tableState.phase}`,
      );
      return;
    }

    // Validate player has cards to muck (not folded and has hole cards)
    const seat = tableState.seats[session.seat];
    if (!seat || seat.status === "folded" || !seat.holeCards || seat.holeCards.length !== 2) {
      logger.warn(`⚠️ [MUCK_CARDS] No cards to muck for ${canonicalId}`);
      return;
    }

    logger.info(
      `🃏 [MUCK_CARDS] Player ${canonicalId} mucking cards at seat ${session.seat}`,
    );

    // Showdown rule: winners cannot muck; losers may muck only if cards are not auto-revealed
    const winners = new Set(
      (engine.getState().winnersPids || []).map((p) => p.toLowerCase()),
    );
    const autoReveal = Boolean(engine.getState().autoRevealAll);
    if (autoReveal || winners.has(canonicalId.toLowerCase())) {
      logger.warn(`⚠️ [MUCK_CARDS] Winner ${canonicalId} cannot muck at showdown`);
      return;
    }

    // Dispatch PlayerMuckCards to the engine (authoritative)
    await engine.dispatch({ t: "PlayerMuckCards", pid: canonicalId });
  }

  /**
   * Start reconnect countdown for player
   */
  startReconnectCountdown(
    tableId: string,
    playerId: string,
    gracePeriodMs = 30000,
  ): void {
    const engine = this.engines.get(tableId);
    if (!engine) {
      console.error(`❌ [WebSocket] No engine found for table ${tableId}`);
      return;
    }

    // Emit reconnect countdown event
    engine.emit("reconnectCountdown", {
      type: "COUNTDOWN_START",
      countdownType: "reconnect",
      startTime: Date.now(),
      duration: gracePeriodMs,
      metadata: {
        playerId,
        reason: "connection_lost",
      },
    });

    console.log(
      `🔄 [WebSocket] Started reconnect countdown for ${playerId} (${gracePeriodMs}ms)`,
    );
  }

  /**
   * Close a table and cleanup resources
   */
  async closeTable(tableId: string): Promise<void> {
    const engine = this.engines.get(tableId);
    if (engine) {
      // Professional cleanup: Refund all seated players before destroying engine
      const table = engine.getState();
      const config = getTableConfig(tableId);
      
      for (const seat of table.seats) {
        if (!seat?.pid) continue;
        const pid = seat.pid;
        
        // 1. Optional Cash Refund
        if (this.ledgerService && config && seat.chips > 0) {
          try {
            const amount = seat.chips;
            await this.ledgerService.refund(pid, tableId, Asset.COINS, amount);
            logger.info(`💰 [Cleanup] Refunded ${amount} chips to ${pid} from closed table ${tableId}`);
            void this.pushBalanceUpdate(pid);
            void this.pushUserStatusUpdate(pid);
          } catch (err) {
            logger.error(`❌ [Cleanup] Failed to refund ${pid} on table close:`, err);
          }
        }

        // 2. Authoritative Seat Cleanup (Always)
        try {
          globalSeatMappings.removePlayer(tableId, pid);
          logger.debug(`🧹 [Cleanup] Removed seat mapping for ${pid} from ${tableId}`);
        } catch (err) {
          logger.error(`❌ [Cleanup] Failed to remove mapping for ${pid}:`, err);
        }
      }

      // Force shutdown of any attached timers
      try {
        // @ts-ignore - accessing internal timer manager if exposed or just letting GC handle it
        // The TimerIntegration handles its own cleanup if we stop referencing it, 
        // but explicit cleanup is better. 
        // Current Engine doesn't expose explicit destroy().
      } catch (e) {}
      this.engines.delete(tableId);
      this.tableMaxPlayers.delete(tableId);
      this.botManager?.setTableStyle(tableId, { style: "random" }); // Reset bot style
      await removeRoom(tableId);
      logger.info(`🗑️ Closed table ${tableId}`);
      this.broadcastTableList();
    }
  }

  /**
   * Get current table state from FSM
   */
  getTableState(tableId: string): Table {
    const engine = this.engines.get(tableId);
    if (!engine) {
      throw new Error(`Table ${tableId} not found`);
    }
    return engine.getState();
  }

  /**
   * Broadcast updated table list to all connected clients
   */
  private broadcastTableList() {
    this.emit("broadcastAll", {
      tableId: "",
      type: "TABLE_LIST",
      tables: this.getTables(),
    });
  }

  /**
   * Get all tables for lobby with enhanced information
   */
  getTables(): LobbyTable[] {
    // Ensure capacity: if all instances of a config are full, spin up another
    listTableConfigs().forEach((cfg) => {
      const matchingIds = Array.from(this.engines.keys()).filter(
        (id) => id === cfg.id || id.startsWith(`${cfg.id}-`),
      );
      const hasOpenSeat = matchingIds.some((id) => {
        const engine = this.engines.get(id);
        if (!engine) return false;
        const table = engine.getState();
        const maxPlayers = this.resolveMaxPlayers(id, table);
        const occupied = table.seats.filter((s) => s.pid).length;
        return occupied < maxPlayers;
      });

      if (!hasOpenSeat) {
        const nextIndex = matchingIds.length + 1;
        const newId = `${cfg.id}-${nextIndex}`;
        logger.info(
          `🆕 No open seats for ${cfg.id}; creating additional table ${newId}`,
        );
        this.getEngine(newId, cfg.blinds.small, cfg.blinds.big);
      }
    });

    return Array.from(this.engines.entries()).map(([id, engine]) => {
      const table = engine.getState();
      const config = getTableConfig(id);

      return {
        id,
        name: config?.name ?? `Table ${id}`,
        gameType: "No Limit Hold'em",
        playerCount: table.seats.filter((s) => s.pid).length,
        maxPlayers: this.resolveMaxPlayers(id, table),
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        stakeLevel: config?.stakeLevel,
        tableType: this.resolveTableType(id),
        buyIn: config
          ? {
              min: config.buyIn.min,
              max: config.buyIn.max,
              default: config.buyIn.default,
            }
          : undefined,
      };
    });
  }

  /**
   * Utility functions
   */
  private normalizePlayerId(playerId: string): string {
    return playerId.toLowerCase().trim();
  }

  /**
   * Get revealed player IDs for a specific table
   */
  getRevealedPids(tableId: string): Set<string> {
    const engine = this.engines.get(tableId);
    if (!engine) return new Set<string>();
    return new Set((engine.getState().revealedPids || []).map((p) => p.toLowerCase()));
  }

  private shortAddress(address: string): string {
    return address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;
  }

  async pushBalanceUpdate(playerId: string) {
    if (!this.ledgerService) return;
    try {
      const { account } = await this.ledgerService.getBalanceForWallet(playerId);
      if (!account) return;

      const event: ServerEvent = {
        tableId: "",
        type: "BALANCE_UPDATE",
        playerId,
        coins: account.coins.toString(),
        tickets: {
          ticket_x: account.ticket_x.toString(),
          ticket_y: account.ticket_y.toString(),
          ticket_z: account.ticket_z.toString(),
        },
      };

      // Broadcast to all sessions for this player
      this.sessions.getAllSessions().forEach((s) => {
        if (
          s.userId?.toLowerCase() === playerId.toLowerCase() &&
          s.socket.readyState === WebSocket.OPEN
        ) {
          s.socket.send(JSON.stringify(event, bigIntReplacer));
        }
      });
      logger.debug(`💰 [Balance] Pushed update to ${playerId}`);
    } catch (err) {
      logger.error(`❌ Failed to push balance update for ${playerId}:`, err);
    }
  }

  async pushUserStatusUpdate(playerId: string) {
    if (!this.prisma) return;
    try {
      const registrations = await this.prisma.tournamentRegistration.findMany({
        where: {
          playerId: { equals: playerId, mode: "insensitive" },
          status: { in: ["REGISTERED", "SEATED"] },
          tournament: {
            status: {
              in: [
                "REGISTERING",
                "SCHEDULED",
                "RUNNING",
                "LATE_REG",
                "BREAKING",
              ],
            },
          },
        },
        select: {
          tournament: { select: { type: true } },
        },
      });
      const sngActive = registrations.some((r) => r.tournament.type === "STT");
      const mttActive = registrations.some((r) => r.tournament.type === "MTT");

      const cashTableIds = globalSeatMappings
        .getTablesForPlayer(playerId)
        .filter((tableId) => !/^(mtt|stt)-/i.test(tableId));
      const cashActive = cashTableIds.length > 0;

      const event: ServerEvent = {
        tableId: "",
        type: "USER_STATUS_UPDATE",
        playerId,
        cashActive,
        cashTableIds,
        sngActive,
        mttActive,
      };

      // Broadcast to all sessions for this player
      this.sessions.getAllSessions().forEach((s) => {
        if (
          s.userId?.toLowerCase() === playerId.toLowerCase() &&
          s.socket.readyState === WebSocket.OPEN
        ) {
          s.socket.send(JSON.stringify(event, bigIntReplacer));
        }
      });
      logger.debug(`📡 [Status] Pushed update to ${playerId}`);
    } catch (err) {
      logger.error(`❌ Failed to push status update for ${playerId}:`, err);
    }
  }
}

export { WebSocketFSMBridge };
