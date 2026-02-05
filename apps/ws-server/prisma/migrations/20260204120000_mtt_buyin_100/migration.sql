-- Set MTT buy-in amount to 100 coins for existing rows
UPDATE "Tournament"
SET "buyInAmount" = 100
WHERE "type" = 'MTT';
