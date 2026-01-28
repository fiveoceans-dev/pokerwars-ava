#!/usr/bin/env node

/**
 * Test BB check action specifically
 */

const { EventEngine } = require('./dist/game-engine/core/eventEngine.js');

async function testBBCheck() {
  console.log('🎯 Testing BB Check Action');
  console.log('========================\n');
  
  const engine = new EventEngine('test-bb-check', 25, 50);
  
  // Add 3 players
  for (let i = 0; i < 3; i++) {
    await engine.processCommand({
      type: 'join',
      playerId: `player${i}`,
      seatId: i,
      chips: 5000,
      nickname: `P${i}`
    });
  }
  
  // Start hand
  await engine.processCommand({ type: 'start_hand' });
  let table = engine.getState();
  
  console.log(`Initial state - BB seat: ${table.bbSeat}, Current bet: ${table.currentBet}, Actor: ${table.actor}`);
  
  // UTG calls (limps)
  console.log(`\n1. UTG (seat ${table.actor}) calls`);
  await engine.processCommand({
    type: 'action',
    seatId: table.actor,
    action: 'call'
  });
  
  table = engine.getState();
  console.log(`   After UTG call - Actor: ${table.actor}, Current bet: ${table.currentBet}`);
  
  // SB calls
  console.log(`\n2. SB (seat ${table.actor}) calls`);
  await engine.processCommand({
    type: 'action',
    seatId: table.actor,
    action: 'call'
  });
  
  table = engine.getState();
  console.log(`   After SB call - Actor: ${table.actor}, Current bet: ${table.currentBet}`);
  
  // Now it's BB's turn - they should be able to check
  const bbSeat = table.seats[table.bbSeat];
  console.log(`\n3. BB (seat ${table.bbSeat}) should be able to check:`);
  console.log(`   BB has acted: ${table.bbHasActed}`);
  console.log(`   Current bet: ${table.currentBet}`);
  console.log(`   Big blind: ${table.bigBlind}`);
  console.log(`   Phase: ${table.phase}`);
  
  // Test the check action
  try {
    console.log(`\n   Attempting BB check...`);
    await engine.processCommand({
      type: 'action',
      seatId: table.bbSeat,
      action: 'check'
    });
    
    console.log('   ✅ BB check SUCCESSFUL!');
    
    table = engine.getState();
    console.log(`   After BB check - Phase: ${table.phase}, Actor: ${table.actor || 'none'}`);
    
  } catch (error) {
    console.log(`   ❌ BB check FAILED: ${error.message}`);
  }
  
  console.log('\n✅ BB check test completed!');
}

testBBCheck().catch(console.error);