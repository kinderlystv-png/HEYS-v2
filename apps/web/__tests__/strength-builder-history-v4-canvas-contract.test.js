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
const BLUE_COLORS = Object.freeze({
  bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tint: '#e2ecf6', tx: '#101826',
  ac: '#1d5e96', ac2: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
  gr: '#5c6a45', grBg: '#eaefe0', ink56: 'rgba(16, 24, 38, .56)', ink55: 'rgba(16, 24, 38, .55)'
});

function historyPaletteCss(paletteName) {
  const palette = paletteName === 'blue' ? BLUE_COLORS : CANVAS_COLORS;
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8')
    .replaceAll('var(--bg)', palette.bg)
    .replaceAll('var(--c1)', palette.c1)
    .replaceAll('var(--c2)', palette.c2)
    .replaceAll('var(--tint)', palette.tint)
    .replaceAll('var(--tx)', palette.tx)
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('var(--ac)', palette.ac)
    .replaceAll('var(--ac2)', palette.ac2)
    .replaceAll('var(--acs)', palette.acs)
    .replaceAll('var(--on-acs)', palette.onAcs)
    .replaceAll('var(--gr)', palette.gr)
    .replaceAll('var(--gr-bg)', palette.grBg)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
}

const FINISH_CSS = historyPaletteCss('sand');

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

