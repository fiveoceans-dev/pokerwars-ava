import { PrismaClient, GameTemplateType, Asset, PayoutMode, TournamentStartMode } from "@prisma/client";

const prisma = new PrismaClient();

const cashTemplates = [
  { id: "cash-1-2", name: "1/2 NLH", sb: 1, bb: 2 },
  { id: "cash-2-5", name: "2/5 NLH", sb: 2, bb: 5 },
  { id: "cash-5-10", name: "5/10 NLH", sb: 5, bb: 10 },
  { id: "cash-50-100", name: "50/100 NLH", sb: 50, bb: 100 },
].map((c) => ({
  ...c,
  minBuyIn: c.bb * 40,
  maxBuyIn: c.bb * 100,
  defaultBuyIn: c.bb * 100,
  maxPlayers: 9,
}));

const sngTemplates = [
  {
    id: "sng-9max",
    name: "SNG 9-Max",
    maxPlayers: 9,
    buyIn: 100,
    blindScheduleId: "default-stt",
    payoutTopX: 3,
  },
  {
    id: "sng-6max",
    name: "SNG 6-Max",
    maxPlayers: 6,
    buyIn: 100,
    blindScheduleId: "default-stt",
    payoutTopX: 2,
  },
].map((t) => ({
  ...t,
  sb: 25,
  bb: 50,
  minBuyIn: t.buyIn,
  maxBuyIn: t.buyIn,
  defaultBuyIn: t.buyIn,
  startingStack: 5000,
}));

const mttTemplates = [
  {
    id: "mtt-prime",
    name: "PokerWars MTT",
    maxPlayers: 10000,
    buyIn: 100,
    blindScheduleId: "default-mtt",
    payoutTopX: 1500,
    lateRegMinutes: 120,
    startingStack: 15000,
  },
].map((t) => ({
  ...t,
  sb: 25,
  bb: 50,
  minBuyIn: t.buyIn,
  maxBuyIn: t.buyIn,
  defaultBuyIn: t.buyIn,
  startAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
}));

async function main() {
  for (const c of cashTemplates) {
    await prisma.gameTemplate.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        type: GameTemplateType.CASH,
        smallBlind: c.sb,
        bigBlind: c.bb,
        minBuyIn: c.minBuyIn,
        maxBuyIn: c.maxBuyIn,
        defaultBuyIn: c.defaultBuyIn,
        maxPlayers: c.maxPlayers,
        currency: Asset.COINS,
      },
      create: {
        id: c.id,
        name: c.name,
        type: GameTemplateType.CASH,
        smallBlind: c.sb,
        bigBlind: c.bb,
        minBuyIn: c.minBuyIn,
        maxBuyIn: c.maxBuyIn,
        defaultBuyIn: c.defaultBuyIn,
        maxPlayers: c.maxPlayers,
        currency: Asset.COINS,
      },
    });
  }

  for (const t of sngTemplates) {
    await prisma.gameTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        type: GameTemplateType.SNG,
        smallBlind: t.sb,
        bigBlind: t.bb,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        defaultBuyIn: t.defaultBuyIn,
        maxPlayers: t.maxPlayers,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: PayoutMode.TOP_X_SPLIT,
        payoutTopX: t.payoutTopX,
        currency: Asset.COINS,
        startMode: TournamentStartMode.FULL,
      },
      create: {
        id: t.id,
        name: t.name,
        type: GameTemplateType.SNG,
        smallBlind: t.sb,
        bigBlind: t.bb,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        defaultBuyIn: t.defaultBuyIn,
        maxPlayers: t.maxPlayers,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: PayoutMode.TOP_X_SPLIT,
        payoutTopX: t.payoutTopX,
        currency: Asset.COINS,
        startMode: TournamentStartMode.FULL,
      },
    });
  }

  for (const t of mttTemplates) {
    await prisma.gameTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        type: GameTemplateType.MTT,
        smallBlind: t.sb,
        bigBlind: t.bb,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        defaultBuyIn: t.defaultBuyIn,
        maxPlayers: t.maxPlayers,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: PayoutMode.TOP_X_SPLIT,
        payoutTopX: t.payoutTopX,
        currency: Asset.COINS,
        startMode: TournamentStartMode.SCHEDULED,
        startAt: t.startAt,
        lateRegMinutes: t.lateRegMinutes,
      },
      create: {
        id: t.id,
        name: t.name,
        type: GameTemplateType.MTT,
        smallBlind: t.sb,
        bigBlind: t.bb,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        defaultBuyIn: t.defaultBuyIn,
        maxPlayers: t.maxPlayers,
        startingStack: t.startingStack,
        blindScheduleId: t.blindScheduleId,
        payoutMode: PayoutMode.TOP_X_SPLIT,
        payoutTopX: t.payoutTopX,
        currency: Asset.COINS,
        startMode: TournamentStartMode.SCHEDULED,
        startAt: t.startAt,
        lateRegMinutes: t.lateRegMinutes,
      },
    });
  }

  console.log("✅ Seeded game templates");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
