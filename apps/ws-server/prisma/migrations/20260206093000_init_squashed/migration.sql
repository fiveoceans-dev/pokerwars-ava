-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('STT', 'MTT');

-- CreateEnum
CREATE TYPE "TournamentStartMode" AS ENUM ('FULL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTERING', 'SCHEDULED', 'LATE_REG', 'RUNNING', 'BREAKING', 'FINISHED', 'CANCELLED', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "BuyInCurrency" AS ENUM ('CHIPS', 'TICKETS');

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('TOP_X_SPLIT', 'TICKETS');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'SEATED', 'BUSTED', 'CASHED');

-- CreateEnum
CREATE TYPE "Asset" AS ENUM ('COINS', 'TICKET_X', 'TICKET_Y', 'TICKET_Z');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('MINT', 'BURN', 'TRANSFER', 'BUY_IN', 'REFUND', 'PAYOUT', 'CONVERT_BUY', 'CONVERT_SELL', 'CLAIM_FREE');

-- CreateEnum
CREATE TYPE "AccountOwnerType" AS ENUM ('USER', 'TREASURY', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "GameTemplateType" AS ENUM ('CASH', 'SNG', 'MTT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerType" "AccountOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "coins" BIGINT NOT NULL DEFAULT 0,
    "ticket_x" BIGINT NOT NULL DEFAULT 0,
    "ticket_y" BIGINT NOT NULL DEFAULT 0,
    "ticket_z" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "blockId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "fromAccountId" TEXT,
    "toAccountId" TEXT,
    "asset" "Asset" NOT NULL,
    "amount" BIGINT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treasury" (
    "id" TEXT NOT NULL,
    "coin_supply_total" BIGINT NOT NULL,
    "coin_supply_remaining" BIGINT NOT NULL,
    "ticket_x_issued" INTEGER NOT NULL DEFAULT 0,
    "ticket_y_issued" INTEGER NOT NULL DEFAULT 0,
    "ticket_z_issued" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treasury_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerConfig" (
    "id" TEXT NOT NULL DEFAULT 'DEFAULT',
    "coin_supply_total" BIGINT NOT NULL DEFAULT 5000000000,
    "free_claim_amount" INTEGER NOT NULL DEFAULT 3000,
    "free_claim_cooldown_ms" INTEGER NOT NULL DEFAULT 18000000,
    "buy_rate" INTEGER NOT NULL DEFAULT 250,
    "sell_rate" INTEGER NOT NULL DEFAULT 220,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerBlock" (
    "id" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "txCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEscrow" (
    "tournamentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentEscrow_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameType" TEXT NOT NULL DEFAULT 'No Limit Hold''em',
    "type" "TournamentType" NOT NULL,
    "startMode" "TournamentStartMode" NOT NULL,
    "startAt" TIMESTAMP(3),
    "lateRegMinutes" INTEGER,
    "status" "TournamentStatus" NOT NULL DEFAULT 'REGISTERING',
    "maxPlayers" INTEGER NOT NULL,
    "startingStack" INTEGER NOT NULL,
    "blindScheduleId" TEXT NOT NULL,
    "buyInCurrency" "BuyInCurrency" NOT NULL,
    "buyInAmount" INTEGER NOT NULL,
    "payoutMode" "PayoutMode" NOT NULL,
    "payoutTopX" INTEGER,
    "payoutTicketCount" INTEGER,
    "tableConfigId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentLevel" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "levelIndex" INTEGER NOT NULL,
    "smallBlind" INTEGER NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "ante" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL,

    CONSTRAINT "TournamentLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRegistration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tableId" TEXT,
    "seatIndex" INTEGER,
    "stack" INTEGER,
    "position" INTEGER,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTable" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "engineTableId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEvent" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPayout" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "BuyInCurrency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameType" TEXT NOT NULL DEFAULT 'No Limit Hold''em',
    "type" "GameTemplateType" NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "smallBlind" INTEGER NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "minBuyIn" INTEGER NOT NULL,
    "maxBuyIn" INTEGER NOT NULL,
    "defaultBuyIn" INTEGER NOT NULL,
    "currency" "Asset" NOT NULL DEFAULT 'COINS',
    "startMode" "TournamentStartMode",
    "startAt" TIMESTAMP(3),
    "lateRegMinutes" INTEGER,
    "startingStack" INTEGER,
    "blindScheduleId" TEXT,
    "payoutMode" "PayoutMode",
    "payoutTopX" INTEGER,
    "payoutTicketCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_ownerType_ownerId_key" ON "Account"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_seq_key" ON "LedgerTransaction"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_hash_key" ON "LedgerTransaction"("hash");

-- CreateIndex
CREATE INDEX "LedgerTransaction_createdAt_idx" ON "LedgerTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_fromAccountId_idx" ON "LedgerTransaction"("fromAccountId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_toAccountId_idx" ON "LedgerTransaction"("toAccountId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_blockId_idx" ON "LedgerTransaction"("blockId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_referenceType_referenceId_idx" ON "LedgerTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerBlock_height_key" ON "LedgerBlock"("height");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEscrow_accountId_key" ON "TournamentEscrow"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentLevel_tournamentId_levelIndex_key" ON "TournamentLevel"("tournamentId", "levelIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "TournamentRegistration"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTable_engineTableId_key" ON "TournamentTable"("engineTableId");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "LedgerBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEscrow" ADD CONSTRAINT "TournamentEscrow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentLevel" ADD CONSTRAINT "TournamentLevel_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTable" ADD CONSTRAINT "TournamentTable_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEvent" ADD CONSTRAINT "TournamentEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPayout" ADD CONSTRAINT "TournamentPayout_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

