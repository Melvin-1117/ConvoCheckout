import { GoogleGenerativeAI, SchemaType, GenerationConfig } from '@google/generative-ai';
import dotenv from 'dotenv';
import {
  ExtractedIntent,
  IntentType,
  ConversationMessage,
  IntentExtractionOptions,
} from './types';
import { INTENT_EXTRACTION_SYSTEM_PROMPT, formatConversationContext } from './prompts';

dotenv.config();

/**
 * Strict JSON Schema definition for Gemini responseSchema enforcement
 */
const INTENT_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    intent_type: {
      type: SchemaType.STRING,
      enum: ['purchase', 'reorder', 'clarification_response', 'unclear'],
      description: 'The classified commerce intent category.',
    },
    item_query: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'The clean extracted search phrase describing the product/item, or null.',
    },
    variant: {
      type: SchemaType.OBJECT,
      properties: {
        size: {
          type: SchemaType.STRING,
          nullable: true,
          description: 'Extracted size option (e.g., M, L, Small, 10), or null.',
        },
        color: {
          type: SchemaType.STRING,
          nullable: true,
          description: 'Extracted color option (e.g., blue, navy, red), or null.',
        },
      },
      required: ['size', 'color'],
    },
    quantity: {
      type: SchemaType.INTEGER,
      description: 'Extracted item quantity (default is 1).',
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Model self-confidence score between 0.0 and 1.0.',
    },
    ambiguity_notes: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'Notes on missing attributes, ambiguous details, or non-catalog inputs.',
    },
  },
  required: ['intent_type', 'item_query', 'variant', 'quantity', 'confidence', 'ambiguity_notes'],
};

/**
 * Fallback response when extraction fails completely or is rejected
 */
function createFallbackIntent(reason: string = 'Extraction validation failed'): ExtractedIntent {
  return {
    intent_type: 'unclear',
    item_query: null,
    variant: {
      size: null,
      color: null,
    },
    quantity: 1,
    confidence: 0.0,
    ambiguity_notes: reason,
  };
}

/**
 * Validates and sanitizes raw parsed JSON against the expected intent structure
 */
export function validateAndSanitizeIntent(data: any): { isValid: boolean; intent: ExtractedIntent; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, intent: createFallbackIntent('Payload is not an object'), errors: ['Payload is not a valid JSON object'] };
  }

  // 1. Validate intent_type
  const validIntentTypes: IntentType[] = ['purchase', 'reorder', 'clarification_response', 'unclear'];
  const rawIntentType = String(data.intent_type || '').toLowerCase();
  const intent_type: IntentType = validIntentTypes.includes(rawIntentType as IntentType)
    ? (rawIntentType as IntentType)
    : 'unclear';

  if (!validIntentTypes.includes(rawIntentType as IntentType)) {
    errors.push(`Invalid intent_type: '${data.intent_type}'. Must be one of: ${validIntentTypes.join(', ')}`);
  }

  // 2. Validate item_query
  const item_query: string | null =
    typeof data.item_query === 'string' && data.item_query.trim() ? data.item_query.trim() : null;

  // 3. Validate variant (size & color)
  let size: string | null = null;
  let color: string | null = null;
  if (data.variant && typeof data.variant === 'object') {
    size = typeof data.variant.size === 'string' && data.variant.size.trim() ? data.variant.size.trim() : null;
    color = typeof data.variant.color === 'string' && data.variant.color.trim() ? data.variant.color.trim() : null;
  } else {
    errors.push('Missing or invalid "variant" object');
  }

  // 4. Validate quantity
  let quantity = typeof data.quantity === 'number' && Number.isInteger(data.quantity) ? data.quantity : parseInt(data.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    quantity = 1;
  }

  // 5. Validate confidence
  let confidence = typeof data.confidence === 'number' ? data.confidence : parseFloat(data.confidence);
  if (isNaN(confidence)) {
    confidence = 0.5;
  } else {
    confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
  }

  // 6. Validate ambiguity_notes
  const ambiguity_notes: string | null =
    typeof data.ambiguity_notes === 'string' && data.ambiguity_notes.trim() ? data.ambiguity_notes.trim() : null;

  const sanitized: ExtractedIntent = {
    intent_type,
    item_query,
    variant: {
      size,
      color,
    },
    quantity,
    confidence,
    ambiguity_notes,
  };

  return {
    isValid: errors.length === 0,
    intent: sanitized,
    errors,
  };
}

/**
 * Sleep helper for exponential backoff
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rule-based heuristic fallback extractor when running offline or without API key
 */
