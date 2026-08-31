/**
 * ConvoCheckout — Frontend Client Logic
 * Google Stitch Responsive Design Integration
 */

// State
let currentSessionId = localStorage.getItem('convocheckout_session_id') || `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
localStorage.setItem('convocheckout_session_id', currentSessionId);
let currentState = 'IDLE';
let catalogProducts = [];
let isProcessing = false;

// DOM Elements
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSendMessage = document.getElementById('btn-send-message');
const processingIndicator = document.getElementById('processing-indicator');
const processingText = document.getElementById('processing-text');
const stateBadgeContainer = document.getElementById('state-badge-container');
const currentStateLabel = document.getElementById('current-state-label');
const sessionIdDisplay = document.getElementById('session-id-display');
const btnResetSession = document.getElementById('btn-reset-session');
const viewModeDesktop = document.getElementById('view-mode-desktop');
const viewModeMobile = document.getElementById('view-mode-mobile');
const btnToggleMobileLogs = document.getElementById('btn-toggle-mobile-logs');
const btnCloseSidebarMobile = document.getElementById('btn-close-sidebar-mobile');
const systemSidebar = document.getElementById('system-sidebar');

// Sidebar Tabs
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const auditTrailList = document.getElementById('audit-trail-list');
const auditCount = document.getElementById('audit-count');
const btnRefreshAudit = document.getElementById('btn-refresh-audit');
const activeOrderPanel = document.getElementById('active-order-panel');
const catalogList = document.getElementById('catalog-list');
const catalogCount = document.getElementById('catalog-count');
const catalogSearchInput = document.getElementById('catalog-search-input');
const btnSimPaymentSuccess = document.getElementById('btn-sim-payment-success');
const btnSimPaymentFailure = document.getElementById('btn-sim-payment-failure');

// Receipt Modal
const receiptModal = document.getElementById('receipt-modal');
const receiptModalContent = document.getElementById('receipt-modal-content');
const btnCloseReceipt = document.getElementById('btn-close-receipt');
const btnPrintReceipt = document.getElementById('btn-print-receipt');

// Initialize UI
function init() {
  sessionIdDisplay.textContent = currentSessionId;
  setupEventListeners();
  loadCatalog();
  syncSession();
}

// Event Listeners
function setupEventListeners() {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || isProcessing) return;
    chatInput.value = '';
    handleUserMessage(text);
  });

  // Demo Prompt Pills
  document.querySelectorAll('.demo-prompt-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const prompt = pill.getAttribute('data-prompt');
      if (prompt && !isProcessing) {
        handleUserMessage(prompt);
      }
    });
  });

  // Reset Session
  btnResetSession.addEventListener('click', async () => {
    if (confirm('Start a new session? This will clear current conversation and state.')) {
      currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      localStorage.setItem('convocheckout_session_id', currentSessionId);
      sessionIdDisplay.textContent = currentSessionId;
      messagesContainer.innerHTML = `
        <div class="flex items-start gap-3.5 max-w-[85%] animate-fade-in">
          <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-border-gray">
            <span class="material-symbols-outlined text-secondary text-sm">smart_toy</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="font-label-md text-xs text-text-secondary">ConvoCheckout AI • Agent</span>
            <div class="bg-surface-container-low border border-border-gray p-4 rounded-xl rounded-tl-xs text-text-main font-body-md text-sm leading-relaxed shadow-xs">
              <p class="font-medium text-ink-navy mb-1">New Session Started!</p>
              <p class="text-secondary text-xs mb-2">I am ready. Tell me what you'd like to order in natural language.</p>
              <p class="text-xs font-mono-sm text-secondary">Try: <em>"buy 1 classic oxford shirt in size M navy blue"</em>.</p>
            </div>
          </div>
        </div>
      `;
      updateStateBadge('IDLE');
      syncAuditLogs([]);
      updateActiveOrderDisplay(null);
    }
  });

  // View Mode Switcher
  viewModeDesktop.addEventListener('click', () => {
    document.body.classList.remove('mobile-preview-mode');
    viewModeDesktop.classList.add('bg-white', 'text-ink-navy', 'shadow-xs');
    viewModeDesktop.classList.remove('text-secondary');
    viewModeMobile.classList.remove('bg-white', 'text-ink-navy', 'shadow-xs');
    viewModeMobile.classList.add('text-secondary');
  });

  viewModeMobile.addEventListener('click', () => {
    document.body.classList.add('mobile-preview-mode');
    viewModeMobile.classList.add('bg-white', 'text-ink-navy', 'shadow-xs');
    viewModeMobile.classList.remove('text-secondary');
    viewModeDesktop.classList.remove('bg-white', 'text-ink-navy', 'shadow-xs');
    viewModeDesktop.classList.add('text-secondary');
  });

  // Mobile Drawer Toggle
  btnToggleMobileLogs.addEventListener('click', () => {
    systemSidebar.classList.remove('hidden');
    systemSidebar.classList.add('mobile-open');
  });

  btnCloseSidebarMobile.addEventListener('click', () => {
    systemSidebar.classList.remove('mobile-open');
    systemSidebar.classList.add('hidden');
  });

  // Sidebar Tabs
  sidebarTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach((t) => {
        t.classList.remove('active', 'text-ink-navy', 'font-semibold', 'border-ink-navy');
        t.classList.add('text-text-secondary', 'border-transparent');
      });
      tab.classList.add('active', 'text-ink-navy', 'font-semibold', 'border-ink-navy');
      tab.classList.remove('text-text-secondary', 'border-transparent');

      const targetTab = tab.getAttribute('data-tab');
      tabPanes.forEach((pane) => {
        if (pane.id === `tab-content-${targetTab}`) {
          pane.classList.remove('hidden');
        } else {
          pane.classList.add('hidden');
        }
      });
    });
  });

  // Refresh Audit Button
  btnRefreshAudit.addEventListener('click', () => fetchAuditTrail());

  // Catalog Search Input
  catalogSearchInput.addEventListener('input', (e) => {
    filterCatalog(e.target.value);
  });

  // Payment Simulators
  btnSimPaymentSuccess.addEventListener('click', () => simulatePayment('success'));
  btnSimPaymentFailure.addEventListener('click', () => simulatePayment('failed'));

  // Scenario Buttons
  document.querySelectorAll('.btn-run-scenario').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scenario = btn.getAttribute('data-scenario');
      runScenario(scenario);
    });
  });

  // Receipt Modal Close
  btnCloseReceipt.addEventListener('click', () => {
    receiptModal.classList.add('hidden');
  });

  btnPrintReceipt.addEventListener('click', () => {
    window.print();
  });
}

// Sync Session with Server
async function syncSession() {
  try {
    const res = await fetch(`/api/chat/session/${currentSessionId}`);
    const data = await res.json();
    if (data.success && data.data?.session) {
      const session = data.data.session;
      updateStateBadge(session.current_state || 'IDLE');
      if (data.data.auditLogs) {
        syncAuditLogs(data.data.auditLogs);
      }
      updateActiveOrderDisplay(session.active_order_summary, session.active_razorpay_order);
    }
  } catch (err) {
    console.warn('Session sync warning:', err);
  }
}

// Send user message to agent API
async function handleUserMessage(text) {
  if (isProcessing) return;
  isProcessing = true;
  setProcessingUI(true, 'Agent analyzing intent & matching catalog...');

  // Render User Bubble (Stitch Style)
  appendUserMessage(text);

  try {
    const res = await fetch('/api/chat/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: text,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to process message');
    }

    const response = data.data;
    updateStateBadge(response.state);

    // Render Agent Response
    appendAgentResponse(response);

    // Update Audit Trail & Active Order
    if (response.auditLogs) {
      syncAuditLogs(response.auditLogs);
    }
    updateActiveOrderDisplay(response.order_summary, response.razorpay_order);

  } catch (err) {
    console.error('Chat error:', err);
    appendSystemError(`Error communicating with agent: ${err.message}`);
  } finally {
    isProcessing = false;
    setProcessingUI(false);
  }
}

// UI Append Functions
function appendUserMessage(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgEl = document.createElement('div');
  msgEl.className = 'flex items-start gap-3.5 flex-row-reverse self-end max-w-[85%] animate-fade-in';
  msgEl.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-ink-navy text-white flex items-center justify-center shrink-0 shadow-xs">
      <span class="material-symbols-outlined text-sm">person</span>
    </div>
    <div class="flex flex-col gap-1 items-end">
      <span class="font-label-md text-xs text-text-secondary">You • ${time}</span>
      <div class="bg-ink-navy text-white px-4 py-3 rounded-xl rounded-tr-xs text-sm font-body-md shadow-xs leading-relaxed">
        <p>${escapeHtml(text)}</p>
      </div>
    </div>
  `;
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
}

