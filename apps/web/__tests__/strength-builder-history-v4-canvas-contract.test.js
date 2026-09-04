import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const CANVAS_COLORS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tint: '#f6e6dd', tx: '#201e1d',
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608',
  gr: '#5c6a45', grBg: '#eaefe0', ink56: 'rgba(0, 0, 0, .56)', ink55: 'rgba(0, 0, 0, .55)'
});
const FINISH_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8')
  .replaceAll('var(--bg)', CANVAS_COLORS.bg)
  .replaceAll('var(--c1)', CANVAS_COLORS.c1)
  .replaceAll('var(--c2)', CANVAS_COLORS.c2)
  .replaceAll('var(--tint)', CANVAS_COLORS.tint)
  .replaceAll('var(--tx)', CANVAS_COLORS.tx)
  .replaceAll('var(--ink)', '0, 0, 0')
  .replaceAll('var(--ac)', CANVAS_COLORS.ac)
  .replaceAll('var(--ac2)', CANVAS_COLORS.ac2)
  .replaceAll('var(--acs)', CANVAS_COLORS.acs)
  .replaceAll('var(--on-acs)', CANVAS_COLORS.onAcs)
  .replaceAll('var(--gr)', CANVAS_COLORS.gr)
  .replaceAll('var(--gr-bg)', CANVAS_COLORS.grBg)
  .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');

function loadFinish() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  delete globalThis.HEYS.StrengthFinishUI;
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  return globalThis.HEYS.StrengthFinishUI;
}

const done = (weightKg, reps, extra) => ({
  weightKg: String(weightKg), reps, done: true, ...(extra || {})
});

function canvasUsages() {
  return [
    {
      dateKey: '2026-08-08',
      label: '8 августа',
      approaches: [done(75, 8), done(75, 8), done(70, 9), done(70, 8)]
    },
    {
      dateKey: '2026-08-01',
      label: '1 августа',
      approaches: [done('72,5', 8), done('72,5', 8), done(70, 8)]
    },
    {
      dateKey: '2026-07-25',
      label: '25 июля',
      approaches: [
        done(70, 8),
        done(70, 8, { discomfort: true }),
        done(70, 7)
      ]
    }
  ];
}

function canvasProps(extra) {
  const meta = globalThis.HEYS?.exerciseMeta;
  const readMeta = meta?.get?.bind(meta);
  if (meta && readMeta) {
    meta.get = (name) => name === 'Жим лёжа'
      ? { primaryGroup: 'chest', secondaryGroups: ['triceps'] }
      : readMeta(name);
  }
  return {
    name: 'Жим лёжа',
    usages: canvasUsages(),
    record: { maxW: 75, maxSet: 600, total: 34000 },
    onBack: vi.fn(),
    ...(extra || {})
  };
}

let Finish;
let historyStyle;

beforeEach(() => {
  Finish = loadFinish();
  historyStyle = document.createElement('style');
  historyStyle.textContent = `${BASE_CSS}\n${FINISH_CSS}`;
  document.head.appendChild(historyStyle);
});

afterEach(() => {
  cleanup();
  historyStyle?.remove();
});

