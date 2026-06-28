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
    const attachMigration = read('scripts/db/migrations/2026-06-28_shared_products_barcode_attach.sql');
    expect(attachMigration).toContain('add_shared_product_barcode_by_session');
    expect(attachMigration).toContain('add_shared_product_barcode_by_curator');
    expect(attachMigration).toContain('barcode_duplicate');
    expect(attachMigration).toContain('require_client_id');
    const rpcProductsMigration = read('scripts/db/migrations/2026-06-28_get_shared_products_barcodes.sql');
    expect(rpcProductsMigration).toContain('DROP FUNCTION IF EXISTS public.get_shared_products');
    expect(rpcProductsMigration).toContain('barcode TEXT');
    expect(rpcProductsMigration).toContain('barcodes TEXT[]');
    expect(rpcProductsMigration).toContain('sp.barcode');
    expect(rpcProductsMigration).toContain('sp.barcodes');
    expect(migrationApply).toContain('2026-06-27_shared_products_barcode.sql');
    expect(migrationApply).toContain('2026-06-28_shared_products_barcodes_array.sql');
    expect(migrationApply).toContain('2026-06-28_shared_products_barcode_attach.sql');
    expect(migrationApply).toContain('2026-06-28_get_shared_products_barcodes.sql');
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
    expect(rpc).toContain("'add_shared_product_barcode_by_session'");
    expect(rpc).toContain("'add_shared_product_barcode_by_curator'");
    expect(rpc).toMatch(/'add_shared_product_barcode_by_session':\s*\{[\s\S]*'p_product_id':\s*'::uuid'/);
    expect(rpc).toMatch(/'add_shared_product_barcode_by_curator':\s*\{[\s\S]*'p_curator_id':\s*'::uuid'/);
    expect(rpc).not.toMatch(/'create_pending_product_by_session':\s*\{[\s\S]*'p_product_name'/);
  });

  it('keeps scanner controls accessible and preserves barcode through moderation UI', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');
    const gateFlow = read('apps/web/heys_app_gate_flow_v1.js');
    const storage = read('apps/web/heys_storage_supabase_v1.js');
    const cloudShared = read('apps/web/heys_cloud_shared_v1.js');

    expect(addProduct).toContain("'aria-label': 'Сканировать штрихкод'");
    expect(addProduct).toContain("'aria-label': barcode ? 'Управлять штрихкодами продукта' : 'Добавить штрихкод продукта'");
    expect(addProduct).toContain("HEYS.cloud.searchSharedProducts('', { barcode, limit: 1 })");
    expect(addProduct).toContain('const upsertProductOverlayRow');
    expect(addProduct).toContain('Overlay.upsertRow');
    expect(addProduct).toContain('и синхронизируется');
    expect(addProduct).toContain('const getProductBarcodes');
    expect(addProduct).toContain('mergeProductBarcode');
    expect(addProduct).toContain('mergeSharedBarcodeIntoProductForAddStep');
    expect(addProduct).toContain('const dedupeBarcodeMatches');
    expect(addProduct).toContain('const matches = dedupeBarcodeMatches([...localMatches, ...sharedMatches], barcode);');
    expect(addProduct).not.toContain("String(product._source || '') + ':'");
    expect(addProduct).toContain('startWithBarcodeScanner');
    expect(addProduct).toContain("setBarcodeModal({ mode: 'search' })");
    expect(addProduct).toContain('BarcodeScanIcon,');
    expect(addProduct).toContain('resolveSharedBarcodeProductForAddStep');
    expect(addProduct).toContain('product = mergeSharedBarcodeIntoProductForAddStep(product)');
    expect(addProduct).toContain('await HEYS.cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: true })');
    expect(addProduct).toContain('const openProductBarcodeControl = useCallback(async');
    expect(addProduct).toContain('const updateSharedProductBarcodes');
    expect(addProduct).toContain('HEYS.cloud?.addSharedProductBarcode');
    expect(addProduct).toContain("mode === 'add'");
    expect(addProduct).toContain("window.addEventListener('heys:shared-products-updated'");
    expect(addProduct).toContain('HEYS.cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: true })');
    expect(addProduct).toContain("select: 'id,name,barcode,barcodes'");
    expect(addProduct).toContain('const payload = { id: targetId, barcode, barcodes };');
    expect(addProduct).toContain('HEYS.cloud?.updateCachedSharedProduct?.(targetId, { barcode, barcodes })');
    expect(addProduct).toContain('if (sharedId) {');
    expect(addProduct).toContain("const result = await updateSharedProductBarcodes(updatedProduct, sharedId, { mode: 'add', barcode })");
    expect(addProduct).toContain('Штрихкод отправлен на проверку для общей базы');
    expect(addProduct).toContain('По штрихкоду ничего не найдено. Попробуйте ещё раз или воспользуйтесь поиском по названию.');
    expect(addProduct).toContain('requestAnimationFrame(() => inputRef.current?.focus())');
    expect(addProduct).toContain('HEYS BARCODE CAMERA DEBUG');
    expect(addProduct).toContain('Диагностика камеры скопирована');
    expect(addProduct).toContain('scanner.debug.refresh');
    expect(addProduct).toContain('Диагностика обновлена ниже');
    expect(addProduct).toContain('debugReportText');
    expect(addProduct).toContain('aps-barcode-debug-text');
    expect(addProduct).not.toContain('if (isIOSCameraBrowser()) return false;');
    const platformApis = read('apps/web/heys_platform_apis_v1.js');
    expect(platformApis).toContain('function getBarcodePolyfillGlobal');
    expect(platformApis).toContain("typeof barcodeDetectorPolyfill !== 'undefined'");
    expect(platformApis).toContain('getDebugState: getBarcodeDebugState');
    expect(platformApis).toContain('function createBarcodeFrameSampler');
    expect(platformApis).toContain("drawCrop('visible-crop'");
    expect(platformApis).toContain("drawCrop('barcode-band'");
    expect(platformApis).toContain("drawCrop('barcode-tight'");
    expect(platformApis).toContain("targets.push({ name: 'video-full'");
    expect(platformApis).toContain('function decodeEan13Bits');
    expect(platformApis).toContain('function decodeEan13FromImageSource');
    expect(platformApis).toContain('fallbackAttempts');
    expect(platformApis).toContain('ean13-fallback');
    expect(platformApis).toContain('BarcodeDetector polyfill loaded');
    expect(platformApis).toContain('/vendor/barcode/');

    const dayMeals = read('apps/web/day/_meals.js');
    expect(dayMeals).toContain('const renderFlowBarcodeIcon');
    expect(dayMeals).toContain('startWithBarcodeScanner: options.startWithBarcodeScanner === true');
    expect(dayMeals).toContain('const renderFlowBarcodeButton');
    expect(dayMeals).toContain('className: \'flow-selection-btn__barcode-tap\'');
    expect(dayMeals).toContain('openFlowAddProduct(multiProductMode, autoRepeatCount, true)');
    expect(dayMeals).toContain('onClick: () => openFlowAddProduct(multiProductMode, 0, false)');
    expect(dayMeals).toContain('onClick: () => openFlowAddProduct(true, n, false)');
    expect(dayMeals).toContain('`Еще ${n}`');
    expect(dayMeals).not.toContain('`Добавить ${n}`');
    expect(dayMeals).toContain('window.HEYS?.AddProductStep?.BarcodeScanIcon');
    expect(dayMeals).toContain('handleFlowRepeatRecent');
    expect(platformApis).toContain('canLoadBarcodePolyfill');
    expect(platformApis).toContain('shouldPreferBarcodePolyfill');
    expect(platformApis).toContain('initBarcodeDetector({ allowPolyfill: false })');
    const webPackage = JSON.parse(read('apps/web/package.json'));
    expect(webPackage.dependencies).toHaveProperty('@undecaf/barcode-detector-polyfill');
    expect(fs.existsSync(path.join(repoRoot, 'apps/web/public/vendor/barcode/zbar-wasm.js'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'apps/web/public/vendor/barcode/zbar.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'apps/web/public/vendor/barcode/barcode-detector-polyfill.js'))).toBe(true);
    expect(storage).toContain('function normalizeSharedProductBarcode(value)');
    expect(storage).toContain('function normalizeSharedProductBarcodes');
    expect(storage).toContain("replace(/[^0-9A-Z]/g, '')");
    expect(storage).toContain('cleaned.length >= 6 && cleaned.length <= 32');
    expect(storage).toContain('if (barcode != null && !barcodeQuery)');
    expect(storage).toContain('return { data: [], error: null };');
    expect(storage).toContain("'contains.barcodes': barcodeQuery");
    expect(storage).toContain('cloud.addSharedProductBarcode = async function');
    expect(storage).toContain("add_shared_product_barcode_by_session");
    expect(cloudShared).toContain('function normalizeSharedProductBarcode(value)');
    expect(cloudShared).toContain('function normalizeSharedProductBarcodes');
    expect(cloudShared).toContain('cloud.addSharedProductBarcode = async function');
    expect(cloudShared).toContain("add_shared_product_barcode_by_curator");
    expect(cloudShared).toContain("filters['eq.barcode'] = barcodeQuery");
    expect(cloudShared).toContain("'contains.barcodes': barcodeQuery");
    expect(cloudShared).toContain('barcode: normalizeSharedProductBarcodes(product)[0] || null');
    expect(cloudShared).toContain('barcodes: normalizeSharedProductBarcodes(product)');
    expect(cloudShared).toContain('p_fingerprint: fingerprint');
    expect(cloudShared).toContain('p_name_norm: nameNorm');
    expect(gateFlow).toContain('p.barcode || item.barcode');
    const core = read('apps/web/heys_core_v12.js');
    expect(core).toContain("setIfMissing('barcode', sharedProduct.barcode)");
    expect(core).toContain("setListIfMissing('barcodes', sharedProduct.barcodes)");
    expect(core).toContain('barcode: shared.barcode ?? null');
    expect(core).toContain('barcodes: Array.isArray(shared.barcodes) ? shared.barcodes : []');
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
