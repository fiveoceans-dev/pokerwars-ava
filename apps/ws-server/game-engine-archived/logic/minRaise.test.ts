import { describe, it, expect } from "vitest";
import { validateAction } from "./validation";
import { Table } from "../core/types";

describe.each([10, 50])("minimum raise calculation with big blind %d", (bb) => {
  const sb = bb / 2;
  const lastRaise = bb * 3;

  function createTable(): Table {
    return {
      id: "t1",
      seats: [
        {
          id: 0,
          pid: "A",
          chips: 1000,
          committed: bb * 4,
          streetCommitted: bb * 4,
          status: "active",
        },
        {
          id: 1,
          pid: "B",
          chips: 1000,
          committed: bb,
          streetCommitted: bb,
          status: "active",
        },
      ],
      button: 0,
      smallBlind: sb,
      bigBlind: bb,
      phase: "preflop",
      street: "preflop",
      actor: 1,
      lastAggressor: 0,
      currentBet: bb * 4,
      lastRaiseSize: lastRaise,
      pots: [],
      communityCards: [],
      blinds: { sb, bb },
      handNumber: 1,
      timestamp: Date.now(),
    };
  }

  it("rejects raises below last raise size", () => {
    const table = createTable();
    const result = validateAction(table, 1, "RAISE", lastRaise - sb);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`Minimum raise is $${lastRaise}`);
  });

  it("accepts raises meeting last raise size", () => {
    const table = createTable();
    const result = validateAction(table, 1, "RAISE", lastRaise);
    expect(result.valid).toBe(true);
  });
});
