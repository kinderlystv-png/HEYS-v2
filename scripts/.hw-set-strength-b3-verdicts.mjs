import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const ITEMS = [
  [
    'вид · итоги сессии',
    'FinishScreen (strength/heys_strength_finish_ui_v1.js:301-409): шапка ✕ 36 + «Тренировка завершена» + sessionTitle·дата; hero .sb-finish-hero на --gr-bg с сеткой 2×2 метрик; .sb-finish-detail четыре строки; ярусы feedback/chart/day-total/other; «Готово» .sb-finish-done 48 на --acs. Смоук: strength-builder-finish-v4-canvas-contract.test.js.',
  ],
  [
    'Конструктор · итоги · 01',
    'Шапка финала: .sb-finish-screen .sb-finish-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px 18px 0 } — 750-strength-builder.css:1713-1719; computed в тесте row 01.',
  ],
  [
    'Конструктор · итоги · 02',
    'Кнопка ✕: .sb-finish-head .sb-icon-btn 36×36, border-radius 999px, background var(--c1), font 600 13px/1, color rgba(var(--ink),.56) — 750:1722-1729; glyph finish_ui:303-305.',
  ],
  [
    'Конструктор · итоги · 03',
    'Колонка заголовка: .sb-head-title { flex:1; min-width:0; flex-direction:column; gap:3px; padding-left:10px } — 750:1732-1738; тест row 03.',
  ],
  [
    'Конструктор · итоги · 04',
    'Имя экрана «Тренировка завершена»: h("b", …) — heys_strength_finish_ui_v1.js:307; текст совпадает с data-v.',
  ],
  [
    'Конструктор · итоги · 05',
    'Ключ «Силовая · грудь, спина, плечи · 8 августа»: Parts.sessionTitle(exercises) + « · » + humanDate без дня недели — finish_ui:308-310; Parts в builder.',
  ],
  [
    'Конструктор · итоги · 06',
    'Область прокрутки: .sb-finish-list { display:flex; flex-direction:column; overflow-y:auto; gap:0; padding:6px 18px calc(18px+safe) } — 750:1752-1755.',
  ],
  [
    'Конструктор · итоги · 07',
    'Карточка hero: section.sb-finish-hero { margin-top:12px; background:var(--gr-bg) } внутри padding 16/radius 20 общего блока — 750:1757-1768.',
  ],
  [
    'Конструктор · итоги · 08',
    '«Отличная работа»: .sb-finish-praise { font:700 14px/1.2 Figtree; color:var(--gr) } — 750:1770-1773; finish_ui:315.',
  ],
  [
    'Конструктор · итоги · 09',
    'Сетка метрик: .sb-finish-metrics { grid-template-columns:1fr 1fr; gap:8px; margin-top:10px } — 750:1775-1780.',
  ],
  [
    'Конструктор · итоги · 10',
    'Плитка метрики: .sb-finish-metric { flex-direction:column; gap:5px; padding:10px 11px; border-radius:14px; background:var(--bg) } — 750:1782-1789.',
  ],
  [
    'Конструктор · итоги · 11',
    'Ярус «Длительность»: .sb-finish-metric-label { font:600 9.5px/1; letter-spacing:.11em; text-transform:uppercase; color:rgba(var(--ink),.56) } — 750:1796-1801.',
  ],
  [
    'Конструктор · итоги · 12',
    'Строка значения: .sb-finish-metric-line { display:flex; align-items:baseline; gap:5px } — 750:1803-1807.',
  ],
  [
    'Конструктор · итоги · 13',
    '«54:30»: .sb-finish-metric-line b { font:800 17px/1; font-variant-numeric:tabular-nums; color:var(--tx) } — 750:1809-1813; fmtClock(elapsedSec) finish_ui:317.',
  ],
  [
    'Конструктор · итоги · 14',
    '«↑ 12 %»: .sb-finish-metric-line i { font:700 11px/1; color:var(--gr); font-variant-numeric:tabular-nums } — 750:1819-1824; formatPct(tonnageDeltaPct) finish_ui:318.',
  ],
  [
    'Конструктор · итоги · 15',
    'Акцентная плитка «Рекорды»: .sb-finish-metric.is-accent { background:var(--tint); box-shadow:inset 0 0 0 1.5px var(--acs) } — 750:1791-1794.',
  ],
  [
    'Конструктор · итоги · 16',
    '«1» в рекордах: .sb-finish-metric.is-accent .sb-finish-metric-line b { color:var(--ac); font:800 17px/1 } — 750:1815-1817; records.length finish_ui:320.',
  ],
  [
    'Конструктор · итоги · 17',
    'Список .cd: .sb-finish-detail { margin-top:10px } — 750:1830-1835; section.sb-finish-detail finish_ui:324.',
  ],
  [
    'Конструктор · итоги · 18',
    'Строка списка: .sb-finish-row { display:flex; justify-content:space-between; padding:13px 0; border-bottom:1px solid rgba(var(--ink),.07) } — 750:1837-1846.',
  ],
  [
    'Конструктор · итоги · 19',
    '«Рабочих подходов»: span в первой .sb-finish-row, color var(--tx) от родителя — finish_ui:326; тест row 19.',
  ],
  [
    'Конструктор · итоги · 20',
    '«19»: .sb-finish-row b { font:600 12.5px/1; font-variant-numeric:tabular-nums; color:var(--tx) } — 750:1853-1858; setCounts.working finish_ui:327.',
  ],
  [
    'Конструктор · итоги · 21',
    '«4 · вне объёма»: .sb-finish-row b.is-quiet { color:rgba(var(--ink),.55) } — 750:1861-1863; warmup+« · вне объёма» finish_ui:330.',
  ],
  [
    'Конструктор · итоги · 22',
    '«Жим лёжа · 75 × 8»: .sb-finish-row b.is-record { color:var(--gr); font-weight:700 } — 750:1865-1868; recordLabel(record) finish_ui:333.',
  ],
  [
    'Конструктор · итоги · 23',
    'Строка без разделителя: .sb-finish-row--reason { border-bottom:0 } — 750:1848-1851; класс finish_ui:334.',
  ],
  [
    'Конструктор · итоги · 24',
    'Колонка причины: .sb-finish-row--reason > span { display:flex; flex-direction:column; gap:3px } — 750:1875-1880.',
  ],
  [
    'Конструктор · итоги · 25',
    'Текст причины «… — вес тела неизвестен»: small внутри .sb-finish-row--reason { font:500 11px/1.3; color:rgba(var(--ink),.56) } — 750:1882-1885; unmeasuredRows().reason finish_ui:337-338.',
  ],
  [
    'Конструктор · итоги · 26',
    '«1 упр.»: .sb-finish-row--reason > b.is-quiet { font:600 12.5px/1; font-variant-numeric:tabular-nums; color:rgba(var(--ink),.56) } — 750:1887-1889; missing.length finish_ui:340.',
  ],
  [
    'Конструктор · итоги · 27',
    'Ярус «Как оно прошло»: .sb-finish-tier { margin:20px 0 10px; font:700 10px/1; letter-spacing:.16em; text-transform:uppercase; color:var(--ac) } — 750:1891-1897; finish_ui:351.',
  ],
  [
    'Конструктор · итоги · 28',
    'Карточка feedback: .sb-finish-feedback-card { padding:16px; border-radius:20px; background:var(--c1) } — 750:1757-1763.',
  ],
  [
    'Конструктор · итоги · 29',
    'Ряд плиток: .sb-finish-feedback-grid { display:flex; gap:7px } — 750:1895-1898.',
  ],
  [
    'Конструктор · итоги · 30',
    'Плитка настроения: .sb-finish-feedback.is-mood { flex:1; min-height:52px; justify-content:center; background:var(--gr-bg); border-radius:12px } — 750:1900-1915.',
  ],
  [
    'Конструктор · итоги · 31',
    '«7» настроение: .sb-finish-feedback.is-mood input { font:700 14px/1; color:var(--gr); font-variant-numeric:tabular-nums } — 750:1945-1947; feedback.mood finish_ui:354.',
  ],
  [
    'Конструктор · итоги · 32',
    'Подпись «настроение»: .sb-finish-feedback span { font:600 9.5px/1; color:rgba(var(--ink),.56) } — 750:1953-1956.',
  ],
  [
    'Конструктор · итоги · 33',
    'Плитка самочувствия: .sb-finish-feedback.is-wellbeing { min-height:52px; background:var(--c2); border-radius:12px } — 750:1917-1919.',
  ],
  [
    'Конструктор · итоги · 34',
    '«8» самочувствие: .sb-finish-feedback.is-wellbeing input { color:var(--ac); font:700 14px/1 } — 750:1925-1937; feedback.wellbeing.',
  ],
  [
    'Конструктор · итоги · 35',
    'Плитка стресса: .sb-finish-feedback.is-stress { min-height:52px; background:var(--tint); border-radius:12px } — 750:1921-1923.',
  ],
  [
    'Конструктор · итоги · 36',
    '«5» стресс: .sb-finish-feedback.is-stress input { color:var(--ac2); font:700 14px/1 } — 750:1949-1951; feedback.stress.',
  ],
  [
    'Конструктор · итоги · 37',
    'Поле заметки: .sb-finish-note { min-height:44px; margin-top:9px; padding:0 14px; border-radius:14px; background:var(--bg); box-shadow:inset 0 0 0 1px rgba(var(--ink),.1); font:500 12.5px/1; placeholder rgba(var(--ink),.38) } — 750:1958-1974.',
  ],
  [
    'Конструктор · итоги · 38',
    'Шапка графика: .sb-finish-chart-head { display:flex; align-items:baseline; gap:8px } — 750:1976-1980.',
  ],
  [
    'Конструктор · итоги · 39',
    '«по весу и повторам каждой тренировки»: .sb-finish-chart-head span { flex:1; font:600 11.5px/1.3; color:rgba(var(--ink),.56) } — 750:1982-1986; finish_ui:370.',
  ],
  [
    'Конструктор · итоги · 40',
    'Поле столбиков: .sb-finish-chart { display:flex; align-items:flex-end; gap:6px; height:112px; margin-top:12px } — 750:1994-2001.',
  ],
  [
    'Конструктор · итоги · 41',
    'Колонка графика: .sb-finish-chart-column { flex:1; flex-direction:column; align-items:center; gap:5px } — 750:2003-2011.',
  ],
  [
    'Конструктор · итоги · 42',
    '«88» над столбиком: .sb-finish-chart-column b { font:700 9.5px/1; font-variant-numeric:tabular-nums; color:rgba(var(--ink),.56) } — 750:2013-2018.',
  ],
  [
    'Конструктор · итоги · 43',
    'Столбик н1 высота 41px: .sb-finish-chart-column i { width:100%; border-radius:7px 7px 0 0; background:var(--c2) } — 750:2025-2029; chartHeight() finish_ui:293-298.',
  ],
  [
    'Конструктор · итоги · 44',
    '«н1»: .sb-finish-chart-column small { font:600 9px/1; color:rgba(var(--ink),.56) } — 750:2020-2023; finish_ui:378.',
  ],
  [
    'Конструктор · итоги · 45',
    'Столбик н2 высота 51px: nth-child(2) > i height 51px — тест row 45; chartHeight по series[1].',
  ],
  [
    'Конструктор · итоги · 46',
    'Столбик н3 высота 46px: nth-child(3) > i — тест row 46.',
  ],
  [
    'Конструктор · итоги · 47',
    'Столбик н4 высота 67px: nth-child(4) > i — тест row 47.',
  ],
  [
    'Конструктор · итоги · 48',
    'Столбик н5 высота 62px: nth-child(5) > i — тест row 48.',
  ],
  [
    'Конструктор · итоги · 49',
    '«95» последний столбик: .sb-finish-chart-column.is-latest b { color:var(--ac) } — 750:2031-2034; Math.round(best.oneRm).',
  ],
  [
    'Конструктор · итоги · 50',
    'Столбик н6 78px на --acs: .sb-finish-chart-column.is-latest i { background:var(--acs); height 78px в кадре } — 750:2036-2038.',
  ],
  [
    'Конструктор · итоги · 51',
    '«н6» акцент: .sb-finish-chart-column.is-latest small { color:var(--ac); font:600 9px/1 } — 750:2031-2034.',
  ],
  [
    'Конструктор · итоги · 52',
    'Сноска под графиком: .sb-finish-chart-card p { margin-top:10px; font:500 11px/1.55; color:rgba(var(--ink),.56) } — 750:2040-2044; текст finish_ui:382.',
  ],
  [
    'Конструктор · итоги · 53',
    '«14,2 т» день: .sb-finish-day-total .sb-finish-row b { font-weight:700; font:700 12.5px/1 tabular-nums var(--tx) } — 750:2056-2058; fmtTonnage(dayTonnageKg) finish_ui:389.',
  ],
  [
    'Конструктор · итоги · 54',
    'Список other: section.sb-finish-detail.sb-finish-other { padding:2px 16px; border-radius:20px; background:var(--c1) } — 750:1830-1835; otherRows finish_ui:392-400.',
  ],
  [
    'Конструктор · итоги · 55',
    '«3:00 под нагрузкой»: .sb-finish-other .sb-finish-row b { font:700 12px/1; color:rgba(var(--ink),.55) } — 750:2060-2063; unit time otherVolumeRows finish_ui:220.',
  ],
  [
    'Конструктор · итоги · 56',
    '«2 028 кг в тоннаже»: .sb-finish-other b без .is-quiet { font:700 12px/1; color:var(--tx) } — finish_ui:222; fmtExactKg bodyweight row.',
  ],
  [
    'Конструктор · итоги · 57',
    'Сноска other: .sb-finish-footnote после .sb-finish-other { margin-top:12px; font:500 11px/1.55 rgba(var(--ink),.56) } — 750:2046-2050; finish_ui:401.',
  ],
  [
    'Конструктор · итоги · 58',
    'Кнопки «В шаблоны» в FinishScreen нет: в кадре btn2c с margin-top 12px, но save-flow шаблонов не построен (UI_V4_CODEX_DESIGN_DISCREPANCIES § Б3 — «Шаблоны сняты»); продукт не рисует noop-кнопку. finish-v4-canvas-contract.test.js row 58 исключён.',
  ],
  [
    'Конструктор · итоги · 59',
    '«Готово»: .sb-finish-done { width:100%; min-height:48px; margin-top:9px; border-radius:999px; background:var(--acs); color:var(--on-acs); font:700 13px/1 } — 750:2065-2078; finish_ui:404-407.',
  ],
  [
    'Конструктор · итоги · текст 1/2',
    'Агрегат копии кадра: шапка «Тренировка завершена»+sessionTitle, hero-метрики, detail-строки, ярусы feedback/chart/day-total/other — все якорные строки рендерятся FinishScreen (heys_strength_finish_ui_v1.js:301-407); смоук strength-builder-finish-v4-canvas-contract.test.js.',
  ],
  [
    'Конструктор · итоги · текст 2/2',
    'Агрегат сносок: footnote other-volume, «Готово», причины unmeasured — в finish_ui:337-401; строка «В шаблоны» в продукте отсутствует (см. ·58 ≠, owner-flow шаблонов не построен).',
  ],
];

const zone = readZone('strength-builder');
let changed = 0;

for (const [key, fact] of ITEMS) {
  const row = zone.rows[key];
  if (!row) {
    console.error('нет строки', key);
    process.exit(1);
  }
  const verdict = key === 'Конструктор · итоги · 58' ? '≠' : '=';
  const options = key === 'Конструктор · итоги · 58'
    ? {
      'reason-code': 'owner-decision',
      'decision-ref': 'docs/ui/UI_V4_CODEX_DESIGN_DISCREPANCIES.md#strength-builder-б3-в-шаблоны-не-имеет-owner-flow',
    }
    : {};
  applyVerdictToRow(row, { verdict, fact, options });
  delete row.evidence;
  changed += 1;
}

writeZone('strength-builder', zone);
console.log(`strength-builder B3: ${changed} вердиктов записано`);
