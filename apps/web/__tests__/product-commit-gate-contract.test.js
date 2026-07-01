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
    expect(core).toContain('cloud_readback_missing_product');
    expect(core).toContain('ensureMealProductReady');
  });

  it('blocks AddProductStep completion until the product is committed', () => {
    const addProduct = read('apps/web/heys_add_product_step_v1.js');

    expect(addProduct).toContain('const commitPersonalProduct = async');
    expect(addProduct).toContain('await commitPersonalProduct(updatedProduct, true');
    expect(addProduct).toContain("closeOnComplete: 'after'");
    expect(addProduct).toContain('await HEYS.products?.ensureMealProductReady?.(selectedProduct');
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
