import { describe, it, expect } from 'vitest';
import * as CardLedger from './cardLedger';
import type { Table } from '../core/types';

function makeTable(seed: string): Table {
  const deckCodes = CardLedger.shuffle(seed);
  return {
    id: 't1',
    seats: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      chips: 1000,
      committed: 0,
      streetCommitted: 0,
      status: 'empty',
    })),
    button: 0,
    smallBlind: 5,
    bigBlind: 10,
    deckSeed: seed,
    deckCodes,
    deckIndex: 0,
    phase: 'deal',
    currentBet: 0,
    lastRaiseSize: 10,
    pots: [],
    communityCards: [],
    burns: { flop: [], turn: [], river: [] },
    blinds: { sb: 5, bb: 10 },
    handNumber: 1,
    timestamp: Date.now(),
  } as unknown as Table;
}

describe('CardLedger.shuffle determinism', () => {
  it('produces deterministic deck order for the same seed', () => {
    const a = CardLedger.shuffle('seed-1');
    const b = CardLedger.shuffle('seed-1');
    expect(a).toHaveLength(52);
    expect(b).toHaveLength(52);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(52);
  });
});

describe('CardLedger.drawNext bounds', () => {
  it('draws without duplication and advances index', () => {
    const deck = CardLedger.shuffle('seed-2');
    const d1 = CardLedger.drawNext(deck, 0, 5);
    const d2 = CardLedger.drawNext(deck, d1.nextIndex, 5);
    expect(d1.cards).toHaveLength(5);
    expect(d2.cards).toHaveLength(5);
    const all = [...d1.cards, ...d2.cards];
    expect(new Set(all).size).toBe(10);
  });

  it('throws on underflow', () => {
    const deck = CardLedger.shuffle('seed-3');
    expect(() => CardLedger.drawNext(deck, 50, 3)).toThrow();
  });
});

describe('DealHole round-robin', () => {
  it('deals one card per round to active seats left of button', () => {
    const table = makeTable('seed-4');
    // seats 1,2,3 are active
    table.seats[1].status = 'active' as any; table.seats[1].pid = 'A';
    table.seats[2].status = 'active' as any; table.seats[2].pid = 'B';
    table.seats[3].status = 'active' as any; table.seats[3].pid = 'C';
    const order = [1,2,3];
    const { assignments, nextIndex } = CardLedger.dealHole(table, order);
    expect(assignments.size).toBe(3);
    // total cards drawn = 6
    expect(nextIndex).toBe(6);
    const round1 = Array.from(assignments.values()).map(([c1]) => c1);
    const round2 = Array.from(assignments.values()).map(([,c2]) => c2);
    // ensure no overlap
    const all = [...round1, ...round2];
    expect(new Set(all).size).toBe(6);
  });
});

describe('Street dealing with burns', () => {
  it('burns 1 and adds 3 cards for flop', () => {
    const table = makeTable('seed-5');
    const { burn, cards, nextIndex } = CardLedger.dealFlop(table);
    expect(typeof burn).toBe('number');
    expect(cards).toHaveLength(3);
    expect(nextIndex).toBe(1 + 3);
    const all = [burn, ...cards];
    expect(new Set(all).size).toBe(4);
  });

  it('burns 1 and adds 1 card for turn/river', () => {
    const table = makeTable('seed-6');
    const flop = CardLedger.dealFlop(table);
    table.deckIndex = flop.nextIndex;
    const turn = CardLedger.dealTurnOrRiver(table);
    expect(typeof turn.burn).toBe('number');
    expect(typeof turn.card).toBe('number');
    expect(turn.nextIndex).toBe(flop.nextIndex + 2);
  });
});

