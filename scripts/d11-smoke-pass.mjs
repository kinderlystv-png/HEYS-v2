#!/usr/bin/env node
/**
 * HEYS D11/D16 prod smoke — pass1 + pass2 + outcome capture.
 * Usage: node scripts/d11-smoke-pass.mjs [pass1|pass2|both]
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, '.d11-smoke-state.json');
const mode = process.argv[2] || 'both';

function genProduct() {
  const ts = Date.now().toString(36).slice(-6);
  const name = `D11Pending1308${ts}`;
  const kcal = 200 + (parseInt(ts, 36) % 700);
  const harm = 5 + (parseInt(ts, 36) % 4);
  const block = `Название: ${name}
Бренд:
Ккал: ${kcal}
Углеводы: ${(kcal * 0.13).toFixed(1)}
Простые: ${(kcal * 0.02).toFixed(1)}
Сложные: ${(kcal * 0.11).toFixed(1)}
Белок: ${(kcal * 0.11).toFixed(1)}
Жиры: ${(kcal * 0.03).toFixed(1)}
Вредные жиры: 0
Полезные жиры: ${(kcal * 0.03).toFixed(1)}
Транс-жиры: 0
Клетчатка: 1
ГИ: ${40 + (parseInt(ts, 36) % 30)}
Вред: ${harm}`;
  return { name, kcal, harm, block };
}

async function clickFirst(page, ...labels) {
  for (const label of labels) {
    const btn = page.locator('button').filter({ hasText: label }).first();
    if (await btn.count()) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      return label;
    }
  }
  return null;
}

async function dismissOverlays(page) {
  await page.locator('button[aria-label="Закрыть напоминание"]').click({ timeout: 2000 }).catch(() => {});
  await page.locator('button').filter({ hasText: '×' }).first().click({ timeout: 2000 }).catch(() => {});
}

async function loginIfNeeded(page) {
  const phone = page.locator('input[type="tel"], input[placeholder*="999"]').first();
  if (!(await phone.count())) return 'already';
  await phone.fill('5555555555');
  await clickFirst(page, 'Продолжить', 'Далее');
  await page.waitForTimeout(500);
  for (const d of ['1', '2', '1', '2']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(3000);
  return 'logged-in';
}

async function openNewProductForm(page) {
  await dismissOverlays(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    try {
      localStorage.removeItem('heys_product_draft');
      if (window.HEYS?.store?.remove) window.HEYS.store.remove('heys_product_draft');
    } catch (_) { /* noop */ }
  });

  const viaApi = await page.evaluate(() => {
    try {
      if (window.HEYS?.AddProductStep?.show) {
        window.HEYS.AddProductStep.show({
          mealIndex: 0,
          onAdd: () => {},
          onClose: () => {},
        });
        return true;
      }
    } catch (_) { /* noop */ }
    return false;
  });
  if (viaApi) {
    await page.waitForTimeout(1500);
    await clickFirst(page, 'Создать продукт', 'Новый продукт', 'Создать');
    if (await page.locator('textarea').count()) return 'AddProductStep';
  }

  await dismissOverlays(page);
  const addMeal = page.locator('button[aria-label="Добавить приём пищи"]');
  if (await addMeal.count()) await addMeal.click({ force: true });
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  for (const label of ['Создать приём', 'Далее', 'Всё равно', 'Далее →', 'Далее', 'Добавить', 'Быстро добавить 1', 'Новый продукт', 'Создать продукт']) {
    await clickFirst(page, label);
  }
  await page.waitForSelector('textarea', { timeout: 25000 });
}

async function fillAndSubmitProduct(page, block, harm) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('heys_product_draft');
      if (window.HEYS?.store?.remove) window.HEYS.store.remove('heys_product_draft');
    } catch (_) { /* noop */ }
    document.querySelectorAll('input').forEach((inp) => {
      const ph = (inp.placeholder || '').toLowerCase();
      if (ph.includes('ean') || ph.includes('штрих') || inp.className.includes('barcode')) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    const cb = document.querySelector('.aps-create-step input[type=checkbox], input[type=checkbox]');
    if (cb && !cb.checked) cb.click();
  });
  const ta = page.locator('textarea').last();
  await ta.fill(block);
  await page.waitForTimeout(400);
  await page.locator('.aps-create-btn.active').click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await clickFirst(page, 'Пропустить');
  await page.waitForTimeout(1500);
  const harmBtn = page.locator('button.harm-card').filter({ hasText: String(harm) }).first();
  if (await harmBtn.count()) await harmBtn.click();
  else await page.locator('button.harm-card').first().click({ timeout: 10000 });
  await page.waitForTimeout(6000);
}

async function readOutcome(page) {
  return page.evaluate(async () => {
    const el = document.querySelector('.aps-v4-outcome__message, .aps-v4-outcome');
    const msg = el ? el.textContent.trim() : '';
    const bodyMatch = document.body.innerText.match(
      /Продукт сохранён[^\n]+|Такая заявка[^\n]+|Такой продукт уже есть[^\n]+/i
    );
    let debug = {};
    try {
      const prod = window.__APS_LAST_PRODUCT || null;
      if (window.HEYS?.models?.computeProductFingerprint && prod) {
        debug.fingerprint = await window.HEYS.models.computeProductFingerprint(prod);
      }
    } catch (e) {
      debug.fpError = String(e);
    }
    return { msg, body: bodyMatch?.[0] || '', debug };
  });
}

async function runPass(page, block, harm) {
  await openNewProductForm(page);
  await fillAndSubmitProduct(page, block, harm);
  return readOutcome(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  await page.goto('https://app.heyslab.ru/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  await loginIfNeeded(page);
  await page.waitForTimeout(2000);

  let state = {};
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    /* fresh */
  }

  const results = { at: new Date().toISOString(), pass1: null, pass2: null };

  if (mode === 'pass2' && state.block) {
    results.pass2 = await runPass(page, state.block, state.harm);
  } else {
    const product = genProduct();
    state = product;
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    results.pass1 = await runPass(page, product.block, product.harm);
    if (mode === 'both') {
      await page.locator('button').filter({ hasText: 'Продолжить' }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // back out of grams if needed
      for (let i = 0; i < 4; i++) {
        await page.locator('button').filter({ hasText: /Назад|×/ }).first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      results.pass2 = await runPass(page, product.block, product.harm);
    }
  }

  console.log(JSON.stringify({ product: state, results }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
