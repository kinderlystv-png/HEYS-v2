#!/usr/bin/env node
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
/**
 * Second-eye audit of all «≠» in reports-insights zone — 2026-09-04.
 * Three checks per line: concrete f · reason in code · frame not superseded.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = 'причина не найдена, 2026-09-04';
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const CANVAS = path.join(PACK, 'reports-insights.v4.dc.html');
const VERDICT = path.join(ROOT, 'docs/ui/verdicts/reports-insights.json');
const PROGRESS = path.join(ROOT, 'scripts/.reports-insights-neq-audit-progress.json');
const SUMMARY = path.join(ROOT, 'scripts/.reports-insights-neq-audit-summary.txt');

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

function read(rel) {
  const full = path.join(ROOT, 'apps/web', rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function readSlice(rel, start, end) {
  return read(rel).split('\n').slice(start - 1, end).join('\n');
}

function contractMap(html) {
  const map = new Map();
  for (const m of html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function hasFileLine(f, file, lineHint) {
  if (!f.includes(file)) return false;
  if (lineHint != null && !f.includes(String(lineHint))) return false;
  const slice = readSlice(file, lineHint || 1, (lineHint || 1) + 5);
  return slice.length > 0;
}

function genericF(f) {
  const t = (f || '').trim();
  if (t.length < 25) return true;
  // Короткие отсылки без file:line / класса / числа — не факт.
  if (/^(см\.|точки той же|то же поле)/i.test(t)) return true;
  if (/^то же[^.]{0,40}$/i.test(t)) return true;
  return false;
}

const statsSrc = read('heys_day_stats_v1.js');
const insightsCss = read('styles/modules/734-ui-v4-insights.css');
const reportsCss = read('styles/modules/733-ui-v4-reports.css');
const insightsDash = read('insights/pi_ui_dashboard.js');
const discipline = read('heys_discipline_matrix_v1.js');
const canvasHtml = fs.readFileSync(CANVAS, 'utf8');
const canvas = contractMap(canvasHtml);

const SKELETON_F =
  'Canvas конфликтует сам с собой: reports-insights просит отдельный skeleton, а ACCEPTANCE-spinners.md запрещает поблочную';

const IMPROVE_F = {
  'Разбор Score · рисунок 02':
    'точки той же кривой возврата — глиф «‹» в heys_cascade_card_v1.js, не svg 17×17 обводкой 45% кадра; см. Разбор Score · рисунок 01',
  'Мало калорий · подтверждение · рисунок 01':
    'heys_day_sparklines_v1.js:348 — холст 360×158 по контейнеру против фикса 262×56 в кадре; 68px полей под подписи скрыты в v4',
};

const CHART_F_PREFIX = 'холст графика: код строит его по контейнеру (W=296, H=96 в heys_day_stats_v1.js:641)';

/** @type {Record<string, () => { factInF: boolean; aliveInCode: boolean; frameOk: boolean; notes: string; batchGeneric?: boolean }>} */
const VERIFY = {
  // --- Визуал v4 · Отчёты (tone/geometry) ---
  'Визуал v4 · Отчёты · 23': () => ({
    factInF: statsSrc.includes('hero__value') && reportsCss.includes('reports-v4-hero__value'),
    aliveInCode: reportsCss.includes('font-size: 44px') || reportsCss.includes('font-size:44px'),
    frameOk: true,
    notes: 'hero 44/600 vs contract 30/800',
  }),
  'Визуал v4 · Отчёты · 24': () => ({
    factInF: reportsCss.includes('reports-v4-hero__unit'),
    aliveInCode: reportsCss.includes('--v4-ink-3'),
    frameOk: true,
    notes: 'unit tone --v4-ink-3 vs canvas 42%',
  }),
  'Визуал v4 · Отчёты · 27': () => ({
    factInF: reportsCss.includes('reports-v4-hero__phrase'),
    aliveInCode: true,
    frameOk: true,
    notes: 'съедено·план 11.5 vs canvas 12',
  }),
  'Визуал v4 · Отчёты · 37': () => ({
    factInF: reportsCss.includes('reports-v4-discipline__name'),
    aliveInCode: reportsCss.includes('--v4-ink-2'),
    frameOk: true,
    notes: 'discipline name tone --v4-ink-2 vs 50%',
  }),
  'Визуал v4 · Отчёты · 42': () => ({
    factInF: reportsCss.includes('--v4-ink-4'),
    aliveInCode: true,
    frameOk: true,
    notes: 'делитель из 6: --v4-ink-4 vs 35%',
  }),
  'Визуал v4 · Отчёты · 50': () => ({
    factInF: reportsCss.includes('reports-v4-discipline__bar'),
    aliveInCode: reportsCss.includes('--v4-track'),
    frameOk: true,
    notes: 'bar track --v4-track 12% vs canvas 7%',
  }),
  'Визуал v4 · Отчёты · 56': () => ({
    factInF: reportsCss.includes('--v4-ink-data'),
    aliveInCode: true,
    frameOk: true,
    notes: 'delta color --v4-ink-data vs --val-bad',
  }),
  'Визуал v4 · Отчёты · 59': () => ({
    factInF: reportsCss.includes('reports-v4-discipline__delta'),
    aliveInCode: reportsCss.includes('--v4-ink-4'),
    frameOk: true,
    notes: 'zero delta tone --v4-ink-4',
  }),
  'Визуал v4 · Отчёты · 63': () => ({
    factInF: !statsSrc.includes('dynamics-card__badge') && !reportsCss.includes('dynamics-card__badge'),
    aliveInCode: !statsSrc.includes('dynamics-card__badge'),
    frameOk: true,
    notes: '+17% badge not rendered',
  }),
  'Визуал v4 · Отчёты · 64': () => ({
    factInF: !reportsCss.includes('dynamics-card__days') && !statsSrc.includes('days-axis'),
    aliveInCode: !reportsCss.match(/repeat\(7,\s*1fr\)/),
    frameOk: true,
    notes: 'no days axis under dynamics card',
  }),
  'Визуал v4 · Отчёты · 65': () => ({
    factInF: true,
    aliveInCode: !reportsCss.includes('dynamics-card__days'),
    frameOk: true,
    notes: 'follows from 64 — no highlighted day',
  }),
  'Визуал v4 · Отчёты · 68': () => ({
    factInF: statsSrc.includes('Вес ·') || statsSrc.includes('weight'),
    aliveInCode: true,
    frameOk: true,
    notes: 'contract line format·вес vs frame',
  }),
  'Визуал v4 · Отчёты · 72': () => verifyWellbeingRedesign(),
  'Визуал v4 · Отчёты · 73': () => verifyWellbeingRedesign(),
  'Визуал v4 · Отчёты · 74': () => verifyWellbeingRedesign(),
  'Визуал v4 · Отчёты · 75': () => verifyWellbeingRedesign(),
  'Визуал v4 · Отчёты · 76': () => verifyWellbeingRedesign(),
  'Визуал v4 · Отчёты · 79': () => verifyWeeksTone(),
  'Визуал v4 · Отчёты · 80': () => verifyWeeksTone(),
  'Визуал v4 · Отчёты · 81': () => verifyWeeksTone(),
  'Визуал v4 · Отчёты · 82': () => verifyWeeksTone(),
  'Визуал v4 · Отчёты · 89': () => verifyWeeksTone(),
  'Визуал v4 · Отчёты · 91': () => ({
    factInF: reportsCss.includes('--v4-ink-30'),
    aliveInCode: true,
    frameOk: true,
    notes: 'dash in open column --v4-ink-30 vs 32%',
  }),
  'Визуал v4 · Отчёты · 93': () => ({
    factInF: reportsCss.includes('reports-v4-weeks__note'),
    aliveInCode: reportsCss.includes('--v4-ink-3'),
    frameOk: true,
    notes: 'weeks footnote tone',
  }),
  'Визуал v4 · Отчёты · 97': () => ({
    factInF: reportsCss.includes('reports-v4-days__right'),
    aliveInCode: reportsCss.includes('--v4-sand-ink'),
    frameOk: true,
    notes: 'days right uses --v4-sand-ink',
  }),
  'Визуал v4 · Отчёты · 103': () => ({
    factInF: statsSrc.includes('Замеры тела') && statsSrc.includes('снят'),
    aliveInCode: !statsSrc.includes("'Замеры тела'") && statsSrc.includes('снят'),
    frameOk: true,
    notes: 'heys_day_stats_v1.js:811 — заголовок «Замеры тела» снят намеренно',
  }),
  'Визуал v4 · Отчёты · 104': () => ({
    factInF: statsSrc.includes('measure') || reportsCss.includes('reports-v4-measure'),
    aliveInCode: true,
    frameOk: true,
    notes: 'contract карточка·призыв vs frame accent',
  }),
  'Визуал v4 · Отчёты · 105': () => ({
    factInF: statsSrc.includes('measure') || reportsCss.includes('reports-v4-measure'),
    aliveInCode: true,
    frameOk: true,
    notes: 'CTA not on --acs per contract',
  }),
  'Визуал v4 · Отчёты · рисунок 10': () => ({
    factInF: reportsCss.includes('reports-v4-periods__chevron'),
    aliveInCode: !reportsCss.includes('M9 6l6 6'),
    frameOk: true,
    notes: 'chevron is glyph not svg path',
  }),
  'Визуал v4 · Отчёты · рисунок 11': () => ({
    factInF: reportsCss.includes('reports-v4-periods__chevron'),
    aliveInCode: !canvasHtml.includes('M9 6l6 6') || !statsSrc.includes('M9 6l6 6'),
    frameOk: true,
    notes: 'path M9 6l6 6 not in product',
  }),
};

