-- CreateEnum
CREATE TYPE "GovernanceRole" AS ENUM ('ADMIN', 'MANAGER', 'PROMOTER');

-- CreateEnum
CREATE TYPE "GovernanceRoleType" AS ENUM ('DIRECTOR', 'MANAGER', 'PROMOTER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BalancePoolType" AS ENUM ('TREASURY', 'PROMO', 'CASH', 'SNG', 'MTT');

-- AlterEnum
ALTER TYPE "AccountOwnerType" ADD VALUE 'PROMO';

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GovernanceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "actionTimeoutSeconds" INTEGER NOT NULL DEFAULT 15,
    "gameStartCountdownSeconds" INTEGER NOT NULL DEFAULT 10,
    "minPlayersToStart" INTEGER NOT NULL DEFAULT 2,
    "maxPlayersPerTable" INTEGER NOT NULL DEFAULT 9,
    "streetDealDelaySeconds" INTEGER NOT NULL DEFAULT 3,
    "newHandDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceAssignment" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "role" "GovernanceRoleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalancePool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "BalancePoolType" NOT NULL,
    "asset" "Asset" NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalancePool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceAssignment_wallet_role_key" ON "GovernanceAssignment"("wallet", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BalancePool_name_key" ON "BalancePool"("name");

-- CreateIndex
CREATE INDEX "BalancePool_type_idx" ON "BalancePool"("type");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalancePool" ADD CONSTRAINT "BalancePool_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
