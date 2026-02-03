-- Convert account balances and ledger amounts to BIGINT to avoid overflow.
ALTER TABLE "Account" ALTER COLUMN "coins" TYPE BIGINT USING "coins"::BIGINT;
ALTER TABLE "Account" ALTER COLUMN "ticket_x" TYPE BIGINT USING "ticket_x"::BIGINT;
ALTER TABLE "Account" ALTER COLUMN "ticket_y" TYPE BIGINT USING "ticket_y"::BIGINT;
ALTER TABLE "Account" ALTER COLUMN "ticket_z" TYPE BIGINT USING "ticket_z"::BIGINT;

ALTER TABLE "LedgerTransaction" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;
