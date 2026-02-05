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
export type TournamentStatus = "registering" | "scheduled" | "running" | "finished" | "cancelled" | "template";

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

type MttSlot = { hour: number; minute: number };

const defaultTournaments: TournamentDefinition[] = [
  {
    id: "stt-daily-1",
    name: "Daily SNG",
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
    name: "Daily SNG (6-max)",
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
    id: "mtt-daily-1",
    name: "PokerWars MTT",
    type: "mtt",
    startMode: "scheduled",
    startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    buyIn: { currency: "chips", amount: 100 },
    lateRegMinutes: 120,
    maxPlayers: 10000,
    startingStack: 15000,
    blindScheduleId: "default-mtt",
    payout: { mode: "top_x_split", topX: 1500 },
    tableConfigId: "mid",
  },
];

function parseDailyMttSlots(raw?: string): MttSlot[] {
  const source = raw?.trim() || "12:00,20:00";
  const slots = source
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [h, m = "0"] = entry.split(":");
      const hour = Math.min(23, Math.max(0, Number(h)));
      const minute = Math.min(59, Math.max(0, Number(m)));
      return { hour, minute };
    })
    .filter((slot) => Number.isFinite(slot.hour) && Number.isFinite(slot.minute));
  return slots.length ? slots : [{ hour: 12, minute: 0 }, { hour: 20, minute: 0 }];
}

function getNextSlotTimes(now: Date, slots: MttSlot[], count: number): Date[] {
  const candidates: Date[] = [];
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    slots.forEach((slot) => {
      const dt = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      dt.setUTCHours(slot.hour, slot.minute, 0, 0);
      if (dt.getTime() > now.getTime()) {
        candidates.push(dt);
      }
    });
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates.slice(0, count);
}

function formatMttId(startAt: Date): string {
  const yyyy = startAt.getUTCFullYear().toString();
  const mm = String(startAt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(startAt.getUTCDate()).padStart(2, "0");
  const hh = String(startAt.getUTCHours()).padStart(2, "0");
  const min = String(startAt.getUTCMinutes()).padStart(2, "0");
  return `mtt-${yyyy}${mm}${dd}-${hh}${min}`;
}

function formatUtcLabel(startAt: Date): string {
  const hh = String(startAt.getUTCHours()).padStart(2, "0");
  const mm = String(startAt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

function applyDailyMttSchedule(defs: TournamentDefinition[]): TournamentDefinition[] {
  const mttTemplate = defs.find((t) => t.type === "mtt");
  if (!mttTemplate) return defs;
  const nonMtt = defs.filter((t) => t.type !== "mtt");
  const slots = parseDailyMttSlots(process.env.MTT_DAILY_SLOTS);
  const startTimes = getNextSlotTimes(new Date(), slots, 2);
  const scheduled = startTimes.map((startAt) => ({
    ...mttTemplate,
    id: formatMttId(startAt),
    name: mttTemplate.name,
    startMode: "scheduled" as const,
    startAt: startAt.toISOString(),
  }));
  return [...nonMtt, ...scheduled];
}

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
      return normalizeDefinitions(applyDailyMttSchedule(parsed));
    }
    logger.warn(`⚠️ Tournament config not found at ${configPath}, using defaults`);
  } catch (err) {
    logger.error(`❌ Failed to load tournament config at ${configPath}:`, err);
  }
  return normalizeDefinitions(applyDailyMttSchedule(defaultTournaments));
}

export class TournamentManager {
  private tournaments = new Map<string, TournamentState>();
  private prisma?: PrismaClient | null;
  private mttTemplate?: TournamentDefinition;

  constructor(initial: TournamentState[], prisma?: PrismaClient | null) {
    initial.forEach((t) => this.tournaments.set(t.id, t));
    this.mttTemplate = this.extractTemplate(initial);
    this.prisma = prisma ?? undefined;
    if (this.prisma) {
      void this.loadFromDb();
    }
    this.ensureDailyMttSchedule();
  }