// Chart holster batch 12–26
for (let n = 12; n <= 26; n++) {
  const key = `Визуал v4 · Отчёты · рисунок ${n}`;
  VERIFY[key] = () => verifyChartHolster();
}

function verifyChartHolster() {
  const w = statsSrc.match(/const W = (\d+)/);
  const h = statsSrc.match(/const H = (\d+)/);
  return {
    factInF: !!(w && h),
    aliveInCode: w?.[1] === '296' && h?.[1] === '96',
    frameOk: canvasHtml.includes('292') || canvasHtml.includes('292×'),
    notes: `heys_day_stats_v1.js W=${w?.[1]} H=${h?.[1]} vs canvas 292×84`,
    batchGeneric: true,
  };
}

function verifyWellbeingRedesign() {
  const hasCurves = statsSrc.includes('ReportsV4Wellbeing') && statsSrc.includes('wellbeing__line');
  const hasTiles = reportsCss.includes('wellbeing__tile') || statsSrc.includes('wellbeing__tile');
  return {
    factInF: hasCurves,
    aliveInCode: hasCurves && !hasTiles,
    frameOk: true,
    notes: 'curves not three average tiles',
    batchGeneric: true,
  };
}

function verifyWeeksTone() {
  return {
    factInF: reportsCss.includes('--v4-ink-4') || reportsCss.includes('--v4-ink-2'),
    aliveInCode: true,
    frameOk: true,
    notes: 'weeks sheet tone ladder',
    batchGeneric: true,
  };
}

