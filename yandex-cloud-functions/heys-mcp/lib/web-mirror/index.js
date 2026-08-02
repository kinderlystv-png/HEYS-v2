'use strict';

/**
 * Зеркала расчётных модулей приложения — второго источника правды быть не должно.
 *
 * Файлы рядом (`heys_tdee_v1.js`, `heys_cycle_v1.js`, `heys_day_calculations.js`)
 * — **побайтовые копии** одноимённых файлов из `apps/web/`. Их нельзя править
 * здесь: расхождение ловит `scripts/lint-heys-mcp-web-mirror.mjs` и тест
 * «зеркала apps/web совпадают побайтово» в `__tests__/day.test.cjs`. Правка
 * идёт в `apps/web/`, потом `cp` сюда.
 *
 * Почему копия, а не переписанная от руки формула: норма калорий и перевод
 * процентов в граммы — это то, что клиент видит на экране. Своя реализация
 * разошлась бы с приложением молча, и куратор сравнивал бы съеденное с чужой
 * нормой.
 *
 * Почему vm, а не require: `heys_day_calculations.js` кончается на `})(window)`
 * без Node-фолбэка, а остальные вешают `HEYS` на глобальный объект. Заводить
 * ради этого `globalThis.window` в облачной функции нельзя — по этой проверке
 * библиотеки отличают браузер от сервера. Песочница vm даёт файлам их `window`,
 * не трогая глобал функции.
 *
 * Чего в песочнице нет и чего это стоит:
 *  - `HEYS.InsulinWave` (NDTE, надбавка за вчерашнюю тренировку) — живёт в
 *    `heys_iw_constants.js` на 2900+ строк, и `hoursSince` там считается по
 *    локальным часам браузера в момент просмотра, то есть серверу недоступен в
 *    принципе. `calculateTDEE` зовётся с `includeNDTE: false`;
 *  - `HEYS.TEF` — в `computeDailyNorms` есть фолбэк на белок 3 / углеводы 4 /
 *    жир 9, и это ровно значения `ATWATER` из `apps/web/heys_tef_v1.js:25-29`,
 *    так что путь без TEF даёт те же граммы. На `optimum` TEF не влияет вовсе.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * Порядок важен: `heys_tdee_v1.js` читает `HEYS.Cycle` в момент вызова, а
 * `heys_day_calculations.js` — `HEYS.dayUtils`/`HEYS.models` в момент загрузки.
 */
const MIRRORED_FILES = [
  'heys_cycle_v1.js',
  'heys_tdee_v1.js',
  'heys_day_calculations.js',
];

/** Побайтовый оригинал каждого зеркала — от корня репозитория. */
const SOURCE_DIR = 'apps/web';

let cached = null;

function loadHeys() {
  if (cached) return cached;

  const sandbox = vm.createContext({ console });
  // Файлы писались под браузер: им нужен объект окна, и они же кладут на него
  // `HEYS`. Самоссылку ставим изнутри контекста, чтобы `window === globalThis`
  // песочницы, а не сырой объект-заготовка.
  vm.runInContext('globalThis.window = globalThis; globalThis.global = globalThis;', sandbox);

  for (const file of MIRRORED_FILES) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: `web-mirror/${file}` });
  }

  const HEYS = vm.runInContext('globalThis.HEYS', sandbox);
  if (!HEYS || !HEYS.TDEE || !HEYS.dayCalculations) {
    throw new Error('web-mirror: зеркала apps/web загрузились без HEYS.TDEE/HEYS.dayCalculations');
  }
  cached = HEYS;
  return cached;
}

/** `HEYS.TDEE.calculate` из apps/web/heys_tdee_v1.js. */
function calculateTDEE(dayData, profile, options) {
  return loadHeys().TDEE.calculate(dayData, profile, options);
}

/** `HEYS.dayCalculations.computeDailyNorms` из apps/web/heys_day_calculations.js. */
function computeDailyNorms(optimum, normPerc) {
  return loadHeys().dayCalculations.computeDailyNorms(optimum, normPerc);
}

module.exports = {
  MIRRORED_FILES,
  SOURCE_DIR,
  calculateTDEE,
  computeDailyNorms,
};
