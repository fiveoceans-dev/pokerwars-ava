#!/usr/bin/env node

/**
 * Comprehensive test of all player positions and legal actions
 */

const { EventEngine } = require('./dist/game-engine/core/eventEngine.js');

// Test scenarios for different player counts and positions
const testScenarios = [
  { name: "2 Players (Heads-up)", playerCount: 2 },
  { name: "3 Players", playerCount: 3 },
  { name: "4 Players", playerCount: 4 },
  { name: "6 Players", playerCount: 6 },
  { name: "9 Players (Full Ring)", playerCount: 9 }
];

async function testPositionActions(playerCount) {
  console.log(`\n🎮 Testing ${playerCount} player scenario\n`);
  
  const engine = new EventEngine(`test-${playerCount}p`, 25, 50);
  
  try {
    // Add players
    const seats = [];
    for (let i = 0; i < playerCount; i++) {
      const seatId = i;
      await engine.processCommand({
        type: 'join',
        playerId: `player${i}`,
        seatId: seatId,
        chips: 5000,
        nickname: `P${i}`
      });
      seats.push(seatId);
    }
    
    // Start hand
    await engine.processCommand({ type: 'start_hand' });
    
    // Get initial state
    const table = engine.getState();
    
    console.log(`Table Info:`);
    console.log(`  Phase: ${table.phase}`);
    console.log(`  Button: ${table.button}`);
    console.log(`  BB Seat: ${table.bbSeat}`);
    console.log(`  Actor: ${table.actor}`);
    console.log(`  Current Bet: ${table.currentBet}`);
    console.log(`  BB Has Acted: ${table.bbHasActed}`);
    
    // Check what actions are available for each position
    console.log(`\nPosition Analysis:`);
    for (let i = 0; i < playerCount; i++) {
      const seat = table.seats[i];
      if (seat.pid) {
        const position = getPositionName(i, table.button, table.bbSeat, playerCount);
        const isActor = table.actor === i;
        const toCall = Math.max(0, table.currentBet - seat.streetCommitted);
        
        console.log(`  Seat ${i} (${position}): ${seat.pid}`);
        console.log(`    Status: ${seat.status}, Chips: ${seat.chips}`);
        console.log(`    Committed: ${seat.committed}, Street: ${seat.streetCommitted}`);
        console.log(`    To Call: ${toCall}`);
        console.log(`    Is Actor: ${isActor}`);
        
        // Check specific scenarios
        if (i === table.bbSeat && table.phase === 'preflop' && !table.bbHasActed) {
          console.log(`    🎯 BB OPTION AVAILABLE`);
          
          // Test if BB can check
          if (isActor && table.currentBet === table.bigBlind) {
            console.log(`    ✅ Should be able to CHECK (BB option)`);
          }
        }
        
        if (isActor) {
          // List what actions should be available
          const shouldCheck = toCall === 0 || (i === table.bbSeat && !table.bbHasActed && table.currentBet === table.bigBlind);
          const shouldCall = toCall > 0 && seat.chips > 0;
          const shouldBet = table.currentBet === 0 && seat.chips >= table.bigBlind;
          const shouldRaise = table.currentBet > 0 && seat.chips > toCall;
          
          console.log(`    Available Actions:`);
          console.log(`      - Fold: always`);
          if (shouldCheck) console.log(`      - Check: YES`);
          if (shouldCall) console.log(`      - Call: YES (${Math.min(toCall, seat.chips)})`);
          if (shouldBet) console.log(`      - Bet: YES`);
          if (shouldRaise) console.log(`      - Raise: YES`);
          if (seat.chips > 0) console.log(`      - All-in: YES (${seat.chips})`);
        }
        
        console.log('');
      }
    }
    
  } catch (error) {
    console.error(`❌ Error in ${playerCount} player test:`, error.message);
  }
}

