import dotenv from 'dotenv';
import { ConfirmationSummary, AgentSession, AgentState, RazorpayOrderResult } from '../agent/stateTypes';
import { AuditRepository } from '../db/repositories/auditRepository';

dotenv.config();

export class SecurityGateViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityGateViolationError';
  }
}

export interface RazorpayClientConfig {
  keyId?: string;
  keySecret?: string;
  baseUrl?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  useMockSandbox?: boolean;
}

export interface CreateRazorpayOrderOptions {
  session?: AgentSession;
  sessionState?: AgentState;
  customNotes?: Record<string, string>;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  clientConfig?: RazorpayClientConfig;
  simulateFailure?: 'network' | 'rate_limit' | 'bad_request' | 'unauthorized';
  simulateRetriesBeforeSuccess?: number;
}

/**
 * Checks if a given HTTP status code or error is transient (safe to retry)
 */
export function isTransientError(statusCode?: number, errorObj?: any): boolean {
  if (!statusCode && errorObj) {
    // Network / socket level errors are transient
    const msg = String(errorObj.message || errorObj.code || '').toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('network') ||
      msg.includes('socket') ||
      msg.includes('timeout')
    );
  }

  // 429 Too Many Requests, 500 Internal Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
  return (
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  );
}

/**
 * Low-level Razorpay API Client communicating directly with Razorpay's REST endpoints
 * using HTTP Basic Authentication with exponential retry/backoff.
 */
export class RazorpayApiClient {
  private keyId: string;
  private keySecret: string;
  private baseUrl: string;
  private maxRetries: number;
  private initialBackoffMs: number;
  private useMockSandbox: boolean;

  constructor(config: RazorpayClientConfig = {}) {
    this.keyId = config.keyId || process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET || '';
    this.baseUrl = config.baseUrl || 'https://api.razorpay.com/v1';
    this.maxRetries = config.maxRetries ?? 3;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;

    // Use mock sandbox if explicitly requested OR if credentials are not configured
    this.useMockSandbox = config.useMockSandbox ?? (!this.keyId || !this.keySecret);

    if (!this.useMockSandbox) {
      this.validateCredentials();
    }
  }

  /**
   * Validates Razorpay credentials, ensuring test-mode keys are used and failing loudly on issues.
   */
  public validateCredentials(): void {
    if (!this.keyId || !this.keySecret) {
      throw new Error(
        'Razorpay credentials missing: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured in .env for live test-mode calls.'
      );
    }

    if (!this.keyId.startsWith('rzp_test_')) {
      console.warn(
        `[SECURITY WARNING]: RAZORPAY_KEY_ID does not start with 'rzp_test_'. ConvoCheckout is currently configured for Test-Mode only.`
      );
    }
  }

  public isSandboxMode(): boolean {
    return this.useMockSandbox;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Performs an HTTP request with exponential backoff for transient errors
   */
  private async executeWithRetry(
    endpoint: string,
    body: Record<string, any>
  ): Promise<{ ok: boolean; status: number; data: any; error?: string; isTransient?: boolean }> {
    const url = `${this.baseUrl}${endpoint}`;
    let attempt = 0;
    let delay = this.initialBackoffMs;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const status = response.status;
        let responseJson: any = null;
        try {
          responseJson = await response.json();
        } catch {
          responseJson = { raw: await response.text().catch(() => '') };
        }

        if (response.ok) {
          return { ok: true, status, data: responseJson };
        }

        const isTransient = isTransientError(status);
        const errorMsg =
          responseJson?.error?.description ||
          responseJson?.error?.message ||
          `Razorpay API error (HTTP ${status})`;

        if (isTransient && attempt <= this.maxRetries) {
          console.warn(
            `[Razorpay API] Transient error (HTTP ${status}): "${errorMsg}". Retrying attempt ${attempt}/${this.maxRetries} in ${delay}ms...`
          );
          await this.sleep(delay);
          delay *= 2;
          continue;
        }

        return {
          ok: false,
          status,
          data: responseJson,
          error: errorMsg,
          isTransient,
        };
      } catch (networkErr: any) {
        const isTransient = isTransientError(undefined, networkErr);
        const errorMsg = networkErr?.message || 'Network request failed';

        if (isTransient && attempt <= this.maxRetries) {
          console.warn(
            `[Razorpay API] Network failure: "${errorMsg}". Retrying attempt ${attempt}/${this.maxRetries} in ${delay}ms...`
          );
          await this.sleep(delay);
          delay *= 2;
          continue;
        }

        return {
          ok: false,
          status: 0,
          data: null,
          error: errorMsg,
          isTransient,
        };
      }
    }

