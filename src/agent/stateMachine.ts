import {
  AgentState,
  AgentEvent,
  AgentSession,
  OrderSummaryDraft,
  StateTransitionEvent,
} from './stateTypes';
import { CatalogMatchResult } from './catalogMatcher';

import {
  generateConfirmationSummary,
  formatConfirmationCardWithPrompt,
} from './confirmation';

export class IllegalStateTransitionError extends Error {
  constructor(
    public readonly fromState: AgentState,
    public readonly attemptedToState: AgentState,
    public readonly trigger: string,
    message: string
  ) {
    super(message);
    this.name = 'IllegalStateTransitionError';
  }
}

/**
 * Generates an OrderSummaryDraft / ConfirmationSummary when a product and variant are resolved
 */
export function createOrderSummary(
  matchResult: CatalogMatchResult,
  quantity: number = 1
): OrderSummaryDraft | null {
  const product = matchResult.matched_product;
  const variant = matchResult.matched_variant;

  if (!product || !variant) return null;

  return generateConfirmationSummary(product, variant, quantity);
}

/**
 * Generates natural conversational agent responses based on current state and context
 */
export function generateAgentResponse(
  session: AgentSession,
  event: AgentEvent,
  nextState: AgentState
): string {
  switch (nextState) {
    case 'AWAITING_CONFIRMATION': {
      const summary = session.active_order_summary;
      if (summary) {
        if (event.type === 'CONFIRM_REPROMPT') {
          return formatConfirmationCardWithPrompt(summary, event.payload?.faqAnswer);
        }
        return formatConfirmationCardWithPrompt(summary);
      }
      return 'I have prepared your order details. Would you like to confirm and proceed to payment?';
    }

    case 'CLARIFYING': {
      const match = session.current_match_result;
      if (!match) {
        return 'Could you please provide more details on what you would like to buy?';
      }

      // Ambiguous multiple products
      if (match.candidates && match.candidates.length > 1) {
        const productChoices = match.candidates
          .slice(0, 4)
          .map((c, i) => `${i + 1}. **${c.name}** (${c.basePriceFormatted || `₹${c.basePrice / 100}`})`)
          .join('\n');
        return `I found a few matching options in our catalog:\n${productChoices}\n\nWhich one would you like to order?`;
      }

      // Out of stock
      if (match.match_status === 'out_of_stock') {
        const prod = match.matched_product;
        const availableVars = prod?.variants?.filter((v) => v.inStock) || [];
        if (availableVars.length > 0) {
          const altOptions = availableVars.map((v) => `${v.name}`).join(', ');
          return (
            `⚠️ The **${prod?.name}** in the requested option is currently out of stock.\n\n` +
            `We do have these in stock right now:\n• ${altOptions}\n\n` +
            `Would you like one of these alternatives instead?`
          );
        }
        return `I'm sorry, the **${prod?.name || 'requested item'}** is currently completely sold out. Can I help you look for something else?`;
      }

      // Ambiguous variant for single product (e.g. color or size missing)
      if (match.matched_product) {
        return `${match.reason}\n\nCould you please specify your preferred choice?`;
      }

      // Not found
      return (
        `I couldn't find anything matching "${session.current_intent?.item_query || 'your search'}" in our store.\n` +
        `We carry Apparel, Footwear, Accessories, and Smart Tech. What else can I find for you?`
      );
    }

    case 'CONFIRMED': {
      const summary = session.active_order_summary;
      return `✅ Order for **${summary?.quantity || 1}x ${summary?.productName}** confirmed! Preparing secure Razorpay payment...`;
    }

    case 'PAYING': {
      const summary = session.active_order_summary;
      const rzpOrder = session.active_razorpay_order;
      const orderId =
        event.type === 'INITIATE_PAYMENT'
          ? event.payload?.razorpayOrderId || rzpOrder?.razorpay_order_id
          : rzpOrder?.razorpay_order_id;
      const paymentLink =
        event.type === 'INITIATE_PAYMENT'
          ? event.payload?.paymentLinkUrl || rzpOrder?.payment_link_url
          : rzpOrder?.payment_link_url;
      const totalFormatted = summary?.totalFormatted || `₹${summary?.total_amount || 0}`;

      return (
        `💳 **Payment Ready** for **${totalFormatted}**.\n\n` +
        `Razorpay order initialized (${orderId || 'Active'}). Complete your transaction securely via the payment link below or standard checkout modal:\n\n` +
        `👉 **[Pay with Razorpay](${paymentLink || '#'})**`
      );
    }

    case 'COMPLETED': {
      return `🎉 **Payment Successful!** Your order has been placed. Thank you for shopping with ConvoCheckout!`;
    }

    case 'FAILED': {
      const errorMsg =
        event.type === 'PAYMENT_FAILED'
          ? event.payload.error
          : 'Checkout was cancelled or payment failed.';
      return `❌ **Payment Initialization Failed**: ${errorMsg}\n\nLet me know when you'd like to try again or modify your order.`;
    }

    case 'IDLE': {
      return `Understood! I've cleared that order. How can I help you next?`;
    }

    default:
      return 'How can I assist your checkout today?';
  }
}

