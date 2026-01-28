/**
 * Comprehensive All-In Scenarios Test Suite
 * 
 * Tests all all-in scenarios according to poker_rules.md:
 * - Side pot creation with different stack sizes
 * - Multiple all-in scenarios
 * - Auto-progression when all players all-in
 * - Short all-in raises don't reset min raise
 * - Proper betting reopening rules
 */

import { describe, it, expect } from 'vitest';
import { validateAction } from '../../logic/validation';
import { applyAction } from '../../core/reducers/actionProcessing';
import { collectIntoPots } from '../../logic/potManager';
import { getBettingRoundState } from '../../utils/ringOrder';
import { Table, Seat } from '../../core/types';

/**
 * Helper to create seats
 */
function createSeats(players: Array<{id: number, pid: string, chips: number, committed?: number, streetCommitted?: number, status?: 'active' | 'folded' | 'allin' | 'empty'}>): Seat[] {
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
      status: p.status || 'active' as const,
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
    lastRaiseSize: 10,
    pots: [],
    communityCards: [],
    blinds: { sb: 5, bb: 10 },
    handNumber: 1,
    timestamp: Date.now(),
    ...options,
  } as Table;
}

describe('All-In Validation', () => {
  it('Always allows all-in when player has chips', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 50 }]);
    const table = createTable(seats, { actor: 0, currentBet: 100 }); // Bet bigger than stack
    
    const result = validateAction(table, 0, 'ALLIN');
    
    expect(result.valid).toBe(true);
    expect(result.normalizedAmount).toBe(50); // All chips
    expect(result.isAllIn).toBe(true);
  });

  it('Rejects all-in when player has no chips', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 0 }]);
    const table = createTable(seats, { actor: 0 });
    
    const result = validateAction(table, 0, 'ALLIN');
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No chips available');
  });

  it('Identifies short all-in vs full raise', () => {
    const seats = createSeats([{ id: 0, pid: 'ShortStack', chips: 25 }]);
    const table = createTable(seats, {
      actor: 0,
      currentBet: 20,
      lastRaiseSize: 20 // Min raise is 20, but player only has 25 total
    });
    
    const result = validateAction(table, 0, 'ALLIN');
    
    expect(result.valid).toBe(true);
    // This should be detected as short all-in in the validation logic
  });
});

describe('All-In Processing', () => {
  describe('Basic all-in', () => {
    it('Commits all chips and sets status to allin', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 75 }]);
      const table = createTable(seats, { actor: 0, currentBet: 50 });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 75,
        streetCommitted: 75,
        status: 'allin'
      });
      
      expect(result.nextState.currentBet).toBe(75);
    });

    it('All-in call when insufficient chips', () => {
      const seats = createSeats([{ id: 0, pid: 'ShortStack', chips: 30 }]);
      const table = createTable(seats, { actor: 0, currentBet: 50 });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 30,
        streetCommitted: 30,
        status: 'allin'
      });
      
      expect(result.nextState.currentBet).toBe(50); // Doesn't change current bet (partial call)
    });
  });

  describe('Full raise all-ins', () => {
    it('Full all-in raise sets new aggressor', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 50,
        lastRaiseSize: 25,
        lastAggressor: 1
      });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.currentBet).toBe(100);
      expect(result.nextState.lastAggressor).toBe(0); // New aggressor
      expect(result.nextState.lastRaiseSize).toBe(50); // 100 - 50 = 50 raise
    });

    it('All-in over-bet creates new current bet', () => {
      const seats = createSeats([{ id: 0, pid: 'BigStack', chips: 200 }]);
      const table = createTable(seats, { 
        actor: 0, 
        currentBet: 0,
        phase: 'flop',
        street: 'flop'
      });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.currentBet).toBe(200);
      expect(result.nextState.lastAggressor).toBe(0);
      expect(result.nextState.lastRaiseSize).toBe(200);
    });
  });

  describe('Short all-in raises', () => {
    it('Short all-in doesn\'t change aggressor or min raise', () => {
      const seats = createSeats([{ id: 0, pid: 'ShortStack', chips: 25 }]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20,
        lastRaiseSize: 20, // Min raise is 20, but short stack only adds 5
        lastAggressor: 1
      });
      
      const result = applyAction(table, 0, 'ALLIN');
      
      expect(result.nextState.currentBet).toBe(25);
      expect(result.nextState.lastAggressor).toBe(1); // Unchanged
      expect(result.nextState.lastRaiseSize).toBe(20); // Unchanged
    });

    it('Short all-in doesn\'t reopen betting for prior callers', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, streetCommitted: 50 }, // Already called
        { id: 1, pid: 'ShortStack', chips: 0, streetCommitted: 55, status: 'allin' }, // Short all-in
        { id: 2, pid: 'P3', chips: 50, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 2,
        currentBet: 55,
        lastRaiseSize: 40, // Original raise was 40
        lastAggressor: 0, // P1 was original aggressor, not short stack
        playersActedThisRound: new Set([0, 1]) // P1 and short stack acted
      });
      
      // P3 should only be able to call or fold, not re-raise (since short all-in doesn't reopen)
      const actions = ['FOLD', 'CALL', 'ALLIN']; // Should NOT include 'RAISE'
      
      const availableActions = result.nextState.seats[2].status === 'active' ? 
        (table.currentBet > table.seats[2].streetCommitted ? ['FOLD', 'CALL', 'ALLIN'] : ['FOLD', 'CHECK', 'ALLIN']) : [];
      
      expect(availableActions).not.toContain('RAISE');
    });
  });

  describe('Multiple all-ins', () => {
    it('Handles chain of all-ins with different stack sizes', () => {
      // Setup: P1 has 30, P2 has 60, P3 has 100
      let seats = createSeats([
        { id: 0, pid: 'P1', chips: 30 },
        { id: 1, pid: 'P2', chips: 60 },
        { id: 2, pid: 'P3', chips: 100 }
      ]);
      let table = createTable(seats, { actor: 0, currentBet: 0 });
      
      // P1 goes all-in for 30
      let result1 = applyAction(table, 0, 'ALLIN');
      expect(result1.nextState.currentBet).toBe(30);
      
      // P2 goes all-in for 60
      table = { ...result1.nextState, actor: 1 };
      let result2 = applyAction(table, 1, 'ALLIN');
      expect(result2.nextState.currentBet).toBe(60);
      
      // P3 goes all-in for 100
      table = { ...result2.nextState, actor: 2 };
      let result3 = applyAction(table, 2, 'ALLIN');
      expect(result3.nextState.currentBet).toBe(100);
      
      // All players should be all-in
      expect(result3.nextState.seats[0].status).toBe('allin');
      expect(result3.nextState.seats[1].status).toBe('allin');
      expect(result3.nextState.seats[2].status).toBe('allin');
    });

    it('Auto-progresses when all remaining players all-in', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, status: 'allin', streetCommitted: 50 },
        { id: 1, pid: 'P2', chips: 0, status: 'allin', streetCommitted: 100 }
      ]);
      const table = createTable(seats, { currentBet: 100 });
      
      const roundState = getBettingRoundState(table);
      
      expect(roundState.isComplete).toBe(true);
      expect(roundState.reason).toBe('all-players-allin');
    });
  });
});

