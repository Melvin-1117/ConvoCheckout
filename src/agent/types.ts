/**
 * ConvoCheckout: Agent Intent Extraction Types
 * Track: AI Growth & Agentic Commerce (Razorpay Buildathon 2026)
 */

export type IntentType = 'purchase' | 'reorder' | 'clarification_response' | 'unclear';

export interface VariantIntent {
  size: string | null;
  color: string | null;
}

export interface ExtractedIntent {
  intent_type: IntentType;
  item_query: string | null;
  variant: VariantIntent;
  quantity: number;
  confidence: number;
  ambiguity_notes: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'agent' | 'model' | 'system';
  content: string;
  timestamp?: string;
}

export interface IntentExtractionOptions {
  apiKey?: string;
  modelName?: string;
  maxRetries?: number;
  backoffInitialMs?: number;
  enableOfflineFallback?: boolean;
}
