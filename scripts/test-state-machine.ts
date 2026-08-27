import dotenv from 'dotenv';
import { processUserTurn } from '../src/agent/orchestrator';
import { sessionStore } from '../src/agent/sessionStore';
import { AgentStateMachine, IllegalStateTransitionError } from '../src/agent/stateMachine';

dotenv.config();

async function runStateMachineTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Agent State Machine & Confirmation Gate Tests');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  // ============================================================================
  // TEST SUITE 1: Happy-Path Multi-Turn Conversation
  // (User Request -> Clarification -> Confirmation Prompt -> Affirmative -> PAYING)
  // ============================================================================
  console.log('----------------------------------------------------------------');
  console.log('[Scenario 1] Full Happy-Path Multi-Turn Checkout');
  console.log('----------------------------------------------------------------');
  const session1Id = `test-session-happy-${Date.now()}`;

  // Turn 1: Missing color for shirt (Oxford shirt has Navy Blue & Classic White in size M)
  console.log('\n[Turn 1] User: "buy Oxford shirt in size M"');
  const turn1 = await processUserTurn(session1Id, 'buy Oxford shirt in size M');
  console.log(`Agent State: ${turn1.state}`);
  console.log(`Agent Reply: \n${turn1.agent_message}\n`);
  assert(turn1.state === 'CLARIFYING', 'Turn 1 transitions to CLARIFYING (missing color choice)');
  assert(turn1.agent_message.includes('color') || turn1.agent_message.includes('options'), 'Turn 1 prompts for color');

  // Turn 2: User clarifies "Navy blue please"
  console.log('\n[Turn 2] User: "Navy blue please"');
  const turn2 = await processUserTurn(session1Id, 'Navy blue please');
  console.log(`Agent State: ${turn2.state}`);
  console.log(`Agent Reply: \n${turn2.agent_message}\n`);
  assert(turn2.state === 'AWAITING_CONFIRMATION', 'Turn 2 transitions to AWAITING_CONFIRMATION');
  assert(turn2.order_summary !== null, 'Turn 2 generated active order summary');
  assert(turn2.order_summary?.sku === 'SHIRT-OXF-BLU-M', 'Turn 2 resolved exact SKU: SHIRT-OXF-BLU-M');
  assert(turn2.order_summary?.totalPaise === 149900, 'Turn 2 calculated total: ₹1,499.00 (149900 paise)');

  // Turn 3: User confirms "Yes confirm"
  console.log('\n[Turn 3] User: "Yes confirm"');
  const turn3 = await processUserTurn(session1Id, 'Yes confirm');
  console.log(`Agent State: ${turn3.state}`);
  console.log(`Agent Reply: \n${turn3.agent_message}\n`);
  assert(turn3.state === 'PAYING', 'Turn 3 successfully unlocked confirmation gate -> reached PAYING');
  assert(turn3.transition_event.isMoneyGatedAction === true, 'Turn 3 recorded isMoneyGatedAction: true in audit event');

  // ============================================================================
  // TEST SUITE 2: Strict Security Invariant & Illegal Jump Tests
  // (Verify that no code path can bypass the confirmation gate into PAYING/CONFIRMED)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Scenario 2] Illegal Direct Jump & Security Gate Verification');
  console.log('----------------------------------------------------------------');
  const session2Id = `test-session-security-${Date.now()}`;
  const freshSession = sessionStore.getOrCreate(session2Id);

  // Attempt 1: Jumping directly from IDLE to CONFIRMED
  console.log('\nAttempting illegal transition: IDLE -> CONFIRMED directly...');
  try {
    AgentStateMachine.transition(freshSession, {
      type: 'CONFIRM_AFFIRMATIVE',
      payload: { userNotes: 'Hacked confirmation' },
    });
    assert(false, 'Illegal jump IDLE -> CONFIRMED was NOT blocked!');
  } catch (err: any) {
    assert(
      err instanceof IllegalStateTransitionError || err.message.includes('SECURITY GATE VIOLATION'),
      'Illegal jump IDLE -> CONFIRMED correctly BLOCKED by security gate'
    );
    console.log(`  Security Defense: "${err.message}"`);
  }

  // Attempt 2: Jumping directly from IDLE to PAYING
  console.log('\nAttempting illegal transition: IDLE -> PAYING directly...');
  try {
    AgentStateMachine.transition(freshSession, {
      type: 'INITIATE_PAYMENT',
      payload: { razorpayOrderId: 'order_hacked' },
    });
    assert(false, 'Illegal jump IDLE -> PAYING was NOT blocked!');
  } catch (err: any) {
    assert(
      err instanceof IllegalStateTransitionError || err.message.includes('SECURITY GATE VIOLATION'),
      'Illegal jump IDLE -> PAYING correctly BLOCKED by security gate'
    );
    console.log(`  Security Defense: "${err.message}"`);
  }

  // Attempt 3: Jumping from CLARIFYING directly to PAYING
  console.log('\nAttempting illegal transition: CLARIFYING -> PAYING directly...');
  freshSession.current_state = 'CLARIFYING';
  try {
    AgentStateMachine.transition(freshSession, {
      type: 'INITIATE_PAYMENT',
      payload: { razorpayOrderId: 'order_hacked' },
    });
    assert(false, 'Illegal jump CLARIFYING -> PAYING was NOT blocked!');
  } catch (err: any) {
    assert(
      err instanceof IllegalStateTransitionError || err.message.includes('SECURITY GATE VIOLATION'),
      'Illegal jump CLARIFYING -> PAYING correctly BLOCKED by security gate'
    );
    console.log(`  Security Defense: "${err.message}"`);
  }

  // ============================================================================
  // TEST SUITE 3: Out of Stock Edge Case Flow (PRD FR-8)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Scenario 3] Out of Stock Edge Case Handling (FR-8)');
  console.log('----------------------------------------------------------------');
  const session3Id = `test-session-oos-${Date.now()}`;
  console.log('\nUser: "buy Vintage Leather Bomber Jacket in size L"');
  const turnOOS = await processUserTurn(session3Id, 'buy Vintage Leather Bomber Jacket in size L');
  console.log(`Agent State: ${turnOOS.state}`);
  console.log(`Agent Reply: \n${turnOOS.agent_message}\n`);
  assert(turnOOS.state === 'CLARIFYING', 'Out-of-stock item transitions to CLARIFYING');
  assert(turnOOS.agent_message.includes('out of stock') || turnOOS.agent_message.includes('stock'), 'Agent informs user item is out of stock');
  assert(turnOOS.match_result?.match_status === 'out_of_stock', 'Match result status is out_of_stock');

  // ============================================================================
  // TEST SUITE 4: User Cancellation Flow
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Scenario 4] User Order Cancellation in Confirmation Stage');
  console.log('----------------------------------------------------------------');
  const session4Id = `test-session-cancel-${Date.now()}`;
  await processUserTurn(session4Id, 'buy Classic Oxford Cotton Shirt in size M and color navy');
  const session4 = sessionStore.get(session4Id);
  assert(session4?.current_state === 'AWAITING_CONFIRMATION', 'Reached AWAITING_CONFIRMATION');

  console.log('\nUser: "No, cancel order"');
  const turnCancel = await processUserTurn(session4Id, 'No, cancel order');
  console.log(`Agent State: ${turnCancel.state}`);
  console.log(`Agent Reply: \n${turnCancel.agent_message}\n`);
  assert(turnCancel.state === 'IDLE', 'Declining confirmation resets state cleanly to IDLE');
  assert(sessionStore.get(session4Id)?.active_order_summary === null, 'Order summary cleared after cancellation');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(` Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');
}

runStateMachineTests();
