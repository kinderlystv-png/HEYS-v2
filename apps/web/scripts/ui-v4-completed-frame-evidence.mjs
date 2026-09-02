import { PLAN_FEED_DOM_CONTRACTS, PLAN_FEED_FRAME } from './ui-v4-dom-contracts.mjs';

const TESTS = Object.freeze({
  plan: 'apps/web/__tests__/ui-v4-dom-contracts.test.js',
  builder: 'apps/web/__tests__/strength-builder-ui.test.js',
  finish: 'apps/web/__tests__/strength-builder-finish-v4-canvas-contract.test.js',
  normGeometry: 'apps/web/__tests__/norm-correction-canvas-razbor.test.js',
  normCard: 'apps/web/__tests__/norm-correction-weekly-card.test.js',
  normOwner: 'apps/web/__tests__/norm-correction-owner-flow.test.js',
  normVisual: 'apps/web/scripts/ui-v4-visual-capture.mjs',
  registration: 'apps/web/__tests__/registration-v4-contract-sweep.test.js',
  builderCalm: 'apps/web/__tests__/strength-builder-calm-canvas-contract.test.js',
});

function exact(kind, ref, fact) {
  return Object.freeze({ verdict: '=', evidence: Object.freeze([`${kind}: ${ref}`]), fact });
}

function exactMany(evidence, fact) {
  return Object.freeze({ verdict: '=', evidence: Object.freeze(evidence), fact });
}

function unknown(frame) {
  return Object.freeze({
    verdict: '?',
    evidence: Object.freeze([`unsupported: no exact row-level DOM/computed-style/semantic assertion for ${frame}`]),
    fact: 'Точное утверждение строки пока не покрыто построчным DOM/computed-style/semantic evidence; диагностический pixel-diff сам по себе не доказывает совпадение.',
  });
}

const PLAN_ROWS = Object.freeze(Object.fromEntries(PLAN_FEED_DOM_CONTRACTS.map((row) => {
  if (row.assertion) {
    return [row.rowIdentity, exact(row.assertion.kind, TESTS.plan,
      `Построчный ${row.assertion.kind} контракт проверяет точное значение Canvas в изолированном DOM кадра И3.`)];
  }
  if (row.nonAutomatable?.reasonCode === 'intentional-deviation') {
    return [row.rowIdentity, Object.freeze({
      verdict: '≠',
      evidence: Object.freeze([`semantic: ${TESTS.plan}`]),
      fact: row.nonAutomatable.rationale,
      reasonCode: 'logic-invariant',
      decisionRef: row.nonAutomatable.decisionRef,
    })];
  }
  return [row.rowIdentity, unknown('И3')];
})));

function suffixRows(label, verified, kind, ref) {
  return Object.freeze(Object.fromEntries(Object.entries(verified).map(([suffix, fact]) => [
    `${label} · ${suffix}`,
    exact(kind, ref, fact),
  ])));
}

const COLLAPSED_LABEL = 'Конструктор · список свёрнут';
const SUPERSET_LABEL = 'Связка · создание';
const FINISH_LABEL = 'Конструктор · итоги';
const LOWERED_LABEL = 'Сверка · норма снизилась';
const REGISTRATION_PERSONAL_LABEL = 'Регистрация · персональные данные';
const ACTIVE_CALM_LABEL = 'Конструктор · тренировка идёт · спокойнее';
const CATALOG_LABEL = 'Конструктор · каталог';

