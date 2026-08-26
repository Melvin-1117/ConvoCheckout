# Product Requirements Document (PRD)

**Product Name:** ConvoCheckout — Conversational In-App Checkout Agent
**Track:** AI Growth & Agentic Commerce (Track 01)
**Program:** Razorpay Buildathon 2026
**Document Owner:** Antony Melvin
**Version:** 1.0
**Status:** Draft for Submission
**Last Updated:** August 25, 2026

---

## 1. Document Control

| Field | Detail |
|---|---|
| Author | Antony Melvin |
| Reviewers | — |
| Approval Status | Pending Submission |
| Related Documents | Razorpay Buildathon Track Brief — Track 01 |
| Distribution | Razorpay Buildathon Panel |

---

## 2. Executive Summary

ConvoCheckout is an AI agent that lets a merchant's end customer complete a purchase entirely through natural-language conversation — inside the merchant's own app or website — instead of navigating a traditional multi-page checkout flow. The agent interprets free-form user intent ("buy the blue shirt in size M," "reorder my last order"), resolves it against the merchant's product catalog, creates an order via Razorpay's test-mode APIs, and walks the customer through payment, all while logging every money-related decision it makes for auditability.

This directly addresses the track's stated problem: agent-to-agent and agent-to-human commerce is an unsolved, high-priority surface for Razorpay right now (NPCI's UAP, and global protocols like ACP, AP2, and x402), and merchants need a way to become "agent-transactable" without rebuilding their checkout stack.

---

## 3. Problem Statement

Traditional checkout requires customers to manually search, filter, add to cart, and navigate multiple screens before paying — a process with high drop-off, especially on mobile and for repeat/simple purchases. Simultaneously, the rise of AI shopping assistants means merchants increasingly need a checkout surface that can be driven by conversational or agentic input, not just clicks. Most merchants today have no way to expose their catalog or checkout flow to a conversational agent, and no safe, auditable way to let an AI initiate a real money transaction on their behalf.

---

## 4. Goals and Objectives

### 4.1 Primary Goal
Demonstrate a working, end-to-end conversational checkout experience that takes a customer from natural-language request to a completed Razorpay test-mode payment.

### 4.2 Success Objectives
- Reduce the number of manual steps a customer takes to complete a purchase.
- Prove that an LLM-driven agent can safely initiate a bounded, gated financial transaction.
- Provide full transparency into every decision the agent makes via an audit trail.
- Handle at least one realistic failure mode gracefully (ambiguous request, out-of-stock item, or payment failure).

### 4.3 Non-Goals (for this build)
- Multi-agent-to-agent commerce (agent buying from another agent) is out of scope for this iteration.
- Production-grade payment security/compliance hardening is out of scope; this is a test-mode proof of concept.
- Support for currencies other than INR is out of scope.

---

## 5. Scope

### 5.1 In Scope
- Conversational chat interface (web-based).
- Natural language → structured order intent extraction.
- Mock product catalog (10–20 SKUs) with variants (size/color/quantity).
- Order creation and payment link generation via Razorpay test-mode Orders API.
- Payment status tracking (webhook or polling).
- Audit log of every agent decision and money-related action.
- One graceful failure-handling flow.