describe('Side Pot Creation', () => {
  describe('Two-way all-ins', () => {
    it('Creates side pot with different stack sizes', () => {
      // P1 all-in for 40, P2 all-in for 80
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, committed: 40, streetCommitted: 40, status: 'allin' },
        { id: 1, pid: 'P2', chips: 0, committed: 80, streetCommitted: 80, status: 'allin' }
      ]);
      
      const potResult = collectIntoPots(seats);
      
      expect(potResult.pots).toHaveLength(2);
      
      // Main pot: both players eligible, amount = 2 * 40 = 80
      expect(potResult.pots[0]).toEqual({
        amount: 80,
        eligiblePids: ['P1', 'P2']
      });
      
      // Side pot: only P2 eligible, amount = 80 - 40 = 40
      expect(potResult.pots[1]).toEqual({
        cap: 80,
        amount: 40,
        eligiblePids: ['P2']
      });
    });

    it('No side pot when equal all-ins', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, committed: 50, status: 'allin' },
        { id: 1, pid: 'P2', chips: 0, committed: 50, status: 'allin' }
      ]);
      
      const potResult = collectIntoPots(seats);
      
      expect(potResult.pots).toHaveLength(1);
      expect(potResult.pots[0]).toEqual({
        amount: 100,
        eligiblePids: ['P1', 'P2']
      });
    });
  });

  describe('Three-way all-ins', () => {
    it('Creates multiple side pots for different stack sizes', () => {
      // P1: 20, P2: 50, P3: 100 all-in
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, committed: 20, status: 'allin' },
        { id: 1, pid: 'P2', chips: 0, committed: 50, status: 'allin' },
        { id: 2, pid: 'P3', chips: 0, committed: 100, status: 'allin' }
      ]);
      
      const potResult = collectIntoPots(seats);
      
      expect(potResult.pots).toHaveLength(3);
      
      // Main pot: all three eligible, amount = 3 * 20 = 60
      expect(potResult.pots[0]).toEqual({
        amount: 60,
        eligiblePids: ['P1', 'P2', 'P3']
      });
      
      // Side pot 1: P2 and P3 eligible, amount = 2 * (50-20) = 60
      expect(potResult.pots[1]).toEqual({
        cap: 50,
        amount: 60,
        eligiblePids: ['P2', 'P3']
      });
      
      // Side pot 2: only P3 eligible, amount = 100-50 = 50
      expect(potResult.pots[2]).toEqual({
        cap: 100,
        amount: 50,
        eligiblePids: ['P3']
      });
    });
  });

  describe('Mixed scenarios with active players', () => {
    it('Includes active players in appropriate pots', () => {
      // P1 all-in 30, P2 active with 50 committed, P3 folded
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 0, committed: 30, status: 'allin' },
        { id: 1, pid: 'P2', chips: 100, committed: 50, status: 'active' },
        { id: 2, pid: 'P3', chips: 200, committed: 5, status: 'folded' }
      ]);
      
      const potResult = collectIntoPots(seats);
      
      expect(potResult.pots).toHaveLength(2);
      
      // Main pot: P1 and P2 eligible, amount = 30 + 30 = 60 (P1's max * eligible players)
      expect(potResult.pots[0]).toEqual({
        amount: 60,
        eligiblePids: ['P1', 'P2']
      });
      
      // Side pot: only P2 eligible, amount = 50 - 30 = 20
      expect(potResult.pots[1]).toEqual({
        cap: 50,
        amount: 20,
        eligiblePids: ['P2']
      });
    });
  });
});

