-- ============================================================================
-- ConvoCheckout: Supabase Database Schema
-- Track: AI Growth & Agentic Commerce (Razorpay Buildathon 2026)
-- Author: Antony Melvin
-- ============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up existing tables (in dependency order) if resetting
-- DROP TABLE IF EXISTS chat_messages CASCADE;
-- DROP TABLE IF EXISTS chat_sessions CASCADE;
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS order_items CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS product_variants CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;
-- DROP TABLE IF EXISTS categories CASCADE;

-- ----------------------------------------------------------------------------
-- 1. CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    base_price BIGINT NOT NULL, -- in paise (e.g. 199900 = ₹1,999.00)
    tags TEXT[] DEFAULT '{}',
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. PRODUCT VARIANTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, -- e.g. "Size M / Navy Blue"
    size TEXT,
    color TEXT,
    price BIGINT NOT NULL, -- in paise
    stock_quantity INT NOT NULL DEFAULT 0, -- 0 represents Out of Stock for testing FR-8
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. ORDERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    session_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    shipping_address JSONB DEFAULT '{}'::jsonb,
    total_amount BIGINT NOT NULL, -- in paise
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION'
        CHECK (status IN (
            'PENDING_INTENT',
            'PENDING_CONFIRMATION',
            'CONFIRMED',
            'PAYMENT_PENDING',
            'PAID',
            'FAILED',
            'CANCELLED'
        )),
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_payment_link_id TEXT,
    razorpay_payment_link_url TEXT,
    razorpay_signature TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. ORDER ITEMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    unit_price BIGINT NOT NULL, -- in paise
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    subtotal BIGINT NOT NULL, -- in paise (unit_price * quantity)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. AUDIT LOGS TABLE (Crucial for Explainable Agent Decisions & Money Gating)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- e.g. INTENT_PARSED, STOCK_CHECK, CONFIRMATION_GATE, RAZORPAY_ORDER_CREATED, PAYMENT_SUCCESS
    category TEXT NOT NULL, -- e.g. INTENT_PARSING, CATALOG_MATCH, INVENTORY, CONFIRMATION_GATE, PAYMENT_GATEWAY
    decision_rationale TEXT NOT NULL, -- Human-readable plain text rationale
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'SUCCESS'
        CHECK (status IN ('SUCCESS', 'WARNING', 'FAILED', 'BLOCKED')),
    is_money_action BOOLEAN NOT NULL DEFAULT false,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. CHAT SESSIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY, -- Session ID / UUID
    customer_identifier TEXT,
    state TEXT NOT NULL DEFAULT 'IDLE'
        CHECK (state IN (
            'IDLE',
            'DISCOVERY',
            'AWAITING_VARIANT',
            'AWAITING_CONFIRMATION',
            'PAYMENT_PENDING',
            'COMPLETED',
            'FAILED'
        )),
    active_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. CHAT MESSAGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('USER', 'AGENT', 'SYSTEM')),
    content TEXT NOT NULL,
    intent_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE & SEARCH
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_money_action ON audit_logs(is_money_action);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at ASC);

-- ----------------------------------------------------------------------------
-- AUTOMATIC TIMESTAMP TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enabling public access for anon and service roles in development/demo
-- ----------------------------------------------------------------------------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access categories" ON categories;
CREATE POLICY "Public access categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access products" ON products;
CREATE POLICY "Public access products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access product_variants" ON product_variants;
CREATE POLICY "Public access product_variants" ON product_variants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access orders" ON orders;
CREATE POLICY "Public access orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access order_items" ON order_items;
CREATE POLICY "Public access order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access audit_logs" ON audit_logs;
CREATE POLICY "Public access audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access chat_sessions" ON chat_sessions;
CREATE POLICY "Public access chat_sessions" ON chat_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access chat_messages" ON chat_messages;
CREATE POLICY "Public access chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

