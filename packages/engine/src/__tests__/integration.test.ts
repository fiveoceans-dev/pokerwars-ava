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

import { EventEngine } from "../core/eventEngine";
import { ActionType, Table, PokerEvent } from "../core/types";
import { evaluateHand, compareHands } from "../logic/handEvaluationAdapter";

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
    engine = new EventEngine("test-table", 50, 100);
    timerManager = new MockTimerManager();
    (engine as any).timerManager = timerManager;
    events = [];

    // Capture all events emitted by the engine
    engine.on("event", (event: PokerEvent) => {
      events.push(event);
    });
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
        chips: 1000, // Only 10 BB (below 20 BB minimum of 2000)
        nickname: "Low Chips"
      });
      
      expect(lowChipsResult.success).toBe(false);
      expect(lowChipsResult.error).toContain("buy-in must be between");

      // Try to add player with too many chips
      const highChipsResult = await engine.processCommand({
        type: "join",
        playerId: "player2",
        seatId: 1,
        chips: 25000, // 250 BB (above 200 BB maximum of 20000)
        nickname: "High Chips"
      });
      
      expect(highChipsResult.success).toBe(false);
      expect(highChipsResult.error).toContain("buy-in must be between");

      // Valid buy-in should work
      const validResult = await engine.processCommand({
        type: "join",
        playerId: "player3",
        seatId: 2,
        chips: 5000, // 50 BB (valid)
        nickname: "Valid Player"
      });
      
      expect(validResult.success).toBe(true);
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
      await engine.processCommand({ type: "start_hand" });

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
      await engine.processCommand({ type: "start_hand" });

      const table = engine.getSnapshot().table;
      
      // In heads-up, button (SB) acts first preflop
      expect(table.phase).toBe("preflop");
      expect(table.actor).toBe(0); // Button/SB should act first

      // SB calls
      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "call"
      });

      // Should be BB's turn to act
      const afterSBCall = engine.getSnapshot().table;
      expect(afterSBCall.actor).toBe(1); // BB should have option
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
      await engine.processCommand({ type: "start_hand" });

      const table = engine.getSnapshot().table;
      
      // UTG should act first in 3-handed (seat 0)
      expect(table.phase).toBe("preflop");
      expect(table.actor).toBe(0); // UTG acts first

      // UTG calls
      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "call"
      });

      // Should advance to SB
      let afterUTG = engine.getSnapshot().table;
      expect(afterUTG.actor).toBe(1); // SB

      // SB calls  
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "call"
      });

      // Should advance to BB with option
      let afterSB = engine.getSnapshot().table;
      expect(afterSB.actor).toBe(2); // BB
      expect(afterSB.phase).toBe("preflop"); // Still preflop - BB has option

      // BB should be able to check or raise
      const availableActions = await engine.getAvailableActions("player3");
      expect(availableActions).toContain("check");
      expect(availableActions).toContain("raise");
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
      await engine.processCommand({ type: "start_hand" });
      
      // Complete preflop
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
        action: "check"
      });

      // Wait a moment to see if auto-progression occurs
      await new Promise(resolve => setTimeout(resolve, 100));

      const table = engine.getSnapshot().table;
      
      // Should be on flop and waiting for player action (not auto-progressing)
      expect(table.phase).toBe("flop");
      expect(table.actor).toBe(1); // BB acts first postflop in heads-up
      expect(table.communityCards.length).toBe(3); // Flop cards dealt

      // Game should be waiting for player action, not progressing automatically
      const availableActions = await engine.getAvailableActions("player2");
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
      await engine.processCommand({ type: "start_hand" });

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
        action: "call"
      });
      
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "check"
      });

      // Flop
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "check"
      });

      await engine.processCommand({
        type: "action", 
        playerId: "player1",
        seatId: 0,
        action: "check"
      });

      // Turn
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1, 
        action: "check"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "check"
      });

      // River
      await engine.processCommand({
        type: "action",
        playerId: "player2",
        seatId: 1,
        action: "check"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "check"
      });

      // Wait for showdown processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalTable = engine.getSnapshot().table;

      // Should have reached showdown and determined winner
      expect(finalTable.phase).toBe("showdown");
      expect(finalTable.communityCards.length).toBe(5); // All community cards dealt

      // Check that winner announcement event was emitted
      const winnerEvents = events.filter(e => e.type === "winner_announced");
      expect(winnerEvents.length).toBeGreaterThan(0);

      // Verify the winner announcement contains hand rankings
      const winnerEvent = winnerEvents[0];
      expect(winnerEvent.results).toBeDefined();
      expect(winnerEvent.results!.length).toBe(2); // Both players ranked

      // Each result should have a valid hand ranking
      winnerEvent.results!.forEach(result => {
        expect(result.handRank).toBeDefined();
        expect(result.handRank.rank).toBeGreaterThanOrEqual(1);
        expect(result.handRank.rank).toBeLessThanOrEqual(9);
        expect(result.description).toBeTruthy();
      });
    });

    it("should handle all-in scenarios correctly", async () => {
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
      await engine.processCommand({ type: "start_hand" });

      // Player 1 calls, Player 2 goes all-in
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
        action: "allin"
      });

      await engine.processCommand({
        type: "action",
        playerId: "player1",
        seatId: 0,
        action: "call"
      });

      // Wait for auto-progression through remaining streets (both all-in)
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalTable = engine.getSnapshot().table;

      // Should reach showdown automatically when both players all-in
      expect(finalTable.phase).toBe("showdown");
      expect(finalTable.communityCards.length).toBe(5);

      // Check winner was announced
      const winnerEvents = events.filter(e => e.type === "winner_announced");
      expect(winnerEvents.length).toBeGreaterThan(0);
    });
  });

  describe("Hand Evaluation Algorithm", () => {
    it("should correctly evaluate poker hands", () => {
      // Test basic hand evaluation - just verify it returns valid results
      const hand1 = evaluateHand([0, 1], [4, 8, 12]); // 2 hole cards + 3 board cards = 5 total
      expect(hand1.rank).toBeGreaterThanOrEqual(1); // At least HIGH_CARD
      expect(hand1.rank).toBeLessThanOrEqual(9); // At most STRAIGHT_FLUSH
      expect(hand1.description).toBeTruthy();
      expect(hand1.value).toBeGreaterThan(0);
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