  private extractTemplate(states: TournamentState[]): TournamentDefinition | undefined {
    const t = states.find((state) => state.type === "mtt");
    if (!t) return undefined;
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      startMode: t.startMode,
      startAt: t.startAt,
      buyIn: t.buyIn,
      lateRegMinutes: t.lateRegMinutes,
      maxPlayers: t.maxPlayers,
      startingStack: t.startingStack,
      blindScheduleId: t.blindScheduleId,
      payout: t.payout,
      tableConfigId: t.tableConfigId,
      description: t.description,
    };
  }

  private toDefinition(t: TournamentState): TournamentDefinition {
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      startMode: t.startMode,
      startAt: t.startAt,
      buyIn: t.buyIn,
      lateRegMinutes: t.lateRegMinutes,
      maxPlayers: t.maxPlayers,
      startingStack: t.startingStack,
      blindScheduleId: t.blindScheduleId,
      payout: t.payout,
      tableConfigId: t.tableConfigId,
      description: t.description,
    };
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
      TEMPLATE: "template",
    };
    const buyInCurrency = t.buyInCurrency === "TICKETS" ? "tickets" : "chips";
    const payoutMode = t.payoutMode === "TICKETS" ? "tickets" : "top_x_split";
    const type = t.type === "MTT" ? "mtt" : "stt";
    const startMode = t.startMode === "SCHEDULED" ? "scheduled" : "full";
    const registered = new Set<string>(regs.map((r) => r.playerId.toLowerCase().trim()));
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
        logger.warn("⚠️ No tournaments found in DB; falling back to defaults");
        return;
      }
      this.tournaments.clear();
      tournaments.forEach((t) => {
        const state = this.fromDb(t, t.levels, t.registrations, t.tables);
        this.tournaments.set(state.id, state);
      });
      if (!this.mttTemplate) {
        this.mttTemplate = this.extractTemplate(this.listStates());
      }
      this.ensureDailyMttSchedule();
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
    if (!this.mttTemplate && normalized.type === "mtt") {
      this.mttTemplate = def;
    }
    if (this.prisma) {
      const type = def.type === "mtt" ? "MTT" : "STT";
      const startMode = def.startMode === "scheduled" ? "SCHEDULED" : "FULL";
      const buyInCurrency = def.buyIn.currency === "tickets" ? "TICKETS" : "CHIPS";
      const payoutMode = def.payout.mode === "tickets" ? "TICKETS" : "TOP_X_SPLIT";
      const status = def.startMode === "scheduled" ? "SCHEDULED" : "REGISTERING";
      void this.prisma.tournament.upsert({
        where: { id: def.id },
        update: {
          name: def.name,
          type,
          startMode,
          startAt: def.startAt ? new Date(def.startAt) : null,
          lateRegMinutes: def.lateRegMinutes ?? null,
          status,
          maxPlayers: def.maxPlayers,
          startingStack: def.startingStack,
          blindScheduleId: def.blindScheduleId ?? "default-mtt",
          buyInCurrency,
          buyInAmount: def.buyIn.amount,
          payoutMode,
          payoutTopX: def.payout.topX ?? null,
          payoutTicketCount: def.payout.ticketCount ?? null,
          tableConfigId: def.tableConfigId ?? null,
        },
        create: {
          id: def.id,
          name: def.name,
          type,
          startMode,
          startAt: def.startAt ? new Date(def.startAt) : null,
          lateRegMinutes: def.lateRegMinutes ?? null,
          status,
          maxPlayers: def.maxPlayers,
          startingStack: def.startingStack,
          blindScheduleId: def.blindScheduleId ?? "default-mtt",
          buyInCurrency,
          buyInAmount: def.buyIn.amount,
          payoutMode,
          payoutTopX: def.payout.topX ?? null,
          payoutTicketCount: def.payout.ticketCount ?? null,
          tableConfigId: def.tableConfigId ?? null,
        },
      }).catch((err) => logger.error(`❌ Failed to persist tournament ${def.id}`, err));
    }
    return normalized;
  }

  async cancelTournament(tournamentId: string): Promise<TournamentState | null> {
    const t = this.tournaments.get(tournamentId);
    if (!t) return null;
    const cancelled: TournamentState = { ...t, status: "cancelled", updatedAt: new Date().toISOString() };
    if (this.prisma) {
      void this.prisma.tournament.update({
        where: { id: t.id },
        data: { status: "CANCELLED" },
      }).catch((err) => logger.error(`❌ Failed to persist CANCELLED status for ${t.id}`, err));
    }
    this.tournaments.delete(tournamentId);
    return cancelled;
  }

  ensureDailyMttSchedule(): TournamentState[] {
    const template = this.mttTemplate;
    if (!template) return [];
    const slots = parseDailyMttSlots(process.env.MTT_DAILY_SLOTS);
    const now = new Date();
    const future = this.listStates().filter((t) => {
      if (t.type !== "mtt" || !t.startAt) return false;
      const ts = Date.parse(t.startAt);
      return !Number.isNaN(ts) && ts > now.getTime() && t.status !== "cancelled" && t.status !== "finished";
    });
    const needed = Math.max(0, 2 - future.length);
    if (needed === 0) return [];
    const existingStartTimes = new Set(future.map((t) => t.startAt));
    const candidates = getNextSlotTimes(now, slots, 6);
    const created: TournamentState[] = [];
    for (const startAt of candidates) {
      if (created.length >= needed) break;
      const iso = startAt.toISOString();
      if (existingStartTimes.has(iso)) continue;
      const def: TournamentDefinition = {
        ...template,
        id: formatMttId(startAt),
        name: template.name,
        startMode: "scheduled",
        startAt: iso,
      };
      created.push(this.createTournament(def));
    }
    return created;
  }

  registerPlayer(tournamentId: string, playerId: string): { ok: boolean; message?: string; tournament?: PublicTournamentState } {
    const t = this.tournaments.get(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    const normalizedPlayerId = playerId.toLowerCase().trim();
    if (t.status === "finished" || t.status === "cancelled") {
      return { ok: false, message: "Tournament is closed" };
    }
    if (t.registered.has(normalizedPlayerId)) {
      return { ok: true, tournament: this.toPublic(t) };
    }
    if (t.registered.size >= t.maxPlayers) {
      return { ok: false, message: "Tournament is full" };
    }
    t.registered.add(normalizedPlayerId);
    this.maybeStart(t);
    this.touch(t);

    if (this.prisma) {
      void this.persistRegistration(t, normalizedPlayerId, "REGISTERED");
    }
    return { ok: true, tournament: this.toPublic(t) };
  }

  unregisterPlayer(tournamentId: string, playerId: string): { ok: boolean; message?: string; tournament?: PublicTournamentState } {
    const t = this.tournaments.get(tournamentId);
    if (!t) return { ok: false, message: "Tournament not found" };
    const normalizedPlayerId = playerId.toLowerCase().trim();
    if (t.status === "running" || t.status === "finished") {
      return { ok: false, message: "Tournament already started" };
    }
    t.registered.delete(normalizedPlayerId);
    this.touch(t);
    if (this.prisma) {
      void this.persistRegistration(t, normalizedPlayerId, "BUSTED", true);
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

  toPublic(t: TournamentState): PublicTournamentState {
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
      const normalizedPlayerId = playerId.toLowerCase().trim();
      await this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId, playerId: { equals: normalizedPlayerId, mode: "insensitive" } },
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
      const normalizedPlayerId = playerId.toLowerCase().trim();
      const existing = await this.prisma.tournamentRegistration.findFirst({
        where: { tournamentId: t.id, playerId: { equals: normalizedPlayerId, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.tournamentRegistration.update({
          where: { id: existing.id },
          data: { status: statusValue, playerId: normalizedPlayerId },
        });
      } else {
        await this.prisma.tournamentRegistration.create({
          data: {
            tournamentId: t.id,
            playerId: normalizedPlayerId,
            status: statusValue,
          },
        });
      }
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

  private async seedDefaultsToDb() {
    if (!this.prisma) return;
    const defs = this.listStates().map((t) => this.toDefinition(t));
    await Promise.all(
      defs.map(async (def) => {
        const type = def.type === "mtt" ? "MTT" : "STT";
        const startMode = def.startMode === "scheduled" ? "SCHEDULED" : "FULL";
        const buyInCurrency = def.buyIn.currency === "tickets" ? "TICKETS" : "CHIPS";
        const payoutMode = def.payout.mode === "tickets" ? "TICKETS" : "TOP_X_SPLIT";
        const status = def.startMode === "scheduled" ? "SCHEDULED" : "REGISTERING";
        await this.prisma!.tournament.upsert({
          where: { id: def.id },
          update: {
            name: def.name,
            type,
            startMode,
            startAt: def.startAt ? new Date(def.startAt) : null,
            lateRegMinutes: def.lateRegMinutes ?? null,
            status,
            maxPlayers: def.maxPlayers,
            startingStack: def.startingStack,
            blindScheduleId: def.blindScheduleId ?? "default-mtt",
            buyInCurrency,
            buyInAmount: def.buyIn.amount,
            payoutMode,
            payoutTopX: def.payout.topX ?? null,
            payoutTicketCount: def.payout.ticketCount ?? null,
            tableConfigId: def.tableConfigId ?? null,
          },
          create: {
            id: def.id,
            name: def.name,
            type,
            startMode,
            startAt: def.startAt ? new Date(def.startAt) : null,
            lateRegMinutes: def.lateRegMinutes ?? null,
            status,
            maxPlayers: def.maxPlayers,
            startingStack: def.startingStack,
            blindScheduleId: def.blindScheduleId ?? "default-mtt",
            buyInCurrency,
            buyInAmount: def.buyIn.amount,
            payoutMode,
            payoutTopX: def.payout.topX ?? null,
            payoutTicketCount: def.payout.ticketCount ?? null,
            tableConfigId: def.tableConfigId ?? null,
          },
        });
      }),
    );
    logger.info("✅ Seeded tournaments into DB");
  }
}
