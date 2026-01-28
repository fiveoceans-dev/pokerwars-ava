/**
 * Hand Lifecycle Reducer
 *
 * Handles the lifecycle events of a poker hand:
 * - StartHand: Initialize new hand with deck and button
 * - PostBlinds: Post blinds and prepare for betting
 * - HandEnd: Clean up hand and prepare for next
 */

import {
  Table,
  SeatStatus,
  Phase,
  StateTransition,
  SideEffect,
} from "../types";
import { getSitOutManager } from "../../managers/sitOutManager";
import { countActivePlayers } from "../../utils/ringOrder";
import {
  getBlindPositions,
  getFirstActor,
  calculateNextButton,
  validateAndFixButton,
} from "../../logic/gameRules";
import { generateDeckSeed } from "../../logic/deckManager";
import * as CardLedger from "../../logic/cardLedger";

/**
 * Initialize a new poker hand
 */
export function startHand(
  table: Table,
  handNumber: number,
  timestamp: number,
): StateTransition {
  const sitOutManager = getSitOutManager(table.id);

  // Randomize first dealer (button) deterministically on first hand using timestamp
  let button = table.button;
  if (table.handNumber === 0) {
    // Only consider players who are not sitting out for initial button
    const eligible = table.seats
      .filter(
        (s) => s.pid && s.chips > 0 && !sitOutManager.isPlayerSittingOut(s.pid),
      )
      .map((s) => s.id);
    if (eligible.length > 1) {
      const idx = timestamp % eligible.length;
      button = eligible[idx];
      console.log(
        `🎲 [Reducer] Randomized initial button to seat ${button} from eligible ${eligible.join(",")}`,
      );
    }
  }

  // Generate deck seed and create shuffled deck (numeric codes)
  const deckSeed = generateDeckSeed(handNumber, timestamp);
  const deckCodes = CardLedger.shuffle(deckSeed);
  console.log(
    `🎰 [Reducer] Created shuffled deck with seed: ${deckSeed} (codes length=${deckCodes.length})`,
  );

  const nextState = {
    ...table,
    phase: "deal" as Phase,
    handNumber,
    timestamp,
    button,
    street: undefined,
    actor: undefined,
    lastAggressor: undefined,
    currentBet: 0,
    lastRaiseSize: table.bigBlind,
    pots: [],
    communityCards: [],
    // Deck management
    deckCodes,
    deckIndex: 0,
    deckSeed,
    burns: { flop: [], turn: [], river: [] },
    // Clear reveal/winner state for new hand
    revealedPids: [],
    winnersPids: [],
    autoRevealAll: false,
    // Reset all seats for new hand - only active players participate
    seats: table.seats.map((seat) => {
      if (!seat.pid) {
        return {
          ...seat,
          committed: 0,
          streetCommitted: 0,
          status: "empty" as SeatStatus,
          holeCards: undefined,
          action: undefined,
        };
      }

      // Players participating in hand are always active
      // Players sitting out should NOT participate in hands at all
      const shouldParticipate =
        seat.chips > 0 && !sitOutManager.isPlayerSittingOut(seat.pid);

      return {
        ...seat,
        committed: 0,
        streetCommitted: 0,
        status: shouldParticipate ? "active" : ("empty" as SeatStatus),
        holeCards: undefined,
        action: undefined,
      };
    }),
  };

  // Count eligible players for logging
  const eligiblePlayers = nextState.seats.filter(
    (s) => s.status === "active",
  ).length;
  console.log(
    `🏁 [Reducer] Starting hand ${handNumber} with ${eligiblePlayers} eligible players`,
  );

  // Side effects: automatically post blinds and deal hole cards
  const sideEffects: SideEffect[] = [
    {
      type: "DISPATCH_EVENT",
      payload: {
        event: { t: "PostBlinds", sb: table.smallBlind, bb: table.bigBlind },
      },
    },
    { type: "EMIT_STATE_CHANGE", payload: { reason: "dealer_selected" } },
    { type: "EMIT_STATE_CHANGE", payload: { reason: "hand_started" } },
  ];

  return { nextState, sideEffects };
}

/**
 * Post blinds and set initial betting state
 */
