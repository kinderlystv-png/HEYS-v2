-- Migration: Add cholesterol field to shared_products
-- Date: 2026-02-11
-- Purpose: Support cholesterol tracking for C9 Heart Health pattern

BEGIN;

-- Add cholesterol column (mg/100g)
ALTER TABLE shared_products
ADD COLUMN IF NOT EXISTS cholesterol numeric DEFAULT NULL;

-- Add check constraint
ALTER TABLE shared_products
ADD CONSTRAINT chk_cholesterol_positive 
CHECK (cholesterol IS NULL OR cholesterol >= 0);

-- Add comment
COMMENT ON COLUMN shared_products.cholesterol IS 'Cholesterol content in mg per 100g';

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_shared_products_cholesterol 
ON shared_products(cholesterol) 
WHERE cholesterol IS NOT NULL;

COMMIT;
