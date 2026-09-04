#!/usr/bin/env node
import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const F30 =
  'heys_widgets_ui_v1.js:3191-3192 .widget-v4-val--good «3 приёма»; 730-widgets-dashboard.css:11749-11753,10787-10789 — 700 9.5px/1, --v4-sand-ok-text (= var(--gr)): sand+blue rgb(92,106,69)';

const F31 =
  'heys_widgets_ui_v1.js:3193 .widget-v4-muted «под волной 6:20»; 730-widgets-dashboard.css:11749-11753,10947-10951 — 700 9.5px/1, --v4-ink-data: sand rgba(0,0,0,.56), blue rgba(16,24,38,.64)';

const BREAKDOWNS = [
  'Разбор · Калории',
  'Разбор · Вода',
  'Разбор · Вес',
  'Разбор · Сон',
  'Разбор · Шаги',
  'Разбор · Инсулиновая волна',
  'Разбор · БЖУ',
  'Разбор · Оценка дня',
  'Разбор · Риск-радар',
  'Разбор · Тренд здоровья',
  'Разбор · Карта активности',
  'Разбор · Динамика веса',
  'Разбор · Клетчатка',
  'Разбор · Белок',
  'Разбор · Окно до сна',
  'Разбор · Качество еды',
  'Разбор · Ритм приёмов',
  'Разбор · Готовность ко сну',
];

const ROWS = [
  ['Главная · дефолтная раскладка · 30', F30],
  ['Главная · дефолтная раскладка · 31', F31],
  ...BREAKDOWNS.flatMap((prefix) => [
    [`${prefix} · 31`, F30],
    [`${prefix} · 32`, F31],
  ]),
];

let applied = 0;
for (const [key, fact] of ROWS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) {
    console.log(`${key}  skip (${result.was.v})`);
    continue;
  }
  applied += 1;
  console.log(`${key}  ? → =`);
}
console.log(`applied ${applied}`);
