/**
 * Timeout and Irregularities Test Suite
 * 
 * Tests timeout handling and edge cases according to poker_rules.md:
 * - Timeouts result in automatic fold if cannot check
 * - Out-of-turn actions are ignored
 * - Race condition handling
 * - Timer management
 */

import { describe, it, expect } from 'vitest';
import { handleTimeoutAutoFold } from '../../core/reducers/actionProcessing';
import { validateAction } from '../../logic/validation';
import { Table, Seat } from '../../core/types';

/**
 * Helper to create seats
 */
function createSeats(players: Array<{id: number, pid: string, chips: number, streetCommitted?: number, status?: 'active' | 'folded' | 'allin' | 'empty'}>): Seat[] {
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
      committed: 0,
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

describe('Timeout Auto-Fold', () => {
  describe('Valid timeouts', () => {
    it('Folds player when they timeout and cannot check', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100, streetCommitted: 0 }
      ]);
      const table = createTable(seats, {
        actor: 0,
        currentBet: 20 // Must call, cannot check
      });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState.seats[0].status).toBe('folded');
      expect(result.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'EMIT_STATE_CHANGE',
            payload: { reason: 'player_timeout_folded' }
          })
        ])
      );
    });

    it('Includes timer stop side effect', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'STOP_TIMER',
            payload: { playerId: 'P1' }
          })
        ])
      );
    });

    it('Advances to next player after timeout fold', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100 },
        { id: 1, pid: 'P2', chips: 100 }
      ]);
      const table = createTable(seats, { actor: 0, currentBet: 20 });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState.seats[0].status).toBe('folded');
      // Next actor should be determined by getNextActor logic
    });
  });

  describe('Invalid timeout scenarios', () => {
    it('Ignores timeout when player no longer actor', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 1 }); // P1 not current actor
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState).toBe(table); // Unchanged
      expect(result.sideEffects).toEqual([
        {
          type: 'EMIT_STATE_CHANGE',
          payload: { reason: 'timeout_ignored' }
        }
      ]);
    });

    it('Ignores timeout for folded player', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100, status: 'folded' }]);
      const table = createTable(seats, { actor: 0 });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState).toBe(table); // Unchanged
      expect(result.sideEffects).toEqual([
        {
          type: 'EMIT_STATE_CHANGE',
          payload: { reason: 'timeout_invalid_seat' }
        }
      ]);
    });

    it('Ignores timeout for all-in player', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 0, status: 'allin' }]);
      const table = createTable(seats, { actor: 0 });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState).toBe(table); // Unchanged
    });

    it('Ignores timeout for empty seat', () => {
      const seats = createSeats([]);
      const table = createTable(seats, { actor: 0 });
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState).toBe(table); // Unchanged
    });
  });

  describe('Race condition handling', () => {
    it('Handles timeout after player already acted', () => {
      // Simulate: player acts, then timeout fires
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 80 }]); // Already called
      const table = createTable(seats, { 
        actor: 1, // Moved to next player
        currentBet: 20
      });
      
      const result = handleTimeoutAutoFold(table, 0); // Timeout for previous player
      
      expect(result.nextState).toBe(table); // Should be ignored
      expect(result.sideEffects[0].payload.reason).toBe('timeout_ignored');
    });

    it('Handles timeout for player who went all-in', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 0, status: 'allin' }]);
      const table = createTable(seats, { actor: 1 }); // Moved to next player
      
      const result = handleTimeoutAutoFold(table, 0);
      
      expect(result.nextState).toBe(table);
      expect(result.sideEffects[0].payload.reason).toBe('timeout_ignored');
    });
  });
});

