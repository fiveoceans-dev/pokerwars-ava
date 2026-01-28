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
 * TournamentOrchestrator manages table creation and start triggers for S&G/MTT.
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
      logger.info(`🆕 Spawned new S&G ${state.id} (replacement for ${template.id})`);
    } catch (err) {
      logger.error(`❌ Failed to spawn replacement S&G for ${template.id}`, err);
    }
  }

  /**
   * Call when a registration is added to see if a tournament should start.
   */
  handleRegistration(tournamentId: string) {
    const t = this.manager.getState(tournamentId);
    if (!t) return;

    if (t.type === "stt" && t.startMode === "full" && t.registered.size >= t.maxPlayers) {
      this.startSitAndGo(t);
    }

    if (t.type === "mtt" && t.startMode === "scheduled" && t.startAt) {
      const startTs = Date.parse(t.startAt);
      if (!Number.isNaN(startTs) && startTs <= Date.now()) {
        this.startMtt(t);
      }
    }

    // Late reg seating: if running and late reg window open, seat immediately
    if (t.type === "mtt" && t.status === "running" && this.isLateRegOpen(t)) {
      const openTable = this.findTableWithSeat(t);
      if (openTable) {
        this.seatAndBroadcast(t, openTable, [Array.from(t.registered).slice(-1)[0]]);
        this.balanceIfNeeded(t);
      } else {
        // create new table if capacity allows
        const level = getFirstLevel(t.blindScheduleId);
        const tableId = this.createTournamentTable(t.id, level?.sb, level?.bb);
        if (tableId) {
          this.manager.addTable(t.id, tableId);
          this.seatAndBroadcast(t, tableId, [Array.from(t.registered).slice(-1)[0]]);
          this.balanceIfNeeded(t);
        }
      }
    }
  }

  /**
   * For scheduled MTTs, call periodically to trigger start when time arrives.
   */
  checkScheduled() {
    const now = Date.now();
    this.manager.listStates().forEach((t) => {
      if (t.type === "mtt" && t.startMode === "scheduled" && t.startAt && t.status !== "running") {
        const startTs = Date.parse(t.startAt);
        if (!Number.isNaN(startTs) && startTs <= now) {
          this.startMtt(t);
        }
      }
    });
  }

  startSitAndGoWithBots(tournamentId: string): { ok: boolean; message?: string } {
    const t = this.manager.getState(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    if (t.type !== "stt") return { ok: false, message: "Bots only allowed for S&G" };
    if (t.status === "running") return { ok: false, message: "Tournament already running" };
    if (t.registered.size === 0) return { ok: false, message: "Need at least one human to start" };

    const botsNeeded = Math.max(0, t.maxPlayers - t.registered.size);
    const botIds = Array.from({ length: botsNeeded }, () => this.nextBotId());
    this.startSitAndGo(t, botIds);
    this.spawnReplacementSng(t);
    return { ok: true };
  }

  private startSitAndGo(t: TournamentState, extraPlayers: string[] = []) {
    logger.info(`🎬 Starting S&G ${t.id}${extraPlayers.length ? ` with ${extraPlayers.length} bot(s)` : ""}`);
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
      this.seatAndBroadcast(updated, tableId, Array.from(updated.registered));
      this.configureBotStyle(tableId);
      this.levels.start(updated);
      this.broadcastTournamentUpdate(updated.id);
      // Prepare the next instance if this was auto-started by filling seats
      if (extraPlayers.length === 0) {
        this.spawnReplacementSng(t);
      }
    }
  }

  private startMtt(t: TournamentState) {
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
    this.seatAndBroadcast(t, initialTableId, Array.from(t.registered));
    this.balanceIfNeeded(t);
    this.levels.start(t);
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
      logger.info(`✅ Created tournament table ${engineTableId} for ${tournamentId} (${sb}/${bb})`);
      return engineTableId;
    } catch (err) {
      logger.error(`❌ Failed to create table for tournament ${tournamentId}`, err);
      return null;
    }
  }

  private seatAndBroadcast(t: TournamentState, tableId: string, playerIds: string[]) {
    if (!playerIds.length) return;
    const seats: TournamentSeat[] = seatPlayersAtTable(
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
      // Persist seating state for reconnects
      this.manager.upsertState({
        ...t,
        registered: new Set(t.registered),
      });
    });
  }

  private balanceIfNeeded(t: TournamentState) {
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
    moves.forEach((m) => {
      // Pick a candidate player from the fullest table (last seated for now)
      try {
        const table = this.bridge.getEngine(m.fromTable).getState();
        const occupant = [...table.seats]
          .reverse()
          .find((s) => s?.pid);
        if (!occupant?.pid) return;
        // Sit them at emptiest table
        const target = this.bridge.getEngine(m.toTable).getState();
        const emptySeat = target.seats.findIndex((s) => !s?.pid);
        if (emptySeat < 0) return;
        // Leave origin seat
        this.bridge.getEngine(m.fromTable).dispatch({
          t: "PlayerLeave",
          seat: occupant.id,
          pid: occupant.pid,
        } as any);
        // Join target seat
        this.bridge.getEngine(m.toTable).dispatch({
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
      } catch (err) {
        logger.error(`❌ Failed to balance tables for ${t.id}`, err);
      }
    });

    // Table break: if a table has <=1 player and more than one table exists, move and close it
    const tableEntries = Object.entries(tableSeatCounts);
    if (tableEntries.length > 1) {
      tableEntries
        .filter(([, count]) => count <= 1)
        .forEach(([tableId]) => {
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
                this.bridge.getEngine(tableId).dispatch({ t: "PlayerLeave", seat: lone.id, pid: lone.pid } as any);
                this.bridge.getEngine(targetId).dispatch({
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
              }
            }
            this.manager.removeTable(t.id, tableId);
          } catch (err) {
            logger.error(`❌ Failed to break table ${tableId} for ${t.id}`, err);
          }
        });
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

  handleBust(tableId: string, playerId: string) {
    // Remove from registrations and rebalance; finalize if only one remains
    const t = this.manager.listStates().find((tt) => tt.tables.includes(tableId));
    if (!t) return;
    t.registered.delete(playerId);
    const position = t.registered.size + 1;
    const payouts = t.payouts ? [...t.payouts] : [];
    payouts.unshift({
      playerId,
      position,
      amount: 0,
      currency: t.buyIn.currency,
    });
    t.payouts = payouts;
    void this.manager.persistBust(t.id, playerId, position);
    if (t.registered.size <= 1) {
      this.finishTournament(t);
      return;
    }
    this.balanceIfNeeded(t);
  }

  private finishTournament(t: TournamentState) {
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
