/**
 * Comprehensive Blinds Test Suite
 * 
 * Tests all blind posting scenarios according to poker_rules.md:
 * - Heads-up: Button posts SB, other posts BB
 * - Multi-way: SB and BB posted clockwise from button
 * - All-in blind scenarios
 * - Ante posting when configured
 */

import { describe, it, expect } from 'vitest';
import { getBlindPositions } from '../../logic/gameRules';
import { postBlinds } from '../../core/reducers/handLifecycle';
import { Table, Seat } from '../../core/types';

/**
 * Helper to create seats with players
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
 * Helper to create base table
 */
function createTable(seats: Seat[], button: number, sb = 5, bb = 10): Table {
  return {
    id: 'test',
    seats,
    button,
    smallBlind: sb,
    bigBlind: bb,
    phase: 'waiting',
    currentBet: 0,
    lastRaiseSize: bb,
    pots: [],
    communityCards: [],
    blinds: { sb, bb },
    handNumber: 1,
    timestamp: Date.now(),
  } as Table;
}

describe('Blind Positions', () => {
  describe('Heads-up (2 players)', () => {
    it('Button posts SB, other posts BB', () => {
      // Button at seat 0, other player at seat 1
      const seats = createSeats({ 0: 'Button', 1: 'Other' });
      const blinds = getBlindPositions(seats, 0);
      
      expect(blinds).toEqual({
        sb: 0, // Button is SB in heads-up
        bb: 1  // Other player is BB
      });
    });

    it('Works with non-adjacent seats', () => {
      // Button at seat 2, other player at seat 7
      const seats = createSeats({ 2: 'Button', 7: 'Other' });
      const blinds = getBlindPositions(seats, 2);
      
      expect(blinds).toEqual({
        sb: 2, // Button is SB
        bb: 7  // Next occupied seat is BB
      });
    });

    it('Works with button at seat 8', () => {
      // Button at seat 8, other player at seat 0 (wraps around)
      const seats = createSeats({ 8: 'Button', 0: 'Other' });
      const blinds = getBlindPositions(seats, 8);
      
      expect(blinds).toEqual({
        sb: 8, // Button is SB
        bb: 0  // Wraps to seat 0 for BB
      });
    });
  });

  describe('Multi-way (3+ players)', () => {
    it('Button at 0: SB=1, BB=2', () => {
      const seats = createSeats({ 0: 'Button', 1: 'Player1', 2: 'Player2' });
      const blinds = getBlindPositions(seats, 0);
      
      expect(blinds).toEqual({
        sb: 1, // Left of button
        bb: 2  // Left of SB
      });
    });

    it('Button at 7: SB=8, BB=0 (wraps around)', () => {
      const seats = createSeats({ 7: 'Button', 8: 'Player1', 0: 'Player2' });
      const blinds = getBlindPositions(seats, 7);
      
      expect(blinds).toEqual({
        sb: 8, // Left of button
        bb: 0  // Wraps to seat 0
      });
    });

    it('Handles gaps in seating', () => {
      // Button=0, then gap, then players at 3,5
      const seats = createSeats({ 0: 'Button', 3: 'Player1', 5: 'Player2' });
      const blinds = getBlindPositions(seats, 0);
      
      expect(blinds).toEqual({
        sb: 3, // First occupied seat left of button
        bb: 5  // Next occupied seat
      });
    });

    it('9-handed full table', () => {
      const seats = createSeats({
        0: 'UTG', 1: 'UTG+1', 2: 'UTG+2', 3: 'MP',
        4: 'MP+1', 5: 'HJ', 6: 'CO', 7: 'Button', 8: 'SB'
      });
      const blinds = getBlindPositions(seats, 7); // Button at 7
      
      expect(blinds).toEqual({
        sb: 8, // SB seat
        bb: 0  // BB wraps to UTG
      });
    });
  });

  describe('Edge cases', () => {
    it('Returns null for less than 2 players', () => {
      const seats = createSeats({ 0: 'OnlyPlayer' });
      const blinds = getBlindPositions(seats, 0);
      expect(blinds).toBeNull();
    });

    it('Returns null for empty table', () => {
      const seats = createSeats({});
      const blinds = getBlindPositions(seats, 0);
      expect(blinds).toBeNull();
    });

    it('Returns null when button seat is empty', () => {
      const seats = createSeats({ 1: 'Player1', 2: 'Player2' });
      const blinds = getBlindPositions(seats, 0); // Button at empty seat
      expect(blinds).toBeNull();
    });
  });
});

