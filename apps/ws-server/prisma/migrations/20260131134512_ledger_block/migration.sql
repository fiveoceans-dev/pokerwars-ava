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

-- CreateIndex
CREATE UNIQUE INDEX "LedgerBlock_height_key" ON "LedgerBlock"("height");

-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN "blockId" TEXT;

-- CreateIndex
CREATE INDEX "LedgerTransaction_blockId_idx" ON "LedgerTransaction"("blockId");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "LedgerBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
