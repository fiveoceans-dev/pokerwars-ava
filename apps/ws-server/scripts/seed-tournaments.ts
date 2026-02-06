import fs from "fs";
import path from "path";
import { PrismaClient, PayoutMode, TournamentStartMode, TournamentStatus, BuyInCurrency, TournamentType } from "@prisma/client";

const prisma = new PrismaClient();

type TournamentDefinition = {
  id: string;
  name: string;
  type: "stt" | "mtt";
  startMode: "full" | "scheduled";
  startAt?: string;
  buyIn: { currency: "chips" | "tickets"; amount: number };
  lateRegMinutes?: number;
  maxPlayers: number;
  startingStack: number;
  blindScheduleId?: string;
  payout: { mode: "top_x_split" | "tickets"; topX?: number; ticketCount?: number };
  tableConfigId?: string;
  description?: string;
};

function resolveConfigPath() {
  if (process.env.TOURNAMENT_CONFIG_PATH) return process.env.TOURNAMENT_CONFIG_PATH;
  return path.resolve(__dirname, "..", "tournaments.json");
}

async function seedTournaments() {
  const force = process.env.FORCE_SEED_TOURNAMENTS === "true" || process.env.SEED_TOURNAMENTS_OVERWRITE === "true";
  const count = await prisma.tournament.count();
  if (count > 0 && !force) {
    console.log(`✅ Tournaments already exist (${count}); skipping seed`);
    return;
  }

  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(`Tournament config not found at ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const defs = JSON.parse(raw) as TournamentDefinition[];
  if (!Array.isArray(defs) || defs.length === 0) {
    throw new Error("Tournament config is empty");
  }

  const statusRows = (await prisma.$queryRaw<
    Array<{ value: string }>
  >`SELECT UNNEST(enum_range(NULL::"public"."TournamentStatus")) AS value`) || [];
  const usesTemplateStatus = statusRows.some((row) => row.value === "TEMPLATE");

  if (force) {
    const ids = defs.map((d) => d.id);
    await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: { in: ids } } });
    await prisma.tournamentTable.deleteMany({ where: { tournamentId: { in: ids } } });
    await prisma.tournamentEvent.deleteMany({ where: { tournamentId: { in: ids } } });
    await prisma.tournamentPayout.deleteMany({ where: { tournamentId: { in: ids } } });
    await prisma.tournament.deleteMany({ where: { id: { notIn: ids } } });
  }

  for (const def of defs) {
    const type = def.type === "mtt" ? TournamentType.MTT : TournamentType.STT;
    const startMode = def.startMode === "scheduled" ? TournamentStartMode.SCHEDULED : TournamentStartMode.FULL;
    const buyInCurrency = def.buyIn.currency === "tickets" ? BuyInCurrency.TICKETS : BuyInCurrency.CHIPS;
    const payoutMode = def.payout.mode === "tickets" ? PayoutMode.TICKETS : PayoutMode.TOP_X_SPLIT;
    // Seed as templates when DB enum supports it; otherwise fall back to a safe live status.
    const status = usesTemplateStatus ? TournamentStatus.TEMPLATE : TournamentStatus.REGISTERING;
    await prisma.tournament.upsert({
      where: { id: def.id },
      update: force
        ? {
            name: def.name,
            gameType: "No Limit Hold'em",
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
          }
        : {},
      create: {
        id: def.id,
        name: def.name,
        gameType: "No Limit Hold'em",
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
  }

  console.log(force ? `✅ Upserted ${defs.length} tournaments` : `✅ Seeded ${defs.length} tournaments`);
}

seedTournaments()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
