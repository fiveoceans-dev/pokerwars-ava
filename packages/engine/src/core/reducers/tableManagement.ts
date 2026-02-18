/**
 * Table Management Reducer
 * 
 * Handles player management events in the poker engine:
 * - PlayerJoin: Add player to table with validation
 * - PlayerLeave: Remove player from table
 */

import {
  Table,
  SeatStatus,
  StateTransition,
  SideEffect,
} from "../types";
import { getSitOutManager } from "../../managers/sitOutManager";

/**
 * Add player to table with proper validation
 */
export function addPlayer(
  table: Table,
  seatId: number,
  pid: string,
  chips: number,
  nickname?: string,
): StateTransition {
  // Validate seat index
  if (seatId < 0 || seatId >= table.seats.length) {
    console.error(`❌ [Reducer] Invalid seat index: ${seatId}`);
    return { nextState: table, sideEffects: [] }; // Invalid seat
  }

  // Check if seat is already occupied
  if (table.seats[seatId].pid) {
    console.error(
      `❌ [Reducer] Seat ${seatId} is already occupied by ${table.seats[seatId].pid}`,
    );
    return { nextState: table, sideEffects: [] }; // Seat taken
  }

  // Check if player is already seated elsewhere
  const existingSeat = table.seats.find((seat) => seat.pid === pid);
  if (existingSeat) {
    console.error(
      `❌ [Reducer] Player ${pid} is already seated at seat ${existingSeat.id}`,
    );
    return { nextState: table, sideEffects: [] }; // Player already seated
  }

  // Validate chips amount with buy-in limits
  const minBuyIn = table.bigBlind * 20;   // 20 big blind minimum
  const maxBuyIn = table.bigBlind * 200; // 200 big blinds maximum
  
  if (chips <= 0) {
    console.error(`❌ [Reducer] Invalid chips amount: ${chips} (must be > 0)`);
    return { nextState: table, sideEffects: [] }; // Invalid chips
  }
  
  if (chips < minBuyIn) {
    console.error(`❌ [Reducer] Buy-in too small: ${chips} (minimum: ${minBuyIn})`);
    return { nextState: table, sideEffects: [] }; // Buy-in too small
  }
  
  if (chips > maxBuyIn) {
    console.error(`❌ [Reducer] Buy-in too large: ${chips} (maximum: ${maxBuyIn})`);
    return { nextState: table, sideEffects: [] }; // Buy-in too large
  }

  const newSeats = [...table.seats];
  newSeats[seatId] = {
    id: seatId,
    pid,
    chips,
    committed: 0,
    streetCommitted: 0,
    status: "active",
    nickname,
  };

  // Clear any sitting out status when player joins
  const sitOutManager = getSitOutManager(table.id);
  sitOutManager.markSitIn(pid);

  console.log(
    `✅ [Reducer] Added player ${pid} to seat ${seatId} with ${chips} chips`,
  );

  const nextState = {
    ...table,
    seats: newSeats,
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "player_joined" } },
  ];

  return { nextState, sideEffects };
}

/**
 * Remove player from table
 */
export function removePlayer(
  table: Table,
  seatId: number,
  pid: string,
): StateTransition {
  const newSeats = [...table.seats];
  if (newSeats[seatId]?.pid === pid) {
    // Clear seat (chips set to 0 for play money system)
    newSeats[seatId] = {
      id: seatId,
      chips: 0,
      committed: 0,
      streetCommitted: 0,
      status: "empty",
    };

    // Comprehensive player state cleanup through PlayerStateManager
    const sitOutManager = getSitOutManager(table.id);
    sitOutManager.handlePlayerLeave(pid);
    
    console.log(`🚪 [Reducer] Removed player ${pid} from seat ${seatId} with complete state cleanup`);
  }

  const nextState = {
    ...table,
    seats: newSeats,
  };

  const sideEffects: SideEffect[] = [
    { type: "EMIT_STATE_CHANGE", payload: { reason: "player_left" } },
  ];

  return { nextState, sideEffects };
}

/**
 * Sit out player - pure function following FSM pattern
 */
export function sitOutPlayer(
  table: Table,
  seatId: number,
  pid: string,
  reason: "voluntary" | "timeout" | "busted"
): StateTransition {
  // Validate seat
  const seat = table.seats[seatId];
  if (!seat || seat.pid !== pid) {
    console.error(`❌ [Reducer] Invalid sit out: seat ${seatId} pid ${pid}`);
    return { nextState: table, sideEffects: [] };
  }

  // Can't sit out if empty seat
  if (seat.status === "empty") {
    console.warn(`⚠️ [Reducer] Player ${pid} seat is empty`);
    return { nextState: table, sideEffects: [] };
  }

  // Use PlayerStateManager as single source of truth - also modify seat.status in table
  const sitOutManager = getSitOutManager(table.id);
  const sitOutSideEffects = sitOutManager.markSitOut(pid, reason, table.id);

  const newSeats = [...table.seats];
  newSeats[seatId] = { ...seat, status: "sittingOut" }; // Set seat status to sittingOut

  console.log(`😴 [Reducer] Player ${pid} sitting out (${reason}) - PlayerStateManager updated`);

  return { nextState: { ...table, seats: newSeats }, sideEffects: sitOutSideEffects };
}

/**
 * Sit in player - pure function following FSM pattern
 */
export function sitInPlayer(
  table: Table,
  seatId: number,
  pid: string
): StateTransition {
  // Validate seat
  const seat = table.seats[seatId];
  if (!seat || seat.pid !== pid) {
    console.error(`❌ [Reducer] Invalid sit in: seat ${seatId} pid ${pid}`);
    return { nextState: table, sideEffects: [] };
  }

  // Use SitOutManager to check if sitting out
  const sitOutManager = getSitOutManager(table.id);
  if (!sitOutManager.isPlayerSittingOut(pid)) {
    console.warn(`⚠️ [Reducer] Player ${pid} not sitting out`);
    return { nextState: table, sideEffects: [] };
  }

  // Can't sit in without chips
  if (seat.chips <= 0) {
    console.error(`❌ [Reducer] Player ${pid} has no chips to sit in`);
    return { nextState: table, sideEffects: [] };
  }

  // Use SitOutManager as single source of truth - also modify seat.status in table
  const sitInSideEffects = sitOutManager.markSitIn(pid);

  const newSeats = [...table.seats];
  newSeats[seatId] = { ...seat, status: "active" }; // Set seat status to active

  console.log(`🪑 [Reducer] Player ${pid} sitting in - PlayerStateManager updated`);

  return { nextState: { ...table, seats: newSeats }, sideEffects: sitInSideEffects };
}
/**
 * Pause table progression due to invariant failure or admin action
 */
// Admin pause/unpause/reset removed in favor of automatic recovery
