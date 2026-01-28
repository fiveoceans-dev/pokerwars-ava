import fs from "fs";
import path from "path";
import { logger } from "@hyper-poker/engine/utils/logger";
import type {
  PrismaClient,
  Tournament as DbTournament,
  TournamentRegistration as DbRegistration,
  TournamentLevel as DbLevel,
  TournamentTable as DbTable,
} from "@prisma/client";

export type TournamentType = "stt" | "mtt";
export type TournamentStartMode = "full" | "scheduled";
export type TournamentStatus = "registering" | "scheduled" | "running" | "finished" | "cancelled";

export type TournamentPayoutMode = "top_x_split" | "tickets";

export interface TournamentPayout {
  mode: TournamentPayoutMode;
  topX?: number;
  ticketCount?: number;
}

export interface TournamentBuyIn {
  currency: "chips" | "tickets";
  amount: number;
}

export interface TournamentDefinition {
  id: string;
  name: string;
  type: TournamentType;
  startMode: TournamentStartMode;
  startAt?: string; // ISO string for scheduled MTTs
  buyIn: TournamentBuyIn;
  lateRegMinutes?: number;
  maxPlayers: number;
  startingStack: number;
  blindScheduleId?: string;
  payout: TournamentPayout;
  tableConfigId?: string;
  description?: string;
}

export interface TournamentState extends TournamentDefinition {
  status: TournamentStatus;
  registered: Set<string>;
  tables: string[]; // table IDs allocated to the tournament
  createdAt: string;
  updatedAt: string;
  lateRegEndAt?: string;
  currentLevel?: number;
  payouts?: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[];
  entrants?: number;
}

export interface PublicTournamentState extends Omit<TournamentState, "registered" | "tables"> {
  registeredCount: number;
  tables: string[];
  lateRegEndAt?: string;
  currentLevel?: number;
  payouts?: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[];
}

export type RegistrationStatus = "REGISTERED" | "SEATED" | "BUSTED" | "CASHED";

const defaultTournaments: TournamentDefinition[] = [
  {
    id: "stt-daily-1",
    name: "Daily Sit & Go",
    type: "stt",
    startMode: "full",
    buyIn: { currency: "chips", amount: 100 },
    maxPlayers: 9,
    startingStack: 5000,
    blindScheduleId: "default-stt",
    payout: { mode: "top_x_split", topX: 3 },
    tableConfigId: "mid",
  },
  {
    id: "stt-daily-6max",
    name: "Daily Sit & Go (6-max)",
    type: "stt",
    startMode: "full",
    buyIn: { currency: "chips", amount: 100 },
    maxPlayers: 6,
    startingStack: 5000,
    blindScheduleId: "default-stt",
    payout: { mode: "top_x_split", topX: 2 },
    tableConfigId: "mid",
  },
  {
    id: "mtt-prime-1",
    name: "Prime Time MTT",
    type: "mtt",
    startMode: "scheduled",
    startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    buyIn: { currency: "chips", amount: 5000 },
    lateRegMinutes: 120,
    maxPlayers: 540,
    startingStack: 15000,
    blindScheduleId: "default-mtt",
    payout: { mode: "top_x_split", topX: 54 },
    tableConfigId: "mid",
  },
];

function normalizeDefinitions(defs: TournamentDefinition[]): TournamentState[] {
  const now = new Date().toISOString();
  return defs.map((def) => ({
    ...def,
    status: def.startMode === "scheduled" ? "scheduled" : "registering",
    registered: new Set<string>(),
    tables: [],
    createdAt: now,
    updatedAt: now,
  }));
}

export function loadTournamentDefinitions(): TournamentState[] {
  const configPath =
    process.env.TOURNAMENT_CONFIG_PATH ||
    path.join(process.cwd(), "apps", "ws-server", "tournaments.json");

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as TournamentDefinition[];
      logger.info(`🎯 Loaded tournament config from ${configPath} (${parsed.length} entries)`);
      return normalizeDefinitions(parsed);
    }
    logger.warn(`⚠️ Tournament config not found at ${configPath}, using defaults`);
  } catch (err) {
    logger.error(`❌ Failed to load tournament config at ${configPath}:`, err);
  }
  return normalizeDefinitions(defaultTournaments);
}

export class TournamentManager {
  private tournaments = new Map<string, TournamentState>();
  private prisma?: PrismaClient | null;

  constructor(initial: TournamentState[], prisma?: PrismaClient | null) {
    initial.forEach((t) => this.tournaments.set(t.id, t));
    this.prisma = prisma ?? undefined;
    if (this.prisma) {
      void this.loadFromDb();
    }
  }

