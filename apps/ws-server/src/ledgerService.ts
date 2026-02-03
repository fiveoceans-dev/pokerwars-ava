import { PrismaClient, AccountOwnerType, Asset, LedgerType, Prisma } from "@prisma/client";
import crypto from "crypto";

const TREASURY_ID = "TREASURY";
const DEFAULT_CONFIG = {
  id: "DEFAULT",
  coin_supply_total: 5_000_000_000n,
  free_claim_amount: 1_000,
  free_claim_cooldown_ms: 10 * 60 * 60 * 1000, // 10 hours
  buy_rate: 250,  // coins per ticket (buy)
  sell_rate: 220, // coins per ticket (sell)
} as const;

export type TicketTier = "ticket_x" | "ticket_y" | "ticket_z";

const toBigIntAmount = (value: number): bigint => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid amount");
  }
  return BigInt(Math.floor(value));
};

export class LedgerService {
  constructor(private prisma: PrismaClient) {}

  private async getConfig() {
    return this.prisma.ledgerConfig.upsert({
      where: { id: DEFAULT_CONFIG.id },
      update: {},
      create: {
        id: DEFAULT_CONFIG.id,
        coin_supply_total: DEFAULT_CONFIG.coin_supply_total,
        free_claim_amount: DEFAULT_CONFIG.free_claim_amount,
        free_claim_cooldown_ms: DEFAULT_CONFIG.free_claim_cooldown_ms,
        buy_rate: DEFAULT_CONFIG.buy_rate,
        sell_rate: DEFAULT_CONFIG.sell_rate,
      },
    });
  }

  async ensureTreasury() {
    const config = await this.getConfig();
    const existing = await this.prisma.treasury.findUnique({ where: { id: TREASURY_ID } });
    if (existing) {
      const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
      if (treasuryAccount.coins === 0n && existing.coin_supply_remaining > 0n) {
        await this.prisma.account.update({
          where: { id: treasuryAccount.id },
          data: { coins: existing.coin_supply_remaining },
        });
      }
      return existing;
    }
    const treasury = await this.prisma.treasury.create({
      data: {
        id: TREASURY_ID,
        coin_supply_total: config.coin_supply_total,
        coin_supply_remaining: config.coin_supply_total,
      },
    });
    const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
    await this.prisma.account.update({
      where: { id: treasuryAccount.id },
      data: { coins: config.coin_supply_total },
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
    const config = await this.getConfig();
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
      if (diff < config.free_claim_cooldown_ms) {
        return { ok: false, nextAvailableInMs: config.free_claim_cooldown_ms - diff };
      }
    }

    const updated = await this.applyTransfer({
      type: LedgerType.CLAIM_FREE,
      fromAccountId: treasuryAccount.id,
      toAccountId: userAccount.id,
      asset: Asset.COINS,
      amount: config.free_claim_amount,
      referenceType: "USER",
      referenceId: user.id,
      metadata: { wallet },
    });
    await this.prisma.treasury.update({
      where: { id: TREASURY_ID },
      data: { coin_supply_remaining: { decrement: BigInt(config.free_claim_amount) } },
    });
    return { ok: true, account: updated.to };
  }

  async convert(wallet: string, direction: "coinsToTickets" | "ticketsToCoins", tier: TicketTier, amount: number) {
    const config = await this.getConfig();
    await this.ensureTreasury();
    const user = await this.getOrCreateUserByWallet(wallet);
    const treasuryAccount = await this.ensureAccount(AccountOwnerType.TREASURY, TREASURY_ID);
    const userAccount = await this.ensureAccount(AccountOwnerType.USER, user.id);
    const rate = direction === "coinsToTickets" ? config.buy_rate : config.sell_rate;
    const coinsDelta = amount * rate;
    const coinsDeltaBig = toBigIntAmount(coinsDelta);
    const amountBig = toBigIntAmount(amount);

    if (direction === "coinsToTickets") {
      if (userAccount.coins < coinsDeltaBig) throw new Error("Insufficient coins");
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
      const treasuryTickets = (treasuryAccount as any)[tier] as bigint;
      if (treasuryTickets < amountBig) {
        const mintAmount = Number(amountBig - treasuryTickets);
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
    if ((userAccount as any)[tier] < amountBig) throw new Error("Insufficient tickets");
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
    const amount = toBigIntAmount(params.amount);
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
          const block = await ensureBlock(tx, { seq, hash, prevHash });

          let fromAccount = null;
          let toAccount = null;

          if (params.fromAccountId) {
            fromAccount = await tx.account.findUnique({ where: { id: params.fromAccountId } });
            if (!fromAccount) throw new Error("from account missing");
            const field = assetToField(params.asset);
            if ((fromAccount as any)[field] < amount) {
              throw new Error("insufficient balance");
            }
            fromAccount = await tx.account.update({
              where: { id: params.fromAccountId },
              data: { [field]: { decrement: amount } } as any,
            });
          }

          if (params.toAccountId) {
            toAccount = await tx.account.update({
              where: { id: params.toAccountId },
              data: { [assetToField(params.asset)]: { increment: amount } } as any,
            });
          }

          const entry = await tx.ledgerTransaction.create({
            data: {
              seq,
              prevHash,
              hash,
              blockId: block?.id ?? null,
              type: params.type,
              fromAccountId: params.fromAccountId,
              toAccountId: params.toAccountId,
              asset: params.asset,
              amount,
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
                data: { coin_supply_remaining: treasuryAccount.coins },
              });
            }
          }

          return { entry, from: fromAccount, to: toAccount };
        });
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < maxRetries) {
          const target = String(err?.meta?.target || "");
          if (target.includes("seq") || target.includes("height")) {
            attempt += 1;
            continue; // retry on ledger tx seq or block height contention
          }
        }
        throw err;
      }
    }
  }
}

async function ensureBlock(
  tx: Prisma.TransactionClient,
  payload: { seq: number; hash: string; prevHash: string | null },
) {
  const BLOCK_SIZE = 100;
  const height = Math.ceil(payload.seq / BLOCK_SIZE);
  const existing = await tx.ledgerBlock.findUnique({
    where: { height },
    select: { id: true, prevHash: true },
  });
  if (existing) {
    const blockHash = computeHash({
      height,
      prevHash: existing.prevHash,
      lastTxHash: payload.hash,
      lastTxSeq: payload.seq,
    });
    await tx.ledgerBlock.update({
      where: { id: existing.id },
      data: { txCount: { increment: 1 }, hash: blockHash },
    });
    return existing;
  }
  const prevBlock = await tx.ledgerBlock.findFirst({
    orderBy: { height: "desc" },
    select: { hash: true },
  });
  const blockHash = computeHash({
    height,
    prevHash: prevBlock?.hash ?? null,
    lastTxHash: payload.hash,
    lastTxSeq: payload.seq,
  });
  return tx.ledgerBlock.create({
    data: {
      height,
      prevHash: prevBlock?.hash ?? null,
      hash: blockHash,
      txCount: 1,
    },
  });
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