export function postBlinds(
  table: Table,
  sb: number,
  bb: number,
  ante?: number,
): StateTransition {
  const newSeats = [...table.seats];

  // Only count players who are not sitting out as active
  const activePlayers = newSeats.filter(
    (seat) => seat.status === "active" && seat.pid,
  );

  console.log(
    `🎲 [Reducer] PostBlinds: ${activePlayers.length} active players`,
  );

  if (activePlayers.length < 2) {
    console.log(
      `⚠️ [Reducer] Insufficient active players for hand: ${activePlayers.length}`,
    );
    return { nextState: table, sideEffects: [] }; // Need at least 2 players
  }

  // Validate and fix button position using game rules
  const validButton = validateAndFixButton(newSeats, table.button);

  // Get correct blind positions according to poker rules
  const blindPositions = getBlindPositions(newSeats, validButton);

  if (!blindPositions) {
    console.error(`❌ [Reducer] Could not determine blind positions`);
    return { nextState: table, sideEffects: [] };
  }

  const { sb: sbIndex, bb: bbIndex } = blindPositions;
  const activeCount = countActivePlayers(newSeats);
  const isHeadsUp = activeCount === 2;

  console.log(
    `🃏 [Reducer] Posting blinds - ${isHeadsUp ? "Heads-up" : "Multi-way"} (${activeCount} players)`,
  );
  console.log(`   SB: seat ${sbIndex} (${newSeats[sbIndex]?.pid})`);
  console.log(`   BB: seat ${bbIndex} (${newSeats[bbIndex]?.pid})`);

  // Post small blind
  if (sbIndex !== -1) {
    const sbSeat = newSeats[sbIndex];
    const sbAmount = Math.min(sb, sbSeat.chips);
    newSeats[sbIndex] = {
      ...sbSeat,
      chips: sbSeat.chips - sbAmount,
      committed: sbAmount,
      streetCommitted: sbAmount,
      status: sbSeat.chips === sbAmount ? "allin" : "active",
    };
  }

  // Post big blind
  if (bbIndex !== -1) {
    const bbSeat = newSeats[bbIndex];
    const bbAmount = Math.min(bb, bbSeat.chips);
    newSeats[bbIndex] = {
      ...bbSeat,
      chips: bbSeat.chips - bbAmount,
      committed: bbAmount,
      streetCommitted: bbAmount,
      status: bbSeat.chips === bbAmount ? "allin" : "active",
    };
  }

  // Post antes if specified
  if (ante && ante > 0) {
    for (let i = 0; i < newSeats.length; i++) {
      const seat = newSeats[i];
      if (seat.status === "active") {
        const anteAmount = Math.min(ante, seat.chips);
        newSeats[i] = {
          ...seat,
          chips: seat.chips - anteAmount,
          committed: seat.committed + anteAmount,
          streetCommitted: seat.streetCommitted + anteAmount,
        };
      }
    }
  }

  // Calculate first actor using game rules
  const tableWithSeats = { ...table, seats: newSeats, button: validButton };
  const actionOrder = getFirstActor(tableWithSeats, true);

  const nextState = {
    ...table,
    button: validButton, // Use corrected button position
    phase: "deal" as Phase, // Stay in deal phase - preflop will be set by EnterStreet
    seats: newSeats,
    blinds: { sb, bb, ante },
    bbSeat: bbIndex, // Track BB position for option logic
    bbHasActed: false, // BB hasn't acted yet
  };

  console.log(
    `💰 [Reducer] Blinds posted - BB: ${bb} at seat ${bbIndex}, SB: ${sb} at seat ${sbIndex}`,
  );

  // Side effects: deal hole cards, then enter preflop betting round
  const sideEffects: SideEffect[] = [
    {
      type: "DISPATCH_EVENT",
      payload: {
        event: { t: "DealHole", cards: {} }, // Cards will be generated by reducer
      },
    },
    {
      type: "DISPATCH_EVENT",
      payload: {
        event: { t: "EnterStreet", street: "preflop" }, // Proper FSM transition
      },
    },
    { type: "EMIT_STATE_CHANGE", payload: { reason: "blinds_posted" } },
  ];

  // Emit heads-up detection for UI/logging
  if (isHeadsUp) {
    sideEffects.push({
      type: "EMIT_STATE_CHANGE",
      payload: { reason: "heads_up_detected" },
    });
  }

  return { nextState, sideEffects };
}

/**
 * End the current hand and prepare for next
 */
export function endHand(table: Table): StateTransition {
  // Identify players who busted (0 chips) and keep them seated but sitting out
  const bustedSeats = table.seats
    .filter((seat) => seat.pid && seat.chips === 0)
    .map((seat) => ({ id: seat.id, pid: seat.pid! }));

  // Keep seats intact to preserve identity; do not auto-remove broke players
  const newSeats = table.seats.map((seat) => {
    if (seat.pid && seat.chips === 0) {
      console.log(
        `💸 [Reducer] Player ${seat.pid} busted at seat ${seat.id} — marking sit out (preserving seat)`,
      );
      // Preserve identity; clear transient per-hand fields if desired
      return {
        ...seat,
        committed: 0,
        streetCommitted: 0,
        // Status is managed by FSM; do not force to empty to avoid losing identity
      } as any;
    }
    return seat;
  });

  // Calculate next button using game rules
  const nextButton = calculateNextButton(newSeats, table.button);
  const buttonMoved = nextButton !== table.button;

  console.log(
    `🔄 [Reducer] Button ${buttonMoved ? "advanced" : "stayed"}: ${table.button} → ${nextButton}`,
  );

  // Count remaining players with chips
  const playersWithChips = newSeats.filter(
    (seat) => seat.pid && seat.chips > 0,
  ).length;
  console.log(`👥 [Reducer] ${playersWithChips} players remaining with chips`);

  const nextState = {
    ...table,
    phase: "waiting" as Phase,
    street: undefined,
    actor: undefined,
    lastAggressor: undefined,
    currentBet: 0,
    lastRaiseSize: table.bigBlind,
    communityCards: [],
    button: nextButton,
    seats: newSeats,
    bbSeat: undefined, // Reset BB tracking
    bbHasActed: false, // Reset BB action tracking
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "hand_ended" } },
  ];

  // Emit button movement notification
  if (buttonMoved) {
    sideEffects.push({
      type: "EMIT_STATE_CHANGE",
      payload: { reason: "button_moved" },
    });
  }

  // Emit notification if players were removed
  // Dispatch PlayerSitOut events for busted players so UI and managers reflect state
  for (const s of bustedSeats) {
    sideEffects.push({
      type: "DISPATCH_EVENT",
      payload: {
        event: { t: "PlayerSitOut", seat: s.id, pid: s.pid, reason: "busted" },
      },
    });
  }

  // Ask engine to evaluate whether to start the next hand using the
  // standard game-start countdown logic. This preserves FSM flow and avoids
  // ad-hoc triggers from outside the reducer.
  sideEffects.push({ type: "CHECK_GAME_START", payload: { delayMs: 0 } });

  return { nextState, sideEffects };
}