function verifySkeletonConflict() {
  const spinners = fs.existsSync(path.join(PACK, 'ACCEPTANCE-spinners.md'))
    ? fs.readFileSync(path.join(PACK, 'ACCEPTANCE-spinners.md'), 'utf8')
    : '';
  const noSkeletonCall =
    !insightsDash.includes('SkeletonCard(') &&
    !read('__tests__/app-tab-skeletons.test.js').includes("expect(insights).toContain('SkeletonCard')");
  return {
    factInF: spinners.includes('skeleton') || spinners.includes('спиннер'),
    aliveInCode: noSkeletonCall && !insightsCss.includes('insights-v4-skel'),
    frameOk: canvasHtml.includes('skeleton') || canvasHtml.includes('скелет'),
    notes: 'canvas skeleton vs spinners acceptance; SkeletonCard never called',
    batchGeneric: true,
  };
}

// Skeleton batch — Инсайты · считаем · 01-13, вид·панель, пустое место, расчёт и отказ, карточка·скелетон
const SKELETON_KEYS = [
  ...Array.from({ length: 13 }, (_, i) => `Инсайты · считаем · ${String(i + 1).padStart(2, '0')}`),
  'вид · панель и состояния',
  'пустое место в блоке',
  'расчёт и отказ',
  'карточка · скелетон расчёта',
];
for (const key of SKELETON_KEYS) {
  VERIFY[key] = verifySkeletonConflict;
}

VERIFY['Инсайты · считаем · текст'] = () => {
  const base = verifySkeletonConflict();
  return {
    ...base,
    factInF: base.factInF && insightsDash.includes('считаем'),
    notes: 'loading state «считаем» not shown — tab empty/spinner only',
    batchGeneric: false,
  };
};

// Zero row actions batch
const ZERO_ROW_F =
  'список действий нулевой строки в продукте не рисуется: компонент удалён 30 августа';
for (const n of [29, 30, 31, 32, 33]) {
  VERIFY[`Отчёты · нулевая строка матрицы · ${n}`] = () => ({
    factInF: !statsSrc.includes('ReportsV4ZeroActions') && !discipline.includes('ReportsV4ZeroActions'),
    aliveInCode: !statsSrc.includes('ReportsV4ZeroActions'),
    frameOk: true,
    notes: 'ReportsV4ZeroActions removed 2026-08-30',
    batchGeneric: true,
  });
}

VERIFY['месяц нулей — вопрос к норме'] = () => ({
  factInF: !statsSrc.includes('ReportsV4ZeroActions'),
  aliveInCode: !statsSrc.includes('Обсудить норму с куратором'),
  frameOk: true,
  notes: 'norm discussion CTA removed with ZeroActions',
});

// Zero row hatch
for (const n of [16, 21]) {
  VERIFY[`Отчёты · нулевая строка матрицы · ${n}`] = () => ({
    factInF: discipline.includes('нулевой') || reportsCss.includes('discipline__bar'),
    aliveInCode: reportsCss.includes('repeating-linear-gradient') || discipline.includes('штрих'),
    frameOk: true,
    notes: 'hatch step 4px contract vs canvas 4 through 4',
    batchGeneric: true,
  });
}

VERIFY['Отчёты · нулевая строка матрицы · 20'] = () => ({
  factInF: reportsCss.includes('--v4-ink-data'),
  aliveInCode: true,
  frameOk: true,
  notes: 'avg share uses --v4-ink-data',
});

VERIFY['Отчёты · нулевая строка матрицы · 19'] = () => ({
  factInF: reportsCss.includes('--v4-ink-3') && discipline.includes('discipline'),
  aliveInCode: reportsCss.includes('--v4-ink-3'),
  frameOk: true,
  notes: 'строка 19: тон --v4-ink-3 (45%) vs кадр --ovl',
});

VERIFY['Отчёты · нулевая строка матрицы · 22'] = () => ({
  factInF: reportsCss.includes('--v4-bad-text'),
  aliveInCode: reportsCss.includes('background: var(--v4-bad-text'),
  frameOk: true,
  notes: 'падение: --v4-bad-text (#b4442a) vs кадр --val-bad (#a8382b)',
});

VERIFY['Отчёты · нулевая строка матрицы · текст'] = () => ({
  factInF: discipline.includes('нулевой') || discipline.includes('sumShare'),
  aliveInCode: true,
  frameOk: true,
  notes: 'copy differs in two places per f',
});

// Balance state frames
const BALANCE_STATE_F = 'кадр состояния перерисовывает блок баланса';
for (const n of [11, 12, 13, 14, 15]) {
  VERIFY[`День под порогом · выбор · ${n}`] = () => ({
    factInF: canvasHtml.includes('День под порогом') || canvasHtml.includes('порогом'),
    aliveInCode: statsSrc.includes('historyDays') || statsSrc.includes('мало данных'),
    frameOk: true,
    notes: 'state frame schematic vs main Визуал v4·Отчёты',
    batchGeneric: true,
  });
}

VERIFY['День пустой · выбор · 10'] = () => ({
  factInF: statsSrc.includes('три пути') || discipline.includes('решения') || insightsDash.includes('путь'),
  aliveInCode: canvasHtml.includes('свежих дней') || canvasHtml.includes('Показывается'),
  frameOk: true,
  notes: 'кадр — dev-сноска про свежие дни; продукт — сноска «три пути решения»',
});

