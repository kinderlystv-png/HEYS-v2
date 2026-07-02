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

describe('personal product commit gate contract', () => {
  it('commits personal products through canonical overlay with cloud readback', () => {
    const core = read('apps/web/heys_core_v12.js');

    expect(core).toContain('ensurePersonalProductCommitted');
    expect(core).toContain("YandexAPI.saveKV(clientId, 'heys_products_overlay_v2'");
    expect(core).toContain("YandexAPI.getKV(clientId, 'heys_products_overlay_v2')");
    expect(core).toContain("Overlay.writeRaw(cloudRows, { skipCloudSync: true");
    expect(core).toContain('cloud_save_ack_pending_readback');
    expect(core).toContain('cloud_save_queued_after_413');
    expect(core).toContain('visible_product_present');
    expect(core).toContain('ensureMealProductReady');
  });

  it('blocks AddProductStep completion until the product is committed', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');

    expect(addProduct).toContain('const commitPersonalProduct = async');
    expect(addProduct).toContain('await commitPersonalProduct(updatedProduct, true');
    expect(addProduct).toContain("closeOnComplete: 'after'");
    expect(addProduct).toContain('await HEYS.products?.ensureMealProductReady?.(selectedProduct');
    expect(addProduct).toContain('productCommitVerified: ready?.ok === true');
    expect(addProduct).toContain('throw new Error(\'product_commit_failed\')');
    expect(addProduct).toContain('throw error;');
    expect(addProduct).not.toContain('штрихкод сохранён локально, но облачная синхронизация сейчас недоступна');
  });

  it('keeps new-product barcode capture on the create step', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');

    expect(addProduct).toContain('const [barcodeInput, setBarcodeInput]');
    expect(addProduct).toContain('openCreateBarcodeScanner');
    expect(addProduct).toContain('handleCreateBarcodeDetected');
    expect(addProduct).toContain('BarcodeScannerModal');
    expect(addProduct).toContain('aps-create-barcode-field');
    expect(addProduct).toContain('const productWithBarcode = effectiveBarcode ? mergeProductBarcode(parsedPreview, effectiveBarcode) : parsedPreview;');
    expect(addProduct).toContain('newProduct: preparedProduct');
    expect(addProduct).toContain('selectedProduct: preparedProduct');
    expect(addProduct).toContain('barcode: effectiveBarcode');
  });

  it('keeps product brand as a separate optional product attribute', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');
    const storage = read('apps/web/heys_storage_supabase_v1.js');
    const overlay = read('apps/web/heys_products_overlay_v1.js');
    const dayBundle = read('apps/web/heys_day_bundle_v1.js');
    const styles = read('apps/web/styles/modules/600-steps-and-aps.css');
    const rest = read('yandex-cloud-functions/heys-api-rest/index.js');
    const migration = read('database/2026-07-02_add_product_brand.sql');
    const brandFingerprintMigration = read('database/2026-07-02_add_product_brand_fingerprint.sql');
    const dryRun = read('database/2026-07-02_product_brand_backfill_dry_run.sql');
    const models = read('apps/web/heys_models_v1.js');

    expect(addProduct).toContain('const normalizeProductBrand = (value) =>');
    expect(addProduct).toContain('const shouldDisplayProductBrand = (product) =>');
    expect(addProduct).toContain('const getProductSearchText = (product, normalizeFn) =>');
    expect(addProduct).toContain('const [brandInput, setBrandInput]');
    expect(addProduct).toContain('aps-create-brand-field');
    expect(addProduct).toContain("React.createElement('label', { className: 'aps-create-brand-label' }, 'Бренд')");
    expect(addProduct).toContain('brand: normalizeProductBrand(brandInput) || null');
    expect(addProduct).toContain('brand_fingerprint: brandFingerprint || null');
    expect(addProduct).toContain('{ brandFingerprint, limit: 1 }');
    expect(addProduct).toContain("React.createElement('div', { className: 'aps-product-brand' }, highlightedBrand)");
    expect(addProduct).toContain('getProductSearchText(p, normalizeSearch).includes(lc)');

    expect(models).toContain('async function computeProductBrandFingerprint(product)');
    expect(models).toContain('M.computeProductBrandFingerprint = computeProductBrandFingerprint');
    expect(storage).toContain('function normalizeSharedProductBrand(value)');
    expect(storage).toContain('function normalizeSharedProductBrandFingerprint(value)');
    expect(storage).toContain("'ilike.brand': `%${q}%`");
    expect(storage).toContain("'eq.brand_fingerprint'");
    expect(storage).toContain('brand: normalizeSharedProductBrand(product.brand)');
    expect(storage).toContain('brand_fingerprint: normalizeSharedProductBrandFingerprint(brandFingerprint)');
    expect(storage).toContain("select: 'id,name,brand,brand_fingerprint,barcode,barcodes'");
    expect(overlay).toContain("'brand',");
    expect(dayBundle).toContain('brand: finalProduct.brand || null');
    expect(dayBundle).toContain('brand_fingerprint: finalProduct.brand_fingerprint || finalProduct.brandFingerprint || null');
    expect(styles).toContain('.aps-product-brand');
    expect(styles).toContain('.aps-create-brand-field');

    expect(rest).toContain("'id', 'name', 'brand', 'brand_fingerprint', 'name_norm', 'fingerprint'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS brand TEXT');
    expect(migration).toContain('idx_shared_products_brand_trgm');
    expect(migration).toContain("p_product_data->>'brand'");
    expect(brandFingerprintMigration).toContain('ADD COLUMN IF NOT EXISTS brand_fingerprint TEXT');
    expect(brandFingerprintMigration).toContain('DROP INDEX IF EXISTS public.idx_shared_products_fingerprint_unique');
    expect(brandFingerprintMigration).toContain('idx_shared_products_brand_fingerprint_unique');
    expect(brandFingerprintMigration).toContain('brand_fingerprint = v_brand_fingerprint');
    expect(dryRun).toContain('Dry-run only');
    expect(dryRun).toContain('proposed_brand');
  });

  it('keeps both day-add entry points behind ensureMealProductReady', () => {
    const dayMeals = read('apps/web/day/_meals.js');
    const dayAddProduct = read('apps/web/heys_day_add_product.js');
    const dayEffects = read('apps/web/heys_day_effects.js');
    const mealRecCard = read('apps/web/insights/pi_ui_meal_rec_card.js');
    const mealOptimizer = read('apps/web/heys_day_meal_optimizer_section.js');

    expect(dayMeals).toContain('await HEYS.products?.ensureMealProductReady?.(product');
    expect(dayMeals).toContain('ensureProductReadyForDayWrite');
    expect(dayMeals).toContain('const addProductToMeal = React.useCallback(async');
    expect(dayMeals).toContain('const addProductsToMeal = React.useCallback(async');
    expect(dayMeals).toContain('productCommitVerified: true');
    expect(dayMeals).toContain('ensureDiaryItemsReadyForDayWrite');
    expect(dayMeals).toContain('const repeatYesterdayMeal = React.useCallback(async');
    expect(dayMeals).toContain('const moveMealToDate = React.useCallback(async');
    expect(dayMeals).toContain('day-inline-add-products-bulk');
    expect(dayMeals).toContain('Продукт не сохранён в базу. Запись в дневник не добавлена');

    expect(dayAddProduct).toContain('await HEYS.products?.ensureMealProductReady?.(product');
    expect(dayAddProduct).toContain("reason: 'already_verified'");
    expect(dayAddProduct).toContain('day-add-product-bulk');
    expect(dayAddProduct).toContain('Продукт не сохранён в базу. Запись в дневник не добавлена');

    expect(dayEffects).toContain('HEYS.Day.addProductToMeal = async');
    expect(dayEffects).toContain('const didAdd = await addProductToMeal');
    expect(dayEffects).toContain('HEYS.Day.addProductsToMeal = async');
    expect(dayEffects).toContain('const didAdd = await addProductsToMeal');
    expect(mealRecCard).toContain('const success = await HEYS.Day.addProductToMeal');
    expect(mealRecCard).toContain('const success = await HEYS.Day.addProductsToMeal');
    expect(mealOptimizer).toContain('const didAdd = await addProductToMeal');
  });

  it('repairs existing day orphans without publishing to shared products', () => {
    const repair = read('scripts/db/repair-products-overlay-orphans.sql');

    expect(repair).toContain("kv.k LIKE 'heys_dayv2_%'");
    expect(repair).toContain("COALESCE((item->>'_oneTime')::boolean, false) = false");
    expect(repair).toContain("'_custom', true");
    expect(repair).toContain("'heys_products_overlay_v2'");
    expect(repair).not.toContain('INSERT INTO shared_products');
    expect(repair).not.toContain('INSERT INTO shared_products_pending');
  });
});