  private fromDb(
    t: DbTournament,
    levels: DbLevel[],
    regs: DbRegistration[],
    tables: DbTable[],
  ): TournamentState {
    const statusMap: Record<DbTournament["status"], TournamentStatus> = {
      REGISTERING: "registering",
      SCHEDULED: "scheduled",
      LATE_REG: "registering",
      RUNNING: "running",
      BREAKING: "running",
      FINISHED: "finished",
      CANCELLED: "cancelled",
    };
    const buyInCurrency = t.buyInCurrency === "TICKETS" ? "tickets" : "chips";
    const payoutMode = t.payoutMode === "TICKETS" ? "tickets" : "top_x_split";
    const type = t.type === "MTT" ? "mtt" : "stt";
    const startMode = t.startMode === "SCHEDULED" ? "scheduled" : "full";
    const registered = new Set<string>(regs.map((r) => r.playerId));
    const lateRegEndAt =
      t.startAt && t.lateRegMinutes ? new Date(new Date(t.startAt).getTime() + t.lateRegMinutes * 60000).toISOString() : undefined;

    return {
      id: t.id,
      name: t.name,
      type,
      startMode,
      startAt: t.startAt?.toISOString(),
      buyIn: { currency: buyInCurrency, amount: t.buyInAmount },
      lateRegMinutes: t.lateRegMinutes || undefined,
      maxPlayers: t.maxPlayers,
      startingStack: t.startingStack,
      blindScheduleId: t.blindScheduleId,
      payout: {
        mode: payoutMode,
        topX: t.payoutTopX || undefined,
        ticketCount: t.payoutTicketCount || undefined,
      },
      tableConfigId: t.tableConfigId || undefined,
      description: undefined,
      status: statusMap[t.status],
      registered,
      tables: tables.map((tab) => tab.engineTableId),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lateRegEndAt,
      currentLevel: levels.length ? Math.min(...levels.map((l) => l.levelIndex)) : undefined,
      entrants: regs.length || undefined,
    };
  }

  /**
   * Load tournaments from the database (if Prisma is configured).
   * If none exist, fall back to in-memory defaults to keep the system running.
   */
  private async loadFromDb() {
    if (!this.prisma) return;
    try {
      const tournaments = await this.prisma.tournament.findMany({
        include: { levels: true, registrations: true, tables: true },
        orderBy: { createdAt: "asc" },
      });
      if (!tournaments.length) {
        logger.warn("⚠️ No tournaments found in DB; using in-memory defaults");
        return;
      }
      this.tournaments.clear();
      tournaments.forEach((t) => {
        const state = this.fromDb(t, t.levels, t.registrations, t.tables);
        this.tournaments.set(state.id, state);
      });
      logger.info(`✅ Loaded ${tournaments.length} tournaments from DB`);
    } catch (err) {
      logger.error("❌ Failed to load tournaments from DB, using defaults", err);
    }
  }

  list(): PublicTournamentState[] {
    return Array.from(this.tournaments.values()).map((t) => this.toPublic(t));
  }

  listStates(): TournamentState[] {
    return Array.from(this.tournaments.values());
  }

  get(tournamentId: string): PublicTournamentState | undefined {
    const t = this.tournaments.get(tournamentId);
    return t ? this.toPublic(t) : undefined;
  }

  getState(tournamentId: string): TournamentState | undefined {
    return this.tournaments.get(tournamentId);
  }
  upsertState(state: TournamentState) {
    this.tournaments.set(state.id, state);
  }

  createTournament(def: TournamentDefinition): TournamentState {
    const normalized = normalizeDefinitions([def])[0]!;
    this.tournaments.set(normalized.id, normalized);
    return normalized;
  }

