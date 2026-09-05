#!/usr/bin/env node
/**
 * Task 67 · полоса 2 — touch-target verdicts for food-meal + product-card.
 * Run: node scripts/.task67-polosa2-touch-verdict-apply.mjs [--after-rehash]
 */
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const FM_TEST = 'apps/web/__tests__/polosa4-task63-food-meal-touch-44px.test.js';
const PC_TEST = 'apps/web/__tests__/polosa4-task63-product-card-touch-44px.test.js';

const FOOD_MEAL_LINES = [
  'тач-цели',
  'Добавление · время и тип · 16',
  'Добавление · время и тип · 22',
  'Добавление · самочувствие · 20',
  'Добавление · самочувствие · 21',
  'Добавление · самочувствие · 23',
  'Добавление · как добавлять · 15',
  'Добавление · выбор способа · 06',
  'Добавление · выбор способа · 15',
  'Добавление · поиск · 10',
  'Поиск · только свои · 10',
  'Добавление · порция · 17',
  'Добавление · порция · 18',
  'Порция · ввод в калориях · 16',
  'Порция · ввод в калориях · 17',
  'Порция · продукт уже в приёме · 17',
  'Порция · продукт уже в приёме · 18',
  'Порция · перебор нормы · 17',
  'Порция · перебор нормы · 18',
  'Действие · копировать · чего не знаем · 25',
  'Добавление · наборы · 11',
  'Добавление · наборы · 12',
  'Добавление · наборы · 18',
  'Добавление · правка набора · 08',
  'Наборы · 12',
  'Наборы · 13',
  'Наборы · вкладка поиска · 12',
  'Наборы · вкладка поиска · 13',
  'Наборы · вкладка поиска · 19',
  'Набор · сборка · 05',
  'Набор · сборка · 20',
  'Набор · сборка пустая · 05',
  'Набор · сборка пустая · 11',
  'Набор · сохранение · 08',
  'Набор · удаление · 09',
  'Приём · время и тип · 16',
  'Приём · время и тип · 17',
];

const FM_SELECTOR_FACTS = {
  'тач-цели':
    'Пакет 36: нажимаемые цели ≥44 px видимым размером; margin-расширители сняты с .aps-v4-grams-chip, .mpr-grams-btn, .mpr-preview-item-toggle; образец nutrition-v4-chip::after none; ' +
    `${FM_TEST} 3/3, computed sand=blue 44px на 25 пробах.`,
  'Добавление · время и тип · 16':
    '.meal-time-shift min-height 44px — 610-aps-meal-flow.css; handoff polosa4-task63; computed 44 sand=blue.',
  'Добавление · поиск · 10':
    '.aps-v4-shared-filter min-height 44px — 610; handoff; computed shared-filter 44.',
  'Поиск · только свои · 10':
    '.aps-v4-search-tab min-height 44px — 610; handoff; computed search-tab 44.',
  'Добавление · порция · 17':
    '.aps-v4-grams-unit min-height 44px — 610; handoff; computed grams-unit 44.',
  'Добавление · порция · 18':
    '.aps-v4-grams-hero__step height 44px, font-size 16px (было 24) — 610; handoff; computed grams-step 44.',
  'Приём · время и тип · 17':
    '.meal-type-chip min-height 44px в листе — 610; handoff .meal-type-section--sheet; computed type-chip 44.',
  'Действие · копировать · чего не знаем · 25':
    '.meal-transfer-v4__product-fix min-height 44px — 610; handoff; computed transfer-fix 44.',
  'Добавление · наборы · 18':
    '.mpr-btn height 44px — 610; handoff; computed mpr-btn 44.',
};

// Семантические имена handoff → канонические ключи контракта (numbered spec keys).
const PRODUCT_CARD_LINES = [
  'тач-цели',
  'Продукт · вставка строки · 08',
  'Продукт · вставка строки · 15',
  'Продукт · вставка строки · 22',
  'Продукт · дополнительно · 11',
  'Продукт · дополнительно · 14',
  'Продукт · дополнительно · 16',
  'Продукт · дополнительно · 17',
  'Продукт · порции · 09',
  'Продукт · порции · 10',
  'Правка продукта · основные · 21',
  'Правка продукта · основные · 23',
  'Правка продукта · основные · 24',
  'Правка продукта · основные · 13',
  'Штрихкод · наведение · 04',
  'Штрихкод · наведение · 20',
];

