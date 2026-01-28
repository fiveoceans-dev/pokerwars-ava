/**
 * Comprehensive Betting Rules Test Suite
 * 
 * Tests all betting scenarios according to poker_rules.md:
 * - Minimum bet = BB
 * - Minimum raise = last full bet/raise size  
 * - Short all-ins don't reset min raise
 * - Reopening betting rules
 * - Street completion conditions
 * - Check/call/bet/raise validation
 */

import { describe, it, expect } from 'vitest';
import { validateAction, getAvailableActions } from '../../logic/validation';
import { applyAction } from '../../core/reducers/actionProcessing';
import { Table, Seat } from '../../core/types';

/**
 * Helper to create seats
 */
function createSeats(players: Array<{id: number, pid: string, chips: number, committed?: number, streetCommitted?: number}>): Seat[] {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    chips: 0,
    committed: 0,
    streetCommitted: 0,
    status: 'empty' as const,
  }));

  players.forEach(p => {
    seats[p.id] = {
      id: p.id,
      pid: p.pid,
      chips: p.chips,
      committed: p.committed || 0,
      streetCommitted: p.streetCommitted || 0,
      status: 'active' as const,
    };
  });

  return seats;
}

/**
 * Helper to create table
 */
function createTable(seats: Seat[], options: Partial<Table> = {}): Table {
  return {
    id: 'test',
    seats,
    button: 0,
    smallBlind: 5,
    bigBlind: 10,
    phase: 'preflop',
    street: 'preflop',
    currentBet: 0,
    lastRaiseSize: 10, // Default to BB
    pots: [],
    communityCards: [],
    blinds: { sb: 5, bb: 10 },
    handNumber: 1,
    timestamp: Date.now(),
    ...options,
  } as Table;
}

describe('Action Validation', () => {
  describe('Fold validation', () => {
    it('Always allows fold for active player', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(true);
    });

    it('Rejects fold for non-active player', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      seats[0].status = 'folded';
      const table = createTable(seats, { actor: 0 });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('folded');
    });
  });

  describe('Check validation', () => {
    it('Allows check when no bet to call', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = validateAction(table, 0, 'CHECK');
      
      expect(result.valid).toBe(true);
    });

    it('Rejects check when there\'s a bet to call', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 },
        { id: 1, pid: 'P2', chips: 80, streetCommitted: 20 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = validateAction(table, 0, 'CHECK');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('$20 to call');
    });

    it('Allows BB to check preflop with BB option', () => {
      const seats = createSeats([
        { id: 0, pid: 'SB', chips: 95, streetCommitted: 10 },
        { id: 1, pid: 'BB', chips: 90, streetCommitted: 10 }
      ]);
      const table = createTable(seats, {
        actor: 1,
        phase: 'preflop',
        street: 'preflop',
        currentBet: 10,
        bbSeat: 1,
        bbHasActed: false
      });
      
      const result = validateAction(table, 1, 'CHECK');
      
      expect(result.valid).toBe(true);
    });

    it('Rejects check for BB after raise', () => {
      const seats = createSeats([
        { id: 0, pid: 'SB', chips: 75, streetCommitted: 30 },
        { id: 1, pid: 'BB', chips: 90, streetCommitted: 10 }
      ]);
      const table = createTable(seats, {
        actor: 1,
        phase: 'preflop',
        street: 'preflop',
        currentBet: 30, // SB raised
        bbSeat: 1,
        bbHasActed: false
      });
      
      const result = validateAction(table, 1, 'CHECK');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('to call');
    });
  });

  describe('Call validation', () => {
    it('Allows call when there\'s a bet', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = validateAction(table, 0, 'CALL');
      
      expect(result.valid).toBe(true);
    });

    it('Rejects call when no bet to call', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 0 });
      
      const result = validateAction(table, 0, 'CALL');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Nothing to call');
    });

    it('Allows partial call when insufficient chips (converts to all-in)', () => {
      const seats = createSeats([
        { id: 0, pid: 'ShortStack', chips: 5, streetCommitted: 0 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = validateAction(table, 0, 'CALL');
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Bet validation', () => {
    it('Allows bet equal to BB when no prior bet', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = validateAction(table, 0, 'BET', 10);
      
      expect(result.valid).toBe(true);
    });

    it('Rejects bet smaller than BB', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = validateAction(table, 0, 'BET', 5);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum bet is $10');
    });

    it('Allows all-in bet smaller than BB', () => {
      const seats = createSeats([{ id: 0, pid: 'ShortStack', chips: 7 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = validateAction(table, 0, 'BET', 7);
      
      expect(result.valid).toBe(true);
    });

    it('Rejects bet when there\'s already a bet', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = validateAction(table, 0, 'BET', 10);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('use raise');
    });
  });

  describe('Raise validation', () => {
    it('Allows raise equal to last raise size', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastRaiseSize: 10 // Last raise was 10 (from 10 to 20)
      });
      
      const result = validateAction(table, 0, 'RAISE', 10);
      
      expect(result.valid).toBe(true);
    });

    it('Rejects raise smaller than last raise size', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 30,
        lastRaiseSize: 20 // Last raise was 20
      });
      
      const result = validateAction(table, 0, 'RAISE', 10);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum raise is $20');
    });

    it('Allows all-in raise smaller than minimum', () => {
      const seats = createSeats([
        { id: 0, pid: 'ShortStack', chips: 25, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastRaiseSize: 20 // Need to raise 20 more, but only has 25 total
      });
      
      const result = validateAction(table, 0, 'RAISE', 5); // Can only raise 5 (20 to call + 5 raise = 25 chips)
      
      expect(result.valid).toBe(true);
    });

    it('Rejects raise when no existing bet', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 0 });
      
      const result = validateAction(table, 0, 'RAISE', 20);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('use bet instead');
    });
  });
});

