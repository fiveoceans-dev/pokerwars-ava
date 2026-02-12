import { EventEngine, type Table, type ActionType, getBettingLimits } from "@hyper-poker/engine";
import { logger } from "@hyper-poker/engine/utils/logger";

const BOT_PREFIX = "bot_";

export type BotStyle = "tight" | "aggressive" | "loose" | "random" | "balanced";
export interface BotConfig {
  style: BotStyle;
  minDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_STYLE: BotStyle = "random";
const DEFAULT_MIN_DELAY = 350;
const DEFAULT_MAX_DELAY = 1100;
const FAILSAFE_DELAY_MS = 1500;
const STYLE_DELAYS: Record<BotStyle, { min: number; max: number }> = {
  random: { min: 300, max: 1200 },
  tight: { min: 450, max: 1200 },
  loose: { min: 300, max: 900 },
  aggressive: { min: 250, max: 800 },
  balanced: { min: 350, max: 1000 },
};

/**
 * Lightweight bot runner for house bots.
 * Listens to table state changes and auto-acts when the actor seat is a bot.
 */
export class BotManager {
  private timers = new Map<string, NodeJS.Timeout>();
  private failsafes = new Map<string, NodeJS.Timeout>();
  private turnTokens = new Map<string, string>();
  private botStyles = new Map<string, BotConfig>(); // tableId -> config

  setTableStyle(tableId: string, cfg: BotConfig) {
    this.botStyles.set(tableId, cfg);
  }

  attach(engine: EventEngine, tableId: string) {
    const handler = (table: Table) => this.maybeAct(engine, tableId, table);
    // Respond to state changes and processed events (for safety)
    engine.on("stateChanged", handler);
    engine.on("eventProcessed", (_event: any, table: Table) => handler(table));
    // Also react to timer turn start events (TimerIntegration emits turnStarted)
    engine.on("turnStarted", ({ seat }: any) => {
      try {
        const table = engine.getState();
        if (table.actor === seat) {
          this.maybeAct(engine, tableId, table);
        }
      } catch (err) {
        logger.error(`❌ [Bot] turnStarted handler failed for ${tableId}`, err);
      }
    });
  }

  private maybeAct(engine: EventEngine, tableId: string, table: Table) {
    const actor = table.actor;
    if (actor === undefined || actor === null || actor < 0) return;
    const seat = table.seats[actor];
    if (!seat?.pid || !seat.pid.toLowerCase().startsWith(BOT_PREFIX)) return;
    if (seat.status && ["folded", "empty", "sittingOut", "waiting"].includes(seat.status)) {
      logger.debug(`🤖 [Bot] Skipping (status=${seat.status}) seat ${actor} pid=${seat.pid}`);
      return;
    }
    if (!["preflop", "flop", "turn", "river", "showdown", "payout"].includes(table.phase)) {
      logger.debug(`🤖 [Bot] Skipping phase ${table.phase}`);
      return;
    }

    // Special handling for showdown/payout phases (decide to show or muck)
    if (["showdown", "payout"].includes(table.phase)) {
      const winners = new Set((table.winnersPids || []).map((p) => p.toLowerCase()));
      const isWinner = winners.has(seat.pid.toLowerCase());
      
      // If already revealed, nothing to do
      const revealed = new Set((table.revealedPids || []).map((p) => p.toLowerCase()));
      if (revealed.has(seat.pid.toLowerCase())) return;

      const token = `${table.handNumber}:${table.phase}:${actor}`;
      if (this.turnTokens.get(tableId) === token) return;
      this.turnTokens.set(tableId, token);

      const delay = 500 + Math.floor(Math.random() * 1000);
      setTimeout(async () => {
        try {
          if (isWinner) {
            // Winners always show
            await engine.dispatch({ t: "PlayerShowCards", pid: seat.pid! });
          } else {
            // Losers muck cards (don't show)
            await engine.dispatch({ t: "PlayerMuckCards", pid: seat.pid! });
          }
        } catch (err) {
          logger.error(`❌ [Bot] Show/Muck failed for ${seat.pid}`, err);
        }
      }, delay);
      return;
    }

    const streetCommitted = seat.streetCommitted ?? 0;
    const token = `${table.handNumber}:${table.street}:${actor}:${table.currentBet}:${streetCommitted}`;
    if (this.turnTokens.get(tableId) === token) {
      logger.debug(`🤖 [Bot] Duplicate turn token ${token} on ${tableId}, skipping`);
      return;
    }
    this.turnTokens.set(tableId, token);

    const existing = this.timers.get(tableId);
    if (existing) clearTimeout(existing);

    const cfg = this.botStyles.get(tableId) ?? { style: DEFAULT_STYLE };
    const styleDelay = STYLE_DELAYS[cfg.style] ?? { min: DEFAULT_MIN_DELAY, max: DEFAULT_MAX_DELAY };
    const minDelay = cfg.minDelayMs ?? styleDelay.min;
    const maxDelay = cfg.maxDelayMs ?? styleDelay.max;
    const delay = minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay)); // keep it snappy but human-ish
    const timer = setTimeout(() => {
      this.timers.delete(tableId);
      void this.act(engine, tableId, cfg.style);
    }, delay);
    this.timers.set(tableId, timer);