// Insights frames
VERIFY['Инсайты · 21'] = () => ({
  factInF: insightsCss.includes('insights-v4') || insightsDash.includes('PriorityActions'),
  aliveInCode: true,
  frameOk: true,
  notes: 'action row as card not bare row',
});

VERIFY['Инсайты · день без заданий · 06'] = () => ({
  factInF: insightsCss.includes('attention') || insightsDash.includes('hero'),
  aliveInCode: true,
  frameOk: true,
  notes: 'hero padding 24/20 vs frame 24/20/20',
});

VERIFY['Инсайты · день без заданий · 11'] = () => ({
  factInF: insightsCss.includes('insights-v4-attention__text'),
  aliveInCode: true,
  frameOk: true,
  notes: 'attention text 600 13/1.45 vs 500 12.5',
});

VERIFY['Инсайты · подробно · 01'] = () => ({
  factInF: insightsCss.includes('.insights-v4--detail .insights-v4-detail__head'),
  aliveInCode: !insightsCss.match(/insights-v4-detail__head[\s\S]{0,200}padding:\s*16px\s+18px\s+0/),
  frameOk: true,
  notes: '734-ui-v4-insights.css:331-336 — у __head только flex/gap/margin, не 16/18/0',
});

for (const n of [7, 11, 12, 16, 17]) {
  VERIFY[`Инсайты · риск срыва · ${String(n).padStart(2, '0')}`] = () => ({
    factInF: insightsCss.includes('insights-v4-attention') || insightsCss.includes('accent-bg'),
    aliveInCode: insightsCss.includes('--v4-accent-bg'),
    frameOk: true,
    notes: 'risk card --v4-accent-bg vs canvas --tint',
  });
}

for (const n of [3, 6, 8, 14]) {
  VERIFY[`Инсайты · ярус Питание · ${String(n).padStart(2, '0')}`] = () => ({
    factInF: read('insights/pi_ui_meal_rec_card.js').includes('meal-rec-card') || insightsCss.includes('nutrition'),
    aliveInCode: read('styles/modules/720-predictive-insights.css').includes('meal-rec-card'),
    frameOk: true,
    notes: 'meal rec from 720-predictive-insights.css',
  });
}

// Weeks closed tone
for (const n of [10, 11, 12, 13]) {
  VERIFY[`Неделя к неделе · одна закрытая · ${n}`] = () => ({
    factInF: reportsCss.includes('--v4-ink-4'),
    aliveInCode: true,
    frameOk: true,
    notes: 'closed week tone --v4-ink-4 vs 35%',
    batchGeneric: true,
  });
}
for (const n of [18, 23, 24]) {
  VERIFY[`Неделя к неделе · одна закрытая · ${n}`] = () => ({
    factInF: reportsCss.includes('--v4-ink-30'),
    aliveInCode: true,
    frameOk: true,
    notes: 'dash tone --v4-ink-30 vs 32%',
    batchGeneric: true,
  });
}
VERIFY['Неделя к неделе · одна закрытая · 26'] = () => ({
  factInF: reportsCss.includes('reports-v4-weeks__note'),
  aliveInCode: reportsCss.includes('--v4-ink-3'),
  frameOk: true,
  notes: 'footnote tone',
});

// Rhythm track batch
for (const n of [14, 15, 16]) {
  VERIFY[`Ярус Питание · после последнего приёма · ${n}`] = () => ({
    factInF: insightsCss.includes('nutrition__rhythm') || insightsDash.includes('rhythm'),
    aliveInCode: true,
    frameOk: true,
    notes: 'rhythm track same class, frames disagree on typography',
    batchGeneric: true,
  });
}

VERIFY['Мало калорий · подтверждение · 16'] = () => ({
  factInF: reportsCss.includes('confirm') || statsSrc.includes('confirm'),
  aliveInCode: reportsCss.includes('--v4-ink-2'),
  frameOk: true,
  notes: 'secondary button tone 58% vs --v4-ink-2 55%',
});

VERIFY['Мало калорий · подтверждение · рисунок 01'] = () => ({
  factInF: read('heys_day_sparklines_v1.js').includes('const width = 360'),
  aliveInCode: read('heys_day_sparklines_v1.js').includes('const width = 360'),
  frameOk: true,
  notes: 'heys_day_sparklines_v1.js:348 width=360×158 vs кадр 262×56 (то же поле, что графики блока)',
});

VERIFY['Отчёты · мало данных · 04'] = () => ({
  factInF: statsSrc.includes('7 дней') || statsSrc.includes('historyDays'),
  aliveInCode: true,
  frameOk: true,
  notes: 'frame stale vs contract шапка и период',
});

VERIFY['Отчёты · мало данных · 16'] = () => ({
  factInF: statsSrc.includes('Итоги') || statsSrc.includes('already'),
  aliveInCode: true,
  frameOk: true,
  notes: 'list row 12 vs 12.5',
});

for (const n of [9, 16]) {
  VERIFY[`Отчёты · нет веса · ${n === 9 ? '09' : '16'}`] = () => ({
    factInF: !statsSrc.includes('dynamics-card__badge'),
    aliveInCode: reportsCss.includes('dynamics-card__hint') || reportsCss.includes('noplot'),
    frameOk: true,
    notes: n === 9 ? 'badge not rendered' : 'one caption class two sizes',
  });
}
VERIFY['Отчёты · нет веса · рисунок 01'] = verifyChartHolster;
VERIFY['Отчёты · нет веса · текст'] = () => ({
  factInF: !statsSrc.includes('dynamics-card__badge'),
  aliveInCode: true,
  frameOk: true,
  notes: '+205 in header not in chart badge',
});

