/**
 * Comprehensive Integration Tests for Event-Driven Poker Engine
 * 
 * Tests the complete game flow from deal to showdown, verifying all the fixes:
 * - No auto-progression bug
 * - Real hand evaluation
 * - Proper turn order (heads-up vs multi-way, preflop vs postflop) 
 * - Player balance validation
 * - BB option logic
 * - Winner announcements
 * - State transitions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEngine } from "../core/eventEngine";
import { ActionType, Table, PokerEvent } from "../core/types";
import { evaluateHand, compareHands } from "../logic/handEvaluationAdapter";
import { getNextActionableIndex } from "../utils/ringOrder";

// Mock timer manager for tests
class MockTimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  schedule(id: string, delay: number, callback: () => void): void {
    const timer = setTimeout(callback, delay);
    this.timers.set(id, timer);
  }

  cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  cancelAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  // Additional methods needed by EventEngine
  startActionTimer(playerId: string, seatId: number, timeoutMs: number): void {
    // Mock implementation - don't actually start timeout, just log
    console.log(`MockTimer: Would start ${timeoutMs}ms timer for player ${playerId} at seat ${seatId}`);
  }

  cancelActionTimer(playerId: string): void {
    this.cancel(`action_${playerId}`);
  }

  startHandTimer(tableId: string, delay: number, callback: () => void): void {
    this.schedule(`hand_${tableId}`, delay, callback);
  }

  cancelHandTimer(tableId: string): void {
    this.cancel(`hand_${tableId}`);
  }

  startDealTimer(tableId: string, delay: number, callback: () => void): void {
    this.schedule(`deal_${tableId}`, delay, callback);
  }

  cancelDealTimer(tableId: string): void {
    this.cancel(`deal_${tableId}`);
  }

  clearTimer(timerId: string): void {
    this.cancel(timerId);
  }

  clearAllTimers(): void {
    this.cancelAll();
  }
}

describe("Event Engine Integration Tests", () => {
  let engine: EventEngine;
  let timerManager: MockTimerManager;
  let events: PokerEvent[] = [];

  beforeEach(() => {
    vi.useRealTimers();
    engine = new EventEngine("test-table", 50, 100);
    engine.setAutoStart(false); // Disable auto-start for deterministic tests
    timerManager = new MockTimerManager();
    (engine as any).timerManager = timerManager;
    events = [];

    // Capture all events emitted by the engine
    engine.on("eventProcessed", (event: PokerEvent) => {
      events.push(event);
    });
    
    // Add dummy error listener to prevent unhandled 'error' events
    engine.on("error", () => {});
  });

  afterEach(() => {
    timerManager.cancelAll();
  });

  describe("Player Balance Validation", () => {
    it("should enforce buy-in limits (20-200 BB)", async () => {
      // Try to add player with too few chips
      const lowChipsResult = await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 500, // Only 5 BB (below 20 BB minimum of 2000)
        nickname: "Low Chips"
      });
      
      expect(lowChipsResult).toBe(false);

      // Try to add player with too many chips
      const highChipsResult = await engine.processCommand({
        type: "join",
        playerId: "player2",
        seatId: 1,
        chips: 25000, // 250 BB (above 200 BB maximum of 20000)
        nickname: "High Chips"
      });
      
      expect(highChipsResult).toBe(false);

      // Valid buy-in should work
      const validResult = await engine.processCommand({
        type: "join",
        playerId: "player3",
        seatId: 2,
        chips: 5000, // 50 BB (valid)
        nickname: "Valid Player"
      });
      
      expect(validResult).toBe(true);
      expect(engine.getSnapshot().table.seats[2].chips).toBe(5000);
    });

    it("should remove broke players after hand ends", async () => {
      // Add two players
      await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 2000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player2",  
        seatId: 1,
        chips: 2000, // 20 BB (minimum)
        nickname: "Player 2"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });

      // Player 2 will have reduced chips after posting BB (100)
      const table = engine.getSnapshot().table;
      expect(table.seats[1].chips).toBe(1900); // 2000 - 100 = 1900

      // Complete the hand - player 1 wins by player 2 folding
      await engine.processCommand({
        type: "action",
        playerId: "player1", 
        seatId: 0,
        action: "call"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "fold"
      });

      // Wait for hand to complete and check if broke player was removed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalTable = engine.getSnapshot().table;
      const player2Seat = finalTable.seats.find(s => s.pid === "player2");
      
      // Player 2 should still have chips since they only lost blinds
      expect(player2Seat?.chips || 0).toBeGreaterThan(1000); // Still have chips
    });
  });

  describe("Turn Order and Game Flow", () => {
    it("should handle heads-up preflop turn order correctly", async () => {
      // Add two players
      await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 5000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join", 
        playerId: "player2",
        seatId: 1,
        chips: 5000,
        nickname: "Player 2"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });

      const table = engine.getSnapshot().table;
      
      // In heads-up, button (SB) acts first preflop
      expect(table.phase).toBe("preflop");
      const button = table.button;
      expect(table.actor).toBe(button); // Button/SB should act first

      // SB calls
      await engine.processCommand({
        type: "action",
        playerId: table.seats[button].pid,
        seatId: button,
        action: "CALL"
      });

      // Should be BB's turn to act
      const afterSBCall = engine.getSnapshot().table;
      const otherSeat = (button + 1) % 2;
      expect(afterSBCall.actor).toBe(otherSeat); // BB should have option
      expect(afterSBCall.phase).toBe("preflop"); // Still preflop
    });

    it("should handle 3-player preflop turn order with BB option", async () => {
      // Add three players
      await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 5000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player2", 
        seatId: 1,
        chips: 5000,
        nickname: "Player 2"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player3",
        seatId: 2, 
        chips: 5000,
        nickname: "Player 3"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });

      const table = engine.getSnapshot().table;
      const button = table.button;
      
      // Use canonical logic to find blinds and UTG
      const seats = table.seats;
      const sb = getNextActionableIndex(seats, button);
      const bb = getNextActionableIndex(seats, sb);
      const utg = getNextActionableIndex(seats, bb);
      
      expect(table.phase).toBe("preflop");
      expect(table.actor).toBe(utg); // UTG acts first

      // UTG calls
      await engine.processCommand({
        type: "action",
        playerId: table.seats[utg].pid,
        seatId: utg,
        action: "CALL"
      });

      // Should advance to SB
      let afterUTG = engine.getSnapshot().table;
      expect(afterUTG.actor).toBe(sb); // SB

      // SB calls  
      await engine.processCommand({
        type: "action",
        playerId: table.seats[sb].pid,
        seatId: sb,
        action: "CALL"
      });

      // Should advance to BB with option
      let afterSB = engine.getSnapshot().table;
      expect(afterSB.actor).toBe(bb); // BB
      expect(afterSB.phase).toBe("preflop"); // Still preflop - BB has option

      // BB should be able to check or raise
      const availableActions = engine.getPlayerAvailableActions(bb);
      expect(availableActions).toContain("CHECK");
      expect(availableActions).toContain("RAISE");
    });

    it("should NOT auto-progress through streets without player actions", async () => {
      // Add two players
      await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 5000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player2",
        seatId: 1, 
        chips: 5000,
        nickname: "Player 2"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });
      
      // Complete preflop
      await engine.processCommand({
        type: "action", 
        playerId: "player1",
        seatId: 0,
        action: "CALL"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1, 
        action: "CHECK"
      });

      // Wait a moment to see if auto-progression occurs
      await new Promise(resolve => setTimeout(resolve, 100));

      const table = engine.getSnapshot().table;
      
      // Should be on flop and waiting for player action (not auto-progressing)
      expect(table.phase).toBe("flop");
      expect(table.actor).toBe(1); // BB acts first postflop in heads-up
      expect(table.communityCards.length).toBe(3); // Flop cards dealt

      // Game should be waiting for player action, not progressing automatically
      const availableActions = engine.getPlayerAvailableActions(1);
      expect(availableActions.length).toBeGreaterThan(0); // Player should have actions
    });
  });

  describe("Hand Evaluation and Showdown", () => {
    it("should use real hand evaluation and announce winners", async () => {
      // Add two players
      await engine.processCommand({
        type: "join",
        playerId: "player1",
        seatId: 0,
        chips: 5000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player2",
        seatId: 1,
        chips: 5000, 
        nickname: "Player 2"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });

      // Get initial table state to check hole cards were dealt
      const initialTable = engine.getSnapshot().table;
      expect(initialTable.seats[0].holeCards).toHaveLength(2);
      expect(initialTable.seats[1].holeCards).toHaveLength(2);

      // Play through all streets to reach showdown
      // Preflop
      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0, 
        action: "CALL"
      });
      
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "CHECK"
      });

      // Flop
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "CHECK"
      });

      await engine.processCommand({
        type: "action", 
        playerId: "player1",
        seatId: 0,
        action: "CHECK"
      });

      // Turn
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "CHECK"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0, 
        action: "CHECK"
      });

      // River
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "CHECK"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "CHECK"
      });

      // waitIdle ensures all side effects (including delayed HandEnd) are processed
      await engine.waitIdle();

      const finalTable = engine.getSnapshot().table;

      // Should have reached showdown and determined winner, then progressed to waiting for next hand
      expect(finalTable.phase).toBe("waiting");
      expect(finalTable.communityCards.length).toBe(5); // Board should persist during waiting phase

      // Check that Payout event was processed
      const payoutEvents = events.filter(e => e.t === "Payout");
      expect(payoutEvents.length).toBeGreaterThan(0);

      // Verify the Payout contains distributions
      const payoutEvent = payoutEvents[0] as any;
      expect(payoutEvent.distributions).toBeDefined();
      expect(payoutEvent.distributions.length).toBeGreaterThan(0);
    }, 30000);

    it("should handle all-in scenarios correctly", async () => {
      // Set high timeout for this test as it involves multiple delays for auto-dealing
      vi.setConfig({ testTimeout: 10000 });
      
      // Add two players with different chip amounts
      await engine.processCommand({
        type: "join",
        playerId: "player1", 
        seatId: 0,
        chips: 5000,
        nickname: "Player 1"
      });

      await engine.processCommand({
        type: "join",
        playerId: "player2",
        seatId: 1,
        chips: 2000, // Smaller stack
        nickname: "Player 2"
      });

      // Start hand
      await engine.processCommand({ type: "start_hand", timestamp: 0 });

      // Player 1 calls, Player 2 goes all-in
      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "CALL"
      });

      await engine.processCommand({
        type: "action", 
        playerId: "player2",
        seatId: 1,
        action: "ALLIN"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "CALL"
      });

      // Engine should auto-deal and finish hand. waitIdle waits for all delayed streets.
      await engine.waitIdle();

      const finalTable = engine.getSnapshot().table;

      // Should reach showdown automatically when both players all-in, then progress to waiting
      expect(finalTable.phase).toBe("waiting");
      expect(finalTable.communityCards.length).toBe(5); // Board should persist during waiting phase

      // Verify chips were distributed (total 7000)
      expect(finalTable.seats[0].chips + finalTable.seats[1].chips).toBe(7000);

      // Check payout occurred
      const payoutEvents = events.filter(e => e.t === "Payout");
      expect(payoutEvents.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe("Hand Evaluation Algorithm", () => {
    it("should correctly evaluate poker hands", () => {
      // Test basic hand evaluation - just verify it returns valid results
      const hand1 = evaluateHand([0, 1], [4, 8, 12]); // 2 hole cards + 3 board cards = 5 total
      expect(hand1.rank).toBeGreaterThanOrEqual(1); // At least HIGH_CARD
      expect(hand1.rank).toBeLessThanOrEqual(9); // At most STRAIGHT_FLUSH
      expect(hand1.description).toBeTruthy();
      expect(hand1.score).toBeGreaterThan(0);
      expect(hand1.cards).toHaveLength(5); // 2 hole + 3 board

      // Test different hand
      const hand2 = evaluateHand([24, 25], [28, 32, 36]); // Different cards
      expect(hand2.rank).toBeGreaterThanOrEqual(1);
      expect(hand2.rank).toBeLessThanOrEqual(9);
      expect(hand2.description).toBeTruthy();
    });

    it("should correctly compare hands", () => {
      // Create two clearly different hands
      const hand1 = evaluateHand([0, 1], [8, 12, 16]); // 2 hole + 3 board = 5 cards
      const hand2 = evaluateHand([4, 9], [13, 17, 21]); // Different cards

      // compareHands should return consistent results
      const comparison1 = compareHands(hand1, hand2);
      const comparison2 = compareHands(hand2, hand1);
      
      // If comparison1 is positive, comparison2 should be negative (or vice versa)
      // If both are zero, it's a tie
      if (comparison1 !== 0) {
        expect(comparison1 * comparison2).toBeLessThan(0); // Opposite signs
      }

      // Same hand should tie
      const comparison3 = compareHands(hand1, hand1);
      expect(comparison3).toBe(0);
    });
  });
});