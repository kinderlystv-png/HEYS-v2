import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const PROTO = 'кадр data-demo="protocol" — отвергнутый вариант сравнения; строка «демо»: такие кадры не реализуются';
const WHEEL = 'контракт колеса каноничен в home-widgets, но кадры «Колесо · …» в этом заходе не сводились — отдельный scope; код не трогали';
const B_SCOPE = 'вид number_only уже в продукте (heys_widgets_ui_v1.js:7413), кадр B в этом заходе только вердиктовали без правок';
const WATER = 'widgets-water-frames-v4.test.js';
const FAB = 'widgets-screen-budget-v4.test.js';
const FLOW = 'widgets-flow-layout-v4.test.js';

/** @type {Array<[string, string, string, Record<string, string>|undefined]>} */
const ROWS = [
  ['вид кнопки', '=', `1) .widgets-quick-fab — 730:3306 background var(--v4-fab,#c67139), color var(--v4-on-fab,#2b1608), не --v4-act. 2) 21 px glyph ui:8730. 3) Песок #c67139/#2b1608, синий #286da9/#ffffff (002:145/465). 4) Смоук: ${FAB}.`],

  ['янтарная лестница · что с ней делать', '=', '1) Решение 4 сентября в data-v: перевод по оттенку запрещён; warn/act/accent-bg — ролью, декор — литералом. 2) «герой» снят: --fab следует набору. 3) Запрет по экрану, не по файлу. 4) В home-widgets/730 янтарь у sleep stars, cascade warn, heatmap yellow переведены на --v4-wgt-* / --v4-warn-soft.'],
  ['подсистемы тренировок · что идёт в релиз', '=', '1) Решение владельца 4 сентября в data-v: в релиз только силовой конструктор; fingers и drums заблокированы до релиза (186 литералов вне перекраски). 2) 750-strength-builder.css в релизе. 3) Гейт ролей блокировку у fingers/drums не ищет. 4) Продукт не меняли — строка закрыта по контракту.'],

  ...['Добавление · 1 колонка · 01', 'Добавление · 2 колонки · 01', 'Добавление · 2 колонки · 02', 'Добавление · 3 колонки · 01', 'Добавление · 3 колонки · 02', 'Добавление · 4 колонки · 01', 'Добавление · 4 колонки · 02'].map((k) => [k, '—', PROTO, { 'na-kind': 'demo-only' }]),
  ...['Добавление · 1 колонка · рисунок 01', 'Добавление · 1 колонка · рисунок 02', 'Добавление · 2 колонки · рисунок 01', 'Добавление · 2 колонки · рисунок 02', 'Добавление · 3 колонки · рисунок 01', 'Добавление · 3 колонки · рисунок 02', 'Добавление · 4 колонки · рисунок 01', 'Добавление · 4 колонки · рисунок 02'].map((k) => [k, '—', PROTO, { 'na-kind': 'demo-only' }]),
  ...['Добавление · 1 колонка · текст', 'Добавление · 2 колонки · текст', 'Добавление · 3 колонки · текст', 'Добавление · 4 колонки · текст'].map((k) => [k, '—', PROTO, { 'na-kind': 'demo-only' }]),

  ['Главная · хвост одна клетка · 01', '—', `1) Кадр protocol (widgets-canvas-copy.test.js). 2) Продукт — fr-сетка .widgets-grid, не 79.75 px. 3) Flow-укладка хвоста — ${FLOW}. 4) Плитку widget-v4-add UI не рендерит (screen-budget).`, { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · 02', '—', `1) protocol. 2) «плитка» закрыта строкой «вид плитки». 3) ${FLOW} — tail прижат вправо.`, { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · 03', '—', '1) protocol. 2) Демо-подписи кадра, не продуктовый текст. 3) Смоук: widgets-canvas-copy.test.js.', { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · 04', '—', '1) protocol. 2) Пунктир add описан в css:12033 .widget-v4-add, но UI без className widget-v4-add. 3) Не реализуем protocol-кадр.', { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · рисунок 01', '—', PROTO, { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · рисунок 02', '—', PROTO, { 'na-kind': 'demo-only' }],
  ['Главная · хвост одна клетка · текст', '—', PROTO, { 'na-kind': 'demo-only' }],

  ['Главная · ряд занят целиком · 01', '—', `1) protocol. 2) Сетка fr, не 79.75 px. 3) ${FLOW}.`, { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · 02', '—', '1) protocol. 2) «вид плитки» закрыта. 3) Не сводили protocol.', { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · 03', '—', '1) protocol. 2) Демо-ключи кадра. 3) widgets-canvas-copy.test.js.', { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · 04', '—', '1) protocol. 2) css:12033 .widget-v4-add есть, UI не рендерит. 3) demo-only.', { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · 05', '—', '1) protocol. 2) «Добавить» 11px/700 — css:12042 .widget-v4-add, UI без плитки. 3) demo-only.', { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · рисунок 01', '—', PROTO, { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · рисунок 02', '—', PROTO, { 'na-kind': 'demo-only' }],
  ['Главная · ряд занят целиком · текст', '—', PROTO, { 'na-kind': 'demo-only' }],

  ['Динамика · B изменение · 01', '=', `1) Корень .widget-wd — number_only :7413. 2) Кадр stop. 3) Не цвет. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · 02', '=', `1) Ключ weightDynamicsDeltaKicker :7328 → «Сброшено за месяц» при sign −. 2) .widget-v4-kicker :7416. 3) Слово. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · 03', '=', `1) .widget-wd__num-row :7419 — flex-end/space-between/gap 8/margin-top auto 730:13622. 2) baseline через .widget-wd__delta gap 3px 730:13631. 3) Не цвет. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · 04', '=', `1) .widget-wd__delta :7350 — sign+text+.widget-v4-unit «кг». 2) tabular-nums 730:13638. 3) stateClass ok/bad. 4) «−1,8» — formatAnimDeltaKg.`],
  ['Динамика · B изменение · 05', '=', `1) .widget-wd__arrow :7422 — margin-bottom 3px 730:13840. 2) SVG 14×14 только при sign −. 3) Не цвет. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · рисунок 01', '=', `1) SVG viewBox 0 0 24 24 width/height 14 :7426. 2) Поле рисунка кадра. 3) Не цвет. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · рисунок 02', '=', `1) path M12 5v14M6 13l6 6 6-6 :7427. 2) stroke currentColor. 3) Не цвет. 4) ${B_SCOPE}.`],
  ['Динамика · B изменение · текст', '=', `1) «Сброшено за месяц» — kicker :7328. 2) «−1,8 › кг» — deltaLine :7350. 3) Слова кадра в number_only. 4) ${B_SCOPE}.`],

  ['Вода · Как сейчас · 01', '=', `1) mini/micro — WaterVariantBody :4329 widget-water--micro. 2) Вид 1×1 variants :92. 3) Не цвет. 4) Смоук: ${WATER}.`],
  ['Вода · К этому часу · 01', '=', `1) by_hour :4402 widget-water--2x1. 2) Кадр stop. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · К этому часу · 02', '=', `1) .widget-v4-row — space-between/baseline 730. 2) ui :4448. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · К этому часу · 03', '=', `1) v4Kicker('Вода') :4449. 2) Слово. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · К этому часу · 04', '=', `1) .widget-v4-row__meta :4450 — checkLabel «к 18:00». 2) 9px/600 --v4-ink-data 730. 3) Песок/синий ink-data 56%. 4) ${WATER}.`],
  ['Вода · К этому часу · 05', '=', `1) .widget-v4-row__value :4454 + v4ValueStateClass. 2) margin-top auto на 2×1 stack 730:14749. 3) gap 4 baseline — hero/row. 4) ${WATER}.`],
  ['Вода · К этому часу · 06', '=', `1) deficitLabel :4434-4436. 2) tabular-nums на row__value. 3) «−300» — динамика. 4) ${WATER}.`],
  ['Вода · К этому часу · 07', '=', `1) .widget-v4-water-hour__bar 730:14124 — 5px/999/track. 2) margin-top 6px. 3) --v4-track 12%. 4) ${WATER}.`],
  ['Вода · К этому часу · 08', '=', `1) .widget-v4-mini__bar-fill--water width inline. 2) 5px. 3) --v4-water/#7d98a6 песок 002:271, синий 002:561 (--water-tone 730:14744). 4) 62% — демо.`],
  ['Вода · К этому часу · 09', '=', `1) .widget-v4-water-hour__marker 730:14134 — 2×9px radius 2. 2) --v4-sand-ink/#201e1d. 3) left expectedPct inline :4465. 4) ${WATER}.`],
  ['Вода · Ритм дня · 01', '=', `1) rhythm :4471. 2) 2×1 stack. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · Ритм дня · 02', '=', `1) row space-between baseline. 2) ui rhythm header. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · Ритм дня · 03', '=', `1) meta «1,7 / 2,7 л» — formatRuDecimal :4477 area. 2) v4Kicker('Вода'). 3) Слова. 4) ${WATER}.`],
  ['Вода · Ритм дня · 04', '=', `1) rhythmLabel hrs :4473. 2) 9.5px/700 meta. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · Ритм дня · 05', '=', `1) .widget-v4-water-rhythm__body 730:14724 — flex-end gap 4 height 24 margin-top auto. 2) ui :4485. 3) Не цвет. 4) ${WATER}.`],
  ['Вода · Ритм дня · 06', '=', `1) __bin--fill height inline. 2) flex 1 radius 2. 3) --water-tone/--v4-water. 4) демо-высоты.`],
  ['Вода · Ритм дня · 07', '=', `1) __bin--fill. 2) radius 2 flex 1. 3) --v4-water. 4) демо.`],
  ['Вода · Ритм дня · 08', '=', `1) __bin--fill. 2) radius 2. 3) --v4-water. 4) демо.`],
  ['Вода · Ритм дня · 09', '=', `1) __bin--fill. 2) radius 2. 3) --v4-water. 4) демо.`],
  ['Вода · Ритм дня · 10', '=', `1) __bin--fill. 2) radius 2. 3) --v4-water. 4) демо.`],
  ['Вода · Ритм дня · 11', '=', `1) пустой __bin background rgba ink 10% 730:14736. 2) min-height 3px. 3) --v4-ink-rgb mix. 4) демо.`],
  ['Вода · Как сейчас · текст', '=', `1) «из 2,7» normLabel :4380. 2) «Вода» label :4381. 3) «1,7» litersLabel :4397. 4) ${WATER}.`],
  ['Вода · К этому часу · текст', '=', `1) «Вода» kicker. 2) deficit + «мл к графику». 3) checkLabel meta. 4) ${WATER}.`],
  ['Вода · Ритм дня · текст', '=', `1) meta 1,7/2,7 л. 2) rhythmLabel. 3) bins динамика. 4) ${WATER}.`],

  ['колесо · главный источник', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['вид · колесо выбора · правило продукта', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['колесо · высота ряда', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['колесо · края и шаг', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['колесо · чего нет', '—', WHEEL, { 'na-kind': 'handoff' }],
  ...['01', '02', '03', '04', '05', '06', '07', '08'].flatMap((n) => [
    [`Колесо · крупное · ${n}`, '—', WHEEL, { 'na-kind': 'handoff' }],
    [`Колесо · рядовое · ${n}`, '—', WHEEL, { 'na-kind': 'handoff' }],
    [`Колесо · край шкалы · ${n}`, '—', WHEEL, { 'na-kind': 'handoff' }],
  ]),
  ['Колесо · крупное · текст', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['Колесо · рядовое · текст', '—', WHEEL, { 'na-kind': 'handoff' }],
  ['Колесо · край шкалы · текст', '—', WHEEL, { 'na-kind': 'handoff' }],
];

let changed = 0;

for (const [key, verdict, fact, options = {}] of ROWS) {
  const result = setVerdictKey('home-widgets', key, { verdict, fact, options }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) {
    console.log('skip (не ?)', key, result.was.v);
    continue;
  }
  changed += 1;
  console.log(`${key}  ? → ${verdict}`);
}

console.log(`\nОбновлено: ${changed}`);
