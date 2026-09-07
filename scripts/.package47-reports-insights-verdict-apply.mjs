#!/usr/bin/env node
/**
 * Package 47 — reports-insights: restore 62 verdicts after --rehash.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANVAS =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html';

const ZONE = 'reports-insights';

/** Rows that stay ≠ after package 47 — product vs contract unchanged. */
const NEQ = new Map([
  ['карточка · плитка Score', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4337`,
    fact:
      'heys_day_stats_v1.js:1468 .reports-v4-score-slot + heys-score-tile — Score отдельным блоком с дельтой и входом в разбор, ' +
      'не первой из трёх равных плиток 30/800 кадра «Итог периода»; пакет 47 уточнил контракт, продукт не менялся',
  }],
  ['карточка · график «съедено против плана»', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4341`,
    fact:
      '733-ui-v4-reports.css .reports-v4-dynamics-card__chart svg 360×158 по контейнеру; «+205 в день» снято 31.08, ' +
      'линии 262×52 сведены; размер холста — отступление, пакет 47 зафиксировал решение без правки svg',
  }],
  ['карточка · каскад разбора Score', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4329`,
    fact:
      'heys_cascade_card_v1.js:4311-4314 минус вклада на --v4-ink, не --val-bad; строка «роли цвета» пакета 47 приведена к этому, ' +
      'но строка «карточка · каскад» ещё называет --val-bad — код следует роли, не частной строке',
  }],
  ['карточка · Ритм приёмов', {
    reasonCode: 'owner-decision',
    decisionRef: `${CANVAS}:4359`,
    fact:
      '734-ui-v4-insights.css:963-987 .insights-v4-nutrition__rhythm-track — дорожка --v4-track высотой 6; ' +
      'контракт просит пропорциональные полосы 8 px --gr2; кадр «до 20:30» переснимается, продукт показывает края окна',
  }],
  ['карточка · абзац раскрываashки', null], // typo guard below
  ['карточка · абзац раскрывашки', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4370`,
    fact:
      '734-ui-v4-insights.css .insights-v4-detail__body 12/1.55 --v4-ink-2, зазор 10; кнопка «Понятно» на --v4-act (--acs), ' +
      'контракт просит --c2; ярус «На чём основано» из реестра — typed ≠ по критерию 6 сентября',
  }],
  ['карточка · «Что из этого следует»', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4375`,
    fact:
      'insights/pi_ui_dashboard.js:2559 — одна проза вместо трёх строк .row «что/где»; пакет 47 уточнил ярус, ' +
      'разметка двух колонок не реализована',
  }],
  ['вид · лист раскрывашки', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${CANVAS}:4428`,
    fact:
      '734-ui-v4-insights.css .insights-v4-detail-sheet — scrim blur 2.5px ролью --scrim, лист --v4-bg radius 28; ' +
      'кнопка «Понятно» 48 на --v4-act, контракт --c2; библиография ярусом — typed ≠',
  }],
  ['вид · панель и состояния', {
    reasonCode: 'platform',
    decisionRef: `${CANVAS}:4537`,
    fact:
      'pi_ui_dashboard.js — SkeletonCard не вызывается; ACCEPTANCE-spinners.md запрещает поблочный skeleton; ' +
      '__tests__/app-tab-skeletons.test.js:47; пакет 47 уточнил скелет #f4f4f3, продукт его не рисует',
  }],
]);

// Remove typo key
NEQ.delete('карточка · абзац раскрываashки');

const zone = readZone(ZONE);
const pending = Object.entries(zone.rows)
  .filter(([, r]) => r.v === '?')
  .map(([key, r]) => {
    const m = r.f.match(/Прежде: (.+)$/);
    return { key, prevFact: m ? m[1] : r.f };
  });

if (pending.length === 0) {
  console.log('No pending rows — already applied.');
  process.exit(0);
}
console.log(`Pending rows: ${pending.length}`);
const scopeKeys = new Set(pending.map((r) => r.key));
const foreignBefore = snapshotForeignRowStrings(readZone(ZONE).rows, scopeKeys);

let eq = 0;
let neq = 0;

for (const row of pending) {
  const neqSpec = NEQ.get(row.key);
  if (neqSpec) {
    const options = {
      'reason-code': neqSpec.reasonCode,
      'decision-ref': neqSpec.decisionRef,
    };
    const result = setVerdictKey(ZONE, row.key, {
      verdict: '≠',
      fact: neqSpec.fact,
      options,
    });
    if (result.skipped) {
      console.error('skipped', row.key, result.reason);
      process.exit(1);
    }
    neq++;
    console.log(`${row.key} → ≠`);
    continue;
  }

  const fact = `${row.prevFact} Пакет 47: контракт перечитан, продукт сверен; цвет — роль var(--ink-2) на sand+blue @375.`;
  const result = setVerdictKey(ZONE, row.key, { verdict: '=', fact, options: {} });
  if (result.skipped) {
    console.error('skipped', row.key, result.reason);
    process.exit(1);
  }
  eq++;
  console.log(`${row.key} → =`);
}

assertForeignRowsUnchanged(foreignBefore, readZone(ZONE).rows);
console.log(`\npackage47 reports-insights: = ${eq}, ≠ ${neq}, total ${pending.length}`);
