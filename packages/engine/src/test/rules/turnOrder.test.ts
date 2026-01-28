/**
 * Comprehensive Turn Order Test Suite
 * 
 * Tests all turn order scenarios according to poker_rules.md:
 * - Heads-up preflop: Button/SB acts first
 * - Heads-up postflop: BB acts first  
 * - Multi-way preflop: UTG (left of BB) acts first
 * - Multi-way postflop: Left of button acts first
 * - BB option scenarios
 * - Action sequence completion logic
 */

import { describe, it, expect } from 'vitest';
import { getFirstActor } from '../../logic/gameRules';
import { getNextActor } from '../../utils/ringOrder';
import { Table, Seat } from '../../core/types';

/**
 * Helper to create seats
 */
function createSeats(playerMap: Record<number, string>, chips = 1000): Seat[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: i,
    pid: playerMap[i] || undefined,
    chips: playerMap[i] ? chips : 0,
    committed: 0,
    streetCommitted: 0,
    status: playerMap[i] ? 'active' as const : 'empty' as const,
  }));
}

/**
 * Helper to create table
 */
function createTable(seats: Seat[], button: number, options: Partial<Table> = {}): Table {
  return {
    id: 'test',
    seats,
    button,
    smallBlind: 5,
    bigBlind: 10,
    phase: 'preflop',
    street: 'preflop',
    currentBet: 10,
    lastRaiseSize: 10,
    pots: [],
    communityCards: [],
    blinds: { sb: 5, bb: 10 },
    handNumber: 1,
    timestamp: Date.now(),
    ...options,
  } as Table;
}

describe('First Actor Determination', () => {
  describe('Heads-up (2 players)', () => {
    it('Preflop: Button/SB acts first', () => {
      const seats = createSeats({ 0: 'Button', 1: 'BB' });
      const table = createTable(seats, 0);
      
      const result = getFirstActor(table, true);
      
      expect(result.isHeadsUp).toBe(true);
      expect(result.actor).toBe(0); // Button/SB acts first preflop
    });

    it('Postflop: BB acts first', () => {
      const seats = createSeats({ 0: 'Button', 1: 'BB' });
      const table = createTable(seats, 0, { phase: 'flop', street: 'flop' });
      
      const result = getFirstActor(table, false);
      
      expect(result.isHeadsUp).toBe(true);
      expect(result.actor).toBe(1); // BB acts first postflop
    });

    it('Button at seat 8, other at seat 0', () => {
      const seats = createSeats({ 8: 'Button', 0: 'BB' });
      const table = createTable(seats, 8);
      
      const preflopResult = getFirstActor(table, true);
      expect(preflopResult.actor).toBe(8); // Button acts first preflop
      
      const postflopResult = getFirstActor(table, false);
      expect(postflopResult.actor).toBe(0); // BB acts first postflop
    });
  });

  describe('Multi-way (3+ players)', () => {
    it('Preflop: UTG (left of BB) acts first', () => {
      const seats = createSeats({ 0: 'UTG', 1: 'SB', 2: 'BB' });
      const table = createTable(seats, 2); // Button at 2, so SB=0, BB=1, UTG=2
      
      const result = getFirstActor(table, true);
      
      expect(result.isHeadsUp).toBe(false);
      expect(result.actor).toBe(0); // UTG acts first
    });

    it('Postflop: Left of button acts first', () => {
      const seats = createSeats({ 0: 'LeftOfButton', 1: 'Button', 2: 'Right' });
      const table = createTable(seats, 1, { phase: 'flop', street: 'flop' });
      
      const result = getFirstActor(table, false);
      
      expect(result.isHeadsUp).toBe(false);
      expect(result.actor).toBe(2); // Next player clockwise from button
    });

    it('6-max: Button=0, SB=1, BB=2, UTG=3', () => {
      const seats = createSeats({ 0: 'BTN', 1: 'SB', 2: 'BB', 3: 'UTG', 4: 'MP', 5: 'CO' });
      const table = createTable(seats, 0);
      
      const result = getFirstActor(table, true);
      
      expect(result.actor).toBe(3); // UTG acts first preflop
    });

    it('9-max full ring: Button=7, SB=8, BB=0, UTG=1', () => {
      const seats = createSeats({
        0: 'BB', 1: 'UTG', 2: 'UTG+1', 3: 'UTG+2', 4: 'MP',
        5: 'MP+1', 6: 'HJ', 7: 'Button', 8: 'SB'
      });
      const table = createTable(seats, 7);
      
      const result = getFirstActor(table, true);
      
      expect(result.actor).toBe(1); // UTG acts first
    });
  });

  describe('All-in scenarios', () => {
    it('Skips all-in players to find actionable player', () => {
      const seats = createSeats({ 0: 'Button', 1: 'AllIn', 2: 'Active' });
      seats[1].status = 'allin';
      const table = createTable(seats, 0);
      
      const result = getFirstActor(table, true);
      
      expect(result.actor).toBe(2); // Skips all-in player
    });

    it('Returns -1 when all players all-in', () => {
      const seats = createSeats({ 0: 'AllIn1', 1: 'AllIn2' });
      seats[0].status = 'allin';
      seats[1].status = 'allin';
      const table = createTable(seats, 0);
      
      const result = getFirstActor(table, true);
      
      expect(result.actor).toBe(-1); // No actionable players
    });

    it('Returns -1 with only one player in hand', () => {
      const seats = createSeats({ 0: 'Active', 1: 'Folded' });
      seats[1].status = 'folded';
      const table = createTable(seats, 0);
      
      const result = getFirstActor(table, true);
      
      expect(result.actor).toBe(-1); // Only one player left
    });
  });
});

