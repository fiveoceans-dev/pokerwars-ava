import { describe, it, expect } from 'vitest';
import { getNextActor } from '../ringOrder';
import type { Table } from '../../core/types';

function makeTable(): Table {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    chips: i >= 1 && i <= 3 ? 1000 : 0, // Only seats 1,2,3 have chips
    committed: 0,
    streetCommitted: 0,
    status: 'empty' as const,
  }));

  // Button at 0, SB at 1, BB at 2, UTG at 3
  seats[1] = { ...seats[1], pid: 'SB', status: 'active' as const, streetCommitted: 5, committed: 5 };
  seats[2] = { ...seats[2], pid: 'BB', status: 'active' as const, streetCommitted: 10, committed: 10 };
  seats[3] = { ...seats[3], pid: 'UTG', status: 'active' as const, streetCommitted: 10, committed: 10 };

  return {
    id: 't1',
    seats,
    button: 0,
    smallBlind: 5,
    bigBlind: 10,
    phase: 'preflop',
    street: 'preflop',
    actor: 1, // SB to act; next actionable is BB (2)
    lastAggressor: undefined,
    currentBet: 10,
    lastRaiseSize: 10,
    pots: [],
    communityCards: [],
    blinds: { sb: 5, bb: 10 },
    handNumber: 1,
    timestamp: Date.now(),
    bbSeat: 2,
    bbHasActed: false,
  };
}

describe('BB option preflop', () => {
  it('does not complete round when action returns to BB with option available', () => {
    const table = makeTable();
    const res = getNextActor(table);
    expect(res.isComplete).toBe(false);
    expect(res.actor).toBe(2); // BB should be next to act
  });

  it('completes round after BB has acted and all matched', () => {
    const table = makeTable();
    table.bbHasActed = true;
    const res = getNextActor(table);
    expect(res.isComplete).toBe(true);
    expect(res.actor).toBeUndefined();
  });
});

