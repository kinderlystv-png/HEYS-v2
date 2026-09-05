#!/usr/bin/env node
// Pre-commit guard: цены в docs/legal/*.md, legacy/cloud JS-конфигах и каноне
// маркетинга должны совпадать с PRICING из apps/landing/src/config/pricing.ts.
// Source of truth — TS-конфиг.
//
// .md-файлы держим в синхроне вручную (юристы читают markdown).
// JS-конфиги: HEYS.config.prices в legacy bundle + PLANS в cloud function.
// Маркетинг: только канонические таблицы тарифов, линии запуска и pricing-блоки;
// честные meta-цитаты про устаревшее в другом документе не падают.
//
// История: 2026-05-20 ловили рассинхрон, где лендинг показывал 2990/7990/14990,
// а paywall в приложении и платёжная cloud function — старые 1990/12990/19990.
// Клиент видел одну цену, ЮKassa могла бы списать другую — нарушение оферты.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRICING_TS = path.join(ROOT, 'apps/landing/src/config/pricing.ts');
const HEYS_BRIEF = 'docs/HEYS_BRIEF.md';

const MD_FILES = ['docs/legal/user-agreement.md'];

const JS_TARGETS = [
  {
    path: 'apps/web/heys_paywall_v1.js',
    regex:
      /HEYS\.config\.prices\s*=\s*HEYS\.config\.prices\s*\|\|\s*\{\s*base:\s*(\d+),\s*pro:\s*(\d+),\s*proPlus:\s*(\d+)/,
  },
  {
    path: 'apps/web/heys_subscriptions_v1.js',
    regex:
      /HEYS\.config\.prices\s*=\s*HEYS\.config\.prices\s*\|\|\s*\{\s*base:\s*(\d+),\s*pro:\s*(\d+),\s*proPlus:\s*(\d+)/,
  },
  {
    path: 'yandex-cloud-functions/heys-api-payments/index.js',
    regex:
      /base:\s*\{\s*price:\s*(\d+)[^}]*\}[\s,]*\n\s*pro:\s*\{\s*price:\s*(\d+)[^}]*\}[\s,]*\n\s*proplus:\s*\{\s*price:\s*(\d+)/,
  },
];

/** Файлы, где объявлен действующий тарифный канон (консервативный первый охват). */
const MARKETING_CANON_FILES = [
  'маркетинг/01_Ревью_продукта_и_рынка_РФ.md',
  'маркетинг/03_Каналы_и_продакт-плейсмент.md',
  'маркетинг/13_AI_распознавание_и_ревью_тарифов.md',
  'маркетинг/15_Ревизия_и_лог_решений.md',
  'маркетинг/19_Pro-first_методология_Фазы_0.md',
  'маркетинг/22_План_реализации_маркетинга.md',
  'маркетинг/23_Плейбук_куратора.md',
  'маркетинг/43_Pro_Спорт_founder-led_пилот_2026-07-28.md',
  'маркетинг/README.md',
];

/** Известный маркетинговый корпус вне первого охвата — только отчёт, без проверки. */
const MARKETING_UNCHECKED = [
  {
    path: 'маркетинг/00_Дашборд.html',
    reason: 'generated dashboard; тарифы подтягивает build_dashboard.py',
  },
  {
    path: 'маркетинг/40_Аудит_лендинга_mobile_2026-07-26.md',
    reason: 'snapshot аудита с историческими цитатами UI',
  },
  {
    path: 'маркетинг/11_Фазовое_ценообразование_и_запуск.md',
    reason: 'исторический pricing doc до Pro-first',
  },
  {
    path: 'маркетинг/План_исправлений_лендинга_2026-06-21.md',
    reason: 'архивный план до Pro Спорт',
  },
  {
    path: 'маркетинг/Аудит_лендинга_2026-06-21.md',
    reason: 'архивный аудит до Pro Спорт',
  },
  {
    path: 'маркетинг/research/raw/**',
    reason: 'сырьё конкурентного ресёрча, не канон запуска',
  },
  {
    path: 'маркетинг/20_AI_распознавание_legal_safe_MVP.md',
    reason: 'стратегический черновик AI-лестницы, не тарифная витрина Ф0',
  },
  {
    path: 'маркетинг/41_Единый_релизный_контур_и_очередь_промптов_2026-07-26.md',
    reason: 'release prompts; тарифные строки — вложенные цитаты handoff',
  },
  {
    path: 'маркетинг/44_Ревью_архитектуры_тарифного_выбора_2026-07-29.md',
    reason: 'архитектурное ревью; цены не декларирует',
  },
];

const STALE_PUBLIC_NAMES = Object.freeze(['Pro+', 'Base']);
const STALE_PRICE_NUMBERS = Object.freeze([
  1990, 2990, 12990, 14990, // исторические paywall/landing (19 990 — текущий Pro Спорт)
]);
const STALE_PRO_PRICES = Object.freeze(['12 990', '11 990']);
const STALE_PRO_PLUS_PRICES = Object.freeze(['14 990']);

const META_QUOTE_PATTERNS = [
  /стоят\s+старые/i,
  /тарифы\s+старые/i,
  /старые\s*\(/i,
  /расхождение/i,
  /HEYS_BRIEF\.md/i,
  /бывший\s+Pro\+/i,
  /переименован/i,
  /переупакован/i,
  /отклонено/i,
  /Free\/Solo\/Lite\/Pro\/Pro\+/i,
  /Finмодель|финмодель|05_Финмодель/i,
];

const TARIFF_TABLE_ROW_RE =
  /^\|\s*(Pro Спорт|Self|Pro\+|Pro|Base|Lite|Free)\s*\|/i;
const PARAM_TABLE_ROW_RE =
  /^\|\s*(Pro Спорт|Self|Pro\+|Pro|Base|Lite|Free)\s+\|\s+([^|]+)\|/;
const LAUNCH_LINE_RE =
  /Self\s*\/\s*Pro\s*\/\s*(Pro\+|Pro\s*Спорт)/i;
const LAUNCH_CONTEXT_RE =
  /(?:линия запуска|сетка(?:\s+запуска|\s+такая)|действующ(?:ая|ий)\s+сетк|Оплата:|сетку\s+запуска)/i;

function readPricingFromTs() {
  const src = fs.readFileSync(PRICING_TS, 'utf8');
  const result = {};
  const reEntry =
    /(base|pro|proPlus):\s*\{\s*name:\s*'([^']+)'\s*,\s*price:\s*'([^']+)'\s*,\s*period:\s*'([^']+)'\s*\}/g;
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

function priceStrToNumber(s) {
  return Number(String(s).replace(/[\s\u00a0]/g, ''));
}

function normalizeSpaces(s) {
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPriceToken(cell) {
  const m = String(cell).match(/(\d{1,3}(?:[\s\u00a0]\d{3})*|\d+)\s*₽/);
  return m ? normalizeSpaces(m[1]) : null;
}

function isMetaQuoteLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('>')) return true;
  return META_QUOTE_PATTERNS.some((re) => re.test(line));
}

function expectedPublicName(key, pricing) {
  if (key === 'base') return pricing.base.name;
  if (key === 'pro') return pricing.pro.name;
  if (key === 'proPlus') return pricing.proPlus.name;
  return null;
}

function mapTariffColumn(nameCell) {
  const name = normalizeSpaces(nameCell.replace(/\*\*/g, ''));
  if (/^self$/i.test(name)) return 'base';
  if (/^pro$/i.test(name) && !/спорт/i.test(name)) return 'pro';
  if (/^pro\s*спорт$/i.test(name)) return 'proPlus';
  if (/^pro\+$/i.test(name)) return 'proPlus_stale_name';
  if (/^base$/i.test(name)) return 'base_stale_name';
  return null;
}

function stalePriceViolation(planKey, priceToken, relPath, lineNo, line) {
  const num = priceStrToNumber(priceToken);
  if (STALE_PRICE_NUMBERS.includes(num)) {
    return `${relPath}:${lineNo}: устаревшая цена ${priceToken} ₽ в канонической строке тарифа.`;
  }
  if (planKey === 'pro' && STALE_PRO_PRICES.includes(priceToken)) {
    return `${relPath}:${lineNo}: устаревшая цена Pro "${priceToken} ₽" (канон ${readExpectedPrice('pro')}).`;
  }
  if (
    (planKey === 'proPlus' || planKey === 'proPlus_stale_name') &&
    STALE_PRO_PLUS_PRICES.includes(priceToken)
  ) {
    return `${relPath}:${lineNo}: устаревшая цена Pro+ "${priceToken} ₽" (канон Pro Спорт ${readExpectedPrice('proPlus')}).`;
  }
  return null;
}

let cachedPricingForMessages = null;
function readExpectedPrice(planKey) {
  if (!cachedPricingForMessages) cachedPricingForMessages = readPricingFromTs();
  if (planKey === 'pro') return cachedPricingForMessages.pro.price;
  if (planKey === 'proPlus') return cachedPricingForMessages.proPlus.price;
  if (planKey === 'base') return cachedPricingForMessages.base.price;
  return '?';
}

function checkCanonicalTariffTableRow(relPath, lineNo, line, pricing) {
  const errors = [];
  const cells = line.split('|').slice(1, -1);
  if (cells.length < 2) return errors;

  const planKey = mapTariffColumn(cells[0]);
  if (!planKey) return errors;

  if (planKey === 'proPlus_stale_name') {
    errors.push(
      `${relPath}:${lineNo}: публичное имя "Pro+" в канонической таблице тарифов; ` +
        `ожидается "${pricing.proPlus.name}".`
    );
  }
  if (planKey === 'base_stale_name') {
    errors.push(
      `${relPath}:${lineNo}: публичное имя "Base" в канонической таблице тарифов; ` +
        `ожидается "${pricing.base.name}".`
    );
  }

  const priceToken = extractPriceToken(cells[1]);
  if (!priceToken) return errors;

  const stale = stalePriceViolation(planKey, priceToken, relPath, lineNo, line);
  if (stale) errors.push(stale);

  if (planKey === 'base' && priceToken !== pricing.base.price) {
    errors.push(
      `${relPath}:${lineNo}: цена Self "${priceToken} ₽", ожидалось "${pricing.base.price} ₽".`
    );
  }
  if (planKey === 'pro' && priceToken !== pricing.pro.price) {
    errors.push(
      `${relPath}:${lineNo}: цена Pro "${priceToken} ₽", ожидалось "${pricing.pro.price} ₽".`
    );
  }
  if (planKey === 'proPlus' && priceToken !== pricing.proPlus.price) {
    errors.push(
      `${relPath}:${lineNo}: цена Pro Спорт "${priceToken} ₽", ожидалось "${pricing.proPlus.price} ₽".`
    );
  }

  return [...new Set(errors)];
}

function checkCanonicalParamRow(relPath, lineNo, line, pricing) {
  const m = PARAM_TABLE_ROW_RE.exec(line);
  if (!m) return [];
  const planKey = mapTariffColumn(m[1]);
  if (!planKey) return [];

  const errors = [];
  if (planKey === 'proPlus_stale_name') {
    errors.push(
      `${relPath}:${lineNo}: параметрическая таблица всё ещё называет тариф "Pro+".`
    );
  }

  const priceToken = extractPriceToken(m[2]);
  if (!priceToken) return errors;

  const stale = stalePriceViolation(planKey, priceToken, relPath, lineNo, line);
  if (stale) errors.push(stale);

  return errors;
}

function checkCanonicalLaunchLine(relPath, lineNo, line) {
  if (!LAUNCH_LINE_RE.test(line)) return [];
  if (!LAUNCH_CONTEXT_RE.test(line) && !/\*\*Self\s*\/\s*Pro\s*\/\s*Pro\+/.test(line)) {
    return [];
  }
  if (/Pro\s*Спорт/i.test(line) && !/Pro\+/.test(line)) return [];

  if (/Pro\+/.test(line)) {
    return [
      `${relPath}:${lineNo}: линия запуска всё ещё "Self / Pro / Pro+"; ожидается "Self / Pro / Pro Спорт".`,
    ];
  }
  return [];
}

function checkCanonicalLine(relPath, lineNo, line, pricing) {
  if (isMetaQuoteLine(line)) return [];

  const errors = [];
  if (TARIFF_TABLE_ROW_RE.test(line)) {
    errors.push(...checkCanonicalTariffTableRow(relPath, lineNo, line, pricing));
  }
  errors.push(...checkCanonicalParamRow(relPath, lineNo, line, pricing));
  errors.push(...checkCanonicalLaunchLine(relPath, lineNo, line));
  return errors;
}

function checkMarketingCanonFile(relPath, pricing) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return [`${relPath}: файл канона не найден.`];
  }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    errors.push(...checkCanonicalLine(relPath, i + 1, lines[i], pricing));
  }
  return errors;
}

