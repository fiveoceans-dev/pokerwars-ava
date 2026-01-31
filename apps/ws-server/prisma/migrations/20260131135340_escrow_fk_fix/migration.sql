-- Drop FK that assumes tournament rows exist for all escrows
ALTER TABLE "TournamentEscrow" DROP CONSTRAINT IF EXISTS "TournamentEscrow_tournamentId_fkey";
