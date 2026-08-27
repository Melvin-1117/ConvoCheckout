import dotenv from 'dotenv';
import { extractIntent } from '../src/agent/intentExtractor';
import { ConversationMessage } from '../src/agent/types';

dotenv.config();

interface TestCase {
  name: string;
  category: string;
  message: string;
  context?: ConversationMessage[];
  expected: {
    intent_type: string;
    item_query_contains?: string | null;
    quantity?: number;
    size?: string | null;
    color?: string | null;
  };
}

const testCases: TestCase[] = [
  {
    name: '1. Clear purchase with size & color',
    category: 'Direct Purchase',
    message: 'buy the blue shirt in size M',
    expected: {
      intent_type: 'purchase',
      item_query_contains: 'blue shirt',
      quantity: 1,
      size: 'M',
      color: 'blue',
    },
  },
  {
    name: '2. Quantity purchase with color',
    category: 'Multi-Quantity Purchase',
    message: 'get me 2 of the red hoodie',
    expected: {
      intent_type: 'purchase',
      item_query_contains: 'red hoodie',
      quantity: 2,
      color: 'red',
    },
  },
  {
    name: '3. Ambiguous item without variant attributes',
    category: 'Ambiguous Query',
    message: 'I want some shoes',
    expected: {
      intent_type: 'purchase',
      item_query_contains: 'shoes',
      quantity: 1,
    },
  },
  {
    name: '4. Casual / out-of-catalog query',
    category: 'Unsupported / Off-topic',
    message: 'do you sell flying cars?',
    expected: {
      intent_type: 'unclear',
    },
  },
  {
    name: '5. Clarification reply with conversation context',
    category: 'Multi-turn Clarification',
    message: 'Medium please, in navy blue',
    context: [
      {
        role: 'agent',
        content: 'We found the Classic Oxford Cotton Shirt! Which size and color would you prefer?',
      },
    ],
    expected: {
      intent_type: 'clarification_response',
      item_query_contains: 'Classic Oxford Cotton Shirt',
      size: 'Medium',
      color: 'navy blue',
    },
  },
];

async function runIntentTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Gemini Intent Extraction Verification');
  console.log('================================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && !apiKey.includes('placeholder') && !apiKey.includes('your_')) {
    console.log(`📡 Mode: LIVE GEMINI API (Model: ${process.env.GEMINI_MODEL || 'gemini-1.5-flash'})\n`);
  } else {
    console.log(`⚡ Mode: OFFLINE HEURISTIC / MOCK PARSER (No active GEMINI_API_KEY set)\n`);
  }

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`[Test ${i + 1}/5] ${tc.name}`);
    console.log(`Category: ${tc.category}`);
    if (tc.context) {
      console.log(`Context : ${JSON.stringify(tc.context.map((c) => `[${c.role}]: ${c.content}`))}`);
    }
    console.log(`Message : "${tc.message}"`);

    try {
      const result = await extractIntent(tc.message, tc.context);
      console.log('\nExtracted Intent JSON:');
      console.log(JSON.stringify(result, null, 2));

      // Assertions
      const intentMatches = result.intent_type === tc.expected.intent_type;
      const quantityMatches = tc.expected.quantity === undefined || result.quantity === tc.expected.quantity;
      const sizeMatches =
        tc.expected.size === undefined ||
        (tc.expected.size === null && result.variant.size === null) ||
        (tc.expected.size !== null &&
          typeof result.variant.size === 'string' &&
          result.variant.size.toLowerCase() === tc.expected.size.toLowerCase());
      const colorMatches =
        tc.expected.color === undefined ||
        (tc.expected.color === null && result.variant.color === null) ||
        (tc.expected.color !== null &&
          typeof result.variant.color === 'string' &&
          result.variant.color.toLowerCase() === tc.expected.color.toLowerCase());
      const queryMatches =
        tc.expected.item_query_contains === undefined ||
        (tc.expected.item_query_contains === null && result.item_query === null) ||
        (tc.expected.item_query_contains !== null &&
          typeof result.item_query === 'string' &&
          result.item_query.toLowerCase().includes(tc.expected.item_query_contains.toLowerCase()));

      const allPassed = intentMatches && quantityMatches && sizeMatches && colorMatches && queryMatches;

      if (allPassed) {
        console.log(`\n  ✓ Test Passed (Intent: ${result.intent_type}, Confidence: ${result.confidence})`);
        passed++;
      } else {
        console.error(`\n  ❌ Test Failed:`);
        if (!intentMatches) console.error(`    - Expected intent_type '${tc.expected.intent_type}', got '${result.intent_type}'`);
        if (!quantityMatches) console.error(`    - Expected quantity '${tc.expected.quantity}', got '${result.quantity}'`);
        if (!sizeMatches) console.error(`    - Expected size '${tc.expected.size}', got '${result.variant.size}'`);
        if (!colorMatches) console.error(`    - Expected color '${tc.expected.color}', got '${result.variant.color}'`);
        if (!queryMatches) console.error(`    - Expected item_query to contain '${tc.expected.item_query_contains}', got '${result.item_query}'`);
        failed++;
      }
    } catch (err: any) {
      console.error(`\n  ❌ Unexpected error in test:`, err.message || err);
      failed++;
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(` Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  // Demonstrate how intent output maps to the Catalog API endpoints
  console.log('----------------------------------------------------------------');
  console.log(' Pipeline Handoff: How Extracted Intent Feeds Catalog APIs');
  console.log('----------------------------------------------------------------');
  console.log('1. Intent: { item_query: "blue shirt" }');
  console.log('   ↳ Calls: GET /api/products/search?q=blue+shirt');
  console.log('');
  console.log('2. Intent: { variant: { size: "M", color: "blue" } }');
  console.log('   ↳ Calls: GET /api/products/:id/variants -> matches SKU "SHIRT-OXF-BLU-M"');
  console.log('');
  console.log('3. Intent: { quantity: 2 }');
  console.log('   ↳ Validates stock via GET /api/variants/:variantId (checks stock_quantity >= 2)');
  console.log('================================================================\n');
}

runIntentTests();
