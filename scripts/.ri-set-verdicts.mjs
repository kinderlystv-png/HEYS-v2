import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const CASCADE_CSS = '734-ui-v4-insights.css';
const INSIGHTS_JS = 'insights/pi_ui_dashboard.js';
const CASCADE_JS = 'heys_cascade_card_v1.js';
const WHATIF_JS = 'insights/pi_whatif.js';
const WHATIF_UI = 'insights/pi_ui_whatif_scenarios.js';
const MODAL_JS = 'heys_day_tab_impl_v1.js';
const MONTHLY_JS = 'heys_monthly_reports_v1.js';
const REPORTS_CSS = '733-ui-v4-reports.css';

const cascadePairs = {
  'Инсайты · 27': `${CASCADE_CSS} .heys-score-insights-card--v4 padding 16 radius 20 — insights-cascade-v4.test.js`,
  'Инсайты · 28': `${CASCADE_JS} InsightsCascadeCardV4 __head baseline space-between — insights-cascade-v4.test.js:122-129`,
  'Инсайты · 29': `${CASCADE_CSS} .heys-score-insights-v4__state font 700 13px/1 var(--v4-ink)`,
  'Инсайты · 30': `${CASCADE_CSS} .heys-score-insights-v4__trend gap 6px font 700 11.5px/1 var(--v4-ok-text) up`,
  'Инсайты · 31': `${CASCADE_CSS} .heys-score-insights-v4__scale height 8px margin-top 14px radius 999 var(--v4-line)`,
  'Инсайты · 32': `${CASCADE_CSS} .heys-score-insights-v4__scale-fill height 8px var(--v4-ok-fill)`,
  'Инсайты · 33': `${CASCADE_CSS} .heys-score-insights-v4__threshold width 2px height 14px var(--v4-track)`,
  'Инсайты · 34': `${CASCADE_CSS} .heys-score-insights-v4__threshold.is-maximum var(--v4-act)`,
  'Инсайты · 35': `${CASCADE_CSS} .heys-score-insights-v4__legend font 600 9.5px margin-top 9px letter-spacing .02em var(--v4-ink-data)`,
  'Инсайты · 36': `${CASCADE_CSS} .heys-score-insights-v4__legend .is-maximum var(--v4-act-text)`,
  'Инсайты · 37': `${CASCADE_CSS} .heys-score-insights-v4__story font 500 11.5px/1.5 margin 12px 0 0`,
  'Инсайты · 38': `${CASCADE_CSS} .heys-score-insights-v4__today margin-top 18px padding-top 16px border-top var(--v4-line)`,
  'Инсайты · 39': `${CASCADE_CSS} .heys-score-insights-v4__today-head space-between align center`,
  'Инсайты · 40': `${CASCADE_CSS} .heys-score-insights-v4__key font 600 10.5px/1 letter-spacing .04em var(--v4-ink-data)`,
  'Инсайты · 41': `${CASCADE_CSS} .heys-score-insights-v4__contribution font 700 11.5px/1 tabular-nums`,
  'Инсайты · 42': `${CASCADE_CSS} .heys-score-insights-v4__dots gap 7px margin-top 14px height 16px`,
  'Инсайты · 43': `${CASCADE_JS} InsightsCascadeCardV4 __dot sizes from INSIGHTS_CASCADE_DOT_SIZES`,
  'Инсайты · 44': `${CASCADE_JS} InsightsCascadeCardV4 __dot tone good/great/peak/bad from getEventTone`,
  'Инсайты · 45': `${CASCADE_JS} InsightsCascadeCardV4 __dot.is-latest on last event`,
  'Инсайты · 46': `${CASCADE_CSS} .heys-score-insights-v4__axis font 500 10.5px/1 margin-top 11px var(--v4-ink-data)`,
  'Инсайты · 47': `${CASCADE_JS} InsightsCascadeCardV4 __axis firstTime → «сейчас»`,
  'Инсайты · 48': `${CASCADE_CSS} .heys-score-insights-v4__reports-link margin-top 16px padding 14px 0 0 font 600 12px/1`,
  'Инсайты · 49': `${CASCADE_JS} InsightsCascadeCardV4 __reports-link delta14Text + «смотреть в Отчётах»`,
  'Инсайты · 50': `${CASCADE_CSS} .heys-score-insights-v4__reports-link border-top var(--v4-line)`,
  'Инсайты · 51': `${CASCADE_CSS} .heys-score-insights-v4__delta var(--v4-act-text) inline in link text`,
  'Инсайты · 52': `${CASCADE_CSS} .heys-score-insights-v4__reports-link chevron svg 14×14 stroke currentColor`,
  'Инсайты · 53': `${INSIGHTS_JS} CascadeInsightsSlot v4:true opens reports tab on click`,
};