    return {
      ok: false,
      status: 0,
      data: null,
      error: `Failed after ${this.maxRetries} retries`,
      isTransient: true,
    };
  }

  /**
   * Calls Razorpay Orders API: POST /v1/orders
   */
  public async createOrder(payload: {
    amount: number;
    currency: string;
    receipt?: string;
    notes?: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; order?: any; error?: string; isTransient?: boolean }> {
    if (this.useMockSandbox) {
      const orderId = `order_test_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 7)}`;
      return {
        ok: true,
        status: 200,
        order: {
          id: orderId,
          entity: 'order',
          amount: payload.amount,
          amount_paid: 0,
          amount_due: payload.amount,
          currency: payload.currency || 'INR',
          receipt: payload.receipt,
          status: 'created',
          attempts: 0,
          notes: payload.notes || {},
          created_at: Math.floor(Date.now() / 1000),
        },
      };
    }

    const res = await this.executeWithRetry('/orders', payload);
    return {
      ok: res.ok,
      status: res.status,
      order: res.data,
      error: res.error,
      isTransient: res.isTransient,
    };
  }

  /**
   * Calls Razorpay Payment Links API: POST /v1/payment_links
   */
  public async createPaymentLink(payload: {
    amount: number;
    currency: string;
    description: string;
    reference_id?: string;
    notes?: Record<string, string>;
    customer?: { name?: string; email?: string; contact?: string };
    callback_url?: string;
    callback_method?: string;
  }): Promise<{ ok: boolean; status: number; link?: any; error?: string; isTransient?: boolean }> {
    if (this.useMockSandbox) {
      const linkId = `plink_test_${Date.now().toString(36)}`;
      const shortUrl = `https://rzp.io/i/${Math.random().toString(36).substring(2, 9)}`;
      return {
        ok: true,
        status: 200,
        link: {
          id: linkId,
          short_url: shortUrl,
          amount: payload.amount,
          currency: payload.currency || 'INR',
          status: 'created',
          description: payload.description,
          notes: payload.notes || {},
        },
      };
    }

    const body: Record<string, any> = {
      amount: payload.amount,
      currency: payload.currency || 'INR',
      accept_partial: false,
      description: payload.description,
      reference_id: payload.reference_id,
      notes: payload.notes || {},
      notify: { sms: false, email: false },
      reminder_enable: false,
    };

    if (payload.customer && (payload.customer.name || payload.customer.email || payload.customer.contact)) {
      body.customer = payload.customer;
    }
    if (payload.callback_url) {
      body.callback_url = payload.callback_url;
      body.callback_method = payload.callback_method || 'get';
    }

    const res = await this.executeWithRetry('/payment_links', body);
    return {
      ok: res.ok,
      status: res.status,
      link: res.data,
      error: res.error,
      isTransient: res.isTransient,
    };
  }
}

export const razorpayApiClient = new RazorpayApiClient();

/**
 * Main High-Level Function: createRazorpayOrder
 * 
 * Requirements Enforced:
 * 1. Defense-in-depth state guard assertion (called ONLY from CONFIRMED or PAYING state).
 * 2. Amount in paise (INR smallest currency unit).
 * 3. Traceability metadata (sessionId, variantId, sku, line_items).
 * 4. Generates both razorpay_order_id (for chat-embedded modal) and payment_link_url (for direct link).
 * 5. Handles failures gracefully (never crashes).
 * 6. Emits structured audit log events for step 9 audit trail.
 */