function getPositionName(seatId, button, bbSeat, playerCount) {
  if (playerCount === 2) {
    return seatId === button ? "BTN/SB" : "BB";
  }
  
  if (seatId === button) return "BTN";
  if (seatId === bbSeat) return "BB";
  
  // Find SB position
  const sbSeat = playerCount === 2 ? button : (button + 1) % playerCount;
  if (seatId === sbSeat) return "SB";
  
  // Calculate position relative to button
  const distance = (seatId - button + playerCount) % playerCount;
  
  if (playerCount <= 6) {
    if (distance === 3) return "UTG";
    if (distance === 4) return "MP";
    if (distance === 5) return "CO";
  } else {
    if (distance === 3) return "UTG";
    if (distance === 4) return "UTG+1";
    if (distance === 5) return "UTG+2";
    if (distance === 6) return "MP";
    if (distance === 7) return "HJ";
    if (distance === 8) return "CO";
  }
  
  return `Pos${distance}`;
}

async function testSpecificScenarios() {
  console.log('\n🔬 Testing Specific Edge Cases\n');
  
  // Test 1: BB option with limpers
  console.log('1. BB Option with Limpers:');
  const engine1 = new EventEngine('test-bb-limp', 25, 50);
  
  // Add 3 players
  for (let i = 0; i < 3; i++) {
    await engine1.processCommand({
      type: 'join',
      playerId: `player${i}`,
      seatId: i,
      chips: 5000,
      nickname: `P${i}`
    });
  }
  
  await engine1.processCommand({ type: 'start_hand' });
  let table = engine1.getState();
  
  // UTG calls (limps)
  await engine1.processCommand({
    type: 'action',
    seatId: table.actor,
    action: 'call'
  });
  
  // SB calls
  table = engine1.getState();
  await engine1.processCommand({
    type: 'action',
    seatId: table.actor,
    action: 'call'
  });
  
  // Check BB's options
  table = engine1.getState();
  const bbSeat = table.seats[table.bbSeat];
  console.log(`  BB (seat ${table.bbSeat}) options:`);
  console.log(`    Current bet: ${table.currentBet}`);
  console.log(`    BB committed: ${bbSeat.streetCommitted}`);
  console.log(`    BB has acted: ${table.bbHasActed}`);
  console.log(`    Should have CHECK option: ${table.currentBet === table.bigBlind && !table.bbHasActed}`);
  console.log('');
  
  // Test 2: All-in scenarios
  console.log('2. All-in Scenarios:');
  const engine2 = new EventEngine('test-allin', 25, 50);
  
  // Add player with short stack
  await engine2.processCommand({
    type: 'join',
    playerId: 'shortstack',
    seatId: 0,
    chips: 30, // Less than BB
    nickname: 'Short'
  });
  
  await engine2.processCommand({
    type: 'join',
    playerId: 'bigstack',
    seatId: 1,
    chips: 5000,
    nickname: 'Big'
  });
  
  await engine2.processCommand({ type: 'start_hand' });
  table = engine2.getState();
  
  const shortSeat = table.seats.find(s => s.pid === 'shortstack');
  console.log(`  Short stack (${shortSeat.chips} chips):`);
  console.log(`    Status: ${shortSeat.status}`);
  console.log(`    Is all-in after blinds: ${shortSeat.status === 'allin'}`);
  console.log('');
  
  // Test 3: Minimum raise scenarios
  console.log('3. Minimum Raise Rules:');
  const engine3 = new EventEngine('test-minraise', 25, 50);
  
  for (let i = 0; i < 3; i++) {
    await engine3.processCommand({
      type: 'join',
      playerId: `player${i}`,
      seatId: i,
      chips: 5000,
      nickname: `P${i}`
    });
  }
  
  await engine3.processCommand({ type: 'start_hand' });
  table = engine3.getState();
  
  // UTG raises to 150 (raise of 100 over BB 50)
  await engine3.processCommand({
    type: 'action',
    seatId: table.actor,
    action: 'raise',
    amount: 150
  });
  
  table = engine3.getState();
  console.log(`  After UTG raises to 150:`);
  console.log(`    Current bet: ${table.currentBet}`);
  console.log(`    Last raise size: ${table.lastRaiseSize}`);
  console.log(`    Min raise would be to: ${table.currentBet + table.lastRaiseSize}`);
  console.log('');
}

async function runAllTests() {
  console.log('🎯 COMPREHENSIVE POSITION & ACTION TESTING');
  console.log('==========================================');
  
  // Test all player counts
  for (const scenario of testScenarios) {
    await testPositionActions(scenario.playerCount);
  }
  
  // Test specific edge cases
  await testSpecificScenarios();
  
  console.log('\n✅ All position tests completed!');
}

runAllTests().catch(console.error);