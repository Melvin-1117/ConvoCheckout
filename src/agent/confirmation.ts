import {
  ConfirmationSummary,
  ParsedConfirmationResult,
  ConfirmationModifications,
  ExtractedIntent,
} from './stateTypes';
import { LeanProduct, LeanVariant } from '../db/repositories/catalogRepository';

export interface StaticFaqEntry {
  topic: string;
  keywords: RegExp;
  answer: string;
}

export const STATIC_FAQ_KNOWLEDGE_BASE: StaticFaqEntry[] = [
  {
    topic: 'return_policy',
    keywords: /\b(return|refund|exchange|return policy|returns|money back)\b/i,
    answer:
      'We offer a 7-day hassle-free return and exchange policy on all unworn items with original tags intact.',
  },
  {
    topic: 'shipping_delivery',
    keywords: /\b(shipping|delivery|deliver|how long|dispatch|arrive|tracking|courier|free shipping)\b/i,
    answer:
      'Standard delivery takes 2–4 business days across India. Express shipping is complimentary on all orders above ₹999.',
  },
  {
    topic: 'payment_methods',
    keywords: /\b(payment method|payment options|payment modes|cod|cash on delivery|upi|gpay|phonepe|card|credit card|debit card|razorpay|netbanking)\b/i,
    answer:
      'We accept UPI (GPay, PhonePe, Paytm), all major Credit/Debit Cards, NetBanking, and Razorpay Wallets via secure 256-bit encryption.',
  },
  {
    topic: 'authenticity_warranty',
    keywords: /\b(warranty|guarantee|genuine|authentic|original|quality)\b/i,
    answer:
      'All products in our store are 100% genuine, directly sourced, and covered by a standard merchant quality guarantee.',
  },
];

/**
 * Normalizes price values from paise or rupees to standard INR rupees and paise.
 */
function normalizePricing(rawPrice: number) {
  const num = Number(rawPrice) || 0;
  // If price is stored in paise (e.g. 149900 paise = ₹1499), convert to INR rupees
  const unitPriceRupees = num >= 10000 ? Math.round(num / 100) : num;
  const unitPricePaise = num >= 10000 ? num : Math.round(num * 100);
  return { unitPriceRupees, unitPricePaise };
}

/**
 * 1. Generates a clean, complete, and unambiguous human-readable Confirmation Summary object.
 * This is rendered in the chat UI as the confirmation card and logged in the audit trail.
 */
export function generateConfirmationSummary(
  matched_product: LeanProduct | { id?: string; name: string; basePrice?: number },
  matched_variant: LeanVariant | {
    id?: string;
    sku?: string;
    name?: string;
    size?: string | null;
    color?: string | null;
    price: number;
  },
  quantity: number = 1
): ConfirmationSummary {
  const qty = quantity > 0 ? quantity : 1;
  const { unitPriceRupees, unitPricePaise } = normalizePricing(matched_variant.price);
  const totalRupees = unitPriceRupees * qty;
  const totalPaise = unitPricePaise * qty;

  // Build descriptive variant string (e.g. "Size M, Navy Blue" or variant name)
  const variantParts: string[] = [];
  if (matched_variant.size) {
    variantParts.push(`Size ${matched_variant.size}`);
  }
  if (matched_variant.color) {
    variantParts.push(matched_variant.color);
  }

  const variantDesc =
    variantParts.length > 0
      ? variantParts.join(', ')
      : matched_variant.name || 'Standard';

  const formatINR = (val: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);

  const formattedUnit = formatINR(unitPriceRupees);
  const formattedTotal = formatINR(totalRupees);

  // Human-readable summary text requested by PRD & Step 6
  const summaryText = `${qty}x ${matched_product.name} (${variantDesc}) — ${formattedTotal}. Confirm this order?`;

  return {
    summary_text: summaryText,
    line_items: [
      {
        product_name: matched_product.name,
        variant_desc: variantDesc,
        quantity: qty,
        unit_price: unitPriceRupees,
        subtotal: totalRupees,
      },
    ],
    total_amount: totalRupees,
    currency: 'INR',
    productId: matched_product.id,
    productName: matched_product.name,
    variantId: matched_variant.id,
    variantName: matched_variant.name,
    sku: matched_variant.sku,
    size: matched_variant.size || null,
    color: matched_variant.color || null,
    quantity: qty,
    unitPricePaise,
    unitPriceFormatted: formattedUnit,
    totalPaise,
    totalFormatted: formattedTotal,
  };
}

/**
 * Helper to extract modification parameters from text (size, color, quantity, item query)
 */
