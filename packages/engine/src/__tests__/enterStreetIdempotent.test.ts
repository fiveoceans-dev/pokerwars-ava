import { describe, it, expect } from 'vitest';
import type { Table, Seat } from '../core/types';
import { enterStreet } from '../core/reducers/cardDealing';

function makeSeats(active: number[], chips = 100): Seat[] {
  return Array.from({ length: 9 }, (_, i) => active.includes(i)
    ? ({ id: i, pid: `P${i}`, chips, committed: 0, streetCommitted: 0, status: 'active' } as any)
    : ({ id: i, chips: 0, committed: 0, streetCommitted: 0, status: 'empty' } as any)
  );
}

function tableBase(seats: Seat[]): Table {
  return {
    id: 't', seats,
    button: 0,
    smallBlind: 5,
    bigBlind: 10,
    phase: 'preflop' as any,
    currentBet: 0,
    lastRaiseSize: 10,
    pots: [], communityCards: [], burns: { flop: [], turn: [], river: [] },
    blinds: { sb: 5, bb: 10 },
    handNumber: 1, timestamp: Date.now(),
    deckCodes: Array.from({ length: 52 }, (_, i) => i), deckIndex: 0,
  } as any;
}

describe('EnterStreet idempotency', () => {
  it('does not deal flop twice when called again (even with manual cards)', () => {
    const seats = makeSeats([0,1,2]);
    let t = tableBase(seats);
    // first flop deal (auto)
    let res = enterStreet(t, 'flop');
    t = res.nextState as Table;
    const firstFlop = t.communityCards.slice();
    expect(firstFlop.length).toBe(3);
    // second call with manual cards should be ignored
    res = enterStreet(t, 'flop', [1,2,3]);
    const t2 = res.nextState as Table;
    expect(t2.communityCards.length).toBe(3);
    expect(t2.communityCards).toEqual(firstFlop);
  });
});

