import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const CANVAS_COLORS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tint: '#f6e6dd', tx: '#201e1d',
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608',
  gr: '#5c6a45', grBg: '#eaefe0', ink56: 'rgba(0, 0, 0, .56)', ink38: 'rgba(0, 0, 0, .38)'
});

function cyclePaletteCss() {
  const p = CANVAS_COLORS;
  return fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8')
    .replaceAll('var(--bg)', p.bg)
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--c2)', p.c2)
    .replaceAll('var(--tint)', p.tint)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--ink)', '0, 0, 0')
    .replaceAll('var(--ac)', p.ac)
    .replaceAll('var(--ac2)', p.ac2)
    .replaceAll('var(--acs)', p.acs)
    .replaceAll('var(--on-acs)', p.onAcs)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--gr-bg)', p.grBg)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
}

const CYCLE_CSS = cyclePaletteCss();

function loadParts() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

function canvasProgram() {
  return {
    id: 'pr_cycle',
    title: 'Набор массы',
    weeks: 8,
    startDate: '2026-08-04',
    assignedBy: 'Артём',
    status: 'active',
    phases: [
      {
        name: 'Втягивание',
        detail: 'Недели 1–3 · вес 70 % от рабочего · 18 т',
        weeks: [1, 2, 3],
        tonnageTargetKg: 18000
      },
      {
        name: 'Работа',
        detail: 'Недели 4–7 · вес растёт до 100 % · 52 т',
        weeks: [4, 5, 6, 7],
        tonnageTargetKg: 52000
      },
      {
        name: 'Разгрузка',
        detail: 'Неделя 8 · объём вдвое меньше · 12 т',
        weeks: [8],
        tonnageTargetKg: 12000
      }
    ],
    days: []
  };
}

function canvasDays() {
  return [
    { date: '2026-08-04', dayLabel: 'День A · верх тела', weekIndex: 1, status: 'done' },
    { date: '2026-08-06', dayLabel: 'День B · низ тела', weekIndex: 1, status: 'done' },
    { date: '2026-08-08', dayLabel: 'День C · всё тело', weekIndex: 2, status: 'assigned' }
  ];
}

function canvasSnapshot(Parts) {
  return Parts.buildProgramCycleSnapshot(canvasProgram(), canvasDays(), null, {
    today: '2026-08-08'
  });
}

function styleOf(el, prop) {
  return window.getComputedStyle(el).getPropertyValue(prop).trim();
}

describe('strength builder · Г1 Программа · цикл', () => {
  let Parts;

  beforeEach(() => {
    Parts = loadParts();
    const style = document.createElement('style');
    style.id = 'cycle-contract-css';
    style.textContent = BASE_CSS + '\n' + CYCLE_CSS;
    document.head.appendChild(style);
  });

  afterEach(() => {
    cleanup();
    document.getElementById('cycle-contract-css')?.remove();
    delete window.HEYS;
  });

  it('renders contract copy: title, curator, week badge, metrics', () => {
    const snapshot = canvasSnapshot(Parts);
    snapshot.doneCount = 4;
    snapshot.totalCount = 12;
    snapshot.doneVolume = 26000;
    snapshot.plannedVolume = 82000;
    snapshot.recordCount = 2;
    const { container } = render(React.createElement(Parts.CycleScreen, {
      program: canvasProgram(),
      days: canvasDays(),
      snapshot: snapshot,
      onClose: vi.fn()
    }));
    expect(screen.getByText('Набор массы · 8 недель')).toBeTruthy();
    expect(screen.getByText('назначил Артём · с 4 августа')).toBeTruthy();
    expect(screen.getByText('неделя 2')).toBeTruthy();
    expect(screen.getByText('4 / 12')).toBeTruthy();
    expect(screen.getByText('26 т / 82 т')).toBeTruthy();
    expect(container.querySelector('.sb-cycle-metric.is-accent .sb-cycle-metric-value')?.textContent).toBe('2');
    expect(screen.getByText('Фазы недель')).toBeTruthy();
    expect(screen.getByText('Эта неделя')).toBeTruthy();
    expect(screen.getByText('сегодня')).toBeTruthy();
  });

  it('geometry: header column gap 3px and metric tiles', () => {
    const { container } = render(React.createElement(Parts.CycleScreen, {
      program: canvasProgram(),
      days: canvasDays(),
      snapshot: canvasSnapshot(Parts),
      onClose: vi.fn()
    }));
    const main = container.querySelector('.sb-cycle-top-main');
    expect(main).toBeTruthy();
    expect(styleOf(main, 'flex-direction')).toBe('column');
    expect(styleOf(main, 'gap')).toBe('3px');

    const metric = container.querySelector('.sb-cycle-metric');
    expect(metric).toBeTruthy();
    expect(styleOf(metric, 'flex-grow')).toBe('1');
    expect(styleOf(metric, 'border-radius')).toBe('14px');
    expect(styleOf(metric, 'padding-top')).toBe('10px');
    expect(styleOf(metric, 'padding-right')).toBe('11px');

    const label = container.querySelector('.sb-cycle-metric-label');
    expect(styleOf(label, 'font-size')).toBe('9.5px');
    expect(styleOf(label, 'text-transform')).toBe('uppercase');

    const value = container.querySelector('.sb-cycle-metric-value');
    expect(styleOf(value, 'font-size')).toBe('17px');
    expect(styleOf(value, 'font-weight')).toBe('800');
  });

  it('geometry: active phase border and week cells', () => {
    const { container } = render(React.createElement(Parts.CycleScreen, {
      program: canvasProgram(),
      days: canvasDays(),
      snapshot: canvasSnapshot(Parts),
      onClose: vi.fn()
    }));
    const active = container.querySelector('.sb-cycle-phase.is-active');
    expect(active).toBeTruthy();
    expect(styleOf(active, 'border-radius')).toBe('16px');
    expect(styleOf(active, 'margin-bottom')).toBe('8px');

    const num = active.querySelector('.sb-cycle-phase-num.is-active');
    expect(styleOf(num, 'width')).toBe('26px');
    expect(styleOf(num, 'height')).toBe('26px');
    expect(styleOf(num, 'border-radius')).toBe('9px');

    const doneCell = container.querySelector('.sb-cycle-week-cell.is-done');
    expect(styleOf(doneCell, 'height')).toBe('22px');
    expect(styleOf(doneCell, 'border-radius')).toBe('7px');
    expect(styleOf(doneCell, 'background-color')).toBe(CANVAS_COLORS.grBg);

    const planCell = container.querySelector('.sb-cycle-week-cell.is-plan');
    expect(styleOf(planCell, 'background-color')).toBe(CANVAS_COLORS.bg);
  });

  it('geometry: week list row and today status color', () => {
    const { container } = render(React.createElement(Parts.CycleScreen, {
      program: canvasProgram(),
      days: canvasDays(),
      snapshot: canvasSnapshot(Parts),
      onClose: vi.fn()
    }));
    const lastRow = container.querySelector('.sb-cycle-week-row.is-last');
    expect(lastRow).toBeTruthy();
    expect(styleOf(lastRow, 'border-bottom-style')).toBe('none');

    const today = container.querySelector('.sb-cycle-week-status.is-today');
    expect(styleOf(today, 'font-size')).toBe('11px');
    expect(styleOf(today, 'font-weight')).toBe('600');
    expect(styleOf(today, 'color')).toBe(CANVAS_COLORS.ac);
  });
});