function checkMarketingCanon(pricing) {
  const errors = [];
  for (const relPath of MARKETING_CANON_FILES) {
    errors.push(...checkMarketingCanonFile(relPath, pricing));
  }
  return errors;
}

function reportHeysBriefStale() {
  const abs = path.join(ROOT, HEYS_BRIEF);
  if (!fs.existsSync(abs)) {
    return { found: false, lines: [`${HEYS_BRIEF}: файл не найден.`] };
  }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\|\s*\*\*Pro\+\*\*/.test(line)) {
      hits.push(`${HEYS_BRIEF}:${i + 1}: публичное имя Pro+ в таблице тарифов.`);
    }
    if (/\|\s*\*\*Pro\*\*\s*\|\s*12\s*990/.test(line)) {
      hits.push(`${HEYS_BRIEF}:${i + 1}: цена Pro 12 990 ₽ (канон 7 990 ₽).`);
    }
    if (/Base\s*\/\s*Pro\s*\/\s*Pro\+/.test(line) && !isMetaQuoteLine(line)) {
      hits.push(`${HEYS_BRIEF}:${i + 1}: линия Base / Pro / Pro+ вместо Self / Pro / Pro Спорт.`);
    }
  }
  return { found: hits.length > 0, lines: hits };
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

  const priceRe = /(\d{1,3}(?:[\s\u00a0]\d{3})*)\s*₽\/мес/g;
  const allowed = new Set(Object.values(pricing).map((p) => p.price));
  allowed.add('11 990');
  let m;
  while ((m = priceRe.exec(text)) !== null) {
    const found = m[1].replace(/\u00a0/g, ' ');
    if (!allowed.has(found)) {
      errors.push(
        `${relPath}: найдена цена "${found} ₽/мес", отсутствующая в pricing.ts. ` +
          `Разрешены: ${[...allowed].join(', ')}.`
      );
    }
  }

  return errors;
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