function historyContractRows(colors) {
  return [
    ['01', '.sb-history-screen .sb-finish-head', null, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
      paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px'
    }],
    ['02', '.sb-history-screen .sb-icon-btn', '‹', {
      width: '36px', height: '36px', borderRadius: '999px', backgroundColor: colors.c1,
      color: colors.ink56, fontSize: '13px', fontWeight: '600', lineHeight: '1'
    }],
    ['03', '.sb-history-screen .sb-head-title', null, {
      display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '3px'
    }],
    ['04', '.sb-history-screen .sb-head-title b', 'Жим лёжа', {
      color: colors.tx, fontSize: '15px', fontWeight: '700', lineHeight: '1'
    }],
    ['06', '.sb-history-screen .sb-list', null, { overflowY: 'auto' }],
    ['07', '.sb-history-metrics', null, { gap: '8px', marginTop: '10px' }],
    ['08', '.sb-history-metrics .sb-finish-metric.is-accent', null, {
      backgroundColor: colors.tint,
      boxShadow: `inset 0 0 0 1.5px ${colors.acs}`
    }],
    ['09', '.sb-history-metrics .sb-finish-metric.is-accent .sb-finish-metric-label', 'Рекорд', {
      color: colors.ink56, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase'
    }],
    ['10', '.sb-history-metrics .sb-finish-metric.is-accent .sb-finish-metric-line b', '75 × 8', {
      color: colors.ac, fontSize: '17px', fontWeight: '800', fontVariantNumeric: 'tabular-nums'
    }],
    ['11', '.sb-history-metrics .sb-finish-metric:nth-child(2)', null, {
      flexDirection: 'column', gap: '5px', paddingTop: '10px', paddingBottom: '10px',
      paddingLeft: '11px', paddingRight: '11px', borderRadius: '14px', backgroundColor: colors.bg
    }],
    ['12', '.sb-history-metrics .sb-finish-metric:nth-child(2) .sb-finish-metric-line b', '95 кг', {
      color: colors.tx, fontSize: '17px', fontWeight: '800'
    }],
    ['13', '.sb-history-screen .sb-finish-tier', 'Последние тренировки', {
      color: colors.ac, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
    }],
    ['14', '.sb-history-sessions.sb-finish-detail', null, { marginTop: '10px' }],
    ['15', '.sb-history-session.sb-finish-row', null, { alignItems: 'flex-start' }],
    ['16', '.sb-history-session:first-child > span', null, {
      display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '6px'
    }],
    ['17', '.sb-history-session:first-child > span > span:first-child', null, {
      display: 'flex', alignItems: 'center', gap: '7px'
    }],
    ['18', '.sb-history-session:first-child > span > span:first-child > span:first-child', '8 августа', {
      color: colors.tx
    }],
    ['19', '.sb-history-badge.is-record', 'рекорд', {
      backgroundColor: colors.tint, color: colors.ac,
      borderRadius: '999px', fontSize: '10px', fontWeight: '600'
    }],
    ['20', '.sb-history-session:first-child > span > span:last-child', null, {
      display: 'flex', gap: '5px', flexWrap: 'wrap'
    }],
    ['21', '.sb-history-set', '75 × 8', {
      height: '32px', paddingLeft: '12px', paddingRight: '12px',
      backgroundColor: colors.bg, color: colors.tx,
      fontSize: '12.5px', fontWeight: '700'
    }],
    ['22', '.sb-history-session:first-child > b', '2\u00a0390 кг', {
      color: colors.tx, fontSize: '12.5px', fontWeight: '600'
    }],
    ['23', '.sb-history-badge.is-quiet', 'по плану', {
      color: colors.ink56, fontSize: '10px', fontWeight: '600'
    }],
    ['24', '.sb-history-session.is-last', null, { borderBottomWidth: '0px' }],
    ['25', '.sb-history-badge.is-warning', 'дискомфорт', {
      backgroundColor: colors.tint, color: colors.ac2,
      fontSize: '10px', fontWeight: '600'
    }],
    ['26', '.sb-history-session.is-last > b', '1\u00a0610 кг', {
      color: colors.ink55, fontSize: '12.5px', fontWeight: '600'
    }],
    ['27', '.sb-history-sessions.sb-finish-detail', null, { marginTop: '10px' }],
    ['29', '.sb-history-growth .sb-finish-row.is-last > span', null, {
      display: 'flex', flexDirection: 'column', gap: '3px'
    }],
    ['30', '.sb-history-growth-note', 'расчёт по весу и повторам, не замер', {
      fontSize: '11px', fontWeight: '500', lineHeight: '1.3', color: colors.ink56
    }],
    ['31', '.sb-history-growth .sb-finish-row.is-last > b.is-quiet', '95 кг', {
      color: colors.ink55, fontSize: '12.5px', fontWeight: '600'
    }],
    ['32', '.sb-history-chart.sb-finish-chart-card', null, {
      padding: '16px', borderRadius: '20px', backgroundColor: colors.c1
    }],
    ['33', '.sb-history-chart .sb-finish-chart-head', null, {
      alignItems: 'baseline', gap: '8px'
    }],
    ['34', '.sb-history-chart .sb-finish-chart-head span', 'шесть последних недель', {
      flexGrow: '1', color: colors.ink56, fontSize: '11.5px', fontWeight: '600', lineHeight: '1.3'
    }],
    ['35', '.sb-history-chart .sb-finish-chart-head b', null, {
      color: colors.tx, fontSize: '17px', fontWeight: '800'
    }],
    ['36', '.sb-history-chart .sb-finish-chart', null, {
      display: 'flex', alignItems: 'flex-end', gap: '6px', height: '112px', marginTop: '12px'
    }],
    ['37', '.sb-history-chart .sb-finish-chart-column', null, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px'
    }],
    ['38', '.sb-history-chart .sb-finish-chart-column:first-child b', null, {
      color: colors.ink56, fontSize: '9.5px', fontWeight: '700', fontVariantNumeric: 'tabular-nums'
    }],
    ['39', '.sb-history-chart .sb-finish-chart-column:first-child i', null, {
      width: '100%', borderRadius: '7px 7px 0px 0px', backgroundColor: colors.c2
    }],
    ['40', '.sb-history-chart .sb-finish-chart-column:first-child small', 'н1', {
      color: colors.ink56, fontSize: '9px', fontWeight: '600'
    }],
    ['45', '.sb-history-chart .sb-finish-chart-column.is-latest b', null, {
      color: colors.ac, fontSize: '9.5px', fontWeight: '700'
    }],
    ['46', '.sb-history-chart .sb-finish-chart-column.is-latest i', null, {
      width: '100%', borderRadius: '7px 7px 0px 0px', backgroundColor: colors.acs
    }],
    ['47', '.sb-history-chart .sb-finish-chart-column.is-latest small', null, {
      color: colors.ac, fontSize: '9px', fontWeight: '600'
    }],
    ['49', '.sb-history-screen .sb-finish-footnote', null, {
      fontSize: '11px', fontWeight: '500', lineHeight: '1.55', color: colors.ink56
    }]
  ];
}

