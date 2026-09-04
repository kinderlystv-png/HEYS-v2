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
  c1: '#f7efe2', tx: '#201e1d', gr: '#5c6a45', grBg: '#eaefe0', ac2: '#a1471c',
  ink56: 'rgba(0, 0, 0, .56)',
});
const BLUE = Object.freeze({
  c1: '#eef3f9', tx: '#101826', gr: '#5c6a45', grBg: '#eaefe0', ac2: '#1d5e96',
  ink56: 'rgba(16, 24, 38, 0.64)',
});

function paletteCss(name) {
  const p = name === 'blue' ? BLUE : SAND;
  const inkRgb = name === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--gr-bg)', p.grBg)
    .replaceAll('var(--ac2)', p.ac2)
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
  const sent = new Date(nowMs);
  sent.setHours(9, 14, 0, 0);
  const resolved = new Date(nowMs);
  resolved.setHours(9, 31, 0, 0);
  return {
    clientName: 'Марина К.',
    programKey: 'Pro Спорт · программа «Верх-низ»',
    dayLabel: 'Верх тела B',
    nowMs,
    proposal: {
      status: 'accepted',
      proposedAt: sent.getTime(),
      resolvedAt: resolved.getTime(),
      rejected: [{ name: 'тяга блока', reason: 'done_approaches_kept' }],
      applied: [{ name: 'Жим', reason: 'approaches_changed' }],
    },
  };
}

function applyPaletteVars(paletteName) {
  const p = paletteName === 'blue' ? BLUE : SAND;
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const root = document.documentElement;
  root.style.setProperty('--tx', p.tx);
  root.style.setProperty('--gr', p.gr);
  root.style.setProperty('--gr-bg', p.grBg);
  root.style.setProperty('--ac2', p.ac2);
  root.style.setProperty('--c1', p.c1);
  root.style.setProperty('--ink', inkRgb);
  root.style.setProperty('--ink56', p.ink56);
}

