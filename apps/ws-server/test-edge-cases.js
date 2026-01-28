#!/usr/bin/env node

/**
 * Test edge cases and invalid action scenarios
 */

const { EventEngine } = require('./dist/game-engine/core/eventEngine.js');

async function testEdgeCases() {
  console.log('🧪 Testing Edge Cases and Invalid Actions...\n');
  
  const engine = new EventEngine('test-edge', 5, 10);
  
  try {
    // Add players
    await engine.processCommand({
      type: 'join',
      playerId: 'player1',
      seatId: 0,
      chips: 1000,
      nickname: 'Player1'
    });
    
    await engine.processCommand({
      type: 'join', 
      playerId: 'player2',
      seatId: 1,
      chips: 1000,
      nickname: 'Player2'
    });
    
    await engine.processCommand({ type: 'start_hand' });
    
    const table = engine.getState();
    console.log(`Initial state: Phase=${table.phase}, Actor=${table.actor}\n`);
    
    // Test 1: Invalid seat index
    console.log('1. Testing invalid seat index...');
    try {
      await engine.processCommand({
        type: 'action',
        seatId: 99,
        action: 'check'
      });
      console.log('❌ Should have failed');
    } catch (error) {
      console.log('✅ Correctly rejected:', error.message.split('\n')[0]);
    }
    
    // Test 2: Empty seat action
    console.log('\n2. Testing empty seat action...');
    try {
      await engine.processCommand({
        type: 'action',
        seatId: 3, // Empty seat
        action: 'check'
      });
      console.log('❌ Should have failed');
    } catch (error) {
      console.log('✅ Correctly rejected:', error.message.split('\n')[0]);
    }
    
    // Test 3: Wrong phase action
    console.log('\n3. Testing action in wrong phase...');
    // Force phase to waiting
    const testTable = engine.getState();
    testTable.phase = 'waiting';
    try {
      await engine.processCommand({
        type: 'action', 
        seatId: table.actor,
        action: 'check'
      });
      console.log('❌ Should have failed');
    } catch (error) {
      console.log('✅ Correctly rejected:', error.message.split('\n')[0]);
    }
    
    // Test 4: Invalid check when bet to call
    console.log('\n4. Testing invalid check with bet to call...');
    // Reset to preflop
    await engine.processCommand({ type: 'start_hand' });
    const newTable = engine.getState();
    
    try {
      await engine.processCommand({
        type: 'action',
        seatId: newTable.actor,
        action: 'check' // Should fail because BB is posted (bet to call)
      });
      console.log('❌ Should have failed');  
    } catch (error) {
      console.log('✅ Correctly rejected:', error.message.split('\n')[0]);
    }
    
    console.log('\n🎯 Edge case testing completed!');
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
  }
}

testEdgeCases();