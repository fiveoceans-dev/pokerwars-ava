import { Asset } from "@prisma/client";
import type { TicketTier } from "./ledgerService";

export interface LedgerPort {
  getBalanceForWallet(wallet: string): Promise<{ user: { id: string; walletAddress: string | null; email?: string | null }; account: any }>;
  getLedgerForWallet(wallet: string, limit?: number): Promise<any[]>;
  claimFreeCoins(wallet: string): Promise<{ ok: boolean; nextAvailableInMs?: number; account?: any }>;
  convert(wallet: string, direction: "coinsToTickets" | "ticketsToCoins", tier: TicketTier, amount: number): Promise<any>;
  buyIn(wallet: string, tournamentId: string, asset: Asset, amount: number): Promise<void>;
  refund(wallet: string, tournamentId: string, asset: Asset, amount: number): Promise<void>;
  payout(wallet: string, tournamentId: string, asset: Asset, amount: number, position?: number): Promise<void>;
  getUserByWallet(wallet: string): Promise<any>;
  updateEmail(wallet: string, email: string): Promise<any>;
}
