import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  c1: '#f7efe2', tx: '#201e1d', ink56: 'rgba(0, 0, 0, .56)', ink35: 'rgba(0, 0, 0, .35)'
});

function computedCss() {
  return `:root{--v4-ink-rgb:0,0,0;}\n${CSS
    .replaceAll('var(--sb-card)', CANVAS.c1)
    .replaceAll('var(--v4-c1, var(--sb-card))', CANVAS.c1)
    .replaceAll('var(--sb-tx)', CANVAS.tx)
    .replaceAll('var(--sb-mut)', CANVAS.ink56)
    .replaceAll('var(--ink)', '0, 0, 0')
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function loadParts() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  return globalThis.HEYS.StrengthBuilderParts;
}

describe('И2 · Шторка ⋯ · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит шесть входов canvas и геометрию листа', () => {
    expect(SUPERSET).toContain('Назначено против сделано');
    expect(SUPERSET).toContain('Круговой режим');
    expect(SUPERSET).toContain('Заметка к тренировке');
    expect(CSS).toMatch(/\.sb-builder-screen \.sb-sheet-grip[\s\S]*width: 38px;/);
    expect(CSS).toMatch(/\.sb-sheet-menu-copy[\s\S]*gap: 3px;/);
  });

  it('рендерит строки меню и сноску', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss()}`;
    document.head.appendChild(style);
    const seen = [];
    try {
      render(React.createElement(function SheetDemo() {
        const rows = Parts.sheetRows({
          exercises: [{ name: 'Жим гантелей сидя', approaches: [] }, { name: 'Тяга', approaches: [] }],
          openIdx: 0,
          close: () => {},
          go: (view) => seen.push(view),
          setLinkFrom: () => {},
          setHistoryName: () => {},
          setWarmupDropIdx: () => {},
          setApproachTypesIdx: () => {},
          hasPlanSnapshot: true
        });
        return React.createElement('div', { className: 'sb-builder-screen' },
          React.createElement('div', { className: 'sb-sheet' },
            React.createElement('div', { className: 'sb-sheet-grip' }),
            rows.map(function (row, i) {
              return React.createElement('button', {
                key: i,
                type: 'button',
                className: 'sb-sheet-menu-row',
                disabled: !!row.off,
                onClick: row.go
              },
                React.createElement('span', { className: 'sb-sheet-menu-copy' },
                  React.createElement('b', null, row.t),
                  React.createElement('span', null, row.d)
                ),
                React.createElement('span', {
                  className: 'sb-sheet-menu-chevron'
                    + (row.chevron === 'muted' ? ' is-muted' : ' is-dim')
                }, '›')
              );
            }),
            React.createElement('p', { className: 'sb-sheet-footnote' },
              'Всё, что не нужно посреди подхода, живёт здесь: шаблоны, каталог, история, отчёт куратора и заметка. Шапка сессии несёт только время и счёт подходов — семь входов в ней превратили бы её в панель управления.')
          )
        );
      }));

      expect(screen.getByText('Порядок упражнений')).toBeTruthy();
      expect(screen.getByText('Каталог упражнений')).toBeTruthy();
      expect(screen.getByText('История и рекорды')).toBeTruthy();
      expect(screen.getByText('Круговой режим')).toBeTruthy();
      expect(screen.getByText('Назначено против сделано')).toBeTruthy();
      expect(screen.getByText('Заметка к тренировке')).toBeTruthy();

      fireEvent.click(screen.getByText('Назначено против сделано'));
      expect(seen).toEqual(['plan-vs-done']);

      const grip = document.querySelector('.sb-sheet-grip');
      expect(getComputedStyle(grip).width).toBe('38px');
      expect(getComputedStyle(grip).height).toBe('4px');
    } finally {
      style.remove();
    }
  });
});
