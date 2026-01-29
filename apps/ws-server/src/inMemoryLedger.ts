import { Asset, AccountOwnerType } from "@prisma/client";
import { LedgerPort } from "./ledgerPort";
import type { TicketTier } from "./ledgerService";

type Account = {
  id: string;
  ownerType: AccountOwnerType;
  ownerId: string;
  coins: number;
  ticket_x: number;
  ticket_y: number;
  ticket_z: number;
};

const FREE_CLAIM_AMOUNT = 1_000;
const FREE_CLAIM_COOLDOWN_MS = 10 * 60 * 60 * 1000;
const BUY_RATE = 250;
const SELL_RATE = 220;

export class InMemoryLedger implements LedgerPort {
  private users = new Map<string, { id: string; walletAddress: string | null; email?: string | null }>();
  private accounts = new Map<string, Account>();
  private lastClaim = new Map<string, number>();

  private accountKey(ownerType: AccountOwnerType, ownerId: string) {
    return `${ownerType}:${ownerId}`;
  }

  private ensureAccount(ownerType: AccountOwnerType, ownerId: string): Account {
    const key = this.accountKey(ownerType, ownerId);
    if (!this.accounts.has(key)) {
      this.accounts.set(key, {
        id: key,
        ownerType,
        ownerId,
        coins: ownerType === AccountOwnerType.TREASURY ? 5_000_000_000 : 0,
        ticket_x: 0,
        ticket_y: 0,
        ticket_z: 0,
      });
    }
    return this.accounts.get(key)!;
  }

  private getTreasury() {
    return this.ensureAccount(AccountOwnerType.TREASURY, "TREASURY");
  }

  async getUserByWallet(wallet: string) {
    const id = wallet.toLowerCase();
    if (!this.users.has(id)) {
      this.users.set(id, { id, walletAddress: wallet });
    }
    return this.users.get(id)!;
  }

  async updateEmail(wallet: string, email: string) {
    const u = await this.getUserByWallet(wallet);
    u.email = email;
    return u;
  }

  async getBalanceForWallet(wallet: string) {
    const user = await this.getUserByWallet(wallet);
    const account = this.ensureAccount(AccountOwnerType.USER, user.id);
    return { user, account };
  }

  async getLedgerForWallet(_wallet: string, _limit = 20) {
    return []; // stub
  }

  async claimFreeCoins(wallet: string) {
    const { user, account } = await this.getBalanceForWallet(wallet);
    const last = this.lastClaim.get(user.id);
    const now = Date.now();
    if (last && now - last < FREE_CLAIM_COOLDOWN_MS) {
      return { ok: false, nextAvailableInMs: FREE_CLAIM_COOLDOWN_MS - (now - last) };
    }
    account.coins += FREE_CLAIM_AMOUNT;
    this.lastClaim.set(user.id, now);
    return { ok: true, account };
  }

  async convert(wallet: string, direction: "coinsToTickets" | "ticketsToCoins", tier: TicketTier, amount: number) {
    const { account } = await this.getBalanceForWallet(wallet);
    const treasury = this.getTreasury();
    const rate = direction === "coinsToTickets" ? BUY_RATE : SELL_RATE;
    if (direction === "coinsToTickets") {
      const cost = amount * rate;
      if (account.coins < cost) throw new Error("Insufficient coins");
      account.coins -= cost;
      (account as any)[tier] += amount;
      treasury.coins += cost;
      (treasury as any)[tier] -= amount;
    } else {
      if ((account as any)[tier] < amount) throw new Error("Insufficient tickets");
      (account as any)[tier] -= amount;
      account.coins += amount * rate;
    }
    return account;
  }

  async buyIn(wallet: string, tournamentId: string, asset: Asset, amount: number) {
    const { account } = await this.getBalanceForWallet(wallet);
    if ((account as any)[assetToField(asset)] < amount) throw new Error("Insufficient balance");
    (account as any)[assetToField(asset)] -= amount;
    // escrow not modeled; simple debit for local play
    return;
  }

  async refund(wallet: string, _tournamentId: string, asset: Asset, amount: number) {
    const { account } = await this.getBalanceForWallet(wallet);
    (account as any)[assetToField(asset)] += amount;
  }

  async payout(wallet: string, _tournamentId: string, asset: Asset, amount: number, _position?: number) {
    const { account } = await this.getBalanceForWallet(wallet);
    (account as any)[assetToField(asset)] += amount;
  }
}

function assetToField(asset: Asset): string {
  switch (asset) {
    case Asset.COINS:
      return "coins";
    case Asset.TICKET_X:
      return "ticket_x";
    case Asset.TICKET_Y:
      return "ticket_y";
    case Asset.TICKET_Z:
      return "ticket_z";
    default:
      return "coins";
  }
}