function appendAgentResponse(response) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const agentMsg = response.agent_message || 'I have processed your request.';
  const state = response.state;

  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-start gap-3.5 max-w-[90%] md:max-w-[85%] animate-fade-in';

  let cardHtml = '';

  // Case 1: Awaiting Confirmation -> Render Stitch Order Confirmation Card
  if (state === 'AWAITING_CONFIRMATION' && response.order_summary) {
    const s = response.order_summary;
    const items = s.line_items || [];
    cardHtml = `
      <div class="w-full border border-border-gray rounded-card overflow-hidden bg-white mt-3 shadow-xs">
        <div class="px-4 py-3 border-b border-border-gray bg-light-gray flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-base text-ink-navy">shopping_cart_checkout</span>
            <h3 class="font-headline-sm text-sm font-semibold text-text-main">Order Confirmation</h3>
          </div>
          <span class="font-mono-sm text-xs text-secondary font-medium">Ready for Confirmation</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-light-gray/60 border-b border-border-gray text-text-secondary font-mono-sm">
                <th class="py-2.5 px-3.5 font-medium">Item</th>
                <th class="py-2.5 px-3.5 font-medium">Variant</th>
                <th class="py-2.5 px-3.5 font-medium text-right">Qty</th>
                <th class="py-2.5 px-3.5 font-medium text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr class="border-b border-border-gray/60">
                  <td class="py-2.5 px-3.5 font-medium text-text-main">${escapeHtml(item.product_name)}</td>
                  <td class="py-2.5 px-3.5 text-text-secondary">${escapeHtml(item.size || 'Standard')} • ${escapeHtml(item.color || 'Standard')}</td>
                  <td class="py-2.5 px-3.5 text-right font-mono-sm">${item.quantity}</td>
                  <td class="py-2.5 px-3.5 text-right font-mono-sm font-medium">₹${(item.unit_price_paise / 100).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td class="py-3 px-3.5 font-semibold text-text-main text-right" colspan="3">Total</td>
                <td class="py-3 px-3.5 font-mono-md text-sm font-bold text-ink-navy text-right">${s.totalFormatted || ('₹' + (s.total_paise / 100).toFixed(2))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="p-3 bg-light-gray border-t border-border-gray flex justify-end gap-2.5">
          <button class="btn-order-cancel px-3.5 py-1.5 bg-white border border-border-gray text-text-main text-xs font-medium rounded-button hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button class="btn-order-confirm px-4 py-1.5 bg-ink-navy text-white text-xs font-semibold rounded-button hover:opacity-90 transition-opacity flex items-center gap-1">
            <span>Confirm & Pay</span>
            <span class="material-symbols-outlined text-xs">arrow_forward</span>
          </button>
        </div>
      </div>
    `;
  }

  // Case 2: Paying State -> Render Razorpay Checkout Card
  else if (state === 'PAYING' && response.razorpay_order) {
    const rzp = response.razorpay_order;
    const paymentLink = response.payment_link_url || rzp.payment_link_url || '#';
    cardHtml = `
      <div class="w-full border border-indigo-200 rounded-card overflow-hidden bg-indigo-50/40 mt-3 p-4 shadow-xs">
        <div class="flex items-center justify-between mb-2">
          <span class="font-headline-sm text-xs font-bold text-indigo-900 flex items-center gap-1">
            <span class="material-symbols-outlined text-base text-indigo-600">lock</span>
            Razorpay Test Checkout
          </span>
          <span class="bg-indigo-100 text-indigo-800 text-[10px] font-mono-sm px-2 py-0.5 rounded font-semibold">
            ${rzp.razorpay_order_id || 'ORDER_CREATED'}
          </span>
        </div>
        <p class="text-xs text-indigo-950 mb-3">
          Order created for <strong>₹${(rzp.amount / 100).toFixed(2)}</strong>. Complete payment using Razorpay Test sandbox.
        </p>
        <div class="flex flex-wrap gap-2">
          <a href="${paymentLink}" target="_blank" class="px-4 py-2 bg-ink-navy text-white text-xs font-semibold rounded-button hover:opacity-90 transition-opacity inline-flex items-center gap-1 shadow-xs">
            <span>Open Razorpay Payment Page</span>
            <span class="material-symbols-outlined text-xs">open_in_new</span>
          </a>
          <button class="btn-sim-quick-pay px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-button hover:bg-emerald-700 transition-colors inline-flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">bolt</span>
            <span>Simulate Payment Captured</span>
          </button>
        </div>
      </div>
    `;
  }

  // Case 3: Completed State -> Render Stitch Order Confirmed Receipt Card
  else if (state === 'COMPLETED' && response.order_summary) {
    const s = response.order_summary;
    const rzp = response.razorpay_order;
    const orderId = rzp?.razorpay_order_id || `ORD-${Date.now().toString().slice(-6)}`;
    cardHtml = `
      <div class="w-full border border-border-gray rounded-card overflow-hidden bg-white mt-3 shadow-xs">
        <div class="bg-emerald-50 border-b border-emerald-100 p-4 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>
            <span class="font-headline-sm text-sm font-semibold text-emerald-950">Order Confirmed</span>
          </div>
          <span class="bg-ink-navy text-white px-2 py-0.5 rounded text-[11px] font-mono-sm">#${orderId}</span>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <div class="flex justify-between items-start border-b border-border-gray pb-3">
            <div>
              <h4 class="font-medium text-ink-navy text-sm">${escapeHtml(s.productName || 'Order Items')}</h4>
              <p class="text-xs text-secondary">${escapeHtml(s.size ? `Size: ${s.size}` : '')} ${escapeHtml(s.color ? `• Color: ${s.color}` : '')}</p>
            </div>
            <span class="font-mono-md text-sm font-semibold text-text-main">${s.totalFormatted || ('₹' + (s.total_paise / 100).toFixed(2))}</span>
          </div>
          <div class="bg-surface-container-low p-2.5 rounded border border-border-gray flex items-center gap-2.5">
            <span class="material-symbols-outlined text-secondary text-base">credit_card</span>
            <div class="flex flex-col">
              <span class="text-[11px] text-secondary">Paid via Razorpay Test Sandbox</span>
              <span class="font-mono-sm text-xs font-medium text-text-main">UPI / Test Card **** 4242</span>
            </div>
          </div>
          <button class="btn-download-receipt w-full bg-white border border-border-gray text-ink-navy py-2 rounded text-xs font-semibold hover:bg-light-gray transition-colors flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-sm">receipt</span>
            Download Receipt
          </button>
        </div>
      </div>
    `;
  }

  // Case 4: Payment Failed -> Render Failure Box with Retry Option
  else if (state === 'FAILED') {
    cardHtml = `
      <div class="w-full border border-rose-200 rounded-card overflow-hidden bg-rose-50/50 mt-3 p-4 shadow-xs">
        <div class="flex items-center gap-1.5 text-rose-800 font-semibold text-xs mb-1">
          <span class="material-symbols-outlined text-base text-rose-600">error</span>
          Payment Failed / Declined
        </div>
        <p class="text-xs text-rose-950 mb-3">
          The transaction was declined by the bank or cancelled. Your session is safely preserved.
        </p>
        <button class="btn-order-retry px-3.5 py-1.5 bg-ink-navy text-white text-xs font-semibold rounded-button hover:opacity-90 transition-opacity">
          Retry Checkout
        </button>
      </div>
    `;
  }

  wrapper.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-border-gray shadow-xs">
      <span class="material-symbols-outlined text-secondary text-sm">smart_toy</span>
    </div>
    <div class="flex flex-col gap-1 w-full">
      <span class="font-label-md text-xs text-text-secondary">ConvoCheckout AI • ${time}</span>
      <div class="bg-surface-container-low border border-border-gray p-4 rounded-xl rounded-tl-xs text-text-main font-body-md text-sm leading-relaxed shadow-xs">
        <div class="whitespace-pre-wrap">${formatMarkdownText(agentMsg)}</div>
        ${cardHtml}
      </div>
    </div>
  `;

  // Attach card button handlers
  const btnConfirm = wrapper.querySelector('.btn-order-confirm');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => handleUserMessage('Yes, confirm and pay'));
  }

  const btnCancel = wrapper.querySelector('.btn-order-cancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => handleUserMessage('No, cancel this order'));
  }

  const btnRetry = wrapper.querySelector('.btn-order-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => handleUserMessage('Yes, confirm and pay'));
  }

  const btnQuickPay = wrapper.querySelector('.btn-sim-quick-pay');
  if (btnQuickPay) {
    btnQuickPay.addEventListener('click', () => simulatePayment('success'));
  }

  const btnReceipt = wrapper.querySelector('.btn-download-receipt');
  if (btnReceipt) {
    btnReceipt.addEventListener('click', () => showReceipt(response));
  }

  messagesContainer.appendChild(wrapper);
  scrollToBottom();
}

function appendSystemError(message) {
  const errEl = document.createElement('div');
  errEl.className = 'flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono-sm animate-fade-in';
  errEl.innerHTML = `
    <span class="material-symbols-outlined text-sm text-rose-600">warning</span>
    <span>${escapeHtml(message)}</span>
  `;
  messagesContainer.appendChild(errEl);
  scrollToBottom();
}

// Processing Indicator UI
function setProcessingUI(processing, label = 'Processing...') {
  if (processing) {
    processingIndicator.classList.remove('hidden');
    processingText.textContent = label;
    btnSendMessage.disabled = true;
    btnSendMessage.classList.add('opacity-50');
  } else {
    processingIndicator.classList.add('hidden');
    btnSendMessage.disabled = false;
    btnSendMessage.classList.remove('opacity-50');
  }
}

// State Badge Updater
function updateStateBadge(state) {
  currentState = state || 'IDLE';
  currentStateLabel.textContent = `STATE: ${currentState}`;
  stateBadgeContainer.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono-sm badge-state-${currentState}`;
}

