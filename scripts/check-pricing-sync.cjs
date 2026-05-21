#!/usr/bin/env node
// Pre-commit guard: цены в docs/legal/*.md И в legacy/cloud JS-конфигах должны
// совпадать с PRICING из apps/landing/src/config/pricing.ts. Source of truth —
// TS-конфиг.
//
// .md-файлы держим в синхроне вручную (юристы читают markdown).
// JS-конфиги: HEYS.config.prices в legacy bundle + PLANS в cloud function.
//
// История: 2026-05-20 ловили рассинхрон, где лендинг показывал 2990/7990/14990,
// а paywall в приложении и платёжная cloud function — старые 1990/12990/19990.
// Клиент видел одну цену, ЮKassa могла бы списать другую — нарушение оферты.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRICING_TS = path.join(ROOT, 'apps/landing/src/config/pricing.ts');
const MD_FILES = [
  'docs/legal/user-agreement.md',
];

// JS-файлы с захардкоженными ценами. Для каждого — regex с тремя capture-
// группами в порядке base/pro/proPlus. Если структура файла изменится — regex
// нужно обновить вручную (хук скажет «не нашли паттерн»).
const JS_TARGETS = [
  {
    path: 'apps/web/heys_paywall_v1.js',
    regex: /HEYS\.config\.prices\s*=\s*HEYS\.config\.prices\s*\|\|\s*\{\s*base:\s*(\d+),\s*pro:\s*(\d+),\s*proPlus:\s*(\d+)/,
  },
  {
    path: 'apps/web/heys_subscriptions_v1.js',
    regex: /HEYS\.config\.prices\s*=\s*HEYS\.config\.prices\s*\|\|\s*\{\s*base:\s*(\d+),\s*pro:\s*(\d+),\s*proPlus:\s*(\d+)/,
  },
  {
    path: 'yandex-cloud-functions/heys-api-payments/index.js',
    regex: /base:\s*\{\s*price:\s*(\d+)[^}]*\}[\s,]*\n\s*pro:\s*\{\s*price:\s*(\d+)[^}]*\}[\s,]*\n\s*proplus:\s*\{\s*price:\s*(\d+)/,
  },
];

function readPricingFromTs() {
  const src = fs.readFileSync(PRICING_TS, 'utf8');
  const result = {};
  const reEntry = /(base|pro|proPlus):\s*\{\s*name:\s*'([^']+)'\s*,\s*price:\s*'([^']+)'\s*,\s*period:\s*'([^']+)'\s*\}/g;
  let m;
  while ((m = reEntry.exec(src)) !== null) {
    result[m[1]] = { name: m[2], price: m[3], period: m[4] };
  }
  const keys = ['base', 'pro', 'proPlus'];
  for (const k of keys) {
    if (!result[k]) {
      throw new Error(`pricing.ts: missing entry for "${k}"`);
    }
  }
  return result;
}

function checkMdFile(relPath, pricing) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return [];
  const text = fs.readFileSync(abs, 'utf8');
  const errors = [];

  for (const plan of Object.values(pricing)) {
    const expected = `${plan.price} ${plan.period}`;
    if (!text.includes(expected)) {
      errors.push(
        `${relPath}: цена тарифа "${plan.name}" не найдена. Ожидалось: "${expected}".`
      );
    }
  }

  const priceRe = /(\d{1,3}(?:[\s ]\d{3})*)\s*₽\/мес/g;
  const allowed = new Set(Object.values(pricing).map((p) => p.price));
  let m;
  while ((m = priceRe.exec(text)) !== null) {
    const found = m[1].replace(/ /g, ' ');
    if (!allowed.has(found)) {
      errors.push(
        `${relPath}: найдена цена "${found} ₽/мес", отсутствующая в pricing.ts. ` +
        `Разрешены: ${[...allowed].join(', ')}.`
      );
    }
  }

  return errors;
}

// Превращаем '2 990' / '2 990' (с неразрывным пробелом) в число 2990.
function priceStrToNumber(s) {
  return Number(String(s).replace(/[\s ]/g, ''));
}

function checkJsFile(target, pricing) {
  const abs = path.join(ROOT, target.path);
  if (!fs.existsSync(abs)) return [];
  const text = fs.readFileSync(abs, 'utf8');
  const m = target.regex.exec(text);
  if (!m) {
    return [
      `${target.path}: не нашли паттерн цен (regex не сматчился). ` +
      `Если структура файла изменилась — обнови regex в scripts/check-pricing-sync.cjs.`,
    ];
  }
  const errors = [];
  const order = ['base', 'pro', 'proPlus'];
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const found = Number(m[i + 1]);
    const expected = priceStrToNumber(pricing[key].price);
    if (found !== expected) {
      errors.push(
        `${target.path}: цена тарифа "${pricing[key].name}" = ${found}, ` +
        `ожидалось ${expected} (из pricing.ts).`
      );
    }
  }
  return errors;
}

function main() {
  const pricing = readPricingFromTs();
  const allErrors = [];
  for (const mdRel of MD_FILES) {
    allErrors.push(...checkMdFile(mdRel, pricing));
  }
  for (const target of JS_TARGETS) {
    allErrors.push(...checkJsFile(target, pricing));
  }

  if (allErrors.length > 0) {
    console.error('\n❌ check-pricing-sync: цены рассинхронизированы с pricing.ts:\n');
    for (const e of allErrors) {
      console.error('  • ' + e);
    }
    console.error(
      '\nПочини файлы или обнови apps/landing/src/config/pricing.ts, ' +
      'чтобы значения совпали.\n'
    );
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error('check-pricing-sync failed:', err.message);
  process.exit(1);
}
