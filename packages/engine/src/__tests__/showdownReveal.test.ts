import { describe, it, expect } from "vitest";
import { reduce, processShowdown, processPayout } from "../core/reducer";
import type { Table, PayoutDistribution } from "../core/types";

const baseSeat = (id: number) => ({
  id,
  pid: undefined as string | undefined,
  chips: 1000,
  committed: 0,
  streetCommitted: 0,
  status: "empty" as const,
});

const makeTable = (): Table => ({
  id: "t",
  seats: Array.from({ length: 9 }, (_, i) => ({ ...baseSeat(i) })),
  button: 0,
  smallBlind: 50,
  bigBlind: 100,
  deckSeed: "seed",
  deckCodes: [],
  phase: "river",
  communityCards: [10, 11, 12, 13, 14],
  burns: { flop: [], turn: [], river: [] },
  blinds: { sb: 50, bb: 100 },
  handNumber: 1,
  timestamp: Date.now(),
  currentBet: 0,
  lastRaiseSize: 100,
  pots: [{ amount: 1000, eligiblePids: ["p1", "p2"] }],
});

describe("Showdown reveal workflow", () => {
  it("forces all remaining players face-up at showdown and prevents mucking", () => {
    const table = makeTable();
    table.seats[0] = {
      ...table.seats[0],
      pid: "p1",
      holeCards: [1, 2],
      status: "active",
    };
    table.seats[1] = {
      ...table.seats[1],
      pid: "p2",
      holeCards: [3, 4],
      status: "allin",
    };

    const { nextState: showdownState } = processShowdown(table, []);
    expect(showdownState.phase).toBe("showdown");
    expect(showdownState.autoRevealAll).toBe(true);
    expect(new Set(showdownState.revealedPids)).toEqual(
      new Set(["p1", "p2"].map((p) => p.toLowerCase())),
    );

    const { nextState: afterMuck } = reduce(showdownState, {
      t: "PlayerMuckCards",
      pid: "p2",
    });
    expect(new Set(afterMuck.revealedPids)).toEqual(
      new Set(["p1", "p2"].map((p) => p.toLowerCase())),
    );
  });

  it("keeps winners revealed through payout", () => {
    const table = makeTable();
    table.seats[0] = {
      ...table.seats[0],
      pid: "p1",
      holeCards: [1, 2],
      status: "active",
    };
    table.seats[1] = {
      ...table.seats[1],
      pid: "p2",
      holeCards: [3, 4],
      status: "active",
    };

    const { nextState: showdownState } = processShowdown(table, []);
    const payouts: PayoutDistribution[] = [
      { pid: "p1", amount: 800, potIndex: 0, reason: "win" },
      { pid: "p2", amount: 200, potIndex: 0, reason: "tie" },
    ];
    const { nextState: paid } = processPayout(showdownState, payouts);
    expect(paid.phase).toBe("handEnd");
    expect(new Set(paid.revealedPids)).toEqual(
      new Set(["p1", "p2"].map((p) => p.toLowerCase())),
    );
  });
});
