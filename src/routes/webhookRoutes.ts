import { Router, Request, Response } from 'express';
import {
  verifyWebhookSignature,
  resolvePaymentSuccess,
  resolvePaymentFailure,
  IdempotencyTracker,
} from '../services/paymentTrackingService';
import { sessionStore } from '../agent/sessionStore';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/razorpay
 * 
 * Razorpay Webhook Ingestion Endpoint
 * 1. Cryptographic HMAC SHA256 signature verification (Mandatory Security Gate)
 * 2. Idempotency deduplication check (prevents double-firing on network retries)
 * 3. Event routing:
 *    - payment.captured / order.paid -> PAYING -> COMPLETED
 *    - payment.failed -> PAYING -> FAILED (captures error_description)
 *    - other events -> acknowledged 200 OK without errors
 * 4. Fast HTTP 200 response to prevent Razorpay delivery timeouts
 */
webhookRouter.post('/razorpay', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  // 1. HARD SECURITY REQUIREMENT: Webhook Signature Verification
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.warn(`[Webhook Security] Rejected Razorpay webhook: Invalid or missing HMAC signature.`);
    return res.status(400).json({
      success: false,
      error: 'Invalid webhook signature: HMAC SHA256 verification failed.',
    });
  }

  // 2. Parse Payload defensively
  let eventPayload: any;
  try {
    eventPayload = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody.toString('utf8'));
  } catch (parseErr: any) {
    console.error(`[Webhook] Malformed webhook JSON:`, parseErr);
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload.',
    });
  }

  const eventType: string = eventPayload?.event || '';
  const eventId: string = eventPayload?.payload?.payment?.entity?.id || eventPayload?.payload?.order?.entity?.id || '';

  // 3. Fast Idempotency Check
  const dedupeKey = `webhook_${eventId}_${eventType}`;
  if (IdempotencyTracker.isProcessed(dedupeKey)) {
    return res.status(200).json({
      success: true,
      event: eventType,
      status: 'duplicate_ignored',
    });
  }
  IdempotencyTracker.markProcessed(dedupeKey);

  // 4. Handle Specific Payment Events
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = eventPayload.payload?.payment?.entity;
    const orderEntity = eventPayload.payload?.order?.entity;

    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || '';
    const paymentId = paymentEntity?.id || `pay_wh_${Date.now()}`;
    const amount = paymentEntity?.amount || orderEntity?.amount;
    const currency = paymentEntity?.currency || orderEntity?.currency || 'INR';
    const notesSessionId = paymentEntity?.notes?.sessionId || orderEntity?.notes?.sessionId;

    // Locate session by order_id or notes sessionId
    let session = razorpayOrderId ? sessionStore.getByRazorpayOrderId(razorpayOrderId) : null;
    if (!session && notesSessionId) {
      session = sessionStore.get(notesSessionId);
    }

    if (session) {
      await resolvePaymentSuccess(
        session,
        {
          paymentId,
          razorpayOrderId,
          amount,
          currency,
        },
        'webhook'
      );
    } else {
      console.warn(`[Webhook] No active session found matching Razorpay order '${razorpayOrderId}'.`);
    }

    return res.status(200).json({
      success: true,
      event: eventType,
      order_id: razorpayOrderId,
      payment_id: paymentId,
      status: 'processed',
    });
  }

  if (eventType === 'payment.failed') {
    const paymentEntity = eventPayload.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id || '';
    const paymentId = paymentEntity?.id || `pay_fail_${Date.now()}`;
    const errorDescription =
      paymentEntity?.error_description ||
      paymentEntity?.error_reason ||
      'Payment transaction was declined by bank.';
    const errorCode = paymentEntity?.error_code || 'PAYMENT_FAILED';
    const notesSessionId = paymentEntity?.notes?.sessionId;

    let session = razorpayOrderId ? sessionStore.getByRazorpayOrderId(razorpayOrderId) : null;
    if (!session && notesSessionId) {
      session = sessionStore.get(notesSessionId);
    }

    if (session) {
      await resolvePaymentFailure(
        session,
        {
          error: errorDescription,
          razorpayOrderId,
          paymentId,
          errorCode,
        },
        'webhook'
      );
    }

    return res.status(200).json({
      success: true,
      event: eventType,
      order_id: razorpayOrderId,
      error: errorDescription,
      status: 'processed',
    });
  }

  // 5. Acknowledge any other Razorpay event types gracefully
  return res.status(200).json({
    success: true,
    event: eventType,
    status: 'acknowledged_ignored',
  });
});
