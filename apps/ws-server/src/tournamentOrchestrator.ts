import { randomUUID } from "crypto";
import { logger } from "@hyper-poker/engine/utils/logger";
import { getFirstLevel, BLIND_SCHEDULES } from "./blindSchedules";
import type { TournamentManager, TournamentState } from "./tournamentManager";
import type { WebSocketFSMBridge } from "./pokerWebSocketServer";
import { computeBalanceMoves } from "./tournamentBalancing";
import { seatPlayersAtTable } from "./tournamentSeating";
import type { TournamentSeat } from "./tournamentTypes";
import { LevelTimer } from "./tournamentLevels";
import { TournamentPayoutEntry } from "./tournamentTypes";
import { calculatePayouts } from "./tournamentPayouts";

/**
 * TournamentOrchestrator manages table creation and start triggers for SNG/MTT.
 * This is an initial implementation that starts tournaments and allocates tables;
 * seating/balancing hooks will be expanded as engine integrations allow.
 */
export class TournamentOrchestrator {
  constructor(
    private manager: TournamentManager,
    private bridge: WebSocketFSMBridge,
    private levels = new LevelTimer(bridge, (id, level) => this.advanceLevel(id, level)),
    private broadcastAll: (event: any) => void = (event) => this.bridge.emit("broadcastAll", event),
    private onPayouts?: (tournamentId: string, payouts: TournamentPayoutEntry[]) => void,
  ) {}

  private botCounter = 0;

  private nextBotId(): string {
    const suffix = (this.botCounter++).toString().padStart(5, "0");
    return `bot_00000${suffix}`;
  }

  private spawnReplacementSng(template: TournamentState) {
    try {
      const newId = `${template.id}-${randomUUID()}`;
      const def = {
        id: newId,
        name: template.name,
        gameType: template.gameType || "No Limit Hold'em",
        type: "stt" as const,
        startMode: template.startMode,
        buyIn: template.buyIn,
        maxPlayers: template.maxPlayers,
        startingStack: template.startingStack,
        blindScheduleId: template.blindScheduleId,
        payout: template.payout,
        tableConfigId: template.tableConfigId,
        description: template.description,
      };
      const state = this.manager.createTournament(def);
      this.broadcastTournamentUpdate(state.id);
      logger.info(`🆕 Spawned new SNG ${state.id} (replacement for ${template.id})`);
    } catch (err) {
      logger.error(`❌ Failed to spawn replacement SNG for ${template.id}`, err);
    }
  }

  /**
   * Call when a registration is added to see if a tournament should start.
   */
  async handleRegistration(tournamentId: string) {
    const t = this.manager.getState(tournamentId);
    if (!t) return;

    if (t.type === "stt" && t.startMode === "full" && t.registered.size >= t.maxPlayers) {
      this.startSitAndGo(t);
    }

    if (t.type === "mtt" && t.startMode === "scheduled" && t.startAt) {
      const startTs = Date.parse(t.startAt);
      if (!Number.isNaN(startTs) && startTs <= Date.now()) {
        await this.startMtt(t);
      }
    }

    // Late reg seating: if running and late reg window open, seat immediately
    if (t.type === "mtt" && t.status === "running" && this.isLateRegOpen(t)) {
      const openTable = this.findTableWithSeat(t);
      if (openTable) {
        this.seatAndBroadcast(t, openTable, [Array.from(t.registered).slice(-1)[0]]);
        await this.balanceIfNeeded(t);
        this.broadcastTournamentUpdate(t.id);
      } else {
        // create new table if capacity allows
        const level = getFirstLevel(t.blindScheduleId);
        const tableId = this.createTournamentTable(t.id, level?.sb, level?.bb);
        if (tableId) {
          this.manager.addTable(t.id, tableId);
          this.seatAndBroadcast(t, tableId, [Array.from(t.registered).slice(-1)[0]]);
          await this.balanceIfNeeded(t);
          this.broadcastTournamentUpdate(t.id);
        }
      }
    }
  }

