import { describe, it, expect, vi } from "vitest";
import { EventEngine } from "./eventEngine";

// Mock timer manager for tests (copied from integration.test.ts)
class MockTimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  schedule(id: string, delay: number, callback: () => void): void {
    // In a mock, we don't actually schedule; just log or simulate immediate execution if needed
    // For this test, we simply ignore real delays.
    // console.log(`MockTimer: Scheduled ${delay}ms for ${id}`);
  }

  cancel(id: string): void {
    // console.log(`MockTimer: Cancelled ${id}`);
  }

  cancelAll(): void {
    // console.log(`MockTimer: Cancelled all timers`);
  }

  // Additional methods needed by EventEngine (simple mocks)
  startActionTimer(playerId: string, seatId: number, timeoutMs: number): void {
    // console.log(`MockTimer: Would start ${timeoutMs}ms timer for player ${playerId} at seat ${seatId}`);
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

describe("hand completion event", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records HandEnd in event log after payout", { timeout: 20000 }, async () => {
    vi.useRealTimers(); // Explicitly use real timers for this test

    const engine = new EventEngine("t1", 5, 10);
    engine.setAutoStart(false);

    // Set the mock timer manager
    const timerManager = new MockTimerManager();
    engine.setTimerManager(timerManager);

    await engine.dispatch({ t: "PlayerJoin", seat: 0, pid: "A", chips: 1000 });
    await engine.dispatch({ t: "PlayerJoin", seat: 1, pid: "B", chips: 1000 });

    await engine.dispatch({ t: "StartHand", handNumber: 1, timestamp: Date.now() });
    
    // Simulate game progression to showdown by dealing all streets
    // Allow engine to deal cards dynamically
    await engine.dispatch({ t: "EnterStreet", street: "flop", cards: [] });
    await engine.dispatch({ t: "EnterStreet", street: "turn", cards: [] });
    await engine.dispatch({ t: "EnterStreet", street: "river", cards: [] });
    
    // Now trigger showdown
    await engine.dispatch({ t: "Showdown", results: [] });

    // The Showdown event's side effect EVALUATE_HANDS will dispatch Payout naturally.
    // The following manual dispatch is redundant and should be removed.

    // With real timers, the delay within the engine will naturally occur.
    // We don't need vi.advanceTimersByTime(5000) anymore.
    
    // Wait for the engine to become idle after HandEnd
    await engine.waitIdle();

    const events = engine.getEventLog().map((e) => e.t);
    expect(events).toContain("HandEnd");
  });
});
