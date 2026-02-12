import fs from "fs";
import path from "path";
import { PrismaClient, GameTemplateType, Asset, PayoutMode, TournamentStartMode, BuyInCurrency } from "@prisma/client";

const prisma = new PrismaClient();

type GameTemplateDefinition = {
  id: string;
  name: string;
  gameType?: string; // "No Limit Hold'em"
  type: GameTemplateType; // CASH, SNG, MTT
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  defaultBuyIn?: number;
  buyInAmount?: number; // For SNG/MTT where min/max/default are the same
  currency: Asset; // COINS, TICKET_X, etc.
  startMode?: TournamentStartMode; // FULL, SCHEDULED
  startAt?: Date;
  schedule?: string; // Cron-like schedule
  lateRegMinutes?: number;
  startingStack?: number;
  blindScheduleId?: string; // default-stt, default-mtt
  payoutMode?: PayoutMode; // TOP_X_SPLIT, TICKETS
  payoutTopX?: number;
  payoutTicketCount?: number;
};

function resolveTemplateConfigPath() {
  if (process.env.GAME_TEMPLATES_CONFIG_PATH) return process.env.GAME_TEMPLATES_CONFIG_PATH;
  return path.resolve(__dirname, "..", "game-templates-seed.json");
}

async function main() {
  const configPath = resolveTemplateConfigPath();
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Game templates config not found at ${configPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const templates = JSON.parse(raw) as GameTemplateDefinition[];

  for (const t of templates) {
    // For SNG/MTT, buy-in is fixed, so map buyInAmount to min/max/default if explicitly provided
    const minBuyIn = t.minBuyIn ?? t.buyInAmount;
    const maxBuyIn = t.maxBuyIn ?? t.buyInAmount;
    const defaultBuyIn = t.defaultBuyIn ?? t.buyInAmount;

    if (minBuyIn === undefined || maxBuyIn === undefined || defaultBuyIn === undefined) {
      console.warn(`⚠️ Skipping template ${t.id}: Missing buy-in configuration`);
      continue;
    }

    await prisma.gameTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        gameType: t.gameType ?? "No Limit Hold'em",
        type: t.type,
        maxPlayers: t.maxPlayers,
        smallBlind: t.smallBlind,
        bigBlind: t.bigBlind,
        minBuyIn,
        maxBuyIn,
        defaultBuyIn,
        currency: t.currency,
        startMode: t.startMode,
        startAt: t.startAt,
        schedule: t.schedule,
        lateRegMinutes: t.lateRegMinutes,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: t.payoutMode,
        payoutTopX: t.payoutTopX,
        payoutTicketCount: t.payoutTicketCount,
      },
      create: {
        id: t.id,
        name: t.name,
        gameType: t.gameType ?? "No Limit Hold'em",
        type: t.type,
        maxPlayers: t.maxPlayers,
        smallBlind: t.smallBlind,
        bigBlind: t.bigBlind,
        minBuyIn,
        maxBuyIn,
        defaultBuyIn,
        currency: t.currency,
        startMode: t.startMode,
        startAt: t.startAt,
        schedule: t.schedule,
        lateRegMinutes: t.lateRegMinutes,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: t.payoutMode,
        payoutTopX: t.payoutTopX,
        payoutTicketCount: t.payoutTicketCount,
      },
    });
  }

  // Increment templatesVersion to trigger hot-reload in ws-server
  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: { templatesVersion: { increment: 1 } },
    create: { id: "default", templatesVersion: 1 },
  });

  console.log(`✅ Seeded ${templates.length} game templates and incremented templatesVersion`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
