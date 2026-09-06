import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_proposal_ui_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const SAND = Object.freeze({
  c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d', gr: '#5c6a45', ac2: '#a1471c',
  acs: '#c67139', onAcs: '#2b1608', ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)',
});
const BLUE = Object.freeze({
  c1: '#eef3f9', c2: '#e3ebf4', tx: '#101826', gr: '#5c6a45', ac2: '#1d5e96',
  acs: '#3d7cc9', onAcs: '#f5f8fc', ink56: 'rgba(16, 24, 38, 0.64)', ink62: 'rgba(16, 24, 38, 0.64)',
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
  return {
    dateKey: '2026-08-10',
    todayDateKey: '2026-08-10',
    training: {
      plan: {
        status: 'assigned',
        dayLabel: 'та же группа, но полегче',
        proposal: {
          status: 'pending',
          proposedBy: 'Артём',
          proposedAt: nowMs - 12 * 60000,
          replacesSkippedDateKey: '2026-08-04',
          replacesSkippedWeekday: 'вторника',
          title: 'Замена вместо вторника',
          subtitle: 'та же группа, но полегче',
          exercises: [
            { id: 'e1', name: 'Тяга блока', approaches: [{ reps: 10, weightKg: '40' }] },
          ],
        },
      },
      planSnapshot: { exercises: [] },
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
  root.style.setProperty('--ink62', p.ink62);
  root.style.setProperty('--v4-mark-1', p.ink62);
}

describe('strength builder · Правка · пропущен раньше (кадр Л6)', () => {
  let Parts;
  let styleEl;

  beforeAll(() => {
    Parts = loadParts();
  });

  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = paletteCss('sand');
    document.head.appendChild(styleEl);
    applyPaletteVars('sand');
  });

  afterEach(() => {
    cleanup();
    styleEl.remove();
    document.documentElement.removeAttribute('style');
  });

  afterAll(() => {
    delete window.HEYS;
  });

  it('renders canvas copy and structure', () => {
    const now = new Date('2026-08-10T12:00:00').getTime();
    render(React.createElement(Parts.MissedEarlierProposalScreen, canvasProps(now)));
    expect(screen.getByText('Замена вместо вторника')).toBeTruthy();
    expect(screen.getByText('та же группа, но полегче')).toBeTruthy();
    expect(screen.getByText('пропущено 4 авг')).toBeTruthy();
    expect(screen.getByText('замена сегодня, 10 авг')).toBeTruthy();
    expect(screen.getByText(/Вторник остаётся пропущенным/)).toBeTruthy();
    expect(screen.getByText('Посмотреть, что предлагает')).toBeTruthy();
    expect(screen.getByText('Правила этого случая')).toBeTruthy();
    expect(screen.getByText('Прошедший день')).toBeTruthy();
    expect(screen.getByText('остаётся пропуском')).toBeTruthy();
    expect(screen.getByText('новая тренировка на свободный день')).toBeTruthy();
    expect(screen.getByText(/сейчас отбивает «пропущено»/)).toBeTruthy();
    expect(screen.getByText('нужна правка')).toBeTruthy();
    expect(screen.getByText(/Отчёт цикла считает такой день пропущенным/)).toBeTruthy();
  });

  const rows = [
    ['01', '.sb-missed-earlier-head', null, { display: 'flex' }],
    ['02', '.sb-missed-earlier-head-main', null, { flexDirection: 'column', gap: '3px' }],
    ['03', '.sb-missed-earlier-title', 'Замена вместо вторника', { color: SAND.tx }],
    ['04', '.sb-missed-earlier-key', 'та же группа, но полегче', null],
    ['05', '.sb-missed-earlier-scroll', null, { overflowY: 'auto' }],
    ['06', '.sb-missed-earlier-card', null, { marginTop: '12px' }],
    ['07', '.sb-missed-earlier-timeline', null, { display: 'flex', alignItems: 'center', gap: '9px' }],
    ['08', '.sb-missed-earlier-skipped-pill', 'пропущено 4 авг', { color: SAND.ink62 }],
    ['09', '.sb-missed-earlier-replacement-line', 'замена сегодня, 10 авг', { fontSize: '12.5px', color: SAND.tx }],
    ['10', '.sb-missed-earlier-prose', null, { fontSize: '12px', lineHeight: '1.5', color: SAND.tx }],
    ['11', '.sb-missed-earlier-review', 'Посмотреть, что предлагает', { marginTop: '12px' }],
    ['12', '.sb-missed-earlier-tier', 'Правила этого случая', null],
    ['13', '.sb-missed-earlier-rules', null, null],
    ['14', '.sb-missed-earlier-rule-row', null, { display: 'flex' }],
    ['15', '.sb-missed-earlier-rule-row:first-child .sb-missed-earlier-rule-main', 'Прошедший день', { color: SAND.tx }],
    ['16', '.sb-missed-earlier-rule-row:first-child .sb-missed-earlier-rule-tail', 'остаётся пропуском', { fontSize: '11px', color: SAND.ac2 }],
    ['17', '.sb-missed-earlier-rule-row:nth-child(2) .sb-missed-earlier-rule-tail', 'новая тренировка на свободный день', { fontSize: '11px', color: SAND.ink56 }],
    ['18', '.sb-missed-earlier-rule-row:last-child', null, null],
    ['19', '.sb-missed-earlier-rule-sub', null, { fontSize: '11px', lineHeight: '1.3', color: SAND.ink56 }],
    ['20', '.sb-missed-earlier-rule-row:last-child .sb-missed-earlier-rule-tail', 'нужна правка', { fontSize: '11.5px', color: SAND.ac2 }],
    ['21', '.sb-missed-earlier-footnote', null, { fontSize: '11px', color: SAND.ink56 }],
  ];

  it('row 18 last rule row has no divider', () => {
    const now = new Date('2026-08-10T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.MissedEarlierProposalScreen, canvasProps(now)));
    const last = container.querySelector('.sb-missed-earlier-rule-row:last-child');
    expect(last).toBeTruthy();
    expect(last.style.borderBottom).toMatch(/none/);
  });

  rows.forEach(function ([id, selector, text, expected]) {
    it('row ' + id + ' matches canvas contract on sand', () => {
      const now = new Date('2026-08-10T12:00:00').getTime();
      const { container } = render(React.createElement(Parts.MissedEarlierProposalScreen, canvasProps(now)));
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

  it('accent colors follow palette on blue set', () => {
    applyPaletteVars('blue');
    styleEl.textContent = paletteCss('blue');
    const now = new Date('2026-08-10T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.MissedEarlierProposalScreen, canvasProps(now)));
    const accent = container.querySelector('.sb-missed-earlier-rule-row:first-child .sb-missed-earlier-rule-tail');
    const warn = container.querySelector('.sb-missed-earlier-rule-row:last-child .sb-missed-earlier-rule-tail');
    expect(getComputedStyle(accent).color).toBe(BLUE.ac2);
    expect(getComputedStyle(warn).color).toBe(BLUE.ac2);
  });

  it('buildMissedEarlierSnapshot matches текст contract', () => {
    const now = new Date('2026-08-10T12:00:00').getTime();
    const snap = Parts.buildMissedEarlierSnapshot(canvasProps(now));
    const text = [
      snap.titleLine, snap.keyLine, snap.skippedBadge, snap.replacementLine, snap.proseLine,
      snap.reviewLabel, snap.rulesTier,
      snap.rulePastTitle, snap.rulePastTail,
      snap.ruleReplacementTitle, snap.ruleReplacementTail,
      snap.ruleGuardTitle, snap.ruleGuardSub, snap.ruleGuardTail,
      snap.footnote,
    ].join(' › ');
    expect(text).toContain('Замена вместо вторника');
    expect(text).toContain('та же группа, но полегче');
    expect(text).toContain('пропущено 4 авг');
    expect(text).toContain('замена сегодня, 10 авг');
    expect(text).toContain('Вторник остаётся пропущенным');
    expect(text).toContain('Посмотреть, что предлагает');
    expect(text).toContain('Правила этого случая');
    expect(text).toContain('остаётся пропуском');
    expect(text).toContain('новая тренировка на свободный день');
    expect(text).toContain('нужна правка');
    expect(text).toContain('два исхода, две строки');
  });

  it('isMissedEarlierProposal distinguishes Л6 from Л5 skipped today', () => {
    const props = canvasProps(Date.now());
    expect(Parts.isMissedEarlierProposal(props.training, props.dateKey, props.todayDateKey)).toBe(true);
    const skippedToday = {
      plan: {
        status: 'skipped',
        proposal: { status: 'pending', replacesSkippedDateKey: '2026-08-04' },
      },
    };
    expect(Parts.isMissedEarlierProposal(skippedToday, '2026-08-10', '2026-08-10')).toBe(false);
  });

  it('source exports MissedEarlierProposalScreen in proposal_ui', () => {
    expect(SRC).toContain('function MissedEarlierProposalScreen');
    expect(SRC).toContain('Parts.MissedEarlierProposalScreen = MissedEarlierProposalScreen');
  });
});
