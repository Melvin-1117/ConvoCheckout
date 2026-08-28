import crypto from 'crypto';
import dotenv from 'dotenv';
import { AgentSession, AgentState } from '../agent/stateTypes';
import { AgentStateMachine } from '../agent/stateMachine';
import { sessionStore } from '../agent/sessionStore';
import { AuditRepository } from '../db/repositories/auditRepository';
import { OrderRepository } from '../db/repositories/orderRepository';
import { isTransientError, razorpayApiClient, RazorpayApiClient } from './razorpayService';

dotenv.config();

/**
 * Idempotency Tracker for Webhook & Polling Events
 * Ensures events with identical payment_id or order_id are processed strictly once.
 */
export class IdempotencyTracker {
  private static processedKeys: Set<string> = new Set();

  static isProcessed(key: string): boolean {
    if (!key) return false;
    return this.processedKeys.has(key.trim());
  }

  static markProcessed(key: string): void {
    if (!key) return;
    this.processedKeys.add(key.trim());
  }

  static clear(): void {
    this.processedKeys.clear();
  }
}

/**
 * Verifies Razorpay Webhook HMAC SHA256 signature
 * Compares computed signature against x-razorpay-signature using timingSafeEqual to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  secret?: string
): boolean {
  const webhookSecret = secret !== undefined ? secret : (process.env.RAZORPAY_WEBHOOK_SECRET || '');

  if (!webhookSecret || !signatureHeader || !rawBody) {
    return false;
  }

  try {
    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyBuffer)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signatureHeader.trim(), 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (err) {
    return false;
  }
}

export interface PaymentStatusResult {
  status: 'paid' | 'failed' | 'pending' | 'timeout' | 'error';
  orderId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  errorDescription?: string;
  errorCode?: string;
  source?: 'webhook' | 'poll';
  isTransient?: boolean;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  client?: RazorpayApiClient;
  mockResolution?: {
    afterPollTicks?: number;
    resolveTo: 'paid' | 'failed';
    paymentId?: string;
    errorDescription?: string;
  };
  onPollTick?: (tick: number, result: PaymentStatusResult) => void;
}

/**
 * Checks current payment status for a Razorpay Order
 */
export async function checkPaymentStatus(
  razorpayOrderId: string,
  options: { client?: RazorpayApiClient; mockStatus?: 'paid' | 'failed' | 'pending' } = {}
): Promise<PaymentStatusResult> {
  const client = options.client || razorpayApiClient;

  if (client.isSandboxMode()) {
    const mockStatus = options.mockStatus || 'paid';
    if (mockStatus === 'paid') {
      return {
        status: 'paid',
        orderId: razorpayOrderId,
        paymentId: `pay_test_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 6)}`,
        amount: 149900,
        currency: 'INR',
      };
    }
    if (mockStatus === 'failed') {
      return {
        status: 'failed',
        orderId: razorpayOrderId,
        paymentId: `pay_test_fail_${Date.now().toString().slice(-4)}`,
        errorDescription: 'Card payment was declined by issuing bank (Insufficient funds)',
        errorCode: 'BAD_REQUEST_PAYMENT_DECLINED',
      };
    }
    return {
      status: 'pending',
      orderId: razorpayOrderId,
    };
  }

  // Live Razorpay API call
  try {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

    // 1. Fetch order details
    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
      headers: { Authorization: authHeader },
    });

    if (!orderRes.ok) {
      const isTransient = isTransientError(orderRes.status);
      return {
        status: 'error',
        orderId: razorpayOrderId,
        errorDescription: `Razorpay order fetch failed (HTTP ${orderRes.status})`,
        isTransient,
      };
    }

    const orderData: any = await orderRes.json();

    if (orderData.status === 'paid') {
      // 2. Fetch payments for this order to get the capture payment ID
      const paymentsRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
        headers: { Authorization: authHeader },
      });

      let paymentId = `pay_${Date.now()}`;
      if (paymentsRes.ok) {
        const paymentsData: any = await paymentsRes.json();
        const captured = (paymentsData.items || []).find((p: any) => p.status === 'captured');
        if (captured) {
          paymentId = captured.id;
        }
      }

      return {
        status: 'paid',
        orderId: razorpayOrderId,
        paymentId,
        amount: orderData.amount,
        currency: orderData.currency,
      };
    }

    // Check payment attempts for failures
    const paymentsRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
      headers: { Authorization: authHeader },
    });

    if (paymentsRes.ok) {
      const paymentsData: any = await paymentsRes.json();
      const failedPayment = (paymentsData.items || []).find((p: any) => p.status === 'failed');
      if (failedPayment) {
        return {
          status: 'failed',
          orderId: razorpayOrderId,
          paymentId: failedPayment.id,
          errorDescription: failedPayment.error_description || failedPayment.error_reason || 'Payment failed',
          errorCode: failedPayment.error_code,
        };
      }
    }

    return {
      status: 'pending',
      orderId: razorpayOrderId,
      amount: orderData.amount,
      currency: orderData.currency,
    };
  } catch (err: any) {
    return {
      status: 'error',
      orderId: razorpayOrderId,
      errorDescription: err?.message || 'Network request failed during payment status check',
      isTransient: isTransientError(undefined, err),
    };
  }
}

