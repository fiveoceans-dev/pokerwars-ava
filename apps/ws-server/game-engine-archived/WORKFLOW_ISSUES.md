# Workflow Issues - Test Suite Creation & Implementation Gaps

This document tracks issues discovered during comprehensive test suite creation for the poker engine. These issues need to be addressed to align implementation with poker_rules.md documentation.

## Test Failures & Implementation Discrepancies

### 1. Blind Posting Issues

#### Issue: `currentBet` Not Set After Posting Blinds
**Location:** `blinds.test.ts` - Multiple test failures
**Problem:** After posting blinds, `table.currentBet` remains 0 instead of being set to the big blind amount
**Expected:** `currentBet` should equal the big blind (highest street commitment)
**Impact:** Affects betting validation and action processing

```typescript
// Expected behavior
expect(result.nextState.currentBet).toBe(10); // Big blind amount
// Actual: currentBet is 0
```

#### Issue: Ante Implementation Differences
**Location:** `blinds.test.ts` - Ante posting tests
**Problem:** Implementation may not handle ante posting as expected by test scenarios
**Expected:** Each active player posts ante in addition to blinds
**Impact:** Multi-tournament scenarios with antes

### 2. Button Validation Edge Cases

#### Issue: Button Position Validation
**Location:** `blinds.test.ts` - Heads-up button tests  
**Problem:** `getBlindPositions()` may not handle all edge cases correctly
**Expected:** Heads-up button acts as small blind, next seat is big blind
**Impact:** Heads-up game accuracy

### 3. Turn Order & Action Tracking

#### Issue: Action Sequence Tracking Implementation
**Location:** Various test files
**Problem:** Some tests expect action sequence tracking to work differently than implementation
**Expected:** Players marked as acted when they take any action
**Impact:** Betting round completion detection

### 4. All-In Scenarios

#### Issue: Side Pot Creation Logic
**Location:** `allIn.test.ts` - Multiple all-in tests
**Problem:** Side pot calculation and eligibility may have edge cases
**Expected:** Proper side pot creation with correct eligibility lists
**Impact:** Multi-way all-in scenarios

### 5. Type System Issues

#### Issue: ActionType Case Sensitivity
**Location:** Multiple test files
**Problem:** Linter/system changed action types from lowercase to uppercase during development
**Resolution:** Updated all tests to use uppercase constants (FOLD, CHECK, CALL, BET, RAISE, ALLIN)
**Status:** ✅ Resolved

#### Issue: Seat Status Type Safety  
**Location:** Test helper functions
**Problem:** TypeScript strict mode requires explicit type assertions for seat status
**Resolution:** Added `as const` assertions for status values
**Status:** ✅ Resolved

## Architecture Concerns

### 1. State Transition Consistency

**Issue:** Some reducers may not follow consistent state transition patterns
**Impact:** Unpredictable behavior in complex scenarios
**Recommendation:** Review all reducers for consistent state updates

### 2. Side Effect Management

**Issue:** Side effects not always properly tracked in test scenarios
**Impact:** Integration testing and event sequencing
**Recommendation:** Enhance side effect validation in tests

### 3. FSM Phase Transitions

**Issue:** Phase transitions may not always align with expected FSM flow
**Impact:** Game state consistency
**Recommendation:** Validate all phase transitions against poker_rules.md

## Testing Infrastructure

### 1. Test Helper Functions

**Status:** ✅ Standardized
**Achievement:** Created consistent `createSeats()` and `createTable()` helpers across all test files
**Benefit:** Reduced code duplication and improved test maintainability

### 2. Vitest Configuration

**Status:** ✅ Resolved  
**Issue:** Jest references in backup tests causing conflicts
**Resolution:** Excluded backup directory from test runs

### 3. Test Coverage Gaps (Now Addressed)

**Status:** ✅ Comprehensive
**Achievement:** Created 5 major test suites covering:
- Blind posting scenarios (blinds.test.ts)
- Turn order logic (turnOrder.test.ts) 
- Betting validation (betting.test.ts)
- All-in scenarios (allIn.test.ts)
- Timeout handling (timeout.test.ts)

## Priority Fixes Needed

### High Priority
1. **Fix `currentBet` setting in blind posting** - Breaks betting validation
2. **Validate ante posting implementation** - Tournament play requirement
3. **Review side pot calculation edge cases** - Multi-way all-in accuracy

### Medium Priority
1. **Button position validation in edge cases** - Heads-up accuracy
2. **Action sequence tracking consistency** - Turn order reliability
3. **Phase transition validation** - FSM compliance

### Low Priority
1. **Enhanced error messaging in validation** - Developer experience
2. **Performance optimization in large scenarios** - Scalability

## Testing Strategy Recommendations

### 1. Integration Testing
- Run full hand simulations with various player configurations
- Test complete FSM transitions from waiting to payout
- Validate event sequencing and side effects

### 2. Property-Based Testing
- Generate random valid game states and actions
- Verify invariants hold across all transitions
- Test edge cases with random inputs

### 3. Performance Testing  
- Benchmark critical paths (action processing, pot calculation)
- Test with maximum player counts and complex scenarios
- Memory usage validation for long sessions

## Implementation Next Steps

1. **Run existing tests** to identify specific failures
2. **Fix `currentBet` assignment** in blind posting reducer
3. **Validate ante implementation** against poker_rules.md
4. **Review side pot calculation** for edge cases
5. **Integration test full hand scenarios**
6. **Performance benchmark critical paths**

## Notes

- All test suites are now comprehensive and aligned with poker_rules.md
- Type errors have been resolved across all test files
- Test infrastructure is standardized and maintainable
- Implementation fixes should be made incrementally with test validation
- Consider adding property-based testing for additional coverage

---
*Generated during comprehensive test suite creation - Ready for implementation fixes*