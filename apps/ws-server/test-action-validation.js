#!/usr/bin/env node

/**
 * Quick validation test for action error handling
 */

const { EventEngine } = require('./dist/game-engine/core/eventEngine.js');

async function testActionValidation() {
  console.log('🧪 Testing Action Validation Error Handling...\n');
  
  // Create engine
  const engine = new EventEngine('test-table', 5, 10);
  
  try {
    // Add two players
    console.log('1. Adding players...');
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
    
    console.log('✅ Players added successfully\n');
    
    // Start hand
    console.log('2. Starting hand...');
    await engine.processCommand({ type: 'start_hand' });
    console.log('✅ Hand started successfully\n');
    
    // Get current state
    const table = engine.getState();
    console.log(`3. Current game state:`);
    console.log(`   Phase: ${table.phase}`);
    console.log(`   Actor: ${table.actor} (${table.actor !== undefined ? table.seats[table.actor]?.pid : 'none'})`);
    console.log(`   Current Bet: ${table.currentBet}`);
    console.log('');
    
    // Try an invalid action (wrong player)
    console.log('4. Testing invalid action (wrong player turn)...');
    const wrongPlayer = table.actor === 0 ? 1 : 0;
    
    try {
      await engine.processCommand({
        type: 'action',
        seatId: wrongPlayer,
        action: 'check',
        amount: 0
      });
      console.log('❌ ERROR: Invalid action should have failed!');
    } catch (error) {
      console.log('✅ Invalid action correctly rejected:');
      console.log(`   Error: ${error.message}\n`);
    }
    
    // Try a valid action
    console.log('5. Testing valid action...');
    try {
      await engine.processCommand({
        type: 'action',
        seatId: table.actor,
        action: 'call',
        amount: 0
      });
      console.log('✅ Valid action processed successfully\n');
    } catch (error) {
      console.log('❌ ERROR: Valid action failed:');
      console.log(`   Error: ${error.message}\n`);
    }
    
    console.log('🎯 Action validation test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testActionValidation();