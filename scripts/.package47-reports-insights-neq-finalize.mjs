#!/usr/bin/env node
/**
 * Package 47 — reports-insights: finalize 8 typed «≠» decisionRef + address recalc.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = 'docs/ui/UI_V4_FINDINGS_HISTORY.md';
const ZONE = 'reports-insights';

const NEQ_FINAL = new Map([
  ['карточка · плитка Score', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-p47-score-tile`,
    fact:
      'heys_day_stats_v1.js:1468 .reports-v4-score-slot + heys-score-tile — Score отдельным блоком с дельтой и входом в разбор, ' +
      'не первой из трёх равных плиток 30/800 кадра «Итог периода»; пакет 47 уточнил контракт, продукт не менялся',
  }],
  ['карточка · график «съедено против плана»', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-p47-chart-eaten`,
    fact:
      '733-ui-v4-reports.css:443-445 .reports-v4-dynamics-card .sparkline-svg--reports-v4 — контейнер графика; «+205 в день» снято 31.08, ' +
      'линии 262×52 сведены; размер холста — отступление, пакет 47 зафиксировал решение без правки svg',
  }],
  ['карточка · каскад разбора Score', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-cascade-minus-ink-2026-08-31`,
    fact:
      'heys_cascade_card_v1.js:4307-4314 heys-score-screen__row-value — минус вклада на чернилах, не --val-bad; ' +
      'строка «роли цвета» пакета 47 приведена к этому, строка «карточка · каскад» ещё называет --val-bad — код следует роли',
  }],
  ['карточка · Ритм приёмов', {
    reasonCode: 'owner-decision',
    decisionRef: `${H}#reports-insights-p47-rhythm-meals`,
    fact:
      '734-ui-v4-insights.css:1007-1011 .insights-v4-nutrition__rhythm-bar height 6 --v4-track; ' +
      'контракт просит пропорциональные полосы 8 px --gr2; кадр «до 20:30» переснимается, продукт показывает края окна',
  }],
  ['карточка · абзац раскрывашки', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-p47-detail-paragraph`,
    fact:
      '734-ui-v4-insights.css:1808-1816 .insights-v4-sheet__text 12/1.55 --v4-ink-2, зазор 10; ' +
      'кнопка «Понятно» .insights-v4-sheet__ok:1869-1878 на --v4-act (--acs), контракт просит --c2; ярус «На чём основано» — typed ≠',
  }],
  ['карточка · «Что из этого следует»', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-p47-phenotype-follows`,
    fact:
      'pi_ui_dashboard.js:2714-2730 insights-v4-pheno__uses — одна проза на ось вместо трёх строк .row «что/где»; ' +
      'пакет 47 уточнил ярус, разметка двух колонок не реализована',
  }],
  ['вид · лист раскрывашки', {
    reasonCode: 'canvas-conflict',
    decisionRef: `${H}#reports-insights-p47-detail-sheet`,
    fact:
      '734-ui-v4-insights.css:1781-1798 .insights-v4-sheet-scrim/.insights-v4-sheet + pi_ui_dashboard.js:2282-2296 — ' +
      'scrim blur 2.5px ролью --scrim, лист --v4-bg radius 28; кнопка «Понятно» 48 на --v4-act, контракт --c2; библиография ярусом — typed ≠',
  }],
  ['вид · панель и состояния', {
    reasonCode: 'platform',
    decisionRef: `${H}#reports-insights-skeleton-platform-2026-08-31`,
    fact:
      'pi_ui_dashboard.js — SkeletonCard не вызывается; ACCEPTANCE-spinners.md запрещает поблочный skeleton; ' +
      '__tests__/app-tab-skeletons.test.js:51; пакет 47 уточнил скелет #f4f4f3, продукт его не рисует',
  }],
]);

/** Address-only patches for «=» rows with moved evidence. */
const ADDRESS_PATCHES = {
  'Инсайты · подробно · 05': {
    fact:
      'ярус «Прогноз веса» — margin-top 8px у .insights-v4-weight__tier (734-ui-v4-insights.css:384-386); ' +
      'в v4 нет значков у ярусов — CollapsibleSection без icon (pi_ui_dashboard.js:3542+)',
  },
  'Инсайты · ярус Питание · 06': {
    fact:
      '720-predictive-insights.css:9293-9310 .meal-rec-card__title/.meal-rec-card__subtitle — пре-v4 карточка рекомендации; ' +
      'кегль/тон не сведены с кадром яруса Питание ·06',
  },
};

const scopeKeys = new Set([...NEQ_FINAL.keys(), ...Object.keys(ADDRESS_PATCHES)]);
const zone = readZone(ZONE, { root: ROOT });
const foreignBefore = snapshotForeignRowStrings(zone.rows, scopeKeys);

let neq = 0;
let addr = 0;

for (const [key, spec] of NEQ_FINAL) {
  const row = zone.rows[key];
  if (!row || row.v !== '≠') {
    console.error(`missing or not ≠: ${key}`);
    process.exit(1);
  }
  const result = setVerdictKey(
    ZONE,
    key,
    {
      verdict: '≠',
      fact: spec.fact,
      options: { 'reason-code': spec.reasonCode, 'decision-ref': spec.decisionRef },
    },
    { root: ROOT },
  );
  if (result.skipped) {
    console.error('skipped', key, result.reason);
    process.exit(1);
  }
  neq++;
  console.log(`${key} → ≠ · ${spec.decisionRef.split('#')[1]}`);
}

for (const [key, patch] of Object.entries(ADDRESS_PATCHES)) {
  const row = zone.rows[key];
  if (!row) {
    console.error(`missing row: ${key}`);
    process.exit(1);
  }
  const options = {};
  if (row.v === '≠') {
    if (row.reasonCode) options['reason-code'] = row.reasonCode;
    if (row.decisionRef) options['decision-ref'] = row.decisionRef;
  }
  const result = setVerdictKey(
    ZONE,
    key,
    { verdict: row.v, fact: patch.fact, options },
    { root: ROOT },
  );
  if (result.skipped) {
    console.error('skipped', key, result.reason);
    process.exit(1);
  }
  addr++;
  console.log(`${key} → address recalc`);
}

assertForeignRowsUnchanged(foreignBefore, readZone(ZONE, { root: ROOT }).rows, scopeKeys);
console.log(`\npackage47 reports-insights finalize: ≠ ${neq}, addresses ${addr}`);