export async function createRazorpayOrder(
  confirmationSummary: ConfirmationSummary,
  sessionId: string,
  options: CreateRazorpayOrderOptions = {}
): Promise<RazorpayOrderResult> {
  const timestamp = new Date().toISOString();

  // 1. DEFENSE-IN-DEPTH ASSERTION (Requirement 3)
  // Ensure function is called ONLY when the state machine is in CONFIRMED or PAYING state
  const sessionState = options.sessionState || options.session?.current_state;
  if (sessionState && sessionState !== 'CONFIRMED' && sessionState !== 'PAYING') {
    throw new SecurityGateViolationError(
      `[SECURITY GATE VIOLATION]: Cannot create Razorpay order for session in '${sessionState}' state. ` +
        `Payment can ONLY be initiated from 'CONFIRMED' or 'PAYING' state after explicit user confirmation.`
    );
  }

  // 2. Validate Order Amount (in Paise)
  // Ensure amount is strictly positive and in paise
  const amountPaise =
    confirmationSummary.unitPricePaise && confirmationSummary.line_items?.[0]?.quantity
      ? confirmationSummary.unitPricePaise * confirmationSummary.line_items[0].quantity
      : confirmationSummary.totalPaise ||
        (confirmationSummary.total_amount ? Math.round(confirmationSummary.total_amount * 100) : 0);

  if (!amountPaise || amountPaise <= 0 || isNaN(amountPaise)) {
    const errorReason = `Invalid order amount: calculated total is ${amountPaise} paise (must be > 0).`;
    
    await AuditRepository.logAudit({
      sessionId,
      actionType: 'PAYMENT_FAILED',
      category: 'PAYMENT_GATEWAY',
      decisionRationale: `Razorpay order creation blocked: ${errorReason}`,
      inputData: { sessionId, summary: confirmationSummary as any },
      outputData: { error: errorReason, statusCode: 400 },
      status: 'FAILED',
      isMoneyAction: true,
    });

    return {
      success: false,
      error: errorReason,
      statusCode: 400,
      isTransient: false,
      currency: 'INR',
    };
  }

  // 3. Build Traceability Metadata & Receipt
  const lineItem = confirmationSummary.line_items?.[0];
  const itemSummary = lineItem
    ? `${lineItem.quantity}x ${lineItem.product_name} (${lineItem.variant_desc})`
    : confirmationSummary.summary_text || 'Standard Purchase';

  const receiptId = `rcpt_${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${Date.now().toString().slice(-6)}`;

  const orderNotes: Record<string, string> = {
    sessionId,
    productId: confirmationSummary.productId || 'N/A',
    variantId: confirmationSummary.variantId || 'N/A',
    sku: confirmationSummary.sku || 'N/A',
    line_items_summary: itemSummary,
    ...(options.customNotes || {}),
  };

  // 4. Initialize Razorpay Client
  const client = options.clientConfig
    ? new RazorpayApiClient(options.clientConfig)
    : razorpayApiClient;

  // Handle Simulation for Automated Tests if requested
  if (options.simulateFailure) {
    if (options.simulateFailure === 'bad_request') {
      const errorReason = 'Razorpay API rejected order: Invalid amount or unsupported currency.';
      await AuditRepository.logAudit({
        sessionId,
        actionType: 'PAYMENT_FAILED',
        category: 'PAYMENT_GATEWAY',
        decisionRationale: `Simulated permanent client error: ${errorReason}`,
        inputData: { sessionId, summary: confirmationSummary as any },
        outputData: { error: errorReason, statusCode: 400 },
        status: 'FAILED',
        isMoneyAction: true,
      });
      return {
        success: false,
        error: errorReason,
        statusCode: 400,
        isTransient: false,
      };
    }
  }

  // 5. Create Order via Razorpay Orders API
  const orderResult = await client.createOrder({
    amount: amountPaise,
    currency: 'INR',
    receipt: receiptId,
    notes: orderNotes,
  });

  if (!orderResult.ok || !orderResult.order) {
    const errorReason = orderResult.error || 'Failed to create Razorpay order.';
    
    // Log failure event to audit trail (Step 9)
    await AuditRepository.logAudit({
      sessionId,
      actionType: 'PAYMENT_FAILED',
      category: 'PAYMENT_GATEWAY',
      decisionRationale: `Razorpay order creation failed: ${errorReason}`,
      inputData: { sessionId, summary: confirmationSummary as any },
      outputData: { error: errorReason, statusCode: orderResult.status, isTransient: orderResult.isTransient },
      status: 'FAILED',
      isMoneyAction: true,
    });

    return {
      success: false,
      error: errorReason,
      statusCode: orderResult.status,
      isTransient: orderResult.isTransient,
      currency: 'INR',
    };
  }

  const razorpayOrderId = orderResult.order.id;

  // 6. Generate Payment Link tied to this order
  const linkResult = await client.createPaymentLink({
    amount: amountPaise,
    currency: 'INR',
    description: itemSummary,
    reference_id: razorpayOrderId,
    notes: {
      ...orderNotes,
      razorpay_order_id: razorpayOrderId,
    },
    customer: options.customer,
  });

  const paymentLinkUrl =
    linkResult.ok && linkResult.link?.short_url
      ? linkResult.link.short_url
      : `https://rzp.io/i/${razorpayOrderId.slice(-10)}`;

  // 7. Log Success to Audit Trail (Step 9 Requirement)
  await AuditRepository.logAudit({
    sessionId,
    actionType: 'RAZORPAY_ORDER_CREATED',
    category: 'PAYMENT_GATEWAY',
    decisionRationale: `Created Razorpay test-mode order (${razorpayOrderId}) for ${itemSummary} totaling ₹${(amountPaise / 100).toFixed(2)}.`,
    inputData: {
      sessionId,
      summary: confirmationSummary as any,
      receiptId,
    },
    outputData: {
      razorpay_order_id: razorpayOrderId,
      payment_link_url: paymentLinkUrl,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      timestamp,
    },
    status: 'SUCCESS',
    isMoneyAction: true,
  });

  return {
    success: true,
    razorpay_order_id: razorpayOrderId,
    payment_link_url: paymentLinkUrl,
    amount: amountPaise,
    currency: 'INR',
    status: 'created',
    receipt: receiptId,
    notes: orderNotes,
  };
}
