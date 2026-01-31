-- CreateTable
CREATE TABLE "LedgerConfig" (
    "id" TEXT NOT NULL DEFAULT 'DEFAULT',
    "coin_supply_total" BIGINT NOT NULL DEFAULT 5000000000,
    "free_claim_amount" INTEGER NOT NULL DEFAULT 1000,
    "free_claim_cooldown_ms" INTEGER NOT NULL DEFAULT 36000000,
    "buy_rate" INTEGER NOT NULL DEFAULT 250,
    "sell_rate" INTEGER NOT NULL DEFAULT 220,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerConfig_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "LedgerTransaction_hash_key" ON "LedgerTransaction"("hash");
CREATE INDEX "LedgerTransaction_reference_idx" ON "LedgerTransaction"("referenceType", "referenceId");

-- Constraints
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_from_to_present" CHECK ("fromAccountId" IS NOT NULL OR "toAccountId" IS NOT NULL);

-- Foreign keys
ALTER TABLE "TournamentEscrow" ADD CONSTRAINT "TournamentEscrow_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
