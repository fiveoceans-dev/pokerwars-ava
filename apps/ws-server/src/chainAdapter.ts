import { randomUUID } from "crypto";
import { TicketTier } from "./ledgerService";
import { LedgerPort } from "./ledgerPort";
import { Asset } from "@prisma/client";

export interface ChainTxReceipt<T = any> {
  txHash: string;
  blockNumber: number;
  status: "success" | "failed";
  payload?: T;
}

/**
 * Lightweight chain abstraction that makes DB-backed ledger calls look like
 * blockchain transactions. Keeps UI/backend decoupled from storage choice.
 */
export class ChainAdapter {
  constructor(private ledger: LedgerPort) {}

  private receipt<T>(payload: T): ChainTxReceipt<T> {
    return {
      txHash: randomUUID().replace(/-/g, ""),
      blockNumber: Math.floor(Date.now() / 1000),
      status: "success",
      payload,
    };
  }

  async getBalance(wallet: string) {
    const { account } = await this.ledger.getBalanceForWallet(wallet);
    return this.receipt({ balance: account });
  }

  async claim(wallet: string) {
    const res = await this.ledger.claimFreeCoins(wallet);
    if (!res.ok) return this.receipt(res);
    return this.receipt(res);
  }

  async convert(wallet: string, direction: "coinsToTickets" | "ticketsToCoins", tier: TicketTier, amount: number) {
    const account = await this.ledger.convert(wallet, direction, tier, amount);
    return this.receipt({ balance: account });
  }

  async buyInCash(wallet: string, tableId: string, amount: number) {
    await this.ledger.buyIn(wallet, tableId, Asset.COINS, amount);
    return this.receipt({ tableId, amount });
  }

  async refundCash(wallet: string, tableId: string, amount: number) {
    await this.ledger.refund(wallet, tableId, Asset.COINS, amount);
    return this.receipt({ tableId, amount });
  }
}
