import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const SMOKE = 'widgets-rings-v4-contract.test.js';
const UI = 'heys_widgets_ui_v1.js';
const CSS = '730-widgets-dashboard.css';
const PAL = '002-ui-v4-palette-roles.css';

const NOW = {
  '01': `1) Плитка .widget--macros — position relative на .widget. 2) Кадр stop «Как сейчас». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) Ряд .widget-v4-macros — ${UI}:6588. 2) gap 6, margin auto — ${CSS}:11702-11709. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '03': `1) Колонка .widget-v4-macro — v4SageRing ${UI}:2435. 2) flex 1 1 0, min-width 0, center — ${CSS}:11712-11718. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Ключ .widget-v4-macro__label — ${UI}:2436. 2) margin-bottom 5 — ${CSS}:11721-11723. 3) Слово «Белки». 4) Смоук: ${SMOKE}.`,
  '05': `1) Факт .widget-v4-macro__fact-val при macroDeviationBad — ${UI}:2462-2466. 2) margin-top 5, 13px/700 — ${CSS}:11738-11743. 3) --v4-val-bad: песок #a8382b, синий #a8382b (${PAL}:210/504). 4) Смоук: ${SMOKE}.`,
  '06': `1) «/ 150» .widget-v4-macro__fact-sep+tgt — ${UI}:2467-2468. 2) font-weight 600. 3) --v4-ink-secondary 38 % / bad → --v4-ink-3 42 % (${CSS}:11752-11760). 4) Смоук: ${SMOKE}.`,
  '07': `1) Нейтральный факт .widget-v4-macro__fact — ${UI}:2461-2468. 2) 13px/700. 3) --v4-ink на факте, sep/tgt --v4-ink-secondary. 4) «48» — formatRuNumber(value).`,
};

const BARS = {
  '01': NOW['01'],
  '02': `1) Корень .widget-macros--bars — ${UI}:6482. 2) column gap 4 margin-top auto — ${CSS}:14339-14343. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '03': `1) Строка v4MacroBarRow — ${UI}:2208. 2) align center gap 7 — ${CSS}:14346-14349. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Ключ .widget-v4-macro-bar-row__label — ${UI}:2209. 2) width 8, flex none, line-height 1 — ${CSS}:14355-14358. 3) «Б». 4) Смоук: ${SMOKE}.`,
  '05': `1) Дорожка .widget-v4-macro-bar-row__track — ${UI}:2212. 2) flex 1, 5px, 999, bg 9 % — ${CSS}:14361-14366. 3) rgba 9 %. 4) Смоук: ${SMOKE}.`,
  '06': `1) Заливка .widget-v4-macro-bar-row__fill--bad — ${UI}:2214-2215. 2) width inline из ratio. 3) --v4-bad-text: #a83c22 / #b03a24 (${PAL}:209/503). 4) Демо 64 % — динамика.`,
  '07': `1) Числа .widget-v4-macro-bar-row__nums — ${UI}:2224. 2) 9px/700, width 46, right — ${CSS}:14393-14399. 3) widget-v4-val--bad при macroDeviationBad. 4) «96 / 150».`,
  '08': `1) Заливка ok .widget-v4-macro-bar-row__fill — ${UI}:2214. 2) 5px/999. 3) --v4-ok-fill: песок #7a8a5e, синий #4f9a78 (${PAL}:167/477). 4) Демо 77 % — динамика.`,
  '09': `1) То же __nums без bad — ${UI}:2224. 2) 9px/700. 3) --v4-ink на нейтральном. 4) «48 / 62».`,
  '10': `1) Track relative для маркера — ${UI}:2212. 2) position relative — ${CSS}:14361-14362. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '11': `1) Перебор fill --bad — ${UI}:2214-2215. 2) width 100 %. 3) --v4-bad-text. 4) «198 / 180» carbs over.`,
  '12': `1) Маркер нормы .widget-v4-macro-bar-row__norm — ${UI}:2218-2220. 2) absolute 2×9, radius 2 — ${CSS}:14383-14390. 3) --v4-sand-ink. 4) left из over ratio.`,
};

const DEFICITS = {
  '01': `1) Корень .widget-macros--deficits — ${UI}:6512. 2) Кадр 2×1. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) v4Kicker('БЖУ · что выбивается') — ${UI}:6513. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '03': `1) Hero .widget-v4-deficit-hero — ${UI}:6514. 2) baseline gap 5 margin-top 9 — ${CSS}:14402-14410. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число в hero — ${UI}:6515. 2) 26px/600/-.03em — ${CSS}:14406-14409. 3) widget-v4-val--bad на worst. 4) «−54».`,
  '05': `1) Низ .widget-v4-deficit-rows — ${UI}:6518. 2) column gap 6 margin-top auto — ${CSS}:14413-14417. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': `1) Строки .widget-v4-deficit-rows__row — ${UI}:6519. 2) space-between 10px/600 --v4-ink-data — ${CSS}:14424-14427. 3) 56 % ink. 4) Смоук: ${SMOKE}.`,
  '07': `1) Дельта +18 в row — ${UI}:6526-6528. 2) tabular-nums в hero/rows. 3) val--bad при bad. 4) fmtDelta.`,
  '08': `1) Дельта −14 neutral — ${UI}:6526-6528. 2) widget-v4-val--neutral. 3) --v4-ink. 4) fmtDelta.`,
};

const PROTEIN = {
  '01': `1) .widget-macros--1x1.widget-v4-mini — ${UI}:6543. 2) Кадр 1×1. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) v4Kicker('Белки') — ${UI}:6544. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '03': `1) .widget-v4-mini__value — ${UI}:6545. 2) baseline gap 2 margin-top auto — ${CSS}:11151-11158. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число .widget-v4-mini__value — ${UI}:6548. 2) 21px/600/-.02em (1.3125rem). 3) val--bad при proteinBad. 4) «96».`,
  '05': `1) Дорожка .widget-v4-goalbar — v4GoalBar ${UI}:5705. 2) height 4, 999, --v4-track, margin-top 6 на 1×1 — ${CSS}:12633-12637,12656-12658. 3) track 12 %. 4) Смоук: ${SMOKE}.`,
  '06': `1) Заливка .widget-v4-goalbar__fill--bad — v4GoalBar(..., 'bad') ${UI}:5705-5714. 2) width inline. 3) --v4-bad-text. 4) Демо 64 %.`,
};