describe('strength builder · Правка · сторона куратора (кадр Л9)', () => {
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
    const { container } = render(React.createElement(Parts.CuratorEditStatusScreen, canvasProps(now)));
    expect(screen.getByText('Марина К.')).toBeTruthy();
    expect(screen.getByText('Pro Спорт · программа «Верх-низ»')).toBeTruthy();
    expect(screen.getByText('Правка отправлена')).toBeTruthy();
    expect(screen.getByText(/сегодня в 09:14 · Верх тела B/)).toBeTruthy();
    expect(screen.getByText('Принята')).toBeTruthy();
    expect(screen.getByText(/в 09:31 · до начала тренировки/)).toBeTruthy();
    expect(screen.getByText('да')).toBeTruthy();
    expect(screen.getByText('Легло не полностью')).toBeTruthy();
    expect(screen.getByText('тяга блока · подходы уже закрыты')).toBeTruthy();
    expect(screen.getByText('Отказ «не сегодня»')).toBeTruthy();
    expect(screen.getByText('видно, причина — только если указана')).toBeTruthy();
    expect(screen.getByText('Отметка «прочитано»')).toBeTruthy();
    expect(screen.getByText('не показывается')).toBeTruthy();
    expect(container.querySelectorAll('.sb-curator-edit-row').length).toBeGreaterThanOrEqual(5);
    expect(container.querySelector('.sb-curator-edit-footnote')?.textContent)
      .toMatch(/Куратор видит исход/);
  });

  const rows = [
    ['01', '.sb-curator-edit-head', null, { display: 'flex' }],
    ['02', '.sb-curator-edit-head-main', null, { flexDirection: 'column', gap: '3px' }],
    ['03', '.sb-curator-edit-client', 'Марина К.', { color: SAND.tx }],
    ['04', '.sb-curator-edit-program', 'Pro Спорт · программа «Верх-низ»', null],
    ['05', '.sb-curator-edit-scroll', null, { overflowY: 'auto' }],
    ['06', '.sb-curator-edit-card.is-primary', null, { marginTop: '12px', borderRadius: '20px' }],
    ['07', '.sb-curator-edit-row', null, { display: 'flex' }],
    ['08', '.sb-curator-edit-title', 'Правка отправлена', { color: SAND.tx }],
    ['09', '.sb-curator-edit-card.is-primary .sb-curator-edit-sub', null, { fontSize: '11px', color: SAND.ink56 }],
    ['10', '.sb-curator-edit-mark.is-ok', '✓', { fontWeight: '700', fontSize: '12px', color: SAND.gr }],
    ['11', '.sb-curator-edit-badge', 'да', { color: SAND.gr, backgroundColor: SAND.grBg }],
    ['12', '.sb-curator-edit-card.is-primary .sb-curator-edit-row:last-child', null, { borderBottomWidth: '0px' }],
    ['13', '.sb-curator-edit-sub.is-warn', 'тяга блока · подходы уже закрыты', { fontSize: '11px', color: SAND.ac2 }],
    ['14', '.sb-curator-edit-mark.is-warn', '—', { fontWeight: '700', fontSize: '12px', color: SAND.ac2 }],
    ['15', '.sb-curator-edit-card.is-policy', null, { marginTop: '10px' }],
    ['16', '.sb-curator-edit-policy', 'видно, причина — только если указана', { fontWeight: '600', fontSize: '11px', color: SAND.ink56 }],
    ['17', '.sb-curator-edit-footnote', null, { fontSize: '11px', color: SAND.ink56 }],
  ];

  rows.forEach(function ([id, selector, text, expected]) {
    it('row ' + id + ' matches canvas contract on sand', () => {
      const now = new Date('2026-09-05T12:00:00').getTime();
      const { container } = render(React.createElement(Parts.CuratorEditStatusScreen, canvasProps(now)));
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

  it('warn/ok colors follow palette on blue set', () => {
    applyPaletteVars('blue');
    styleEl.textContent = paletteCss('blue');
    const now = new Date('2026-09-05T12:00:00').getTime();
    const { container } = render(React.createElement(Parts.CuratorEditStatusScreen, canvasProps(now)));
    const ok = container.querySelector('.sb-curator-edit-mark.is-ok');
    const warn = container.querySelector('.sb-curator-edit-mark.is-warn');
    expect(getComputedStyle(ok).color).toBe(BLUE.gr);
    expect(getComputedStyle(warn).color).toBe(BLUE.ac2);
  });

  it('buildCuratorEditSnapshot matches текст contract', () => {
    const now = new Date('2026-09-05T12:00:00').getTime();
    const snap = Parts.buildCuratorEditSnapshot(canvasProps(now));
    const text = [
      snap.clientName, snap.programKey, snap.sentTitle, snap.sentSub,
      snap.resolutionTitle, snap.resolutionSub, snap.resolutionBadge,
      snap.partialTitle, snap.partialSub, snap.policyDeclineTitle, snap.policyDeclineSub,
      snap.policyReadTitle, snap.policyReadSub, snap.footnote,
    ].join(' › ');
    expect(text).toContain('Марина К.');
    expect(text).toContain('Pro Спорт · программа «Верх-низ»');
    expect(text).toContain('Правка отправлена');
    expect(text).toContain('сегодня в 09:14 · Верх тела B');
    expect(text).toContain('Принята');
    expect(text).toContain('в 09:31 · до начала тренировки');
    expect(text).toContain('да');
    expect(text).toContain('Легло не полностью');
    expect(text).toContain('тяга блока · подходы уже закрыты');
    expect(text).toContain('видно, причина — только если указана');
    expect(text).toContain('не показывается');
    expect(text).toContain('Куратор видит исход');
  });

  it('source exports CuratorEditStatusScreen in proposal_ui', () => {
    expect(SRC).toContain('function CuratorEditStatusScreen');
    expect(SRC).toContain('Parts.CuratorEditStatusScreen = CuratorEditStatusScreen');
  });
});
