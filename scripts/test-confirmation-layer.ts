import dotenv from 'dotenv';
import {
  generateConfirmationSummary,
  parseConfirmationResponse,
  extractModificationsFromText,
} from '../src/agent/confirmation';
import { processUserTurn } from '../src/agent/orchestrator';
import { sessionStore } from '../src/agent/sessionStore';
import { LeanProduct, LeanVariant } from '../src/db/repositories/catalogRepository';

dotenv.config();

// Sample matched product and variant (from Catalog Matching Step 4)
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

async function runConfirmationLayerTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Confirmation Layer & Decision Classifier Tests');
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
  // TEST SUITE 1: generateConfirmationSummary() Schema & Calculations
  // ============================================================================
  console.log('----------------------------------------------------------------');
  console.log('[Test Suite 1] generateConfirmationSummary() Unit Verification');
  console.log('----------------------------------------------------------------');

  const summary1 = generateConfirmationSummary(sampleProduct, sampleVariant, 1);
  console.log('\nGenerated Summary (Qty: 1):');
  console.log(JSON.stringify(summary1, null, 2));

  assert(
    typeof summary1.summary_text === 'string' && summary1.summary_text.includes('1x Classic Oxford Cotton Shirt'),
    'summary_text is formatted with quantity and item name'
  );
  assert(summary1.summary_text.includes('₹1,499'), 'summary_text contains formatted INR price');
  assert(summary1.summary_text.includes('Confirm this order?'), 'summary_text contains explicit confirmation question');
  assert(Array.isArray(summary1.line_items) && summary1.line_items.length === 1, 'line_items is a non-empty array');
  assert(summary1.line_items[0].product_name === 'Classic Oxford Cotton Shirt', 'line_items contains correct product_name');
  assert(summary1.line_items[0].variant_desc === 'Size M, Navy Blue', 'line_items contains complete variant_desc');
  assert(summary1.line_items[0].quantity === 1, 'line_items quantity matches 1');
  assert(summary1.line_items[0].unit_price === 1499, 'unit_price is normalized in INR (₹1499)');
  assert(summary1.line_items[0].subtotal === 1499, 'subtotal is calculated correctly (₹1499)');
  assert(summary1.total_amount === 1499, 'total_amount matches ₹1499');
  assert(summary1.currency === 'INR', 'currency is INR');

  // Multi-quantity calculation test
  const summary2 = generateConfirmationSummary(sampleProduct, sampleVariant, 3);
  assert(summary2.line_items[0].quantity === 3, 'Multi-quantity test: quantity = 3');
  assert(summary2.line_items[0].subtotal === 4497, 'Multi-quantity test: subtotal = ₹4,497');
  assert(summary2.total_amount === 4497, 'Multi-quantity test: total_amount = ₹4,497');
  assert(summary2.summary_text.includes('3x'), 'Multi-quantity test: summary_text starts with 3x');

  // ============================================================================
  // TEST SUITE 2: parseConfirmationResponse() Fast Rule-Based Classifier
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 2] parseConfirmationResponse() Classifier Accuracy');
  console.log('----------------------------------------------------------------');

  const affirmInputs = [
    'yes',
    'confirm',
    'proceed',
    'ok',
    'sure',
    'go ahead',
    'sounds good',
    'do it',
    'yes please',
    'place order',
    'buy it',
    'looks good',
    'yep do it',
    'yes confirm',
    'sure thing, proceed',
    'no problem, go ahead',
  ];

  console.log('\nEvaluating Affirmative Inputs:');
  for (const input of affirmInputs) {
    const result = parseConfirmationResponse(input);
    assert(
      result.decision === 'affirm',
      `Affirm: "${input}" -> 'affirm' (conf: ${result.confidence.toFixed(2)})`
    );
  }

  const rejectInputs = [
    'no',
    'cancel',
    'dont',
    "don't",
    'stop',
    'abort',
    'nope',
    'nevermind',
    'reject',
    'no thanks',
    'no cancel order',
    'nah leave it',
    'forget it',
  ];

  console.log('\nEvaluating Rejection Inputs:');
  for (const input of rejectInputs) {
    const result = parseConfirmationResponse(input);
    assert(
      result.decision === 'reject',
      `Reject: "${input}" -> 'reject' (conf: ${result.confidence.toFixed(2)})`
    );
  }

  const modifyInputs = [
    { text: 'change the size to L', expectedSize: 'L' },
    { text: 'make it 2 instead', expectedQty: 2 },
    { text: 'actually I want the Classic White one', expectedColor: 'Classic white' },
    { text: 'switch size to XL', expectedSize: 'XL' },
    { text: 'give me 3 of them', expectedQty: 3 },
    { text: 'change color to Jet Black', expectedColor: 'Jet black' },
  ];

  console.log('\nEvaluating Modification Inputs:');
  for (const item of modifyInputs) {
    const result = parseConfirmationResponse(item.text);
    assert(
      result.decision === 'modify',
      `Modify: "${item.text}" -> 'modify'`
    );
    if (item.expectedSize) {
      assert(
        result.modifications?.size?.toUpperCase() === item.expectedSize.toUpperCase(),
        `  -> Extracted size: '${result.modifications?.size}'`
      );
    }
    if (item.expectedQty) {
      assert(
        result.modifications?.quantity === item.expectedQty,
        `  -> Extracted quantity: ${result.modifications?.quantity}`
      );
    }
    if (item.expectedColor) {
      assert(
        result.modifications?.color?.toLowerCase() === item.expectedColor.toLowerCase(),
        `  -> Extracted color: '${result.modifications?.color}'`
      );
    }
  }

  const unclearFaqInputs = [
    { text: "what's the return policy?", expectedTopic: 'return_policy' },
    { text: 'how long will delivery take?', expectedTopic: 'shipping_delivery' },
    { text: 'can I pay via UPI or card?', expectedTopic: 'payment_methods' },
    { text: 'are your products genuine?', expectedTopic: 'authenticity_warranty' },
    { text: 'tell me a joke', expectedTopic: null },
    { text: 'maybe later', expectedTopic: null },
    { text: 'who is the CEO?', expectedTopic: null },
  ];

  console.log('\nEvaluating Unclear / FAQ Inputs (CRITICAL: Must NEVER be Affirm):');
  for (const item of unclearFaqInputs) {
    const result = parseConfirmationResponse(item.text);
    assert(
      result.decision === 'unclear',
      `Unclear: "${item.text}" -> 'unclear' (NEVER affirm)`
    );
    if (item.expectedTopic) {
      assert(
        result.detected_faq_topic === item.expectedTopic && typeof result.faq_answer === 'string',
        `  -> FAQ matched topic: '${result.detected_faq_topic}' with static answer`
      );
    }
  }

  // ============================================================================
  // TEST SUITE 3: Multi-Turn Orchestration & Confirmation Scenarios
  // Helper to initialize a clean session in AWAITING_CONFIRMATION state
  async function setupAwaitingConfirmationSession(sessionId: string) {
    await processUserTurn(sessionId, 'buy Oxford shirt in size M');
    const turn2 = await processUserTurn(sessionId, 'Navy blue please');
    return turn2;
  }

  // ============================================================================
  // TEST SUITE 3: Multi-Turn Orchestration & Confirmation Scenarios
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('[Test Suite 3] Multi-Turn Orchestrator Confirmation Scenarios');
  console.log('----------------------------------------------------------------');

  // Scenario 3A: Clean Affirm Flow
  console.log('\n[Scenario 3A] Clean Affirm Flow (AWAITING_CONFIRMATION -> CONFIRMED -> PAYING)');
  const sessionAffirmId = `test-affirm-${Date.now()}`;
  const t1 = await setupAwaitingConfirmationSession(sessionAffirmId);
  assert(t1.state === 'AWAITING_CONFIRMATION', 'Session reached AWAITING_CONFIRMATION');
  assert(t1.order_summary?.total_amount === 1499, 'Order summary total is ₹1,499');

  console.log('\nUser: "Sounds good, do it"');
  const t2 = await processUserTurn(sessionAffirmId, 'Sounds good, do it');
  console.log(`Agent State: ${t2.state}`);
  console.log(`Agent Reply: \n${t2.agent_message}\n`);
  assert(t2.state === 'PAYING' || t2.state === 'CONFIRMED', 'Affirm unlocked gate -> transitioned to PAYING/CONFIRMED');
  assert(t2.transition_event.isMoneyGatedAction === true, 'isMoneyGatedAction flagged as true in audit log');

  // Scenario 3B: Clean Reject Flow
  console.log('\n[Scenario 3B] Clean Reject Flow (AWAITING_CONFIRMATION -> IDLE)');
  const sessionRejectId = `test-reject-${Date.now()}`;
  await setupAwaitingConfirmationSession(sessionRejectId);
  console.log('\nUser: "No, cancel this order"');
  const rejectTurn = await processUserTurn(sessionRejectId, 'No, cancel this order');
  console.log(`Agent State: ${rejectTurn.state}`);
  console.log(`Agent Reply: \n${rejectTurn.agent_message}\n`);
  assert(rejectTurn.state === 'IDLE', 'Reject resets state to IDLE');
  assert(sessionStore.get(sessionRejectId)?.active_order_summary === null, 'Active order summary cleared on rejection');

  // Scenario 3C: Modification Flow (Preserving Context & In-Place Intent Merge)
  console.log('\n[Scenario 3C] In-Place Modification Flow (Merge into current_intent -> PARSING -> Updated AWAITING_CONFIRMATION)');
  const sessionModId = `test-modify-${Date.now()}`;
  await setupAwaitingConfirmationSession(sessionModId);

  console.log('\nUser: "make it 2 instead"');
  const modTurn1 = await processUserTurn(sessionModId, 'make it 2 instead');
  console.log(`Agent State: ${modTurn1.state}`);
  console.log(`Agent Reply: \n${modTurn1.agent_message}\n`);
  assert(modTurn1.state === 'AWAITING_CONFIRMATION', 'Modification re-entered AWAITING_CONFIRMATION');
  assert(modTurn1.order_summary?.line_items[0].quantity === 2, 'Updated order summary quantity = 2');
  assert(modTurn1.order_summary?.total_amount === 2998, 'Updated total amount = ₹2,998 (2x ₹1,499)');
  assert(modTurn1.order_summary?.sku === 'SHIRT-OXF-BLU-M', 'Retained original shirt & color (Navy Blue, Size M)');

  console.log('\nUser: "change the size to L"');
  const modTurn2 = await processUserTurn(sessionModId, 'change the size to L');
  console.log(`Agent State: ${modTurn2.state}`);
  console.log(`Agent Reply: \n${modTurn2.agent_message}\n`);
  assert(modTurn2.state === 'AWAITING_CONFIRMATION', 'Size change re-entered AWAITING_CONFIRMATION');
  assert(modTurn2.order_summary?.sku === 'SHIRT-OXF-BLU-L', 'Resolved new SKU: SHIRT-OXF-BLU-L');
  assert(modTurn2.order_summary?.line_items[0].quantity === 2, 'Preserved quantity = 2 across size modification');
  assert(modTurn2.order_summary?.total_amount === 2998, 'Total amount remains ₹2,998 for 2x Size L');

  // Scenario 3D: Pre-Purchase FAQ Question & Re-Display Rule
  console.log('\n[Scenario 3D] FAQ Query with Re-Display Rule (AWAITING_CONFIRMATION stays unchanged)');
  const sessionFaqId = `test-faq-${Date.now()}`;
  await setupAwaitingConfirmationSession(sessionFaqId);

  console.log('\nUser: "what\'s your return policy?"');
  const faqTurn = await processUserTurn(sessionFaqId, "what's your return policy?");
  console.log(`Agent State: ${faqTurn.state}`);
  console.log(`Agent Reply: \n${faqTurn.agent_message}\n`);
  assert(faqTurn.state === 'AWAITING_CONFIRMATION', 'State remains strictly AWAITING_CONFIRMATION after FAQ query');
  assert(
    faqTurn.agent_message.toLowerCase().includes('return') && faqTurn.agent_message.includes('7-day'),
    'Agent message answers return policy FAQ'
  );
  assert(
    faqTurn.agent_message.includes('Order Confirmation') && faqTurn.agent_message.includes('₹1,499.00'),
    'Re-Display Rule: Confirmation summary card is re-displayed in full'
  );
  assert(
    faqTurn.agent_message.includes('Confirm this order?'),
    'Re-Display Rule: User is re-prompted to confirm or modify'
  );

  // Scenario 3E: Invariant Safety Check (Ambiguity followed by Affirmation)
  console.log('\n[Scenario 3E] Security Gate Invariant Check (Ambiguity does NOT confirm; explicit affirmation required)');
  console.log('\nUser: "hmm not sure yet"');
  const ambigTurn = await processUserTurn(sessionFaqId, 'hmm not sure yet');
  assert(ambigTurn.state === 'AWAITING_CONFIRMATION', 'Vague input stays in AWAITING_CONFIRMATION');
  assert(ambigTurn.transition_event.isMoneyGatedAction === false, 'isMoneyGatedAction is FALSE on ambiguous input');

  console.log('\nUser: "Yes, go ahead and confirm"');
  const finalAffirmTurn = await processUserTurn(sessionFaqId, 'Yes, go ahead and confirm');
  assert(
    finalAffirmTurn.state === 'PAYING' || finalAffirmTurn.state === 'CONFIRMED',
    'Explicit affirmative confirmation finally unlocks gate -> reaches PAYING'
  );
  assert(finalAffirmTurn.transition_event.isMoneyGatedAction === true, 'isMoneyGatedAction is TRUE only after affirmative yes');

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

runConfirmationLayerTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
