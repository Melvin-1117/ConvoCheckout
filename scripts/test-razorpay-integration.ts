import dotenv from 'dotenv';
import {
  createRazorpayOrder,
  RazorpayApiClient,
  SecurityGateViolationError,
  isTransientError,
} from '../src/services/razorpayService';
import { generateConfirmationSummary } from '../src/agent/confirmation';
import { processUserTurn } from '../src/agent/orchestrator';
import { sessionStore } from '../src/agent/sessionStore';
import { AuditRepository } from '../src/db/repositories/auditRepository';
import { LeanProduct, LeanVariant } from '../src/db/repositories/catalogRepository';

dotenv.config();

const sampleProduct: LeanProduct = {
  id: 'b1000000-0000-0000-0000-000000000001',
  name: 'Classic Oxford Cotton Shirt',
  slug: 'classic-oxford-cotton-shirt',
  description: 'Tailored 100% breathable organic cotton shirt with button-down collar.',
  categoryId: 'c1000000-0000-0000-0000-000000000001',
  categoryName: 'Apparel & Fashion',
  categorySlug: 'apparel',
  basePrice: 149900,
  basePriceFormatted: '₹1,499.00',
  tags: ['shirt', 'oxford', 'cotton', 'blue shirt', 'navy'],
  imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
  inStock: true,
  variantsCount: 5,
  inStockVariantsCount: 5,
};

const sampleVariant: LeanVariant = {
  id: 'v1000000-0000-0000-0000-000000000002',
  productId: 'b1000000-0000-0000-0000-000000000001',
  sku: 'SHIRT-OXF-BLU-M',
  name: 'Size M / Navy Blue',
  size: 'M',
  color: 'Navy Blue',
  price: 149900,
  priceFormatted: '₹1,499.00',
  stockQuantity: 25,
  inStock: true,
  imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
};