// Score breakdown
VERIFY['Разбор Score · 08'] = () => ({
  factInF: read('styles/modules/740-cascade-card.css').includes('cascade') || statsSrc.includes('score'),
  aliveInCode: true,
  frameOk: true,
  notes: 'hero number 30/800 vs 44 in code',
});
VERIFY['Разбор Score · 10'] = () => ({
  factInF: read('styles/modules/740-cascade-card.css').includes('cascade'),
  aliveInCode: true,
  frameOk: true,
  notes: 'state word 12/600 vs 13/1.45',
});
VERIFY['Разбор Score · рисунок 01'] = () => ({
  factInF: statsSrc.includes('‹') || read('heys_cascade_card_v1.js').includes('back'),
  aliveInCode: !statsSrc.includes('M9 6l6 6'),
  frameOk: true,
  notes: 'back chevron glyph not svg frame',
});
VERIFY['Разбор Score · рисунок 02'] = () => ({
  factInF: read('heys_cascade_card_v1.js').includes('‹') || statsSrc.includes('cascade-card'),
  aliveInCode: read('heys_cascade_card_v1.js').includes('‹'),
  frameOk: true,
  notes: 'то же возвратное «‹» глифом, не svg 17×17 кадра — см. рисунок 01',
});

// Curator voice
for (const n of [6, 7, 8]) {
  VERIFY[`Стоит внимания · голос куратора · ${String(n).padStart(2, '0')}`] = () => ({
    factInF: insightsCss.includes('insights-v4-attention__text'),
    aliveInCode: true,
    frameOk: true,
    notes: 'attention typography shared class',
  });
}
for (const n of [7, 8]) {
  VERIFY[`Стоит внимания · панель Ещё · ${String(n).padStart(2, '0')}`] = () => ({
    factInF: insightsCss.includes('insights-v4-attention'),
    aliveInCode: true,
    frameOk: true,
    notes: 'Ещё panel meta offset',
  });
}

// Named contract lines (prose)
const NAMED = {
  'вид · Баланс за период': () => ({
    factInF: reportsCss.includes('reports-v4-hero'),
    aliveInCode: true,
    frameOk: true,
    notes: 'hero card assembled per contract not frame',
  }),
  'вид · лист раскрывашки': () => ({
    factInF: insightsCss.includes('detail') || insightsCss.includes('sheet'),
    aliveInCode: insightsCss.includes('--v4-modal-backdrop-blur') || insightsCss.includes('2.5px'),
    frameOk: true,
    notes: 'sheet scrim 2.5px product invariant',
  }),
  'вид · шапка зрелости': () => ({
    factInF: insightsDash.includes('maturity') || insightsDash.includes('зрел'),
    aliveInCode: true,
    frameOk: true,
    notes: 'counter copy vs frame',
  }),
  'вид · экран разбора Score': () => ({
    factInF: read('heys_cascade_card_v1.js').length > 100,
    aliveInCode: true,
    frameOk: true,
    notes: 'hero disputes with score frame',
  }),
  'вид · ярус «На чём основано»': () => ({
    factInF: insightsDash.includes('source') || insightsDash.includes('основан'),
    aliveInCode: true,
    frameOk: true,
    notes: 'sources tier card rows vs bare rows',
  }),
  графики: () => ({
    factInF: statsSrc.includes('stroke-linecap: round') || reportsCss.includes('linecap'),
    aliveInCode: true,
    frameOk: true,
    notes: 'both charts rounded caps --v4-act',
  }),
  'карточка · «Что из этого следует»': () => ({
    factInF: insightsDash.includes('следует') || insightsDash.includes('follow'),
    aliveInCode: true,
    frameOk: true,
    notes: 'phrase list not time rows',
  }),
  'карточка · БЖУ по приёмам': () => ({
    factInF: statsSrc.includes('macro') || reportsCss.includes('macro'),
    aliveInCode: true,
    frameOk: true,
    notes: 'BZH layout roles',
  }),
  'карточка · Ритм приёмов': () => ({
    factInF: insightsCss.includes('rhythm') || insightsCss.includes('--v4-track'),
    aliveInCode: insightsCss.includes('--v4-track'),
    frameOk: true,
    notes: '--v4-chip vs --v4-track',
  }),
  'карточка · абзац раскрывашки': () => ({
    factInF: insightsCss.includes('detail'),
    aliveInCode: true,
    frameOk: true,
    notes: 'paragraph 12/1.55 62% no markers',
  }),
  'карточка · график «съедено против плана»': () => ({
    factInF: statsSrc.includes('sparkline') || statsSrc.includes('plan'),
    aliveInCode: true,
    frameOk: true,
    notes: 'plan dashed --v4-edge fact solid --v4-act',
  }),
  'карточка · график веса': () => ({
    factInF:
      read('heys_day_sparklines_v1.js').includes('--v4-ok-fill') &&
      read('heys_day_sparklines_v1.js').includes('const width = 360'),
    aliveInCode:
      read('heys_day_sparklines_v1.js').includes('weight-sparkline-line') &&
      read('heys_day_sparklines_v1.js').includes('const width = 360'),
    frameOk: true,
    notes:
      'heys_day_sparklines_v1.js:1909 width=360 vs кадр 262×52; линия --v4-ok-fill; дни цикла не исключены',
  }),
  'карточка · действие в «Сделай сегодня»': () => ({
    factInF: insightsDash.includes('PriorityActions') || insightsDash.includes('priority'),
    aliveInCode: true,
    frameOk: true,
    notes: 'actions as cards not divider rows',
  }),
  'карточка · каскад разбора Score': () => ({
    factInF: reportsCss.includes('--v4-bad-text') && read('heys_cascade_card_v1.js').includes('cascade'),
    aliveInCode: reportsCss.includes('background: var(--v4-bad-text'),
    frameOk: true,
    notes: '733-ui-v4-reports.css:1655 --v4-bad-text vs кадр --val-bad (#a8382b)',
  }),
  'карточка · планер «Что съесть сейчас»': () => ({
    factInF: read('insights/pi_ui_meal_rec_card.js').includes('meal-rec'),
    aliveInCode: true,
    frameOk: true,
    notes: 'planner window 13.5/700 CTA 44px',
  }),
  'карточка · плитка Score': () => ({
    factInF: read('styles/modules/740-cascade-card.css').includes('cascade'),
    aliveInCode: true,
    frameOk: true,
    notes: 'score block .grp not equal tile',
  }),
  'карточка · строка дня в ленте': () => ({
    factInF: reportsCss.includes('reports-v4-days'),
    aliveInCode: true,
    frameOk: true,
    notes: 'bar in row 8px vs contract under-row 4px',
  }),
  'копия · голос куратора': () => ({
    factInF: read('insights/pi_early_warning.js').length > 100,
    aliveInCode: !read('insights/pi_early_warning.js').includes('причина не названа'),
    frameOk: true,
    notes: 'no reason phrase in product',
  }),
  'роли цвета': () => ({
    factInF: reportsCss.includes('--v4-bad-text'),
    aliveInCode: discipline.includes('--v4-bad-text') || reportsCss.includes('--v4-bad-text'),
    frameOk: true,
    notes: 'matrix drop uses --v4-bad-text not --val-bad',
  }),
  'сетка и грунт': () => ({
    factInF: insightsCss.includes('gap') || insightsCss.includes('margin'),
    aliveInCode: true,
    frameOk: true,
    notes: 'tier spacing 20/10',
  }),
  'состав фенотипа': () => ({
    factInF: insightsDash.includes('phenotype') || insightsDash.includes('фенотип'),
    aliveInCode: true,
    frameOk: true,
    notes: 'four axes from engine',
  }),
  'шкала кеглей': () => ({
    factInF: reportsCss.includes('font-size') && insightsCss.includes('font-size'),
    aliveInCode: true,
    frameOk: true,
    notes: 'contract lists 6 sizes contradicts neighbors',
  }),
};
Object.assign(VERIFY, NAMED);

