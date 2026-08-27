import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { InMemoryStore } from '../mockStore';
import {
  ChatSessionRow,
  ChatMessageRow,
  SessionState,
  MessageSender,
  Json,
} from '../../types/database.types';

export class SessionRepository {
  /**
   * Get an existing chat session or create a new one
   */
  static async getOrCreateSession(
    sessionId: string,
    customerIdentifier?: string
  ): Promise<ChatSessionRow> {
    if (!isSupabaseConfigured()) {
      let session = InMemoryStore.chatSessions.find((s) => s.id === sessionId);
      if (!session) {
        session = {
          id: sessionId,
          customer_identifier: customerIdentifier || null,
          state: 'IDLE',
          active_order_id: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        InMemoryStore.chatSessions.push(session);
      }
      return session;
    }

    const { data: existing, error: getErr } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (existing && !getErr) {
      return existing as ChatSessionRow;
    }

    const { data: created, error: createErr } = await supabase
      .from('chat_sessions')
      .insert({
        id: sessionId,
        customer_identifier: customerIdentifier || null,
        state: 'IDLE',
        metadata: {},
      })
      .select('*')
      .single();

    if (createErr || !created) {
      throw new Error(`Failed to create chat session: ${createErr?.message}`);
    }

    return created as ChatSessionRow;
  }

  /**
   * Update the session state and active order reference
   */
  static async updateSessionState(
    sessionId: string,
    state: SessionState,
    activeOrderId?: string | null,
    metadata?: Json
  ): Promise<ChatSessionRow> {
    if (!isSupabaseConfigured()) {
      const session = await this.getOrCreateSession(sessionId);
      session.state = state;
      session.updated_at = new Date().toISOString();
      if (activeOrderId !== undefined) session.active_order_id = activeOrderId;
      if (metadata !== undefined) session.metadata = metadata;
      return session;
    }

    const updatePayload: Record<string, any> = {
      state,
      updated_at: new Date().toISOString(),
    };

    if (activeOrderId !== undefined) {
      updatePayload.active_order_id = activeOrderId;
    }
    if (metadata !== undefined) {
      updatePayload.metadata = metadata;
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .update(updatePayload)
      .eq('id', sessionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update session state: ${error?.message}`);
    }

    return data as ChatSessionRow;
  }

  /**
   * Append a chat message to the session history
   */
  static async addMessage(
    sessionId: string,
    sender: MessageSender,
    content: string,
    intentData?: Json
  ): Promise<ChatMessageRow> {
    if (!isSupabaseConfigured()) {
      // Ensure session exists
      await this.getOrCreateSession(sessionId);

      const message: ChatMessageRow = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        session_id: sessionId,
        sender,
        content,
        intent_data: intentData || {},
        created_at: new Date().toISOString(),
      };
      InMemoryStore.chatMessages.push(message);
      return message;
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        sender,
        content,
        intent_data: intentData || {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to add message to session: ${error?.message}`);
    }

    return data as ChatMessageRow;
  }

  /**
   * Fetch complete message history for a session in chronological order
   */
  static async getSessionMessages(sessionId: string): Promise<ChatMessageRow[]> {
    if (!isSupabaseConfigured()) {
      return InMemoryStore.chatMessages
        .filter((m) => m.session_id === sessionId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch session messages: ${error.message}`);
    }

    return (data || []) as ChatMessageRow[];
  }
}
