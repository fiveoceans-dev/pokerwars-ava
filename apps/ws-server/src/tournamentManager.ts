
import { logger } from "@hyper-poker/engine/utils/logger";
import { schedule as cronSchedule, validate as validateCron, ScheduledTask } from "node-cron";
import type {
  PrismaClient,
  Tournament as DbTournament,
  TournamentRegistration as DbRegistration,
  TournamentLevel as DbLevel,
  TournamentTable as DbTable,
  GameTemplate as DbGameTemplate,
  GameTemplateType,
  SystemConfig,
  TournamentType as DbTournamentType,
  TournamentStartMode as DbTournamentStartMode,
  BuyInCurrency as DbBuyInCurrency,
  PayoutMode as DbPayoutMode,
} from "@prisma/client";

// --- Type Definitions ---

export type TournamentType = "stt" | "mtt" | "cash"; 
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
  gameType: string;
  type: TournamentType;
  startMode: TournamentStartMode;
  startAt?: string;
  schedule?: string;
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
  bustedIds: Set<string>;
  tables: string[];
  createdAt: string;
  updatedAt: string;
  lateRegEndAt?: string;
  currentLevel?: number;
  payouts?: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[];
  entrants?: number;
}

export interface PublicTournamentState extends Omit<TournamentState, "registered" | "bustedIds" | "tables"> {
  registeredCount: number;
  registeredIds: string[];
  bustedIds: string[];
  tables: string[];
  lateRegEndAt?: string;
  currentLevel?: number;
  payouts?: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[];
}

export type RegistrationStatus = "REGISTERED" | "SEATED" | "BUSTED" | "CASHED";

// --- Helper Functions ---