const detailWeight = {
  'Инсайты · подробно · рисунок 04': `${INSIGHTS_JS} WeightPrediction variant v4 svg viewBox 0 0 292 66 polyline class insights-v4-weight__line`,
  'Инсайты · подробно · рисунок 05': `${INSIGHTS_JS} WeightPrediction variant v4 polyline insights-v4-weight__forecast stroke-dasharray 4 4`,
  'Инсайты · подробно · рисунок 06': `${INSIGHTS_JS} WeightPrediction variant v4 circle insights-v4-weight__dot r 4.5 at projected point`,
  'Инсайты · текст 1/2': `${INSIGHTS_JS} WeightPrediction v4 head «Через неделю» + projectedLabel 12.5/700 var(--v4-ok-text)`,
  'Инсайты · текст 2/2': `${INSIGHTS_JS} WeightPrediction v4 pace «такими темпами … кг в месяц» 11px/500 var(--v4-ink-data)`,
  'Инсайты · подробно · текст': `${INSIGHTS_JS} InsightsV4Detail tier «Прогноз веса» + WeightPrediction v4 after 14 days history`,
};

const DECISION_REF = 'docs/ui/UI_V4_DESIGNER_REQUEST.md:1217';

const periodListNeq = (n, fact) => [`Лист периодов · ${String(n).padStart(2, '0')}`, ['≠', fact, 'canvas-conflict', DECISION_REF]];