  /**
   * For scheduled MTTs, call periodically to trigger start when time arrives.
   * Also cleans up bot-only SNGs.
   */
  async checkScheduled() {
    const now = Date.now();
    await this.checkBotOnlyTournaments();
    
    const states = this.manager.listStates();
    for (const t of states) {
      if (t.type === "mtt" && t.startMode === "scheduled" && t.startAt && t.status !== "running") {
        const startTs = Date.parse(t.startAt);
        if (!Number.isNaN(startTs) && startTs <= now) {
          await this.startMtt(t);
        }
      }
    }
  }

  private async checkBotOnlyTournaments() {
    const states = this.manager.listStates();
    for (const t of states) {
      // Only clean up running STTs that have started (registered > 0)
      if (t.type === "stt" && t.status === "running" && t.registered.size > 0) {
        const humans = Array.from(t.registered).filter((pid) => !pid.toLowerCase().startsWith("bot_"));
        if (humans.length === 0) {
          logger.info(`🤖 Closing bot-only SNG ${t.id} (no humans remaining)`);
          
          // 1. Close tables and update metadata
          await Promise.all(t.tables.map(async (tableId) => {
            await this.bridge.closeTable(tableId);
            await this.manager.removeTable(t.id, tableId);
          }));

          // 2. Stop timers
          this.levels.clear(t.id);

          // 3. Cancel tournament
          const cancelled = await this.manager.cancelTournament(t.id);
          if (cancelled) {
            this.broadcastAll({
              tableId: "",
              type: "TOURNAMENT_UPDATED",
              tournament: this.manager.toPublic(cancelled),
            });
          }
        }
      }
    }
  }

  /**
   * Startup routine: Ensure every SNG template has at least one active instance.
   */
  spawnInitialInstances() {
    const templates = this.manager.listStates().filter((t) => t.status === "template" && t.type === "stt");
    templates.forEach((template) => {
      const activeInstances = this.manager.listStates().filter(
        (t) => t.name === template.name && (t.status === "registering" || t.status === "running")
      );
      
      if (activeInstances.length === 0) {
        logger.info(`🌱 Spawning initial instance for template: ${template.name}`);
        this.spawnReplacementSng(template);
      }
    });
  }

