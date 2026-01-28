import { describe, it, expect } from 'vitest';
import type { Table, Seat } from '../core/types';
import { getBettingRoundState } from '../utils/ringOrder';

function makeSeats(active: number[], chips = 100): Seat[] {
  return Array.from({ length: 9 }, (_, i) => active.includes(i)
    ? ({ id: i, pid: `P${i}`, chips, committed: 0, streetCommitted: 0, status: 'active' } as any)
    : ({ id: i, chips: 0, committed: 0, streetCommitted: 0, status: 'empty' } as any)
  );
}

function tableBase(seats: Seat[], phase: any = 'preflop'): Table {
  return {
    id: 't', seats,
    button: 0,
    smallBlind: 5,
    bigBlind: 10,
    phase,
    currentBet: 0,
    lastRaiseSize: 10,
    pots: [], communityCards: [],
    blinds: { sb: 5, bb: 10 },
    handNumber: 1, timestamp: Date.now(),
  } as any;
}

describe('Round completion', () => {
  it('preflop: BB option delays completion until BB acts', () => {
    const seats = makeSeats([0,1,2]);
    const t = tableBase(seats, 'preflop');
    // blinds posted: SB seat1=5, BB seat2=10
    t.seats[1].streetCommitted = 5; t.seats[1].committed = 5;
    t.seats[2].streetCommitted = 10; t.seats[2].committed = 10;
    t.currentBet = 10; t.bbSeat = 2; t.bbHasActed = false;

    // UTG folds
    t.seats[0].status = 'folded' as any;
    let state = getBettingRoundState(t);
    expect(state.isComplete).toBe(false);

    // SB calls to 10
    t.seats[1].chips -= 5;
    t.seats[1].committed = 10;
    t.seats[1].streetCommitted = 10;
    state = getBettingRoundState(t);
    // Action should return to BB option; not complete yet
    expect(state.isComplete).toBe(false);

    // BB checks (bbHasActed true elsewhere in engine after action); emulate completion
    t.bbHasActed = true;
    state = getBettingRoundState(t);
    expect(state.isComplete).toBe(true);
  });

  it('postflop: no bet -> completes when all active have acted', () => {
    const seats = makeSeats([0,1,2]);
    const t = tableBase(seats, 'flop');
    t.currentBet = 0;
    // simulate that all active have acted (playersActedThisRound Set)
    (t as any).playersActedThisRound = new Set([0,1,2]);
    const state = getBettingRoundState(t);
    expect(state.isComplete).toBe(true);
  });
});