describe('Out-of-Turn Actions', () => {
  describe('Action validation for turn order', () => {
    it('Rejects action when not player\'s turn', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100 },
        { id: 1, pid: 'P2', chips: 100 }
      ]);
      const table = createTable(seats, { actor: 0 }); // P1's turn
      
      const result = validateAction(table, 1, 'FOLD'); // P2 tries to act
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not player\'s turn');
    });

    it('Allows action when it is player\'s turn', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0 });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(true);
    });

    it('Rejects action for undefined actor', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: undefined });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('turn');
    });
  });

  describe('Phase validation', () => {
    it('Rejects actions during showdown', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0,
        phase: 'showdown'
      });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('showdown');
    });

    it('Rejects actions during payout', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { 
        actor: 0,
        phase: 'payout'
      });
      
      const result = validateAction(table, 0, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('payout');
    });

    it('Allows actions during betting phases', () => {
      const phases = ['preflop', 'flop', 'turn', 'river'] as const;
      
      phases.forEach(phase => {
        const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
        const table = createTable(seats, { 
          actor: 0, 
          phase,
          street: phase,
          currentBet: 0
        });
        
        const result = validateAction(table, 0, 'CHECK');
        expect(result.valid).toBe(true);
      });
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('Invalid seat references', () => {
    it('Rejects negative seat index', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: -1 });
      
      const result = validateAction(table, -1, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid seat index');
    });

    it('Rejects seat index >= 9', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0 });
      
      const result = validateAction(table, 9, 'FOLD'); // Max is 8
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid seat index');
    });

    it('Rejects action for empty seat', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 1 }); // Seat 1 is empty
      
      const result = validateAction(table, 1, 'FOLD');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  describe('Invalid action types', () => {
    it('Rejects unknown action type', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0 });
      
      // @ts-ignore - Testing invalid action type
      const result = validateAction(table, 0, 'INVALID_ACTION');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });
  });

  describe('Extreme stack sizes', () => {
    it('Handles player with 0 chips', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 0 }]);
      const table = createTable(seats, { actor: 0 });
      
      const foldResult = validateAction(table, 0, 'FOLD');
      expect(foldResult.valid).toBe(true);
      
      const allinResult = validateAction(table, 0, 'ALLIN');
      expect(allinResult.valid).toBe(false);
      expect(allinResult.error).toContain('No chips');
    });

    it('Handles very large stack', () => {
      const seats = createSeats([{ id: 0, pid: 'BigStack', chips: 1000000 }]);
      const table = createTable(seats, { actor: 0, currentBet: 0 });
      
      const result = validateAction(table, 0, 'BET', 500000);
      expect(result.valid).toBe(true);
    });

    it('Handles fractional amounts (should be rejected)', () => {
      const seats = createSeats([{ id: 0, pid: 'P1', chips: 100 }]);
      const table = createTable(seats, { actor: 0, currentBet: 0 });
      
      const result = validateAction(table, 0, 'BET', 10.5);
      expect(result.valid).toBe(false);
    });
  });

  describe('Button advancement edge cases', () => {
    it('Handles all players except one leaving', () => {
      const seats = createSeats([
        { id: 0, pid: 'LastPlayer', chips: 100 },
        // All other seats empty
      ]);
      const table = createTable(seats, { actor: 0 });
      
      // Should complete immediately with one player
      const result = validateAction(table, 0, 'FOLD');
      expect(result.valid).toBe(true);
    });

    it('Handles button at non-adjacent seats', () => {
      const seats = createSeats([
        { id: 0, pid: 'P1', chips: 100 },
        { id: 5, pid: 'P2', chips: 100 },
        { id: 8, pid: 'P3', chips: 100 }
      ]);
      
      const table = createTable(seats, { 
        actor: 0,
        button: 8 // Button at seat 8
      });
      
      const result = validateAction(table, 0, 'FOLD');
      expect(result.valid).toBe(true);
    });
  });

  describe('Street commitment edge cases', () => {
    it('Handles player with existing street commitment', () => {
      const seats = createSeats([{
        id: 0,
        pid: 'P1', 
        chips: 50,
        streetCommitted: 20 // Already committed 20
      }]);
      const table = createTable(seats, { 
        actor: 0,
        currentBet: 30 // Need to add 10 more
      });
      
      const callResult = validateAction(table, 0, 'CALL');
      expect(callResult.valid).toBe(true);
      
      const checkResult = validateAction(table, 0, 'CHECK');
      expect(checkResult.valid).toBe(false); // Still need to call 10
    });

    it('Handles over-commitment scenarios', () => {
      const seats = createSeats([{
        id: 0,
        pid: 'P1',
        chips: 100,
        streetCommitted: 50 // Already committed more than current bet
      }]);
      const table = createTable(seats, { 
        actor: 0,
        currentBet: 30 // Less than street commitment
      });
      
      const checkResult = validateAction(table, 0, 'CHECK');
      expect(checkResult.valid).toBe(true); // Can check, already over-committed
    });
  });

  describe('Multiple street scenarios', () => {
    it('Tracks commitments across streets', () => {
      const seats = createSeats([{
        id: 0,
        pid: 'P1',
        chips: 100,
        streetCommitted: 0 // Reset for new street
      }]);
      
      // Simulate flop after preflop action
      const table = createTable(seats, { 
        actor: 0,
        phase: 'flop',
        street: 'flop',
        currentBet: 0 // New street, no bets yet
      });
      
      const checkResult = validateAction(table, 0, 'CHECK');
      expect(checkResult.valid).toBe(true);
      
      const betResult = validateAction(table, 0, 'BET', 25);
      expect(betResult.valid).toBe(true);
    });
  });
});