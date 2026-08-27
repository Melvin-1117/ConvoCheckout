import { extractIntent } from './intentExtractor';
import { matchIntentToCatalog } from './catalogMatcher';
import { AgentStateMachine } from './stateMachine';
import { sessionStore } from './sessionStore';
import { AgentTurnResponse, AgentSession, ConversationMessage } from './stateTypes';
import { CatalogApiClient } from '../services/catalogApiClient';

export interface OrchestratorOptions {
  catalogClient?: CatalogApiClient;
  autoAdvancePayment?: boolean; // automatically advance CONFIRMED -> PAYING stub for demo
}

/**
 * Checks if user message expresses affirmative confirmation
 */
export function isAffirmative(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[!.,?]/g, '');
  const affirmativeKeywords = [
    'yes',
    'confirm',
    'proceed',
    'ok',
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
  ];
  return affirmativeKeywords.some((kw) => clean === kw || clean.startsWith(kw));
}

/**
 * Checks if user message expresses negative rejection
 */
export function isNegative(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[!.,?]/g, '');
  const negativeKeywords = [
    'no',
    'cancel',
    'stop',
    'dont',
    "don't",
    'abort',
    'nope',
    'nevermind',
    'reject',
    'not now',
  ];
  return negativeKeywords.some((kw) => clean === kw || clean.startsWith(kw));
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
      match_result: session.current_match_result,
      transition_event: transition.event,
    };
  }

  // 3. Handle AWAITING_CONFIRMATION State: Check for Affirmative Yes / Negative No
  if (session.current_state === 'AWAITING_CONFIRMATION') {
    if (isAffirmative(trimmed)) {
      // Step A: Unlock Confirmation Gate -> CONFIRMED
      const confirmTransition = AgentStateMachine.transition(session, {
        type: 'CONFIRM_AFFIRMATIVE',
        payload: { userNotes: trimmed },
      });

      // Step B: Auto-advance to PAYING (stub for Razorpay step)
      let finalTransition = confirmTransition;
      if (options.autoAdvancePayment ?? true) {
        const payingTransition = AgentStateMachine.transition(session, {
          type: 'INITIATE_PAYMENT',
          payload: {
            razorpayOrderId: `order_mock_${Date.now()}`,
            paymentLinkUrl: `https://rzp.io/i/mock_${Date.now().toString(36)}`,
          },
        });
        finalTransition = payingTransition;
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
        match_result: session.current_match_result,
        transition_event: finalTransition.event,
      };
    }

    if (isNegative(trimmed)) {
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
        match_result: session.current_match_result,
        transition_event: rejectTransition.event,
      };
    }
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
    match_result: session.current_match_result,
    transition_event: transitionResult.event,
  };
}
