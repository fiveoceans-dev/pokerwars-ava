import { describe, it, expect } from 'vitest';
import type { Table, Seat } from '../core/types';
import { getAvailableActions, getBettingLimits } from '../logic/validation';

function makeSeats(occupied: number[], chips = 100): Seat[] {
  const seats: Seat[] = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    chips: 0,
    committed: 0,
    streetCommitted: 0,
    status: 'empty',
  } as any));
  occupied.forEach((i) => {
    seats[i] = {
      id: i,
      pid: `P${i}`,
      chips,
      committed: 0,
      streetCommitted: 0,
      status: 'active',
    } as any;
  });
  return seats;
}

function baseTable(seats: Seat[], button = 0, sb = 5, bb = 10): Table {
  return {
    id: 't1',
    seats,
    button,
    smallBlind: sb,
    bigBlind: bb,
    phase: 'preflop' as any,
    currentBet: 0,
    lastRaiseSize: bb,
    pots: [],
    communityCards: [],
    blinds: { sb, bb },
    handNumber: 1,
    timestamp: Date.now(),
  } as any;
}

describe('Available actions', () => {
  it('preflop: UTG has BET when currentBet=0', () => {
    const seats = makeSeats([0,1,2]);
    const t = baseTable(seats, 0, 5, 10);
    // blinds posted
    t.seats[1].committed = t.seats[1].streetCommitted = 5;
    t.seats[2].committed = t.seats[2].streetCommitted = 10; // BB
    t.currentBet = 10;
    t.bbSeat = 2; t.bbHasActed = false;
    // UTG (seat 0) acts first; toCall=10
    const utgActions = getAvailableActions(t, 0);
    expect(utgActions).toContain('FOLD');
    expect(utgActions).toContain('CALL');
    expect(utgActions).toContain('RAISE');
    // no BET when currentBet>0
    expect(utgActions).not.toContain('BET');
  });

  it('preflop: BB option allows CHECK and RAISE when toCall=0 and currentBet=BB', () => {
    const seats = makeSeats([0,1]);
    const t = baseTable(seats, 0, 5, 10);
    // blinds posted: SB seat 0, BB seat 1
    t.seats[0].committed = t.seats[0].streetCommitted = 5;
    t.seats[1].committed = t.seats[1].streetCommitted = 10;
    t.currentBet = 10;
    t.bbSeat = 1; t.bbHasActed = false;
    t.actor = 1;
    const bbActions = getAvailableActions(t, 1);
    expect(bbActions).toContain('CHECK');
    expect(bbActions).toContain('RAISE');
    expect(bbActions).toContain('ALLIN');
    expect(bbActions).toContain('FOLD');
    expect(bbActions).not.toContain('BET');
  });

  it('postflop: when currentBet==0, player can BET or CHECK', () => {
    const seats = makeSeats([0,1,2]);
    const t = baseTable(seats, 0, 5, 10);
    t.phase = 'flop' as any;
    t.currentBet = 0;
    t.actor = 1;
    const actions = getAvailableActions(t, 1);
    expect(actions).toContain('CHECK');
    expect(actions).toContain('BET');
  });
});

