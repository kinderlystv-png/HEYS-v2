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
  gr: '#5c6a45', grBg: '#eaefe0', ink56: 'rgba(16, 24, 38, 0.64)', ink55: 'rgba(16, 24, 38, 0.55)'
});

function finishPaletteCss(paletteName) {
  const palette = paletteName === 'blue' ? BLUE_COLORS : CANVAS_COLORS;
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  // jsdom does not resolve nested custom properties inside rgba() and rejects
  // env() in shorthand. Compile only the canonical Canvas palette for this
  // computed-style regression; the production stylesheet remains untouched.
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

const FINISH_CSS = finishPaletteCss('sand');

function loadFinish() {
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
  ev('strength/heys_strength_finish_ui_v1.js');
  return globalThis.HEYS.StrengthFinishUI;
}

const done = (weightKg, reps, extra) => ({
  weightKg: String(weightKg), reps, done: true, ...(extra || {})
});

function training(exercises, extraLog) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises, ...(extraLog || {}) }
  };
}

function canvasTraining() {
  return training([
    {
      name: 'Жим лёжа',
      approaches: [
        done(40, 10, { type: 'warmup' }),
        done(45, 8, { type: 'warmup' }),
        done(50, 6, { type: 'warmup' }),
        done(55, 4, { type: 'warmup' }),
        done(75, 8),
        done(75, 8),
        done(70, 10),
        done(70, 10)
      ]
    },
    {
      name: 'Тяга штанги в наклоне',
      approaches: Array.from({ length: 5 }, () => done(60, 10))
    },
    {
      name: 'Жим гантелей сидя',
      approaches: Array.from({ length: 4 }, () => done(24, 10))
    },
    {
      name: 'Планка', unit: 'time',
      approaches: [{ durationSec: 180, reps: 1, done: true }]
    },
    {
      name: 'Подтягивания', unit: 'bodyweight', bodyweightFactor: 0.65,
      approaches: [done('', 10), done('', 10), done('', 10), done('', 9)]
    },
    {
      name: 'Отжимания на брусьях', unit: 'bodyweight',
      approaches: [done('', 10)]
    }
  ], { feedback: { mood: 7, wellbeing: 8, stress: 5 } });
}

function canvasProps(extra) {
  const meta = globalThis.HEYS?.exerciseMeta;
  const readMeta = meta?.get?.bind(meta);
  if (meta && readMeta) {
    const primaryGroups = {
      'Жим лёжа': 'chest',
      'Тяга штанги в наклоне': 'back',
      'Жим гантелей сидя': 'shoulders'
    };
    meta.get = (name) => primaryGroups[name]
      ? { primaryGroup: primaryGroups[name], secondaryGroups: [] }
      : readMeta(name);
  }
  return {
    training: canvasTraining(),
    dateKey: '2026-08-08',
    elapsedSec: 3270,
    bodyWeightKg: 80,
    dayTonnageKg: 14200,
    strengthCount: 2,
    previousComparableTonnageKg: 7668,
    historyFor: (name) => name === 'Жим лёжа'
      ? { record: { maxW: 70, maxSet: 550, total: 1200 } }
      : { record: null },
    historyDetailFor: () => ({
      usages: [69, 69.75, 66.75, 67.5, 66]
        .map((weight) => ({ approaches: [done(weight, 10)] }))
    }),
    onBack: vi.fn(),
    onDone: vi.fn(),
    ...(extra || {})
  };
}

let Finish;
let finishStyle;

beforeEach(() => {
  Finish = loadFinish();
  finishStyle = document.createElement('style');
  finishStyle.textContent = `${BASE_CSS}\n${FINISH_CSS}`;
  document.head.appendChild(finishStyle);
});

afterEach(() => {
  cleanup();
  finishStyle?.remove();
});