const EMPTY = {
  '01': `1) .widget-macros--3x2 на пустом дне — ${UI}:6349. 2) Кадр 219×136 — сетка, не отдельное правило. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': NOW['02'],
  '03': NOW['03'],
  '04': NOW['04'],
  '05': `1) Прочерк .widget-v4-macro__fact-val empty — ${UI}:2466. 2) margin-top 5, 13px/700 — ${CSS}:11738-11743. 3) --v4-ink-3: песок rgba(0,0,0,.45), синий rgba(0,0,0,.45) (${PAL}:180/484). 4) Смоук: ${SMOKE}.`,
  '06': `1) Норма empty sep/tgt — ${UI}:2467-2468 empty. 2) font-weight 700 на empty. 3) --v4-ink-data 56 %. 4) «/ 150».`,
};

const RISUNOK = {
  '01': `1) SVG v4SageRing width 46 height 46 viewBox 0 0 44 44 — ${UI}:2437. 2) Поле рисунка кадра. 3) Не цвет набора. 4) Смоук: ${SMOKE}.`,
  '02': `1) Дорожка circle r=18 stroke --v4-line — ${UI}:2438-2440. 2) 9 % ink fallback. 3) Не дуга. 4) empty и filled.`,
  '03': `1) Дуга .widget-v4-macro__ring-fill — ${UI}:2442-2449. 2) stroke --v4-ok-fill (${CSS}:11835-11837). 3) Песок #7a8a5e, синий #4f9a78. 4) pathLength 100, cap round.`,
};

function rowsFromMap(prefix, map, verdict = '=') {
  return Object.entries(map).map(([n, fact]) => [ `${prefix} · ${n}`, verdict, fact ]);
}

const ROWS = [
  ...rowsFromMap('Кольца БЖУ · Как сейчас', NOW),
  ...rowsFromMap('Кольца БЖУ · Три полосы', BARS),
  ...rowsFromMap('Кольца БЖУ · Что выбивается', DEFICITS),
  ...rowsFromMap('Кольца БЖУ · Только белок', PROTEIN),
  ...rowsFromMap('Кольца БЖУ · пустой день', EMPTY),
  ...['01', '02', '03'].map((n) => [`Кольца БЖУ · Как сейчас · рисунок ${n}`, '=', RISUNOK[n]]),
  ...['01', '02'].map((n) => [`Кольца БЖУ · пустой день · рисунок ${n}`, '=', RISUNOK[n]]),
  [
    'Кольца БЖУ · Как сейчас · текст',
    '=',
    `1) Слова кадра: «Белки», «54», «96», «/ 150», «Жиры», «14», «48», «/ 62», «Углеводы», «−18», «198», «/ 180». 2) Номер «5». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Кольца БЖУ · Три полосы · текст',
    '=',
    `1) «96 / 150», «48 / 62», «198 / 180». 2) Номер «6». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Кольца БЖУ · Что выбивается · текст',
    '=',
    `1) «БЖУ · что выбивается», «−54», «белки, г», «Углеводы», «+18», «Жиры», «−14». 2) Номер «7». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Кольца БЖУ · Только белок · текст',
    '=',
    `1) «Белки», «96», «/150». 2) Номер «8». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Кольца БЖУ · пустой день · текст',
    '=',
    `1) «Белки», «/ 150», «Жиры», «/ 62», «Углеводы», «/ 180»; прочерк вместо факта. 2) Кадр empty. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
];

let applied = 0;
for (const row of ROWS) {
  const [key, verdict, fact] = row;
  const result = setVerdictKey('home-widgets', key, { verdict, fact, options: {} }, {
    skipIf: (entry) => entry.v !== '?',
  });
  if (result.skipped) {
    console.log(`${key}  skip (${result.was.v})`);
    continue;
  }
  applied += 1;
  console.log(`${key}  ? → ${verdict}`);
}
console.log(`applied ${applied}`);
