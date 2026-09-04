import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const ITEMS = [
  [
    'вид · связка раундами',
    'SupersetBlock (heys_strength_superset_ui_v1.js:96-186): шапка .sb-ss-top с ttl/key/badge; ряд .sb-ss-member-row карточек на --c2; строки .sb-round с меткой Рn и клетками .sb-cell; текущий раунд .sb-round-num.is-current + .sb-cell.is-current inset 2px --acs; прочерк .is-blank dashed; список .sb-ss-detail (разминка/отдых); сноска .sb-ss-footnote — 750-strength-builder.css:505-680.',
  ],
  [
    'Связка · раунды · 01',
    'Шапка кадра: .sb-ss-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:16px 18px 0 } — 750-strength-builder.css:513-519; finish_ui-паттерн шапки.',
  ],
  [
    'Связка · раунды · 02',
    'Колонка заголовка: .sb-ss-title-col { flex:1; min-width:0; flex-direction:column; gap:3px } — 750:521-527; тест row 02.',
  ],
  [
    'Связка · раунды · 03',
    'Имя «Связка · N упражнения»: title в SupersetBlock через ruPlural — heys_strength_superset_ui_v1.js:103-105, .sb-ss-ttl 750:529-532.',
  ],
  [
    'Связка · раунды · 04',
    'Ключ «по X подхода · Y раунда»: .sb-ss-key из rounds.length + ruPlural — superset_ui:108-112, CSS 750:534-537.',
  ],
  [
    'Связка · раунды · 05',
    'Пилюля «связка»: span.sb-ss-badge { background:var(--acs); color:var(--on-acs); font:700 10px/1 uppercase } — 750:539-548; superset_ui:114.',
  ],
  [
    'Связка · раунды · 06',
    'Прокрутка: .sb-ss-scroll { display:flex; flex-direction:column; padding:6px 18px calc(18px+safe) } — 750:556-560.',
  ],
  [
    'Связка · раунды · 07',
    'Карточка .grp: .sb-ss-grp { margin-top:12px } — 750:562-564; обёртка memberRow+roundRows.',
  ],
  [
    'Связка · раунды · 08',
    'Ряд участников: .sb-ss-member-row { display:flex; gap:6px } — 750:566-569.',
  ],
  [
    'Связка · раунды · 09',
    'Карточка участника: .sb-ss-member-card { flex:1; flex-direction:column; gap:2px; padding:8px 9px; border-radius:12px; background:var(--c2) } — 750:571-579.',
  ],
  [
    'Связка · раунды · 10',
    'Буква «A»: .sb-ss-member-card i { font:700 10px/1; color:var(--ac) } — 750:581-585; memberLetter() superset_ui:59-61.',
  ],
  [
    'Связка · раунды · 11',
    'Имя упражнения: .sb-ss-member-card span { font:600 11px/1.2; color:var(--tx) } — 750:587-590.',
  ],
  [
    'Связка · раунды · 12',
    'Первая строка раунда: .sb-round--first { margin-top:12px; border-bottom:none } — 750:599-601.',
  ],
  [
    'Связка · раунды · 13',
    '«Р1»: .sb-round-num { width:36px; font:700 10.5px/1 uppercase; color:rgba(var(--ink),.56) } — 750:607-613.',
  ],
  [
    'Связка · раунды · 14',
    'Клетка «75 × 8»: .sb-cell { flex:1; min-height:44px; border-radius:999px; background:var(--bg); box-shadow:inset 0 0 0 1px rgba(var(--ink),.1); color:var(--tx) } — 750:619-632; roundCellLabel().',
  ],
  [
    'Связка · раунды · 15',
    'Следующий раунд: .sb-round--spaced { margin-top:6px; border-bottom:none } — 750:603-605.',
  ],
  [
    'Связка · раунды · 16',
    'Текущий раунд «Р3»: .sb-round-num.is-current { color:var(--ac) } — 750:615-617; currentRoundIndex() superset_ui:78-94.',
  ],
  [
    'Связка · раунды · 17',
    'Активная клетка: .sb-cell.is-current { box-shadow:inset 0 0 0 2px var(--acs) } — 750:634-636; activeCell в superset_ui:137-145.',
  ],
  [
    'Связка · раунды · 18',
    'Прочерк: .sb-cell.is-blank { border:1.5px dashed rgba(var(--ink),.22); border-radius:999px; min-height:44px } — 750:645-651.',
  ],
  [
    'Связка · раунды · 19',
    'Список .cd: .sb-ss-detail { margin-top:10px } — 750:653-655.',
  ],
  [
    'Связка · раунды · 20',
    'Строка списка: .sb-ss-detail-row { display:flex; justify-content:space-between; padding:13px 0; border-bottom:1px solid rgba(var(--ink),.07) } — 750:657-665.',
  ],
  [
    'Связка · раунды · 21',
    '«Разминка связки»: span в .sb-ss-detail-row, color var(--tx) — superset_ui:175-178 при group.warmupCount>0.',
  ],
  [
    'Связка · раунды · 22',
    '«одной строкой, вне объёма»: .sb-ss-detail-note { font:600 11px/1; color:rgba(var(--ink),.56) } — 750:671-674.',
  ],
  [
    'Связка · раунды · 23',
    'Строка без разделителя: .sb-ss-detail-row--last { border-bottom:none } — 750:667-669.',
  ],
  [
    'Связка · раунды · 24',
    '«2:00» отдых: .sb-ss-detail-row b { font:700 12.5px/1 tabular-nums; color:var(--tx) } — 750:676-680; fmtClock(group.restSec) superset_ui:181.',
  ],
  [
    'Связка · раунды · 25',
    'Сноска про равное число подходов: p.sb-ss-footnote { margin-top:10px; font:500 11px/1.55 rgba(var(--ink),.56) } — 750:682-686; текст superset_ui:184-187.',
  ],
  [
    'Связка · раунды · текст',
    'Агрегат копии кадра В1: ttl/key/badge, буквы A–C, имена упражнений, метки Р1–Р4, клетки вес×повторы/сек, «Разминка связки», «Отдых после раунда»+fmtClock, сноска про равные подходы — все строки рендерит SupersetBlock (superset_ui:96-187).',
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
  applyVerdictToRow(row, { verdict: '=', fact, options: {} });
  delete row.evidence;
  changed += 1;
}

writeZone('strength-builder', zone);
console.log(`strength-builder B1 rounds: ${changed} вердиктов записано`);