### 5.2 Out of Scope
- Real production payments.
- Full merchant dashboard or catalog management UI.
- Multi-language support beyond English (Hinglish handling not included in this track's build).
- User authentication/account system beyond a mock session.

---

## 6. User Personas

| Persona | Description | Primary Need |
|---|---|---|
| End Customer | A shopper using a merchant's app/site | Wants to buy something quickly without navigating menus |
| Merchant (represented by Razorpay panel) | Business owner using Razorpay | Wants higher conversion and a checkout surface that's agent-ready |
| Buildathon Evaluator | Razorpay hiring/technical panel | Wants to see safe, explainable, working agentic commerce |

---

## 7. User Stories

1. **As a customer**, I want to type what I want to buy in plain language, so that I don't have to browse a catalog manually.
2. **As a customer**, I want the agent to confirm my order details before charging me, so that I trust the transaction.
3. **As a customer**, I want to be told clearly if an item is unavailable or my request is ambiguous, so that I'm not left confused.
4. **As an evaluator**, I want to see a clear audit trail of every action the agent took, so that I can verify the system is safe and explainable.
5. **As an evaluator**, I want to see how the system behaves when something goes wrong, so that I can assess robustness, not just the happy path.

---

## 8. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | System shall accept free-text natural language input from the user via a chat UI | Must |
| FR-2 | System shall use an LLM to extract structured order intent (item, variant, quantity) from the input | Must |
| FR-3 | System shall match extracted intent against a mock product catalog | Must |
| FR-4 | System shall present the resolved order back to the user for confirmation before payment | Must |
| FR-5 | System shall create a Razorpay test-mode order and generate a payment link/checkout session upon confirmation | Must |
| FR-6 | System shall track and display payment status (success/failure) back to the user in the chat | Must |
| FR-7 | System shall log every money-related decision (intent parsed, order created, payment attempted, outcome) to a visible audit trail | Must |
| FR-8 | System shall handle at least one failure scenario (ambiguous item, out-of-stock, failed payment) with a clear, non-blocking response | Must |
| FR-9 | System shall support basic upsell/cross-sell suggestions after a successful order (stretch goal) | Should |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Explainability | Every action the agent takes that touches money must be logged with a human-readable reason |
| Safety / Gating | The agent must never finalize a payment without explicit user confirmation of order details |
| Reliability | System should degrade gracefully (clear error messaging) rather than fail silently |
| Performance | Intent extraction and catalog matching should complete within a few seconds to keep the chat experience conversational |
| Usability | Chat UI should be usable on both desktop and mobile viewports |

---

## 10. System Architecture (High-Level)

```
[Customer] 
    │  (natural language)
    ▼
[Chat UI - React/Next.js]
    │
    ▼
[Backend API - Node.js/Express]
    │
    ├──► [LLM Service - Gemini API] → structured order intent (JSON)
    │
    ├──► [Catalog Matcher] → resolves intent against mock product DB (Postgres)
    │
    ├──► [Razorpay Test-Mode API] → creates order, generates payment link
    │
    └──► [Audit Log Store] → records every decision/action with timestamp + reason
    │
    ▼
[Payment Status Webhook/Polling] → updates chat UI with outcome
```

---

## 11. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React / Next.js, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (product catalog, order records, audit log) |
| LLM / Intent Parsing | Gemini API (structured output / function calling) |
| Payments | Razorpay Test-Mode APIs (Orders, Payment Links, Webhooks) |
| Hosting (demo) | Any Node-compatible hosting (e.g., Render/Vercel for frontend) |

---

## 12. Data Flow Summary

1. User sends a natural language message.
2. Backend sends the message + catalog context to the LLM.
3. LLM returns structured intent (item, variant, quantity, confidence).
4. Backend matches intent to catalog; if ambiguous or out-of-stock, agent asks a clarifying question or informs the user (failure path).
5. Once resolved, backend presents order summary to user for confirmation.
6. On confirmation, backend calls Razorpay test-mode Orders API to create the order and payment link.
7. Every step above (2–6) is written to the audit log with a timestamp and human-readable rationale.
8. Payment status is tracked and reflected back to the user.

---

## 13. Success Metrics / KPIs (for Demo Evaluation)

| Metric | Target |
|---|---|
| End-to-end completion (chat message → successful test payment) | Demonstrable in live demo |
| Audit trail completeness | 100% of money-related actions logged |
| Failure handling | At least 1 failure scenario handled gracefully, shown live |
| Intent extraction accuracy (on test set of sample queries) | Reported honestly, including misses |

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM misinterprets user intent | Wrong item ordered | Always require explicit user confirmation before payment |
| Razorpay test API rate limits or downtime during demo | Demo failure | Pre-test the flow multiple times; have a recorded fallback demo video |
| LLM API rate limits (free tier) | Slow or failed responses during live demo | Add basic retry/backoff logic; keep prompts small |
| Judges probe "why" behind an agent decision | Loss of credibility if unexplainable | Ensure audit log includes plain-language rationale, not just raw data |

---

## 15. Timeline / Milestones

| Milestone | Target |
|---|---|
| Catalog + DB schema finalized | Day 1 |
| Intent extraction (Gemini) working in isolation | Day 2 |
| Razorpay test-mode order + payment link integration | Day 3 |
| Chat UI wired to backend end-to-end | Day 4 |
| Audit trail + failure-handling implemented | Day 5 |
| Final testing, demo script, and submission | Day 6 |

---

## 16. Appendix

- **Reference:** Razorpay Buildathon Track 01 Brief — "AI Growth & Agentic Commerce"
- **Evaluation Bar (per brief):** "Every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully."
