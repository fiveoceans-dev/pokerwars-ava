-- Update MTT max players and payout top X (15% of 10,000 = 1,500)
UPDATE "Tournament"
SET "maxPlayers" = 10000,
    "payoutTopX" = 1500
WHERE "type" = 'MTT';
