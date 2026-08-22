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
 *  - `HEYS.InsulinWave.getPreviousDayTrainings` — вчерашние тренировки он ищет
 *    через `lsGet`. Калорийный путь нормы его не зовёт: `HEYS.dayNorm.resolve`
 *    и `calculateNDTEDayAverage` по `{ date }`. Волна по-прежнему может взять
 *    живой `hoursSince` из `getPreviousDayTrainings`.
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
  // InsulinWave грузится цепочкой в том же порядке, что в
  // scripts/legacy-bundle-config.mjs: shim заводит `__internals`, constants
  // вешает туда NDTE, utils дополняет хелперами и молча выходит, если constants
  // ещё не загружен. Наружу сервер берёт их через `insulinWaveInternals()`:
  // публично constants поднимает `calculateNDTE`, `calculateNDTEDayAverage` и
  // `getPreviousDayTrainings` (их ищет `heys_tdee_v1.js`), utils — `utils`.
  'heys_iw_shim.js',
  'heys_iw_constants.js',
  'heys_iw_utils.js',
  'heys_tdee_v1.js',
  'heys_day_calculations.js',
  // Норма загрузочного дня: одна строка формулы, но своя копия константы 0.35
  // разошлась бы с приложением молча.
  'heys_refeed_v1.js',
  // Долг и перебор: ~180 строк, которые сервер не имеет права переписывать
  // своими словами. Раньше он их не считал вовсе и брал готовое число из кэша
  // отрисовки — отсюда и протухшая норма.
  'heys_day_caloric_debt_core_v1.js',
  'heys_day_norm_v1.js',
  // Тоннаж силовых и модель нагрузки (Банистер) — для оценки тренировки
  // (TRAINING_LOAD_MODEL_PROMPT.md). Путь с подкаталогом сохранён как в
  // apps/web/_kernel/, чтобы source/mirror пути совпадали буквально.
  '_kernel/heys_kernel_strength_v1.js',
  '_kernel/heys_kernel_load_v1.js',
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
  // Инертный `document` — только ради `heys_refeed_v1.js`: его расчётная часть
  // чистая, но в конце файла стоит регистрация UI-шага по DOM-ready.
  // `readyState: 'loading'` + пустой слушатель заставляют её припарковаться и
  // никогда не выполниться, а функции при этом экспортируются. Расширять этот
  // заглушечный DOM нельзя: если зеркалу понадобится настоящий документ, значит
  // в зеркала тянут UI, а туда им нельзя.
  vm.runInContext(
    "globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {} };",
    sandbox,
  );

  for (const file of MIRRORED_FILES) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: `web-mirror/${file}` });
  }

  const HEYS = vm.runInContext('globalThis.HEYS', sandbox);
  if (!HEYS || !HEYS.TDEE || !HEYS.dayCalculations || !HEYS.dayCaloricDebtCore
    || !HEYS.TrainingKernel?.strength || !HEYS.TrainingKernel?.load) {
    throw new Error('web-mirror: зеркала apps/web загрузились без HEYS.TDEE/HEYS.dayCalculations/HEYS.TrainingKernel');
  }
  if (!HEYS.dayNorm || typeof HEYS.dayNorm.resolve !== 'function') {
    throw new Error('web-mirror: зеркала загрузились без HEYS.dayNorm.resolve');
  }
  // Цепочка iw-модулей молча выходит, если shim не загрузился первым: без этой
  // проверки NDTE тихо станет нулём, и норма поедет вниз без единой ошибки.
  if (!HEYS.InsulinWave || !HEYS.InsulinWave.__internals || !HEYS.InsulinWave.__internals.calculateNDTE) {
    throw new Error('web-mirror: цепочка heys_iw_* загрузилась без __internals.calculateNDTE');
  }
  cached = HEYS;
  return cached;
}

/** `HEYS.TDEE.calculate` из apps/web/heys_tdee_v1.js. */
function calculateTDEE(dayData, profile, options) {
  return loadHeys().TDEE.calculate(dayData, profile, options);
}

/** `HEYS.dayCaloricDebtCore.computeDebtCore` из apps/web/heys_day_caloric_debt_core_v1.js. */
function computeDebtCore(ctx) {
  return loadHeys().dayCaloricDebtCore.computeDebtCore(ctx);
}

/** `HEYS.Refeed.getRefeedOptimum` из apps/web/heys_refeed_v1.js — норма загрузочного дня. */
function getRefeedOptimum(optimum, isRefeedDay) {
  const refeed = loadHeys().Refeed;
  if (!refeed || typeof refeed.getRefeedOptimum !== 'function') return optimum;
  return refeed.getRefeedOptimum(optimum, isRefeedDay);
}

/** `HEYS.dayCalculations.computeDailyNorms` из apps/web/heys_day_calculations.js. */
function computeDailyNorms(optimum, normPerc, ctx) {
  return loadHeys().dayCalculations.computeDailyNorms(optimum, normPerc, ctx);
}

