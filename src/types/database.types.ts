export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrderStatus =
  | 'PENDING_INTENT'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export type AuditActionType =
  | 'INTENT_PARSED'
  | 'CATALOG_SEARCH'
  | 'VARIANT_RESOLVED'
  | 'STOCK_CHECK'
  | 'OUT_OF_STOCK_DETECTED'
  | 'AMBIGUITY_DETECTED'
  | 'ORDER_SUMMARY_GENERATED'
  | 'USER_CONFIRMATION_RECEIVED'
  | 'RAZORPAY_ORDER_CREATED'
  | 'PAYMENT_LINK_GENERATED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_FAILED'
  | 'FALLBACK_TRIGGERED';

export type AuditCategory =
  | 'INTENT_PARSING'
  | 'CATALOG_MATCH'
  | 'INVENTORY'
  | 'CONFIRMATION_GATE'
  | 'PAYMENT_GATEWAY'
  | 'SYSTEM';

export type AuditStatus = 'SUCCESS' | 'WARNING' | 'FAILED' | 'BLOCKED';

export type SessionState =
  | 'IDLE'
  | 'DISCOVERY'
  | 'AWAITING_VARIANT'
  | 'AWAITING_CONFIRMATION'
  | 'PAYMENT_PENDING'
  | 'COMPLETED'
  | 'FAILED';

export type MessageSender = 'USER' | 'AGENT' | 'SYSTEM';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface ProductRow {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  base_price: number; // in paise (e.g. 149900 = ₹1,499.00)
  tags: string[];
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  size: string | null;
  color: string | null;
  price: number; // in paise
  stock_quantity: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  session_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: Json;
  total_amount: number; // in paise
  currency: string;
  status: OrderStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_payment_link_id: string | null;
  razorpay_payment_link_url: string | null;
  razorpay_signature: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  unit_price: number; // in paise
  quantity: number;
  subtotal: number; // in paise
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  session_id: string | null;
  order_id: string | null;
  action_type: AuditActionType;
  category: AuditCategory;
  decision_rationale: string;
  input_data: Json;
  output_data: Json;
  status: AuditStatus;
  is_money_action: boolean;
  timestamp: string;
}

export interface ChatSessionRow {
  id: string;
  customer_identifier: string | null;
  state: SessionState;
  active_order_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  sender: MessageSender;
  content: string;
  intent_data: Json;
  created_at: string;
}

export interface ProductWithVariants extends ProductRow {
  category?: CategoryRow | null;
  variants: ProductVariantRow[];
}

export interface OrderWithItems extends OrderRow {
  items: OrderItemRow[];
}

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: CategoryRow;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: {
          id?: string;
          category_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          base_price: number;
          tags?: string[];
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          base_price?: number;
          tags?: string[];
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      product_variants: {
        Row: ProductVariantRow;
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          name: string;
          size?: string | null;
          color?: string | null;
          price: number;
          stock_quantity?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          sku?: string;
          name?: string;
          size?: string | null;
          color?: string | null;
          price?: number;
          stock_quantity?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: OrderRow;
        Insert: {
          id?: string;
          order_number: string;
          session_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          shipping_address?: Json;
          total_amount: number;
          currency?: string;
          status?: OrderStatus;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_payment_link_id?: string | null;
          razorpay_payment_link_url?: string | null;
          razorpay_signature?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          session_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          shipping_address?: Json;
          total_amount?: number;
          currency?: string;
          status?: OrderStatus;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_payment_link_id?: string | null;
          razorpay_payment_link_url?: string | null;
          razorpay_signature?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: OrderItemRow;
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          product_name: string;
          variant_name: string;
          sku: string;
          unit_price: number;
          quantity?: number;
          subtotal: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          product_name?: string;
          variant_name?: string;
          sku?: string;
          unit_price?: number;
          quantity?: number;
          subtotal?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: {
          id?: string;
          session_id?: string | null;
          order_id?: string | null;
          action_type: AuditActionType;
          category: AuditCategory;
          decision_rationale: string;
          input_data?: Json;
          output_data?: Json;
          status?: AuditStatus;
          is_money_action?: boolean;
          timestamp?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          order_id?: string | null;
          action_type?: AuditActionType;
          category?: AuditCategory;
          decision_rationale?: string;
          input_data?: Json;
          output_data?: Json;
          status?: AuditStatus;
          is_money_action?: boolean;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      chat_sessions: {
        Row: ChatSessionRow;
        Insert: {
          id: string;
          customer_identifier?: string | null;
          state?: SessionState;
          active_order_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_identifier?: string | null;
          state?: SessionState;
          active_order_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: {
          id?: string;
          session_id: string;
          sender: MessageSender;
          content: string;
          intent_data?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          sender?: MessageSender;
          content?: string;
          intent_data?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
