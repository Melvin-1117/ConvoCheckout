import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { InMemoryStore } from '../mockStore';
import {
  AuditLogRow,
  AuditActionType,
  AuditCategory,
  AuditStatus,
  Json,
} from '../../types/database.types';

export interface LogAuditInput {
  sessionId?: string;
  orderId?: string;
  actionType: AuditActionType;
  category: AuditCategory;
  decisionRationale: string;
  inputData?: Json;
  outputData?: Json;
  status?: AuditStatus;
  isMoneyAction?: boolean;
}

export class AuditRepository {
  /**
   * Log an agent decision, intent parsing step, inventory check, or payment transition
   */
  static async logAudit(entry: LogAuditInput): Promise<AuditLogRow> {
    if (!isSupabaseConfigured()) {
      const logEntry: AuditLogRow = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        session_id: entry.sessionId || null,
        order_id: entry.orderId || null,
        action_type: entry.actionType,
        category: entry.category,
        decision_rationale: entry.decisionRationale,
        input_data: entry.inputData || {},
        output_data: entry.outputData || {},
        status: entry.status || 'SUCCESS',
        is_money_action: entry.isMoneyAction ?? false,
        timestamp: new Date().toISOString(),
      };
      InMemoryStore.auditLogs.push(logEntry);
      return logEntry;
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        session_id: entry.sessionId || null,
        order_id: entry.orderId || null,
        action_type: entry.actionType,
        category: entry.category,
        decision_rationale: entry.decisionRationale,
        input_data: entry.inputData || {},
        output_data: entry.outputData || {},
        status: entry.status || 'SUCCESS',
        is_money_action: entry.isMoneyAction ?? false,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(`Audit logging failed: ${error?.message}`);
      throw new Error(`Failed to record audit log: ${error?.message}`);
    }

    return data as AuditLogRow;
  }

  /**
   * Fetch full audit trail for a specific conversation session
   */
  static async getAuditTrailBySession(sessionId: string): Promise<AuditLogRow[]> {
    if (!isSupabaseConfigured()) {
      return InMemoryStore.auditLogs
        .filter((l) => l.session_id === sessionId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch session audit trail: ${error.message}`);
    }
    return (data || []) as AuditLogRow[];
  }

  /**
   * Fetch audit trail for a specific order
   */
  static async getAuditTrailByOrder(orderId: string): Promise<AuditLogRow[]> {
    if (!isSupabaseConfigured()) {
      return InMemoryStore.auditLogs
        .filter((l) => l.order_id === orderId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch order audit trail: ${error.message}`);
    }
    return (data || []) as AuditLogRow[];
  }

  /**
   * Fetch recent audit logs (with optional filter for money-only actions)
   */
  static async getRecentLogs(options?: {
    limit?: number;
    moneyActionsOnly?: boolean;
  }): Promise<AuditLogRow[]> {
    if (!isSupabaseConfigured()) {
      let list = [...InMemoryStore.auditLogs];
      if (options?.moneyActionsOnly) {
        list = list.filter((l) => l.is_money_action);
      }
      return list
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, options?.limit || 50);
    }

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(options?.limit || 50);

    if (options?.moneyActionsOnly) {
      query = query.eq('is_money_action', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch recent audit logs: ${error.message}`);
    }
    return (data || []) as AuditLogRow[];
  }
}
