import { AgentSession, AgentState } from './stateTypes';

/**
 * In-Memory Session Store for ConvoCheckout
 * Provides fast, isolated session state tracking per conversation sessionId.
 */
export class SessionStore {
  private sessions: Map<string, AgentSession> = new Map();

  /**
   * Get an existing session or initialize a fresh one
   */
  getOrCreate(sessionId: string, customerIdentifier?: string): AgentSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const now = new Date().toISOString();
      session = {
        sessionId,
        customerIdentifier: customerIdentifier || null,
        current_state: 'IDLE',
        current_intent: null,
        current_match_result: null,
        pending_clarification: null,
        active_order_summary: null,
        conversation_history: [],
        created_at: now,
        updated_at: now,
        audit_events: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Retrieve session by ID
   */
  get(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Save or update session in store
   */
  save(session: AgentSession): void {
    session.updated_at = new Date().toISOString();
    this.sessions.set(session.sessionId, session);
  }

  /**
   * Reset session back to clean IDLE state while preserving session ID and history
   */
  reset(sessionId: string, reason: string = 'User initiated reset'): AgentSession {
    const existing = this.getOrCreate(sessionId);
    existing.current_state = 'IDLE';
    existing.current_intent = null;
    existing.current_match_result = null;
    existing.pending_clarification = null;
    existing.active_order_summary = null;
    existing.updated_at = new Date().toISOString();
    this.save(existing);
    return existing;
  }

  /**
   * Delete session from memory
   */
  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions (for test harness teardown)
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * List all active sessions
   */
  getAll(): AgentSession[] {
    return Array.from(this.sessions.values());
  }
}

export const sessionStore = new SessionStore();
