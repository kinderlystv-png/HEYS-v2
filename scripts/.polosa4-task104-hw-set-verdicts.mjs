#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SET = path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs');

const RAZBOR_66_FACT =
  'heys_widgets_ui_v1.js:7386 renderWeightDynamicsTileComposition — лист sheetPreview и Главная full рисуют один .widget-wd__curve-row; polosa4-task96-weight-tile-composition.test.js computed: justify-content space-between, flex row, hasSpark/sparkBeforeDelta на обоих; 730-widgets-dashboard.css:13614-13618';

const RAZBOR_KEYS = [
  'Разбор · Калории · 66',
  'Разбор · Вода · 66',
  'Разбор · Вес · 66',
  'Разбор · Сон · 66',
  'Разбор · Инсулиновая волна · 66',
  'Разбор · БЖУ · 66',
  'Разбор · Оценка дня · 66',
  'Разбор · Риск-радар · 66',
  'Разбор · Тренд здоровья · 66',
  'Разбор · Карта активности · 66',
  'Разбор · Динамика веса · 66',
  'Разбор · Клетчатка · 66',
  'Разбор · Белок · 66',
  'Разбор · Окно до сна · 66',
  'Разбор · Качество еды · 66',
  'Разбор · Ритм приёмов · 66',
  'Разбор · Готовность ко сну · 66',
];

const PACKAGE_36 = [
  [
    'удаление',
    '=',
    '730-widgets-dashboard.css:13418-13437 — кружок 22 px видимым, ::after 44 pt; единственное именованное исключение из правила тач-целей (контракт пакет 36)',
  ],
  [
    'вид капсулы',
    '=',
    '000-base-and-gamification.css:8038-8124 date-picker--v4 (стрелки 44×44, пилюля min-height 44px); 730-widgets-dashboard.css не переопределяет — источник date-remainders.v4.dc.html',
  ],
  [
    'тач-цели',
    '=',
    '000-base-and-gamification.css:8050-8124 — nav 44×44 и trigger min-height 44px видимым, без ::after-расширителя; удаление — исключение 730-widgets-dashboard.css:13430-13437; ui-v4-check-touch-target-visible.mjs --check',
  ],
];

function setVerdict(key, verdict, fact) {
  const result = spawnSync(
    process.execPath,
    [SET, 'home-widgets', key, verdict, fact],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`set-verdict failed for ${key}`);
  }
  process.stdout.write(result.stdout);
}

for (const key of RAZBOR_KEYS) {
  setVerdict(key, '=', RAZBOR_66_FACT);
}

for (const [key, verdict, fact] of PACKAGE_36) {
  setVerdict(key, verdict, fact);
}

console.log(`done: ${RAZBOR_KEYS.length} razbor-66 + ${PACKAGE_36.length} package-36`);