    // Failsafe: if bot still actor after delay, force an action to avoid stalling
    const existingFs = this.failsafes.get(tableId);
    if (existingFs) clearTimeout(existingFs);
    const fs = setTimeout(() => {
      this.failsafes.delete(tableId);
      this.forceProgress(engine, tableId, cfg.style);
    }, Math.max(FAILSAFE_DELAY_MS, maxDelay + 300));
    this.failsafes.set(tableId, fs);

    logger.debug(
      `🤖 [Bot] Queued action for ${seat.pid} on ${tableId} token=${token} delay=${delay}ms style=${cfg.style}`,
    );
  }

  private async act(engine: EventEngine, tableId: string, style: BotStyle) {
    try {
      const table = engine.getState();
      const actor = table.actor;
      if (actor === undefined || actor === null || actor < 0) return;
      const seat = table.seats[actor];
      if (!seat?.pid || !seat.pid.toLowerCase().startsWith(BOT_PREFIX)) return;
      if (seat.status && ["folded", "empty", "sittingOut", "waiting"].includes(seat.status)) return;

      const toCall = Math.max(0, table.currentBet - (seat.streetCommitted ?? 0));
      const chips = seat.chips ?? 0;
      const pot =
        (table.pots || []).reduce((sum, p: any) => sum + (p?.amount || 0), 0) +
        table.currentBet * (table.seats.filter((s) => s?.status === "active").length || 0);
      const playersLeft = table.seats.filter((s) => s?.pid).length;
      const position =
        table.button !== undefined && table.button !== null
          ? (actor - table.button + playersLeft + 1) % playersLeft
          : 0;
      const ctx: BotContext = {
        style,
        toCall,
        pot,
        stack: chips,
        bb: table.blinds.bb,
        street: (table.street as any) || "preflop",
        position,
        playersLeft,
        holeCards: seat.holeCards,
        board: table.communityCards,
      };

      const availableActions = engine.getPlayerAvailableActions(actor);
      if (!availableActions.length) {
        logger.debug(`🤖 [Bot] No available actions for ${seat.pid} on ${tableId}, skipping`);
        return;
      }
      const limits = getBettingLimits(table, actor);
      const { action, amount } = ensureDecision(
        decideAction(ctx, availableActions, limits),
        availableActions,
        limits,
        ctx,
      );

      // Normalize actions that require amount
      let normalizedAction = action;
      let normalizedAmount = amount;
      if (normalizedAction === "CALL" && toCall === 0) {
        normalizedAction = "CHECK";
        normalizedAmount = undefined;
      }

      await engine.dispatch({
        t: "Action",
        seat: actor,
        action: normalizedAction,
        amount: normalizedAmount,
      });
      logger.info(`🤖 [Bot] ${seat.pid} (${style}) acted ${normalizedAction}${normalizedAmount ? ` (${normalizedAmount})` : ""} on ${tableId}`);
    } catch (err) {
      logger.error(`❌ [Bot] Failed to act on table ${tableId}:`, err);
      // Allow re-attempt on next state change
      this.turnTokens.delete(tableId);
    }
  }

  private forceProgress(engine: EventEngine, tableId: string, style: BotStyle) {
    try {
      const table = engine.getState();
      const actor = table.actor;
      if (actor === undefined || actor === null || actor < 0) return;
      const seat = table.seats[actor];
      if (!seat?.pid || !seat.pid.toLowerCase().startsWith(BOT_PREFIX)) return;
      const currentToken = this.turnTokens.get(tableId);
      const token = `${table.handNumber}:${table.street}:${actor}:${table.currentBet}:${seat.streetCommitted ?? 0}`;
      if (currentToken !== token) return; // Already progressed
      logger.warn(`⏳ [Bot] Failsafe firing for ${seat.pid} on ${tableId}, forcing fold`);
      void engine.dispatch({
        t: "Action",
        seat: actor,
        action: "FOLD",
      });
      this.turnTokens.delete(tableId);
    } catch (err) {
      logger.error(`❌ [Bot] Failsafe failed on ${tableId}:`, err);
    }
  }
}

