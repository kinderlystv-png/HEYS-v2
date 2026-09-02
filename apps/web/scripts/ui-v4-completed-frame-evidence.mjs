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
const ACTIVE_CALM_PROVEN_SUFFIXES = Object.freeze(
  Array.from({ length: 48 }, (_, index) => String(index + 1).padStart(2, '0'))
    .filter((suffix) => suffix !== '11')
);
const COLLAPSED_PROVEN_SUFFIXES = Object.freeze([
  ...Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, '0')),
  'текст',
]);
const COLLAPSED_ROWS = Object.freeze(Object.fromEntries(COLLAPSED_PROVEN_SUFFIXES.map((suffix) => [
  `${COLLAPSED_LABEL} · ${suffix}`,
  suffix === 'текст'
    ? exact('dom', TESTS.builderCalm,
      'Rendered DOM тест доказывает точную составную строку текста А2.')
    : exactMany([
      `dom: ${TESTS.builderCalm}`,
      `computed-style: ${TESTS.builderCalm}`,
    ], `Table-driven rendered DOM/computed-style тест доказывает точный контракт строки А2 · ${suffix}.`),
])));
const ACTIVE_CALM_ROWS = Object.freeze({
  ...Object.fromEntries(ACTIVE_CALM_PROVEN_SUFFIXES.map((suffix) => [
    `${ACTIVE_CALM_LABEL} · ${suffix}`,
    exactMany([
      `dom: ${TESTS.builderCalm}`,
      `computed-style: ${TESTS.builderCalm}`,
    ], `Table-driven rendered DOM/computed-style тест доказывает точный контракт строки А1б · ${suffix}.`),
  ])),
  ...Object.fromEntries(['текст 1/2', 'текст 2/2'].map((suffix) => [
    `${ACTIVE_CALM_LABEL} · ${suffix}`,
    exact('dom', TESTS.builderCalm,
      `Rendered DOM тест доказывает точную составную строку текста А1б · ${suffix}.`),
  ])),
  [`${ACTIVE_CALM_LABEL} · 11`]: Object.freeze({
    verdict: '?',
    evidence: Object.freeze([
      'unsupported: active strength builder has no reorder owner, persistence contract, touch flow or keyboard flow',
      'designer-discrepancy: docs/ui/UI_V4_CODEX_DESIGN_DISCREPANCIES.md#strength-builder-а1б-и-а2-противоречат-друг-другу-по-ручкам-переноса',
    ]),
    fact: 'Canvas А1б требует drag-handle «⠿», соседний А2 его не показывает, а product-flow не умеет сохранять новый порядок; декоративный affordance не считается совпадением.',
  }),
});
const FINISH_PROVEN_SUFFIXES = Object.freeze([
  ...Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(2, '0')),
  ...Array.from({ length: 31 }, (_, index) => String(index + 27).padStart(2, '0')),
  '59',
]);
const FINISH_ROWS = Object.freeze(Object.fromEntries(FINISH_PROVEN_SUFFIXES.map((suffix) => [
  `${FINISH_LABEL} · ${suffix}`,
  exactMany([
    `dom: ${TESTS.finish}`,
    `computed-style: ${TESTS.finish}`,
  ], suffix === '56'
    ? 'Точная строка «2 028 кг в тоннаже» доказана; конфликт соседних missing-строк 25/26 этим не снят.'
    : `Table-driven DOM/computed-style тест доказывает точный контракт строки Б3 · ${suffix}.`),
])));

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
    rows: ACTIVE_CALM_ROWS,
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
    rows: COLLAPSED_ROWS,
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
    rows: FINISH_ROWS,
  }),
  Object.freeze({
    zoneId: 'norm-correction', label: LOWERED_LABEL, oid: 'NC5',
    rows: Object.freeze({
      ...suffixRows(LOWERED_LABEL, {
        '01': 'Live Canvas pair checks the exact header geometry and contents.',
        '02': 'Live Canvas pair checks the exact screen title text and typography.',
        '03': 'Live Canvas pair checks the exact range text and tabular-number typography.',
        '05': 'Live Canvas pair checks the real summary card, 12px top offset and its geometry.',
        '11': 'Live Canvas pair checks the facts card and its 12px top offset.',
        '12': 'Live Canvas pair checks the exact facts row geometry and typography.',
        '13': 'Live Canvas pair checks the exact primary fact text and color.',
        '15': 'Live Canvas pair checks that the last facts row has no divider.',
        '\u0442\u0435\u043a\u0441\u0442': 'Live Canvas pair checks all 13 text atoms in their exact order.',
      }, 'computed-style', TESTS.normVisual),
      [`${LOWERED_LABEL} \u00b7 07`]: Object.freeze({
        verdict: '?',
        evidence: Object.freeze([
          'unsupported: get_curator_clients_window returns waist but not biceps/thigh',
          'semantic-test: apps/web/__tests__/curator-panel-rows.test.js',
        ]),
        fact: 'The production owner cannot currently supply the stable-girth evidence required by this exact Canvas copy.',
      }),
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
