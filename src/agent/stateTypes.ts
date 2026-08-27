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

export interface OrderSummaryDraft {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPricePaise: number;
  unitPriceFormatted: string;
  totalPaise: number;
  totalFormatted: string;
  currency: string;
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
  active_order_summary: OrderSummaryDraft | null;
  conversation_history: ConversationMessage[];
  created_at: string;
  updated_at: string;
  audit_events: StateTransitionEvent[];
}

export type AgentEvent =
  | { type: 'USER_MESSAGE'; payload: { text: string } }
  | { type: 'INTENT_PARSED'; payload: { intent: ExtractedIntent; matchResult: CatalogMatchResult } }
  | { type: 'PROMPT_CONFIRMATION'; payload?: { summary: OrderSummaryDraft } }
  | { type: 'CONFIRM_AFFIRMATIVE'; payload?: { userNotes?: string } }
  | { type: 'CONFIRM_NEGATIVE'; payload?: { reason?: string } }
  | { type: 'INITIATE_PAYMENT'; payload?: { razorpayOrderId?: string; paymentLinkUrl?: string } }
  | { type: 'PAYMENT_SUCCESS'; payload: { paymentId: string; razorpayOrderId?: string } }
  | { type: 'PAYMENT_FAILED'; payload: { error: string } }
  | { type: 'CANCEL_RESET'; payload?: { reason?: string } };

export interface AgentTurnResponse {
  sessionId: string;
  state: AgentState;
  agent_message: string;
  order_summary: OrderSummaryDraft | null;
  match_result: CatalogMatchResult | null;
  transition_event: StateTransitionEvent;
}