export function extractModificationsFromText(text: string): ConfirmationModifications {
  const mods: ConfirmationModifications = {};
  const lower = text.toLowerCase();

  // 1. Quantity extraction (e.g. "make it 2", "make that 3", "2 instead", "quantity 4", "buy 2")
  const qtyMatch =
    lower.match(/\b(?:make\s+it|make\s+that|quantity\s*(?:to)?|give\s+me|want|order|buy|get)\s+(\d+)\b/i) ||
    lower.match(/\b(\d+)\s*(?:instead|items?|pieces?|pairs?|shirts?|hoodies?|shoes?|of\s+them)\b/i) ||
    lower.match(/^(\d+)$/);
  if (qtyMatch) {
    const parsedQty = parseInt(qtyMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty > 0) {
      mods.quantity = parsedQty;
    }
  }

  // 2. Size extraction (e.g. "change size to L", "size XL instead", "make it size 32", "size S")
  const sizeMatch =
    lower.match(/\b(?:change|switch|make|want|get|in)?\s*(?:the\s*)?size\s*(?:to\s*)?([sml]|xl|xxl|2xl|3xl|\d{2})\b/i) ||
    lower.match(/\bsize\s+([sml]|xl|xxl|2xl|3xl|\d{2})\b/i) ||
    lower.match(/\b([sml]|xl|xxl|2xl|3xl|\d{2})\s+instead\b/i) ||
    lower.match(/\b(small|medium|large|extra large)\s*(?:size|instead)?\b/i);

  if (sizeMatch) {
    const rawSize = sizeMatch[1].toUpperCase();
    if (rawSize === 'SMALL') mods.size = 'S';
    else if (rawSize === 'MEDIUM') mods.size = 'M';
    else if (rawSize === 'LARGE') mods.size = 'L';
    else if (rawSize === 'EXTRA LARGE') mods.size = 'XL';
    else mods.size = rawSize;
  }

  // 3. Color extraction (e.g. "actually I want the red one", "in navy blue", "switch to white")
  const colorList = [
    'navy blue',
    'classic white',
    'jet black',
    'sage green',
    'washed charcoal',
    'desert khaki',
    'vintage brown',
    'midnight blue',
    'pure white',
    'stealth black',
    'matte black',
    'arctic silver',
    'nordic blue',
    'onyx black',
    'tortoise shell',
    'heather grey',
    'obsidian black',
    'tan brown',
    'navy',
    'white',
    'black',
    'blue',
    'green',
    'brown',
    'grey',
    'gray',
    'khaki',
    'red',
  ];

  for (const color of colorList) {
    const colorRegex = new RegExp(
      `\\b(?:change|switch|make|want|get|in|to|the)?\\s*(?:color\\s*(?:to\\s*)?)?\\b(${color})\\b(?:\\s+one)?(?:\\s+instead)?`,
      'i'
    );
    if (colorRegex.test(lower) && !lower.startsWith('is ') && !lower.startsWith('what ')) {
      // Avoid matching if user asks "is it navy?"
      mods.color = color.charAt(0).toUpperCase() + color.slice(1);
      break;
    }
  }

  return mods;
}

/**
 * 2. Parses user confirmation response using a fast, deterministic rule-based classifier.
 * Categorizes response into:
 *  - "affirm"  (yes, confirm, proceed, sounds good, do it)
 *  - "reject"  (no, cancel, don't, stop)
 *  - "modify"  (change size to L, make it 2 instead, actually red)
 *  - "unclear" (questions, ambiguity, unclassified — strictly reprompt, NEVER implicit affirm)
 */