// Audit Trail Sync
async function fetchAuditTrail() {
  try {
    const res = await fetch(`/api/chat/audit/${currentSessionId}`);
    const data = await res.json();
    if (data.success && data.data) {
      syncAuditLogs(data.data);
    }
  } catch (err) {
    console.warn('Failed to fetch audit logs:', err);
  }
}

function syncAuditLogs(logs) {
  if (!logs || !Array.isArray(logs)) return;
  auditCount.textContent = logs.length;

  if (logs.length === 0) {
    auditTrailList.innerHTML = `
      <div class="text-center py-8 text-xs text-text-secondary font-mono-sm">
        Waiting for first user transaction action...
      </div>
    `;
    return;
  }

  auditTrailList.innerHTML = logs.map((log) => {
    const timeStr = log.created_at ? new Date(log.created_at).toISOString().substring(11, 23) : '00:00:00.000';
    const isMoney = log.is_money_action;
    const actionType = log.action_type || 'SYSTEM_ACTION';

    return `
      <div class="py-2.5 px-3 border border-border-gray rounded-lg bg-white flex flex-col gap-1.5 shadow-2xs hover:border-ink-navy transition-colors">
        <div class="flex justify-between items-center text-[11px] font-mono-sm">
          <span class="text-text-secondary">${timeStr}</span>
          <div class="flex items-center gap-1">
            ${isMoney ? '<span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">MONEY ACTION</span>' : ''}
            <span class="px-1.5 py-0.2 rounded bg-surface-container text-ink-navy font-medium text-[10px]">${escapeHtml(actionType)}</span>
          </div>
        </div>
        <p class="text-xs text-text-main font-body-sm leading-snug">
          ${escapeHtml(log.decision_rationale || log.action_type)}
        </p>
        ${log.actor ? `<span class="text-[10px] text-text-secondary font-mono-sm">Actor: ${escapeHtml(log.actor)}</span>` : ''}
      </div>
    `;
  }).join('');
}

