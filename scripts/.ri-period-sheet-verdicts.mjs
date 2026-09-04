import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const MODAL = 'heys_day_tab_impl_v1.js';
const MONTHLY = 'heys_monthly_reports_v1.js';
const CSS = '733-ui-v4-reports.css';

const PERIOD_KEYS = [
  'вид · лист периодов',
  ...Array.from({ length: 31 }, (_, i) => `Лист периодов · ${String(i + 1).padStart(2, '0')}`),
  'Лист периодов · рисунок 01',
  'Лист периодов · рисунок 02',
  'Лист периодов · текст',
];

const FACTS = {
  'вид · лист периодов': `${MODAL} .reports-v4-periods-sheet fullscreen v4; ${CSS} head 16/18/0, chips «Неделя/Месяц»+«Только надёжные · N», legend 3 dots 8px, card .grp 3×2 — reports-insights-v4-canvas-geometry PERIOD_SHEET`,
  'Лист периодов · 01': `${MODAL}:1608 .reports-v4-periods-sheet__head flex space-between padding 16px 18px 0`,
  'Лист периодов · 02': `${CSS} .reports-v4-periods-sheet__close 44×44 center; svg 17×17 stroke currentColor`,
  'Лист периодов · 03': `${MODAL}:1630 «По месяцам и неделям» .reports-v4-periods-sheet__title font 700 15px/1`,
  'Лист периодов · 04': `${CSS} .reports-v4-periods-sheet__head-spacer width 44px`,
  'Лист периодов · 05': `${MODAL}:1637 .reports-v4-periods-sheet__scroll overflow-y auto padding 6px 18px`,
  'Лист периодов · 06': `${CSS} .reports-v4-periods-sheet__chips margin-top 0 gap 8px`,
  'Лист периодов · 07': `${CSS} .reports-v4-periods-sheet__legend gap 12px margin-top 12px wrap`,
  'Лист периодов · 08': `${CSS} .reports-v4-periods-sheet__legend-item align center gap 6px font 500 10.5px/1; sand rgb(0,0,0/.56) blue rgb(0,0,0/.56) --v4-ink-data`,
  'Лист периодов · 09': `${CSS} .reports-v4-periods-sheet__dot.is-complete 8×8 radius 999; sand #5c6a45 blue #1f6e4d --v4-ok-text`,
  'Лист периодов · 10': `${CSS} .reports-v4-periods-sheet__dot.is-partial 8×8; sand #d99a63 blue #d99a63 --v4-overlay-fill`,
  'Лист периодов · 11': `${CSS} .reports-v4-periods-sheet__dot.is-incomplete 8×8; sand #a83c22 blue #b03a24 --v4-bad-text`,
  'Лист периодов · 12': `${CSS} .reports-v4-periods-card margin-top 12px padding 16px radius 20px --v4-surface`,
  'Лист периодов · 13': `${CSS} .reports-v4-periods-card__head baseline space-between gap 10px`,
  'Лист периодов · 14': `${CSS} .reports-v4-periods-card__date font 700 13px/1.3; sand #201e1d blue #0f172a --v4-ink`,
  'Лист периодов · 15': `${CSS} .reports-v4-periods-card__badge 9px/700 mono .06em uppercase padding 4px 7px --v4-chip/--v4-act-text`,
  'Лист периодов · 16': `${CSS} .reports-v4-periods-card__reliability align center gap 6px margin-top 5px`,
  'Лист периодов · 17': `${MONTHLY} buildReliabilityText «учтено N из 7 дней»; ${CSS} font 500 11px/1.4 tabular-nums --v4-ink-data`,
  'Лист периодов · 18': `${CSS} .reports-v4-periods-card__metrics grid 3×1fr gap 10px margin-top 12px`,
  'Лист периодов · 19': `${CSS} .reports-v4-periods-card__metric column gap 3px`,
  'Лист периодов · 20': `${CSS} .reports-v4-periods-card__metric-value font 700 14px/1 tabular-nums --v4-ink`,
  'Лист периодов · 21': `${CSS} .reports-v4-periods-card__metric-label font 500 9.5px/1 --v4-ink-data`,
  'Лист периодов · 22': `${CSS} .reports-v4-periods-card__metric-value.is-good --v4-ok-text; sand #5c6a45 blue #1f6e4d`,
  'Лист периодов · 23': `${MONTHLY} weightTrend footnote; ${CSS} .reports-v4-periods-card__weight-note font 600 11px/1.4 margin-top 10px`,
  'Лист периодов · 24': `${CSS} .reports-v4-periods-card__days min-height 44px space-between margin-top 2px`,
  'Лист периодов · 25': `${MONTHLY} «Дни недели»; ${CSS} .reports-v4-periods-card__days-label font 600 11.5px/1; sand #8a4a20 blue #1d4ed8 --v4-act-text`,
  'Лист периодов · 26': `${CSS} .reports-v4-periods-card__days-chevron font 700 12px/1 --v4-act-text`,
  'Лист периодов · 27': `${CSS} .reports-v4-periods-sheet__list gap 10px margin-top 12px (второй .grp без +12)`,
  'Лист периодов · 28': `${MONTHLY} weightTrend header «±N кг к прошлой»; ${CSS} .reports-v4-periods-card__delta font 600 11px/1`,
  'Лист периодов · 29': `${CSS} .reports-v4-periods-card__delta.is-muted color-mix 42% --v4-ink; sand rgba(32,30,29/.42) blue rgba(15,23,42/.42)`,
  'Лист периодов · 30': `${CSS} .reports-v4-periods-card__metric-value.is-muted color-mix 42% --v4-ink (прочерки <4 дней)`,
  'Лист периодов · 31': `${MONTHLY} unreliable footnote «Меньше четырёх дней…»; ${CSS} .reports-v4-periods-card__footnote font 500 11.5px/1.4`,
  'Лист периодов · рисунок 01': `${MODAL}:1616 svg close 17×17 viewBox 0 0 24 24 path M6 6l12 12M18 6L6 18`,
  'Лист периодов · рисунок 02': `${MODAL}:1616 тот же крест — второй рисунок канваса дублирует поле 17×17`,
  'Лист периодов · текст': `${MODAL}+${MONTHLY} копия канваса: «По месяцам и неделям», чипы Неделя/Месяц/Только надёжные, легенда 3 точки, карточки 3×2, «Дни недели ›», сноска <4 дней`,
};

let applied = 0;
for (const key of PERIOD_KEYS) {
  const fact = FACTS[key];
  if (!fact) throw new Error(`Нет факта для «${key}»`);
  setVerdictKey('reports-insights', key, { verdict: '=', fact, options: {} });
  applied += 1;
}
console.log(`reports-insights period sheet: ${applied} вердиктов → =`);