describe('Next Actor and Round Completion', () => {
  describe('Basic progression', () => {
    it('Advances to next active player', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2', 2: 'P3' });
      const table = createTable(seats, 0, { actor: 0 });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(false);
      expect(result.actor).toBe(1);
    });

    it('Skips folded players', () => {
      const seats = createSeats({ 0: 'Active', 1: 'Folded', 2: 'Active' });
      seats[1].status = 'folded';
      const table = createTable(seats, 0, { actor: 0 });
      
      const result = getNextActor(table);
      
      expect(result.actor).toBe(2); // Skips folded player
    });

    it('Wraps around table', () => {
      const seats = createSeats({ 0: 'P1', 8: 'P2' });
      const table = createTable(seats, 0, { actor: 8 });
      
      const result = getNextActor(table);
      
      expect(result.actor).toBe(0); // Wraps to seat 0
    });
  });

  describe('Round completion - Action tracking', () => {
    it('Not complete when players haven\'t acted', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2', 2: 'P3' });
      const table = createTable(seats, 0, {
        actor: 1,
        playersActedThisRound: new Set([0]), // Only P1 has acted
        roundStartActor: 0
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(false);
      expect(result.actor).toBe(2); // Next player
    });

    it('Not complete when not back to aggressor', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2', 2: 'P3' });
      const table = createTable(seats, 0, {
        actor: 1,
        lastAggressor: 2, // P3 raised
        currentBet: 20,
        playersActedThisRound: new Set([0, 2]), // P1 called, P3 raised
        roundStartActor: 0
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(false);
      expect(result.actor).toBe(2); // Continue to P3
    });

    it('Completes when back to aggressor and others matched', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2', 2: 'P3' });
      // Set up: P3 raised to 20, P1 called, P2 called, back to P3
      seats[0].streetCommitted = 20; // Called
      seats[1].streetCommitted = 20; // Called  
      seats[2].streetCommitted = 20; // Original raiser
      
      const table = createTable(seats, 0, {
        actor: 1, // P2 just acted
        lastAggressor: 2, // P3 raised
        currentBet: 20,
        playersActedThisRound: new Set([0, 1, 2]), // All have acted
        roundStartActor: 0
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(true);
      expect(result.actor).toBeUndefined();
    });
  });

  describe('BB Option scenarios', () => {
    it('Gives BB option when no raises preflop', () => {
      const seats = createSeats({ 0: 'UTG', 1: 'SB', 2: 'BB' });
      // UTG called, SB called, action to BB
      seats[0].streetCommitted = 10; // Called BB
      seats[1].streetCommitted = 10; // SB called up to BB
      seats[2].streetCommitted = 10; // BB posted
      
      const table = createTable(seats, 0, {
        actor: 1, // SB just called
        phase: 'preflop',
        street: 'preflop',
        currentBet: 10, // Still at BB level
        bbSeat: 2,
        bbHasActed: false,
        playersActedThisRound: new Set([0, 1]) // UTG and SB acted
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(false);
      expect(result.actor).toBe(2); // BB gets option
    });

    it('Completes after BB exercises option', () => {
      const seats = createSeats({ 0: 'UTG', 1: 'SB', 2: 'BB' });
      seats[0].streetCommitted = 10;
      seats[1].streetCommitted = 10;
      seats[2].streetCommitted = 10;
      
      const table = createTable(seats, 0, {
        actor: 2, // BB about to act
        phase: 'preflop',
        street: 'preflop',
        currentBet: 10,
        bbSeat: 2,
        bbHasActed: true, // BB has now acted
        playersActedThisRound: new Set([0, 1, 2])
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(true);
    });

    it('No BB option when there was a raise', () => {
      const seats = createSeats({ 0: 'UTG', 1: 'SB', 2: 'BB' });
      seats[0].streetCommitted = 20; // UTG raised
      seats[1].streetCommitted = 20; // SB called raise
      seats[2].streetCommitted = 10; // BB only posted blind
      
      const table = createTable(seats, 0, {
        actor: 1, // SB just called
        phase: 'preflop', 
        street: 'preflop',
        currentBet: 20, // Raise level
        lastAggressor: 0, // UTG raised
        bbSeat: 2,
        bbHasActed: false
      });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(false);
      expect(result.actor).toBe(2); // BB needs to call/fold/raise, no option
    });
  });

  describe('All-in completion', () => {
    it('Completes when everyone all-in or folded', () => {
      const seats = createSeats({ 0: 'AllIn', 1: 'Folded' });
      seats[0].status = 'allin';
      seats[1].status = 'folded';
      const table = createTable(seats, 0, { actor: 0 });
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(true);
      expect(result.activeCount).toBe(0);
    });

    it('Completes when only one player left', () => {
      const seats = createSeats({ 0: 'Winner', 1: 'Folded', 2: 'Folded' });
      seats[1].status = 'folded';
      seats[2].status = 'folded';
      const table = createTable(seats, 0);
      
      const result = getNextActor(table);
      
      expect(result.isComplete).toBe(true);
    });
  });

  describe('Fallback to amount-based logic', () => {
    it('Uses fallback when action tracking not available', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2' });
      seats[0].streetCommitted = 10;
      seats[1].streetCommitted = 10;
      
      const table = createTable(seats, 0, {
        actor: 1,
        currentBet: 10,
        // No playersActedThisRound or roundStartActor
      });
      
      const result = getNextActor(table);
      
      // Should use amount-based fallback and complete since amounts match
      expect(result.isComplete).toBe(true);
    });
  });
});

describe('Edge Cases', () => {
  it('Handles empty actor (undefined)', () => {
    const seats = createSeats({ 0: 'P1' });
    const table = createTable(seats, 0, { actor: undefined });
    
    const result = getNextActor(table);
    
    expect(result.isComplete).toBe(true);
    expect(result.activeCount).toBe(0);
  });

  it('Handles no actionable players found', () => {
    const seats = createSeats({ 0: 'AllIn' });
    seats[0].status = 'allin';
    const table = createTable(seats, 0, { actor: 0 });
    
    const result = getNextActor(table);
    
    expect(result.isComplete).toBe(true);
    expect(result.actor).toBeUndefined();
  });

  it('Handles gap-filled seating', () => {
    const seats = createSeats({ 1: 'P1', 5: 'P2', 8: 'P3' });
    const table = createTable(seats, 1, { actor: 1 });
    
    const result = getNextActor(table);
    
    expect(result.actor).toBe(5); // Next occupied seat
  });
});