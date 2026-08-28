import { ExtractedIntent, ConversationMessage } from './types';
import { CatalogMatchResult } from './catalogMatcher';
import { LeanProduct, LeanVariant } from '../db/repositories/catalogRepository';

export { ConversationMessage, ExtractedIntent, LeanProduct, LeanVariant };

export type AgentState =
  | 'IDLE'
  | 'PARSING'
  | 'CLARIFYING'
  | 'RESOLVED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PAYING'
  | 'COMPLETED'
  | 'FAILED';

export interface LineItem {
  product_name: string;
  variant_desc: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ConfirmationSummary {
  summary_text: string;
  line_items: LineItem[];
  total_amount: number;
  currency: string;
  productId?: string;
  productName?: string;
  variantId?: string;
  variantName?: string;
  sku?: string;
  size?: string | null;
  color?: string | null;
  quantity?: number;
  unitPricePaise?: number;
  unitPriceFormatted?: string;
  totalPaise?: number;
  totalFormatted?: string;
}

export type OrderSummaryDraft = ConfirmationSummary;

export type ConfirmationDecision = 'affirm' | 'reject' | 'modify' | 'unclear';

export interface ConfirmationModifications {
  size?: string | null;
  color?: string | null;
  quantity?: number | null;
  item_query?: string | null;
}

export interface ParsedConfirmationResult {
  decision: ConfirmationDecision;
  confidence: number;
  raw_message: string;
  modifications?: ConfirmationModifications;
  detected_faq_topic?: string | null;
  faq_answer?: string | null;
}

export interface RazorpayOrderResult {
  success: boolean;
  razorpay_order_id?: string;
  payment_link_url?: string;
  amount?: number; // in paise
  currency?: string;
  status?: string;
  receipt?: string;
  notes?: Record<string, any>;
  error?: string;
  statusCode?: number;
  isTransient?: boolean;
}

export interface StateTransitionEvent {
  sessionId: string;
  from_state: AgentState;
  to_state: AgentState;
  trigger: string;
  timestamp: string;
  reason: string;
  isMoneyGatedAction: boolean;
  metadata?: Record<string, any>;
}

export interface AgentSession {
  sessionId: string;
  customerIdentifier?: string | null;
  current_state: AgentState;
  current_intent: ExtractedIntent | null;
  current_match_result: CatalogMatchResult | null;
  pending_clarification: string | null;
  active_order_summary: ConfirmationSummary | null;
  active_confirmation_summary?: ConfirmationSummary | null;
  active_razorpay_order?: RazorpayOrderResult | null;
  conversation_history: ConversationMessage[];
  created_at: string;
  updated_at: string;
  audit_events: StateTransitionEvent[];
}

export type AgentEvent =
  | { type: 'USER_MESSAGE'; payload: { text: string } }
  | { type: 'INTENT_PARSED'; payload: { intent: ExtractedIntent; matchResult: CatalogMatchResult } }
  | { type: 'PROMPT_CONFIRMATION'; payload?: { summary: ConfirmationSummary } }
  | { type: 'CONFIRM_AFFIRMATIVE'; payload?: { userNotes?: string } }
  | { type: 'CONFIRM_NEGATIVE'; payload?: { reason?: string } }
  | { type: 'CONFIRM_REPROMPT'; payload?: { faqAnswer?: string; reason?: string } }
  | { type: 'REQUEST_MODIFICATION'; payload?: { modifications?: ConfirmationModifications; rawText?: string } }
  | {
      type: 'INITIATE_PAYMENT';
      payload?: {
        razorpayOrderId?: string;
        paymentLinkUrl?: string;
        amountPaise?: number;
        formattedAmount?: string;
        notes?: Record<string, any>;
      };
    }
  | { type: 'PAYMENT_SUCCESS'; payload: { paymentId: string; razorpayOrderId?: string } }
  | { type: 'PAYMENT_FAILED'; payload: { error: string; statusCode?: number } }
  | { type: 'CANCEL_RESET'; payload?: { reason?: string } };

export interface AgentTurnResponse {
  sessionId: string;
  state: AgentState;
  agent_message: string;
  order_summary: ConfirmationSummary | null;
  confirmation_summary?: ConfirmationSummary | null;
  razorpay_order?: RazorpayOrderResult | null;
  payment_link_url?: string | null;
  match_result: CatalogMatchResult | null;
  transition_event: StateTransitionEvent;
}

