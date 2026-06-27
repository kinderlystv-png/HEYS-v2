import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) {
      const fnSource = source.slice(start, i + 1);
      return Function(`"use strict"; return (${fnSource});`)();
    }
  }
  throw new Error(`Function ${name} body is not closed`);
}

describe('product barcode contract', () => {
  it('keeps barcode in shared-products database migration and REST whitelist', () => {
    const migration = read('scripts/db/migrations/2026-06-27_shared_products_barcode.sql');
    const migrationCheck = read('scripts/db/check-shared-products-barcode.sql');
    const migrationApply = read('scripts/db/apply-shared-products-barcode.sh');
    const rest = read('yandex-cloud-functions/heys-api-rest/index.js');
    const rpc = read('yandex-cloud-functions/heys-api-rpc/index.js');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS barcode text');
    expect(migration).toContain('idx_shared_products_barcode');
    expect(migration).toContain('idx_shared_products_pending_barcode');
    expect(migration).toContain('barcode = v_barcode');
    expect(migration).toContain('length(v_barcode) < 6 OR length(v_barcode) > 32');
    expect(migration).toContain('length(normalized.cleaned) BETWEEN 6 AND 32');
    expect(migrationCheck).toContain('public.create_pending_product_by_session(text,text,jsonb,text,text)');
    expect(migrationCheck).toContain('public.publish_shared_product_by_curator(uuid,jsonb)');
    expect(migrationCheck).toContain("barcode !~ '^[0-9A-Z]{6,32}$'");
    const aliasesMigration = read('scripts/db/migrations/2026-06-28_shared_products_barcodes_array.sql');
    expect(aliasesMigration).toContain('ADD COLUMN IF NOT EXISTS barcodes text[]');
    expect(aliasesMigration).toContain('idx_shared_products_barcodes');
    expect(aliasesMigration).toContain('normalize_product_barcodes');
    expect(aliasesMigration).toContain('coalesce(barcodes, ARRAY[]::text[]) && v_barcodes');
    expect(migrationApply).toContain('2026-06-27_shared_products_barcode.sql');
    expect(migrationApply).toContain('2026-06-28_shared_products_barcodes_array.sql');
    expect(migrationApply).toContain('check-shared-products-barcode.sql');
    expect(migrationApply).toContain('-v ON_ERROR_STOP=1');
    expect(rest).toMatch(/shared_products:\s*\[[\s\S]*'barcode'/);
    expect(rest).toMatch(/shared_products:\s*\[[\s\S]*'barcodes'/);
    expect(rest).toMatch(/shared_products_pending:\s*\[[\s\S]*'barcode'/);
    expect(rest).toMatch(/shared_products_pending:\s*\[[\s\S]*'barcodes'/);
    expect(rest).toContain("const ARRAY_COLUMNS = ['additives', 'barcodes']");
    expect(rest).toContain('contains.');
    expect(rpc).toMatch(/'create_pending_product_by_session':\s*\{[\s\S]*'p_name':\s*'::text'/);
    expect(rpc).toMatch(/'create_pending_product_by_session':\s*\{[\s\S]*'p_fingerprint':\s*'::text'/);
    expect(rpc).toMatch(/'create_pending_product_by_session':\s*\{[\s\S]*'p_name_norm':\s*'::text'/);
    expect(rpc).not.toMatch(/'create_pending_product_by_session':\s*\{[\s\S]*'p_product_name'/);
  });

  it('keeps scanner controls accessible and preserves barcode through moderation UI', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');
    const gateFlow = read('apps/web/heys_app_gate_flow_v1.js');
    const storage = read('apps/web/heys_storage_supabase_v1.js');
    const cloudShared = read('apps/web/heys_cloud_shared_v1.js');

    expect(addProduct).toContain("'aria-label': 'Сканировать штрихкод'");
    expect(addProduct).toContain("'aria-label': barcode ? 'Изменить штрихкод продукта' : 'Добавить штрихкод продукта'");
    expect(addProduct).toContain("HEYS.cloud.searchSharedProducts('', { barcode, limit: 1 })");
    expect(addProduct).toContain('const upsertProductOverlayRow');
    expect(addProduct).toContain('Overlay.upsertRow');
    expect(addProduct).toContain('и синхронизируется');
    expect(addProduct).toContain('const getProductBarcodes');
    expect(addProduct).toContain('mergeProductBarcode');
    expect(addProduct).toContain('Штрихкод отправлен на проверку для общей базы');
    expect(storage).toContain('function normalizeSharedProductBarcode(value)');
    expect(storage).toContain('function normalizeSharedProductBarcodes');
    expect(storage).toContain("replace(/[^0-9A-Z]/g, '')");
    expect(storage).toContain('cleaned.length >= 6 && cleaned.length <= 32');
    expect(storage).toContain('if (barcode != null && !barcodeQuery)');
    expect(storage).toContain('return { data: [], error: null };');
    expect(storage).toContain("'contains.barcodes': barcodeQuery");
    expect(cloudShared).toContain('function normalizeSharedProductBarcode(value)');
    expect(cloudShared).toContain('function normalizeSharedProductBarcodes');
    expect(cloudShared).toContain("filters['eq.barcode'] = barcodeQuery");
    expect(cloudShared).toContain("'contains.barcodes': barcodeQuery");
    expect(cloudShared).toContain('barcode: normalizeSharedProductBarcodes(product)[0] || null');
    expect(cloudShared).toContain('barcodes: normalizeSharedProductBarcodes(product)');
    expect(cloudShared).toContain('p_fingerprint: fingerprint');
    expect(cloudShared).toContain('p_name_norm: nameNorm');
    expect(gateFlow).toContain('p.barcode || item.barcode');
  });

  it('normalizes shared-product barcodes consistently in both cloud modules', () => {
    const storageNormalize = extractFunction(
      read('apps/web/heys_storage_supabase_v1.js'),
      'normalizeSharedProductBarcode'
    );
    const fallbackNormalize = extractFunction(
      read('apps/web/heys_cloud_shared_v1.js'),
      'normalizeSharedProductBarcode'
    );

    for (const normalize of [storageNormalize, fallbackNormalize]) {
      expect(normalize(' 460-123 456 7890 ')).toBe('4601234567890');
      expect(normalize('ab-c 123!')).toBe('ABC123');
      expect(normalize('12345')).toBe('');
      expect(normalize('A'.repeat(33))).toBe('');
      expect(normalize(null)).toBe('');
    }
  });
});
