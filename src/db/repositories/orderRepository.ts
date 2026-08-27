import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { InMemoryStore } from '../mockStore';
import {
  OrderRow,
  OrderItemRow,
  OrderStatus,
  OrderWithItems,
  Json,
} from '../../types/database.types';

export interface CreateOrderInput {
  sessionId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: Json;
  items: {
    productId?: string;
    variantId?: string;
    productName: string;
    variantName: string;
    sku: string;
    unitPrice: number; // in paise
    quantity: number;
  }[];
  currency?: string;
  metadata?: Json;
}

export class OrderRepository {
  private static generateOrderNumber(): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${timestamp}-${random}`;
  }

  /**
   * Create an order and associated order items
   */
  static async createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
    const orderNumber = this.generateOrderNumber();
    const totalAmount = input.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    if (!isSupabaseConfigured()) {
      const orderId = `ord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const order: OrderRow = {
        id: orderId,
        order_number: orderNumber,
        session_id: input.sessionId || null,
        customer_name: input.customerName || null,
        customer_email: input.customerEmail || null,
        customer_phone: input.customerPhone || null,
        shipping_address: input.shippingAddress || {},
        total_amount: totalAmount,
        currency: input.currency || 'INR',
        status: 'PENDING_CONFIRMATION',
        razorpay_order_id: null,
        razorpay_payment_id: null,
        razorpay_payment_link_id: null,
        razorpay_payment_link_url: null,
        razorpay_signature: null,
        metadata: input.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      InMemoryStore.orders.push(order);

      const items: OrderItemRow[] = input.items.map((item, idx) => ({
        id: `oi-${orderId}-${idx + 1}`,
        order_id: orderId,
        product_id: item.productId || null,
        variant_id: item.variantId || null,
        product_name: item.productName,
        variant_name: item.variantName,
        sku: item.sku,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        created_at: new Date().toISOString(),
      }));
      InMemoryStore.orderItems.push(...items);

      return {
        ...order,
        items,
      };
    }

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        session_id: input.sessionId || null,
        customer_name: input.customerName || null,
        customer_email: input.customerEmail || null,
        customer_phone: input.customerPhone || null,
        shipping_address: input.shippingAddress || {},
        total_amount: totalAmount,
        currency: input.currency || 'INR',
        status: 'PENDING_CONFIRMATION',
        metadata: input.metadata || {},
      })
      .select('*')
      .single();

    if (orderError || !orderData) {
      throw new Error(`Failed to create order: ${orderError?.message}`);
    }

    const order = orderData as OrderRow;

    const orderItemInserts = input.items.map((item) => ({
      order_id: order.id,
      product_id: item.productId || null,
      variant_id: item.variantId || null,
      product_name: item.productName,
      variant_name: item.variantName,
      sku: item.sku,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
    }));

    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemInserts)
      .select('*');

    if (itemsError) {
      throw new Error(`Failed to insert order items: ${itemsError.message}`);
    }

    return {
      ...order,
      items: (itemsData || []) as OrderItemRow[],
    };
  }

  /**
   * Get an order by its ID with all items
   */
  static async getOrderById(orderId: string): Promise<OrderWithItems | null> {
    if (!isSupabaseConfigured()) {
      const order = InMemoryStore.orders.find((o) => o.id === orderId);
      if (!order) return null;
      const items = InMemoryStore.orderItems.filter((i) => i.order_id === orderId);
      return {
        ...order,
        items,
      };
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return null;
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    return {
      ...(order as OrderRow),
      items: (items || []) as OrderItemRow[],
    };
  }

  /**
   * Get an order by its readable order number
   */
  static async getOrderByNumber(orderNumber: string): Promise<OrderWithItems | null> {
    if (!isSupabaseConfigured()) {
      const order = InMemoryStore.orders.find((o) => o.order_number === orderNumber);
      if (!order) return null;
      const items = InMemoryStore.orderItems.filter((i) => i.order_id === order.id);
      return {
        ...order,
        items,
      };
    }

    const { data, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (orderErr || !data) {
      return null;
    }

    const order = data as OrderRow;

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);

    return {
      ...order,
      items: (items || []) as OrderItemRow[],
    };
  }

  /**
   * Get an order by its Razorpay Order ID
   */
  static async getOrderByRazorpayId(rzpOrderId: string): Promise<OrderWithItems | null> {
    if (!isSupabaseConfigured()) {
      const order = InMemoryStore.orders.find((o) => o.razorpay_order_id === rzpOrderId);
      if (!order) return null;
      const items = InMemoryStore.orderItems.filter((i) => i.order_id === order.id);
      return {
        ...order,
        items,
      };
    }

    const { data, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', rzpOrderId)
      .single();

    if (orderErr || !data) {
      return null;
    }

    const order = data as OrderRow;

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);

    return {
      ...order,
      items: (items || []) as OrderItemRow[],
    };
  }

  /**
   * Update order status and attach Razorpay payment/link metadata
   */
  static async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    paymentDetails?: {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpayPaymentLinkId?: string;
      razorpayPaymentLinkUrl?: string;
      razorpaySignature?: string;
      metadata?: Json;
    }
  ): Promise<OrderWithItems | null> {
    if (!isSupabaseConfigured()) {
      const order = InMemoryStore.orders.find((o) => o.id === orderId);
      if (!order) return null;

      order.status = status;
      order.updated_at = new Date().toISOString();
      if (paymentDetails?.razorpayOrderId) order.razorpay_order_id = paymentDetails.razorpayOrderId;
      if (paymentDetails?.razorpayPaymentId) order.razorpay_payment_id = paymentDetails.razorpayPaymentId;
      if (paymentDetails?.razorpayPaymentLinkId) order.razorpay_payment_link_id = paymentDetails.razorpayPaymentLinkId;
      if (paymentDetails?.razorpayPaymentLinkUrl) order.razorpay_payment_link_url = paymentDetails.razorpayPaymentLinkUrl;
      if (paymentDetails?.razorpaySignature) order.razorpay_signature = paymentDetails.razorpaySignature;
      if (paymentDetails?.metadata) order.metadata = paymentDetails.metadata;

      return this.getOrderById(orderId);
    }

    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (paymentDetails?.razorpayOrderId) {
      updatePayload.razorpay_order_id = paymentDetails.razorpayOrderId;
    }
    if (paymentDetails?.razorpayPaymentId) {
      updatePayload.razorpay_payment_id = paymentDetails.razorpayPaymentId;
    }
    if (paymentDetails?.razorpayPaymentLinkId) {
      updatePayload.razorpay_payment_link_id = paymentDetails.razorpayPaymentLinkId;
    }
    if (paymentDetails?.razorpayPaymentLinkUrl) {
      updatePayload.razorpay_payment_link_url = paymentDetails.razorpayPaymentLinkUrl;
    }
    if (paymentDetails?.razorpaySignature) {
      updatePayload.razorpay_signature = paymentDetails.razorpaySignature;
    }
    if (paymentDetails?.metadata) {
      updatePayload.metadata = paymentDetails.metadata;
    }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (error) {
      throw new Error(`Failed to update order status: ${error.message}`);
    }

    return this.getOrderById(orderId);
  }

  /**
   * Get all orders linked to a chat session
   */
  static async getOrdersBySession(sessionId: string): Promise<OrderWithItems[]> {
    if (!isSupabaseConfigured()) {
      const orders = InMemoryStore.orders.filter((o) => o.session_id === sessionId);
      return orders.map((o) => ({
        ...o,
        items: InMemoryStore.orderItems.filter((i) => i.order_id === o.id),
      }));
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error || !orders) {
      return [];
    }

    const result: OrderWithItems[] = [];
    for (const ord of orders as OrderRow[]) {
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', ord.id);
      result.push({
        ...ord,
        items: (items || []) as OrderItemRow[],
      });
    }

    return result;
  }
}
