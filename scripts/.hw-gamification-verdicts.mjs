#!/usr/bin/env node
import { patchZoneRow } from './lib/ui-v4-verdicts.mjs';

const G = '.game-v4-sheet__';
const nav = 'строка «границы» отдаёт нижнее меню продукту — сводит app-nav, не лист геймификации';
const razbor = 'сверено gamification-v4-canvas-razbor.test.js: пара «элемент кадра → правило продукта»';
const geom = 'сверено gamification-v4-canvas-geometry.test.js: класс кадра → класс продукта';

const updates = {
  'вид строки уровня в списке': {
    v: '=',
    f: `${G}ladder-row + renderLadderCheckMark (screens:674-687,1007-1022): номер и титул одной строкой «N · Титул», галочка 12×12 обводкой 3 px тоном --v4-ok-text, будущие — ${G}ladder-mark--spacer 12 px; порог XP — ${G}ladder-xp на --v4-ink-data 56 %, текущая — вес 700, разделитель 1 px 7 % (000-base:18528-18574)`,
  },
  'Геймификация · обзор · 34': { v: '—', f: nav },
  'Геймификация · обзор · 35': { v: '—', f: nav },
  'Геймификация · обзор · 36': { v: '—', f: nav },
  'Геймификация · обзор · 37': { v: '—', f: nav },
  'Геймификация · обзор · 38': { v: '—', f: nav },
  'Геймификация · обзор · текст': {
    v: '—',
    f: 'сводная строка смешивает product copy, аннотации и нижнюю навигацию; после решения «слова на экране» проверяется по отдельным атомам, как у «первый день · текст»',
  },
};

const ceremonyLadder = {
  13: { v: '=', f: `${G}tier (000-base:18071) — 10/700 капителью; текст «Лестница» — screens:998` },
  16: { v: '=', f: `${G}ladder-row.is-past ${G}ladder-title — 600 12,5/1 тоном --v4-ink-3 (45 %); кадр «15 · Эксперт»` },
  17: { v: '=', f: `${G}ladder-xp — flex none, 11,5/600 tabular, var(--v4-ink-data) 56 %` },
  18: {
    v: '≠',
    f: `кадр рисует строку space-between/baseline; ${G}ladder-row — center, зазор 13, титул flex 1 — тот же вид; поля 13/0 и разделитель совпадают (${razbor})`,
  },
  19: { v: '=', f: `${G}ladder-row.is-current ${G}ladder-title — 700 12,5/1 тоном --v4-sand-ink; кадр «17 · Эксперт»` },
};

for (const ms of ['0 мс', '420 мс', '1200 мс', '1600 мс']) {
  for (const [n, row] of Object.entries(ceremonyLadder)) {
    updates[`Новый уровень · ${ms} · ${n.padStart(2, '0')}`] = row;
  }
  updates[`Новый уровень · ${ms} · текст`] = {
    v: '=',
    f: 'копия совпадает: «Уровни», «Уровень», «Лестница», титул «Эксперт» и пороги ступеней — screens:929,998,1019-1022; пакет 3 сентября убрал «Ступени» и «Наставник»',
  };
}

updates['Новый уровень · 0 мс · 09'] = {
  v: '=',
  f: `${G}hero-unit — 12/600 тоном --v4-ink-4; до переката титул ceremony.fromTitle (screens:903-906)`,
};

