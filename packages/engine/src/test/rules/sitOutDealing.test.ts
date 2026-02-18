import { describe, it, expect, vi } from "vitest";
import { EventEngine } from "../../core/eventEngine";
import { Table, SeatStatus, PokerEvent } from "../../core/types";
import { getSitOutManager, clearAllSitOutManagers } from "../../managers/sitOutManager";

// Mock timer manager for tests (copied from integration.test.ts)
class MockTimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  schedule(id: string, delay: number, callback: () => void): void { }
  cancel(id: string): void { }
  cancelAll(): void { }
  startActionTimer(playerId: string, seatId: number, timeoutMs: number): void { }
  cancelActionTimer(playerId: string): void { this.cancel(`action_${playerId}`); }
  startHandTimer(tableId: string, delay: number, callback: () => void): void { this.schedule(`hand_${tableId}`, delay, callback); }
  cancelHandTimer(tableId: string): void { this.cancel(`hand_${tableId}`); }
  startDealTimer(tableId: string, delay: number, callback: () => void): void { this.schedule(`deal_${tableId}`, delay, callback); }
  cancelDealTimer(tableId: string): void { this.cancel(`deal_${tableId}`); }
  clearTimer(timerId: string): void { this.cancel(timerId); }
  clearAllTimers(): void { this.cancelAll(); }
}

describe("Sit-Out Card Dealing Regression", () => {
  let engine: EventEngine;
  let timerManager: MockTimerManager;
  let sitOutManager: ReturnType<typeof getSitOutManager>;

  beforeEach(() => {
    vi.useRealTimers();
    clearAllSitOutManagers(); // Call the global function to clear all managers first
    
    engine = new EventEngine("test-table", 5, 10);
    engine.setAutoStart(false); // Disable auto-start for deterministic tests

    timerManager = new MockTimerManager();
    engine.setTimerManager(timerManager);

    sitOutManager = getSitOutManager("test-table"); // Get the manager after clearing
  });

  afterEach(() => {
    clearAllSitOutManagers();
  });

  it("a sitting-out player receives no hole cards on next hand", async () => {
    // 1. Add three players
    await engine.dispatch({ t: "PlayerJoin", seat: 0, pid: "P1", chips: 1000 });
    await engine.dispatch({ t: "PlayerJoin", seat: 1, pid: "P2", chips: 1000 });
    await engine.dispatch({ t: "PlayerJoin", seat: 2, pid: "P3", chips: 1000 }); // Add P3

    // Ensure engine is idle after setup
    await engine.waitIdle();

    // 2. Make one player sit out (P2)
    await engine.dispatch({ t: "PlayerSitOut", seat: 1, pid: "P2", reason: "voluntary" });
    await engine.waitIdle();

    // Verify P2 is marked as sitting out by the manager
    expect(sitOutManager.isPlayerSittingOut("P2")).toBe(true);

    // 3. Start a hand
    await engine.dispatch({ t: "StartHand", handNumber: 1, timestamp: Date.now() });
    await engine.waitIdle();

    // 4. Assert that the sitting-out player (P2) does not receive hole cards, and the active player (P1 and P3) does
    const snapshot = engine.getSnapshot();
    const p1Seat = snapshot.table.seats[0];
    const p2Seat = snapshot.table.seats[1];
    const p3Seat = snapshot.table.seats[2]; // Get P3 seat

    expect(p1Seat.pid).toBe("P1");
    expect(p1Seat.status).toBe("active");
    expect(p1Seat.holeCards).toHaveLength(2); // P1 should receive cards

    expect(p2Seat.pid).toBe("P2");
    expect(p2Seat.status).toBe("sittingOut"); 
    expect(p2Seat.holeCards).toBeUndefined(); // P2 should NOT receive cards

    expect(p3Seat.pid).toBe("P3");
    expect(p3Seat.status).toBe("active");
    expect(p3Seat.holeCards).toHaveLength(2); // P3 should receive cards
  });

  it("a player who sits back in receives hole cards on next hand", async () => {
    // 1. Add two players
    await engine.dispatch({ t: "PlayerJoin", seat: 0, pid: "P1", chips: 1000 });
    await engine.dispatch({ t: "PlayerJoin", seat: 1, pid: "P2", chips: 1000 });
    await engine.waitIdle();

    // 2. Make P2 sit out
    await engine.dispatch({ t: "PlayerSitOut", seat: 1, pid: "P2", reason: "voluntary" });
    await engine.waitIdle();
    expect(sitOutManager.isPlayerSittingOut("P2")).toBe(true);

    // 3. Make P2 sit back in
    await engine.dispatch({ t: "PlayerSitIn", seat: 1, pid: "P2" });
    await engine.waitIdle();
    expect(sitOutManager.isPlayerSittingOut("P2")).toBe(false);

    // 4. Start a hand
    await engine.dispatch({ t: "StartHand", handNumber: 1, timestamp: Date.now() });
    await engine.waitIdle();

    // 5. Assert P2 receives hole cards
    const snapshot = engine.getSnapshot();
    const p1Seat = snapshot.table.seats[0];
    const p2Seat = snapshot.table.seats[1];

    expect(p1Seat.pid).toBe("P1");
    expect(p1Seat.status).toBe("active");
    expect(p1Seat.holeCards).toHaveLength(2);

    expect(p2Seat.pid).toBe("P2");
    expect(p2Seat.status).toBe("active"); // P2 should be active now
    expect(p2Seat.holeCards).toHaveLength(2); // P2 should receive cards
  });
});