const PC_SELECTOR_FACTS = {
  'тач-цели':
    'Пакет 36: нажимаемые цели ≥44 px видимым размером; ::after expander снят у fullscreen barcode close; 611-aps-product-card.css + heys-components.css; ' +
    `${PC_TEST} 3/3, computed sand=blue 44px на 13 пробах.`,
  'Продукт · дополнительно · 11':
    '.pe-segment-btn min-height 44px — heys-components.css; handoff; computed pe-segment 44.',
  'Продукт · дополнительно · 14':
    '.pe-input min-height 44px — heys-components.css; computed pe-input-main 44.',
  'Продукт · дополнительно · 16':
    '.pe-step:has(.pe-toggles) .pe-input min-height 44px — heys-components.css; computed pe-input-extra 44.',
  'Продукт · дополнительно · 17':
    '.pe-segment-btn min-height 44px — NOVA сегменты; computed pe-segment 44.',
  'Продукт · порции · 09':
    '.aps-v4-portions-suggest .aps-v4-portions-row--readonly min-height 44px — 611; computed suggest-chip 44.',
  'Продукт · порции · 10':
    '.aps-v4-portions-suggest .aps-v4-btn-ghost min-height 44px — 611; computed use-template 44.',
  'Правка продукта · основные · 21':
    '.pe-portions-template-btn min-height 44px — heys-components.css; computed pe-template 44.',
  'Правка продукта · основные · 23':
    '.pe-portions-name min-height 44px — heys-components.css; computed pe-input-main 44.',
  'Правка продукта · основные · 24':
    '.pe-input min-height 44px — heys-components.css; computed pe-input-main 44.',
  'Правка продукта · основные · 13':
    '«Например: Простоквашино» — .aps-create-brand-input min-height 44px — 611; computed brand-input 44.',
  'Штрихкод · наведение · 04':
    '.aps-barcode-overlay--v4-fullscreen .aps-barcode-close height 44px visible, ::after удалён — 611; computed fullscreen-close 44.',
  'Штрихкод · наведение · 20':
    '«Ввести код вручную» min-height 44px — кадр наведения; .aps-barcode-input/.aps-barcode-submit 44px в runtime; computed barcode-input/submit 44.',
  'Продукт · вставка строки · 08':
    'Строка штрихкода min-height 44px — .aps-create-prompt-row / barcode row 611; computed prompt-btn 44.',
  'Продукт · вставка строки · 15':
    '«Промпт для ИИ» + «Вставить из буфера» — .aps-create-prompt-btn/.aps-create-example-btn min-height 44px; computed 44.',
  'Продукт · вставка строки · 22':
    '.aps-create-publish min-height 44px — 611; computed publish-row 44.',
};

function defaultFact(zone, key) {
  const test = zone === 'food-meal' ? FM_TEST : PC_TEST;
  return `${key} — видимый габарит ≥44 px без невидимых expanders; ${test} TOUCH_CONTRACT_LINES + computed sand=blue 44px.`;
}

function applyZone(zoneId, lines, factMap) {
  let applied = 0;
  let skipped = 0;
  let missing = 0;
  for (const key of lines) {
    const fact = factMap[key] || defaultFact(zoneId, key);
    try {
      const result = setVerdictKey(zoneId, key, { verdict: '=', fact });
      if (result.skipped) {
        skipped += 1;
        console.log(`skip ${zoneId} :: ${key} (${result.reason || 'skipped'})`);
      } else {
        applied += 1;
        console.log(`${zoneId} :: ${key}  ${result.was.v} → =`);
      }
    } catch (error) {
      if (String(error.message).includes('нет')) {
        missing += 1;
        console.log(`missing ${zoneId} :: ${key}`);
      } else {
        throw error;
      }
    }
  }
  console.log(`${zoneId}: applied ${applied}, skipped ${skipped}, missing ${missing}, total ${lines.length}`);
  return { applied, skipped, missing };
}

console.log('--- touch verdict apply (post-rehash) ---');
applyZone('food-meal', FOOD_MEAL_LINES, FM_SELECTOR_FACTS);
applyZone('product-card', PRODUCT_CARD_LINES, PC_SELECTOR_FACTS);
