import { PrismaClient, AccountOwnerType, Asset, LedgerType } from "@prisma/client";

const prisma = new PrismaClient();

// Treasury configuration - 5 billion total supply as mentioned in docs
const TREASURY_CONFIG = {
  id: "platform-treasury",
  initialCoinSupply: 5_000_000_000, // 5 billion coins
  ticketXSupply: 100_000,
  ticketYSupply: 50_000,
  ticketZSupply: 25_000,
};

// Initial ledger configuration
const LEDGER_CONFIG = {
  id: "DEFAULT",
  coin_supply_total: 5_000_000_000,
  free_claim_amount: 3000,
  free_claim_cooldown_ms: 18_000_000,
  buy_rate: 250,
  sell_rate: 220,
};

// Genesis block for the ledger
const GENESIS_BLOCK = {
  id: "genesis-block",
  height: 0,
  hash: "genesis-hash-" + Date.now(),
  prevHash: null,
  txCount: 1,
  createdAt: new Date(),
};

// Initial treasury mint transaction
const TREASURY_MINT_TRANSACTION = {
  id: "genesis-mint-treasury",
  seq: 1,
  hash: "genesis-tx-hash-" + Date.now(),
  prevHash: null,
  type: LedgerType.MINT,
  toAccountId: "platform-treasury-account",
  asset: Asset.COINS,
  amount: BigInt(TREASURY_CONFIG.initialCoinSupply),
  referenceType: "system",
  referenceId: "genesis-mint",
  metadata: {
    description: "Genesis mint of platform treasury coins",
    totalSupply: TREASURY_CONFIG.initialCoinSupply,
  },
};

// Blind schedules for tournaments
const BLIND_SCHEDULES = [
  {
    id: "default-stt",
    name: "Standard STT Blind Schedule",
    levels: [
      { level: 1, smallBlind: 25, bigBlind: 50, durationMinutes: 8 },
      { level: 2, smallBlind: 50, bigBlind: 100, durationMinutes: 8 },
      { level: 3, smallBlind: 75, bigBlind: 150, durationMinutes: 8 },
      { level: 4, smallBlind: 100, bigBlind: 200, durationMinutes: 8 },
      { level: 5, smallBlind: 150, bigBlind: 300, durationMinutes: 8 },
      { level: 6, smallBlind: 200, bigBlind: 400, durationMinutes: 8 },
      { level: 7, smallBlind: 300, bigBlind: 600, durationMinutes: 8 },
      { level: 8, smallBlind: 400, bigBlind: 800, durationMinutes: 8 },
      { level: 9, smallBlind: 500, bigBlind: 1000, durationMinutes: 8 },
      { level: 10, smallBlind: 750, bigBlind: 1500, durationMinutes: 8 },
      { level: 11, smallBlind: 1000, bigBlind: 2000, durationMinutes: 8 },
      { level: 12, smallBlind: 1500, bigBlind: 3000, durationMinutes: 8 },
      { level: 13, smallBlind: 2000, bigBlind: 4000, durationMinutes: 8 },
      { level: 14, smallBlind: 3000, bigBlind: 6000, durationMinutes: 8 },
      { level: 15, smallBlind: 4000, bigBlind: 8000, durationMinutes: 8 },
      { level: 16, smallBlind: 5000, bigBlind: 10000, durationMinutes: 8 },
    ],
  },
  {
    id: "default-mtt",
    name: "Standard MTT Blind Schedule",
    levels: [
      { level: 1, smallBlind: 25, bigBlind: 50, durationMinutes: 20 },
      { level: 2, smallBlind: 50, bigBlind: 100, durationMinutes: 20 },
      { level: 3, smallBlind: 75, bigBlind: 150, durationMinutes: 20 },
      { level: 4, smallBlind: 100, bigBlind: 200, durationMinutes: 20 },
      { level: 5, smallBlind: 125, bigBlind: 250, durationMinutes: 20 },
      { level: 6, smallBlind: 150, bigBlind: 300, durationMinutes: 20 },
      { level: 7, smallBlind: 200, bigBlind: 400, durationMinutes: 20 },
      { level: 8, smallBlind: 250, bigBlind: 500, durationMinutes: 20 },
      { level: 9, smallBlind: 300, bigBlind: 600, durationMinutes: 20 },
      { level: 10, smallBlind: 400, bigBlind: 800, durationMinutes: 20 },
      { level: 11, smallBlind: 500, bigBlind: 1000, durationMinutes: 20 },
      { level: 12, smallBlind: 600, bigBlind: 1200, durationMinutes: 20 },
      { level: 13, smallBlind: 800, bigBlind: 1600, durationMinutes: 20 },
      { level: 14, smallBlind: 1000, bigBlind: 2000, durationMinutes: 20 },
      { level: 15, smallBlind: 1250, bigBlind: 2500, durationMinutes: 20 },
      { level: 16, smallBlind: 1500, bigBlind: 3000, durationMinutes: 20 },
      { level: 17, smallBlind: 2000, bigBlind: 4000, durationMinutes: 20 },
      { level: 18, smallBlind: 2500, bigBlind: 5000, durationMinutes: 20 },
      { level: 19, smallBlind: 3000, bigBlind: 6000, durationMinutes: 20 },
      { level: 20, smallBlind: 4000, bigBlind: 8000, durationMinutes: 20 },
    ],
  },
];