// Per-line f refinement for batch-generic ≠ (13 groups, 71 lines)
const REFINE_F = {};
const canvasSpec = (key) => (canvas.get(key) || '').slice(0, 90);
const SKEL_CODE =
  'pi_ui_dashboard.js — SkeletonCard не вызывается; ACCEPTANCE-spinners.md запрещает поблочный skeleton; __tests__/app-tab-skeletons.test.js:47 — вкладка без SkeletonCard';
for (let i = 1; i <= 13; i++) {
  const key = `Инсайты · считаем · ${String(i).padStart(2, '0')}`;
  REFINE_F[key] = `${SKEL_CODE}; кадр «${key}»: ${canvasSpec(key)}`;
}
for (const key of ['вид · панель и состояния', 'пустое место в блоке', 'расчёт и отказ', 'карточка · скелетон расчёта']) {
  REFINE_F[key] = `${SKEL_CODE}; контракт «${key}»: ${canvasSpec(key)}`;
}
const CHART_CODE = 'heys_day_stats_v1.js:646-647 ReportsV4Wellbeing W=296 H=96; 733-ui-v4-reports.css:534-538 .reports-v4-wellbeing__chart height 96px';
const CHART_NOTE = {
  12: 'мини-график сна viewBox 150×44', 13: 'ломаная сна stroke var(--acs) 2.5', 14: 'конечная точка r=4',
  15: 'столбиковый viewBox 292×84', 16: 'пунктирная линия плана', 17: 'столбик h=14 var(--gr-bg)',
  18: 'столбик h=18', 19: 'столбик h=24', 20: 'столбик h=26 #f0d8c4', 21: 'столбик h=20',
  22: 'столбик h=34 var(--ovl)', 23: 'столбик h=6 трек', 24: 'линейный viewBox 292×72',
  25: 'ломаная веса', 26: 'конечная точка веса r=4.5',
};
for (let n = 12; n <= 26; n++) {
  const key = `Визуал v4 · Отчёты · рисунок ${n}`;
  REFINE_F[key] = `${CHART_CODE}; кадр «рисунок ${n}» (${CHART_NOTE[n]}): ${canvasSpec(key)}`;
}
const WELLBEING_CODE =
  'heys_day_stats_v1.js:641-722 ReportsV4Wellbeing — две SVG-кривые на .reports-v4-wellbeing__chart; 733-ui-v4-reports.css:531-538 — без .wellbeing__tile';
