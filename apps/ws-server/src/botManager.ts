import { EventEngine, type Table } from "@hyper-poker/engine";
import { logger } from "@hyper-poker/engine/utils/logger";

const BOT_PREFIX = "bot_";

export type BotStyle = "tight" | "aggressive" | "loose" | "random";
export interface BotConfig {
  style: BotStyle;
  minDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_STYLE: BotStyle = "random";
const DEFAULT_MIN_DELAY = 200;
const DEFAULT_MAX_DELAY = 600;
const FAILSAFE_DELAY_MS = 1500;

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
    if (!["preflop", "flop", "turn", "river"].includes(table.phase)) {
      logger.debug(`🤖 [Bot] Skipping phase ${table.phase}`);
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
    const minDelay = cfg.minDelayMs ?? DEFAULT_MIN_DELAY;
    const maxDelay = cfg.maxDelayMs ?? DEFAULT_MAX_DELAY;
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

      const { action, amount } = decideAction(ctx);

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

type BotDecision = { action: "CHECK" | "CALL" | "FOLD" | "ALLIN"; amount?: number };

function decideAction(ctx: BotContext): BotDecision {
  const toCall = Math.min(ctx.toCall, ctx.stack);
  const pot = Math.max(ctx.pot, ctx.bb * 2);
  const pressure = toCall / Math.max(ctx.bb, 1);
  const effStackBb = ctx.stack / Math.max(ctx.bb, 1);

  if (toCall <= 0) {
    // Optional stab for aggro styles; keep it simple: check
    return { action: "CHECK" };
  }

  const strength = evaluateStrength(ctx);

  // Short stack: shove if any decent strength or pressure high
  if (effStackBb <= 8) {
    if (strength >= 2 || pressure >= 4) {
      return { action: "ALLIN", amount: ctx.stack };
    }
  }

  // Style-based tolerance
  const styleBias =
    ctx.style === "aggressive" ? 1.5 : ctx.style === "loose" ? 1.2 : ctx.style === "tight" ? 0.8 : 1;

  // Call thresholds (rough pot odds)
  const callThreshold =
    strength >= 3 ? 4 * styleBias : strength === 2 ? 3 * styleBias : strength === 1 ? 1.5 * styleBias : 0.8 * styleBias;

  if (pressure <= callThreshold) {
    return { action: "CALL", amount: toCall };
  }

  // If strong but facing big pressure, shove; otherwise fold
  if (strength >= 3 && pressure <= callThreshold * 2) {
    return { action: "ALLIN", amount: ctx.stack };
  }

  return { action: "FOLD" };
}

// Strength buckets: 0 air, 1 weak, 2 medium, 3 strong, 4 monster
function evaluateStrength(ctx: BotContext): number {
  const ranks = (ctx.holeCards || []).map((c) => c % 13);
  const boardRanks = (ctx.board || []).map((c) => c % 13);

  // Preflop: simple chart
  if (ctx.street === "preflop") {
    if (ranks.length === 2) {
      const [a, b] = ranks;
      const pair = a === b;
      const highPair = pair && a >= 8; // 99+
      const midPair = pair && a >= 5; // 66-88
      const highCard = Math.max(a, b);
      const lowCard = Math.min(a, b);
      const broadway = highCard >= 10 && lowCard >= 8;

      if (highPair) return 4;
      if (midPair) return 3;
      if (pair) return 2;
      if (broadway) return 3;
      if (highCard >= 10 && lowCard >= 5) return 2;
      return 1;
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