type BotContext = {
  style: BotStyle;
  holeCards?: [number, number];
  board?: number[];
  toCall: number;
  pot: number;
  stack: number;
  bb: number;
  street: "preflop" | "flop" | "turn" | "river";
  position: number;
  playersLeft: number;
};

type BotDecision = { action: ActionType; amount?: number };

type BotLimits = {
  minBet: number;
  maxBet: number;
  minRaise: number;
  maxRaise: number;
  toCall: number;
};

function decideAction(ctx: BotContext, available: ActionType[], limits: BotLimits): BotDecision {
  const toCall = Math.min(ctx.toCall, ctx.stack);
  const pot = Math.max(ctx.pot, ctx.bb * 2);
  const pressure = toCall / Math.max(ctx.bb, 1);
  const effStackBb = ctx.stack / Math.max(ctx.bb, 1);

  const strength = evaluateStrength(ctx);
  const aggression =
    ctx.style === "aggressive" ? 0.75 : ctx.style === "loose" ? 0.45 : ctx.style === "tight" ? 0.25 : ctx.style === "balanced" ? 0.4 : 0.5;
  const bluffiness = ctx.style === "aggressive" ? 0.25 : ctx.style === "balanced" ? 0.15 : ctx.style === "loose" ? 0.1 : 0.05;
  const rng = Math.random();

  if (toCall <= 0) {
    if (available.includes("BET") && strength >= 3 && rng < aggression) {
      return { action: "BET", amount: pickBetSize(limits, pot) };
    }
    if (available.includes("BET") && rng < bluffiness) {
      return { action: "BET", amount: pickBetSize(limits, pot) };
    }
    return { action: available.includes("CHECK") ? "CHECK" : available.includes("BET") ? "BET" : "FOLD", amount: available.includes("BET") ? pickBetSize(limits, pot) : undefined };
  }

  // Short stack: shove if any decent strength or pressure high
  if (effStackBb <= 8) {
    if (strength >= 2 || pressure >= 4) {
      return available.includes("ALLIN") ? { action: "ALLIN", amount: ctx.stack } : { action: "CALL", amount: toCall };
    }
  }

  if (strength >= 4) {
    if (available.includes("RAISE") && rng < aggression + 0.2) {
      return { action: "RAISE", amount: pickRaiseSize(limits, pot) };
    }
    return { action: available.includes("CALL") ? "CALL" : "FOLD", amount: toCall };
  }

  if (strength >= 3) {
    if (available.includes("RAISE") && rng < aggression) {
      return { action: "RAISE", amount: pickRaiseSize(limits, pot) };
    }
    if (available.includes("CALL")) return { action: "CALL", amount: toCall };
    return { action: available.includes("CHECK") ? "CHECK" : "FOLD" };
  }

  if (strength >= 2) {
    if (available.includes("CALL") && pressure <= 3) return { action: "CALL", amount: toCall };
    if (available.includes("RAISE") && rng < bluffiness) return { action: "RAISE", amount: pickRaiseSize(limits, pot) };
    return { action: available.includes("FOLD") ? "FOLD" : "CALL", amount: toCall };
  }

  if (available.includes("CALL") && pressure <= 1.5 && (ctx.style === "loose" || ctx.style === "random" || ctx.style === "balanced") && rng < 0.35) {
    return { action: "CALL", amount: toCall };
  }

  return { action: "FOLD" };
}

// Strength buckets: 0 air, 1 weak, 2 medium, 3 strong, 4 monster
function evaluateStrength(ctx: BotContext): number {
  const ranks = (ctx.holeCards || []).map((c) => Math.floor(c / 4));
  const boardRanks = (ctx.board || []).map((c) => Math.floor(c / 4));

  // Preflop: simple chart
  if (ctx.street === "preflop") {
    if (ranks.length === 2) {
      const tier = preflopTier(ctx);
      return adjustPreflopByStyle(tier, ctx.style);
    }
    return 1;
  }

  // Postflop: check for pairs/sets/draws
  const combined = [...ranks, ...boardRanks];
  const counts = new Map<number, number>();
  combined.forEach((r) => counts.set(r, (counts.get(r) || 0) + 1));
  const maxCount = Math.max(...counts.values(), 1);
  const hasPair = maxCount >= 2;
  const hasTrips = maxCount >= 3;
  const hasQuads = maxCount >= 4;

  const suitCounts = new Map<number, number>();
  [...(ctx.holeCards || []), ...(ctx.board || [])].forEach((c) => {
    const s = Math.floor(c / 13);
    suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
  });
  const maxSuit = Math.max(...suitCounts.values(), 0);
  const flushDraw = maxSuit === 4;
  const flushMade = maxSuit >= 5;

  if (hasQuads) return 4;
  if (hasTrips || flushMade) return 3;
  if (hasPair || flushDraw) return 2;
  return 1;
}