function formatMttId(templateId: string, startAt: Date): string {
  const yyyy = startAt.getUTCFullYear().toString();
  const mm = String(startAt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(startAt.getUTCDate()).padStart(2, "0");
  const hh = String(startAt.getUTCHours()).padStart(2, "0");
  const min = String(startAt.getUTCMinutes()).padStart(2, "0");
  return `${templateId}-${yyyy}${mm}${dd}-${hh}${min}`;
}

// --- TournamentManager Class ---

export class TournamentManager {
  private tournaments = new Map<string, TournamentState>();
  private templates = new Map<string, TournamentDefinition>();
  private prisma: PrismaClient;
  private currentTemplatesVersion: number = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private cronJobs: ScheduledTask[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    void this.initialize();
  }

  private async initialize() {
    await this.loadAndScheduleFromDb();
    this.pollingInterval = setInterval(() => this.pollForTemplateUpdates(), 60 * 1000); // Poll every minute
  }

  public shutdown() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
  }

  private async pollForTemplateUpdates() {
    try {
      const systemConfig = await this.prisma.systemConfig.findUnique({ where: { id: "default" } });
      if (systemConfig && systemConfig.templatesVersion > this.currentTemplatesVersion) {
        logger.info("New template version detected, reloading...");
        await this.loadAndScheduleFromDb();
      }
    } catch (error) {
      logger.error("❌ Failed to poll for template updates:", error);
    }
  }

  private async loadAndScheduleFromDb() {
    try {
      logger.info("🔄 Loading game templates from DB...");
      const dbTemplates = await this.prisma.gameTemplate.findMany();
      const systemConfig = await this.prisma.systemConfig.findUnique({ where: { id: "default" } });
      this.currentTemplatesVersion = systemConfig?.templatesVersion ?? 1;

      this.templates.clear();
      dbTemplates.forEach(t => {
        if (t.type === "SNG" || t.type === "MTT") {
          this.templates.set(t.id, this.dbGameTemplateToTournamentDefinition(t));
        }
      });
      logger.info(`✅ Loaded ${this.templates.size} SNG/MTT templates.`);

      // Stop existing cron jobs before creating new ones
      this.cronJobs.forEach(job => job.stop());
      this.cronJobs = [];

      this.templates.forEach(template => {
        if (template.type === "mtt" && template.schedule && validateCron(template.schedule)) {
          const job = cronSchedule(template.schedule, () => {
            logger.info(`⏰ Cron triggered for MTT template: ${template.name}`);
            void this.createTournamentFromTemplate(template.id, new Date());
          });
          this.cronJobs.push(job);
          logger.info(`🗓️ Scheduled MTT template "${template.name}" with cron: "${template.schedule}"`);

          // Proactively create an initial instance if none exists for this template
          const hasActiveInstance = Array.from(this.tournaments.values()).some(t => 
            t.type === 'mtt' && t.id.startsWith(template.id) && (t.status === 'scheduled' || t.status === 'registering')
          );
          if (!hasActiveInstance) {
            logger.info(`🌱 Creating initial MTT instance for template: ${template.name}`);
            void this.createTournamentFromTemplate(template.id, new Date());
          }
        }
      });
      
      // Load live tournaments
      const activeTournaments = await this.prisma.tournament.findMany({
        where: {
          status: {
            in: ["REGISTERING", "SCHEDULED", "RUNNING", "LATE_REG", "BREAKING"]
          }
        },
        include: { levels: true, registrations: true, tables: true },
      });
      
      activeTournaments.forEach(t => {
        const state = this.dbTournamentToTournamentState(t, t.levels, t.registrations, t.tables);
        this.tournaments.set(state.id, state);
      });
      
    } catch (error) {
      logger.error("❌ Failed to load templates from DB:", error);
    }
  }

  public async createTournamentFromTemplate(templateId: string, scheduledTime?: Date): Promise<TournamentState | null> {
    const template = this.templates.get(templateId);
    if (!template) {
      logger.error(`Template ${templateId} not found`);
      return null;
    }

    const startAt = scheduledTime || new Date();
    const newId = formatMttId(template.id, startAt);
    
    // Check if an instance for this slot already exists
    if (this.tournaments.has(newId)) {
      logger.info(`Instance ${newId} already exists, skipping creation.`);
      return this.tournaments.get(newId)!;
    }
    
    const def: TournamentDefinition = {
      ...template,
      id: newId,
      startAt: startAt.toISOString(),
      startMode: "scheduled"
    };

    const state = this.normalizeDefinition(def);
    this.tournaments.set(state.id, state);

    try {
      await this.prisma.tournament.create({
        data: {
          id: state.id,
          name: state.name,
          gameType: state.gameType,
          type: state.type === 'stt' ? 'STT' : 'MTT',
          startMode: state.startMode === 'scheduled' ? 'SCHEDULED' : 'FULL',
          startAt: state.startAt ? new Date(state.startAt) : null,
          lateRegMinutes: state.lateRegMinutes,
          status: 'SCHEDULED',
          maxPlayers: state.maxPlayers,
          startingStack: state.startingStack,
          blindScheduleId: state.blindScheduleId ?? "default-mtt",
          buyInCurrency: state.buyIn.currency === 'tickets' ? 'TICKETS' : 'CHIPS',
          buyInAmount: state.buyIn.amount,
          payoutMode: state.payout.mode === 'tickets' ? 'TICKETS' : 'TOP_X_SPLIT',
          payoutTopX: state.payout.topX,
          payoutTicketCount: state.payout.ticketCount,
          tableConfigId: state.tableConfigId,
        }
      });
      logger.info(`➕ Created and persisted new tournament instance: ${state.id}`);
      return state;
    } catch (error: any) {
      if (error.code !== 'P2002') { // Ignore unique constraint violations (already exists)
        logger.error(`❌ Failed to persist tournament ${state.id}:`, error);
      }
      this.tournaments.delete(state.id); // Rollback
      return null;
    }
  }

  private dbGameTemplateToTournamentDefinition(t: DbGameTemplate): TournamentDefinition {
    const type = t.type as GameTemplateType;
    // We only handle SNG and MTT here for now
    let mappedType: TournamentType = 'stt';
    if (type === 'MTT') mappedType = 'mtt';
    else if (type === 'SNG') mappedType = 'stt';
    else if (type === 'CASH') mappedType = 'cash';

    return {
      id: t.id,
      name: t.name,
      gameType: t.gameType ?? "No Limit Hold'em",
      type: mappedType,
      startMode: t.startMode!.toLowerCase() as TournamentStartMode,
      schedule: t.schedule ?? undefined,
      buyIn: {
        currency: t.currency === 'COINS' ? 'chips' : 'tickets',
        amount: t.defaultBuyIn,
      },
      lateRegMinutes: t.lateRegMinutes ?? undefined,
      maxPlayers: t.maxPlayers,
      startingStack: t.startingStack!,
      blindScheduleId: t.blindScheduleId!,
      payout: {
        mode: t.payoutMode as TournamentPayoutMode,
        topX: t.payoutTopX ?? undefined,
        ticketCount: t.payoutTicketCount ?? undefined,
      },
      tableConfigId: t.tableConfigId ?? undefined,
      description: undefined,
    };
  }
  
  private normalizeDefinition(def: TournamentDefinition): TournamentState {
    const now = new Date().toISOString();
    return {
      ...def,
      status: def.startMode === 'scheduled' ? 'scheduled' : 'registering',
      registered: new Set<string>(),
      bustedIds: new Set<string>(),
      tables: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private dbTournamentToTournamentState(
    t: DbTournament,
    levels: DbLevel[],
    regs: DbRegistration[],
    tables: DbTable[],
  ): TournamentState {
    const statusMap: Record<string, TournamentStatus> = {
      REGISTERING: "registering",
      SCHEDULED: "scheduled",
      LATE_REG: "registering",
      RUNNING: "running",
      BREAKING: "running",
      FINISHED: "finished",
      CANCELLED: "cancelled",
      TEMPLATE: "template",
    };
    
    return {
      id: t.id,
      name: t.name,
      gameType: t.gameType,
      type: t.type === 'MTT' ? 'mtt' : 'stt',
      startMode: t.startMode === 'SCHEDULED' ? 'scheduled' : 'full',
      startAt: t.startAt?.toISOString(),
      buyIn: {
        currency: t.buyInCurrency === 'TICKETS' ? 'tickets' : 'chips',
        amount: t.buyInAmount,
      },
      lateRegMinutes: t.lateRegMinutes || undefined,
      maxPlayers: t.maxPlayers,
      startingStack: t.startingStack,
      blindScheduleId: t.blindScheduleId,
      payout: {
        mode: t.payoutMode === 'TICKETS' ? 'tickets' : 'top_x_split',
        topX: t.payoutTopX || undefined,
        ticketCount: t.payoutTicketCount || undefined,
      },
      tableConfigId: t.tableConfigId || undefined,
      status: statusMap[t.status],
      registered: new Set(regs.filter(r => r.status !== 'BUSTED').map(r => r.playerId)),
      bustedIds: new Set(regs.filter(r => r.status === 'BUSTED').map(r => r.playerId)),
      tables: tables.map(tb => tb.engineTableId),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      currentLevel: levels.length > 0 ? Math.max(...levels.map(l => l.levelIndex)) : undefined,
    };
  }

  // --- Public API ---

  list(): PublicTournamentState[] {
    const sngTemplates = Array.from(this.templates.values()).filter(t => t.type === 'stt');
    const mttTemplates = Array.from(this.templates.values()).filter(t => t.type === 'mtt');

    const sngInstances = sngTemplates.map(t => {
       return { ...this.normalizeDefinition(t), status: 'registering' as const };
    });

    const mttInstances = mttTemplates.map(t => {
       return { ...this.normalizeDefinition(t), status: 'scheduled' as const };
    });
    
    const liveTournaments = Array.from(this.tournaments.values());
    
    return [...sngInstances, ...mttInstances, ...liveTournaments].map(t => this.toPublic(t));
  }

  listStates(): TournamentState[] {
    return Array.from(this.tournaments.values());
  }

  get(tournamentId: string): PublicTournamentState | undefined {
    const t = this.tournaments.get(tournamentId);
    if(t) return this.toPublic(t);

    const template = this.templates.get(tournamentId);
    if(template) return this.toPublic(this.normalizeDefinition(template));

    return undefined;
  }

  getState(tournamentId: string): TournamentState | undefined {
    const t = this.tournaments.get(tournamentId);
    if(t) return t;

    const template = this.templates.get(tournamentId);
    if(template) return this.normalizeDefinition(template);

    return undefined;
  }

  upsertState(state: TournamentState) {
    this.tournaments.set(state.id, state);
  }

  // --- Methods required by TournamentOrchestrator ---

  toPublic(t: TournamentState): PublicTournamentState {
    return {
      ...t,
      registeredCount: t.registered.size,
      registeredIds: Array.from(t.registered),
      bustedIds: Array.from(t.bustedIds || new Set()),
      tables: [...t.tables],
    };
  }

  ensureDailyMttSchedule(): TournamentState[] {
    // This is now handled by cron jobs in loadAndScheduleFromDb
    // Returning empty array as orchestration is different now
    return [];
  }

  async cancelTournament(tournamentId: string): Promise<TournamentState | null> {
    const t = this.tournaments.get(tournamentId);
    if (!t) return null;
    t.status = 'cancelled';
    t.updatedAt = new Date().toISOString();
    
    try {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'CANCELLED' }
      });
    } catch (e) {
      logger.error(`Failed to cancel tournament ${tournamentId}`, e);
    }
    
    return t;
  }

  markRunning(tournamentId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.status = 'running';
    t.updatedAt = new Date().toISOString();
    void this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'RUNNING' } }).catch(e => logger.error("DB update failed", e));
  }

  markFinished(tournamentId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.status = 'finished';
    t.updatedAt = new Date().toISOString();
    void this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'FINISHED' } }).catch(e => logger.error("DB update failed", e));
  }

  addTable(tournamentId: string, tableId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    if (!t.tables.includes(tableId)) {
      t.tables.push(tableId);
      void this.prisma.tournamentTable.create({
        data: { tournamentId, engineTableId: tableId, status: 'ACTIVE' }
      }).catch(e => logger.error("DB table create failed", e));
    }
  }

  async removeTable(tournamentId: string, tableId: string) {
    const t = this.tournaments.get(tournamentId);
    if (!t) return;
    t.tables = t.tables.filter(id => id !== tableId);
    try {
      await this.prisma.tournamentTable.update({
        where: { engineTableId: tableId },
        data: { status: 'CLOSED' }
      });
    } catch (e) {
      logger.error("DB table update failed", e);
    }
  }

  async persistBust(tournamentId: string, playerId: string, position: number) {
    try {
      await this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId, playerId },
        data: { status: 'BUSTED', position, tableId: null, seatIndex: null }
      });
    } catch (e) {
      logger.error("Persist bust failed", e);
    }
  }

  async markSeated(tournamentId: string, playerId: string, tableId: string, seatIndex: number) {
    try {
      await this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId, playerId },
        data: { status: 'SEATED', tableId, seatIndex }
      });
    } catch (e) {
      logger.error("Mark seated failed", e);
    }
  }

  async clearRegistration(tournamentId: string, playerId: string) {
    try {
      await this.prisma.tournamentRegistration.deleteMany({
        where: { tournamentId, playerId }
      });
    } catch (e) {
      logger.error("Clear registration failed", e);
    }
  }

  async persistPayouts(tournamentId: string, payouts: { playerId: string; amount: number; currency: "chips" | "tickets"; position: number }[]) {
    try {
      await this.prisma.tournamentPayout.createMany({
        data: payouts.map(p => ({
          tournamentId,
          playerId: p.playerId,
          amount: p.amount,
          currency: p.currency === 'tickets' ? 'TICKETS' : 'CHIPS',
        }))
      });

      // Mark all players who finished (non-busted) as CASHED and clear their seats
      const pids = payouts.map(p => p.playerId);
      await this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId, playerId: { in: pids }, status: { not: 'BUSTED' } },
        data: { status: 'CASHED', tableId: null, seatIndex: null }
      });
    } catch (e) {
      logger.error("Persist payouts failed", e);
    }
  }

  createTournament(def: TournamentDefinition): TournamentState {
      // This method is used by orchestrator for creating SNG instances from templates
      // In new flow, orchestrator passes a definition.
      // We'll normalize it and add it to our live map.
      const state = this.normalizeDefinition(def);
      this.tournaments.set(state.id, state);
      
      // Persist SNG instance
      void this.prisma.tournament.create({
          data: {
              id: state.id,
              name: state.name,
              gameType: state.gameType,
              type: state.type === 'stt' ? 'STT' : 'MTT',
              startMode: state.startMode === 'scheduled' ? 'SCHEDULED' : 'FULL',
              maxPlayers: state.maxPlayers,
              startingStack: state.startingStack,
              blindScheduleId: state.blindScheduleId ?? "default-stt",
              buyInCurrency: state.buyIn.currency === 'tickets' ? 'TICKETS' : 'CHIPS',
              buyInAmount: state.buyIn.amount,
              payoutMode: state.payout.mode === 'tickets' ? 'TICKETS' : 'TOP_X_SPLIT',
              payoutTopX: state.payout.topX,
              payoutTicketCount: state.payout.ticketCount,
              status: 'REGISTERING'
          }
      }).catch(e => logger.error("SNG persist failed", e));

      return state;
  }

  registerPlayer(tournamentId: string, playerId: string): { ok: boolean; message?: string; tournament?: PublicTournamentState } {
    let t = this.tournaments.get(tournamentId);
    
    // If it's a template SNG, create a new instance on first registration
    if (!t && this.templates.has(tournamentId)) {
        const template = this.templates.get(tournamentId)!;
        if (template.type === 'stt') {
             // Create dynamic instance for this SNG
             const newId = `${template.id}-${Date.now()}`;
             const def: TournamentDefinition = { ...template, id: newId };
             t = this.createTournament(def);
        }
    }
    
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
    t.updatedAt = new Date().toISOString();

    void this.prisma.tournamentRegistration.create({
        data: {
            tournamentId: t.id,
            playerId: normalizedPlayerId,
            status: 'REGISTERED'
        }
    }).catch(e => logger.error("Registration persist failed", e));

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
    t.updatedAt = new Date().toISOString();
    
    void this.prisma.tournamentRegistration.updateMany({
        where: { tournamentId: t.id, playerId: normalizedPlayerId },
        data: { status: 'BUSTED' } // Or delete, depending on preference. Using BUSTED/CANCELLED for history.
    }).catch(e => logger.error("Unregister persist failed", e));

    return { ok: true, tournament: this.toPublic(t) };
  }
}