  async startSitAndGoWithBots(tournamentId: string): Promise<{ ok: boolean; message?: string }> {
    const t = this.manager.getState(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    if (t.type !== "stt") return { ok: false, message: "Bots only allowed for SNG" };
    if (t.status === "running") return { ok: false, message: "Tournament already running" };
    if (t.registered.size === 0) return { ok: false, message: "Need at least one human to start" };

    const botsNeeded = Math.max(0, t.maxPlayers - t.registered.size);
    const botIds = Array.from({ length: botsNeeded }, () => this.nextBotId());
    await this.startSitAndGo(t, botIds);
    this.spawnReplacementSng(t);
    return { ok: true };
  }

  private async startSitAndGo(t: TournamentState, extraPlayers: string[] = []) {
    logger.info(`🎬 Starting SNG ${t.id}${extraPlayers.length ? ` with ${extraPlayers.length} bot(s)` : ""}`);
    const updated: TournamentState =
      extraPlayers.length > 0
        ? { ...t, registered: new Set([...t.registered, ...extraPlayers]) }
        : t;
    this.manager.upsertState(updated);
    const level = getFirstLevel(updated.blindScheduleId);
    const tableId = this.createTournamentTable(updated.id, level?.sb, level?.bb);
    if (tableId) {
      this.manager.markRunning(updated.id);
      this.manager.addTable(updated.id, tableId);
      await this.seatAndBroadcast(updated, tableId, Array.from(updated.registered));
      this.configureBotStyle(tableId);
      this.levels.start(updated);
      this.broadcastTournamentUpdate(updated.id);
      // Prepare the next instance if this was auto-started by filling seats
      if (extraPlayers.length === 0) {
        this.spawnReplacementSng(t);
      }
    }
  }

  private async startMtt(t: TournamentState) {
    const minPlayers = Math.ceil(t.maxPlayers * 0.05);
    if (t.registered.size < minPlayers) {
      logger.info(`🛑 Cancelling MTT ${t.id} (not enough registrations: ${t.registered.size}/${minPlayers})`);
      void (async () => {
        // Refund all players before cancelling
        const pids = Array.from(t.registered);
        for (const pid of pids) {
          try {
            const asset = t.buyIn.currency === "tickets" ? "TICKET_X" : "COINS";
            // @ts-ignore - LedgerPort might need Asset cast
            await this.bridge.getLedger()?.refund(pid, t.id, asset, t.buyIn.amount);
          } catch (err) {
            logger.error(`❌ Failed to refund ${pid} for MTT ${t.id}`, err);
          }
        }

        const cancelled = await this.manager.cancelTournament(t.id);
        if (cancelled) {
          this.broadcastAll({
            tableId: "",
            type: "TOURNAMENT_UPDATED",
            tournament: this.manager.toPublic(cancelled),
          });
        }
        const created = this.manager.ensureDailyMttSchedule();
        created.forEach((next) => {
          this.broadcastAll({
            tableId: "",
            type: "TOURNAMENT_UPDATED",
            tournament: this.manager.toPublic(next),
          });
        });
      })();
      return;
    }

    logger.info(`🎬 Starting MTT ${t.id}`);
    const level = getFirstLevel(t.blindScheduleId);
    const initialTableId = this.createTournamentTable(t.id, level?.sb, level?.bb);
    if (initialTableId) {
      this.manager.markRunning(t.id);
      this.manager.addTable(t.id, initialTableId);
    }
    // Compute late-reg end if not already set
    if (t.startAt && t.lateRegMinutes && !t.lateRegEndAt) {
      const start = Date.parse(t.startAt);
      if (!Number.isNaN(start)) {
        t.lateRegEndAt = new Date(start + t.lateRegMinutes * 60_000).toISOString();
        this.manager.upsertState({ ...t });
      }
    }
    await this.seatAndBroadcast(t, initialTableId!, Array.from(t.registered));
    await this.balanceIfNeeded(t);
    this.levels.start(t);
    this.broadcastTournamentUpdate(t.id);
  }

  private configureBotStyle(tableId: string) {
    try {
      // Simple mapping: default random for now; could be stake-based later
      this.bridge.setBotStyle?.(tableId, { style: "random" });
    } catch (err) {
      logger.error(`❌ Failed to configure bot style for ${tableId}`, err);
    }
  }

  private broadcastTournamentUpdate(tournamentId: string) {
    const pub = this.manager.get(tournamentId);
    if (pub) {
      this.broadcastAll({
        tableId: "",
        type: "TOURNAMENT_UPDATED",
        tournament: pub,
      });
    }
  }

  private createTournamentTable(tournamentId: string, sb = 25, bb = 50): string | null {
    try {
      const engineTableId = `${tournamentId}-${randomUUID()}`;
      // Create engine table with provided blinds
      this.bridge.getEngine(engineTableId, sb, bb);
      const state = this.manager.getState(tournamentId);
      if (state?.maxPlayers) {
        this.bridge.setTableMaxPlayers(engineTableId, state.maxPlayers);
      }
      logger.info(`✅ Created tournament table ${engineTableId} for ${tournamentId} (${sb}/${bb})`);
      return engineTableId;
    } catch (err) {
      logger.error(`❌ Failed to create table for tournament ${tournamentId}`, err);
      return null;
    }
  }

  private async seatAndBroadcast(t: TournamentState, tableId: string, playerIds: string[]) {
    if (!playerIds.length) return;
    const seats: TournamentSeat[] = await seatPlayersAtTable(
      this.bridge,
      t,
      tableId,
      playerIds,
      t.startingStack,
    );
    if (!seats.length) return;

    // Broadcast seat assignments
    seats.forEach((s) => {
      this.broadcastAll({
        tableId: s.tableId,
        type: "TOURNAMENT_SEAT",
        tournamentId: t.id,
        seatIndex: s.seatIndex,
        playerId: s.playerId,
      } as any);

      // Persist SEATED status in DB
      void this.manager.markSeated(t.id, s.playerId, s.tableId, s.seatIndex);

      // Persist seating state for reconnects
      this.manager.upsertState({
        ...t,
        registered: new Set(t.registered),
      });
    });
  }

  private async balanceIfNeeded(t: TournamentState) {
    const tableSeatCounts: Record<string, number> = {};
    t.tables.forEach((tableId) => {
      try {
        const table = this.bridge.getEngine(tableId).getState();
        tableSeatCounts[tableId] = table.seats.filter((s) => s?.pid).length;
      } catch {
        tableSeatCounts[tableId] = 0;
      }
    });
    const moves = computeBalanceMoves(t, tableSeatCounts);
    for (const m of moves) {
      // Pick a candidate player from the fullest table (last seated for now)
      try {
        const table = this.bridge.getEngine(m.fromTable).getState();
        const occupant = [...table.seats]
          .reverse()
          .find((s) => s?.pid);
        if (!occupant?.pid) continue;
        // Sit them at emptiest table
        const target = this.bridge.getEngine(m.toTable).getState();
        const emptySeat = target.seats.findIndex((s) => !s?.pid);
        if (emptySeat < 0) continue;
        // Leave origin seat
        await this.bridge.getEngine(m.fromTable).dispatch({
          t: "PlayerLeave",
          seat: occupant.id,
          pid: occupant.pid,
        } as any);
        // Join target seat
        await this.bridge.getEngine(m.toTable).dispatch({
          t: "PlayerJoin",
          seat: emptySeat,
          pid: occupant.pid,
          chips: occupant.chips,
          nickname: occupant.nickname || occupant.pid.slice(0, 10),
        } as any);

        this.broadcastAll({
          tableId: m.toTable,
          type: "TOURNAMENT_SEAT",
          tournamentId: t.id,
          seatIndex: emptySeat,
          playerId: occupant.pid,
        } as any);

        // Update SEATED status in DB
        void this.manager.markSeated(t.id, occupant.pid, m.toTable, emptySeat);
      } catch (err) {
        logger.error(`❌ Failed to balance tables for ${t.id}`, err);
      }
    }

    // Table break: if a table has <=1 player and more than one table exists, move and close it
    const tableEntries = Object.entries(tableSeatCounts);
    if (tableEntries.length > 1) {
      const candidates = tableEntries.filter(([, count]) => count <= 1);
      for (const [tableId] of candidates) {
          try {
            const table = this.bridge.getEngine(tableId).getState();
            const lone = table.seats.find((s) => s?.pid);
            const targetId = tableEntries
              .filter(([id, count]) => id !== tableId && count > 0)
              .sort((a, b) => b[1] - a[1])[0]?.[0];
            if (lone?.pid && targetId) {
              const target = this.bridge.getEngine(targetId).getState();
              const emptySeat = target.seats.findIndex((s) => !s?.pid);
              if (emptySeat >= 0) {
                await this.bridge.getEngine(tableId).dispatch({ t: "PlayerLeave", seat: lone.id, pid: lone.pid } as any);
                await this.bridge.getEngine(targetId).dispatch({
                  t: "PlayerJoin",
                  seat: emptySeat,
                  pid: lone.pid,
                  chips: lone.chips,
                  nickname: lone.nickname || lone.pid.slice(0, 10),
                } as any);
                this.broadcastAll({
                  tableId: targetId,
                  type: "TOURNAMENT_SEAT",
                  tournamentId: t.id,
                  seatIndex: emptySeat,
                  playerId: lone.pid,
                } as any);

                // Update SEATED status in DB
                void this.manager.markSeated(t.id, lone.pid, targetId, emptySeat);
              }
            }
            // Explicitly close engine before removing from tournament
            await this.bridge.closeTable(tableId);
            await this.manager.removeTable(t.id, tableId);
            this.broadcastTournamentUpdate(t.id);
          } catch (err) {
            logger.error(`❌ Failed to break table ${tableId} for ${t.id}`, err);
          }
      }
    }
  }

  private advanceLevel(tournamentId: string, levelIndex: number) {
    const t = this.manager.getState(tournamentId);
    if (!t) return;
    const scheduleArr = t.blindScheduleId ? BLIND_SCHEDULES[t.blindScheduleId] : undefined;
    const lvl = scheduleArr?.find((l) => l.level === levelIndex);
    if (!lvl) return;

    // Update tables with new blinds
    t.tables.forEach((tableId) => {
      try {
        const engine = this.bridge.getEngine(tableId);
        engine.dispatch({ t: "UpdateBlinds", smallBlind: lvl.sb, bigBlind: lvl.bb } as any);
        logger.info(`⬆️ Updated blinds for ${tableId} to ${lvl.sb}/${lvl.bb} (level ${levelIndex})`);
      } catch (err) {
        logger.error(`❌ Failed to advance level ${levelIndex} for ${tableId}`, err);
      }
    });

    // Persist current level on the state map
    const updated: TournamentState = {
      ...t,
      currentLevel: levelIndex,
    };
    this.manager.upsertState(updated);
    this.broadcastAll({
      tableId: "",
      type: "TOURNAMENT_UPDATED",
      tournament: this.manager.get(tournamentId),
    } as any);
  }

  private isLateRegOpen(t: TournamentState): boolean {
    if (!t.startAt || !t.lateRegMinutes) return false;
    const start = Date.parse(t.startAt);
    if (Number.isNaN(start)) return false;
    const cutoff = start + t.lateRegMinutes * 60_000;
    return Date.now() < cutoff;
  }

  private findTableWithSeat(t: TournamentState): string | null {
    for (const tableId of t.tables) {
      try {
        const engine = this.bridge.getEngine(tableId);
        const table = engine.getState();
        const hasSeat = table.seats.some((s) => !s?.pid);
        if (hasSeat) return tableId;
      } catch {
        continue;
      }
    }
    return null;
  }

  async handleBust(tableId: string, playerId: string) {
    // Remove from registrations and rebalance; finalize if only one remains
    const t = this.manager.listStates().find((tt) => tt.tables.includes(tableId));
    if (!t) return;
    t.registered.delete(playerId);
    if (!t.bustedIds) t.bustedIds = new Set();
    t.bustedIds.add(playerId);
    const position = t.registered.size + 1;
    const payouts = t.payouts ? [...t.payouts] : [];
    payouts.unshift({
      playerId,
      position,
      amount: 0,
      currency: t.buyIn.currency,
    });
    t.payouts = payouts;
    await this.manager.persistBust(t.id, playerId, position);
    this.broadcastTournamentUpdate(t.id);
    if (t.registered.size <= 1) {
      await this.finishTournament(t);
      return;
    }
    await this.balanceIfNeeded(t);
  }

  private async finishTournament(t: TournamentState) {
    // Explicitly stop any level timers
    this.levels.clear(t.id);

    // Explicitly close all remaining tables to ensure DB consistency
    await Promise.all(
      t.tables.map(async (tableId) => {
        await this.bridge.closeTable(tableId);
        await this.manager.removeTable(t.id, tableId);
      })
    );

    const winners = Array.from(t.registered);
    // recorded busts are losers first; reverse to get finish order
    const losers = (t.payouts || []).map((p) => p.playerId).filter(Boolean).reverse();
    const finishOrder = winners.concat(losers);
    const payouts: TournamentPayoutEntry[] = calculatePayouts(t, finishOrder);
    this.manager.markFinished(t.id);
    void this.manager.persistPayouts(t.id, payouts);
    this.manager.upsertState({ ...t, payouts });
    this.broadcastAll({
      tableId: "",
      type: "TOURNAMENT_PAYOUTS",
      tournamentId: t.id,
      payouts,
    } as any);
    if (this.onPayouts) {
      this.onPayouts(t.id, payouts);
    }
  }
}