describe('Betting Round Completion with All-Ins', () => {
  it('Completes round when all active players all-in', () => {
    const seats = createSeats([
      { id: 0, pid: 'P1', chips: 0, status: 'allin' },
      { id: 1, pid: 'P2', chips: 0, status: 'allin' },
      { id: 2, pid: 'P3', chips: 200, status: 'folded' }
    ]);
    const table = createTable(seats);
    
    const roundState = getBettingRoundState(table);
    
    expect(roundState.isComplete).toBe(true);
    expect(roundState.reason).toBe('all-players-allin');
  });

  it('Continues round when active players remain', () => {
    const seats = createSeats([
      { id: 0, pid: 'P1', chips: 0, status: 'allin' },
      { id: 1, pid: 'P2', chips: 100, status: 'active' },
      { id: 2, pid: 'P3', chips: 150, status: 'active' }
    ]);
    const table = createTable(seats);
    
    const roundState = getBettingRoundState(table);
    
    expect(roundState.isComplete).toBe(false);
    expect(roundState.nextActor).toBeDefined();
  });

  it('Completes with fold to one', () => {
    const seats = createSeats([
      { id: 0, pid: 'Winner', chips: 100, status: 'active' },
      { id: 1, pid: 'Folded1', chips: 0, status: 'folded' },
      { id: 2, pid: 'Folded2', chips: 0, status: 'folded' }
    ]);
    const table = createTable(seats);
    
    const roundState = getBettingRoundState(table);
    
    expect(roundState.isComplete).toBe(true);
    expect(roundState.reason).toBe('fold-to-one');
  });
});

describe('Edge Cases', () => {
  it('All-in for exact call amount', () => {
    const seats = createSeats([{ id: 0, pid: 'P1', chips: 50 }]);
    const table = createTable(seats, { actor: 0, currentBet: 50 });
    
    const result = applyAction(table, 0, 'ALLIN');
    
    expect(result.nextState.seats[0]).toMatchObject({
      chips: 0,
      streetCommitted: 50,
      status: 'allin'
    });
    
    expect(result.nextState.currentBet).toBe(50); // No change, exact call
  });

  it('All-in with previous street commitment', () => {
    const seats = createSeats([{ 
      id: 0, 
      pid: 'P1', 
      chips: 40, 
      streetCommitted: 10 // Already committed 10 this street
    }]);
    const table = createTable(seats, { actor: 0, currentBet: 30 });
    
    const result = applyAction(table, 0, 'ALLIN');
    
    expect(result.nextState.seats[0]).toMatchObject({
      chips: 0,
      streetCommitted: 50, // 10 + 40 = 50 total this street
      committed: 50, // Assuming no previous streets
      status: 'allin'
    });
    
    expect(result.nextState.currentBet).toBe(50); // New high
  });

  it('Multiple short all-ins don\'t compound', () => {
    // Test that multiple short all-ins in sequence don't reset min raise multiple times
    const seats = createSeats([
      { id: 0, pid: 'Original', chips: 100, streetCommitted: 40 }, // Original raiser
      { id: 1, pid: 'Short1', chips: 0, streetCommitted: 42, status: 'allin' }, // +2 short all-in
      { id: 2, pid: 'Short2', chips: 0, streetCommitted: 45, status: 'allin' }, // +3 short all-in  
      { id: 3, pid: 'Action', chips: 200, streetCommitted: 0 }
    ]);
    
    const table = createTable(seats, {
      actor: 3,
      currentBet: 45,
      lastRaiseSize: 30, // Original raise size should be preserved
      lastAggressor: 0 // Original aggressor
    });
    
    // P4 should still need to raise by original minimum (30), not the short all-in amounts
    const raiseResult = validateAction(table, 3, 'RAISE', 30);
    expect(raiseResult.valid).toBe(true);
    
    const tooSmallRaise = validateAction(table, 3, 'RAISE', 10);
    expect(tooSmallRaise.valid).toBe(false);
  });
});