function adjustPreflopByStyle(tier: number, style: BotStyle): number {
  if (style === "tight") {
    if (tier >= 4) return 4;
    if (tier === 3) return 3;
    if (tier === 2) return 1;
    return 0;
  }
  if (style === "aggressive") {
    if (tier >= 3) return 4;
    if (tier === 2) return 2;
    return 1;
  }
  if (style === "loose") {
    return Math.min(4, tier + 1);
  }
  if (style === "random") {
    const jitter = Math.random() < 0.35 ? 1 : 0;
    return Math.min(4, Math.max(1, tier + jitter));
  }
  // balanced: neutral
  return tier;
}

function preflopTier(ctx: BotContext): number {
  if (!ctx.holeCards || ctx.holeCards.length !== 2) return 1;
  const [c1, c2] = ctx.holeCards;
  const r1 = Math.floor(c1 / 4) + 2;
  const r2 = Math.floor(c2 / 4) + 2;
  const s1 = c1 % 4;
  const s2 = c2 % 4;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = s1 === s2;
  const pair = r1 === r2;

  // Tier 5: premiums
  if (pair && high >= 11) return 4; // JJ+
  if (high === 14 && low >= 10) return 4; // AK/AQ
  if (suited && high === 14 && low >= 10) return 4; // AKs/AQs

  // Tier 4: strong
  if (pair && high >= 9) return 3; // 99-TT
  if (suited && high >= 13 && low >= 10) return 3; // KQs/KJs/QJs
  if (!suited && high >= 13 && low >= 11) return 3; // KQo/AJo
  if (high === 14 && low >= 8) return 3; // AT/A9 suited-ish

  // Tier 3: medium
  if (pair && high >= 6) return 2; // 66-88
  if (suited && high >= 11 && low >= 8) return 2; // JTs/QTs/T9s
  if (suited && high >= 10 && low >= 6) return 2; // T8s/98s/87s
  if (high === 14 && suited) return 2; // suited aces

  // Tier 2: speculative
  if (pair) return 2;
  if (suited && high - low <= 3 && high >= 7) return 2; // suited connectors/gappers

  return 1;
}

function pickBetSize(limits: BotLimits, pot: number): number {
  const base = Math.max(limits.minBet, Math.min(limits.maxBet, Math.round(pot * 0.5)));
  return clampAmount(base, limits.minBet, limits.maxBet);
}

function pickRaiseSize(limits: BotLimits, pot: number): number {
  const target = Math.max(limits.minRaise, Math.min(limits.maxRaise, Math.round(pot * 0.6)));
  return clampAmount(target, limits.minRaise, limits.maxRaise);
}

function clampAmount(value: number, min: number, max: number): number {
  if (max <= 0) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function ensureDecision(
  decision: BotDecision,
  available: ActionType[],
  limits: BotLimits,
  ctx: BotContext,
): BotDecision {
  if (!available.includes(decision.action)) {
    // Fallback order
    if (available.includes("CHECK")) return { action: "CHECK" };
    if (available.includes("CALL")) return { action: "CALL", amount: limits.toCall };
    if (available.includes("BET")) return { action: "BET", amount: pickBetSize(limits, ctx.pot) };
    if (available.includes("RAISE")) return { action: "RAISE", amount: pickRaiseSize(limits, ctx.pot) };
    if (available.includes("ALLIN")) return { action: "ALLIN", amount: ctx.stack };
    return { action: "FOLD" };
  }

  if (decision.action === "BET") {
    return { action: "BET", amount: pickBetSize(limits, ctx.pot) };
  }
  if (decision.action === "RAISE") {
    return { action: "RAISE", amount: pickRaiseSize(limits, ctx.pot) };
  }
  if (decision.action === "CALL") {
    return { action: "CALL", amount: limits.toCall };
  }
  if (decision.action === "ALLIN") {
    return { action: "ALLIN", amount: ctx.stack };
  }

  return decision;
}
