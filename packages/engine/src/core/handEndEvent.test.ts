import { describe, it, expect, vi } from "vitest";
import { EventEngine } from "./eventEngine";

describe("hand completion event", () => {
  it("records HandEnd in event log after payout", async () => {
    vi.useFakeTimers();

    const engine = new EventEngine("t1", 5, 10);

    await engine.dispatch({ t: "PlayerJoin", seat: 0, pid: "A", chips: 100 });
    await engine.dispatch({ t: "PlayerJoin", seat: 1, pid: "B", chips: 100 });

    await engine.dispatch({ t: "StartHand", handNumber: 1, timestamp: Date.now() });
    await engine.dispatch({ t: "Showdown", results: [] });

    const distributions = [
      { pid: "A", amount: 20, potIndex: 0, reason: "win" as const },
    ];
    const payout = engine.dispatch({ t: "Payout", distributions });

    await vi.runAllTimersAsync();
    await payout;

    const events = engine.getEventLog().map((e) => e.t);
    expect(events).toContain("HandEnd");

    vi.useRealTimers();
  });
});