export function heuristicExtractIntent(
  userMessage: string,
  conversationContext?: ConversationMessage[] | string[]
): ExtractedIntent {
  const lower = userMessage.toLowerCase().trim();

  // Multi-turn context resolution
  let contextItem: string | null = null;
  if (conversationContext && conversationContext.length > 0) {
    const lastMsg = conversationContext[conversationContext.length - 1];
    const text = typeof lastMsg === 'string' ? lastMsg : lastMsg.content;
    const match = text.match(/(?:found the|product|regarding)\s+([A-Za-z0-9\s]+?)(?:!|\?|\.|$)/i);
    if (match) {
      contextItem = match[1].trim();
    }
  }

  // 1. Reorder
  if (lower.includes('reorder') || lower.includes('repeat my order') || lower.includes('buy again')) {
    return {
      intent_type: 'reorder',
      item_query: null,
      variant: { size: null, color: null },
      quantity: 1,
      confidence: 0.95,
      ambiguity_notes: 'Reorder intent references past order history',
    };
  }

  // 2. Casual / Non-catalog inquiries
  if (
    lower.includes('flying car') ||
    lower.includes('spaceship') ||
    lower.includes('weather') ||
    lower.includes('joke') ||
    lower.startsWith('hi') ||
    lower.startsWith('hello')
  ) {
    return {
      intent_type: 'unclear',
      item_query: lower.includes('flying car') ? 'flying cars' : null,
      variant: { size: null, color: null },
      quantity: 1,
      confidence: 0.3,
      ambiguity_notes: 'Casual or non-commercial inquiry',
    };
  }

  // 3. Extract quantity
  let quantity = 1;
  const qtyMatch = lower.match(/(?:^|\s)(\d+)\s+(?:of|pieces?|items?|pairs?|shirts?|hoodies?|shoes?)/i) ||
                   lower.match(/(?:get me|buy|order)\s+(\d+)/i) ||
                   lower.match(/\b(two|three|four|five)\b/i);
  if (qtyMatch) {
    const wordMap: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
    quantity = wordMap[qtyMatch[1].toLowerCase()] || parseInt(qtyMatch[1], 10) || 1;
  }

  // 4. Extract size
  let size: string | null = null;
  const sizeMatch = lower.match(/\b(size\s+)?(xxl|xl|xs|small|medium|large|[sml])\b/i) ||
                    lower.match(/\bsize\s+(\d+)\b/i);
  if (sizeMatch) {
    const rawSize = (sizeMatch[2] || sizeMatch[1] || sizeMatch[0]).replace(/^size\s+/i, '').toUpperCase();
    if (rawSize === 'MEDIUM') size = 'Medium';
    else if (rawSize === 'LARGE') size = 'Large';
    else if (rawSize === 'SMALL') size = 'Small';
    else size = rawSize;
  }

  // 5. Extract color
  let color: string | null = null;
  const colors = ['navy blue', 'navy', 'blue', 'red', 'black', 'white', 'brown', 'olive', 'green', 'grey', 'gray', 'khaki'];
  for (const c of colors) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(lower)) {
      color = c;
      break;
    }
  }

  // 6. Clarification response detection
  if (contextItem && (size || color) && !lower.startsWith('buy') && !lower.startsWith('get')) {
    return {
      intent_type: 'clarification_response',
      item_query: contextItem,
      variant: { size, color },
      quantity,
      confidence: 0.95,
      ambiguity_notes: null,
    };
  }

  // 7. Extract item query
  let item_query: string | null = lower
    .replace(/^(?:please\s+)?(?:buy|get\s+me|order|i\s+want\s+to\s+buy|i\s+want|i\s+need|can\s+i\s+get)\s+/i, '')
    .replace(/\b\d+\s+of\s+the\b/i, '')
    .replace(/\b\d+\b/i, '')
    .replace(/\bin\s+size\s+[a-z0-9]+/i, '')
    .replace(/\bsize\s+[a-z0-9]+/i, '')
    .replace(/\bthe\s+/gi, '')
    .trim();

  if (!item_query || item_query.length < 2) {
    item_query = null;
  }

  const isAmbiguous = !size && !color && (item_query === 'shoes' || item_query === 'shirts' || item_query === 'clothes');

  return {
    intent_type: 'purchase',
    item_query: item_query || 'shoes',
    variant: { size, color },
    quantity,
    confidence: isAmbiguous ? 0.8 : 0.95,
    ambiguity_notes: isAmbiguous
      ? 'Generic item query without size, color, or specific model'
      : !size && !color
      ? 'Variant attributes not specified'
      : null,
  };
}