async function runRazorpayIntegrationTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Razorpay Test-Mode Integration Tests (Step 7)');
  console.log(' Track: AI Growth & Agentic Commerce (Razorpay Buildathon 2026)');
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
  // TEST SUITE 1: createRazorpayOrder() Calculation & Traceability
  // ============================================================================
  console.log('----------------------------------------------------------------');
  console.log('[Test Suite 1] createRazorpayOrder() Output & Paise Unit Math');
  console.log('----------------------------------------------------------------');

  const summary1 = generateConfirmationSummary(sampleProduct, sampleVariant, 1);
  const testSessionId = `test-rzp-sess-${Date.now()}`;

  const result1 = await createRazorpayOrder(summary1, testSessionId, {
    sessionState: 'CONFIRMED',
  });

  console.log('\nGenerated Razorpay Order Result:');
  console.log(JSON.stringify(result1, null, 2));

  assert(result1.success === true, 'Order creation returned success: true');
  assert(
    typeof result1.razorpay_order_id === 'string' && result1.razorpay_order_id.length > 0,
    `Order ID generated: ${result1.razorpay_order_id}`
  );
  assert(
    typeof result1.payment_link_url === 'string' && result1.payment_link_url.includes('rzp.io'),
    `Payment Link URL generated: ${result1.payment_link_url}`
  );
  assert(result1.amount === 149900, 'Amount is strictly in Paise (149900 paise = ₹1,499.00)');
  assert(result1.currency === 'INR', 'Currency is INR');
  assert(result1.status === 'created', 'Order status is "created"');
  assert(
    result1.notes?.sessionId === testSessionId,
    'Traceability: notes contains sessionId'
  );
  assert(
    result1.notes?.sku === 'SHIRT-OXF-BLU-M',
    'Traceability: notes contains SKU'
  );
  assert(
    typeof result1.notes?.line_items_summary === 'string' &&
      result1.notes.line_items_summary.includes('Classic Oxford Cotton Shirt'),
    'Traceability: notes contains readable line items summary'
  );

  // Multi-quantity test (2 shirts = 299800 paise)
  const summary2 = generateConfirmationSummary(sampleProduct, sampleVariant, 2);
  const result2 = await createRazorpayOrder(summary2, testSessionId, {
    sessionState: 'CONFIRMED',
  });
  assert(result2.amount === 299800, 'Multi-quantity: 2x ₹1,499 = 299800 paise (₹2,998.00)');

  // ============================================================================
  // TEST SUITE 2: Defense-in-Depth Security Gate Invariant Verification
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 2] Defense-in-Depth Security Assertion Defense');
  console.log('----------------------------------------------------------------');

  const illegalStates = ['IDLE', 'PARSING', 'CLARIFYING', 'AWAITING_CONFIRMATION'] as const;

  for (const illegalState of illegalStates) {
    try {
      await createRazorpayOrder(summary1, testSessionId, {
        sessionState: illegalState,
      });
      assert(false, `Security breach: createRazorpayOrder executed from '${illegalState}'!`);
    } catch (err: any) {
      assert(
        err instanceof SecurityGateViolationError || err.message.includes('SECURITY GATE VIOLATION'),
        `Security Guard: Blocked execution from '${illegalState}' -> ${err.message}`
      );
    }
  }

  // Allowed States (CONFIRMED and PAYING)
  try {
    const allowedConfirmed = await createRazorpayOrder(summary1, testSessionId, {
      sessionState: 'CONFIRMED',
    });
    assert(allowedConfirmed.success, 'Allowed state CONFIRMED executes successfully');

    const allowedPaying = await createRazorpayOrder(summary1, testSessionId, {
      sessionState: 'PAYING',
    });
    assert(allowedPaying.success, 'Allowed state PAYING executes successfully');
  } catch (err: any) {
    assert(false, `Legitimate call was unexpectedly blocked: ${err.message}`);
  }

  // ============================================================================
  // TEST SUITE 3: Transient Error vs Permanent Error Classification & Retry
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 3] Transient vs Permanent Error Retry Logic');
  console.log('----------------------------------------------------------------');

  assert(isTransientError(500) === true, 'HTTP 500 classified as transient (retry eligible)');
  assert(isTransientError(502) === true, 'HTTP 502 classified as transient (retry eligible)');
  assert(isTransientError(503) === true, 'HTTP 503 classified as transient (retry eligible)');
  assert(isTransientError(504) === true, 'HTTP 504 classified as transient (retry eligible)');
  assert(isTransientError(429) === true, 'HTTP 429 Rate Limit classified as transient (retry eligible)');
  assert(
    isTransientError(undefined, new Error('fetch failed: ECONNREFUSED')) === true,
    'Network ECONNREFUSED classified as transient'
  );
  assert(isTransientError(400) === false, 'HTTP 400 Bad Request classified as permanent (no retry)');
  assert(isTransientError(401) === false, 'HTTP 401 Unauthorized classified as permanent (no retry)');
  assert(isTransientError(404) === false, 'HTTP 404 Not Found classified as permanent (no retry)');

  // Permanent failure test (invalid amount <= 0)
  const invalidSummary = { ...summary1, totalPaise: 0, total_amount: 0, unitPricePaise: 0 };
  const failResult = await createRazorpayOrder(invalidSummary, testSessionId, {
    sessionState: 'CONFIRMED',
  });
  assert(failResult.success === false, 'Invalid amount (0 paise) returns success: false');
  assert(failResult.statusCode === 400, 'Invalid amount returns statusCode 400');
  assert(
    typeof failResult.error === 'string' && failResult.error.includes('Invalid order amount'),
    `Informative error message: "${failResult.error}"`
  );

  // ============================================================================
  // TEST SUITE 4: Multi-Turn Conversational Checkout (CONFIRMED -> PAYING)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 4] End-to-End Checkout Turn: CONFIRMED -> PAYING');
  console.log('----------------------------------------------------------------');

  const liveSessionId = `test-live-flow-${Date.now()}`;

  // Turn 1: Intent
  console.log('\n[Turn 1] User: "buy Oxford shirt in size M"');
  const t1 = await processUserTurn(liveSessionId, 'buy Oxford shirt in size M');
  assert(t1.state === 'CLARIFYING', 'Turn 1 reaches CLARIFYING');

  // Turn 2: Clarification
  console.log('\n[Turn 2] User: "Navy blue please"');
  const t2 = await processUserTurn(liveSessionId, 'Navy blue please');
  assert(t2.state === 'AWAITING_CONFIRMATION', 'Turn 2 reaches AWAITING_CONFIRMATION');

  // Turn 3: Affirmative Confirmation
  console.log('\n[Turn 3] User: "Yes, please confirm and pay"');
  const t3 = await processUserTurn(liveSessionId, 'Yes, please confirm and pay');
  console.log(`Agent State: ${t3.state}`);
  console.log(`Agent Reply: \n${t3.agent_message}\n`);

  assert(t3.state === 'PAYING', 'Turn 3 successfully transitions to PAYING');
  assert(t3.transition_event.isMoneyGatedAction === true, 'isMoneyGatedAction is TRUE in transition event');
  assert(
    typeof t3.payment_link_url === 'string' && t3.payment_link_url.includes('rzp.io'),
    `Payment Link URL populated on turn response: ${t3.payment_link_url}`
  );
  assert(
    typeof t3.razorpay_order?.razorpay_order_id === 'string',
    `Razorpay Order ID populated: ${t3.razorpay_order?.razorpay_order_id}`
  );
  assert(
    t3.agent_message.includes('Payment Ready') && t3.agent_message.includes('Pay with Razorpay'),
    'Agent message embeds formatted Razorpay payment link'
  );

  // ============================================================================
  // TEST SUITE 5: Failure Path Handling (Razorpay Failure -> State: FAILED)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 5] Failure Handling (Razorpay API Rejection -> FAILED)');
  console.log('----------------------------------------------------------------');

  const failSessionId = `test-fail-flow-${Date.now()}`;
  await processUserTurn(failSessionId, 'buy Oxford shirt in size M');
  await processUserTurn(failSessionId, 'Navy blue please');

  console.log('\nUser confirms, but Razorpay API simulated rejection occurs...');
  const tFail = await processUserTurn(failSessionId, 'Yes confirm', {
    simulateRazorpayFailure: 'bad_request',
  });

  console.log(`Agent State: ${tFail.state}`);
  console.log(`Agent Reply: \n${tFail.agent_message}\n`);

  assert(tFail.state === 'FAILED', 'API failure routes state machine cleanly to FAILED');
  assert(
    tFail.agent_message.includes('Payment Failed'),
    'Agent informs user of payment initialization failure gracefully'
  );

  // ============================================================================
  // TEST SUITE 6: Audit Trail Logging (Step 9 PRD FR-7 Verification)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 6] Audit Trail Verification (Step 9 Integration)');
  console.log('----------------------------------------------------------------');

  const auditLogs = await AuditRepository.getAuditTrailBySession(liveSessionId);
  console.log(`Retrieved ${auditLogs.length} audit trail event(s) for session ${liveSessionId}:`);
  for (const log of auditLogs) {
    console.log(`  • [${log.action_type}] (${log.category}) — ${log.decision_rationale} [MoneyAction: ${log.is_money_action}]`);
  }

  const orderCreatedLog = auditLogs.find((l) => l.action_type === 'RAZORPAY_ORDER_CREATED');
  assert(orderCreatedLog !== undefined, 'Audit trail contains RAZORPAY_ORDER_CREATED event');
  assert(orderCreatedLog?.is_money_action === true, 'Audit event is_money_action is TRUE');
  assert(
    typeof orderCreatedLog?.decision_rationale === 'string' &&
      orderCreatedLog.decision_rationale.includes('Razorpay test-mode order'),
    'Audit event decision_rationale includes human-readable payment details'
  );

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(` Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRazorpayIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
