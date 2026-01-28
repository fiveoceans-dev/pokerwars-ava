/**
 * Card Dealing Reducer
 *
 * Handles card-related events in the poker engine:
 * - DealHole: Deal hole cards to players
 * - EnterStreet: Enter new betting street with community cards
 */

import { Table, Street, StateTransition, SideEffect } from "../types";
import * as CardLedger from "../../logic/cardLedger";
import { getBettingRoundState } from "../../utils/ringOrder";
import { getFirstActor } from "../../logic/gameRules";
import { getNextStreet } from "../../logic/betting";
import { ACTION_TIMEOUT_MS } from "../constants";

/**
 * Apply hole cards to players
 */
export function applyHoleCards(
  table: Table,
  cards: Record<string, [number, number]> | undefined,
): StateTransition {
  // If cards provided (testing), apply them; otherwise deal deterministically from deckCodes
  let nextDeckIndex = table.deckIndex || 0;
  const newSeats = table.seats.map((s) => ({ ...s }));

  if (!cards || Object.keys(cards).length === 0) {
    // Determine dealing order starting left of button
    const seatCount = newSeats.length;
    const order: number[] = [];
    for (let o = 1; o <= seatCount; o++) {
      const idx = (table.button + o) % seatCount;
      const seat = newSeats[idx];
      if (seat.pid && seat.status === "active") order.push(idx);
    }
    const { assignments, nextIndex } = CardLedger.dealHole(table, order);
    nextDeckIndex = nextIndex;
    assignments.forEach((pair, seatId) => {
      newSeats[seatId] = { ...newSeats[seatId], holeCards: pair };
    });
    console.log(
      `🎴 [Reducer] Dealt hole cards to ${assignments.size} players, next index: ${nextDeckIndex}`,
    );
  } else {
    // Apply provided mapping (pid -> [n,n])
    newSeats.forEach((seat, i) => {
      if (seat.pid && cards![seat.pid]) {
        newSeats[i] = { ...seat, holeCards: cards![seat.pid] };
      }
    });
  }

  const nextState = {
    ...table,
    seats: newSeats,
    deckIndex: nextDeckIndex,
  };

  // Side effect: emit that cards were dealt
  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "cards_dealt" } },
  ];

  return { nextState, sideEffects };
}

/**
 * Enter new betting street
 */
