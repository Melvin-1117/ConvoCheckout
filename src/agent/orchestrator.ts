import { extractIntent } from './intentExtractor';
import { matchIntentToCatalog } from './catalogMatcher';
import { AgentStateMachine } from './stateMachine';
import { sessionStore } from './sessionStore';
import { AgentTurnResponse, AgentSession, ConversationMessage } from './stateTypes';
import { CatalogApiClient } from '../services/catalogApiClient';

import {
  parseConfirmationResponse,
  mergeModificationIntoIntent,
  generateConfirmationSummary,
} from './confirmation';

import {
  createRazorpayOrder,
  RazorpayClientConfig,
  RazorpayApiClient,
} from '../services/razorpayService';

export {
  parseConfirmationResponse,
  generateConfirmationSummary,
  mergeModificationIntoIntent,
  createRazorpayOrder,
};

export interface OrchestratorOptions {
  catalogClient?: CatalogApiClient;
  autoAdvancePayment?: boolean; // automatically advance CONFIRMED -> PAYING
  razorpayConfig?: RazorpayClientConfig;
  simulateRazorpayFailure?: 'network' | 'rate_limit' | 'bad_request' | 'unauthorized';
}

/**
 * Checks if user message expresses affirmative confirmation
 */
export function isAffirmative(text: string): boolean {
  return parseConfirmationResponse(text).decision === 'affirm';
}

/**
 * Checks if user message expresses negative rejection
 */
export function isNegative(text: string): boolean {
  return parseConfirmationResponse(text).decision === 'reject';
}

/**
 * Checks if user requested a total reset or cancellation
 */
export function isResetCommand(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[!.,?]/g, '');
  return clean === 'reset' || clean === 'start over' || clean === 'clear' || clean === 'restart';
}

/**
 * Process a single conversational user turn through the complete AI agent pipeline:
 * 1. Session lookup / initialization
 * 2. Intent Extraction (Gemini)
 * 3. Catalog Matching (REST API)
 * 4. State Machine Transition & Financial Confirmation Gating
 * 5. Multi-turn history updates
 */
