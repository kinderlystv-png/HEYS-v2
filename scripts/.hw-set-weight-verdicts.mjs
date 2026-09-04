import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const SMOKE = 'widgets-weight-v4-contract.test.js';
const UI = 'heys_widgets_ui_v1.js';
const CSS = '730-widgets-dashboard.css';
const PAL = '002-ui-v4-palette-roles.css';

const NOW = {
  '01': `1) Плитка .widget-weight--2x2.widget-v4-stack — ${UI}:4847. 2) Кадр stop «Как сейчас». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) v4Kicker('Вес') — ${UI}:4848. 2) .widget-v4-kicker — ${CSS}:10518-10524. 3) Слово «Вес». 4) Смоук: ${SMOKE}.`,
  '03': `1) Ряд .widget-v4-hero-num — ${UI}:4849. 2) baseline gap 5 margin-top 10 — ${CSS}:11011-11017. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число .widget-v4-hero-num__val — ${UI}:4850-4854. 2) 26px/600/1 (1.625rem) — ${CSS}:11035-11041. 3) Тон v4ValueStateClass(windowState). 4) formatRuDecimal(current,1).`,
  '05': `1) Дельта .widget-v4-delta — ${UI}:4857-4860. 2) margin-top 7, 10px/600 — ${CSS}:13294-13296,10925-10930. 3) --v4-sand-ok-text при good (${PAL}:247). 4) «−0,9 за неделю».`,
};

const DELTA = {
  '01': `1) .widget-weight--1x1.widget-v4-mini — ${UI}:5053. 2) Кадр 1×1. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': NOW['02'],
  '03': `1) .widget-v4-mini__value--pair — ${UI}:5055. 2) flex baseline gap 2 margin-top auto — ${CSS}:11151-11166. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число в pair — ${UI}:5056-5057. 2) 21px/600/-.02em — ${CSS}:11151-11157. 3) --v4-ink (#201e1d) нейтральный. 4) «91,1» + unit «кг».`,
};

const SCATTER = {
  '01': `1) .widget-weight--2x2.widget-v4-stack scatter — ${UI}:5201. 2) Кадр 2×2. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) Шапка .widget-v4-row--tight — ${UI}:5202. 2) space-between baseline — ${CSS}:10802-10806. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '03': `1) v4Kicker('Вес · точки и среднее') — ${UI}:5203. 2) .widget-v4-kicker. 3) Текст ключа. 4) Смоук: ${SMOKE}.`,
  '04': `1) Meta .widget-v4-row__meta — ${UI}:5205-5207. 2) 10px/700 — ${CSS}:14536-14542. 3) widget-v4-val--good. 4) formatRuDecimal(current,1).`,
  '05': `1) Подпись .widget-weight__scatter-foot — ${UI}:5238-5240. 2) 9px/600 margin-top 5 — ${CSS}:14545-14549. 3) --v4-ink-data 56 %. 4) «точки — весы, линия — среднее за 7 дней».`,
};

const SPARK_DRAW = {
  '01': `1) WidgetV4DrawSparkSvg viewBox 0 0 130 38 height 38 — ${UI}:2004-2005,4862-4867. 2) Поле 100%×38. 3) Не цвет набора. 4) Смоук: ${SMOKE}.`,
  '02': `1) path/polyline strokeWidth 2.5 — ${UI}:2035. 2) class widget-v4-spark--act — ${UI}:4863. 3) --v4-act: песок #c67139, синий #2e7cc0 (${PAL}:143/461). 4) Точки из sparklinePoints.`,
  '03': `1) circle dotR 3.5 — ${UI}:2011,2040-2045. 2) fill через dotStyle. 3) --v4-act на точке. 4) Последняя точка окна.`,
};

const SCATTER_DOT = `1) circle r 2.2 fill rgba(0,0,0,.22) — ${UI}:5220-5226. 2) Каждая точка взвешивания. 3) 22 % ink. 4) Демо-координаты — динамика.`;

const SCATTER_DRAW = {
  '01': `1) svg.widget-weight__scatter viewBox 0 0 130 56 height 56 — ${UI}:5210-5215. 2) Поле 100%×56. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': SCATTER_DOT,
  '03': SCATTER_DOT,
  '04': SCATTER_DOT,
  '05': SCATTER_DOT,
  '06': SCATTER_DOT,
  '07': SCATTER_DOT,
  '08': SCATTER_DOT,
  '09': SCATTER_DOT,
  '10': SCATTER_DOT,
  '11': SCATTER_DOT,
  '12': SCATTER_DOT,
  '13': SCATTER_DOT,
  '14': `1) polyline maPath strokeWidth 2.5 — ${UI}:5229-5235. 2) 7-дневное среднее. 3) --v4-ok-fill: песок #7a8a5e, синий #4f9a78 (${PAL}:167/477). 4) var(--gr2) в кадре.`,
};

function rowsFromMap(prefix, map, verdict = '=') {
  return Object.entries(map).map(([n, fact]) => [`${prefix} · ${n}`, verdict, fact]);
}

const ROWS = [
  ...rowsFromMap('Вес · Как сейчас', NOW),
  ...rowsFromMap('Вес · Только число', DELTA),
  ...rowsFromMap('Вес · Точки и среднее', SCATTER),
  ...Object.entries(SPARK_DRAW).map(([n, fact]) => [`Вес · Как сейчас · рисунок ${n}`, '=', fact]),
  ...Object.entries(SCATTER_DRAW).map(([n, fact]) => [`Вес · Точки и среднее · рисунок ${n}`, '=', fact]),
  [
    'Вес · Как сейчас · текст',
    '=',
    `1) v4TileSpokenLabel — ${UI}:1776-1800. 2) «32 › Вес › 91,1 › кг › −0,9 за неделю». 3) Состояние словом из V4_STATE_WORD. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Вес · Только число · текст',
    '=',
    `1) v4TileSpokenLabel на .widget-v4-mini__value — ${UI}:1788-1800. 2) «33 › Вес › 91,1 › кг». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Вес · Точки и среднее · текст',
    '=',
    `1) v4TileSpokenLabel на .widget-v4-row__value или kicker+meta — ${UI}:1784-1800. 2) «34 › Вес · точки и среднее › 91,1 › …». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
];

const zone = readZone('home-widgets');
let applied = 0;
for (const row of ROWS) {
  const [key, verdict, fact] = row;
  const entry = zone.rows[key];
  if (!entry) {
    console.error('нет строки', key);
    process.exit(1);
  }
  if (entry.v !== '?') {
    console.log(`${key}  skip (${entry.v})`);
    continue;
  }
  applyVerdictToRow(entry, { verdict, fact, options: {} });
  applied += 1;
  console.log(`${key}  ? → ${verdict}`);
}
writeZone('home-widgets', zone);
console.log(`applied ${applied}`);