/**
 * `HEYS.TrainingKernel.strength.trainingTonnage` из
 * apps/web/_kernel/heys_kernel_strength_v1.js. `opts.bodyWeightKg` нужен
 * упражнениям со своим весом: без массы тела они остаются непосчитанными.
 */
function trainingTonnage(training, opts) {
  return loadHeys().TrainingKernel.strength.trainingTonnage(training, opts);
}

/** `HEYS.TrainingKernel.strength.dayTonnage` из apps/web/_kernel/heys_kernel_strength_v1.js. */
function dayTonnage(dayBlob, opts) {
  return loadHeys().TrainingKernel.strength.dayTonnage(dayBlob, opts);
}

/**
 * `HEYS.TrainingKernel.strength.validateApproach` — правила подхода (тип,
 * довес, ступени дроп-сета) живут в ядре в одном экземпляре: второй набор
 * условий на стороне коннектора разошёлся бы с приложением молча.
 */
function validateApproach(approach, ctx) {
  return loadHeys().TrainingKernel.strength.validateApproach(approach, ctx);
}

/** `HEYS.TrainingKernel.strength.normalizeApproach` из того же модуля ядра. */
function normalizeApproach(approach) {
  return loadHeys().TrainingKernel.strength.normalizeApproach(approach);
}

/**
 * `HEYS.TrainingKernel.strength.validateSupersetLayout` — смежность участников
 * связки и её минимальный размер. Раунд выводится из позиции, поэтому
 * разорванная связка молча перестаёт давать раунды.
 */
function validateSupersetLayout(exercises) {
  return loadHeys().TrainingKernel.strength.validateSupersetLayout(exercises);
}

/**
 * `HEYS.TrainingKernel.strength.applyPlanEdit` из
 * apps/web/_kernel/heys_kernel_strength_v1.js — правка куратора поверх
 * начатой тренировки. Правила «что можно тронуть, а что нет» живут в ядре в
 * одном экземпляре: свой набор условий на сервере разошёлся бы с тем, что
 * клиент показывает человеку на экране разбора.
 */
function applyPlanEdit(liveExercises, proposedExercises) {
  return loadHeys().TrainingKernel.strength.applyPlanEdit(liveExercises, proposedExercises);
}

/** `HEYS.TrainingKernel.strength.hasDoneApproach` из apps/web/_kernel/heys_kernel_strength_v1.js. */
function hasDoneApproach(exercise) {
  return loadHeys().TrainingKernel.strength.hasDoneApproach(exercise);
}

/** `HEYS.TrainingKernel.load.sessionLoad` из apps/web/_kernel/heys_kernel_load_v1.js. */
function sessionLoad(training, zoneMets) {
  return loadHeys().TrainingKernel.load.sessionLoad(training, zoneMets);
}

/**
 * `HEYS.TrainingKernel.load.isNotPerformedTraining` из
 * apps/web/_kernel/heys_kernel_load_v1.js — запись назначена куратором, но ещё
 * не выполнена. Экспортируется отдельно, потому что серверные счётчики считают
 * тренировки в обход `sessionLoad`/`dayTonnage`, а второй экземпляр условия
 * разошёлся бы с ядром молча.
 */
function isNotPerformedTraining(training) {
  return loadHeys().TrainingKernel.load.isNotPerformedTraining(training);
}

/** `HEYS.TrainingKernel.load.fitnessFatigue` из apps/web/_kernel/heys_kernel_load_v1.js. */
function fitnessFatigue(dailyLoads, opts) {
  return loadHeys().TrainingKernel.load.fitnessFatigue(dailyLoads, opts);
}

/** `HEYS.dayNorm.resolve` из apps/web/heys_day_norm_v1.js. */
function resolveDayNorm(day, profile, opts) {
  return loadHeys().dayNorm.resolve(day, profile, opts);
}

/** `HEYS.InsulinWave.__internals` — NDTE и его хелперы.
 *
 * Публично цепочка поднимает лишь то, что ищут другие модули приложения
 * (`calculateNDTE`, `getPreviousDayTrainings`, `utils`); остальное наружу
 * отдаёт оркестратор, которого в зеркалах нет (он тянет UI). Берём
 * `__internals`, потому что серверу нужны и хелперы тоже, а публичные ключи —
 * те же ссылки. `calculateNDTE` среди них чистая.
 */
function insulinWaveInternals() {
  const iw = loadHeys().InsulinWave;
  return (iw && iw.__internals) || null;
}

module.exports = {
  MIRRORED_FILES,
  SOURCE_DIR,
  calculateTDEE,
  computeDailyNorms,
  computeDebtCore,
  resolveDayNorm,
  getRefeedOptimum,
  insulinWaveInternals,
  trainingTonnage,
  dayTonnage,
  validateApproach,
  normalizeApproach,
  validateSupersetLayout,
  applyPlanEdit,
  hasDoneApproach,
  sessionLoad,
  isNotPerformedTraining,
  fitnessFatigue,
};
