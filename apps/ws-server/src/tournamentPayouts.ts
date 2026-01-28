import { logger } from "@hyper-poker/engine/utils/logger";
import type { TournamentPayoutEntry } from "./tournamentTypes";
import type { TournamentState } from "./tournamentManager";

export function calculatePayouts(t: TournamentState, finishOrder: string[]): TournamentPayoutEntry[] {
  if (!finishOrder.length) return [];

  const payouts: TournamentPayoutEntry[] = [];
  const currency = t.buyIn.currency;

  if (t.payout.mode === "tickets") {
    const count = t.payout.ticketCount || 1;
    for (let i = 0; i < Math.min(count, finishOrder.length); i++) {
      payouts.push({
        playerId: finishOrder[i],
        position: i + 1,
        amount: 1,
        currency: "tickets",
      });
    }
    return payouts;
  }

  // Simple top-X split equally for now
  const topX = t.payout.topX || 1;
  const prizePool = t.buyIn.amount * finishOrder.length;
  const share = Math.floor(prizePool / topX);
  for (let i = 0; i < Math.min(topX, finishOrder.length); i++) {
    payouts.push({
      playerId: finishOrder[i],
      position: i + 1,
      amount: share,
      currency,
    });
  }

  if (payouts.length === 0) {
    logger.warn(`⚠️ No payouts computed for ${t.id}, fallback to winner takes all`);
    payouts.push({
      playerId: finishOrder[0],
      position: 1,
      amount: prizePool,
      currency,
    });
  }

  return payouts;
}