export function parseConfirmationResponse(userMessage: string): ParsedConfirmationResult {
  const raw = userMessage || '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.replace(/[!.,?]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Check for Static FAQs / Questions first
  for (const faq of STATIC_FAQ_KNOWLEDGE_BASE) {
    if (faq.keywords.test(clean)) {
      return {
        decision: 'unclear',
        confidence: 0.95,
        raw_message: raw,
        detected_faq_topic: faq.topic,
        faq_answer: faq.answer,
      };
    }
  }

  // 2. Check for Modification intent
  // Keywords indicating a change request
  const modificationMarkers = [
    'change',
    'switch',
    'modify',
    'instead',
    'actually',
    'make it',
    'make that',
    'different',
    'another',
    'can i get',
    'can you make',
    'i want',
    'i need',
    'add more',
    'update',
    'replace',
  ];

  const hasModificationMarker = modificationMarkers.some((marker) =>
    clean.includes(marker)
  );

  const extractedMods = extractModificationsFromText(raw);
  const hasExtractedMod = Object.keys(extractedMods).length > 0;

  if (hasModificationMarker || hasExtractedMod) {
    // Ensure it's not a pure negation like "don't change anything" or "no changes"
    if (
      clean.includes("don't change") ||
      clean.includes('no changes') ||
      clean.includes('keep it')
    ) {
      return {
        decision: 'affirm',
        confidence: 0.9,
        raw_message: raw,
      };
    }

    return {
      decision: 'modify',
      confidence: 0.92,
      raw_message: raw,
      modifications: extractedMods,
    };
  }

  // 3. Check for Clean Reject
  // Rejection keywords
  const rejectPatterns = [
    /^no\b/,
    /^cancel\b/,
    /^stop\b/,
    /^dont\b/,
    /^don't\b/,
    /^abort\b/,
    /^nope\b/,
    /^nevermind\b/,
    /^reject\b/,
    /^not now\b/,
    /^discard\b/,
    /^no thanks\b/,
    /^dont buy\b/,
    /^no cancel\b/,
    /^cancel order\b/,
    /^forget it\b/,
    /^nah\b/,
    /^cancel it\b/,
    /^drop this\b/,
    /^leave it\b/,
  ];

  const isExplicitReject = rejectPatterns.some((p) => p.test(clean));
  if (isExplicitReject) {
    // Check if it's "no problem" (which is an affirmative idiom)
    if (clean.includes('no problem') || clean.includes('no worries')) {
      return {
        decision: 'affirm',
        confidence: 0.88,
        raw_message: raw,
      };
    }

    return {
      decision: 'reject',
      confidence: 0.98,
      raw_message: raw,
    };
  }

  // 4. Check for Clean Affirm
  // Affirmative keywords and exact phrases
  const affirmativePhrases = [
    'yes',
    'confirm',
    'proceed',
    'ok',
    'okay',
    'sure',
    'yep',
    'yeah',
    'go ahead',
    'place order',
    'buy it',
    'pay now',
    'continue',
    'correct',
    'looks good',
    'sounds good',
    'do it',
    'order it',
    'accept',
    'affirmative',
    'please proceed',
    'yes please',
    'y',
    'yes confirm',
    'yes go ahead',
    'sure do it',
    'yup',
    'aye',
    'lets do it',
    "let's do it",
    'go for it',
    'yes do it',
    'yes buy it',
    'please order',
    'looks great',
    'fine with me',
    'all good',
    'confirmed',
    'ready to pay',
  ];

  const isExplicitAffirm = affirmativePhrases.some(
    (phrase) => clean === phrase || clean.startsWith(`${phrase} `) || clean.endsWith(` ${phrase}`)
  );

  if (isExplicitAffirm) {
    // Check for negation prefixes e.g. "not ok", "not yes"
    if (clean.startsWith('not ') || clean.includes(" don't ")) {
      return {
        decision: 'reject',
        confidence: 0.9,
        raw_message: raw,
      };
    }

    return {
      decision: 'affirm',
      confidence: 0.98,
      raw_message: raw,
    };
  }

  // 5. Default Fallback: "unclear"
  // IMPORTANT: Ambiguity NEVER defaults to affirm
  return {
    decision: 'unclear',
    confidence: 0.95,
    raw_message: raw,
    faq_answer: null,
  };
}

/**
 * 4. Helper to format the complete Confirmation Card response with Re-Display Rule
 * If an FAQ answer is provided, it answers the question first, then re-displays the full card.
 */
export function formatConfirmationCardWithPrompt(
  summary: ConfirmationSummary,
  prefixMessage?: string | null
): string {
  const line = summary.line_items?.[0];
  const itemDesc = line ? `${line.quantity}x ${line.product_name} (${line.variant_desc})` : summary.productName || 'Your Item';
  const total = summary.totalFormatted || `₹${summary.total_amount}`;

  const header = prefixMessage ? `${prefixMessage}\n\n` : '';

  return (
    `${header}🛍️ **Order Confirmation**\n` +
    `• **Item:** ${summary.productName || line?.product_name || 'Selected Item'}\n` +
    `• **Variant:** ${line?.variant_desc || summary.variantName || 'Standard'} (SKU: ${summary.sku || 'N/A'})\n` +
    `• **Quantity:** ${line?.quantity || 1}\n` +
    `• **Unit Price:** ${summary.unitPriceFormatted || `₹${summary.total_amount}`}\n` +
    `• **Total Amount:** **${total}** (incl. taxes)\n\n` +
    `👉 **Confirm this order?** Reply **"Yes"** to proceed to payment, **"No"** to cancel, or specify changes (e.g. "change size to L", "make it 2").`
  );
}

/**
 * Merges modification parameters into the existing extracted intent object.
 */
export function mergeModificationIntoIntent(
  existingIntent: ExtractedIntent | null,
  modifications?: ConfirmationModifications
): ExtractedIntent {
  const baseIntent: ExtractedIntent = existingIntent
    ? JSON.parse(JSON.stringify(existingIntent))
    : {
        intent_type: 'purchase',
        item_query: null,
        variant: { size: null, color: null },
        quantity: 1,
        confidence: 0.95,
        ambiguity_notes: null,
      };

  if (!modifications) return baseIntent;

  if (modifications.quantity && modifications.quantity > 0) {
    baseIntent.quantity = modifications.quantity;
  }

  if (modifications.size) {
    baseIntent.variant.size = modifications.size;
  }

  if (modifications.color) {
    baseIntent.variant.color = modifications.color;
  }

  if (modifications.item_query) {
    baseIntent.item_query = modifications.item_query;
  }

  return baseIntent;
}
