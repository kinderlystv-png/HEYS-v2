import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_proposal_ui_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const SAND = Object.freeze({
  c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d', gr: '#5c6a45', ac2: '#a1471c',
  acs: '#c67139', onAcs: '#2b1608', ink56: 'rgba(0, 0, 0, .56)',
});
const BLUE = Object.freeze({
  c1: '#eef3f9', c2: '#e3ebf4', tx: '#101826', gr: '#5c6a45', ac2: '#1d5e96',
  acs: '#3d7cc9', onAcs: '#f5f8fc', ink56: 'rgba(16, 24, 38, 0.64)',
});

function paletteCss(name) {
  const p = name === 'blue' ? BLUE : SAND;
  const inkRgb = name === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--c2)', p.c2)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--ac2)', p.ac2)
    .replaceAll('var(--acs)', p.acs)
    .replaceAll('var(--on-acs)', p.onAcs)
    .replaceAll('var(--ink)', inkRgb);
}

function loadParts() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

function canvasProps(nowMs) {
  const proposedAt = nowMs - 12 * 60000;
  return {
    training: {
      plan: {
        status: 'skipped',
        dayLabel: 'Верх тела B',
        skipReason: 'болит плечо',
        proposal: {
          status: 'pending',
          proposedBy: 'Артём',
          proposedAt,
          note: 'Собрал то же самое без жимов над головой. Плечо не тронем, спину и ноги сделаем.',
          exercises: [
            { id: 'e1', name: 'Тяга блока', approaches: [{ reps: 10, weightKg: '40' }] },
            { id: 'e3', name: 'Приседания', approaches: [{ reps: 8, weightKg: '60' }] },
          ],
        },
      },
      planSnapshot: {
        exercises: [
          { id: 'e1', name: 'Тяга блока', approaches: [{ reps: 10, weightKg: '40' }] },
          { id: 'e2', name: 'Жим над головой', approaches: [{ reps: 8, weightKg: '30' }] },
        ],
      },
      workoutLog: { exercises: [] },
    },
    nowMs,
  };
}

function applyPaletteVars(paletteName) {
  const p = paletteName === 'blue' ? BLUE : SAND;
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const root = document.documentElement;
  root.style.setProperty('--tx', p.tx);
  root.style.setProperty('--c2', p.c2);
  root.style.setProperty('--gr', p.gr);
  root.style.setProperty('--ac2', p.ac2);
  root.style.setProperty('--acs', p.acs);
  root.style.setProperty('--on-acs', p.onAcs);
  root.style.setProperty('--c1', p.c1);
  root.style.setProperty('--ink', inkRgb);
  root.style.setProperty('--ink56', p.ink56);
}