// Active Order Display in Sidebar
function updateActiveOrderDisplay(orderSummary, razorpayOrder) {
  if (!orderSummary && !razorpayOrder) {
    activeOrderPanel.innerHTML = `
      <div class="text-xs text-text-secondary font-mono-sm text-center py-4">
        No active order in this session.
      </div>
    `;
    return;
  }

  const s = orderSummary || {};
  const rzp = razorpayOrder || {};
  activeOrderPanel.innerHTML = `
    <div class="flex justify-between items-center border-b border-border-gray pb-2">
      <span class="font-medium text-xs text-ink-navy">${escapeHtml(s.productName || 'Order Item')}</span>
      <span class="font-mono-sm text-xs font-bold text-text-main">${s.totalFormatted || ('₹' + ((s.total_paise || rzp.amount || 0) / 100).toFixed(2))}</span>
    </div>
    <div class="text-[11px] font-mono-sm flex flex-col gap-1 text-text-secondary pt-1">
      <div class="flex justify-between">
        <span>Razorpay Order ID:</span>
        <span class="text-text-main font-semibold">${rzp.razorpay_order_id || 'Pending'}</span>
      </div>
      <div class="flex justify-between">
        <span>Quantity:</span>
        <span class="text-text-main">${s.quantity || 1}</span>
      </div>
      <div class="flex justify-between">
        <span>Status:</span>
        <span class="text-ink-navy font-semibold">${currentState}</span>
      </div>
    </div>
  `;
}