const levels = {
  16: { v: '=', f: `${G}ladder-row.is-past ${G}ladder-title — 600 12,5/1, --v4-ink-3 (45 %); кадр «15 · Эксперт» (${razbor})` },
  17: { v: '=', f: `${G}ladder-xp — flex none, 11,5/600 tabular, var(--v4-ink-data) 56 % (${razbor})` },
  18: { v: '=', f: `${G}ladder-row.is-current ${G}ladder-title — 700 12,5/1, --v4-sand-ink; кадр «18 · Эксперт · сейчас» (${razbor})` },
  19: { v: '=', f: `${G}ladder-mark--spacer — flex none, ширина 12 px (000-base:18541-18550)` },
  20: { v: '=', f: `${G}ladder-row — center, зазор 13, поля 13/0, min-height 44 (000-base:18528-18535)` },
  21: { v: '=', f: `${G}mult-card — фон --v4-ok-bg (кадровое --gr-bg), радиус 20 (000-base:18576-18578)` },
  22: { v: '=', f: `${G}card-head — space-between, baseline, зазор 12 (000-base:18211-18216)` },
  23: {
    v: '≠',
    f: `${G}card-title — 13/700, line-height 1.3 против 1 в кадре: заголовок однострочный, тот же класс несёт миссии с переносом`,
  },
  24: { v: '=', f: `${G}card-xp--ok — flex none, 11,5/700 тоном --v4-sand-ok-text; причина — screens:1033-1035` },
  25: {
    v: '=',
    f: `${G}card-sub--mult — margin-top 8, line-height 1.45, data 56 % (000-base:18248-18251); текст — screens:1037-1038`,
  },
  26: { v: '=', f: `${G}xp-row — center, space-between, зазор 12, поля 13/0, разделитель 7 % (000-base:18580-18590)` },
  27: { v: '=', f: `${G}xp-label — тон --v4-ink-2 (55 %); подпись «День выполнен» из XP_ACTIONS (screens:1013)` },
  28: { v: '=', f: `${G}xp-value — flex none, 11,5/600, var(--v4-ink-data) 56 %; «+50 · ещё нет» собирает xpRowStatus` },
  29: { v: '=', f: `${G}xp-row:last-child — border-bottom 0 (000-base:18592-18594)` },
  30: {
    v: '≠',
    f: 'кадр даёт сноску «Работают все 17 действий…» под таблицей; продукт не рисует отдельный блок — правило «длина таблицы» (XP_ROWS_VISIBLE=8) и кнопка раскрытия закрывают смысл без этой фразы',
  },
  31: { v: '—', f: nav },
  32: { v: '—', f: nav },
  33: { v: '—', f: nav },
  34: { v: '—', f: nav },
  35: { v: '—', f: nav },
  'рисунок 03': {
    v: '=',
    f: 'renderLadderCheckMark (screens:674-687) — svg 12×12 viewBox 0 0 24 24, stroke-width 3, тон --v4-ok-text через currentColor',
  },
  'рисунок 04': { v: '=', f: 'тот же путь M5 13l4 4L19 7 в renderLadderCheckMark (screens:687)' },
  'рисунок 05': { v: '—', f: nav },
  'рисунок 06': { v: '—', f: nav },
  'рисунок 07': { v: '—', f: nav },
  'рисунок 08': { v: '—', f: nav },
  'рисунок 09': { v: '—', f: nav },
  'текст 1/2': {
    v: '≠',
    f: 'копия множителя: продукт даёт «серия ×N» в шапке (screens:388) и «Дальше: …» отдельной строкой (screens:1042), а не «серия ×2,5 через два дня» одной фразой; пояснение — screens:1037-1038 вместо числового примера кадра. Остальное совпадает: «Лестница», пороги LEVEL_XP_THRESHOLDS, xpRowStatus',
  },
};

for (const [n, row] of Object.entries(levels)) {
  const key = n.startsWith('рисунок') || n.startsWith('текст')
    ? `Уровни · ${n}`
    : `Уровни · ${n}`;
  updates[key] = row;
}

let changed = 0;
for (const [key, row] of Object.entries(updates)) {
  patchZoneRow('gamification', key, (live) => {
    if (live.v !== '?' && live.v !== row.v) {
      console.warn('overwrite', key, live.v, '->', row.v);
    }
    live.v = row.v;
    live.f = row.f;
  });
  changed += 1;
}
console.log(`updated ${changed} verdict rows`);
