import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const ACTIVITY_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8',
);
const BUILDER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8',
);
const SUPERSET = fs.readFileSync(
  path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8',
);
const BASE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8',
);

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', tint: '#f6e6dd', tx: '#201e1d',
  acs: '#c67139', onAcs: '#2b1608', ink56: 'rgba(0, 0, 0, 0.56)',
});

const BLUE = Object.freeze({
  bg: '#ffffff', c1: '#eef3f9', tint: '#e2ecf6', tx: '#101826',
  acs: '#2e7cc0', onAcs: '#ffffff', ink56: 'rgba(16, 24, 38, 0.64)',
});

function paletteCss(name) {
  const p = name === 'blue' ? BLUE : CANVAS;
  const inkRgb = name === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const c2 = name === 'blue' ? '#e2ecf6' : '#efe3cf';
  const scoped = `${ACTIVITY_CSS}\n${BUILDER_CSS}`
    .replaceAll('var(--v4-bg, var(--sb-bg, #fffaf1))', p.bg)
    .replaceAll('var(--v4-bg, #fffaf1)', p.bg)
    .replaceAll('var(--v4-c1, var(--sb-card, #f7efe2))', p.c1)
    .replaceAll('var(--v4-c1, #f7efe2)', p.c1)
    .replaceAll('var(--v4-tint, var(--sb-accbg, #f6e6dd))', p.tint)
    .replaceAll('var(--v4-tint, #f6e6dd)', p.tint)
    .replaceAll('var(--v4-hero, var(--sb-soft, #efe3cf))', c2)
    .replaceAll('var(--v4-hero, #efe3cf)', c2)
    .replaceAll('var(--v4-ink, var(--sb-tx, #201e1d))', p.tx)
    .replaceAll('var(--v4-ink, #201e1d)', p.tx)
    .replaceAll('var(--v4-act, var(--sb-acc-strong, #c67139))', p.acs)
    .replaceAll('var(--v4-act, #c67139)', p.acs)
    .replaceAll('var(--v4-btn-on-act, #2b1608)', p.onAcs)
    .replaceAll('var(--v4-ink-2, var(--sb-mut, rgba(0, 0, 0, 0.55)))', p.ink56)
    .replaceAll('var(--v4-ink-2, rgba(0, 0, 0, 0.55))', p.ink56);
  return `:root{--v4-ink-rgb:${inkRgb};--ink:${inkRgb};}\n${BASE_CSS}\n${scoped}`;
}

function loadParts() {
  globalThis.window = globalThis;
  globalThis.React = React;
  globalThis.HEYS = globalThis.HEYS || {};
  // eslint-disable-next-line no-eval
  eval(SUPERSET);
  return globalThis.HEYS.StrengthBuilderParts;
}

function renderMissedPlan() {
  const Parts = loadParts();
  render(React.createElement(
    'main',
    { className: 'activity-v4-program' },
    React.createElement(Parts.PlanCard, {
      training: {
        workoutLog: { exercises: [] },
        planSnapshot: { exercises: [{ name: 'Жим лёжа', approaches: [{ reps: 8, weightKg: '75' }] }] },
        plan: { status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' },
      },
      dateKey: '2026-08-11',
      isFutureDay: false,
      isPastDay: true,
      moveOptions: [{ date: '2026-08-14', busy: false, weekday: 'четверг', label: 'Четверг, 14 августа' }],
      onSkip: () => ({ ok: true }),
      onMove: () => ({ ok: true }),
    }),
  ));
}

function assertRows(rows, paletteLabel) {
  const mismatches = [];
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
      if (actualStyle[property] !== expected) {
        mismatches.push({ id, paletteLabel, selector, field: property, expected, actual: actualStyle[property] });
      }
    });
  });
  return mismatches;
}

afterEach(() => cleanup());

describe('И4 · День не состоялся · canvas contract', () => {
  it('держит кадр пропущенного назначения и чипы причин', () => {
    expect(SUPERSET).toContain('sb-plan-missed');
    expect(SUPERSET).toContain('Неделя ещё не закрыта');
    expect(BUILDER_CSS).toMatch(/\.sb-plan-missed-card[\s\S]*background: var\(--v4-tint/);
    renderMissedPlan();
    expect(screen.getByText('Отпустить')).toBeTruthy();
    expect(screen.getByText('Перенести на четверг')).toBeTruthy();
    expect(screen.getByText('мало сил')).toBeTruthy();
    expect(screen.queryByText('Требует правки кода')).toBeNull();
  });

  it('чип необязательной причины переключается без sheet', () => {
    renderMissedPlan();
    fireEvent.click(screen.getByText('мало сил'));
    expect(document.querySelector('.sb-plan-missed-chip.is-on')).toBeTruthy();
  });

  it('доказывает геометрию и цвета на песочной и синей палитрах', () => {
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    renderMissedPlan();
    try {
      let mismatches = assertRows([
        ['06', '.sb-plan-missed-card', 'Неделя ещё не закрыта', { marginTop: '12px', backgroundColor: CANVAS.tint }],
        ['07', '.sb-plan-missed-lead', 'Пропуск не считается провалом', { color: CANVAS.tx }],
        ['08', '.sb-plan-missed-actions', null, { gap: '7px', marginTop: '12px' }],
        ['09', '.sb-plan-missed-actions .sb-plan-cta', 'Перенести', { backgroundColor: CANVAS.acs, color: CANVAS.onAcs }],
        ['10', '.sb-plan-missed-release', 'Отпустить', { backgroundColor: CANVAS.bg }],
        ['11', '.sb-plan-missed-foot', 'Куратор увидит', { marginTop: '9px' }],
        ['13', '.sb-plan-missed-chips', null, { gap: '6px' }],
      ], 'sand');

      fireEvent.click(screen.getByText('мало сил'));
      mismatches = mismatches.concat(assertRows([
        ['15', '.sb-plan-missed-chip.is-on', 'мало сил', { backgroundColor: CANVAS.acs, color: CANVAS.onAcs }],
      ], 'sand'));

      style.textContent = paletteCss('blue');
      mismatches = mismatches.concat(assertRows([
        ['06', '.sb-plan-missed-card', null, { backgroundColor: BLUE.tint }],
        ['09', '.sb-plan-missed-actions .sb-plan-cta', null, { backgroundColor: BLUE.acs, color: BLUE.onAcs }],
        ['15', '.sb-plan-missed-chip.is-on', null, { backgroundColor: BLUE.acs, color: BLUE.onAcs }],
      ], 'blue'));

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
