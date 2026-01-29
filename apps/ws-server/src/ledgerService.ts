import { PrismaClient, AccountOwnerType, Asset, LedgerType } from "@prisma/client";
import crypto from "crypto";

const TREASURY_ID = "TREASURY";
const COIN_SUPPLY_TOTAL = 5_000_000_000n;
const FREE_CLAIM_AMOUNT = 1_000;
const FREE_CLAIM_COOLDOWN_MS = 10 * 60 * 60 * 1000; // 10 hours
const BUY_RATE = 250;  // coins per ticket (buy)
const SELL_RATE = 220; // coins per ticket (sell)

export type TicketTier = "ticket_x" | "ticket_y" | "ticket_z";

export class LedgerService {
  constructor(private prisma: PrismaClient) {}

  async ensureTreasury() {
    const existing = await this.prisma.treasury.findUnique({ where: { id: TREASURY_ID } });
    if (existing) {
      const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
      if (treasuryAccount.coins === 0 && existing.coin_supply_remaining > 0n) {
        await this.prisma.account.update({
          where: { id: treasuryAccount.id },
          data: { coins: Number(existing.coin_supply_remaining) },
        });
      }
      return existing;
    }
    const treasury = await this.prisma.treasury.create({
      data: {
        id: TREASURY_ID,
        coin_supply_total: COIN_SUPPLY_TOTAL,
        coin_supply_remaining: COIN_SUPPLY_TOTAL,
      },
    });
    const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
    await this.prisma.account.update({
      where: { id: treasuryAccount.id },
      data: { coins: Number(COIN_SUPPLY_TOTAL) },
    });
    return treasury;
  }

  async ensureAccount(ownerType: AccountOwnerType, ownerId: string) {
    return this.prisma.account.upsert({
      where: { ownerType_ownerId: { ownerType, ownerId } },
      update: {},
      create: { ownerType, ownerId },
    });
  }

  async getOrCreateUserByWallet(wallet: string) {
    const user = await this.prisma.user.upsert({
      where: { walletAddress: wallet },
      update: {},
      create: { walletAddress: wallet },
    });
    await this.ensureAccount(AccountOwnerType.USER, user.id);
    return user;
  }

  async updateEmail(wallet: string, email: string) {
    const user = await this.prisma.user.upsert({
      where: { walletAddress: wallet },
      update: { email },
      create: { walletAddress: wallet, email },
    });
    await this.ensureAccount(AccountOwnerType.USER, user.id);
    return user;
  }

  async getUserAccountByWallet(wallet: string) {
    const user = await this.prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (!user) return null;
    return this.prisma.account.findUnique({
      where: { ownerType_ownerId: { ownerType: AccountOwnerType.USER, ownerId: user.id } },
    });
  }

  async getUserByWallet(wallet: string) {
    return this.prisma.user.findUnique({ where: { walletAddress: wallet } });
  }

