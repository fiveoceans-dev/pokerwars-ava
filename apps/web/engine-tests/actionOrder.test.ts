import { describe, it, expect } from "vitest";
import { getBlindPositions, getFirstActor } from "../server/game-engine/logic/gameRules";
import { getNextActor } from "../server/game-engine/utils/ringOrder";
import { Table, Seat } from "../server/game-engine/core/types";

function makeSeats(ids: (string | null)[], chips = 1000): Seat[] {
  return ids.map((pid, idx) => ({
    id: idx,
    pid: pid ?? undefined,
    chips: pid ? chips : 0,
    committed: 0,
    streetCommitted: 0,
    status: pid ? "active" : "empty",
  }));
}

function baseTable(seats: Seat[], button = 0, sb = 5, bb = 10): Table {
  return {
    id: "t1",
    seats,
    button,
    smallBlind: sb,
    bigBlind: bb,
    phase: "waiting",
    currentBet: 0,
    lastRaiseSize: bb,
    pots: [],
    communityCards: [],
    blinds: { sb, bb },
    handNumber: 1,
    timestamp: Date.now(),
  } as Table;
}

describe("blind positions and first actor", () => {
  it("assigns SB=button and BB=other in heads-up preflop; button acts first", () => {
    const seats = makeSeats(["A", "B"]);
    const table = baseTable(seats, 0);
    const blinds = getBlindPositions(table.seats, table.button)!;
    expect(blinds).toEqual({ sb: 0, bb: 1 });

    const first = getFirstActor({ ...table, seats }, true);
    expect(first.isHeadsUp).toBe(true);
    expect(first.actor).toBe(0);
  });

  it("assigns blinds clockwise in multi-way and UTG acts first preflop", () => {
    const seats = makeSeats(["A", "B", "C"]);
    const table = baseTable(seats, 0);
    const blinds = getBlindPositions(table.seats, table.button)!;
    expect(blinds).toEqual({ sb: 1, bb: 2 });

    const first = getFirstActor({ ...table, seats }, true);
    expect(first.isHeadsUp).toBe(false);
    expect(first.actor).toBe(0);
  });

  it("HU postflop: BB acts first", () => {
    const seats = makeSeats(["A", "B"], 100);
    const table = baseTable(seats, 0);
    const postflop = { ...table, phase: "flop" as const, street: "flop" as const };
    const first = getFirstActor(postflop as any, false);
    expect(first.isHeadsUp).toBe(true);
    expect(first.actor).toBe(1);
  });
});

describe("preflop BB option flow", () => {
  it("returns to BB with option when no raises", () => {
    const seats = makeSeats(["A", "B", "C"], 100);
    const table0 = baseTable(seats, 0, 5, 10);

    const afterBlinds = { ...table0, phase: "preflop" as const } as Table;
    afterBlinds.seats = afterBlinds.seats.map((s) => ({ ...s }));
    afterBlinds.seats[1].chips -= 5;
    afterBlinds.seats[1].committed = 5;
    afterBlinds.seats[1].streetCommitted = 5;
    afterBlinds.seats[2].chips -= 10;
    afterBlinds.seats[2].committed = 10;
    afterBlinds.seats[2].streetCommitted = 10;
    afterBlinds.currentBet = 10;
    afterBlinds.lastRaiseSize = 10;
    afterBlinds.bbSeat = 2;
    afterBlinds.bbHasActed = false;

    const t1 = { ...afterBlinds, actor: 0 } as Table;
    t1.seats = t1.seats.map((s) => ({ ...s }));
    t1.seats[0].status = "folded";
    const n1 = getNextActor(t1);
    expect(n1.isComplete).toBe(false);
    expect(n1.actor).toBe(1);

    const t2 = { ...t1, actor: 1 } as Table;
    t2.seats = t2.seats.map((s) => ({ ...s }));
    const toCall = 10 - t2.seats[1].streetCommitted;
    t2.seats[1].chips -= toCall;
    t2.seats[1].committed += toCall;
    t2.seats[1].streetCommitted += toCall;
    const n2 = getNextActor(t2);
    expect(n2.isComplete).toBe(false);
    expect(n2.actor).toBe(2);
  });
});

describe("bet/raise ordering and completion", () => {
  it("completes when action returns to last aggressor after all calls", () => {
    const seats = makeSeats(["A", "B", "C"], 100);
    const table0 = baseTable(seats, 0, 5, 10);
    const t = { ...table0, phase: "preflop" as const } as Table;
    t.seats = t.seats.map((s) => ({ ...s }));
    t.seats[1].chips -= 5; t.seats[1].committed = 5; t.seats[1].streetCommitted = 5;
    t.seats[2].chips -= 10; t.seats[2].committed = 10; t.seats[2].streetCommitted = 10;
    t.currentBet = 10; t.lastRaiseSize = 10; t.bbSeat = 2; t.bbHasActed = false;

    t.actor = 0;
    const raiseTo = 30;
    t.seats[0].chips -= raiseTo; t.seats[0].committed = raiseTo; t.seats[0].streetCommitted = raiseTo;
    t.currentBet = 30; t.lastAggressor = 0; t.lastRaiseSize = 20;
    const n1 = getNextActor(t);
    expect(n1.isComplete).toBe(false);
    expect(n1.actor).toBe(1);

    const t2 = { ...t, seats: t.seats.map((s) => ({ ...s })) } as Table;
    t2.actor = 1; t2.seats[1].status = "folded";
    const n2 = getNextActor(t2);
    expect(n2.isComplete).toBe(false);
    expect(n2.actor).toBe(2);

    const t3 = { ...t2, seats: t2.seats.map((s) => ({ ...s })) } as Table;
    t3.actor = 2;
    const toCall = 30 - t3.seats[2].streetCommitted;
    t3.seats[2].chips -= toCall; t3.seats[2].committed += toCall; t3.seats[2].streetCommitted += toCall;
    const n3 = getNextActor(t3);
    expect(n3.isComplete).toBe(true);
  });
});

describe("edge cases with all-in blinds", () => {
  it("HU preflop: SB all-in -> BB is first actor with option", () => {
    const seats = makeSeats(["A", "B"], 100);
    seats[0].chips = 5;
    const table = baseTable(seats, 0, 5, 10);

    const after = { ...table, phase: "preflop" as const } as Table;
    after.seats = after.seats.map((s) => ({ ...s }));
    after.seats[0].chips = 0;
    after.seats[0].committed = 5;
    after.seats[0].streetCommitted = 5;
    after.seats[0].status = "allin";
    after.seats[1].chips -= 10;
    after.seats[1].committed = 10;
    after.seats[1].streetCommitted = 10;
    after.currentBet = 10;
    after.lastRaiseSize = 10;
    after.bbSeat = 1;
    after.bbHasActed = false;

    const first = getFirstActor(after as any, true);
    expect(first.actor).toBe(1);

    after.actor = 1;
    const n = getNextActor(after);
    expect(n.isComplete).toBe(false);
    expect(n.actor).toBe(1);
  });
});