export function enterStreet(
  table: Table,
  street: Street,
  cards?: number[],
  isAutoDealt?: boolean,
): StateTransition {
  const newSeats = table.seats.map((seat) => ({
    ...seat,
    // Only reset streetCommitted for postflop streets, not preflop
    streetCommitted: street === "preflop" ? seat.streetCommitted : 0,
    action: undefined,
  }));

  // Generate cards from deck if not provided
  let communityCards = table.communityCards;
  let nextDeckIndex = table.deckIndex || 0;
  let burns = table.burns || { flop: [], turn: [], river: [] };

  if (street !== "preflop") {
    // Idempotency guard: don't deal a street twice
    const ccLen = communityCards.length;
    const alreadyDealt =
      (street === "flop" && ccLen >= 3) ||
      (street === "turn" && ccLen >= 4) ||
      (street === "river" && ccLen >= 5);

    if (alreadyDealt) {
      console.warn(
        `⚠️ [Reducer] ${street} already dealt (community length=${ccLen}). Skipping re-deal.`,
      );
    } else if (!cards || cards.length === 0) {
      if (street === "flop") {
        const { burn, cards: drawn, nextIndex } = CardLedger.dealFlop(table);
        burns = { ...burns, flop: burns.flop.length ? burns.flop : [burn] };
        communityCards = [...table.communityCards, ...drawn];
        nextDeckIndex = nextIndex;
        console.log(
          `🎴 [Reducer] Flop dealt: burn=${burn}, cards=${drawn.join(",")}`,
        );
      } else {
        const { burn, card, nextIndex } = CardLedger.dealTurnOrRiver(table);
        if (street === "turn") {
          burns = { ...burns, turn: burns.turn.length ? burns.turn : [burn] };
        } else {
          burns = {
            ...burns,
            river: burns.river.length ? burns.river : [burn],
          };
        }
        communityCards = [...table.communityCards, card];
        nextDeckIndex = nextIndex;
        console.log(`🎴 [Reducer] ${street} dealt: burn=${burn}, card=${card}`);
      }
    } else {
      communityCards = [...table.communityCards, ...cards];
    }
  }

  // Determine first actor and betting state based on street
  let actor: number | undefined = undefined;
  let currentBet = 0;
  let lastRaiseSize = table.bigBlind;

  if (!isAutoDealt) {
    const tableWithSeats = { ...table, seats: newSeats };

    if (street === "preflop") {
      // Preflop: Use existing blind state and calculate first actor
      const actionOrder = getFirstActor(tableWithSeats, true); // true = preflop
      actor = actionOrder.actor === -1 ? undefined : actionOrder.actor;
      currentBet = table.bigBlind || 0; // Big blind is the current bet
      lastRaiseSize = table.bigBlind || 0; // Minimum raise is BB
      console.log(
        `🎯 [Reducer] Preflop first actor: seat ${actor} (${actor !== undefined ? newSeats[actor]?.pid : "none"}), BB: ${currentBet}`,
      );
      console.log(
        `   Active players: ${newSeats
          .filter((s) => s.status === "active" && s.pid)
          .map((s) => `${s.pid}(${s.id})`)
          .join(", ")}`,
      );
    } else {
      // Postflop: Reset betting and get first actor
      const actionOrder = getFirstActor(tableWithSeats, false); // false = postflop
      actor = actionOrder.actor === -1 ? undefined : actionOrder.actor;
      currentBet = 0;
      lastRaiseSize = table.bigBlind;
      console.log(
        `🎯 [Reducer] ${street} first actor: seat ${actor} (${actor !== undefined ? newSeats[actor]?.pid : "none"})`,
      );
    }
  }

  const nextState = {
    ...table,
    phase: street,
    street,
    seats: newSeats,
    currentBet,
    lastRaiseSize,
    lastAggressor: undefined,
    actor, // Will be undefined for all-in scenarios
    communityCards,
    burns,
    deckIndex: nextDeckIndex, // Update deck position after dealing cards
    // Reset action tracking for new street
    playersActedThisRound: new Set<number>(),
    roundStartActor: actor, // First actor of this new street
    // Preserve BB option state for preflop
    ...(street === "preflop" && {
      bbSeat: table.bbSeat,
      bbHasActed: table.bbHasActed || false,
    }),
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "street_changed" } },
  ];

  // Start timer for first actor if not auto-dealt (all-in scenario)
  if (
    !isAutoDealt &&
    actor !== undefined &&
    actor >= 0 &&
    actor < newSeats.length
  ) {
    const actorSeat = newSeats[actor];
    if (actorSeat.pid && actorSeat.status === "active") {
      sideEffects.push({
        type: "START_TIMER",
        payload: {
          playerId: actorSeat.pid,
          seatId: actor,
          timeoutMs: ACTION_TIMEOUT_MS,
        },
      });
    }
  }

  // Only auto-progress if everyone is all-in (no betting possible)
  const roundState = getBettingRoundState(nextState);
  if (roundState.isComplete && roundState.reason === "all-players-allin") {
    console.log(
      `🎯 [Reducer] All players all-in on ${street}, auto-dealing remaining streets`,
    );
    // Auto-deal remaining streets when no betting is possible
    sideEffects.push({
      type: "DISPATCH_EVENT",
      payload: { event: { t: "CloseStreet" } },
    });
    const currentStreet = nextState.street;
    const nextStreet = currentStreet
      ? getNextStreet(currentStreet as Street)
      : null;
    if (nextStreet) {
      sideEffects.push({
        type: "DISPATCH_EVENT",
        payload: {
          event: { t: "EnterStreet", street: nextStreet, isAutoDealt: true },
        },
      });
    } else {
      // No more streets, go to showdown
      sideEffects.push({
        type: "DISPATCH_EVENT",
        payload: { event: { t: "Showdown", results: [] } },
      });
    }
  } else if (actor === undefined) {
    // ERROR: Can't determine first actor but players can act
    console.error(
      `❌ [Reducer] Failed to determine first actor for ${street} - this should not happen`,
    );
    console.error(
      `   Active players: ${nextState.seats
        .filter((s) => s.status === "active" && s.pid)
        .map((s) => `${s.pid}(${s.id})`)
        .join(", ")}`,
    );
    console.error(
      `   Button: ${nextState.button}, IsAutoDealt: ${isAutoDealt}`,
    );
    // Don't auto-progress - wait for manual fix or debugging
  }

  return { nextState, sideEffects };
}