/**
 * Validates whether a state transition is legal according to strict finite state machine rules.
 * Enforces the Financial Confirmation Safety Gate (FR-3).
 */
export function validateTransition(
  fromState: AgentState,
  toState: AgentState,
  event: AgentEvent
): void {
  // CRITICAL INVARIANT: The ONLY way to reach CONFIRMED is from AWAITING_CONFIRMATION with CONFIRM_AFFIRMATIVE
  if (toState === 'CONFIRMED') {
    if (fromState !== 'AWAITING_CONFIRMATION' || event.type !== 'CONFIRM_AFFIRMATIVE') {
      throw new IllegalStateTransitionError(
        fromState,
        toState,
        event.type,
        `[SECURITY GATE VIOLATION]: Cannot transition to CONFIRMED from '${fromState}' with event '${event.type}'. ` +
          `Orders can ONLY be confirmed from 'AWAITING_CONFIRMATION' via explicit affirmative confirmation.`
      );
    }
  }

  // CRITICAL INVARIANT: The ONLY way to reach PAYING is from CONFIRMED
  if (toState === 'PAYING') {
    if (fromState !== 'CONFIRMED' && fromState !== 'AWAITING_CONFIRMATION') {
      throw new IllegalStateTransitionError(
        fromState,
        toState,
        event.type,
        `[SECURITY GATE VIOLATION]: Cannot transition to PAYING from '${fromState}'. ` +
          `Payment can ONLY be initiated after explicit user confirmation.`
      );
    }
  }
}

/**
 * The State Machine transition table and execution engine
 */