function assertContractRows(rows, paletteLabel) {
  const mismatches = [];
  rows.forEach(([id, selector, text, expectedStyle]) => {
    const node = document.querySelector(selector);
    if (!node) {
      mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing', palette: paletteLabel });
      return;
    }
    if (text != null && !node.textContent.includes(text)) {
      mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent, palette: paletteLabel });
    }
    const actualStyle = getComputedStyle(node);
    Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
      if (actualStyle[property] !== expected) {
        mismatches.push({
          id, selector, field: `computed.${property}`, expected, actual: actualStyle[property], palette: paletteLabel
        });
      }
    });
  });
  expect(mismatches).toEqual([]);
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
    expect(screen.getByText(/Рекорд — это подход, а не число/)).toBeTruthy();
  });

  it('доказывает DOM/computed-style контракт ·01–49 (sand)', () => {
    render(React.createElement(Finish.HistoryScreen, canvasProps()));
    assertContractRows(historyContractRows(CANVAS_COLORS), 'sand');
  });

  it('доказывает цветовые роли ·02/08/10/19/21/25/45–47 (blue)', () => {
    historyStyle.textContent = `${BASE_CSS}\n${historyPaletteCss('blue')}`;
    render(React.createElement(Finish.HistoryScreen, canvasProps()));
    const colorRows = historyContractRows(BLUE_COLORS).filter(([id]) => (
      ['02', '08', '10', '19', '21', '25', '45', '46', '47'].includes(id)
    ));
    assertContractRows(colorRows, 'blue');
  });

  it('доказывает JS-логику ·05/28/41–44: ключ, рост и высоты столбцов', () => {
    render(React.createElement(Finish.HistoryScreen, canvasProps()));

    expect(screen.getByText(/Грудь · .* · 3 тренировок/i)).toBeTruthy();

    const growth = document.querySelector('.sb-history-growth .sb-finish-row:first-child b');
    expect(growth?.textContent).toMatch(/^\+[0-9]+ кг за [0-9]+ тренировок$/);

    const bars = document.querySelectorAll('.sb-history-chart .sb-finish-chart-column i');
    expect(bars.length).toBe(3);
    bars.forEach((bar) => {
      const height = parseInt(getComputedStyle(bar).height, 10);
      expect(height).toBeGreaterThanOrEqual(41);
      expect(height).toBeLessThanOrEqual(78);
    });
    const latestBar = document.querySelector('.sb-history-chart .sb-finish-chart-column.is-latest i');
    expect(parseInt(getComputedStyle(latestBar).height, 10)).toBeGreaterThanOrEqual(41);
  });

  it('раскрывает скрытые сессии по кнопке «Ещё N тренировок»', () => {
    const usages = canvasUsages().concat(Array.from({ length: 12 }, (_, index) => ({
      dateKey: '2026-06-' + String(index + 1).padStart(2, '0'),
      label: 'июнь ' + (index + 1),
      approaches: [done(60, 8)]
    })));
    render(React.createElement(Finish.HistoryScreen, canvasProps({ usages })));

    expect(screen.getByRole('button', { name: /Ещё 12 тренировок/ })).toBeTruthy();
    const moreBtn = screen.getByRole('button', { name: /Ещё 12 тренировок/ });
    expect(getComputedStyle(moreBtn).marginTop).toBe('10px');
    fireEvent.click(screen.getByRole('button', { name: /Ещё 12 тренировок/ }));
    expect(screen.queryByRole('button', { name: /Ещё 12 тренировок/ })).toBeNull();
    expect(document.querySelectorAll('.sb-history-session').length).toBeGreaterThan(3);
  });
});
