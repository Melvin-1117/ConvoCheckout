import http from 'http';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { AgentSession } from '../src/agent/stateTypes';
import { sessionStore } from '../src/agent/sessionStore';
import {
  verifyWebhookSignature,
  checkPaymentStatus,
  pollUntilResolved,
  resolvePaymentSuccess,
  resolvePaymentFailure,
  IdempotencyTracker,
} from '../src/services/paymentTrackingService';
import { AuditRepository } from '../src/db/repositories/auditRepository';

async function makePostRequest(
  serverUrl: string,
  path: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const url = new URL(path, serverUrl);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(rawBody),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

function generateWebhookSignature(payload: string | object, secret: string): string {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');
}

function createSamplePayingSession(sessionId: string, razorpayOrderId: string): AgentSession {
  const session = sessionStore.getOrCreate(sessionId);
  session.current_state = 'PAYING';
  session.active_order_summary = {
    summary_text: '1x Classic Oxford Cotton Shirt (Size M, Navy Blue) — ₹1,499.00',
    line_items: [
      {
        product_name: 'Classic Oxford Cotton Shirt',
        variant_desc: 'Size M / Navy Blue',
        quantity: 1,
        unit_price: 1499,
        subtotal: 1499,
      },
    ],
    total_amount: 1499,
    currency: 'INR',
    productId: 'b1000000-0000-0000-0000-000000000001',
    productName: 'Classic Oxford Cotton Shirt',
    variantId: 'v1000000-0000-0000-0000-000000000002',
    variantName: 'Size M / Navy Blue',
    sku: 'SHIRT-OXF-BLU-M',
    size: 'M',
    color: 'Navy Blue',
    quantity: 1,
    unitPricePaise: 149900,
    unitPriceFormatted: '₹1,499.00',
    totalPaise: 149900,
    totalFormatted: '₹1,499.00',
  };
  session.active_razorpay_order = {
    success: true,
    razorpay_order_id: razorpayOrderId,
    payment_link_url: `https://rzp.io/i/test_${razorpayOrderId.slice(-6)}`,
    amount: 149900,
    currency: 'INR',
    status: 'created',
  };
  sessionStore.save(session);
  return session;
}

async function runPaymentTrackingTests() {
  console.log('================================================================');
  console.log(' ConvoCheckout: Payment Status Tracking Verification (Step 8)');
  console.log(' Track: AI Growth & Agentic Commerce (Razorpay Buildathon 2026)');
  console.log(' Hybrid Architecture: Webhook Primary + Polling Fallback');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  const TEST_WEBHOOK_SECRET = 'whsec_test_convo_checkout_secret_2026';
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as any;
  const serverUrl = `http://localhost:${address.port}`;
  console.log(`📡 Test server active on ${serverUrl}\n`);

  try {
    // ----------------------------------------------------------------
    // [Test Suite 1] Webhook HMAC SHA256 Signature Verification
    // ----------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('[Test Suite 1] Webhook HMAC SHA256 Signature Verification');
    console.log('----------------------------------------------------------------\n');

    const samplePayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_sig_001', amount: 149900 } } },
    });
    const validSignature = generateWebhookSignature(samplePayload, TEST_WEBHOOK_SECRET);
    const tamperedPayload = samplePayload + ' ';
    const invalidSignature = 'a'.repeat(64);

    assert(
      verifyWebhookSignature(samplePayload, validSignature, TEST_WEBHOOK_SECRET) === true,
      'Valid HMAC SHA256 signature passes verification'
    );
    assert(
      verifyWebhookSignature(tamperedPayload, validSignature, TEST_WEBHOOK_SECRET) === false,
      'Tampered payload fails signature verification'
    );
    assert(
      verifyWebhookSignature(samplePayload, invalidSignature, TEST_WEBHOOK_SECRET) === false,
      'Incorrect signature fails verification'
    );
    assert(
      verifyWebhookSignature(samplePayload, undefined, TEST_WEBHOOK_SECRET) === false,
      'Missing signature header returns false'
    );
    assert(
      verifyWebhookSignature(samplePayload, validSignature, '') === false,
      'Missing webhook secret returns false (fails secure)'
    );

    // ----------------------------------------------------------------
    // [Test Suite 2] HTTP Webhook Endpoint Security & Ingestion
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 2] HTTP Webhook Endpoint Security (POST /api/webhooks/razorpay)');
    console.log('----------------------------------------------------------------\n');

    // 2A. Request with Invalid Signature -> HTTP 400
    const resBadSig = await makePostRequest(serverUrl, '/api/webhooks/razorpay', samplePayload, {
      'x-razorpay-signature': 'invalid_hex_signature',
    });
    assert(resBadSig.status === 400, 'Invalid signature returns HTTP 400 Bad Request');
    assert(resBadSig.body.success === false, 'Invalid signature response has success: false');
    assert(
      resBadSig.body.error?.includes('signature'),
      'Invalid signature returns informative security error'
    );

    // 2B. Request with Unknown Event -> HTTP 200 Ignored
    const unknownEventPayload = {
      event: 'subscription.authenticated',
      payload: { subscription: { entity: { id: 'sub_test_123' } } },
    };
    const unknownSig = generateWebhookSignature(unknownEventPayload, TEST_WEBHOOK_SECRET);
    const resUnknown = await makePostRequest(
      serverUrl,
      '/api/webhooks/razorpay',
      unknownEventPayload,
      { 'x-razorpay-signature': unknownSig }
    );
    assert(resUnknown.status === 200, 'Unknown event type returns HTTP 200 OK');
    assert(
      resUnknown.body.status === 'acknowledged_ignored',
      'Unknown event is safely acknowledged without error'
    );

    // ----------------------------------------------------------------
    // [Test Suite 3] Scenario (a): Webhook Arrives First (Primary Flow)
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 3] Scenario (a): Webhook Arrives First (Primary Happy-Path)');
    console.log('----------------------------------------------------------------\n');

    const sessionA_Id = `test-wh-first-${Date.now()}`;
    const orderA_Id = `order_test_wh_first_${Date.now().toString().slice(-6)}`;
    const sessionA = createSamplePayingSession(sessionA_Id, orderA_Id);

    assert(sessionA.current_state === 'PAYING', "Session begins in 'PAYING' state");

    const webhookPayloadA = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_wh_first_999',
            order_id: orderA_Id,
            amount: 149900,
            currency: 'INR',
            status: 'captured',
            notes: { sessionId: sessionA_Id },
          },
        },
      },
    };
    const sigA = generateWebhookSignature(webhookPayloadA, TEST_WEBHOOK_SECRET);

    const resA = await makePostRequest(serverUrl, '/api/webhooks/razorpay', webhookPayloadA, {
      'x-razorpay-signature': sigA,
    });

    assert(resA.status === 200, 'Webhook POST returned HTTP 200 OK');
    assert(resA.body.status === 'processed', "Webhook response status is 'processed'");

    const updatedSessionA = sessionStore.get(sessionA_Id)!;
    assert(
      updatedSessionA.current_state === 'COMPLETED',
      "Session state successfully transitioned to 'COMPLETED'"
    );

    const lastMsgA = updatedSessionA.conversation_history.slice(-1)[0];
    assert(
      lastMsgA.content.includes('Payment Successful') &&
        lastMsgA.content.includes('pay_test_wh_first_999'),
      'Agent response contains celebratory confirmation with Payment ID'
    );
    assert(
      lastMsgA.content.includes('Classic Oxford Cotton Shirt'),
      'Agent response mentions purchased item details'
    );

    // Test that background poll sees session is already COMPLETED and stops immediately
    const pollCheckA = await pollUntilResolved(orderA_Id, { timeoutMs: 3000, intervalMs: 200 });
    assert(
      pollCheckA.status === 'paid',
      'Polling check on resolved session returns paid immediately via pre-tick guard'
    );
    assert(
      pollCheckA.session?.current_state === 'COMPLETED',
      'Session remains strictly COMPLETED without redundant mutations'
    );

    // ----------------------------------------------------------------
    // [Test Suite 4] Scenario (b): Polling Resolves First (Delayed Webhook Fallback)
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 4] Scenario (b): Polling Resolves First (Delayed Webhook Fallback)');
    console.log('----------------------------------------------------------------\n');

    const sessionB_Id = `test-poll-first-${Date.now()}`;
    const orderB_Id = `order_test_poll_first_${Date.now().toString().slice(-6)}`;
    const sessionB = createSamplePayingSession(sessionB_Id, orderB_Id);

    assert(sessionB.current_state === 'PAYING', "Session B begins in 'PAYING' state");

    let pollTicksCount = 0;
    const pollResultB = await pollUntilResolved(orderB_Id, {
      intervalMs: 100,
      timeoutMs: 3000,
      mockResolution: {
        afterPollTicks: 2,
        resolveTo: 'paid',
        paymentId: 'pay_test_poll_winner_777',
      },
      onPollTick: (t) => {
        pollTicksCount = t;
      },
    });

    assert(pollResultB.status === 'paid', "Polling loop resolved order status to 'paid'");
    assert(pollTicksCount >= 2, `Polling polled ${pollTicksCount} tick(s) before resolution`);

    const updatedSessionB = sessionStore.get(sessionB_Id)!;
    assert(
      updatedSessionB.current_state === 'COMPLETED',
      "Polling successfully transitioned session to 'COMPLETED'"
    );

    // Now simulate delayed webhook arriving after poll has ALREADY resolved the session
    console.log('\nSimulating delayed webhook arriving after polling already resolved session...');
    const delayedWebhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_delayed_wh_888',
            order_id: orderB_Id,
            amount: 149900,
            currency: 'INR',
            status: 'captured',
            notes: { sessionId: sessionB_Id },
          },
        },
      },
    };
    const delayedSig = generateWebhookSignature(delayedWebhookPayload, TEST_WEBHOOK_SECRET);
    const resDelayed = await makePostRequest(
      serverUrl,
      '/api/webhooks/razorpay',
      delayedWebhookPayload,
      { 'x-razorpay-signature': delayedSig }
    );

    assert(resDelayed.status === 200, 'Delayed webhook returns HTTP 200 OK');
    const sessionBAfterDelayed = sessionStore.get(sessionB_Id)!;
    assert(
      sessionBAfterDelayed.current_state === 'COMPLETED',
      'Delayed webhook did not corrupt or re-mutate completed session'
    );

    // ----------------------------------------------------------------
    // [Test Suite 5] Scenario (c): Duplicate Webhook Delivery & Idempotency
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 5] Scenario (c): Duplicate Webhook Delivery & Idempotency');
    console.log('----------------------------------------------------------------\n');

    const sessionC_Id = `test-dupe-wh-${Date.now()}`;
    const orderC_Id = `order_test_dupe_${Date.now().toString().slice(-6)}`;
    createSamplePayingSession(sessionC_Id, orderC_Id);

    const dupePayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_dupe_unique_555',
            order_id: orderC_Id,
            amount: 149900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const dupeSig = generateWebhookSignature(dupePayload, TEST_WEBHOOK_SECRET);

    // First delivery
    const resDupe1 = await makePostRequest(serverUrl, '/api/webhooks/razorpay', dupePayload, {
      'x-razorpay-signature': dupeSig,
    });
    assert(resDupe1.status === 200, '1st webhook delivery returns 200 OK');
    assert(resDupe1.body.status === 'processed', "1st delivery status is 'processed'");

    // Second (duplicate) delivery of identical event
    const resDupe2 = await makePostRequest(serverUrl, '/api/webhooks/razorpay', dupePayload, {
      'x-razorpay-signature': dupeSig,
    });
    assert(resDupe2.status === 200, '2nd duplicate delivery returns 200 OK');
    assert(
      resDupe2.body.status === 'duplicate_ignored',
      "2nd delivery identified as 'duplicate_ignored'"
    );

    // Check conversation history has only 1 success message (not duplicated)
    const sessionC = sessionStore.get(sessionC_Id)!;
    const successMessages = sessionC.conversation_history.filter((m) =>
      m.content.includes('Payment Successful')
    );
    assert(
      successMessages.length === 1,
      `Exactly 1 confirmation message in chat history (found: ${successMessages.length})`
    );

    // ----------------------------------------------------------------
    // [Test Suite 6] Scenario (e): Payment Failed Handling (payment.failed)
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 6] Scenario (e): Payment Failed Webhook Handling');
    console.log('----------------------------------------------------------------\n');

    const sessionE_Id = `test-wh-fail-${Date.now()}`;
    const orderE_Id = `order_test_fail_${Date.now().toString().slice(-6)}`;
    const sessionE = createSamplePayingSession(sessionE_Id, orderE_Id);

    const failPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_fail_declined_111',
            order_id: orderE_Id,
            amount: 149900,
            currency: 'INR',
            status: 'failed',
            error_code: 'BAD_REQUEST_PAYMENT_DECLINED',
            error_description: 'Card declined: insufficient funds or invalid CVV.',
            error_reason: 'payment_failed',
          },
        },
      },
    };
    const failSig = generateWebhookSignature(failPayload, TEST_WEBHOOK_SECRET);

    const resFail = await makePostRequest(serverUrl, '/api/webhooks/razorpay', failPayload, {
      'x-razorpay-signature': failSig,
    });

    assert(resFail.status === 200, 'Failed payment webhook acknowledged with 200 OK');
    assert(resFail.body.status === 'processed', "Response status is 'processed'");

    const updatedSessionE = sessionStore.get(sessionE_Id)!;
    assert(
      updatedSessionE.current_state === 'FAILED',
      "Session state successfully transitioned to 'FAILED'"
    );

    const lastMsgE = updatedSessionE.conversation_history.slice(-1)[0];
    assert(
      lastMsgE.content.includes('Payment Failed'),
      'Agent reply clearly communicates Payment Failed'
    );
    assert(
      lastMsgE.content.includes('Card declined: insufficient funds'),
      'Agent reply embeds readable bank failure reason'
    );
    assert(
      lastMsgE.content.includes('try again') || lastMsgE.content.includes('modify'),
      'Agent reply presents actionable recovery options'
    );

    // ----------------------------------------------------------------
    // [Test Suite 7] Scenario (f): State Guard Invariant Defense (Stray Webhooks)
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 7] Scenario (f): State Guard Invariant Defense (Stray Webhooks)');
    console.log('----------------------------------------------------------------\n');

    // 7A: Stray webhook on IDLE session
    const idleSessionId = `test-idle-guard-${Date.now()}`;
    const idleSession = sessionStore.getOrCreate(idleSessionId);
    idleSession.current_state = 'IDLE';
    sessionStore.save(idleSession);

    const strayPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_stray_idle',
            order_id: 'order_non_existent',
            amount: 149900,
            notes: { sessionId: idleSessionId },
          },
        },
      },
    };
    const straySig = generateWebhookSignature(strayPayload, TEST_WEBHOOK_SECRET);
    await makePostRequest(serverUrl, '/api/webhooks/razorpay', strayPayload, {
      'x-razorpay-signature': straySig,
    });

    const checkIdleSession = sessionStore.get(idleSessionId)!;
    assert(
      checkIdleSession.current_state === 'IDLE',
      "Guard defense: Stray webhook on 'IDLE' session does NOT transition state"
    );

    // ----------------------------------------------------------------
    // [Test Suite 8] Explainable Audit Trail Logging (Step 9 Feed)
    // ----------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('[Test Suite 8] Explainable Audit Trail Logging Verification');
    console.log('----------------------------------------------------------------\n');

    const auditTrailA = await AuditRepository.getAuditTrailBySession(sessionA_Id);
    assert(auditTrailA.length >= 1, `Retrieved ${auditTrailA.length} audit entry for session A`);
    const successAudit = auditTrailA.find((e: any) => e.action_type === 'PAYMENT_VERIFIED');
    assert(successAudit !== undefined, 'Audit trail contains PAYMENT_VERIFIED event');
    assert(successAudit?.is_money_action === true, 'Audit event is_money_action is TRUE');
    assert(
      Boolean(successAudit?.decision_rationale?.includes('webhook')),
      "Audit rationale indicates source: 'webhook'"
    );

    const auditTrailB = await AuditRepository.getAuditTrailBySession(sessionB_Id);
    const pollAudit = auditTrailB.find((e: any) => e.action_type === 'PAYMENT_VERIFIED');
    assert(pollAudit !== undefined, 'Audit trail contains poll-driven PAYMENT_VERIFIED event');
    assert(
      Boolean(pollAudit?.decision_rationale?.includes('poll')),
      "Audit rationale indicates source: 'poll'"
    );

    const auditTrailE = await AuditRepository.getAuditTrailBySession(sessionE_Id);
    const failAudit = auditTrailE.find((e: any) => e.action_type === 'PAYMENT_FAILED');
    assert(failAudit !== undefined, 'Audit trail contains PAYMENT_FAILED event');
    assert(
      Boolean(failAudit?.decision_rationale?.includes('Card declined')),
      'Audit rationale captures specific failure reason'
    );

    console.log('\n================================================================');
    console.log(` Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runPaymentTrackingTests();