describe('Д1 · История упражнения', { timeout: 45_000 }, () => {
  it('рисует рекорд подходом, три плитки и сессии с тегами', () => {
    render(React.createElement(Finish.HistoryScreen, canvasProps()));

    expect(screen.getByText('Жим лёжа')).toBeTruthy();
    expect(screen.getByText(/Грудь · .* · 3 тренировок/)).toBeTruthy();
    expect(document.querySelector('.sb-history-metrics .sb-finish-metric.is-accent .sb-finish-metric-line b')?.textContent).toBe('75 × 8');
    expect(document.querySelector('.sb-history-metrics .sb-finish-metric:nth-child(2) .sb-finish-metric-line b')?.textContent).toBe('95 кг');
    expect(screen.getByText('5,7 т')).toBeTruthy();
    expect(screen.getByText('Последние тренировки')).toBeTruthy();
    expect(screen.getByText('8 августа')).toBeTruthy();
    expect(screen.getByText('рекорд')).toBeTruthy();
    expect(screen.getByText('по плану')).toBeTruthy();
    expect(screen.getByText('дискомфорт')).toBeTruthy();
    expect(document.querySelector('.sb-history-session:first-child > b')?.textContent).toBe('2\u00a0390 кг');
    expect(screen.getByText('Расчётный максимум вырос')).toBeTruthy();
    expect(screen.getByText('расчёт по весу и повторам, не замер')).toBeTruthy();
    expect(document.querySelector('.sb-history-screen')).toBeTruthy();
    expect(document.querySelectorAll('.sb-history-set')).toHaveLength(10);
  });

  it('доказывает DOM/computed-style контракт шапки, плиток и графика', () => {
    render(React.createElement(Finish.HistoryScreen, canvasProps()));

    const rows = [
      ['01', '.sb-history-screen .sb-finish-head', null, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px'
      }],
      ['02', '.sb-history-screen .sb-icon-btn', '‹', {
        width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS_COLORS.c1,
        color: CANVAS_COLORS.ink56, fontSize: '13px', fontWeight: '600', lineHeight: '1'
      }],
      ['04', '.sb-history-screen .sb-head-title b', 'Жим лёжа', {
        color: CANVAS_COLORS.tx, fontSize: '15px', fontWeight: '700', lineHeight: '1'
      }],
      ['08', '.sb-history-metrics .sb-finish-metric.is-accent', null, {
        backgroundColor: CANVAS_COLORS.tint,
        boxShadow: `inset 0 0 0 1.5px ${CANVAS_COLORS.acs}`
      }],
      ['10', '.sb-history-metrics .sb-finish-metric.is-accent .sb-finish-metric-line b', '75 × 8', {
        color: CANVAS_COLORS.ac, fontSize: '17px', fontWeight: '800', fontVariantNumeric: 'tabular-nums'
      }],
      ['12', '.sb-history-metrics .sb-finish-metric:nth-child(2) .sb-finish-metric-line b', '95 кг', {
        color: CANVAS_COLORS.tx, fontSize: '17px', fontWeight: '800'
      }],
      ['13', '.sb-history-screen .sb-finish-tier', 'Последние тренировки', {
        color: CANVAS_COLORS.ac, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
      }],
      ['22', '.sb-history-session:first-child > b', '2\u00a0390 кг', {
        color: CANVAS_COLORS.tx, fontSize: '12.5px', fontWeight: '600'
      }],
      ['19', '.sb-history-badge.is-record', 'рекорд', {
        backgroundColor: CANVAS_COLORS.tint, color: CANVAS_COLORS.ac,
        borderRadius: '999px', fontSize: '10px', fontWeight: '600'
      }],
      ['21', '.sb-history-set', '75 × 8', {
        height: '32px', paddingLeft: '12px', paddingRight: '12px',
        backgroundColor: CANVAS_COLORS.bg, color: CANVAS_COLORS.tx,
        fontSize: '12.5px', fontWeight: '700'
      }],
      ['23', '.sb-history-badge.is-quiet', 'по плану', {
        color: CANVAS_COLORS.ink56, fontSize: '10px', fontWeight: '600'
      }],
      ['25', '.sb-history-badge.is-warning', 'дискомфорт', {
        backgroundColor: CANVAS_COLORS.tint, color: CANVAS_COLORS.ac2,
        fontSize: '10px', fontWeight: '600'
      }],
      ['30', '.sb-history-growth-note', 'расчёт по весу и повторам, не замер', {
        fontSize: '11px', fontWeight: '500', lineHeight: '1.3', color: CANVAS_COLORS.ink56
      }],
      ['36', '.sb-history-chart .sb-finish-chart', null, {
        display: 'flex', alignItems: 'flex-end', gap: '6px', height: '112px', marginTop: '12px'
      }],
      ['49', '.sb-history-screen .sb-finish-footnote', null, {
        fontSize: '11px', fontWeight: '500', lineHeight: '1.55', color: CANVAS_COLORS.ink56
      }]
    ];

    const mismatches = [];
    rows.forEach(([id, selector, text, expectedStyle]) => {
      const node = document.querySelector(selector);
      if (!node) {
        mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
        return;
      }
      if (text != null && !node.textContent.includes(text)) {
        mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent });
      }
      const actualStyle = getComputedStyle(node);
      Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
        if (actualStyle[property] !== expected) {
          mismatches.push({ id, selector, field: `computed.${property}`, expected, actual: actualStyle[property] });
        }
      });
    });
    expect(mismatches).toEqual([]);
  });

  it('раскрывает скрытые сессии по кнопке «Ещё N тренировок»', () => {
    const usages = canvasUsages().concat(Array.from({ length: 12 }, (_, index) => ({
      dateKey: '2026-06-' + String(index + 1).padStart(2, '0'),
      label: 'июнь ' + (index + 1),
      approaches: [done(60, 8)]
    })));
    render(React.createElement(Finish.HistoryScreen, canvasProps({ usages })));

    expect(screen.getByRole('button', { name: /Ещё 12 тренировок/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ещё 12 тренировок/ }));
    expect(screen.queryByRole('button', { name: /Ещё 12 тренировок/ })).toBeNull();
    expect(document.querySelectorAll('.sb-history-session').length).toBeGreaterThan(3);
  });
});