describe('strength builder · Правка · пропущен сегодня (кадр Л5)', () => {
  let Parts;
  let styleEl;

  beforeEach(() => {
    Parts = loadParts();
    applyPaletteVars('sand');
    styleEl = document.createElement('style');
    styleEl.textContent = paletteCss('sand');
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    cleanup();
    styleEl.remove();
    document.documentElement.removeAttribute('style');
    delete window.HEYS;
  });

  it('renders canvas copy and structure', () => {
    const now = new Date('2026-09-05T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.MissedTodayProposalScreen, canvasProps(now)));
    expect(screen.getByText('Верх тела B вы отпустили')).toBeTruthy();
    expect(screen.getByText('причина: болит плечо')).toBeTruthy();
    expect(screen.getByText('Артём предлагает замену')).toBeTruthy();
    expect(screen.getByText(/Собрал то же самое без жимов над головой/)).toBeTruthy();
    expect(screen.getByText(/Артём · куратор · 12 минут назад/)).toBeTruthy();
    expect(screen.getByText('Тяга блока')).toBeTruthy();
    expect(screen.getByText('оставили')).toBeTruthy();
    expect(screen.getByText('Жим над головой')).toBeTruthy();
    expect(screen.getByText('убрали')).toBeTruthy();
    expect(screen.getByText('Приседания')).toBeTruthy();
    expect(screen.getByText('добавили')).toBeTruthy();
    expect(screen.getByText('Не сегодня')).toBeTruthy();
    expect(screen.getByText('Посмотреть')).toBeTruthy();
    expect(container.querySelector('.sb-missed-today-footnote')?.textContent)
      .toMatch(/Отмеченных подходов нет/);
  });

  const rows = [
    ['01', '.sb-missed-today-head', null, { display: 'flex' }],
    ['02', '.sb-missed-today-head-main', null, { flexDirection: 'column', gap: '3px' }],
    ['03', '.sb-missed-today-title', 'Верх тела B вы отпустили', { color: SAND.tx }],
    ['04', '.sb-missed-today-key', 'причина: болит плечо', null],
    ['05', '.sb-missed-today-scroll', null, { overflowY: 'auto' }],
    ['06', '.sb-missed-today-badge', 'Артём предлагает замену', null],
    ['07', '.sb-missed-today-note', null, { marginTop: '10px', borderRadius: '12px', padding: '11px 12px' }],
    ['08', '.sb-missed-today-note-text', null, { fontSize: '12px', lineHeight: '1.5', color: SAND.tx }],
    ['09', '.sb-missed-today-note-meta', null, { fontSize: '10.5px', lineHeight: '1', marginTop: '7px' }],
    ['10', '.sb-missed-today-list', null, { marginTop: '10px' }],
    ['11', '.sb-missed-today-row', null, { display: 'flex' }],
    ['12', '.sb-missed-today-row-name', 'Тяга блока', { color: SAND.tx }],
    ['13', '.sb-missed-today-row:first-child .sb-missed-today-row-label.is-kept', 'оставили', { fontSize: '11px', color: SAND.gr }],
    ['14', '.sb-missed-today-row:nth-child(2) .sb-missed-today-row-label.is-removed', 'убрали', { fontSize: '11px', color: SAND.ac2 }],
    ['15', '.sb-missed-today-row:last-child', null, null],
    ['16', '.sb-missed-today-actions', null, { gap: '7px', marginTop: '12px' }],
    ['17', '.sb-missed-today-decline', 'Не сегодня', { flex: '1 1 0%' }],
    ['18', '.sb-missed-today-review', 'Посмотреть', { flex: '1 1 0%', backgroundColor: SAND.acs, color: SAND.onAcs }],
    ['19', '.sb-missed-today-footnote', null, { fontSize: '11px', color: SAND.ink56 }],
  ];

  it('row 15 last list row has no divider', () => {
    const now = new Date('2026-09-05T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.MissedTodayProposalScreen, canvasProps(now)));
    const last = container.querySelector('.sb-missed-today-row:last-child');
    expect(last).toBeTruthy();
    expect(last.style.borderBottom).toMatch(/none/);
  });

  rows.forEach(function ([id, selector, text, expected]) {
    it('row ' + id + ' matches canvas contract on sand', () => {
      const now = new Date('2026-09-05T12:00:00').getTime();
      const { container } = render(React.createElement(Parts.MissedTodayProposalScreen, canvasProps(now)));
      const el = container.querySelector(selector);
      expect(el, selector).toBeTruthy();
      if (text) expect(el.textContent).toContain(text);
      if (expected) {
        const cs = getComputedStyle(el);
        Object.entries(expected).forEach(function ([prop, value]) {
          expect(cs[prop], id + ' ' + prop).toBe(value);
        });
      }
    });
  });

  it('kept/removed colors follow palette on blue set', () => {
    applyPaletteVars('blue');
    styleEl.textContent = paletteCss('blue');
    const now = new Date('2026-09-05T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.MissedTodayProposalScreen, canvasProps(now)));
    const kept = container.querySelector('.sb-missed-today-row-label.is-kept');
    const removed = container.querySelector('.sb-missed-today-row-label.is-removed');
    expect(getComputedStyle(kept).color).toBe(BLUE.gr);
    expect(getComputedStyle(removed).color).toBe(BLUE.ac2);
  });

  it('buildMissedTodaySnapshot matches текст contract', () => {
    const now = new Date('2026-09-05T12:00:00').getTime();
    const snap = Parts.buildMissedTodaySnapshot(canvasProps(now));
    const text = [
      snap.titleLine, snap.reasonLine, snap.badgeLine, snap.noteText, snap.noteMeta,
      snap.changes.map(function (c) { return c.name + ' › ' + c.label; }).join(' › '),
      snap.declineLabel, snap.reviewLabel, snap.footnote,
    ].join(' › ');
    expect(text).toContain('Верх тела B вы отпустили');
    expect(text).toContain('причина: болит плечо');
    expect(text).toContain('Артём предлагает замену');
    expect(text).toContain('Собрал то же самое без жимов над головой');
    expect(text).toContain('12 минут назад');
    expect(text).toContain('Тяга блока');
    expect(text).toContain('оставили');
    expect(text).toContain('убрали');
    expect(text).toContain('добавили');
    expect(text).toContain('Не сегодня');
    expect(text).toContain('Посмотреть');
    expect(text).toContain('пропуск был решением человека');
  });

  it('source exports MissedTodayProposalScreen in proposal_ui', () => {
    expect(SRC).toContain('function MissedTodayProposalScreen');
    expect(SRC).toContain('Parts.MissedTodayProposalScreen = MissedTodayProposalScreen');
  });
});