/**
 * Resolves payment success on a session (idempotent, thread-safe, defense-guarded)
 */
export async function resolvePaymentSuccess(
  session: AgentSession,
  paymentDetails: {
    paymentId: string;
    razorpayOrderId?: string;
    amount?: number;
    currency?: string;
  },
  source: 'webhook' | 'poll' = 'webhook'
): Promise<{ applied: boolean; reason?: string; session: AgentSession }> {
  // 1. DEFENSE GUARD: Session MUST be in PAYING state
  if (session.current_state !== 'PAYING') {
    return {
      applied: false,
      reason: `Ignored late/stray success event: session is in '${session.current_state}' state (expected 'PAYING').`,
      session,
    };
  }

  // 2. IDEMPOTENCY CHECK
  const dedupeKey = `success_${paymentDetails.paymentId}_${paymentDetails.razorpayOrderId || ''}`;
  if (IdempotencyTracker.isProcessed(dedupeKey)) {
    return {
      applied: false,
      reason: `Duplicate payment resolution ignored (Payment ID: ${paymentDetails.paymentId}).`,
      session,
    };
  }
  IdempotencyTracker.markProcessed(dedupeKey);

  // 3. Transition State Machine: PAYING -> COMPLETED
  const transition = AgentStateMachine.transition(session, {
    type: 'PAYMENT_SUCCESS',
    payload: {
      paymentId: paymentDetails.paymentId,
      razorpayOrderId: paymentDetails.razorpayOrderId,
    },
  });

  session.conversation_history.push({
    role: 'agent',
    content: transition.agentMessage,
    timestamp: new Date().toISOString(),
  });
  sessionStore.save(session);

  // 4. Update Database Order Status asynchronously (if order exists in DB)
  if (paymentDetails.razorpayOrderId) {
    OrderRepository.getOrderByRazorpayId(paymentDetails.razorpayOrderId)
      .then((order) => {
        if (order) {
          return OrderRepository.updateOrderStatus(order.id, 'PAID', {
            razorpayPaymentId: paymentDetails.paymentId,
            metadata: { resolvedSource: source },
          });
        }
      })
      .catch((err: any) => {
        console.warn(`[PaymentTracker] Order status DB update notice: ${err?.message}`);
      });
  }

  // 5. Emit Audit Log Event (Step 9 Requirement)
  await AuditRepository.logAudit({
    sessionId: session.sessionId,
    actionType: 'PAYMENT_VERIFIED',
    category: 'PAYMENT_GATEWAY',
    decisionRationale: `Payment verified via ${source} (Payment ID: ${paymentDetails.paymentId}, Order ID: ${paymentDetails.razorpayOrderId || 'N/A'}). State transitioned PAYING -> COMPLETED.`,
    inputData: {
      sessionId: session.sessionId,
      paymentDetails,
      source,
    } as any,
    outputData: {
      state: 'COMPLETED',
      paymentId: paymentDetails.paymentId,
      source,
      timestamp: new Date().toISOString(),
    },
    status: 'SUCCESS',
    isMoneyAction: true,
  });

  return {
    applied: true,
    session,
  };
}

/**
 * Resolves payment failure on a session (idempotent, captures error details, defense-guarded)
 */
export async function resolvePaymentFailure(
  session: AgentSession,
  errorDetails: {
    error: string;
    razorpayOrderId?: string;
    paymentId?: string;
    errorCode?: string;
  },
  source: 'webhook' | 'poll' = 'webhook'
): Promise<{ applied: boolean; reason?: string; session: AgentSession }> {
  // 1. DEFENSE GUARD: Session MUST be in PAYING state
  if (session.current_state !== 'PAYING') {
    return {
      applied: false,
      reason: `Ignored late failure event: session is in '${session.current_state}' state (expected 'PAYING').`,
      session,
    };
  }

  // 2. IDEMPOTENCY CHECK
  const dedupeKey = `failure_${errorDetails.paymentId || errorDetails.razorpayOrderId || ''}_${errorDetails.error}`;
  if (IdempotencyTracker.isProcessed(dedupeKey)) {
    return {
      applied: false,
      reason: 'Duplicate payment failure event ignored.',
      session,
    };
  }
  IdempotencyTracker.markProcessed(dedupeKey);

  // 3. Transition State Machine: PAYING -> FAILED
  const transition = AgentStateMachine.transition(session, {
    type: 'PAYMENT_FAILED',
    payload: {
      error: errorDetails.error,
    },
  });

  session.conversation_history.push({
    role: 'agent',
    content: transition.agentMessage,
    timestamp: new Date().toISOString(),
  });
  sessionStore.save(session);

  // 4. Update Database Order Status asynchronously if order exists
  if (errorDetails.razorpayOrderId) {
    OrderRepository.getOrderByRazorpayId(errorDetails.razorpayOrderId)
      .then((order) => {
        if (order) {
          return OrderRepository.updateOrderStatus(order.id, 'FAILED', {
            razorpayPaymentId: errorDetails.paymentId,
            metadata: { failureReason: errorDetails.error, errorCode: errorDetails.errorCode, resolvedSource: source },
          });
        }
      })
      .catch((err: any) => {
        console.warn(`[PaymentTracker] Order status DB update notice: ${err?.message}`);
      });
  }

  // 5. Emit Audit Log Event (Step 9 Requirement)
  await AuditRepository.logAudit({
    sessionId: session.sessionId,
    actionType: 'PAYMENT_FAILED',
    category: 'PAYMENT_GATEWAY',
    decisionRationale: `Payment failure recorded via ${source} (Reason: ${errorDetails.error}, Code: ${errorDetails.errorCode || 'N/A'}). State transitioned PAYING -> FAILED.`,
    inputData: {
      sessionId: session.sessionId,
      errorDetails,
      source,
    } as any,
    outputData: {
      state: 'FAILED',
      error: errorDetails.error,
      source,
      timestamp: new Date().toISOString(),
    },
    status: 'FAILED',
    isMoneyAction: true,
  });

  return {
    applied: true,
    session,
  };
}