export async function processUserTurn(
  sessionId: string,
  userMessage: string,
  options: OrchestratorOptions = {}
): Promise<AgentTurnResponse> {
  const session = sessionStore.getOrCreate(sessionId);
  const trimmed = userMessage.trim();

  // 1. Record User Message in history
  session.conversation_history.push({
    role: 'user',
    content: trimmed,
    timestamp: new Date().toISOString(),
  });

  // 2. Handle Reset / Start Over Commands from any state
  if (isResetCommand(trimmed)) {
    const transition = AgentStateMachine.transition(session, {
      type: 'CANCEL_RESET',
      payload: { reason: 'User requested session reset' },
    });
    session.conversation_history.push({
      role: 'agent',
      content: transition.agentMessage,
      timestamp: new Date().toISOString(),
    });
    sessionStore.save(session);
    return {
      sessionId,
      state: session.current_state,
      agent_message: transition.agentMessage,
      order_summary: session.active_order_summary,
      confirmation_summary: session.active_order_summary,
      razorpay_order: session.active_razorpay_order,
      payment_link_url: session.active_razorpay_order?.payment_link_url,
      match_result: session.current_match_result,
      transition_event: transition.event,
    };
  }

  // 3. Handle AWAITING_CONFIRMATION State using the Confirmation Layer
  if (session.current_state === 'AWAITING_CONFIRMATION') {
    const confirmationResult = parseConfirmationResponse(trimmed);

    // Case 3A: Clean Affirm -> Unlock Financial Gate -> CONFIRMED -> Call Razorpay -> PAYING / FAILED
    if (confirmationResult.decision === 'affirm') {
      const confirmTransition = AgentStateMachine.transition(session, {
        type: 'CONFIRM_AFFIRMATIVE',
        payload: { userNotes: trimmed },
      });

      let finalTransition = confirmTransition;
      if (options.autoAdvancePayment ?? true) {
        if (session.active_order_summary) {
          const razorpayResult = await createRazorpayOrder(
            session.active_order_summary,
            sessionId,
            {
              session,
              sessionState: session.current_state,
              clientConfig: options.razorpayConfig,
              simulateFailure: options.simulateRazorpayFailure,
            }
          );

          session.active_razorpay_order = razorpayResult;

          if (razorpayResult.success) {
            finalTransition = AgentStateMachine.transition(session, {
              type: 'INITIATE_PAYMENT',
              payload: {
                razorpayOrderId: razorpayResult.razorpay_order_id,
                paymentLinkUrl: razorpayResult.payment_link_url,
                amountPaise: razorpayResult.amount,
                formattedAmount: session.active_order_summary.totalFormatted,
                notes: razorpayResult.notes,
              },
            });
          } else {
            finalTransition = AgentStateMachine.transition(session, {
              type: 'PAYMENT_FAILED',
              payload: {
                error: razorpayResult.error || 'Razorpay order creation failed',
                statusCode: razorpayResult.statusCode,
              },
            });
          }
        }
      }

      session.conversation_history.push({
        role: 'agent',
        content: finalTransition.agentMessage,
        timestamp: new Date().toISOString(),
      });
      sessionStore.save(session);

      return {
        sessionId,
        state: session.current_state,
        agent_message: finalTransition.agentMessage,
        order_summary: session.active_order_summary,
        confirmation_summary: session.active_order_summary,
        razorpay_order: session.active_razorpay_order,
        payment_link_url: session.active_razorpay_order?.payment_link_url,
        match_result: session.current_match_result,
        transition_event: finalTransition.event,
      };
    }

    // Case 3B: Clean Reject -> Reset to IDLE
    if (confirmationResult.decision === 'reject') {
      const rejectTransition = AgentStateMachine.transition(session, {
        type: 'CONFIRM_NEGATIVE',
        payload: { reason: `User rejected confirmation: "${trimmed}"` },
      });

      session.conversation_history.push({
        role: 'agent',
        content: rejectTransition.agentMessage,
        timestamp: new Date().toISOString(),
      });
      sessionStore.save(session);

      return {
        sessionId,
        state: session.current_state,
        agent_message: rejectTransition.agentMessage,
        order_summary: session.active_order_summary,
        confirmation_summary: session.active_order_summary,
        match_result: session.current_match_result,
        transition_event: rejectTransition.event,
      };
    }

    // Case 3C: Modification Request -> Merge into current_intent -> Route to PARSING
    if (confirmationResult.decision === 'modify') {
      AgentStateMachine.transition(session, {
        type: 'REQUEST_MODIFICATION',
        payload: {
          modifications: confirmationResult.modifications,
          rawText: trimmed,
        },
      });

      // Construct base intent from existing intent or resolved order summary
      const activeSummary = session.active_order_summary;
      const matchedProd = session.current_match_result?.matched_product;
      const matchedVar = session.current_match_result?.matched_variant;

      const baseIntent = session.current_intent
        ? JSON.parse(JSON.stringify(session.current_intent))
        : {
            intent_type: 'purchase',
            item_query: activeSummary?.productName || matchedProd?.name || null,
            variant: {
              size: activeSummary?.size || matchedVar?.size || null,
              color: activeSummary?.color || matchedVar?.color || null,
            },
            quantity: activeSummary?.line_items?.[0]?.quantity || activeSummary?.quantity || 1,
            confidence: 0.95,
            ambiguity_notes: null,
          };

      if (!baseIntent.item_query && (activeSummary?.productName || matchedProd?.name)) {
        baseIntent.item_query = activeSummary?.productName || matchedProd?.name;
      }
      if (!baseIntent.variant.size && (activeSummary?.size || matchedVar?.size)) {
        baseIntent.variant.size = activeSummary?.size || matchedVar?.size;
      }
      if (!baseIntent.variant.color && (activeSummary?.color || matchedVar?.color)) {
        baseIntent.variant.color = activeSummary?.color || matchedVar?.color;
      }
      if (activeSummary?.line_items?.[0]?.quantity && (!baseIntent.quantity || baseIntent.quantity <= 1)) {
        baseIntent.quantity = activeSummary.line_items[0].quantity;
      }

      // Merge modifications directly without losing context
      const mergedIntent = mergeModificationIntoIntent(
        baseIntent,
        confirmationResult.modifications
      );

      // Re-match modified intent against live catalog
      const matchResult = await matchIntentToCatalog(mergedIntent, {
        client: options.catalogClient,
      });

      const modifyTransition = AgentStateMachine.transition(session, {
        type: 'INTENT_PARSED',
        payload: {
          intent: mergedIntent,
          matchResult,
        },
      });

      session.conversation_history.push({
        role: 'agent',
        content: modifyTransition.agentMessage,
        timestamp: new Date().toISOString(),
      });
      sessionStore.save(session);

      return {
        sessionId,
        state: session.current_state,
        agent_message: modifyTransition.agentMessage,
        order_summary: session.active_order_summary,
        confirmation_summary: session.active_order_summary,
        match_result: session.current_match_result,
        transition_event: modifyTransition.event,
      };
    }

    // Case 3D: Unclear / Pre-Purchase FAQ Question
    // Re-Display Rule: Answer static FAQ if present, ALWAYS re-show confirmation summary,
    // and STAY in AWAITING_CONFIRMATION (never implicitly affirm or proceed to payment).
    const repromptTransition = AgentStateMachine.transition(session, {
      type: 'CONFIRM_REPROMPT',
      payload: {
        faqAnswer: confirmationResult.faq_answer || undefined,
        reason: `Ambiguous user response or FAQ inquiry during confirmation: "${trimmed}". Answering and re-displaying confirmation card.`,
      },
    });

    session.conversation_history.push({
      role: 'agent',
      content: repromptTransition.agentMessage,
      timestamp: new Date().toISOString(),
    });
    sessionStore.save(session);

    return {
      sessionId,
      state: session.current_state,
      agent_message: repromptTransition.agentMessage,
      order_summary: session.active_order_summary,
      confirmation_summary: session.active_order_summary,
      match_result: session.current_match_result,
      transition_event: repromptTransition.event,
    };
  }

  // 4. Default Path: Transition to PARSING -> Intent Extraction -> Catalog Match
  AgentStateMachine.transition(session, {
    type: 'USER_MESSAGE',
    payload: { text: trimmed },
  });

  // Extract structured intent from language understanding layer
  const extractedIntent = await extractIntent(trimmed, session.conversation_history);

  // Multi-turn context merge: If user is clarifying or continuing previous item discussion
  const prevProduct = session.current_match_result?.matched_product;
  const prevCandidates = session.current_match_result?.candidates || [];
  const prevIntent = session.current_intent;

  // If user selected candidate by index (e.g. "1", "option 1", "first one")
  const numMatch = trimmed.match(/^(?:option\s+)?(\d+)$/i);
  if (numMatch && prevCandidates.length > 0) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < prevCandidates.length) {
      extractedIntent.item_query = prevCandidates[idx].name;
    }
  }

  // Merge item_query from previous context if not explicitly replaced
  if (!extractedIntent.item_query || extractedIntent.intent_type === 'clarification_response') {
    if (prevProduct) {
      extractedIntent.item_query = prevProduct.name;
    } else if (prevIntent?.item_query) {
      extractedIntent.item_query = prevIntent.item_query;
    }
  }

  // Merge variant attributes
  if (prevIntent?.variant) {
    if (!extractedIntent.variant.size && prevIntent.variant.size) {
      extractedIntent.variant.size = prevIntent.variant.size;
    }
    if (!extractedIntent.variant.color && prevIntent.variant.color) {
      extractedIntent.variant.color = prevIntent.variant.color;
    }
  }

  // Match intent against live catalog
  const matchResult = await matchIntentToCatalog(extractedIntent, {
    client: options.catalogClient,
  });

  // Feed result into State Machine
  const transitionResult = AgentStateMachine.transition(session, {
    type: 'INTENT_PARSED',
    payload: {
      intent: extractedIntent,
      matchResult,
    },
  });

  // 5. Append Agent Response to conversation history and save session
  session.conversation_history.push({
    role: 'agent',
    content: transitionResult.agentMessage,
    timestamp: new Date().toISOString(),
  });
  sessionStore.save(session);

  return {
    sessionId,
    state: session.current_state,
    agent_message: transitionResult.agentMessage,
    order_summary: session.active_order_summary,
    confirmation_summary: session.active_order_summary,
    razorpay_order: session.active_razorpay_order,
    payment_link_url: session.active_razorpay_order?.payment_link_url,
    match_result: session.current_match_result,
    transition_event: transitionResult.event,
  };
}