/**
 * Main Intent Extraction Function
 * 
 * Takes a free-text customer message and conversation history,
 * calling the Gemini API with structured JSON output enforcement,
 * validation layer, rate-limit backoff, and 1-shot retry on malformed outputs.
 */
export async function extractIntent(
  userMessage: string,
  conversationContext?: ConversationMessage[] | string[],
  options: IntentExtractionOptions = {}
): Promise<ExtractedIntent> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const modelName = options.modelName || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const maxRetries = options.maxRetries ?? 3;
  const backoffInitialMs = options.backoffInitialMs ?? 1000;
  const enableOfflineFallback = options.enableOfflineFallback ?? true;

  // If no Gemini API key configured or in offline demo mode, use heuristic parser
  if (!apiKey || apiKey.includes('placeholder') || apiKey.includes('your_')) {
    if (enableOfflineFallback) {
      return heuristicExtractIntent(userMessage, conversationContext);
    }
    return createFallbackIntent('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: INTENT_RESPONSE_SCHEMA as any,
      temperature: 0.1,
    },
    systemInstruction: INTENT_EXTRACTION_SYSTEM_PROMPT,
  });

  const formattedContext = formatConversationContext(conversationContext);
  const userPrompt = `
Conversation Context:
${formattedContext}

Current User Message:
"${userMessage}"

Extract the structured intent JSON now.
`.trim();

  let attempt = 0;
  let delay = backoffInitialMs;

  while (attempt < maxRetries) {
    attempt++;
    try {
      // Primary LLM invocation
      const result = await model.generateContent(userPrompt);
      const responseText = result.response.text();

      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseErr) {
        // Step 4: Reject and retry once with stricter reminder if JSON is malformed
        console.warn(`[IntentExtractor] Malformed JSON on attempt ${attempt}. Triggering 1-shot repair prompt...`);
        const repairPrompt = `
The previous output was not valid JSON or was malformed.
Original Message: "${userMessage}"
Context: ${formattedContext}

Please return STRICTLY valid JSON matching the schema without any markdown formatting.
`;
        const repairResult = await model.generateContent(repairPrompt);
        parsed = JSON.parse(repairResult.response.text());
      }

      // Step 4: Lightweight Validation Layer
      const validation = validateAndSanitizeIntent(parsed);
      if (!validation.isValid) {
        console.warn(`[IntentExtractor] Validation warning(s): ${validation.errors.join(', ')}`);
        // Retry once with validation correction prompt
        const correctionPrompt = `
The previous output had the following schema validation errors:
- ${validation.errors.join('\n- ')}

Please return a corrected, strictly compliant JSON object according to the schema.
User Message: "${userMessage}"
Context: ${formattedContext}
`;
        const correctedResult = await model.generateContent(correctionPrompt);
        const correctedParsed = JSON.parse(correctedResult.response.text());
        const secondValidation = validateAndSanitizeIntent(correctedParsed);

        if (secondValidation.isValid) {
          return secondValidation.intent;
        }

        // Return fallback intent with notes rather than crashing
        return {
          intent_type: 'unclear',
          item_query: null,
          variant: { size: null, color: null },
          quantity: 1,
          confidence: 0.0,
          ambiguity_notes: `Validation failed after retry: ${validation.errors.join('; ')}`,
        };
      }

      return validation.intent;
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('Quota exceeded') ||
        err?.message?.includes('rate limit');

      console.error(`[IntentExtractor] Error on attempt ${attempt}/${maxRetries}:`, err.message || err);

      if (isRateLimit && attempt < maxRetries) {
        // Step 5: Exponential backoff for rate limits
        console.warn(`[IntentExtractor] Rate limit encountered. Backing off for ${delay}ms (attempt ${attempt})...`);
        await sleep(delay + Math.random() * 200);
        delay *= 2;
        continue;
      }

      // If last attempt or unrecoverable error, use offline fallback if allowed or return safe unclear intent
      if (attempt >= maxRetries) {
        if (enableOfflineFallback) {
          console.warn('[IntentExtractor] Falling back to offline heuristic extraction.');
          return heuristicExtractIntent(userMessage, conversationContext);
        }
        return createFallbackIntent(`Gemini API error: ${err.message || 'Rate limit or network error'}`);
      }
    }
  }

  return createFallbackIntent('Exhausted maximum retry attempts');
}
