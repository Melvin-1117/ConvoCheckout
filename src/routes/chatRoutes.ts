import { Router, Request, Response } from 'express';
import { processUserTurn } from '../agent/orchestrator';
import { sessionStore } from '../agent/sessionStore';
import { AuditRepository } from '../db/repositories/auditRepository';
import {
  resolvePaymentSuccess,
  resolvePaymentFailure,
} from '../services/paymentTrackingService';
import { AgentSession } from '../agent/stateTypes';

export const chatRouter = Router();

/**
 * Helper to build standard API response
 */
function sendSuccess(res: Response, data: any, statusCode: number = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function sendError(res: Response, message: string, statusCode: number = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

/**
 * 1. POST /api/chat/turn
 * Process a single conversational turn through the ConvoCheckout orchestrator.
 */
chatRouter.post('/turn', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendError(res, "Field 'message' is required and cannot be empty", 400);
    }

    const activeSessionId = sessionId && typeof sessionId === 'string' && sessionId.trim()
      ? sessionId.trim()
      : `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const turnResponse = await processUserTurn(activeSessionId, message.trim());
    const currentSession = sessionStore.get(activeSessionId);
    const auditLogs = await AuditRepository.getAuditTrailBySession(activeSessionId);

    return sendSuccess(res, {
      ...turnResponse,
      session: currentSession,
      auditLogs,
    });
  } catch (err: any) {
    console.error('Error in POST /api/chat/turn:', err);
    return sendError(res, err.message || 'Failed to process chat turn', 500);
  }
});

/**
 * 2. GET /api/chat/session/:sessionId
 * Fetch the current state and conversation history of a session.
 */
chatRouter.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId || '');
    if (!sessionId) {
      return sendError(res, 'sessionId parameter is required', 400);
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return sendSuccess(res, {
        session: sessionStore.getOrCreate(sessionId),
        auditLogs: [],
      });
    }

    const auditLogs = await AuditRepository.getAuditTrailBySession(sessionId);
    return sendSuccess(res, {
      session,
      auditLogs,
    });
  } catch (err: any) {
    console.error(`Error in GET /api/chat/session/${req.params.sessionId}:`, err);
    return sendError(res, err.message || 'Failed to fetch session', 500);
  }
});

/**
 * 3. GET /api/chat/audit/:sessionId
 * Fetch the complete explainable audit trail for a session.
 */
chatRouter.get('/audit/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId || '');
    if (!sessionId) {
      return sendError(res, 'sessionId parameter is required', 400);
    }

    const auditLogs = await AuditRepository.getAuditTrailBySession(sessionId);
    return sendSuccess(res, auditLogs);
  } catch (err: any) {
    console.error(`Error in GET /api/chat/audit/${req.params.sessionId}:`, err);
    return sendError(res, err.message || 'Failed to fetch audit trail', 500);
  }
});

/**
 * 4. POST /api/chat/reset
 * Explicitly reset a session back to IDLE state.
 */
chatRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return sendError(res, 'sessionId parameter is required', 400);
    }

    const turnResponse = await processUserTurn(sessionId, 'reset');
    const updatedSession = sessionStore.get(sessionId);
    const auditLogs = await AuditRepository.getAuditTrailBySession(sessionId);

    return sendSuccess(res, {
      ...turnResponse,
      session: updatedSession,
      auditLogs,
    });
  } catch (err: any) {
    console.error('Error in POST /api/chat/reset:', err);
    return sendError(res, err.message || 'Failed to reset session', 500);
  }
});

/**
 * 5. POST /api/chat/simulate-payment
 * Live demo helper: Simulates a payment success or failure event for the current session.
 */
chatRouter.post('/simulate-payment', async (req: Request, res: Response) => {
  try {
    const { sessionId, action, reason } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return sendError(res, 'sessionId parameter is required', 400);
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return sendError(res, `Session '${sessionId}' not found`, 404);
    }

    if (session.current_state !== 'PAYING') {
      return sendError(
        res,
        `Cannot simulate payment for session in state '${session.current_state}'. Expected 'PAYING'.`,
        400
      );
    }

    const orderId = session.active_razorpay_order?.razorpay_order_id || `order_sim_${Date.now()}`;
    const amount = session.active_order_summary?.totalPaise || (session.active_order_summary?.total_amount ? session.active_order_summary.total_amount * 100 : 149900);

    if (action === 'success') {
      const paymentDetails = {
        paymentId: `pay_sim_success_${Date.now()}`,
        razorpayOrderId: orderId,
        amount,
        currency: 'INR',
      };

      const result = await resolvePaymentSuccess(session, paymentDetails, 'webhook');
      const auditLogs = await AuditRepository.getAuditTrailBySession(sessionId);

      return sendSuccess(res, {
        result,
        session: sessionStore.get(sessionId),
        auditLogs,
      });
    } else if (action === 'failed') {
      const errorDetails = {
        error: reason || 'Card payment declined by issuing bank (Insufficient funds / Test Decline)',
        razorpayOrderId: orderId,
        paymentId: `pay_sim_fail_${Date.now()}`,
        errorCode: 'BAD_REQUEST_PAYMENT_DECLINED',
      };

      const result = await resolvePaymentFailure(
        session,
        errorDetails,
        'webhook'
      );
      const auditLogs = await AuditRepository.getAuditTrailBySession(sessionId);

      return sendSuccess(res, {
        result,
        session: sessionStore.get(sessionId),
        auditLogs,
      });
    } else {
      return sendError(res, "Action must be 'success' or 'failed'", 400);
    }
  } catch (err: any) {
    console.error('Error in POST /api/chat/simulate-payment:', err);
    return sendError(res, err.message || 'Failed to simulate payment', 500);
  }
});