describe('Minimum Raise Calculations', () => {
  it('Min raise = BB on first bet of street', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
    const table = createTable(seats, {
      phase: 'flop',
      street: 'flop',
      currentBet: 15, // First bet of 15
      lastRaiseSize: 10 // Still BB
    });
    
    const actions = getAvailableActions(table, 0);
    
    expect(actions).toContain('RAISE');
    // Min raise should be last raise size (BB) = 10, so min total would be 15+10=25
  });

  it('Min raise = last raise size', () => {
    const seats = createSeats([
      { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 },
      { id: 1, pid: 'P2', chips: 70, streetCommitted: 30 }
    ]);
    const table = createTable(seats, {
      actor: 0,
      currentBet: 30,
      lastRaiseSize: 20 // P2 raised from 10 to 30 (20 raise)
    });
    
    const result = validateAction(table, 0, 'RAISE', 20);
    expect(result.valid).toBe(true);
    
    const tooSmall = validateAction(table, 0, 'RAISE', 15);
    expect(tooSmall.valid).toBe(false);
  });

  it('Short all-in doesn\'t reset min raise', () => {
    const seats = createSeats([
      { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 },
      { id: 1, pid: 'ShortStack', chips: 0, streetCommitted: 25 }, // Went all-in for 25 (short raise)
      { id: 2, pid: 'P3', chips: 80, streetCommitted: 0 }
    ]);
    const table = createTable(seats, {
      actor: 2,
      currentBet: 25,
      lastRaiseSize: 20, // Original raise size should be preserved
      lastAggressor: 0 // Original raiser, not the short all-in
    });
    
    // P3 should still need to raise by the original minimum (20), not the short all-in amount (15)
    const result = validateAction(table, 2, 'RAISE', 20);
    expect(result.valid).toBe(true);
    
    const tooSmall = validateAction(table, 2, 'RAISE', 15); // Would be valid if short all-in reset min
    expect(tooSmall.valid).toBe(false);
  });
});