/**
 * Polling Fallback Loop: pollUntilResolved
 * 
 * Repeatedly checks order status via Razorpay Fetch API every intervalMs until:
 * 1. Payment status is 'paid' -> resolves session to COMPLETED
 * 2. Payment status is 'failed' -> resolves session to FAILED
 * 3. Session was ALREADY resolved mid-poll (by webhook or user) -> exits immediately
 * 4. Timeout is reached -> returns timeout response without hanging
 */
export async function pollUntilResolved(
  razorpayOrderId: string,
  options: PollOptions = {}
): Promise<PaymentStatusResult & { session?: AgentSession }> {
  const intervalMs = options.intervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 15000;
  const startTime = Date.now();
  let tick = 0;

  while (Date.now() - startTime < timeoutMs) {
    tick++;

    // 1. PRE-TICK SESSION CHECK: If webhook resolved session mid-poll, STOP immediately!
    const session = sessionStore.getByRazorpayOrderId(razorpayOrderId);
    if (session && session.current_state !== 'PAYING') {
      return {
        status: session.current_state === 'COMPLETED' ? 'paid' : 'failed',
        orderId: razorpayOrderId,
        source: 'poll',
        session,
      };
    }

    // Handle Mock Sandbox Simulation for Automated Tests
    let statusResult: PaymentStatusResult;
    if (options.mockResolution) {
      if (tick >= (options.mockResolution.afterPollTicks ?? 1)) {
        statusResult = {
          status: options.mockResolution.resolveTo,
          orderId: razorpayOrderId,
          paymentId: options.mockResolution.paymentId || `pay_mock_poll_${Date.now()}`,
          errorDescription: options.mockResolution.errorDescription,
          source: 'poll',
        };
      } else {
        statusResult = { status: 'pending', orderId: razorpayOrderId, source: 'poll' };
      }
    } else {
      statusResult = await checkPaymentStatus(razorpayOrderId, { client: options.client });
      statusResult.source = 'poll';
    }

    if (options.onPollTick) {
      options.onPollTick(tick, statusResult);
    }

    // 2. SUCCESS CASE: Order is PAID
    if (statusResult.status === 'paid') {
      if (session && session.current_state === 'PAYING') {
        const resolution = await resolvePaymentSuccess(
          session,
          {
            paymentId: statusResult.paymentId || `pay_poll_${Date.now()}`,
            razorpayOrderId,
            amount: statusResult.amount,
            currency: statusResult.currency,
          },
          'poll'
        );
        return {
          ...statusResult,
          session: resolution.session,
        };
      }
      return { ...statusResult, session: session || undefined };
    }

    // 3. FAILURE CASE: Payment FAILED
    if (statusResult.status === 'failed') {
      if (session && session.current_state === 'PAYING') {
        const resolution = await resolvePaymentFailure(
          session,
          {
            error: statusResult.errorDescription || 'Payment declined by issuing bank',
            razorpayOrderId,
            paymentId: statusResult.paymentId,
            errorCode: statusResult.errorCode,
          },
          'poll'
        );
        return {
          ...statusResult,
          session: resolution.session,
        };
      }
      return { ...statusResult, session: session || undefined };
    }

    // 4. Sleep for intervalMs before next tick
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // 5. TIMEOUT REACHED
  return {
    status: 'timeout',
    orderId: razorpayOrderId,
    errorDescription: 'Payment verification timed out. Please check back shortly or retry.',
    source: 'poll',
    session: sessionStore.getByRazorpayOrderId(razorpayOrderId) || undefined,
  };
}
