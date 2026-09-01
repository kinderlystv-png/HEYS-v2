import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  NON_AUTOMATABLE_REASON_CODES,
  PLAN_FEED_DOM_CONTRACTS,
  PLAN_FEED_FRAME,
} from '../scripts/ui-v4-dom-contracts.mjs';
import {
  CANVAS_PACK_DIR,
  parseCanvasHtml,
} from '../../../scripts/lib/ui-v4-canvas-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function loadParts() {
  globalThis.window = globalThis;
  globalThis.React = React;
  globalThis.HEYS = globalThis.HEYS || {};
  const source = fs.readFileSync(
    path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'),
    'utf8',
  );
  // eslint-disable-next-line no-eval
  (0, eval)(source);
  return globalThis.HEYS.StrengthBuilderParts;
}

function exercise(id, name, sets, weightKg, reps, extra = {}) {
  return {
    id,
    name,
    approaches: Array.from({ length: sets }, (_unused, index) => ({
      weightKg: String(weightKg),
      reps: Array.isArray(reps) ? reps[index % reps.length] : reps,
    })),
    ...extra,
  };
}

function renderFuturePlan() {
  const Parts = loadParts();
  const exercises = [
    exercise('bench', 'Жим лёжа', 4, 75, [8, 9, 10, 12]),
    exercise('row', 'Тяга штанги в наклоне', 4, 60, [8, 9, 10, 12]),
    exercise('press', 'Жим гантелей сидя', 3, 24, [10, 11, 12]),
    exercise('pullup', 'подтягивания', 3, '', 8, { ssGroup: 1 }),
    exercise('pulldown', 'тяга блока', 3, 55, 10, { ssGroup: 1 }),
    exercise('curl', 'Сгибание рук', 3, 14, 12),
    exercise('extension', 'Разгибание рук', 3, 18, 12),
  ];
  const training = {
    workoutLog: { exercises: [] },
    planSnapshot: { exercises },
    plan: {
      id: 'visual-plan',
      status: 'assigned',
      dayLabel: 'День B · верх тела',
      assignedBy: 'Артём',
      assignedAt: new Date(2026, 7, 3).getTime(),
    },
  };
  const kinds = ['done', 'rest', 'assigned', 'rest', 'assigned', 'rest', 'rest'];

  render(React.createElement(
    'main',
    { id: 'ui-v4-strength-plan-feed-host', className: 'activity-v4-program' },
    React.createElement(Parts.PlanCard, {
      training,
      dateKey: '2026-08-12',
      isFutureDay: true,
      isPastDay: false,
      weekLabel: 'Неделя 2 из 4 · мезоцикл «База»',
      weekOverview: kinds.map((kind, index) => ({
        date: `2026-08-${String(10 + index).padStart(2, '0')}`,
        weekday: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][index],
        kind,
      })),
      moveOptions: [{ date: '2026-08-13', busy: false }],
      onMove: () => ({ ok: true }),
      onSkip: () => ({ ok: true }),
      onResumeSkipped: () => ({ ok: true }),
    }),
  ));
}

afterEach(() => cleanup());

describe('UI v4 DOM evidence map: strength-builder / И3', () => {
  it('covers the current Canvas fail-closed: 36/36 identities and exact source values', () => {
    const canvas = parseCanvasHtml(
      fs.readFileSync(path.join(CANVAS_PACK_DIR, PLAN_FEED_FRAME.canvasFile), 'utf8'),
      { file: PLAN_FEED_FRAME.canvasFile },
    );
    const rows = canvas.contractRows.filter((row) =>
      row.identity.startsWith(`${PLAN_FEED_FRAME.label} · `));

    expect(rows).toHaveLength(36);
    expect(PLAN_FEED_DOM_CONTRACTS).toHaveLength(36);
    expect(PLAN_FEED_DOM_CONTRACTS.map((row) => row.rowIdentity))
      .toEqual(rows.map((row) => row.identity));
    expect(PLAN_FEED_DOM_CONTRACTS.map((row) => row.canvasValue))
      .toEqual(rows.map((row) => row.value));
    expect(new Set(rows.map((row) => row.identity)).size).toBe(rows.length);
  });

  it('requires exactly one typed evidence path per row', () => {
    for (const row of PLAN_FEED_DOM_CONTRACTS) {
      expect(Boolean(row.assertion) !== Boolean(row.nonAutomatable), row.rowIdentity).toBe(true);
      if (row.assertion) {
        expect(row.assertion.selector, row.rowIdentity).toMatch(/^:scope(?:\s|>)/);
        expect(row.assertion.selector, row.rowIdentity).not.toMatch(/:nth-|\[style/);
        expect(['one', 'all']).toContain(row.assertion.match);
        if (row.assertion.kind === 'computed-style') {
          expect(Object.keys(row.assertion.properties).length, row.rowIdentity).toBeGreaterThan(0);
        } else {
          expect(row.assertion.kind).toBe('dom');
        }
      } else {
        expect(NON_AUTOMATABLE_REASON_CODES).toContain(row.nonAutomatable.reasonCode);
        expect(row.nonAutomatable.rationale.trim().length, row.rowIdentity).toBeGreaterThan(20);
        if (row.nonAutomatable.reasonCode === 'intentional-deviation') {
          expect(row.nonAutomatable.decisionRef, row.rowIdentity)
            .toMatch(/^docs\/ui\/UI_V4_CODEX_DESIGN_DISCREPANCIES\.md#/);
        } else {
          expect(row.nonAutomatable.decisionRef).toBeUndefined();
        }
      }
    }
  });

  it('keeps rows 18/19 tied to the current verdict decision', () => {
    const verdict = JSON.parse(fs.readFileSync(
      path.resolve(WEB_DIR, '../../docs/ui/verdicts/strength-builder.json'),
      'utf8',
    ));
    for (const suffix of ['18', '19']) {
      const identity = `${PLAN_FEED_FRAME.label} · ${suffix}`;
      const mapRow = PLAN_FEED_DOM_CONTRACTS.find((row) => row.rowIdentity === identity);
      expect(mapRow.nonAutomatable.reasonCode).toBe('intentional-deviation');
      expect(mapRow.nonAutomatable.decisionRef).toBe(verdict.rows[identity].decisionRef);
      expect(verdict.rows[identity].v).toBe('≠');
    }
  });

  it('resolves every automatable selector with its declared cardinality in the real PlanCard DOM', () => {
    renderFuturePlan();
    const root = document.querySelector(PLAN_FEED_FRAME.runtimeRootSelector);
    expect(root).not.toBeNull();

    for (const row of PLAN_FEED_DOM_CONTRACTS.filter((entry) => entry.assertion)) {
      const { assertion } = row;
      let matches = [...root.querySelectorAll(assertion.selector)];
      if (assertion.locatorText) {
        matches = matches.filter((node) => normalizeText(node.textContent) === assertion.locatorText);
      }
      if (assertion.match === 'one') {
        expect(matches, row.rowIdentity).toHaveLength(1);
      } else {
        expect(matches.length, row.rowIdentity).toBeGreaterThan(0);
      }
    }
  });
});