const VERDICTS = new Map([
  ['сделай сегодня', ['=', `${INSIGHTS_JS} buildInsightsMeasurementAction + mergeInsightsPriorityActions: первая строка при indirect recomposition, slice(0,2) у EWS, лимит 3`]],
  ['каскад', ['=', `${CASCADE_JS} InsightsCascadeCardV4 + buildInsightsCascadeV4Model; шкала 3 засечки 2×14 (2 neutral + 1 accent), ось времени, вклад дня — insights-cascade-v4.test.js`]],
  ['что если', ['=', `${WHATIF_JS} ACTION_TYPES 10 сценариев (3+3+2+2); решение 3 сентября — прятать рабочий сценарий нельзя`]],
  ['карточка · шкала каскада', ['=', `${CASCADE_CSS} .heys-score-insights-v4__threshold 2×14: две var(--v4-track) + одна .is-maximum var(--v4-act); без круга и без четырёх засечек — решение 3 сентября`]],
  ['карточка · прогноз веса', ['=', `${INSIGHTS_JS} WeightPrediction variant v4: hero «Через неделю» 12.5/700, pace «… кг в месяц» 11/500, sparkline 292×66 — ${CASCADE_CSS} .insights-v4-weight*`]],
  ['карточка · чипы «Что если»', ['=', `${CASCADE_CSS} .insights-v4-whatif__chip min-height 44px padding 0 16px; active var(--v4-act)/var(--v4-btn-on-act) — live-кадр 44, не 28`]],
  ['вид · чего в Инсайтах не бывает', ['=', 'решение 3 сентября: .sand-module снят, карточки на --v4-surface/--v4-card ролями набора; синяя тема холодная как остальное приложение']],
  ['вид · каскад дня', ['=', `${CASCADE_CSS}+${CASCADE_JS}: state 13/700, trend 11.5/700 gap 6, scale 8px + 3 thresholds, legend 9.5/600, story 11.5/500, dots+axis, link 12/600 — insights-cascade-v4.test.js`]],
  ['вид · панель «Что если»', ['=', `${WHATIF_UI} WhatIfScenariosInline + ${CASCADE_CSS} .insights-v4-whatif__* chips 44px, scenario card, score 22/800 var(--v4-ok-text), note 11px var(--v4-ink-data)`]],
  ['Инсайты · 22', ['=', `${CASCADE_CSS} .insights-priority-action__dot--freeze 8×8 radius 50% var(--v4-act) — точка строки замера`]],
  ['Инсайты · 23', ['=', `${CASCADE_CSS} .insights-priority-action__freeze-label font 600 10.5px/1 var(--v4-ink-2) справа в строке замера`]],
  ...Object.entries(cascadePairs).map(([k, f]) => [k, ['=', f]]),
  ...Object.entries(detailWeight).map(([k, f]) => [k, ['=', f]]),
  ['вид · лист периодов', ['≠', `${MODAL_JS} reports-fullscreen-modal legacy chrome; канвас v4 «По месяцам и неделям» один крест 44, один чип, сетка 3×2 без emoji — сведение отдельным заходом`, 'canvas-conflict', DECISION_REF]],
  periodListNeq(1, `${MODAL_JS}:1609 reports-fullscreen-modal__topbar — два выхода «Закрыть»+«×»; канвас один крест 44×44 слева`),
  periodListNeq(2, `${MODAL_JS}:1627 h2 «Месячные отчёты»; канвас «По месяцам и неделям»`),
  periodListNeq(3, `${MONTHLY_JS}:40 MonthlyReportsLegend mode weeks/months — три emoji-бейджа; канвас без иконок`),
  periodListNeq(4, `${MONTHLY_JS}:469 MonthlyReportsContent tabs «Недели»/«Месяцы»; канвас один чип фильтра`),
  periodListNeq(5, `${MONTHLY_JS} monthly-reports-filter__btn ×2 «Все недели»+«Только надёжные»; канвас один чип`),
  periodListNeq(6, `${MONTHLY_JS} monthly-week-card grid metrics with emoji; канвас 3×2 без иконок`),
  periodListNeq(7, `${MONTHLY_JS} monthly-week-card__badge «текущая»; канвас пилюля «ещё N дней»`),
  periodListNeq(8, `${MONTHLY_JS} monthly-week-card__expand-btn «дни»; канвас «Дни недели ›» высота 44`),
  periodListNeq(9, `${REPORTS_CSS} .reports-v4-periods вход «По месяцам и неделям» 12.5/600 + chevron var(--v4-act-text)`),
  periodListNeq(10, `730-widgets-dashboard.css .reports-fullscreen-modal полноэкран, не шторка — ${MODAL_JS}:488 body.reports-fullscreen-open`),
  periodListNeq(11, `${MONTHLY_JS} monthly-week-card row padding/gap от pre-v4 heys-components.css; канvас v4 card radius 20 padding 16`),
  periodListNeq(12, `${MONTHLY_JS} weekly metrics emoji prefix; канвас числа без иконок`),
  periodListNeq(13, `${MONTHLY_JS} monthly-week-card tone classes --complete/--partial; канvас v4 ink ladder ролями`),
  periodListNeq(14, `${MONTHLY_JS} month tab filter chips legacy styling; канvас один filter chip 34px`),
  periodListNeq(15, `${MONTHLY_JS} month cards share weekly card component; канvас отдельная сетка месяцев`),
  periodListNeq(16, `${MONTHLY_JS} card header font from heys-components.css 15/700; канvас 12.5/600`),
  periodListNeq(17, `${MONTHLY_JS} partial-week pill legacy colors; канvас --v4-chip 9/700 monospace`),
  periodListNeq(18, `${MONTHLY_JS} expand control text «дни» not «Дни недели ›»`),
  periodListNeq(19, `${MONTHLY_JS} week row separators legacy 1px; канvас divider var(--v4-line)`),
  periodListNeq(20, `${MONTHLY_JS} score column width from legacy grid; канvас col 26px`),
  periodListNeq(21, `${MONTHLY_JS} kcal column legacy width; канvас col 56px`),
  periodListNeq(22, `${MONTHLY_JS} weight column legacy width; канvас col 40px`),
  periodListNeq(23, `${MONTHLY_JS} footnote text legacy 11px #666; канvас 11.5/500 var(--v4-ink-data)`),
  periodListNeq(24, `${MONTHLY_JS} empty state copy from service strings; канvас v4 stub card .cd`),
  periodListNeq(25, `${MONTHLY_JS} loading state «Загружаем модуль…»; канvас без async shell`),
  periodListNeq(26, `${MODAL_JS} topbar padding from 730-widgets-dashboard.css; канvас 16/18`),
  periodListNeq(27, `${MODAL_JS} close-text button visible with ×; канvас только icon-button 44×44`),
  periodListNeq(28, `${MONTHLY_JS} legend header role=note with emoji; канvас prose under title`),
  periodListNeq(29, `${MONTHLY_JS} tabs underline active state legacy; канvас pill tabs on --v4-chip`),
  periodListNeq(30, `${MONTHLY_JS} filter row gap 8 legacy; канvас chip row gap 10`),
  periodListNeq(31, `${MONTHLY_JS} card list gap 12 legacy; канvас stack gap 11 between cards`),
  ['Лист периодов · рисунок 01', ['≠', `${MODAL_JS} modal shell from 730-widgets-dashboard.css not v4 scrim tokens`, 'canvas-conflict', DECISION_REF]],
  ['Лист периодов · рисунок 02', ['≠', `${MONTHLY_JS} week card layout SVG/sparkline absent; канvас optional mini chart placeholder`, 'canvas-conflict', DECISION_REF]],
  ['Лист периодов · текст', ['≠', `копия «Месячные отчёты»+legend emoji в ${MODAL_JS}:1627; канvас «По месяцам и неделям» без emoji`, 'canvas-conflict', DECISION_REF]],
  ['вид · карточка перестройки', ['=', `${INSIGHTS_JS} buildRecompositionAttentionCard → InsightsV4Attention: line 12.5/600, badge insights-v4-maturity «гипотеза» 9/700 mono .06em, basis 11.5/500 var(--v4-ink-data)`]],
  ['вид · действие замера', ['=', `${INSIGHTS_JS} PriorityActions freeze row: dot var(--v4-act) 8×8, text 12.5/600, label «норма заморожена» 10.5/600 var(--v4-ink-2) справа — ${CASCADE_CSS}`]],
]);

const zone = readZone('reports-insights');
let applied = 0;
for (const [key, row] of Object.entries(zone.rows)) {
  if (row.v !== '?') continue;
  const spec = VERDICTS.get(key);
  if (!spec) throw new Error(`Нет вердикта для «${key}»`);
  const [verdict, fact, reasonCode, decisionRef] = spec;
  setVerdictKey('reports-insights', key, {
    verdict,
    fact,
    options: verdict === '≠'
      ? { 'reason-code': reasonCode || 'canvas-conflict', 'decision-ref': decisionRef || DECISION_REF }
      : {},
  });
  applied += 1;
}
console.log(`reports-insights: ${applied} вердиктов поставлено`);