  async getLedgerForWallet(wallet: string, limit = 20) {
    const user = await this.getUserByWallet(wallet);
    if (!user) return [];
    const account = await this.prisma.account.findUnique({
      where: { ownerType_ownerId: { ownerType: AccountOwnerType.USER, ownerId: user.id } },
    });
    if (!account) return [];
    return this.prisma.ledgerTransaction.findMany({
      where: {
        OR: [{ fromAccountId: account.id }, { toAccountId: account.id }],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getBalanceForWallet(wallet: string) {
    const user = await this.getOrCreateUserByWallet(wallet);
    const account = await this.ensureAccount(AccountOwnerType.USER, user.id);
    return { user, account };
  }

  async claimFreeCoins(wallet: string) {
    await this.ensureTreasury();
    const user = await this.getOrCreateUserByWallet(wallet);
    const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);

    const lastClaim = await this.prisma.ledgerTransaction.findFirst({
      where: { toAccountId: userAccount.id, type: LedgerType.CLAIM_FREE },
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    if (lastClaim) {
      const diff = now - new Date(lastClaim.createdAt).getTime();
      if (diff < FREE_CLAIM_COOLDOWN_MS) {
        return { ok: false, nextAvailableInMs: FREE_CLAIM_COOLDOWN_MS - diff };
      }
    }

    const updated = await this.applyTransfer({
      type: LedgerType.CLAIM_FREE,
      fromAccountId: treasuryAccount.id,
      toAccountId: userAccount.id,
      asset: Asset.COINS,
      amount: FREE_CLAIM_AMOUNT,
      referenceType: "USER",
      referenceId: user.id,
      metadata: { wallet },
    });
    await this.prisma.treasury.update({
      where: { id: TREASURY_ID },
      data: { coin_supply_remaining: { decrement: BigInt(FREE_CLAIM_AMOUNT) } },
    });
    return { ok: true, account: updated.to };
  }

  async convert(wallet: string, direction: "coinsToTickets" | "ticketsToCoins", tier: TicketTier, amount: number) {
    await this.ensureTreasury();
    const user = await this.getOrCreateUserByWallet(wallet);
    const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);
    const rate = direction === "coinsToTickets" ? BUY_RATE : SELL_RATE;
    const coinsDelta = amount * rate;

    if (direction === "coinsToTickets") {
      if (userAccount.coins < coinsDelta) throw new Error("Insufficient coins");
      // coins -> treasury
      await this.applyTransfer({
        type: LedgerType.CONVERT_BUY,
        fromAccountId: userAccount.id,
        toAccountId: treasuryAccount.id,
        asset: Asset.COINS,
        amount: coinsDelta,
        referenceType: "USER",
        referenceId: user.id,
        metadata: { tier, amount, rate },
      });
      // mint tickets into treasury if needed
      const treasuryTickets = (treasuryAccount as any)[tier] as number;
      if (treasuryTickets < amount) {
        const mintAmount = amount - treasuryTickets;
        await this.applyTransfer({
          type: LedgerType.MINT,
          fromAccountId: null,
          toAccountId: treasuryAccount.id,
          asset: tierToAsset(tier),
          amount: mintAmount,
          referenceType: "TREASURY",
          referenceId: TREASURY_ID,
          metadata: { tier, amount: mintAmount },
        });
        await this.prisma.treasury.update({
          where: { id: TREASURY_ID },
          data: { [`${tier}_issued`]: { increment: mintAmount } } as any,
        });
      }
      // treasury -> user (tickets)
      await this.applyTransfer({
        type: LedgerType.CONVERT_BUY,
        fromAccountId: treasuryAccount.id,
        toAccountId: userAccount.id,
        asset: tierToAsset(tier),
        amount,
        referenceType: "USER",
        referenceId: user.id,
        metadata: { tier, amount, rate },
      });
      return this.ensureAccount(AccountOwnerType.USER, user.id);
    }

    // tickets -> coins
    if ((userAccount as any)[tier] < amount) throw new Error("Insufficient tickets");
    await this.applyTransfer({
      type: LedgerType.CONVERT_SELL,
      fromAccountId: userAccount.id,
      toAccountId: treasuryAccount.id,
      asset: tierToAsset(tier),
      amount,
      referenceType: "USER",
      referenceId: user.id,
      metadata: { tier, amount, rate },
    });
    await this.applyTransfer({
      type: LedgerType.CONVERT_SELL,
      fromAccountId: treasuryAccount.id,
      toAccountId: userAccount.id,
      asset: Asset.COINS,
      amount: coinsDelta,
      referenceType: "USER",
      referenceId: user.id,
      metadata: { tier, amount, rate },
    });
    return this.ensureAccount(AccountOwnerType.USER, user.id);
  }

  async buyIn(wallet: string, tournamentId: string, asset: Asset, amount: number) {
    const user = await this.getOrCreateUserByWallet(wallet);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);
    const escrowAccount = await this.ensureTournamentEscrow(tournamentId);
    if ((userAccount as any)[assetToField(asset)] < amount) throw new Error("Insufficient balance");
    await this.applyTransfer({
      type: LedgerType.BUY_IN,
      fromAccountId: userAccount.id,
      toAccountId: escrowAccount.id,
      asset,
      amount,
      referenceType: "TOURNAMENT",
      referenceId: tournamentId,
      metadata: { wallet },
    });
  }

  async refund(wallet: string, tournamentId: string, asset: Asset, amount: number) {
    const user = await this.getOrCreateUserByWallet(wallet);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);
    const escrowAccount = await this.ensureTournamentEscrow(tournamentId);
    await this.applyTransfer({
      type: LedgerType.REFUND,
      fromAccountId: escrowAccount.id,
      toAccountId: userAccount.id,
      asset,
      amount,
      referenceType: "TOURNAMENT",
      referenceId: tournamentId,
      metadata: { wallet },
    });
  }

  async payout(wallet: string, tournamentId: string, asset: Asset, amount: number, position?: number) {
    const user = await this.getOrCreateUserByWallet(wallet);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);
    const escrowAccount = await this.ensureTournamentEscrow(tournamentId);
    await this.applyTransfer({
      type: LedgerType.PAYOUT,
      fromAccountId: escrowAccount.id,
      toAccountId: userAccount.id,
      asset,
      amount,
      referenceType: "TOURNAMENT",
      referenceId: tournamentId,
      metadata: { wallet, position },
    });
  }

  private async ensureTournamentEscrow(tournamentId: string) {
    const existing = await this.prisma.tournamentEscrow.findUnique({ where: { tournamentId } });
    if (existing) {
      return this.prisma.account.findUniqueOrThrow({ where: { id: existing.accountId } });
    }
    const account = await this.ensureAccount(AccountOwnerType.TOURNAMENT, tournamentId);
    await this.prisma.tournamentEscrow.create({
      data: { tournamentId, accountId: account.id },
    });
    return account;
  }

  private async applyTransfer(params: {
    type: LedgerType;
    fromAccountId: string | null;
    toAccountId: string | null;
    asset: Asset;
    amount: number;
    referenceType: string;
    referenceId: string;
    metadata?: Record<string, any>;
  }) {
    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.ledgerTransaction.findFirst({
            orderBy: { seq: "desc" },
            select: { seq: true, hash: true },
          });
          const seq = (last?.seq ?? 0) + 1;
          const prevHash = last?.hash ?? null;
          const hash = computeHash({
            seq,
            prevHash,
            ...params,
          });

          let fromAccount = null;
          let toAccount = null;

          if (params.fromAccountId) {
            fromAccount = await tx.account.findUnique({ where: { id: params.fromAccountId } });
            if (!fromAccount) throw new Error("from account missing");
            const field = assetToField(params.asset);
            if ((fromAccount as any)[field] < params.amount) {
              throw new Error("insufficient balance");
            }
            fromAccount = await tx.account.update({
              where: { id: params.fromAccountId },
              data: { [field]: { decrement: params.amount } } as any,
            });
          }

          if (params.toAccountId) {
            toAccount = await tx.account.update({
              where: { id: params.toAccountId },
              data: { [assetToField(params.asset)]: { increment: params.amount } } as any,
            });
          }

          const entry = await tx.ledgerTransaction.create({
            data: {
              seq,
              prevHash,
              hash,
              type: params.type,
              fromAccountId: params.fromAccountId,
              toAccountId: params.toAccountId,
              asset: params.asset,
              amount: params.amount,
              referenceType: params.referenceType,
              referenceId: params.referenceId,
              metadata: params.metadata ?? {},
            },
          });

          if (params.asset === Asset.COINS) {
            const treasuryAccount = await tx.account.findUnique({
              where: { ownerType_ownerId: { ownerType: AccountOwnerType.TREASURY, ownerId: TREASURY_ID } },
            });
            if (treasuryAccount) {
              await tx.treasury.update({
                where: { id: TREASURY_ID },
                data: { coin_supply_remaining: BigInt(treasuryAccount.coins) },
              });
            }
          }

          return { entry, from: fromAccount, to: toAccount };
        });
      } catch (err: any) {
        if (err?.code === "P2002" && String(err?.meta?.target || "").includes("seq") && attempt < maxRetries) {
          attempt += 1;
          continue; // retry on seq unique constraint
        }
        throw err;
      }
    }
  }
}

function tierToAsset(tier: TicketTier): Asset {
  if (tier === "ticket_x") return Asset.TICKET_X;
  if (tier === "ticket_y") return Asset.TICKET_Y;
  return Asset.TICKET_Z;
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

function computeHash(payload: Record<string, any>): string {
  const input = JSON.stringify(payload);
  return crypto.createHash("sha256").update(input).digest("hex");
}
