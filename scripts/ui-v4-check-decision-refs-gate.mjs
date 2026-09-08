#!/usr/bin/env node
// Gate wrapper: ratchet на кластеры decisionRef (>3 строк без декларации).

import { pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import {
  MAX_UNDECLARED_ROWS,
  runDecisionRefCheck,
} from './ui-v4-check-decision-refs.mjs';

// 07.09 p48: dc.html-адреса eight-lane scope → HISTORY; food-meal :1153 и
// date-remainders :149 сняты с baseline, заменены якорями ниже.
// 08.09: хвост 24 designer refs (login, checkin, NC, subscription, undo-bar,
// service-curator, reports-insights DESIGNER_REQUEST) → HISTORY anchors.
const CLUSTER_BASELINE = Object.freeze([
  {
    zoneId: 'food-meal',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#food-meal-portion-header-star-lucide-2026-09-07',
    rowCount: 16,
  },
  {
    zoneId: 'reports-insights',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#reports-insights-skeleton-platform-2026-08-31',
    rowCount: 17,
  },
  {
    zoneId: 'reports-insights',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#graph-cloud-arrow-spec-2026-09-05',
    rowCount: 7,
  },
  {
    zoneId: 'reports-insights',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#verdict-equals-same-result-2026-09-05',
    rowCount: 9,
  },
  {
    zoneId: 'norm-correction',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#norm-correction-curator-decision-2026-09-05',
    rowCount: 10,
  },
  {
    zoneId: 'cycle',
    decisionRef: 'apps/web/styles/modules/500-pwa-and-offline.css:743',
    rowCount: 4,
  },
  {
    zoneId: 'home-widgets',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#закрыто-3-сентября-превью-листа-смены-вида-уменьшение-кадра-а-не-своё-правило',
    rowCount: 4,
  },
  {
    zoneId: 'strength-builder',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#strength-abandoned-session-x22-2026-09-05',
    rowCount: 14,
  },
  {
    zoneId: 'strength-builder',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#strength-builder-plan-card-geometry-2026-09-07',
    rowCount: 9,
  },
  {
    zoneId: 'strength-builder',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#strength-aria-hidden-rest-cd-2026-09-05',
    rowCount: 4,
  },
  {
    zoneId: 'strength-builder',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#strength-builder-curator-gym-mid-session-2026-09-07',
    rowCount: 4,
  },
  {
    zoneId: 'date-remainders',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#date-remainders-alien-day-pill-2026-09-06',
    rowCount: 5,
  },
  {
    zoneId: 'date-remainders',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#date-remainders-sticky-capsule-2026-09-04',
    rowCount: 4,
  },
  {
    zoneId: 'first-run',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#first-run-runtime-rules-2026-09-07',
    rowCount: 7,
  },
  {
    zoneId: 'first-run',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#first-run-navigation-buttons-2026-09-07',
    rowCount: 4,
  },
  {
    zoneId: 'first-run',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#first-run-visual-contract-2026-09-07',
    rowCount: 4,
  },
  {
    zoneId: 'questionnaire',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#questionnaire-native-select-chevrons-2026-09-07',
    rowCount: 4,
  },
  {
    zoneId: 'subscription',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#subscription-canvas-decisions-2026-09-06',
    rowCount: 10,
  },
  {
    zoneId: 'tab-activity',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#tab-activity-calendar-decisions-2026-08-31',
    rowCount: 6,
  },
  {
    zoneId: 'tab-activity',
    decisionRef:
      'docs/ui/UI_V4_FINDINGS_HISTORY.md#tab-activity-frame-kcal-unit-2026-09-07',
    rowCount: 4,
  },
]);

function clusterKey(zoneId, decisionRef) {
  return `${zoneId}\u0000${decisionRef}`;
}

function countScope() {
  let zones = 0;
  let withRef = 0;
  let smallClusters = 0;
  const byRef = new Map();

  for (const zone of Object.values(readAllZones().zones || {})) {
    zones += 1;
    for (const row of Object.values(zone?.rows || {})) {
      const ref = row?.decisionRef;
      if (!ref) continue;
      withRef += 1;
      const list = byRef.get(ref) || [];
      list.push(row);
      byRef.set(ref, list);
    }
  }

  for (const list of byRef.values()) {
    if (list.length <= MAX_UNDECLARED_ROWS) smallClusters += list.length;
  }

  return {
    zones,
    withRef,
    remainder: withRef - CLUSTER_BASELINE.reduce((sum, item) => sum + item.rowCount, 0) - smallClusters,
    refsChecked: CLUSTER_BASELINE.length,
    rowsInClusters: CLUSTER_BASELINE.reduce((sum, item) => sum + item.rowCount, 0),
    smallClusterRows: smallClusters,
  };
}

function shortRef(ref) {
  const parts = String(ref || '').split('/');
  return parts[parts.length - 1] || ref;
}

function runCli() {
  const problems = runDecisionRefCheck();
  const scope = countScope();
  const baselineByKey = new Map(
    CLUSTER_BASELINE.map((item) => [clusterKey(item.zoneId, item.decisionRef), item.rowCount]),
  );
  const actualByKey = new Map(
    problems.map((item) => [clusterKey(item.zoneId, item.decisionRef), item.rowCount]),
  );

  const failures = [];
  const fixed = [];
  for (const [key, allowed] of baselineByKey) {
    const actual = actualByKey.get(key);
    if (actual === undefined) {
      fixed.push({ key, allowed, actual: 0 });
    } else if (actual > allowed) {
      failures.push({ kind: 'cluster-grew', key, allowed, actual });
    }
  }
  for (const [key, actual] of actualByKey) {
    if (!baselineByKey.has(key)) {
      failures.push({ kind: 'cluster-new', key, allowed: 0, actual });
    }
  }

  const shrank = [];
  for (const [key, allowed] of baselineByKey) {
    const actual = actualByKey.get(key);
    if (actual !== undefined && actual < allowed) {
      shrank.push({ key, allowed, actual });
    }
  }

  if (!failures.length) {
    console.log(
      `decisionRef gate: ${problems.length} замороженных кластер(ов) без декларации ` +
        `(порог > ${MAX_UNDECLARED_ROWS} строк на ref) — рост не обнаружен.`,
    );
    console.log(
      `Охват: ${scope.zones} зон, ${scope.withRef} строк с decisionRef; ` +
        `в scope gate ${scope.refsChecked} ref / ${scope.rowsInClusters} строк; ` +
        `вне scope (≤${MAX_UNDECLARED_ROWS} на ref): ${scope.smallClusterRows} строк.`,
    );
    if (shrank.length) {
      console.log('Долг уменьшился — обновите CLUSTER_BASELINE в gate:');
      for (const item of shrank) console.log(`  ${item.key.split('\u0000')[0]} · ${item.allowed} → ${item.actual}`);
    }
    if (fixed.length) {
      console.log('Кластеры закрыты — уберите из CLUSTER_BASELINE:');
      for (const item of fixed) {
        const [zoneId, ref] = item.key.split('\u0000');
        console.log(`  ${zoneId} · ${shortRef(ref)} (было ${item.allowed} строк)`);
      }
    }
    return;
  }

  console.error(
    `decisionRef gate: ${failures.length} нарушений заморозки (новый кластер или рост rowCount).`,
  );
  for (const failure of failures) {
    const [zoneId, ref] = failure.key.split('\u0000');
    console.error(
      `  ${failure.kind} · ${zoneId} · ${shortRef(ref)} · было ${failure.allowed}, стало ${failure.actual}`,
    );
  }
  console.error(
    `Охват: ${scope.zones} зон, ${scope.withRef} строк с decisionRef; ` +
      `в scope gate ${scope.refsChecked} ref; вне scope: ${scope.smallClusterRows} строк (малые кластеры).`,
  );
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