// Разбор канваса читает весь пакет контракта, и в одиночку набор идёт
// около 4-5 секунд — впритык к лимиту vitest по умолчанию (5 с). В общем
// прогоне он его перешагивал и падал по времени, а не по расхождению.
describe('Б3 · Конструктор · итоги', { timeout: 45_000 }, () => {
  it('рисует данные только из current/history callbacks и сохраняет введённый feedback', () => {
    const saved = [];
    render(React.createElement(Finish.FinishScreen, canvasProps({
      onDone: (note, feedback) => saved.push({ note, feedback })
    })));

    expect(screen.getByText('Тренировка завершена')).toBeTruthy();
    expect(screen.getByText(/Силовая .* 8 августа/)).toBeTruthy();
    expect(screen.getByText('54:30')).toBeTruthy();
    expect(screen.getByText('Рабочих подходов')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
    expect(screen.getByText('4 · вне объёма')).toBeTruthy();
    expect(screen.getByText('8,6 т')).toBeTruthy();
    expect(screen.getByText('↑ 12 %')).toBeTruthy();
    expect(screen.getByText('Жим лёжа · 75 × 8')).toBeTruthy();
    expect(screen.getByText('Отжимания на брусьях — коэффициент своего веса неизвестен')).toBeTruthy();
    expect(screen.getByText('Планка · время')).toBeTruthy();
    expect(screen.getByText('3:00 под нагрузкой')).toBeTruthy();
    expect(screen.getByText('Подтягивания · свой вес')).toBeTruthy();
    expect(screen.getByText(function (_content, element) {
      return element?.textContent === '2\u00a0028 кг в тоннаже';
    })).toBeTruthy();
    expect(screen.getByText('Сегодня всего две силовые')).toBeTruthy();
    expect(screen.getByText('14,2 т')).toBeTruthy();
    expect(document.querySelectorAll('.sb-finish-chart-column')).toHaveLength(6);
    expect(document.querySelectorAll('.sb-finish-chart-column.is-latest')).toHaveLength(1);
    expect(Array.from(document.querySelectorAll('.sb-finish-chart-column > b'))
      .map((element) => element.textContent)).toEqual(['88', '90', '89', '93', '92', '95']);

    fireEvent.change(screen.getByLabelText('настроение'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('самочувствие'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('стресс'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Заметка к тренировке'), { target: { value: 'Легко' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    expect(saved).toEqual([{
      note: 'Легко',
      feedback: { mood: 7, wellbeing: 8, stress: 5 }
    }]);
  });

  it('доказывает построчный DOM/computed-style контракт непротиворечивой части кадра', () => {
    render(React.createElement(Finish.FinishScreen, canvasProps()));

    const rows = [
      ['01', '.sb-finish-head', null, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px'
      }],
      ['02', '.sb-finish-head .sb-icon-btn', '✕', {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px',
        borderRadius: '999px', backgroundColor: CANVAS_COLORS.c1, color: CANVAS_COLORS.ink56,
        fontSize: '13px', fontWeight: '600', lineHeight: '1', flexGrow: '0', flexShrink: '0'
      }],
      ['03', '.sb-finish-head .sb-head-title', null, {
        display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '3px', paddingLeft: '10px'
      }],
      ['04', '.sb-finish-head .sb-head-title b', 'Тренировка завершена', {
        color: CANVAS_COLORS.tx, fontSize: '15px', fontWeight: '700', lineHeight: '1'
      }],
      ['05', '.sb-finish-head .sb-head-sub', 'Силовая · грудь, спина, плечи · 8 августа', {
        color: CANVAS_COLORS.ink56, fontSize: '10.5px', fontWeight: '600', lineHeight: '1'
      }],
      ['06', '.sb-finish-list', null, {
        display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: '0',
        paddingTop: '6px', paddingRight: '18px', paddingBottom: 'calc(18px + 0px)', paddingLeft: '18px'
      }],
      ['07', '.sb-finish-hero', null, {
        marginTop: '12px', padding: '16px', borderRadius: '20px', backgroundColor: CANVAS_COLORS.grBg
      }],
      ['08', '.sb-finish-praise', 'Отличная работа', {
        color: CANVAS_COLORS.gr, fontSize: '14px', fontWeight: '700', lineHeight: '1.2'
      }],
      ['09', '.sb-finish-metrics', null, {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px'
      }],
      ['10', '.sb-finish-metric:first-child', null, {
        display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px 11px',
        borderRadius: '14px', backgroundColor: CANVAS_COLORS.bg
      }],
      ['11', '.sb-finish-metric:first-child .sb-finish-metric-label', 'Длительность', {
        color: CANVAS_COLORS.ink56, fontSize: '9.5px', fontWeight: '600', lineHeight: '1', textTransform: 'uppercase'
      }],
      ['12', '.sb-finish-metric:first-child .sb-finish-metric-line', null, {
        display: 'flex', alignItems: 'baseline', gap: '5px'
      }],
      ['13', '.sb-finish-metric:first-child .sb-finish-metric-line b', '54:30', {
        color: CANVAS_COLORS.tx, fontSize: '17px', fontWeight: '800', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['14', '.sb-finish-metric:nth-child(2) .sb-finish-metric-line i', '↑ 12 %', {
        color: CANVAS_COLORS.gr, fontSize: '11px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['15', '.sb-finish-metric.is-accent', null, {
        display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px 11px', borderRadius: '14px',
        backgroundColor: CANVAS_COLORS.tint, boxShadow: `inset 0 0 0 1.5px ${CANVAS_COLORS.acs}`
      }],
      ['16', '.sb-finish-metric.is-accent .sb-finish-metric-line b', '1', {
        color: CANVAS_COLORS.ac, fontSize: '17px', fontWeight: '800', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['17', '.sb-finish-detail', null, { marginTop: '10px' }],
      ['18', '.sb-finish-detail > .sb-finish-row:first-child', null, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        minHeight: '', padding: '13px 0px', borderBottom: '1px solid rgba(0, 0, 0, .07)'
      }],
      ['19', '.sb-finish-detail > .sb-finish-row:first-child > span', 'Рабочих подходов', { color: CANVAS_COLORS.tx }],
      ['20', '.sb-finish-detail > .sb-finish-row:first-child > b', '19', {
        color: CANVAS_COLORS.tx, fontSize: '12.5px', fontWeight: '600', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['21', '.sb-finish-detail > .sb-finish-row:nth-child(2) > b', '4 · вне объёма', {
        color: CANVAS_COLORS.ink55, fontSize: '12.5px', fontWeight: '600', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['22', '.sb-finish-detail > .sb-finish-row:nth-child(3) > b', 'Жим лёжа · 75 × 8', {
        color: CANVAS_COLORS.gr, fontSize: '12.5px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['23', '.sb-finish-detail > .sb-finish-row--reason', null, { borderBottom: '0px' }],
      ['24', '.sb-finish-row--reason > span', null, { display: 'flex', flexDirection: 'column', gap: '3px' }],
      ['25', '.sb-finish-row--reason small', null, {
        fontSize: '11px', fontWeight: '500', lineHeight: '1.3', color: CANVAS_COLORS.ink56
      }],
      ['26', '.sb-finish-row--reason > b.is-quiet', '1 упр.', {
        color: CANVAS_COLORS.ink56, fontSize: '12.5px', fontWeight: '600', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['27', '.sb-finish-tier', 'Как оно прошло', {
        marginTop: '20px', marginBottom: '10px', color: CANVAS_COLORS.ac, fontSize: '10px', fontWeight: '700',
        lineHeight: '1', textTransform: 'uppercase'
      }],
      ['28', '.sb-finish-feedback-card', null, { padding: '16px', borderRadius: '20px', backgroundColor: CANVAS_COLORS.c1 }],
      ['29', '.sb-finish-feedback-grid', null, { display: 'flex', gap: '7px' }],
      ['30', '.sb-finish-feedback.is-mood', null, {
        display: 'flex', flexGrow: '1', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '3px', minHeight: '52px', marginBottom: '0px', borderRadius: '12px', backgroundColor: CANVAS_COLORS.grBg
      }],
      ['31', '.sb-finish-feedback.is-mood input', null, {
        minHeight: '0', padding: '0px', color: CANVAS_COLORS.gr,
        fontSize: '14px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }, { value: '7' }],
      ['32', '.sb-finish-feedback.is-mood span', 'настроение', {
        color: CANVAS_COLORS.ink56, fontSize: '9.5px', fontWeight: '600', lineHeight: '1'
      }],
      ['33', '.sb-finish-feedback.is-wellbeing', null, {
        display: 'flex', flexGrow: '1', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '3px', minHeight: '52px', marginBottom: '0px', borderRadius: '12px', backgroundColor: CANVAS_COLORS.c2
      }],
      ['34', '.sb-finish-feedback.is-wellbeing input', null, {
        minHeight: '0', padding: '0px', color: CANVAS_COLORS.ac,
        fontSize: '14px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }, { value: '8' }],
      ['35', '.sb-finish-feedback.is-stress', null, {
        display: 'flex', flexGrow: '1', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '3px', minHeight: '52px', marginBottom: '0px', borderRadius: '12px', backgroundColor: CANVAS_COLORS.tint
      }],
      ['36', '.sb-finish-feedback.is-stress input', null, {
        minHeight: '0', padding: '0px', color: CANVAS_COLORS.ac2,
        fontSize: '14px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }, { value: '5' }],
      ['37', '.sb-finish-note', null, {
        minHeight: '44px', marginTop: '9px', padding: '0px 14px', borderRadius: '14px',
        backgroundColor: CANVAS_COLORS.bg, boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, .1)',
        color: CANVAS_COLORS.tx, fontSize: '12.5px', fontWeight: '500', lineHeight: '1'
      }, { placeholder: 'Заметка к тренировке' }],
      ['38', '.sb-finish-chart-head', null, { display: 'flex', alignItems: 'baseline', gap: '8px' }],
      ['39', '.sb-finish-chart-head > span', 'по весу и повторам каждой тренировки', {
        flexGrow: '1', color: CANVAS_COLORS.ink56, fontSize: '11.5px', fontWeight: '600', lineHeight: '1.3'
      }],
      ['40', '.sb-finish-chart', null, {
        display: 'flex', alignItems: 'flex-end', gap: '6px', height: '112px', marginTop: '12px'
      }],
      ['41', '.sb-finish-chart-column:first-child', null, {
        display: 'flex', flexGrow: '1', flexDirection: 'column', alignItems: 'center', gap: '5px'
      }],
      ['42', '.sb-finish-chart-column:first-child > b', '88', {
        color: CANVAS_COLORS.ink56, fontSize: '9.5px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['43', '.sb-finish-chart-column:nth-child(1) > i', null, { width: '100%', height: '41px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.c2 }],
      ['44', '.sb-finish-chart-column:nth-child(1) > small', 'н1', { color: CANVAS_COLORS.ink56, fontSize: '9px', fontWeight: '600', lineHeight: '1' }],
      ['45', '.sb-finish-chart-column:nth-child(2) > i', null, { width: '100%', height: '51px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.c2 }],
      ['46', '.sb-finish-chart-column:nth-child(3) > i', null, { width: '100%', height: '46px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.c2 }],
      ['47', '.sb-finish-chart-column:nth-child(4) > i', null, { width: '100%', height: '67px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.c2 }],
      ['48', '.sb-finish-chart-column:nth-child(5) > i', null, { width: '100%', height: '62px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.c2 }],
      ['49', '.sb-finish-chart-column.is-latest > b', '95', {
        color: CANVAS_COLORS.ac, fontSize: '9.5px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['50', '.sb-finish-chart-column.is-latest > i', null, { width: '100%', height: '78px', borderRadius: '7px 7px 0px 0px', backgroundColor: CANVAS_COLORS.acs }],
      ['51', '.sb-finish-chart-column.is-latest > small', 'н6', { color: CANVAS_COLORS.ac, fontSize: '9px', fontWeight: '600', lineHeight: '1' }],
      ['52', '.sb-finish-chart-card > p', 'Тоннаж растёт и от лишних подходов. Максимум из веса и повторов показывает, стал ли человек сильнее.', {
        marginTop: '10px', color: CANVAS_COLORS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.55'
      }],
      ['53', '.sb-finish-day-total .sb-finish-row > b', '14,2 т', {
        color: CANVAS_COLORS.tx, fontSize: '12.5px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['54', '.sb-finish-other', null, { padding: '2px 16px', borderRadius: '20px', backgroundColor: CANVAS_COLORS.c1 }],
      ['55', '.sb-finish-other .sb-finish-row:first-child > b', '3:00 под нагрузкой', {
        color: CANVAS_COLORS.ink55, fontSize: '12px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['56', '.sb-finish-other .sb-finish-row:nth-child(2) > b', '2\u00a0028 кг в тоннаже', {
        color: CANVAS_COLORS.tx, fontSize: '12px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
      }],
      ['57', '.sb-finish-other + .sb-finish-footnote', 'Своя строка, а не пропуск: иначе человек решит, что работа потерялась. Время и метры в тоннаж не идут — килограммы на секунды не умножаются. Свой вес идёт через коэффициент; нет коэффициента — здесь стоит строка «не посчитали».', {
        marginTop: '12px', color: CANVAS_COLORS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.55'
      }],
      ['59', '.sb-finish-done', 'Готово', {
        display: 'flex', width: '100%', minHeight: '48px', alignItems: 'center', justifyContent: 'center',
        marginTop: '9px', borderRadius: '999px', backgroundColor: CANVAS_COLORS.acs, color: CANVAS_COLORS.onAcs,
        fontSize: '13px', fontWeight: '700', lineHeight: '1'
      }]
    ];

    expect(rows.map(([id]) => id)).toEqual([
      ...Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, '0')),
      ...Array.from({ length: 33 }, (_, index) => String(index + 27).padStart(2, '0'))
        .filter((id) => id !== '58')
    ]);

    const mismatches = [];
    rows.forEach(([id, selector, text, expectedStyle, expectedFields]) => {
      const node = document.querySelector(selector);
      if (!node) {
        mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
        return;
      }
      if (text != null && node.textContent !== text) {
        mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent });
      }
      Object.entries(expectedFields || {}).forEach(([field, expected]) => {
        if (node[field] !== expected) mismatches.push({ id, selector, field, expected, actual: node[field] });
      });
      const actualStyle = getComputedStyle(node);
      Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
        if (actualStyle[property] !== expected) {
          mismatches.push({ id, selector, field: `computed.${property}`, expected, actual: actualStyle[property] });
        }
      });
    });

    const authoredRows = [
      ['01', '.sb-finish-screen', '-webkit-font-smoothing', 'antialiased'],
      ['05', '.sb-finish-screen .sb-finish-head .sb-head-sub', 'letter-spacing', '0.04em'],
      ['11', '.sb-finish-metric-label', 'letter-spacing', '0.11em'],
      ['27', '.sb-finish-tier', 'letter-spacing', '0.16em']
    ];
    authoredRows.forEach(([id, selector, property, expected]) => {
      const rule = Array.from(finishStyle.sheet?.cssRules || [])
        .find((candidate) => candidate.selectorText === selector);
      const actual = rule?.style?.getPropertyValue(property) || '';
      if (actual !== expected) {
        mismatches.push({ id, selector, field: `authored.${property}`, expected, actual });
      }
    });
    expect(mismatches).toEqual([]);
  });

  it('держит акценты финала на синем наборе', () => {
    finishStyle.textContent = `${BASE_CSS}\n${finishPaletteCss('blue')}`;
    render(React.createElement(Finish.FinishScreen, canvasProps()));

    const colorRows = [
      ['27', '.sb-finish-tier', { color: BLUE_COLORS.ac }],
      ['16', '.sb-finish-metric.is-accent .sb-finish-metric-line b', { color: BLUE_COLORS.ac }],
      ['49', '.sb-finish-chart-column.is-latest > b', { color: BLUE_COLORS.ac }],
      ['50', '.sb-finish-chart-column.is-latest > i', { backgroundColor: BLUE_COLORS.acs }],
      ['59', '.sb-finish-done', { backgroundColor: BLUE_COLORS.acs, color: BLUE_COLORS.onAcs }]
    ];
    const mismatches = [];
    colorRows.forEach(([id, selector, expectedStyle]) => {
      const node = document.querySelector(selector);
      if (!node) {
        mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
        return;
      }
      const actualStyle = getComputedStyle(node);
      Object.entries(expectedStyle).forEach(([property, expected]) => {
        if (actualStyle[property] !== expected) {
          mismatches.push({ id, selector, field: `computed.${property}`, expected, actual: actualStyle[property], palette: 'blue' });
        }
      });
    });
    expect(mismatches).toEqual([]);
  });

  it('не выдумывает PR, feedback и исторические столбики без evidence', () => {
    render(React.createElement(Finish.FinishScreen, {
      training: training([{ name: 'Жим лёжа', approaches: [done(75, 8)] }]),
      dateKey: '2026-08-08',
      elapsedSec: 60,
      bodyWeightKg: 0,
      dayTonnageKg: 600,
      strengthCount: 1,
      historyDetailFor: () => ({
        usages: [
          { approaches: [done(200, 1, { done: false })] },
          { approaches: [done(150, 1, { type: 'warmup' })] }
        ]
      }),
      onBack: vi.fn(),
      onDone: vi.fn()
    }));

    const recordsTile = screen.getByText('Рекорды').closest('.sb-finish-metric');
    expect(recordsTile?.textContent).toBe('Рекорды0');
    expect(recordsTile?.classList.contains('is-accent')).toBe(false);
    expect(screen.getByLabelText('настроение').value).toBe('');
    expect(screen.getByLabelText('самочувствие').value).toBe('');
    expect(screen.getByLabelText('стресс').value).toBe('');
    expect(document.querySelectorAll('.sb-finish-chart-column')).toHaveLength(1);
  });

  it('не прячет незакрытый остаток в завершённой сессии', () => {
    render(React.createElement(Finish.FinishScreen, {
      training: training([{
        name: 'Жим лёжа',
        approaches: [done(75, 8), { weightKg: '75', reps: 8, done: false }]
      }]),
      dateKey: '2026-08-08',
      elapsedSec: 60,
      bodyWeightKg: 0,
      dayTonnageKg: 600,
      strengthCount: 1,
      onBack: vi.fn(),
      onDone: vi.fn()
    }));

    const warning = screen.getByText('Остались незакрытые').closest('.sb-finish-row');
    expect(warning?.querySelector('b')?.textContent).toBe('1');
  });

  it('не делает дроп-сет личным рекордом и подписывает только основную ступень', () => {
    render(React.createElement(Finish.FinishScreen, {
      training: training([{
        name: 'Жим лёжа',
        approaches: [done(75, 8, { drops: [done(60, 10)] })],
      }]),
      dateKey: '2026-08-08',
      elapsedSec: 60,
      bodyWeightKg: 0,
      dayTonnageKg: 1200,
      strengthCount: 1,
      historyFor: () => ({ record: { maxW: 75, maxSet: 600, total: 600 } }),
      onBack: vi.fn(),
      onDone: vi.fn(),
    }));

    const recordsTile = screen.getByText('Рекорды').closest('.sb-finish-metric');
    expect(recordsTile?.textContent).toBe('Рекорды0');
    expect(screen.getByText('Рекорд').closest('.sb-finish-row')?.textContent).toBe('Рекорд—');
  });

  it('держит геометрию текущего HTML-кадра отдельными finish-классами', () => {
    const css = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
    const source = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_finish_ui_v1.js'), 'utf8');
    const daySource = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');

    expect(css).toContain('grid-template-columns: 1fr 1fr;');
    expect(css).toContain('gap: 8px;');
    expect(css).toContain('padding: 10px 11px;');
    expect(css).toContain('box-shadow: inset 0 0 0 1.5px var(--acs);');
    expect(css).toContain('min-height: 52px;');
    expect(css).toContain('height: 112px;');
    expect(css).toContain('min-height: 48px;');
    expect(css).toContain('--c1: var(--v4-c1');
    expect(css).toContain('--c2: var(--v4-hero');
    expect(css).toContain('--tx: var(--v4-ink');
    expect(css).toContain('--ink: var(--v4-ink-rgb');
    expect(css).toContain('--acs: var(--v4-act');
    expect(css).toContain('--gr-bg: var(--v4-ok-bg');
    expect(source).toContain("className: 'sb-finish-detail'");
    expect(source).toContain("className: 'sb-finish-feedback-grid'");
    expect(source).toContain("className: 'sb-finish-chart'");
    expect(source).toContain('Своя строка, а не пропуск: иначе человек решит, что работа потерялась.');
    expect(source).toContain('Упражнения, которые не попали в объём, названы поимённо с причиной:');
    expect(daySource).toContain('finishSummaryFor: function (currentExercises)');
    expect(daySource).toContain('previousComparableTonnageKg');
    expect(daySource).toContain('currentBodyWeightKg');
    expect(daySource).toContain('workoutCompositionKey(currentExercises)');
    expect(daySource).toContain("['mood', 'wellbeing', 'stress']");
    expect(daySource).toContain("if (Object.prototype.hasOwnProperty.call(a, 'done')) out.done = !!a.done;");
    expect(daySource).toContain('out.drops = a.drops.map(function (drop)');
  });
});