export class AgentStateMachine {
  /**
   * Execute a state transition on an active session
   */
  static transition(
    session: AgentSession,
    event: AgentEvent
  ): {
    nextState: AgentState;
    event: StateTransitionEvent;
    agentMessage: string;
  } {
    const fromState = session.current_state;
    let nextState: AgentState = fromState;
    let reason = '';
    let isMoneyGatedAction = false;
    let metadata: Record<string, any> = {};

    switch (fromState) {
      case 'IDLE': {
        if (event.type === 'USER_MESSAGE') {
          nextState = 'PARSING';
          reason = `User initiated conversation turn: "${event.payload.text}". Transitioned to PARSING.`;
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          reason = 'Session already idle; reset confirmed.';
        } else {
          validateTransition(fromState, 'PAYING', event);
          validateTransition(fromState, 'CONFIRMED', event);
          throw new IllegalStateTransitionError(fromState, nextState, event.type, `Unhandled event in IDLE: ${event.type}`);
        }
        break;
      }

      case 'PARSING': {
        if (event.type === 'INTENT_PARSED') {
          const { intent, matchResult } = event.payload;
          session.current_intent = intent;
          session.current_match_result = matchResult;

          if (matchResult.match_status === 'exact' && matchResult.matched_variant) {
            // Exact match -> Transition to RESOLVED then auto-advance to AWAITING_CONFIRMATION
            nextState = 'AWAITING_CONFIRMATION';
            session.active_order_summary = createOrderSummary(matchResult, intent.quantity);
            session.pending_clarification = null;
            reason = `Exact catalog match: ${matchResult.reason}. Draft order summary created; awaiting user confirmation.`;
            metadata = { orderSummary: session.active_order_summary };
          } else {
            // Ambiguous, Out of Stock, or Not Found -> Transition to CLARIFYING
            nextState = 'CLARIFYING';
            session.pending_clarification = matchResult.reason;
            reason = `Catalog matching returned '${matchResult.match_status}': ${matchResult.reason}. Transitioned to CLARIFYING.`;
            metadata = { matchStatus: matchResult.match_status, candidateCount: matchResult.candidates?.length || 0 };
          }
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          reason = 'User requested cancellation during parsing.';
        } else {
          validateTransition(fromState, 'CONFIRMED', event);
          validateTransition(fromState, 'PAYING', event);
        }
        break;
      }

      case 'CLARIFYING': {
        if (event.type === 'USER_MESSAGE') {
          nextState = 'PARSING';
          reason = `User replied to clarification: "${event.payload.text}". Transitioned to PARSING to re-evaluate intent.`;
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          reason = 'User requested cancellation while clarifying.';
        } else {
          validateTransition(fromState, 'CONFIRMED', event);
          validateTransition(fromState, 'PAYING', event);
        }
        break;
      }

      case 'RESOLVED': {
        if (event.type === 'PROMPT_CONFIRMATION') {
          nextState = 'AWAITING_CONFIRMATION';
          reason = 'Order summary presented to customer; awaiting explicit affirmative confirmation.';
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          reason = 'User cancelled resolved item.';
        }
        break;
      }

      case 'AWAITING_CONFIRMATION': {
        if (event.type === 'CONFIRM_AFFIRMATIVE') {
          validateTransition(fromState, 'CONFIRMED', event);
          nextState = 'CONFIRMED';
          isMoneyGatedAction = true;
          reason = `Customer explicitly confirmed purchase of ${session.active_order_summary?.productName} (${session.active_order_summary?.totalFormatted}). Financial confirmation gate unlocked.`;
          metadata = { orderSummary: session.active_order_summary, userAffirmation: true };
        } else if (event.type === 'CONFIRM_NEGATIVE') {
          nextState = 'IDLE';
          session.active_order_summary = null;
          reason = `Customer declined order confirmation (${event.payload?.reason || 'User said no'}). Resetting to IDLE.`;
        } else if (event.type === 'CONFIRM_REPROMPT') {
          nextState = 'AWAITING_CONFIRMATION';
          reason = event.payload?.reason || 'Ambiguous response or FAQ query during confirmation. Re-prompting user for explicit confirmation.';
          metadata = { faqAnswer: event.payload?.faqAnswer, reprompt: true };
        } else if (event.type === 'REQUEST_MODIFICATION') {
          nextState = 'PARSING';
          reason = `Customer requested modification during confirmation (${event.payload?.rawText || 'attribute change'}). Routing to PARSING.`;
          metadata = { modifications: event.payload?.modifications };
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          session.active_order_summary = null;
          reason = 'Customer cancelled order during confirmation prompt.';
        } else if (event.type === 'USER_MESSAGE') {
          // User asked a new question or requested an adjustment
          nextState = 'PARSING';
          reason = `Customer sent follow-up message during confirmation: "${event.payload.text}". Transitioned to PARSING.`;
        }
        break;
      }

      case 'CONFIRMED': {
        if (event.type === 'INITIATE_PAYMENT') {
          validateTransition(fromState, 'PAYING', event);
          nextState = 'PAYING';
          isMoneyGatedAction = true;
          reason = `Payment initialization started for confirmed order (${session.active_order_summary?.sku || 'Item'}). Razorpay Order ID: ${event.payload?.razorpayOrderId || 'N/A'}.`;
          metadata = event.payload || {};
        } else if (event.type === 'PAYMENT_FAILED') {
          nextState = 'FAILED';
          isMoneyGatedAction = true;
          reason = `Payment order creation failed: ${event.payload.error}.`;
          metadata = event.payload || {};
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'FAILED';
          reason = 'Order cancelled after confirmation prior to payment completion.';
        }
        break;
      }

      case 'PAYING': {
        if (event.type === 'PAYMENT_SUCCESS') {
          nextState = 'COMPLETED';
          isMoneyGatedAction = true;
          reason = `Payment successfully verified (Payment ID: ${event.payload.paymentId}). Order completed.`;
          metadata = event.payload;
        } else if (event.type === 'PAYMENT_FAILED') {
          nextState = 'FAILED';
          isMoneyGatedAction = true;
          reason = `Payment failed or was cancelled at gateway: ${event.payload.error}.`;
          metadata = event.payload;
        } else if (event.type === 'CANCEL_RESET') {
          nextState = 'FAILED';
          reason = 'Transaction aborted by customer during payment step.';
        }
        break;
      }

      case 'COMPLETED':
      case 'FAILED': {
        if (event.type === 'USER_MESSAGE' || event.type === 'CANCEL_RESET') {
          nextState = 'IDLE';
          session.active_order_summary = null;
          session.current_intent = null;
          session.current_match_result = null;
          reason = 'Starting new transaction cycle from terminal state.';
        }
        break;
      }
    }

    // Emit state transition event
    const transitionEvent: StateTransitionEvent = {
      sessionId: session.sessionId,
      from_state: fromState,
      to_state: nextState,
      trigger: event.type,
      timestamp: new Date().toISOString(),
      reason,
      isMoneyGatedAction,
      metadata,
    };

    // Update session state
    session.current_state = nextState;
    session.audit_events.push(transitionEvent);

    // Generate conversational response
    const agentMessage = generateAgentResponse(session, event, nextState);

    return {
      nextState,
      event: transitionEvent,
      agentMessage,
    };
  }
}
