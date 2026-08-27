import dotenv from 'dotenv';
import { matchIntentToCatalog, CatalogMatchResult } from '../src/agent/catalogMatcher';
import { ExtractedIntent } from '../src/agent/types';

dotenv.config();

interface TestCase {
  title: string;
  expectedStatus: 'exact' | 'ambiguous' | 'not_found' | 'out_of_stock';
  intent: ExtractedIntent;
  description: string;
}

const testCases: TestCase[] = [
  // 1. EXACT MATCH
  {
    title: 'Outcome 1: Exact Match (Product & In-Stock Variant Resolved)',
    expectedStatus: 'exact',
    description: 'Specific in-stock variant requested with size and color.',
    intent: {
      intent_type: 'purchase',
      item_query: 'Classic Oxford Cotton Shirt',
      variant: {
        size: 'M',
        color: 'Navy Blue',
      },
      quantity: 1,
      confidence: 0.98,
      ambiguity_notes: null,
    },
  },

  // 2. AMBIGUOUS MATCH - MULTIPLE PRODUCTS
  {
    title: 'Outcome 2A: Ambiguous Match (Multiple Product Candidates)',
    expectedStatus: 'ambiguous',
    description: 'Generic term "shirt" matches multiple catalog products.',
    intent: {
      intent_type: 'purchase',
      item_query: 'shirt',
      variant: {
        size: null,
        color: null,
      },
      quantity: 1,
      confidence: 0.92,
      ambiguity_notes: 'Generic item query',
    },
  },

  // 3. AMBIGUOUS MATCH - MISSING VARIANT ATTRIBUTES
  {
    title: 'Outcome 2B: Ambiguous Match (Single Product, Missing Color Preference)',
    expectedStatus: 'ambiguous',
    description: 'Oxford Shirt in Size M is available in both Navy Blue and Classic White.',
    intent: {
      intent_type: 'purchase',
      item_query: 'Classic Oxford Cotton Shirt',
      variant: {
        size: 'M',
        color: null, // missing color
      },
      quantity: 1,
      confidence: 0.95,
      ambiguity_notes: 'Color not specified',
    },
  },

  // 4. AMBIGUOUS MATCH - LOW CONFIDENCE SAFETY GATE
  {
    title: 'Outcome 2C: Ambiguous Match (Model Confidence Below Safety Threshold < 0.50)',
    expectedStatus: 'ambiguous',
    description: 'Model self-confidence is low (0.35), triggering safety gate before guessing.',
    intent: {
      intent_type: 'purchase',
      item_query: 'blue shoes maybe',
      variant: {
        size: null,
        color: 'blue',
      },
      quantity: 1,
      confidence: 0.35, // below 0.50 threshold
      ambiguity_notes: 'Uncertain extraction',
    },
  },

  // 5. OUT OF STOCK (PRD FR-8 Edge Case)
  {
    title: 'Outcome 3: Out of Stock (SKU Inventory = 0)',
    expectedStatus: 'out_of_stock',
    description: 'Leather Bomber Jacket in Size L has stock_quantity: 0.',
    intent: {
      intent_type: 'purchase',
      item_query: 'Vintage Full-Grain Leather Bomber Jacket',
      variant: {
        size: 'L',
        color: 'Vintage Brown',
      },
      quantity: 1,
      confidence: 0.96,
      ambiguity_notes: null,
    },
  },

  // 6. NOT FOUND
  {
    title: 'Outcome 4: Not Found (Item Absent from Catalog)',
    expectedStatus: 'not_found',
    description: 'Casual or non-inventory search query yields 0 database matches.',
    intent: {
      intent_type: 'purchase',
      item_query: 'flying cars',
      variant: {
        size: null,
        color: null,
      },
      quantity: 1,
      confidence: 0.85,
      ambiguity_notes: 'Non-catalog inquiry',
    },
  },
];

async function runCatalogMatchingTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Catalog Intent Matching Layer Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`[Test ${i + 1}/${testCases.length}] ${tc.title}`);
    console.log(`Description: ${tc.description}`);
    console.log(`Input Intent:`, JSON.stringify(tc.intent, null, 2));

    try {
      const result: CatalogMatchResult = await matchIntentToCatalog(tc.intent);

      console.log('\nMatching Result:');
      console.log(JSON.stringify(result, null, 2));

      const statusMatches = result.match_status === tc.expectedStatus;
      const hasReason = typeof result.reason === 'string' && result.reason.length > 10;

      if (statusMatches && hasReason) {
        console.log(`\n  ✓ Test Passed (Status: ${result.match_status})`);
        console.log(`  Audit Rationale: "${result.reason}"`);
        passed++;
      } else {
        console.error(`\n  ❌ Test Failed:`);
        if (!statusMatches) console.error(`    - Expected status '${tc.expectedStatus}', got '${result.match_status}'`);
        if (!hasReason) console.error(`    - Missing or too short audit reason`);
        failed++;
      }
    } catch (err: any) {
      console.error(`\n  ❌ Unexpected error during test:`, err.message || err);
      failed++;
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(` Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');
}

runCatalogMatchingTests();
