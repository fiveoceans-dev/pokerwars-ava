#!/usr/bin/env node

/**
 * Test 3-player preflop scenario with BB option
 */

const { EventEngine } = require('./dist/game-engine/core/eventEngine.js');

async function test3PlayerPreflop() {
  console.log('🧪 Testing 3-Player Preflop Scenario...\n');
  
  const engine = new EventEngine('test-3p', 5, 10);
  
  try {
    // Add three players
    console.log('1. Adding 3 players...');
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
      seatId: 2,
      chips: 1000,
      nickname: 'Player2'
    });
    
    await engine.processCommand({
      type: 'join',
      playerId: 'player3',
      seatId: 4,
      chips: 1000,
      nickname: 'Player3'
    });
    
    console.log('✅ 3 players added\n');
    
    // Start hand
    console.log('2. Starting hand...');
    await engine.processCommand({ type: 'start_hand' });
    console.log('✅ Hand started\n');
    
    // Get state
    const table = engine.getState();
    console.log(`3. Game state:`);
    console.log(`   Phase: ${table.phase}`);
    console.log(`   Actor: ${table.actor} (${table.actor !== undefined ? table.seats[table.actor]?.pid : 'none'})`);
    console.log(`   Button: ${table.button}, BB: ${table.bbSeat}, SB: ${table.seats.find(s => s.committed === 5)?.id}`);
    console.log(`   Current Bet: ${table.currentBet}\n`);
    
    // Test UTG action (should be first to act in 3-player)
    console.log('4. Testing UTG action...');
    try {
      await engine.processCommand({
        type: 'action',
        seatId: table.actor,
        action: 'call',
        amount: 0
      });
      console.log('✅ UTG call successful\n');
      
      const newTable = engine.getState();
      console.log(`   New actor: ${newTable.actor} (${newTable.actor !== undefined ? newTable.seats[newTable.actor]?.pid : 'none'})`);
      
    } catch (error) {
      console.log('❌ UTG action failed:', error.message, '\n');
    }
    
    console.log('🎯 3-player test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test3PlayerPreflop();