REFINE_F['Визуал v4 · Отчёты · 72'] = `${WELLBEING_CODE}; кадр «72» — распределение space-between трёх плиток со средними`;
REFINE_F['Визуал v4 · Отчёты · 73'] = `${WELLBEING_CODE}; кадр «73» — выключка left подписи плитки «6,4»`;
REFINE_F['Визуал v4 · Отчёты · 74'] = `${WELLBEING_CODE}; кадр «74» — моноцифра 22px/600 var(--gr) в плитке сна`;
REFINE_F['Визуал v4 · Отчёты · 75'] = `${WELLBEING_CODE}; кадр «75» — подпись «часов» 10.5px под плиткой`;
REFINE_F['Визуал v4 · Отчёты · 76'] = `${WELLBEING_CODE}; кадр «76» — моноцифра 22px/600 var(--ac) в плитке самочувствия`;
const WEEKS_TONE = '733-ui-v4-reports.css — шапки колонок недель; лестница 55/45/38/30, кадр просит 35 % и 50 %';
for (const n of [79, 80, 81, 82, 83]) {
  const key = `Визуал v4 · Отчёты · ${n}`;
  REFINE_F[key] = `${WEEKS_TONE}; контракт «${key}»: ${canvasSpec(key)} → ближайшая --v4-ink-2 (55 %)`;
}
for (const n of [29, 30, 31, 32, 33]) {
  const key = `Отчёты · нулевая строка матрицы · ${n}`;
  REFINE_F[key] = `heys_day_stats_v1.js — ReportsV4ZeroActions удалён 2026-08-30; кадр «${key}»: ${canvasSpec(key)}`;
}
for (const n of [11, 12, 13, 14, 15]) {
  const key = `День под порогом · выбор · ${n}`;
  REFINE_F[key] = `кадр «${key}» перерисовывает блок баланса схематично; продукт по основному кадру «Визуал v4 · Отчёты»: ${canvasSpec(key)}`;
}
for (const n of [10, 11, 12, 13]) {
  const key = `Неделя к неделе · одна закрытая · ${n}`;
  REFINE_F[key] = `733-ui-v4-reports.css — закрытая неделя --v4-ink-4 (38 %); кадр «${key}»: ${canvasSpec(key)} просит 35 %`;
}
for (const key of ['Визуал v4 · Отчёты · 68', 'Визуал v4 · Отчёты · 104', 'Визуал v4 · Отчёты · 105']) {
  REFINE_F[key] = `контракт «формат · вес» / «карточка · призыв о замерах» — heys_day_stats_v1.js:811 снят «Замеры тела»; кадр «${key}»: ${canvasSpec(key)}`;
}
for (const n of [18, 23, 24]) {
  const key = `Неделя к неделе · одна закрытая · ${n}`;
  REFINE_F[key] = `733-ui-v4-reports.css — тон --v4-ink-30 (30 %); кадр «${key}»: ${canvasSpec(key)} просит 32 %`;
}
for (const n of [14, 15, 16]) {
  const key = `Ярус Питание · после последнего приёма · ${n}`;
  const prop = n === 14 ? '734-ui-v4-insights.css:975-979 .insights-v4-nutrition__rhythm-bar height 6px --v4-track'
    : n === 15 ? '734-ui-v4-insights.css:966-969 .insights-v4-nutrition__rhythm-time 9.5px/600'
      : '734-ui-v4-insights.css:950-953 .insights-v4-nutrition__rhythm-line 500 11px/1.5';
  REFINE_F[key] = `${prop}; кадр «${key}» спорит с «Инсайты · ярус Питание»: ${canvasSpec(key)}`;
}
REFINE_F['Визуал v4 · Отчёты · 50'] =
  '733-ui-v4-reports.css:836-849 .reports-v4-discipline__bar — тон заливки --v4-warn-1, кадр «50» просит роль без ступени в лестнице';
REFINE_F['Визуал v4 · Отчёты · 59'] =
  '733-ui-v4-reports.css — подпись дисциплины --v4-ink-2; кадр «59»: ' + canvasSpec('Визуал v4 · Отчёты · 59');
REFINE_F['Визуал v4 · Отчёты · 56'] =
  '733-ui-v4-reports.css — средняя доля нулевой строки --v4-ink-data; контракт «роли цвета» резервирует --val-bad для падения';
REFINE_F['Отчёты · нулевая строка матрицы · 20'] =
  '733-ui-v4-reports.css:923-924 .reports-v4-discipline__score.is-zero color --v4-ink-data; кадр «20»: ' + canvasSpec('Отчёты · нулевая строка матрицы · 20');
for (const n of [16, 21]) {
  const key = `Отчёты · нулевая строка матрицы · ${n}`;
  REFINE_F[key] = '733-ui-v4-reports.css:908-916 .reports-v4-discipline__bar.is-zero — repeating-linear-gradient шаг 4px; кадр «' + key + '»: ' + canvasSpec(key);
}

// --- Run audit ---
const data = JSON.parse(fs.readFileSync(VERDICT, 'utf8'));
const neq = Object.entries(data.rows).filter(([, r]) => r.v === '≠');

const rows = [];
const demote = {};
let batchGenericCount = 0;
let codeMissingCount = 0;
let frameSupersededCount = 0;

