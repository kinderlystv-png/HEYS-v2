import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import {
  PLAN_FEED_DOM_CONTRACTS,
  PLAN_FEED_FRAME,
} from '../scripts/ui-v4-dom-contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const ACTIVITY_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8',
);
const BUILDER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8',
);
const BASE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8',
);

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', gr: '#5c6a45', grBg: '#e6f1df',
  ink56: 'rgba(0, 0, 0, 0.56)',
});

const BLUE = Object.freeze({
  bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
  ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff', gr: '#5c6a45', grBg: '#e6f1df',
  ink56: 'rgba(16, 24, 38, 0.64)',
});

function paletteCss(name) {
  const p = name === 'blue' ? BLUE : CANVAS;
  const inkRgb = name === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const scoped = `${ACTIVITY_CSS}\n${BUILDER_CSS}`
    .replaceAll('var(--v4-bg, #fffaf1)', p.bg)
    .replaceAll('var(--v4-c1, #f7efe2)', p.c1)
    .replaceAll('var(--v4-hero, #efe3cf)', p.c2)
    .replaceAll('var(--v4-ink, #201e1d)', p.tx)
    .replaceAll('var(--v4-act-text, #8a4a20)', p.ac)
    .replaceAll('var(--v4-act, #c67139)', p.acs)
    .replaceAll('var(--v4-btn-on-act, #2b1608)', p.onAcs)
    .replaceAll('var(--v4-ok-bg, #e6f1df)', p.grBg)
    .replaceAll('var(--v4-ok-text, #5c6a45)', p.gr)
    .replaceAll('var(--v4-ink-2, rgba(0, 0, 0, 0.55))', p.ink56)
    .replaceAll('rgba(var(--ink), 0.56)', p.ink56)
    .replaceAll('rgba(var(--ink),.56)', p.ink56);
  return `:root{--v4-ink-rgb:${inkRgb};--ink:${inkRgb};--c2:${p.c2};--ac:${p.ac};--tx:${p.tx};--gr:${p.gr};--gr-bg:${p.grBg};--acs:${p.acs};--on-acs:${p.onAcs};--bg:${p.bg};}\n${BASE_CSS}\n${scoped}`;
}

function loadParts() {
  globalThis.window = globalThis;
  globalThis.React = React;
  globalThis.HEYS = globalThis.HEYS || {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8'));
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
  render(React.createElement(
    'main',
    { id: 'ui-v4-strength-plan-feed-host', className: 'activity-v4-program' },
    React.createElement(Parts.PlanCard, {
      training: {
        workoutLog: { exercises: [] },
        planSnapshot: { exercises },
        plan: {
          id: 'visual-plan',
          status: 'assigned',
          dayLabel: 'День B · верх тела',
          assignedBy: 'Артём',
          assignedAt: new Date(2026, 7, 3).getTime(),
        },
      },
      dateKey: '2026-08-12',
      isFutureDay: true,
      isPastDay: false,
      weekLabel: 'Неделя 2 из 4 · мезоцикл «База»',
      weekOverview: ['done', 'rest', 'assigned', 'rest', 'assigned', 'rest', 'rest'].map((kind, index) => ({
        date: `2026-08-${String(10 + index).padStart(2, '0')}`,
        weekday: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][index],
        kind,
      })),
      moveOptions: [{ date: '2026-08-13', busy: false, weekday: 'среда', label: 'Завтра, среда, 13 августа' }],
      onMove: () => ({ ok: true }),
      onSkip: () => ({ ok: true }),
    }),
  ));
}

function assertRows(rows, paletteLabel) {
  const mismatches = [];
  const normalizeCss = (value) => String(value == null ? '' : value).replace(/0\.(\d+)/g, '.$1');
  rows.forEach(([id, selector, text, expectedStyle]) => {
    const node = document.querySelector(selector);
    if (!node) {
      mismatches.push({ id, paletteLabel, selector, field: 'selector', expected: 'present', actual: 'missing' });
      return;
    }
    if (text != null && !node.textContent.includes(text)) {
      mismatches.push({ id, paletteLabel, selector, field: 'text', expected: text, actual: node.textContent });
    }
    const actualStyle = getComputedStyle(node);
    Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
      if (normalizeCss(actualStyle[property]) !== normalizeCss(expected)) {
        mismatches.push({ id, paletteLabel, selector, field: property, expected, actual: actualStyle[property] });
      }
    });
  });
  return mismatches;
}

afterEach(() => cleanup());

describe('И3 · План в ленте дня · canvas contract', () => {
  it('держит PlanCard feed и контрактные селекторы', () => {
    expect(PLAN_FEED_DOM_CONTRACTS).toHaveLength(36);
    expect(BUILDER_CSS).toMatch(/\.sb-plan-feed > \.sb-plan-card--future[\s\S]*margin-top: 12px/);
    renderFuturePlan();
    const root = document.querySelector(PLAN_FEED_FRAME.runtimeRootSelector);
    expect(root).not.toBeNull();
    for (const row of PLAN_FEED_DOM_CONTRACTS.filter((entry) => entry.assertion)) {
      const matches = [...root.querySelectorAll(row.assertion.selector)];
      expect(matches.length, row.rowIdentity).toBeGreaterThan(0);
    }
  });

  it('доказывает ключевые строки на песочной и синей палитрах', () => {
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    renderFuturePlan();
    try {
      const sandRows = [
        ['06', '.sb-plan-card--future', null, { marginTop: '12px' }],
        ['08', '.sb-plan-letter', 'B', { width: '34px', height: '34px', borderRadius: '11px', color: CANVAS.ac }],
        ['10', '.sb-plan-summary-copy > b', 'Запланировано куратором', { color: CANVAS.tx }],
        ['11', '.sb-plan-summary-copy > .sb-plan-meta', 'Артём', { color: CANVAS.ink56 }],
        ['16', '.sb-plan-exercises li > i', '75 кг', { color: CANVAS.ink56 }],
        ['25', '.sb-plan-week-days .is-done b', '✓', { color: CANVAS.gr }],
        ['29', '.sb-plan-week-days .is-assigned b', '●', { color: CANVAS.ac }],
        ['33', '.sb-plan-week-legend i.is-assigned', null, { backgroundColor: CANVAS.acs }],
      ];
      let mismatches = assertRows(sandRows, 'sand');

      style.textContent = paletteCss('blue');
      mismatches = mismatches.concat(assertRows([
        ['08', '.sb-plan-letter', 'B', { color: BLUE.ac }],
        ['29', '.sb-plan-week-days .is-assigned b', '●', { color: BLUE.ac }],
        ['33', '.sb-plan-week-legend i.is-assigned', null, { backgroundColor: BLUE.acs }],
      ], 'blue'));

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