describe('Action Processing', () => {
  describe('Fold processing', () => {
    it('Changes player status to folded', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0 });
      
      const result = applyAction(table, 0, 'FOLD');
      
      expect(result.nextState.seats[0].status).toBe('folded');
      expect(result.nextState.seats[0].chips).toBe(100); // Chips unchanged
    });
  });

  describe('Check processing', () => {
    it('Doesn\'t change player state', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = applyAction(table, 0, 'CHECK');
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 100,
        committed: 0,
        streetCommitted: 0,
        status: 'active'
      });
    });
  });

  describe('Call processing', () => {
    it('Deducts correct call amount', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = applyAction(table, 0, 'CALL');
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 80, // 100 - 20
        committed: 20,
        streetCommitted: 20,
        status: 'active'
      });
    });

    it('Handles partial call (all-in)', () => {
      const seats = createSeats([
        { id: 0, pid: 'ShortStack', chips: 15, streetCommitted: 0 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 30 });
      
      const result = applyAction(table, 0, 'CALL');
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 15, // All chips
        streetCommitted: 15,
        status: 'ALLIN'
      });
    });
  });

  describe('Bet processing', () => {
    it('Creates new current bet', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = applyAction(table, 0, 'BET', 25);
      
      expect(result.nextState.currentBet).toBe(25);
      expect(result.nextState.lastAggressor).toBe(0);
      expect(result.nextState.lastRaiseSize).toBe(25);
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 75,
        streetCommitted: 25
      });
    });
  });

  describe('Raise processing', () => {
    it('Increases current bet correctly', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastAggressor: 1
      });
      
      const result = applyAction(table, 0, 'RAISE', 15); // Raise by 15 (call 20 + raise 15 = 35 total)
      
      expect(result.nextState.currentBet).toBe(35);
      expect(result.nextState.lastAggressor).toBe(0);
      expect(result.nextState.lastRaiseSize).toBe(15);
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 65, // 100 - 35
        streetCommitted: 35
      });
    });
  });

  describe('All-in processing with short raise handling', () => {
    it('Full all-in raise sets new aggressor', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 50, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastRaiseSize: 10
      });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.currentBet).toBe(50);
      expect(result.nextState.lastAggressor).toBe(0); // Full raise
      expect(result.nextState.lastRaiseSize).toBe(30); // 50 - 20 = 30 raise
    });

    it('Short all-in doesn\'t change aggressor', () => {
      const seats = createSeats([
        { id: 0, pid: 'ShortStack', chips: 25, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastRaiseSize: 20, // Min raise is 20
        lastAggressor: 1 // Previous aggressor
      });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.currentBet).toBe(25);
      expect(result.nextState.lastAggressor).toBe(1); // Unchanged - short raise
      expect(result.nextState.lastRaiseSize).toBe(20); // Unchanged
    });
  });
});

describe('Available Actions', () => {
  it('Returns correct actions when no bet', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
    const table = createTable(seats, { 
      actor: 0, 
      currentBet: 0,
      phase: 'flop',
      street: 'flop'
    });
    
    const actions = getAvailableActions(table, 0);
    
    expect(actions).toEqual(expect.arrayContaining(['FOLD', 'CHECK', 'BET', 'ALLIN']));
    expect(actions).not.toContain('CALL');
    expect(actions).not.toContain('RAISE');
  });

  it('Returns correct actions when bet to call', () => {
    const seats = createSeats([
      { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
    ]);
    const table = createTable(seats, { actor: 0, currentBet: 20 });
    
    const actions = getAvailableActions(table, 0);
    
    expect(actions).toEqual(expect.arrayContaining(['FOLD', 'CALL', 'RAISE', 'ALLIN']));
    expect(actions).not.toContain('CHECK');
    expect(actions).not.toContain('BET');
  });

  it('Includes check for BB option', () => {
    const seats = createSeats([
      { id: 0, pid: 'BB', chips: 90, streetCommitted: 10 }
    ]);
    const table = createTable(seats, {
      actor: 0,
      phase: 'preflop',
      street: 'preflop',
      currentBet: 10,
      bbSeat: 0,
      bbHasActed: false
    });
    
    const actions = getAvailableActions(table, 0);
    
    expect(actions).toEqual(expect.arrayContaining(['FOLD', 'CHECK', 'RAISE', 'ALLIN']));
    expect(actions).not.toContain('CALL'); // No need to call own blind
  });

  it('Returns empty for non-active player', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
    seats[0].status = 'folded';
    const table = createTable(seats, { actor: 0 });
    
    const actions = getAvailableActions(table, 0);
    
    expect(actions).toEqual([]);
  });
});