describe('Blind Posting', () => {
  describe('Standard blind posting', () => {
    it('Posts SB and BB correctly in heads-up', () => {
      const seats = createSeats({ 0: 'Button', 1: 'BB' }, 200);
      const table = createTable(seats, 0, 5, 10);
      
      const result = postBlinds(table, 5, 10);
      
      expect(result.nextState.seats[0]).toMatchObject({
        pid: 'Button',
        chips: 195, // 200 - 5 SB
        committed: 5,
        streetCommitted: 5,
        status: 'active'
      });
      
      expect(result.nextState.seats[1]).toMatchObject({
        pid: 'BB',
        chips: 190, // 200 - 10 BB
        committed: 10,
        streetCommitted: 10,
        status: 'active'
      });
      
      expect(result.nextState.currentBet).toBe(10);
      expect(result.nextState.bbSeat).toBe(1);
    });

    it('Posts blinds correctly in 3-way', () => {
      const seats = createSeats({ 0: 'Button', 1: 'SB', 2: 'BB' }, 500);
      const table = createTable(seats, 0, 25, 50);
      
      const result = postBlinds(table, 25, 50);
      
      expect(result.nextState.seats[0].chips).toBe(500); // Button unchanged
      expect(result.nextState.seats[1]).toMatchObject({
        chips: 475, // 500 - 25 SB
        committed: 25,
        streetCommitted: 25
      });
      expect(result.nextState.seats[2]).toMatchObject({
        chips: 450, // 500 - 50 BB
        committed: 50,
        streetCommitted: 50
      });
    });

    it('Schedules hole cards and preflop after posting blinds', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2' }, 100);
      const table = createTable(seats, 0);
      
      const result = postBlinds(table, 5, 10);
      
      // Should have side effects to deal hole cards and enter preflop
      expect(result.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'DISPATCH_EVENT',
            payload: expect.objectContaining({
              event: { t: 'DealHole', cards: {} }
            })
          }),
          expect.objectContaining({
            type: 'DISPATCH_EVENT',
            payload: expect.objectContaining({
              event: { t: 'EnterStreet', street: 'preflop' }
            })
          })
        ])
      );
    });
  });

  describe('All-in blind scenarios', () => {
    it('SB goes all-in posting blind', () => {
      const seats = createSeats({ 0: 'SmallStack', 1: 'BigStack' });
      seats[0].chips = 3; // Less than SB
      seats[1].chips = 200;
      
      const table = createTable(seats, 0, 5, 10);
      const result = postBlinds(table, 5, 10);
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 3,
        streetCommitted: 3,
        status: 'allin'
      });
      
      expect(result.nextState.seats[1]).toMatchObject({
        chips: 190,
        committed: 10,
        streetCommitted: 10,
        status: 'active'
      });
    });

    it('BB goes all-in posting blind', () => {
      const seats = createSeats({ 0: 'P1', 1: 'ShortStack' });
      seats[1].chips = 7; // Less than BB
      
      const table = createTable(seats, 0, 5, 10);
      const result = postBlinds(table, 5, 10);
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 995,
        committed: 5,
        status: 'active'
      });
      
      expect(result.nextState.seats[1]).toMatchObject({
        chips: 0,
        committed: 7,
        streetCommitted: 7,
        status: 'allin'
      });
    });

    it('Both blinds all-in', () => {
      const seats = createSeats({ 0: 'Short1', 1: 'Short2' });
      seats[0].chips = 3; // SB amount
      seats[1].chips = 8; // Less than BB
      
      const table = createTable(seats, 0, 5, 10);
      const result = postBlinds(table, 5, 10);
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 3,
        status: 'allin'
      });
      
      expect(result.nextState.seats[1]).toMatchObject({
        chips: 0,
        committed: 8,
        status: 'allin'
      });
    });
  });

  describe('Ante posting', () => {
    it('Posts antes from all active players', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2', 2: 'P3' }, 100);
      const table = createTable(seats, 0, 5, 10);
      
      const result = postBlinds(table, 5, 10, 2); // 2 chip ante
      
      // Check that all active players posted ante
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 93, // 100 - 5(SB) - 2(ante)
        committed: 7
      });
      
      expect(result.nextState.seats[1]).toMatchObject({
        chips: 88, // 100 - 10(BB) - 2(ante)
        committed: 12
      });
      
      expect(result.nextState.seats[2]).toMatchObject({
        chips: 98, // 100 - 2(ante)
        committed: 2
      });
    });

    it('Handles ante all-ins', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2' });
      seats[0].chips = 6; // SB + 1 for ante
      seats[1].chips = 100;
      
      const table = createTable(seats, 0, 5, 10);
      const result = postBlinds(table, 5, 10, 2);
      
      expect(result.nextState.seats[0]).toMatchObject({
        chips: 0,
        committed: 6, // All chips committed
        status: 'allin'
      });
    });
  });

  describe('Error conditions', () => {
    it('Fails with less than 2 active players', () => {
      const seats = createSeats({ 0: 'OnlyPlayer' });
      const table = createTable(seats, 0);
      
      const result = postBlinds(table, 5, 10);
      
      expect(result.nextState).toBe(table); // Unchanged
      expect(result.sideEffects).toEqual([]);
    });

    it('Emits heads-up detection for 2 players', () => {
      const seats = createSeats({ 0: 'P1', 1: 'P2' });
      const table = createTable(seats, 0);
      
      const result = postBlinds(table, 5, 10);
      
      expect(result.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'EMIT_STATE_CHANGE',
            payload: { reason: 'heads_up_detected' }
          })
        ])
      );
    });
  });
});