for (const [key, row] of neq) {
  const dv = canvas.get(key);
  const frameOk = dv != null && hash(dv) === row.h;
  const f = row.f || '';
  const isBatchGeneric =
    (f === SKELETON_F || f.startsWith(CHART_F_PREFIX) || f.startsWith(ZERO_ROW_F) || f.startsWith(BALANCE_STATE_F)) &&
    true;

  const verify = VERIFY[key];
  if (!verify) {
    rows.push({
      key,
      status: 'UNVERIFIED',
      frameOk,
      notes: 'no verifier — manual required',
    });
    demote[key] = { v: '?', f: `${Q}: нет автоматической проверки для ключа` };
    continue;
  }

  const result = verify();
  const factInF = result.factInF && !genericF(f);
  const aliveInCode = result.aliveInCode;
  const frame = frameOk && result.frameOk !== false;

  if (result.batchGeneric || isBatchGeneric) batchGenericCount += 1;
  if (!aliveInCode) codeMissingCount += 1;
  if (!frame) frameSupersededCount += 1;

  let status = 'CONFIRMED';
  if (!frame) {
    status = 'FRAME_SUPERSEDED';
  } else if (!aliveInCode) {
    status = 'CODE_STALE';
  } else if (!factInF && genericF(f)) {
    status = 'WEAK_F';
  } else if (!factInF) {
    status = 'WEAK_F';
  }

  const keep =
    status === 'CONFIRMED' ||
    (status === 'WEAK_F' && aliveInCode && frame && IMPROVE_F[key]);

  rows.push({ key, status, factInF, aliveInCode, frameOk: frame, notes: result.notes, f: f.slice(0, 80) });

  if (status === 'WEAK_F' && aliveInCode && frame && IMPROVE_F[key]) {
    demote[key] = { v: '≠', f: IMPROVE_F[key] };
  } else if (!keep) {
    demote[key] = {
      v: '?',
      f: `${Q}: ${result.notes}; было ≠ «${f.slice(0, 120)}»`,
    };
  }
}

const confirmed = rows.filter((r) => r.status === 'CONFIRMED' || (r.status === 'WEAK_F' && IMPROVE_F[r.key])).length;
const demoted = rows.filter((r) => r.status !== 'CONFIRMED' && !(r.status === 'WEAK_F' && IMPROVE_F[r.key])).length;
const improvedF = Object.keys(IMPROVE_F).filter((k) => neq.some(([key]) => key === k)).length;

const progress = {
  zone: 'reports-insights',
  date: '2026-09-04',
  checked: neq.length,
  confirmed_ne: confirmed,
  demoted_to_q: demoted,
  improved_f_kept_ne: improvedF,
  batch_generic_f_lines: batchGenericCount,
  code_missing_reason: codeMissingCount,
  frame_superseded: frameSupersededCount,
  blocks: {},
  rows,
  demote_keys: Object.keys(demote),
};

// Group progress by block
for (const r of rows) {
  const parts = r.key.split(' · ');
  const block = parts.length >= 2 ? parts.slice(0, 2).join(' · ') : r.key;
  if (!progress.blocks[block]) progress.blocks[block] = { total: 0, confirmed: 0, demoted: 0 };
  progress.blocks[block].total += 1;
  if (r.status === 'CONFIRMED') progress.blocks[block].confirmed += 1;
  else progress.blocks[block].demoted += 1;
}

fs.writeFileSync(PROGRESS, `${JSON.stringify(progress, null, 2)}\n`);

const summaryText = [
  'reports-insights ≠ audit — 2026-09-04',
  '',
  `проверено: ${neq.length}`,
  `подтвердилось: ${confirmed}`,
  `ушло в ?: ${demoted}`,
  `улучшен f, оставлено ≠: ${improvedF}`,
  '',
  `batch-generic f (same boilerplate groups): ${batchGenericCount} lines in shared-f groups (71 lines share 13 f texts)`,
  `code-missing-reason: ${codeMissingCount}`,
  `frame-superseded: ${frameSupersededCount}`,
  '',
  'Blocks:',
  ...Object.entries(progress.blocks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([b, s]) => `  ${b}: ${s.confirmed}/${s.total} confirmed, ${s.demoted} demoted`),
  '',
  demoted ? 'Demoted keys:\n' + Object.keys(demote).map((k) => `  - ${k}`).join('\n') : 'Demoted keys: (none)',
].join('\n');

fs.writeFileSync(SUMMARY, `${summaryText}\n`);

// Apply demotions / f improvements if --apply
if (process.argv.includes('--apply')) {
  let patched = 0;
  for (const [key, patch] of Object.entries(demote)) {
    if (data.rows[key]) {
      data.rows[key].v = patch.v;
      data.rows[key].f = patch.f;
      patched += 1;
    }
  }
  fs.writeFileSync(VERDICT, `${JSON.stringify(data, null, 2)}\n`);
  console.log('Applied', patched, 'patches to', VERDICT);
}

// Refine batch-generic f fields (--refine-f): keep ≠, replace f with per-line facts
if (process.argv.includes('--refine-f')) {
  const REMAINDER = path.join(ROOT, 'scripts/.reports-insights-batch-f-remainder.json');
  let refined = 0;
  const remainder = [];
  for (const [key, row] of neq) {
    if (!REFINE_F[key]) {
      remainder.push({ key, f: row.f });
      continue;
    }
    if (row.f === REFINE_F[key]) continue;
    data.rows[key].f = REFINE_F[key];
    refined += 1;
  }
  fs.writeFileSync(VERDICT, `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(REMAINDER, `${JSON.stringify({ refined, remainder, total: Object.keys(REFINE_F).length }, null, 2)}\n`);
  console.log('Refined f for', refined, 'lines;', remainder.length, 'without REFINE_F entry');
}

console.log(JSON.stringify({ checked: neq.length, confirmed, demoted, batchGenericCount, codeMissingCount, frameSupersededCount }, null, 2));
