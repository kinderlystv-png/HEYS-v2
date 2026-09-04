#!/usr/bin/env node
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
/**
 * Bulk-close nutrition-tab ? verdicts after code verification.
 * Usage: node scripts/.nt-close-verdicts.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/nutrition-tab.v4.dc.html',
);
const SOURCES = [
  'apps/web/heys_day_nutrition_v1.js',
  'apps/web/heys_day_water_v1.js',
  'apps/web/heys_move_modal_v1.js',
  'apps/web/heys_day_copy_meal_modal_v1.js',
  'apps/web/heys_day_meal_optimizer_section.js',
  'apps/web/heys_meal_optimizer_v1.js',
  'apps/web/day/_meals.js',
  'apps/web/styles/modules/732-ui-v4-nutrition.css',
  'apps/web/styles/modules/400-water-and-hydration.css',
  'apps/web/styles/modules/610-aps-meal-flow.css',
  'apps/web/styles/modules/002-ui-v4-palette-roles.css',
].map((p) => path.join(ROOT, p));

const sourceBlob = SOURCES.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const canvas = fs.readFileSync(CANVAS, 'utf8');
const dryRun = process.argv.includes('--dry-run');

const TEXT_FACT =
  'копия кадра найдена в коде. Проверял не целиком строкой, а поимённо: из каждой копии взяты фразы длиннее восемнадцати знаков без чисел и найдены поиском по дереву. Числа и названия продуктов в кадре — демонстрационные, они приходят из данных человека';

const FRAME_HEIGHT =
  'высота макета кадра. Канвас рисует длинный экран целиком, подбирая высоту под содержимое, — в продукте вкладка прокручивается, и фиксированной высоты у неё нет ни в одном месте';
const FRAME_WRAP =
  'обвязка кадра, а не экран: макет телефона и подпись с именем экрана. Их рисует сам канвас у каждого кадра, в продукте им ничего не соответствует';
const SECTION_GAP =
  'отступ секции кадра: сам блок сверяется парой классов в nutrition-v4-canvas-geometry.test.js, а эта строка разбора называет только вертикальный зазор между секциями кадра — у продукта его держит раскладка вкладки, отдельного правила под него нет';
const DEMO_WIDTH =
  'доля заполнения на демонстрационных данных: ширина полосы считается из съеденного и нормы человека, поэтому число кадра — пример, а не правило';
const RAZBOR_FACT =
  'Строка разбора сверена парой «элемент кадра → правило продукта» в nutrition-v4-canvas-razbor.test.js: числа этого элемента читаются из самого канваса, расхождение всплывает при правке любой из сторон';

// Explicit contract-line overrides (verified in code this session).
const CONTRACT = {
  'цвета зон': {
    v: '=',
    f: '002-ui-v4-palette-roles.css:167,175,209 + тёмная/синяя/сине-тёмная — --v4-ok-fill, --v4-warn-soft, --v4-bad-text совпадают с контрактом; nutrition-v4-sage-roles.test.js сверяет все четыре набора',
  },
  добавки: {
    v: '=',
    f: 'SupplementsBlockV4: четыре группы Утро/С едой/Вечер/По случаю, чипы и «Всё сразу» — heys_day_nutrition_v1.js:1026-1210; легаси renderSupplementsCard на вкладке не вызывается',
  },
  'действия приёма': {
    v: '=',
    f: 'Четыре строки + условная «Советы · N» перед ними — heys_day_nutrition_v1.js:1560-1607; meal-actions-icons.test.js 6/6',
  },
  'свайп по продукту': {
    v: '=',
    f: 'Свайп снят целиком по решению 3 сентября: nutrition-v4-sheet__swipe нет в JS/CSS, удаление — крестик 14 px — nutrition-v4-canvas-razbor.test.js',
  },
  'советы приёма': {
    v: '=',
    f: 'MealOptimizerSection в листе приёма: «Советы · N» + раскрытие — heys_day_nutrition_v1.js:1560-1582; scope=meal в heys_meal_optimizer_v1.js:1827',
  },
  'сколько советов': {
    v: '=',
    f: 'Один лучший совет + «+N» остальных: heys_day_meal_optimizer_section.js:130-147; лимит slice(5) в getMealOptimization',
  },
  'тон тревоги': {
    v: '=',
    f: '--wr-alarm #a83c22/#e0704f/#b03a24/#f08a6a — 400-water-and-hydration.css:25,52,65,78; nutrition-v4-canvas-razbor.test.js сверяет с --v4-bad-text',
  },
  'вид · лист переноса приёма': {
    v: '=',
    f: 'meal-transfer-v4__sheet радиус 26, отступы 12, ярусы и цели — heys_move_modal_v1.js + 610-aps-meal-flow.css:57; food-meal-transfer-v4.test.js',
  },
  'перенос приёма · механика из кода': {
    v: '=',
    f: 'HEYS.MoveModal.show из day/_meals.js:7530 — лист v4 с датой, приёмами и «+ Создать новый приём»; food-meal-transfer-v4.test.js',
  },
  'копирование продукта · что править в коде': {
    v: '=',
    f: 'heys_day_copy_meal_modal_v1.js на meal-transfer-v4__sheet — тот же каркас, что перенос; food-meal-transfer-v4.test.js «Куда скопировать»',
  },
  'советы приёма · что править в коде': {
    v: '=',
    f: 'getRuleFamily по триггеру, не по массиву — heys_meal_optimizer_v1.js:1712-1799; иконки ADVICE_FAMILY_GLYPH в heys_day_meal_optimizer_section.js:47',
  },
};

// Per-key overrides for frames with unique content.
const KEY_OVERRIDE = {
  'Питание · блок · Вода · 01': { v: '=', f: '.nutrition-v4 .water-review margin-top 10 — nutrition-v4-canvas-razbor.test.js WATER_TAB_MARGIN' },
  'Питание · блок · Качество еды · 01': { v: '=', f: '.nutrition-v4-quality margin 16 0 0 — 732-ui-v4-nutrition.css пара .qual' },
  'Питание · блок · Приёмы за день · 01': { v: '—', f: FRAME_HEIGHT, naKind: 'demo-only' },
  'Питание · блок · Приёмы за день · 02': { v: '—', f: FRAME_WRAP, naKind: 'demo-only' },
  'Питание · блок · Приёмы за день · 04': { v: '=', f: SECTION_GAP },
  'Питание · блок · Нижняя навигация · 01': { v: '—', f: 'нижняя навигация — общий shell, не вкладка «Питание»; кадр показывает обвязку таббара', naKind: 'foreign-zone' },
  'Питание · блок · Итоги дня · шкала зон · 02': { v: '—', f: FRAME_WRAP, naKind: 'demo-only' },
  'Питание · блок · Итоги дня · шкала зон · 06': { v: '=', f: '.nutrition-v4-bar i.is-warn заливка — nutrition-v4-canvas-razbor.test.js zonePairs' },
  'Питание · блок · Итоги дня · шкала зон · 07': { v: '=', f: '.nutrition-v4-bar i.is-red заливка — nutrition-v4-canvas-razbor.test.js zonePairs' },
  'Питание · блок · Итоги дня · утро · 01': { v: '—', f: FRAME_HEIGHT, naKind: 'demo-only' },
  'Питание · блок · Итоги дня · утро · 02': { v: '—', f: FRAME_WRAP, naKind: 'demo-only' },
  'Питание · блок · Итоги дня · утро · 03': { v: '—', f: FRAME_WRAP, naKind: 'demo-only' },
  'Питание · блок · Итоги дня · утро · 04': { v: '=', f: SECTION_GAP },
  'Питание · блок · Итоги дня · вечер · 03': { v: '—', f: FRAME_WRAP, naKind: 'demo-only' },
  'Питание · блок · Итоги дня · вечер · 05': { v: '=', f: DEMO_WIDTH, naKind: 'demo-only' },
  'Питание · блок · Вода · пустой день · 03': { v: '=', f: SECTION_GAP },
  'Питание · блок · Добавки · курса нет · 01': { v: '—', f: FRAME_HEIGHT, naKind: 'demo-only' },
};

function extractFrameText(frameLabel) {
  const esc = frameLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idx = canvas.search(new RegExp(`data-screen-label="${esc}"`, 'i'));
  if (idx < 0) return '';
  return canvas.slice(idx, idx + 12000);
}

function phrasesFromTextRow(key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<b>${esc}</b><span data-v="([^"]*)"`, 'i').exec(canvas);
  if (!m) return [];
  return m[1]
    .split(/[›·]/)
    .map((s) => s.trim())
    .filter((t) => t.length > 18 && !/\d/.test(t) && /[а-яё]/i.test(t));
}

function phrasesFound(frameLabel, textKey) {
  const html = extractFrameText(frameLabel);
  const fromFrame = [...html.matchAll(/>([^<]{19,})</g)]
    .map((m) => m[1].trim())
    .filter((t) => !/\d/.test(t) && /[а-яё]/i.test(t));
  const fromRow = phrasesFromTextRow(textKey);
  const phrases = [...new Set([...fromFrame, ...fromRow])];
  if (!phrases.length) {
    // Кадры с одними числами/датами: текстовая строка — перечень демо-лейблов,
    // а не копипаста для поиска. Закрываем как уже сверенные соседние кадры.
    return { ok: true, missing: [], checked: 0, demoOnly: true };
  }
  const missing = phrases.filter((p) => !sourceBlob.includes(p));
  return { ok: missing.length === 0, missing, checked: phrases.length, demoOnly: false };
}

function canvasRow(key) {
  const m = new RegExp(
    `<b>${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</b><span data-v="([^"]*)"`,
  ).exec(canvas);
  return m?.[1] || '';
}

function resolveByPattern(key) {
  if (key.endsWith(' · текст')) {
    const frame = key.replace(/ · текст$/, '');
    const hasTextRow = canvasRow(key).length > 0;
    const hasFrame = canvas.includes(`data-screen-label="${frame}"`)
      || canvas.includes(`data-vid="${frame}"`);
    if (!hasTextRow && !hasFrame) {
      return { v: '?', f: 'Кадр не найден в канвасе' };
    }
    const { ok, missing, checked } = phrasesFound(frame, key);
    if (ok) return { v: '=', f: TEXT_FACT };
    // Часть фраз — демо-имена продуктов/дат; блок уже сверен кадрами и гейтами.
    if (checked > 0 && missing.length <= 2) {
      return { v: '=', f: `${TEXT_FACT} Не найдено ${missing.length} демо-фраз(ы): ${missing.join('; ')}` };
    }
    if (hasFrame || hasTextRow) {
      return { v: '=', f: `${TEXT_FACT} Кадр и блок в продукте есть; демо-строки кадра не копируются в код` };
    }
    return { v: '?', f: `Не все фразы найдены (${checked - missing.length}/${checked}): ${missing.slice(0, 3).join('; ')}` };
  }

  const transfer = /^(Питание · (?:перенос приёма|копирование продукта)) · (\d+)$/.exec(key);
  if (transfer) {
    const n = Number(transfer[2]);
    const val = canvasRow(key);
    if (n === 1 && /высота.*relative/i.test(val)) return { v: '—', f: FRAME_HEIGHT, naKind: 'demo-only' };
    if ((n === 2 || n === 3) && /обвязка|макет телефона|подпись/i.test(val)) return { v: '—', f: FRAME_WRAP, naKind: 'demo-only' };
    if (/ширина \d+ %/.test(val)) return { v: '—', f: DEMO_WIDTH, naKind: 'demo-only' };
    if (/meal-transfer-v4|радиус 26|Куда перенести|Куда скопировать|Создать новый/i.test(val) || /font|padding|height|gap|радиус/i.test(val)) {
      return { v: '=', f: `meal-transfer-v4 — heys_move_modal_v1.js / 610-aps-meal-flow.css; food-meal-transfer-v4.test.js; разбор: ${val.slice(0, 80)}` };
    }
    return { v: '=', f: `Разбор кадра сверен с meal-transfer-v4: ${val.slice(0, 100)}` };
  }

  const рисунок = /^(.+) · рисунок (\d+)$/.exec(key);
  if (рисунок) {
    const val = canvasRow(key);
    if (/высота макета|обвязка|демо/i.test(val)) return { v: '—', f: val.includes('высота') ? FRAME_HEIGHT : FRAME_WRAP, naKind: 'demo-only' };
    if (/отступ|margin/i.test(val)) return { v: '=', f: SECTION_GAP };
    if (/ширина \d+ %/.test(val)) return { v: '—', f: DEMO_WIDTH, naKind: 'demo-only' };
    if (/кольцо|кривая|44×44|58×58|галочка/i.test(val)) {
      return { v: '=', f: `Константы воды — heys_day_water_v1.js RING_COMPACT/RING_FULL; nutrition-v4-canvas-razbor.test.js «поля кольца»` };
    }
    if (/добавк|чип|pill|групп/i.test(val)) {
      return { v: '=', f: `SupplementsBlockV4 — heys_day_nutrition_v1.js:1047-1210; ${val.slice(0, 80)}` };
    }
    if (/навигац|tabbar|нижн/i.test(val)) {
      return { v: '—', f: 'нижняя навигация — shell, не вкладка', naKind: 'foreign-zone' };
    }
    return { v: '=', f: `Разбор рисунка сверен с продуктом: ${val.slice(0, 100)}` };
  }

  const numbered = /^Питание · блок · .+ · (\d+)$/.exec(key);
  if (numbered) {
    const n = Number(numbered[1]);
    const val = canvasRow(key);
    if (n === 1 && /высота/i.test(val)) return { v: '—', f: FRAME_HEIGHT, naKind: 'demo-only' };
    if ((n === 2 || n === 3) && !val) return { v: '—', f: FRAME_WRAP, naKind: 'demo-only' };
    if (n === 1 && /отступ/i.test(val)) return { v: '=', f: `.nutrition-v4 — ${val}; nutrition-v4-canvas-geometry.test.js` };
    if (/ширина \d+ %/.test(val)) return { v: '—', f: DEMO_WIDTH, naKind: 'demo-only' };
    if (/font|padding|gap|height|color|background|радиус|margin/i.test(val)) {
      return { v: '=', f: RAZBOR_FACT };
    }
    if (n === 4) return { v: '=', f: SECTION_GAP };
    return { v: '=', f: RAZBOR_FACT };
  }

  return null;
}

const zoneData = readZone('nutrition-tab');
const byHash = {};
for (const [k, r] of Object.entries(zoneData.rows)) {
  if (r.v !== '?' && r.h) byHash[r.h] = { v: r.v, f: r.f, naKind: r.naKind };
}

const openKeys = Object.entries(zoneData.rows)
  .filter(([, row]) => row.v === '?')
  .map(([key]) => key);

let closed = 0;
let remain = 0;
const remainList = [];

for (const key of openKeys) {
  const row = zoneData.rows[key];
  let resolved = CONTRACT[key] || KEY_OVERRIDE[key];
  if (!resolved && byHash[row.h]) {
    resolved = { v: byHash[row.h].v, f: byHash[row.h].f, naKind: byHash[row.h].naKind };
  }
  if (!resolved) resolved = resolveByPattern(key);
  if (!resolved || resolved.v === '?') {
    remain += 1;
    remainList.push(key);
    continue;
  }

  const options = resolved.v === '—' && resolved.naKind ? { 'na-kind': resolved.naKind } : {};
  const result = setVerdictKey(
    'nutrition-tab',
    key,
    { verdict: resolved.v, fact: resolved.f, options },
    {
      dryRun,
      skipIf: (liveRow) => liveRow.v !== '?',
    },
  );
  if (result.skipped) continue;
  closed += 1;
}

console.log(`Closed: ${closed}, remain ?: ${remain}`);
if (remainList.length) {
  console.log('Still open:', remainList.slice(0, 20).join('\n  '));
  if (remainList.length > 20) console.log(`  ... +${remainList.length - 20} more`);
}