export const COMPLETED_FRAME_EVIDENCE = Object.freeze([
  Object.freeze({
    zoneId: 'registration', label: REGISTRATION_PERSONAL_LABEL, oid: 'REG1',
    rows: suffixRows(REGISTRATION_PERSONAL_LABEL, {
      12: 'DOM-тест подтверждает весь контракт капсулы колёс: фон, радиус, поля и верхний отступ.',
      23: 'DOM-тест подтверждает точный текст возраста, выключку, шрифт, цвет и верхний отступ под колесом.',
    }, 'computed-style', TESTS.registration),
  }),
  Object.freeze({
    zoneId: 'strength-builder', label: ACTIVE_CALM_LABEL, oid: 'А1б',
    rows: Object.freeze({
      [`${ACTIVE_CALM_LABEL} · 26`]: exactMany([
        `dom: ${TESTS.builder}`,
        `computed-style: ${TESTS.builderCalm}`,
      ], 'DOM и CSS-тест подтверждают точный прошлый подход и спокойную пилюлю на фоне --sb-bg.'),
      [`${ACTIVE_CALM_LABEL} · 27`]: exactMany([
        `dom: ${TESTS.builder}`,
        `computed-style: ${TESTS.builderCalm}`,
      ], 'DOM и CSS-тест подтверждают точный рекорд и акцентный цвет пилюли.'),
    }),
  }),
  Object.freeze({
    zoneId: 'strength-builder', label: CATALOG_LABEL, oid: 'Б2',
    rows: suffixRows(CATALOG_LABEL, {
      '04': 'DOM-тест подтверждает точное имя экрана «Каталог упражнений».',
      14: 'DOM-тест подтверждает наличие строки списка каталога для найденного упражнения.',
      25: 'DOM-тест подтверждает точную сноску о появлении строки создания.',
    }, 'dom', TESTS.builder),
  }),
  Object.freeze({ zoneId: 'strength-builder', label: PLAN_FEED_FRAME.label, oid: PLAN_FEED_FRAME.oid, rows: PLAN_ROWS }),
  Object.freeze({
    zoneId: 'strength-builder', label: COLLAPSED_LABEL, oid: 'А2',
    rows: suffixRows(COLLAPSED_LABEL, {
      17: 'DOM-тест подтверждает точный знак завершённого упражнения «✓».',
      21: 'DOM-тест подтверждает точную строку состояния «раскрыть ›».',
      24: 'DOM-тест подтверждает точное вторичное действие «Добавить упражнение».',
    }, 'dom', TESTS.builder),
  }),
  Object.freeze({
    zoneId: 'strength-builder', label: SUPERSET_LABEL, oid: 'З1',
    rows: suffixRows(SUPERSET_LABEL, {
      24: 'DOM-тест подтверждает точное значение отдыха «2:00».',
      27: 'DOM-тест подтверждает точное резюме трисета и его порядок.',
      30: 'DOM-тест подтверждает точный прогноз «9» подходов.',
      31: 'DOM-тест подтверждает точное главное действие «Собрать связку · 9 подходов».',
    }, 'dom', TESTS.builder),
  }),
  Object.freeze({
    zoneId: 'strength-builder', label: FINISH_LABEL, oid: 'Б3',
    rows: suffixRows(FINISH_LABEL, {
      '04': 'DOM-тест подтверждает точное имя экрана «Тренировка завершена».',
      '13': 'DOM-тест подтверждает точную длительность «54:30».',
      '19': 'DOM-тест подтверждает подпись «Рабочих подходов».',
      '20': 'DOM-тест подтверждает точное число рабочих подходов «19».',
      '21': 'DOM-тест подтверждает точное значение «4 · вне объёма».',
      '22': 'DOM-тест подтверждает точную строку рекорда «Жим лёжа · 75 × 8».',
      '40': 'CSS-контракт подтверждает точную высоту графика 112px.',
      '42': 'DOM-тест подтверждает точное первое значение графика «88».',
      '49': 'DOM-тест подтверждает точное последнее значение графика «95».',
      '53': 'DOM-тест подтверждает точный общий тоннаж «14,2 т».',
      '55': 'DOM-тест подтверждает точное значение времени под нагрузкой «3:00 под нагрузкой».',
      '59': 'DOM-тест подтверждает точное главное действие «Готово».',
    }, 'semantic-test', TESTS.finish),
  }),
  Object.freeze({
    zoneId: 'norm-correction', label: LOWERED_LABEL, oid: 'NC5',
    rows: Object.freeze({
      ...suffixRows(LOWERED_LABEL, {
        '01': 'Live Canvas pair checks the exact header geometry and contents.',
        '02': 'Live Canvas pair checks the exact screen title text and typography.',
        '03': 'Live Canvas pair checks the exact range text and tabular-number typography.',
        '05': 'Live Canvas pair checks the real summary card, 12px top offset and its geometry.',
        '07': 'Live Canvas pair checks the exact explanatory copy for confirmed stable girths.',
        '11': 'Live Canvas pair checks the facts card and its 12px top offset.',
        '12': 'Live Canvas pair checks the exact facts row geometry and typography.',
        '13': 'Live Canvas pair checks the exact primary fact text and color.',
        '15': 'Live Canvas pair checks that the last facts row has no divider.',
        '\u0442\u0435\u043a\u0441\u0442': 'Live Canvas pair checks all 13 text atoms in their exact order.',
      }, 'computed-style', TESTS.normVisual),
      [`${LOWERED_LABEL} \u00b7 07`]: exactMany([
        `computed-style: ${TESTS.normVisual}`,
        `semantic-test: ${TESTS.normOwner}`,
      ], 'The exact copy is rendered only for a versioned curator decision with stable-girth evidence.'),
      [`${LOWERED_LABEL} \u00b7 \u0442\u0435\u043a\u0441\u0442`]: exactMany([
        `computed-style: ${TESTS.normVisual}`,
        `semantic-test: ${TESTS.normOwner}`,
      ], 'Live Canvas pair checks all 13 text atoms; owner-flow tests fail closed on missing evidence.'),
      ...suffixRows(LOWERED_LABEL, {
        '06': 'CSS-контракт подтверждает заголовок 16px/700.',
        '08': 'Разбор Canvas подтверждает baseline и gap hero-блока.',
        '09': 'CSS-контракт подтверждает число 30px/800.',
        '10': 'Разбор Canvas подтверждает типографику подписи снижения.',
        '14': 'Разбор Canvas подтверждает типографику и тон тихого значения.',
        '16': 'Разбор Canvas подтверждает типографику строки факта.',
      }, 'computed-style', TESTS.normGeometry),
      ...suffixRows(LOWERED_LABEL, {
        '17': 'CSS/semantic-тест подтверждает главное действие и колонку действий.',
        '18': 'CSS/semantic-тест подтверждает вторичное действие в колонке.',
        '19': 'CSS-тест подтверждает отступ и типографику сноски.',
      }, 'semantic-test', TESTS.normCard),
      ...suffixRows(LOWERED_LABEL, {
        '06': 'Live Canvas pair checks the exact title and its typography.',
        '08': 'Live Canvas pair checks baseline alignment, 10px gap and 14px top offset.',
        '09': 'Live Canvas pair checks the exact hero value and 30px/800 typography.',
        '10': 'Live Canvas pair checks the exact delta, 12px/700 typography and bad-value color.',
        '14': 'Live Canvas pair checks the quiet value typography and color.',
        '16': 'Live Canvas pair checks the final fact text and typography.',
        '17': 'Live Canvas pair checks the primary action and 14px top offset.',
        '18': 'Live Canvas pair checks the secondary action and 9px top offset.',
        '19': 'Live Canvas pair checks the exact footnote text, offset and typography.',
      }, 'computed-style', TESTS.normVisual),
    }),
  }),
]);

export function materializeCompletedFrameEvidence(canvasRows) {
  const byIdentity = new Map(canvasRows.map((row) => [row.identity, row]));
  return COMPLETED_FRAME_EVIDENCE.flatMap((frame) => {
    const rows = canvasRows.filter((row) => row.identity.startsWith(`${frame.label} · `));
    return rows.map((row) => ({
      zoneId: frame.zoneId,
      frame: frame.label,
      oid: frame.oid,
      rowIdentity: row.identity,
      canvasValue: row.value,
      ...(frame.rows[row.identity] || unknown(frame.oid)),
    }));
  }).filter((entry) => byIdentity.has(entry.rowIdentity));
}
