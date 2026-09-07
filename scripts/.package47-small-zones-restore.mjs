#!/usr/bin/env node
/** Restore verdicts after --rehash from «Прежде:» facts + package 47 note. */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ZONES = [
  'cycle', 'settings-system', 'registration', 'gamification', 'tips',
  'login', 'questionnaire', 'first-run', 'curator-edits', 'spinners',
];

const P47 = 'Пакет 47: проза контракта на var(--ink-2); --v4-ink-prose снят (ОТВЕТ-22 §2).';

const NEQ = new Map([
  ['spinners', new Set(['вид ступеней холодного старта'])],
  ['first-run', new Set(['карточка шага', 'две кнопки, и обе понятны', 'вид · карточка шага', 'вид · вход с компьютера'])],
  ['login', new Set(['вид карточки и боксов кода', 'вид полки с кнопкой'])],
  ['tips', new Set(['вид детали совета'])],
]);

const FACT_OVERRIDE = {
  spinners: {
    'вид подписи':
      'heys-boot-mark.css:294-299 .heys-boot-mark__text — 500 12/1.5 color --boot-muted (--v4-ink-2); заголовок 700 15/1.35; spinners-pwa-v4-canvas-razbor.test.js',
  },
};

function appendP47(fact) {
  if (!fact) return P47;
  if (fact.includes('Пакет 47')) return fact;
  return `${fact} ${P47}`.trim();
}

const totals = { eq: 0, neq: 0, total: 0 };

for (const zoneId of ZONES) {
  const rows = readZone(zoneId).rows || {};
  // Защита чужих строк: снимок всех строк зоны ДО правки. Скрипт трогает только
  // те ключи, у которых вердикт «?» и в факте стоит «Прежде:», — остальные
  // обязаны остаться байт в байт. Без этого пакетный писатель вердиктов может
  // затереть соседнюю строку, и заметить это будет некому: неверный вердикт не
  // падает, он молча становится правдой для следующего читателя снимка.
  const beforeForeign = new Map(
    Object.entries(rows).map(([key, row]) => [key, JSON.stringify(row)]),
  );
  const touchedKeys = new Set();
  let eq = 0;
  let neq = 0;
  let n = 0;
  for (const [key, row] of Object.entries(rows)) {
    if (row.v !== '?' || !String(row.f || '').includes('Прежде:')) continue;
    const oldFact = row.f.replace(/^Дизайнер переписал строку, вердикт снят\. Прежде: /, '');
    const wasNeq = Boolean(row.reasonCode) || NEQ.get(zoneId)?.has(key);
    const verdict = wasNeq ? '≠' : '=';
    const options = {};
    if (verdict === '≠') {
      if (row.reasonCode) options['reason-code'] = row.reasonCode;
      if (row.decisionRef) options['decision-ref'] = row.decisionRef;
    }
    const fact = appendP47(FACT_OVERRIDE[zoneId]?.[key] || oldFact);
    setVerdictKey(zoneId, key, { verdict, fact, options });
    touchedKeys.add(key);
    n += 1;
    if (verdict === '=') eq += 1;
    else neq += 1;
  }
  // assertForeignRowsUnchanged: всё, чего скрипт не трогал намеренно, обязано
  // совпасть со снимком. Расхождение — foreign key mutation blocked: падаем, а
  // не дописываем поверх.
  const afterRows = readZone(zoneId).rows || {};
  const foreignViolations = [];
  for (const [key, before] of beforeForeign) {
    if (touchedKeys.has(key)) continue;
    const after = afterRows[key] === undefined ? undefined : JSON.stringify(afterRows[key]);
    if (after !== before) foreignViolations.push(key);
  }
  for (const key of Object.keys(afterRows)) {
    if (!beforeForeign.has(key) && !touchedKeys.has(key)) foreignViolations.push(`${key} (появилась)`);
  }
  if (foreignViolations.length) {
    console.error(`${zoneId}: foreign key mutation blocked — ${foreignViolations.length} строк(и) изменены вне scope:`);
    for (const key of foreignViolations.slice(0, 10)) console.error(`  ${key}`);
    process.exit(1);
  }

  totals.eq += eq;
  totals.neq += neq;
  totals.total += n;
  console.log(`${zoneId}: restored ${n} (= ${eq}, ≠ ${neq})`);
}

console.log(`\nTOTAL: = ${totals.eq}, ≠ ${totals.neq}, keys ${totals.total}`);