  registerPlayer(tournamentId: string, playerId: string): { ok: boolean; message?: string; tournament?: PublicTournamentState } {
    const t = this.tournaments.get(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    if (t.status === "finished" || t.status === "cancelled") {
      return { ok: false, message: "Tournament is closed" };
    }
    if (t.registered.has(playerId)) {
      return { ok: true, tournament: this.toPublic(t) };
    }
    if (t.registered.size >= t.maxPlayers) {
      return { ok: false, message: "Tournament is full" };
    }
    t.registered.add(playerId);
    this.maybeStart(t);
    this.touch(t);

    if (this.prisma) {
      void this.persistRegistration(t, playerId, "REGISTERED");
    }
    return { ok: true, tournament: this.toPublic(t) };
  }

  unregisterPlayer(tournamentId: string, playerId: string): { ok: boolean; message?: string; tournament?: PublicTournamentState } {
    const t = this.tournaments.get(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    if (t.status === "running" || t.status === "finished") {
      return { ok: false, message: "Tournament already started" };
    }
    t.registered.delete(playerId);
    this.touch(t);
    if (this.prisma) {
      void this.persistRegistration(t, playerId, "BUSTED", true);
    }
    return { ok: true, tournament: this.toPublic(t) };
  }

  private maybeStart(t: TournamentState) {
    if (t.type === "stt" && t.startMode === "full" && t.registered.size >= t.maxPlayers) {
      t.status = "running";
    }
    if (t.type === "mtt" && t.startMode === "scheduled" && t.startAt) {
      const startTs = Date.parse(t.startAt);
      if (!Number.isNaN(startTs) && startTs <= Date.now()) {
        t.status = "running";
      }
    }
  }

  private toPublic(t: TournamentState): PublicTournamentState {
    return {
      ...t,
      registeredCount: t.registered.size,
      tables: [...t.tables],
      lateRegEndAt: t.lateRegEndAt,
      currentLevel: t.currentLevel,
      payouts: t.payouts,
    };
  }

  private touch(t: TournamentState) {
    t.updatedAt = new Date().toISOString();
  }

  markRunning(tournamentId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.status = "running";
    if (!t.entrants) {
      t.entrants = t.registered.size;
    }
    this.touch(t);
    if (this.prisma) {
      void this.prisma.tournament.update({
        where: { id: t.id },
        data: { status: "RUNNING" },
      }).catch((err) => logger.error(`❌ Failed to persist RUNNING status for ${t.id}`, err));
    }
  }

  addTable(tournamentId: string, engineTableId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    if (!t.tables.includes(engineTableId)) {
      t.tables.push(engineTableId);
    }
    this.touch(t);
    if (this.prisma) {
      void this.prisma.tournamentTable.upsert({
        where: { engineTableId },
        update: { status: "ACTIVE" },
        create: {
          engineTableId,
          tournamentId,
          status: "ACTIVE",
        },
      }).catch((err) => logger.error(`❌ Failed to persist tournament table ${engineTableId}`, err));
    }
  }

  removeTable(tournamentId: string, engineTableId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.tables = t.tables.filter((id) => id !== engineTableId);
    this.touch(t);
    if (this.prisma) {
      void this.prisma.tournamentTable.updateMany({
        where: { engineTableId },
        data: { status: "CLOSED" },
      }).catch((err) => logger.error(`❌ Failed to mark table ${engineTableId} closed`, err));
    }
  }

  markFinished(tournamentId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.status = "finished";
    this.touch(t);
    if (this.prisma) {
      void this.prisma.tournament.update({
        where: { id: t.id },
        data: { status: "FINISHED" },
      }).catch((err) => logger.error(`❌ Failed to persist FINISHED status for ${t.id}`, err));
    }
  }

  async persistPayouts(
    tournamentId: string,
    payouts: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[],
  ) {
    if (!this.prisma) return;
    try {
      await this.prisma.tournamentPayout.createMany({
        data: payouts.map((p) => ({
          tournamentId,
          playerId: p.playerId,
          amount: p.amount,
          currency: p.currency === "tickets" ? "TICKETS" : "CHIPS",
        })),
      });
    } catch (err) {
      logger.error(`❌ Failed to persist payouts for ${tournamentId}`, err);
    }
  }

  async persistBust(
    tournamentId: string,
    playerId: string,
    position: number,
  ) {
    if (!this.prisma) return;
    try {
      await this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId, playerId },
        data: { status: "BUSTED", position },
      });
    } catch (err) {
      logger.error(`❌ Failed to persist bust for ${playerId} in ${tournamentId}`, err);
    }
  }

  private async persistRegistration(
    t: TournamentState,
    playerId: string,
    status: RegistrationStatus,
    remove = false,
  ) {
    if (!this.prisma) return;
    try {
      const statusValue = remove ? "BUSTED" : status;
      await this.prisma.tournamentRegistration.upsert({
        where: { tournamentId_playerId: { tournamentId: t.id, playerId } },
        update: { status: statusValue },
        create: {
          tournamentId: t.id,
          playerId,
          status: statusValue,
        },
      });
      await this.prisma.tournament.update({
        where: { id: t.id },
        data: {
          status:
            t.status === "scheduled"
              ? "SCHEDULED"
              : t.status === "running"
                ? "RUNNING"
                : t.status === "finished"
                  ? "FINISHED"
                  : "REGISTERING",
        },
      });
    } catch (err) {
      logger.error(`❌ Failed to persist registration for ${playerId} in ${t.id}`, err);
    }
  }
}
