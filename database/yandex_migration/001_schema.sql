-- =====================================================
-- HEYS Database Schema Migration to Yandex.Cloud PostgreSQL
-- Generated: 2025-12-20
-- Source: Supabase project ukqolcziqcuplqfgrmsh
-- Target: Yandex.Cloud PostgreSQL heys_production
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. CLIENTS TABLE (core table)
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curator_id UUID NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    phone_normalized TEXT,
    
    -- PIN Authentication
    pin_hash TEXT,
    pin_salt TEXT,
    pin_updated_at TIMESTAMPTZ,
    pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
    pin_locked_until TIMESTAMPTZ,
    
    -- Subscription fields
    subscription_status TEXT DEFAULT 'trial',
    subscription_plan TEXT,
    subscription_started_at TIMESTAMPTZ,
    subscription_expires_at TIMESTAMPTZ,
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    
    -- Timestamps
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for clients
CREATE INDEX IF NOT EXISTS idx_clients_curator_id ON clients(curator_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone_normalized ON clients(phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_subscription_status ON clients(subscription_status);

-- =====================================================
-- 2. KV_STORE TABLE (curator-level key-value storage)
-- =====================================================
CREATE TABLE IF NOT EXISTS kv_store (
    user_id UUID NOT NULL,
    k TEXT NOT NULL,
    v JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, k)
);

-- Index for kv_store
CREATE INDEX IF NOT EXISTS idx_kv_store_user_id ON kv_store(user_id);

-- =====================================================
-- 3. CLIENT_KV_STORE TABLE (client-level key-value storage)
-- =====================================================
CREATE TABLE IF NOT EXISTS client_kv_store (
    user_id UUID NOT NULL,
    client_id UUID NOT NULL,
    k TEXT NOT NULL,
    v JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_id, k)
);

-- Indexes for client_kv_store
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_id ON client_kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_client_kv_store_client_id ON client_kv_store(client_id);
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_client ON client_kv_store(user_id, client_id);

-- =====================================================
-- 4. CONSENTS TABLE (legal consents tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    consent_type TEXT NOT NULL,
    document_version TEXT NOT NULL DEFAULT '1.0',
    granted BOOLEAN NOT NULL DEFAULT true,
    ip_address INET,
    user_agent TEXT,
    consent_method TEXT DEFAULT 'checkbox',
    signature_method TEXT DEFAULT 'checkbox',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    
    CONSTRAINT fk_consents_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Indexes for consents
CREATE INDEX IF NOT EXISTS idx_consents_client_id ON consents(client_id);
CREATE INDEX IF NOT EXISTS idx_consents_type ON consents(consent_type);

-- =====================================================
-- 5. PAYMENTS TABLE (payment history)
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    external_payment_id TEXT,
    external_status TEXT,
    payment_provider TEXT DEFAULT 'mock',
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'RUB',
    plan TEXT NOT NULL,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT fk_payments_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_payment_id) WHERE external_payment_id IS NOT NULL;

-- =====================================================
-- 6. LEADS TABLE (landing page leads)
-- =====================================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    messenger TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    
    -- UTM tracking
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    ab_variant TEXT,
    
    -- Technical info
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    landing_page TEXT,
    
    -- Processing
    curator_id UUID,
    contacted_at TIMESTAMPTZ,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for leads
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_curator ON leads(curator_id) WHERE curator_id IS NOT NULL;

-- =====================================================
-- 7. SHARED_PRODUCTS TABLE (product database)
-- =====================================================
CREATE TABLE IF NOT EXISTS shared_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_user_id UUID,
    created_by_client_id UUID,
    
    -- Product info
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    
    -- Nutrition per 100g
    simple100 NUMERIC NOT NULL DEFAULT 0,
    complex100 NUMERIC NOT NULL DEFAULT 0,
    protein100 NUMERIC NOT NULL DEFAULT 0,
    badfat100 NUMERIC NOT NULL DEFAULT 0,
    goodfat100 NUMERIC NOT NULL DEFAULT 0,
    trans100 NUMERIC NOT NULL DEFAULT 0,
    fiber100 NUMERIC NOT NULL DEFAULT 0,
    gi NUMERIC,
    harm NUMERIC,
    
    -- Metadata
    category TEXT,
    portions JSONB,
    description TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now())),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
);

-- Indexes for shared_products
CREATE INDEX IF NOT EXISTS idx_shared_products_fingerprint ON shared_products(fingerprint);
CREATE INDEX IF NOT EXISTS idx_shared_products_name_norm ON shared_products(name_norm);
CREATE INDEX IF NOT EXISTS idx_shared_products_created_by_user ON shared_products(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shared_products_created_by_client ON shared_products(created_by_client_id) WHERE created_by_client_id IS NOT NULL;

-- =====================================================
-- 8. SHARED_PRODUCTS_BLOCKLIST TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS shared_products_blocklist (
    curator_id UUID NOT NULL,
    product_id UUID NOT NULL,
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (curator_id, product_id)
);

-- =====================================================
-- 9. LEADS_ANALYTICS VIEW
-- =====================================================
CREATE OR REPLACE VIEW leads_analytics AS
SELECT 
    DATE(created_at) as date,
    utm_source,
    utm_medium,
    utm_campaign,
    ab_variant,
    messenger,
    status,
    COUNT(*) as count
FROM leads
GROUP BY 
    DATE(created_at),
    utm_source,
    utm_medium,
    utm_campaign,
    ab_variant,
    messenger,
    status;

-- =====================================================
-- 10. HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kv_store_updated_at
    BEFORE UPDATE ON kv_store
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_kv_store_updated_at
    BEFORE UPDATE ON client_kv_store
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_products_updated_at
    BEFORE UPDATE ON shared_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. PIN AUTHENTICATION FUNCTIONS
-- =====================================================

-- Function to hash PIN with salt
CREATE OR REPLACE FUNCTION hash_pin(pin TEXT, salt TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(pin || salt, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate random salt
CREATE OR REPLACE FUNCTION generate_salt()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to normalize phone number
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
    cleaned TEXT;
BEGIN
    -- Remove all non-digit characters
    cleaned := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Handle Russian numbers
    IF length(cleaned) = 11 AND (left(cleaned, 1) = '7' OR left(cleaned, 1) = '8') THEN
        cleaned := '7' || right(cleaned, 10);
    ELSIF length(cleaned) = 10 THEN
        cleaned := '7' || cleaned;
    END IF;
    
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify tables created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    RAISE NOTICE '✅ Migration complete! Created % tables', table_count;
END $$;
