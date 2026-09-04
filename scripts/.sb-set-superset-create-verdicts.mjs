// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import { patchZoneRow, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
const TEST = 'apps/web/__tests__/strength-superset-create-v4-canvas-contract.test.js';
const CSS = 'apps/web/styles/modules/750-strength-builder.css';
const JS = 'apps/web/strength/heys_strength_catalog_ui_v1.js';

const ITEMS = [
  ['Связка · создание · 01', `Шапка: .sb-superset-create-screen .sb-head { align-items:flex-start; gap:10px; padding:16px 18px 0 } — ${CSS}:3301-3303,2734-2738; computed row 01 в ${TEST}.`],
  ['Связка · создание · 02', `Колонка заголовка: .sb-head-title { flex-direction:column; gap:3px; padding:0 } — ${CSS}:2747-2752,3297-3299; computed row 02.`],
  ['Связка · создание · 03', `Имя экрана «Новая связка»: h('b', …) — ${JS}:378; DOM ${TEST}.`],
  ['Связка · создание · 04', `Ключ «упражнения подряд, отдых — после круга»: .sb-head-sub — ${JS}:379; ${CSS}:2770-2776,3305-3308.`],
  ['Связка · создание · 05', `Прокрутка: .sb-list { flex:1 1 auto; overflow-y:auto } — ${CSS}:156-160,3310-3313; computed row 05.`],
  ['Связка · создание · 06', `Ярус «Сколько упражнений»: .sb-step span — ${JS}:386; ${CSS}:3315-3327.`],
  ['Связка · создание · 07', `Список .cd: .sb-superset-kinds { padding:2px 16px 1.5px; border-radius:20px; background:var(--sb-card) } — ${CSS}:3329-3335.`],
  ['Связка · создание · 08', `Строка списка: .sb-radio { display:flex; align-items:center; gap:10px; padding:13.5px 0 } — ${CSS}:3337-3345; computed row 08.`],
  ['Связка · создание · 09', `Ряд выбора: align-items:center; gap:10px на .sb-radio — ${CSS}:3337-3340; computed row 09.`],
  ['Связка · создание · 10', `Цифра «2» в покое: .sb-radio .sb-ex-num { color:var(--v4-ink-prose) } — ${CSS}:3359-3365; песок rgba(0,0,0,.62), синий rgba(16,24,38,.62) — ${TEST} rows 10/10 blue.`],
  ['Связка · создание · 11', `«Суперсет»: .sb-radio .sb-cat-title b { color:var(--sb-tx) } — ${CSS}:3380-3383; ${JS}:366.`],
  ['Связка · создание · 12', `Подпись «два упражнения подряд без паузы»: .sb-cat-title span { font:500 11px/1.3; color:var(--sb-mut) } — ${CSS}:3385-3388; ${JS}:366.`],
  ['Связка · создание · 13', `Выбранная строка: .sb-radio.is-on { border-radius:12px; box-shadow:inset 0 0 0 2px var(--sb-acc-strong) } — ${CSS}:3351-3357; computed row 13.`],
  ['Связка · создание · 14', `Цифра «3» в выборе: .sb-radio.is-on .sb-ex-num { background:var(--sb-acc-strong); color:var(--v4-btn-on-act) } — ${CSS}:3368-3371.`],
  ['Связка · создание · 15', `«три подряд — плотнее и тяжелее» у .is-on: .sb-cat-title span { color:var(--sb-acc) } — ${CSS}:3390-3393; ${JS}:367.`],
  ['Связка · создание · 16', `Галочка «✓»: .sb-radio-check { font:700 12px/1; color:var(--sb-acc) } — ${CSS}:3391-3398,402-403; computed row 16.`],
  ['Связка · создание · 17', `Последняя строка без разделителя: .sb-radio:last-child { box-shadow:none } — ${CSS}:3347-3349; computed row 17.`],
  ['Связка · создание · 18', `Блоки раундов и отдыха: .sb-superset-controls { display:flex; gap:8px; margin-bottom:21px } — ${CSS}:3400-3404; .sb-superset-kinds margin-bottom:10px — :3331.`],
  ['Связка · создание · 19', `Карточка «Раундов»: .sb-superset-control { flex:1; padding:12px; border-radius:16px; background:var(--sb-card) } — ${CSS}:3406-3412.`],
  ['Связка · создание · 20', `Степпер раундов: .sb-stepper { align-items:center; gap:7px; margin-top:8px } — ${CSS}:3420-3423; computed row 20.`],
  ['Связка · создание · 21', `Кнопка «−»: .sb-stepper .sb-btn { font:700 18px/1; background:var(--sb-soft) } — ${CSS}:3425-3434; ${JS}:411-414.`],
  ['Связка · создание · 22', `Число раундов «3»: .sb-stepper b { flex:1; text-align:center; font:800 19px/1; color:var(--sb-tx) } — ${CSS}:3441-3446; ${JS}:415.`],
  ['Связка · создание · 23', `Кнопка «+»: .sb-stepper .sb-btn.is-accent { background:var(--sb-acc-strong); color:var(--v4-btn-on-act); font:700 18px/1 } — ${CSS}:3436-3439; ${JS}:416-419.`],
  ['Связка · создание · 24', `Поле «2:00»: .sb-rest-preview { height:44px; border-radius:12px; background:var(--sb-bg); box-shadow:inset 0 0 0 1px var(--sb-br); font:700 15px/1 } — ${CSS}:3448-3460; max restSec участников — ${JS}:358-363.`],
  ['Связка · создание · 25', `Подпись «максимум из значений участников»: .sb-control-hint { margin-top:6px; font:500 10px/1.35; color:var(--sb-mut) } — ${CSS}:3462-3466; ${JS}:425.`],
  ['Связка · создание · 26', `Карточка «Что получится»: .sb-block.sb-superset-result { padding:16px; border-radius:20px; background:var(--sb-card) } — ${CSS}:3468-3473.`],
  ['Связка · создание · 27', `Резюме «3 упражнения подряд…»: .sb-step-hint { font:600 12.5px/1.55; color:var(--sb-tx) } — ${CSS}:3475-3479; строка из countWord/restLabel/rounds — ${JS}:431-432.`],
  ['Связка · создание · 28', `Плитки прогноза: .sb-tiles { gap:6px; margin-top:10px } — ${CSS}:3481-3485; computed row 28.`],
  ['Связка · создание · 29', `Плитка «подходов»: .sb-tile { flex-direction:column; align-items:center; gap:4px; padding:9px 4px; border-radius:12px; background:var(--sb-bg) } — ${CSS}:3487-3496.`],
  ['Связка · создание · 30', `Число «9»: .sb-tile b { font:800 16px/1; color:var(--sb-tx) } — ${CSS}:3505-3508; totalApproaches=count*rounds — ${JS}:371.`],
  ['Связка · создание · 31', `Кнопка «Собрать связку · 9 подходов»: .sb-finish { margin-top:12px; min-height:48px; border-radius:999px; background:var(--sb-acc-strong) } — ${CSS}:3510-3520; ${JS}:439-444.`],
  ['Связка · создание · 32', `Сноска про один объект: .sb-superset-note { margin-top:12px; font:500 11px/1.55 } — ${CSS}:3522-3525,3291-3295; текст — ${JS}:445-446.`],
  ['Связка · создание · текст', `Полный текст кадра З1: заголовок, три вида связки, раунды, отдых 2:00, прогноз 9/3/13 мин и CTA — ${JS}:365-446; DOM-смоук ${TEST} и apps/web/__tests__/strength-builder-ui.test.js «создание связки».`],
  ['вид · создание связки', `Кадр З1: SupersetScreen — три .sb-radio в .sb-superset-kinds, степпер раундов и .sb-rest-preview рядом на --c1, блок .sb-superset-result с тремя .sb-tile и .sb-finish 48px на --acs — ${JS}:375-447, ${CSS}:3329-3520; геометрия+цвет ${TEST}.`],
];

let changed = 0;
for (const [key, fact] of ITEMS) {
  setVerdictKey('strength-builder', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v === '=' && row.f === fact,
  });
  patchZoneRow('strength-builder', key, (row) => {
    delete row.evidence;
  });
  changed += 1;
  console.log(`${key}  → =`);
}
console.log(`updated ${changed} rows`);