function printScope() {
  const checked = MARKETING_CANON_FILES.length;
  const totalKnown = checked + MARKETING_UNCHECKED.length;
  const remainder = MARKETING_UNCHECKED.map((item) => `${item.path} (${item.reason})`);
  console.log(
    `Охват: ${checked}/${totalKnown} файлов канона проверено; ` +
      `остаток непроверенных: ${MARKETING_UNCHECKED.length} (${remainder.join('; ')})`
  );
}

function main() {
  cachedPricingForMessages = readPricingFromTs();
  const pricing = cachedPricingForMessages;
  const allErrors = [];

  for (const mdRel of MD_FILES) {
    allErrors.push(...checkMdFile(mdRel, pricing));
  }
  for (const target of JS_TARGETS) {
    allErrors.push(...checkJsFile(target, pricing));
  }
  allErrors.push(...checkMarketingCanon(pricing));

  printScope();

  const briefReport = reportHeysBriefStale();
  if (briefReport.found) {
    console.log(`\nHEYS_BRIEF stale report (${briefReport.lines.length}):`);
    for (const line of briefReport.lines) {
      console.log(`  • ${line}`);
    }
  } else {
    console.log('\nHEYS_BRIEF stale report: не найдено устаревших канонических строк.');
  }

  if (allErrors.length > 0) {
    console.error('\n❌ check-pricing-sync: цены рассинхронизированы с pricing.ts:\n');
    for (const e of allErrors) {
      console.error('  • ' + e);
    }
    console.error(
      `\nНарушений: ${allErrors.length}. Почини файлы или обнови apps/landing/src/config/pricing.ts.\n`
    );
    process.exit(1);
  }

  console.log('\n✅ check-pricing-sync: pricing.ts, legal, JS и проверенный маркетинговый канон совпадают.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('check-pricing-sync failed:', err.message);
    process.exit(1);
  }
}

module.exports = {
  MARKETING_CANON_FILES,
  MARKETING_UNCHECKED,
  STALE_PUBLIC_NAMES,
  STALE_PRICE_NUMBERS,
  readPricingFromTs,
  checkMdFile,
  checkJsFile,
  checkMarketingCanon,
  checkMarketingCanonFile,
  checkCanonicalLine,
  isMetaQuoteLine,
  reportHeysBriefStale,
  priceStrToNumber,
};