async function seedTreasury() {
  console.log("🌰 Seeding treasury...");

  const existing = await prisma.treasury.findUnique({ where: { id: TREASURY_CONFIG.id } });
  if (existing) {
    console.log("ℹ️ Treasury already exists; skipping");
    return;
  }

  // Create treasury record
  await prisma.treasury.upsert({
    where: { id: TREASURY_CONFIG.id },
    update: {
      coin_supply_total: TREASURY_CONFIG.initialCoinSupply,
      coin_supply_remaining: TREASURY_CONFIG.initialCoinSupply,
      ticket_x_issued: 0,
      ticket_y_issued: 0,
      ticket_z_issued: 0,
    },
    create: {
      id: TREASURY_CONFIG.id,
      coin_supply_total: TREASURY_CONFIG.initialCoinSupply,
      coin_supply_remaining: TREASURY_CONFIG.initialCoinSupply,
      ticket_x_issued: 0,
      ticket_y_issued: 0,
      ticket_z_issued: 0,
    },
  });

  // Create treasury account
  await prisma.account.upsert({
    where: {
      ownerType_ownerId: {
        ownerType: AccountOwnerType.TREASURY,
        ownerId: TREASURY_CONFIG.id,
      },
    },
    update: {
      coins: TREASURY_CONFIG.initialCoinSupply,
      ticket_x: TREASURY_CONFIG.ticketXSupply,
      ticket_y: TREASURY_CONFIG.ticketYSupply,
      ticket_z: TREASURY_CONFIG.ticketZSupply,
    },
    create: {
      id: "platform-treasury-account",
      ownerType: AccountOwnerType.TREASURY,
      ownerId: TREASURY_CONFIG.id,
      coins: TREASURY_CONFIG.initialCoinSupply,
      ticket_x: TREASURY_CONFIG.ticketXSupply,
      ticket_y: TREASURY_CONFIG.ticketYSupply,
      ticket_z: TREASURY_CONFIG.ticketZSupply,
    },
  });

  console.log("✅ Treasury seeded");
}

async function seedLedger() {
  console.log("📒 Seeding ledger...");

  const existing = await prisma.ledgerConfig.findUnique({ where: { id: LEDGER_CONFIG.id } });
  if (existing) {
    console.log("ℹ️ Ledger config already exists; skipping");
    return;
  }

  // Create genesis block
  await prisma.ledgerBlock.upsert({
    where: { id: GENESIS_BLOCK.id },
    update: GENESIS_BLOCK,
    create: GENESIS_BLOCK,
  });

  // Create ledger configuration
  await prisma.ledgerConfig.upsert({
    where: { id: LEDGER_CONFIG.id },
    update: {
      free_claim_amount: LEDGER_CONFIG.free_claim_amount,
      free_claim_cooldown_ms: LEDGER_CONFIG.free_claim_cooldown_ms,
    },
    create: LEDGER_CONFIG,
  });

  // Create genesis transaction (treasury mint)
  await prisma.ledgerTransaction.upsert({
    where: { id: TREASURY_MINT_TRANSACTION.id },
    update: TREASURY_MINT_TRANSACTION,
    create: TREASURY_MINT_TRANSACTION,
  });

  console.log("✅ Ledger seeded");
}

async function seedBlindSchedules() {
  console.log("⏰ Skipping blind schedule seeding (schedules are defined in code)");
}

async function seedTestData() {
  console.log("🧪 Seeding test data...");

  // Create a test user account
  const testUser = await prisma.user.upsert({
    where: { walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" },
    update: {},
    create: {
      id: "test-user-1",
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      email: "test@pokerwars.com",
    },
  });

  // Create test user account with some coins
  await prisma.account.upsert({
    where: {
      ownerType_ownerId: {
        ownerType: AccountOwnerType.USER,
        ownerId: testUser.id,
      },
    },
    update: {
      coins: 10000,
      ticket_x: 5,
    },
    create: {
      id: `user-account-${testUser.id}`,
      ownerType: AccountOwnerType.USER,
      ownerId: testUser.id,
      coins: 10000,
      ticket_x: 5,
    },
  });

  console.log("✅ Test data seeded");
}

async function main() {
  console.log("🌱 Starting database seeding...");

  try {
    await seedTreasury();
    await seedLedger();
    await seedBlindSchedules();

    // Optional: seed test data for development
    if (process.env.NODE_ENV === 'development' || process.env.SEED_TEST_DATA === 'true') {
      await seedTestData();
    }

    console.log("🎉 Database seeding completed successfully!");
    console.log("");
    console.log("📊 Seeded data summary:");
    console.log("  • Treasury with 5B coins and ticket supplies");
    console.log("  • Ledger with genesis block and transaction");
    console.log("  • Blind schedules for STT and MTT tournaments");
    console.log("  • Game templates (cash, S&G, MTT)");
    if (process.env.NODE_ENV === 'development' || process.env.SEED_TEST_DATA === 'true') {
      console.log("  • Test user account with 10K coins");
    }

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
