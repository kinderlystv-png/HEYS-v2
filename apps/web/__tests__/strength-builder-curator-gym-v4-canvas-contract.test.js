import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608', tint: '#f6e6dd',
  gr: '#5c6a45', ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)'
});

const BLUE = Object.freeze({
  ac: '#1d5e96', ac2: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff', tint: '#e2ecf6',
  tx: '#101826', c1: '#eef3f9', c2: '#e2ecf6', bg: '#ffffff',
  gr: '#5c6a45', ink56: 'rgba(16, 24, 38, 0.64)', ink62: 'rgba(16, 24, 38, 0.62)'
});

function computedCss(paletteName) {
  const palette = paletteName === 'blue' ? BLUE : CANVAS;
  const inkRgb = paletteName === 'blue' ? '16,24,38' : '0,0,0';
  return `:root{--v4-ink-rgb:${inkRgb};--v4-ink-prose:${palette.ink62};}\n${CSS
    .replaceAll('var(--sb-card)', palette.c1 || CANVAS.c1)
    .replaceAll('var(--sb-bg)', palette.bg || CANVAS.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-sync-muted)', palette.ink62)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--sb-accTx)', palette.ac2)
    .replaceAll('var(--sb-accbg)', palette.tint)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-soft)', palette.c2 || CANVAS.c2)
    .replaceAll('var(--sb-okTx)', palette.gr)
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', palette.onAcs)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function loadModules() {
  return loadHeys();
}

function loadHeys() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  globalThis.prompt = vi.fn(() => null);
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS;
}

function work(weightKg, reps, done, extra) {
  return Object.assign({ weightKg: String(weightKg), reps, done: !!done }, extra || {});
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

describe('И1 · Куратор и зал · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит каноничные классы и строки', () => {
    expect(SUPERSET).toContain('CuratorPlanStrip');
    expect(SUPERSET).toContain('SyncQueuePanel');
    expect(SUPERSET).toContain('Комментарий куратора к упражнению');
    expect(BUILDER).toContain('buildSyncQueueRows');
    expect(CSS).toMatch(/\.sb-cur-plan-letter[\s\S]*width: 34px;/);
    expect(CSS).toMatch(/\.sb-cur-comment-bubble[\s\S]*border-radius: 12px;/);
    expect(CSS).toMatch(/\.sb-pain--canvas[\s\S]*background: var\(--v4-accent-bg/);
  });

  it('доказывает кадр на песочной и синей палитрах', () => {
    const HEYS = loadModules();
    const SB = HEYS.StrengthBuilder;
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss('sand')}`;
    document.head.appendChild(style);

    const assignedAt = Date.now() - 86400000;
    const startedAt = Date.now() - 20 * 60 * 1000;
    const lastMarkAt = Date.now() - 3 * 60 * 1000;
    try {
      render(React.createElement(SB.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            startedAt: startedAt,
            lastMarkAt: lastMarkAt,
            exercises: [{
              name: 'Тяга штанги в наклоне',
              note: 'Спину держи ровнее, вес пока не поднимай. Сними видео последнего подхода.',
              approaches: [
                work(60, 10, true),
                work(60, 10, true, { discomfort: true, discomfortNote: 'плече' })
              ]
            }]
          },
          plan: {
            status: 'started',
            dayLabel: 'День B',
            assignedBy: 'Артём',
            assignedAt: assignedAt
          }
        },
        dateKey: '2026-08-03',
        profile: {},
        onPatch: () => {},
        onClose: () => {},
        syncStatusFor: () => 'pending'
      }));

      const sandRows = [
        ['08', '.sb-cur-plan-letter', 'B', { width: '34px', height: '34px', borderRadius: '11px', color: CANVAS.ac }],
        ['10', '.sb-cur-plan-title', 'Сегодня по плану · День B', { color: CANVAS.tx }],
        ['11', '.sb-cur-plan-meta', 'назначил Артём', { color: CANVAS.ink56 }],
        ['15', '.sb-tier', 'Комментарий куратора к упражнению', { color: CANVAS.ink56 }],
        ['20', '.sb-cur-comment-bubble', 'Спину держи ровнее', { color: CANVAS.tx }],
        ['21', '.sb-cur-comment-meta', 'Артём · куратор', { color: CANVAS.ink56 }],
        ['26', '.sb-pain--canvas b', 'Дискомфорт в плече', { color: CANVAS.ac2 }],
        ['32', '.sb-cur-sync-main span', 'отправлено в', { color: CANVAS.ink56 }],
        ['34', '.sb-cur-sync-offline', 'офлайн', { color: CANVAS.ink62 }]
      ];
      let mismatches = assertRows(sandRows, 'sand');

      style.textContent = `${BASE_CSS}\n${computedCss('blue')}`;
      mismatches = mismatches.concat(assertRows([
        ['08', '.sb-cur-plan-letter', 'B', { color: BLUE.ac }],
        ['26', '.sb-pain--canvas b', 'Дискомфорт', { color: BLUE.ac2 }]
      ], 'blue'));

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