// Catalog Loader
async function loadCatalog() {
  try {
    catalogCount.textContent = 'Loading...';
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && data.data) {
      catalogProducts = data.data;
      catalogCount.textContent = `${catalogProducts.length} Items`;
      renderCatalog(catalogProducts);
    }
  } catch (err) {
    console.warn('Failed to load catalog:', err);
    catalogCount.textContent = 'Error';
  }
}

function renderCatalog(products) {
  if (!products || products.length === 0) {
    catalogList.innerHTML = '<div class="text-xs text-secondary text-center py-4 font-mono-sm">No items found.</div>';
    return;
  }

  catalogList.innerHTML = products.map((p) => {
    const minPrice = p.variants?.length ? Math.min(...p.variants.map((v) => v.price_paise)) / 100 : 0;
    const inStock = p.variants?.some((v) => v.stock_quantity > 0);
    const primaryVariant = p.variants?.[0];
    const size = primaryVariant?.size || '';
    const color = primaryVariant?.color || '';

    const orderPrompt = `buy 1 ${p.name} ${size ? `in size ${size}` : ''} ${color ? color : ''}`.trim();

    return `
      <div class="border border-border-gray rounded-card p-3 bg-white hover:border-ink-navy transition-all shadow-2xs flex flex-col gap-2">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-medium text-xs text-ink-navy">${escapeHtml(p.name)}</h4>
            <p class="text-[11px] text-text-secondary line-clamp-1">${escapeHtml(p.description || '')}</p>
          </div>
          <span class="font-mono-sm text-xs font-semibold text-text-main shrink-0">₹${minPrice.toFixed(2)}</span>
        </div>
        <div class="flex justify-between items-center pt-1 border-t border-border-gray/50">
          <span class="text-[10px] font-mono-sm px-1.5 py-0.5 rounded ${inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
            ${inStock ? 'In Stock' : 'Out of Stock'}
          </span>
          <button class="btn-catalog-order text-xs font-medium text-ink-navy hover:underline flex items-center gap-0.5" data-prompt="${escapeHtml(orderPrompt)}">
            Order via Chat <span class="material-symbols-outlined text-xs">arrow_forward</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-catalog-order').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt && !isProcessing) {
        handleUserMessage(prompt);
      }
    });
  });
}

function filterCatalog(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderCatalog(catalogProducts);
    return;
  }
  const filtered = catalogProducts.filter((p) => {
    return p.name.toLowerCase().includes(q) ||
           (p.description && p.description.toLowerCase().includes(q)) ||
           (p.category && p.category.toLowerCase().includes(q));
  });
  renderCatalog(filtered);
}

// Payment Simulator
async function simulatePayment(action) {
  if (currentState !== 'PAYING') {
    alert(`Cannot simulate payment in current state: ${currentState}. Please initiate an order until state is PAYING first.`);
    return;
  }

  setProcessingUI(true, `Simulating Razorpay webhook (${action === 'success' ? 'payment.captured' : 'payment.failed'})...`);
  try {
    const res = await fetch('/api/chat/simulate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        action,
        reason: action === 'failed' ? 'Card declined by issuing bank (Insufficient funds)' : undefined,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to simulate payment');
    }

    const session = data.data.session;
    updateStateBadge(session.current_state);
    if (data.data.auditLogs) {
      syncAuditLogs(data.data.auditLogs);
    }

    // Append last agent message from session history
    if (session.conversation_history && session.conversation_history.length > 0) {
      const lastMsg = session.conversation_history[session.conversation_history.length - 1];
      if (lastMsg.role === 'agent') {
        appendAgentResponse({
          state: session.current_state,
          agent_message: lastMsg.content,
          order_summary: session.active_order_summary,
          razorpay_order: session.active_razorpay_order,
        });
      }
    }

    updateActiveOrderDisplay(session.active_order_summary, session.active_razorpay_order);
  } catch (err) {
    console.error('Simulation error:', err);
    alert(`Simulation failed: ${err.message}`);
  } finally {
    setProcessingUI(false);
  }
}

// Run Multi-Turn Scenarios
async function runScenario(type) {
  if (isProcessing) return;

  if (type === 'happy-path') {
    await handleUserMessage('buy 1 classic oxford shirt in size M navy blue');
  } else if (type === 'payment-fail') {
    await handleUserMessage('buy 1 classic oxford shirt in size M navy blue');
  } else if (type === 'out-of-stock') {
    await handleUserMessage('buy the vintage leather bomber jacket in size L');
  }
}

// Receipt Modal View
function showReceipt(response) {
  const s = response.order_summary || {};
  const rzp = response.razorpay_order || {};
  const orderId = rzp.razorpay_order_id || `ORD-${Date.now().toString().slice(-6)}`;
  const date = new Date().toLocaleString();

  receiptModalContent.innerHTML = `
    <div class="border-b border-border-gray pb-2 flex justify-between">
      <span class="font-bold text-ink-navy">CONVOCHECKOUT RECEIPT</span>
      <span class="text-text-secondary">#${orderId}</span>
    </div>
    <div class="py-1">
      <div>Date: ${date}</div>
      <div>Session: ${currentSessionId}</div>
      <div>Payment Status: <strong>PAID (TEST MODE)</strong></div>
      <div>Payment Method: UPI / Card **** 4242</div>
    </div>
    <div class="border-t border-b border-border-gray py-2 my-1">
      <div class="flex justify-between font-medium">
        <span>Item</span>
        <span>Amount</span>
      </div>
      <div class="flex justify-between text-text-secondary pt-1">
        <span>${escapeHtml(s.productName || 'Item')} (${s.quantity || 1}x)</span>
        <span>${s.totalFormatted || ('₹' + ((s.total_paise || 149900) / 100).toFixed(2))}</span>
      </div>
    </div>
    <div class="flex justify-between font-bold text-sm text-ink-navy pt-1">
      <span>Total Paid</span>
      <span>${s.totalFormatted || ('₹' + ((s.total_paise || 149900) / 100).toFixed(2))}</span>
    </div>
  `;

  receiptModal.classList.remove('hidden');
}

// Helpers
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdownText(str) {
  if (!str) return '';
  let formatted = escapeHtml(str);
  // Bold **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code `code`
  formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-surface-container px-1 py-0.5 rounded font-mono-sm text-xs">$1</code>');
  return formatted;
}

// Start app
document.addEventListener('DOMContentLoaded', init);
