#!/usr/bin/env node
// Pre-commit guard: цены в docs/legal/*.md должны совпадать с PRICING из
// apps/landing/src/config/pricing.ts. Source of truth — TS-конфиг; .md-файлы
// держим вручную в синхроне, чтобы юристы могли читать читабельный markdown.
//
// Триггерится, если в .md встречается «<тариф> <цена>» с ценой, которая
// отсутствует в PRICING. Не пытается парсить .md семантически — просто
// сверяет, что все упомянутые в TS цены живут в .md, и наоборот для трёх
// известных тарифов.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRICING_TS = path.join(ROOT, 'apps/landing/src/config/pricing.ts');
const MD_FILES = [
  'docs/legal/user-agreement.md',
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

function main() {
  const pricing = readPricingFromTs();
  const allErrors = [];
  for (const mdRel of MD_FILES) {
    allErrors.push(...checkMdFile(mdRel, pricing));
  }

  if (allErrors.length > 0) {
    console.error('\n❌ check-pricing-sync: цены в docs/legal/*.md рассинхронизированы с pricing.ts:\n');
    for (const e of allErrors) {
      console.error('  • ' + e);
    }
    console.error(
      '\nПочини .md-файлы или обнови apps/landing/src/config/pricing.ts, ' +
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
