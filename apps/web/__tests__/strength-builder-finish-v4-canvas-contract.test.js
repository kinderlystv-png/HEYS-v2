import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

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

let Finish;

beforeEach(() => {
  Finish = loadFinish();
});

afterEach(() => {
  cleanup();
});

describe('Б3 · Конструктор · итоги', () => {
  it('рисует данные только из current/history callbacks и сохраняет введённый feedback', () => {
    const saved = [];
    const current = training([
      {
        name: 'Жим лёжа',
        approaches: [
          done(40, 10, { type: 'warmup' }),
          done(75, 8),
          done(70, 10)
        ]
      },
      {
        name: 'Планка', unit: 'time',
        approaches: [{ durationSec: 180, reps: 1, done: true }]
      },
      {
        name: 'Подтягивания', unit: 'bodyweight', bodyweightFactor: 0.8,
        approaches: [done('', 8)]
      },
      {
        name: 'Отжимания на брусьях', unit: 'bodyweight',
        approaches: [done('', 10)]
      }
    ]);

    render(React.createElement(Finish.FinishScreen, {
      training: current,
      dateKey: '2026-08-08',
      elapsedSec: 3270,
      bodyWeightKg: 80,
      dayTonnageKg: 14200,
      strengthCount: 2,
      previousComparableTonnageKg: 1618,
      historyFor: (name) => name === 'Жим лёжа'
        ? { record: { maxW: 70, maxSet: 550, total: 1200 } }
        : { record: null },
      historyDetailFor: () => ({
        usages: [75, 72, 70, 68, 66].map((weight) => ({ approaches: [done(weight, 6)] }))
      }),
      onBack: vi.fn(),
      onDone: (note, feedback) => saved.push({ note, feedback })
    }));

    expect(screen.getByText('Тренировка завершена')).toBeTruthy();
    expect(screen.getByText(/Силовая .* 8 августа/)).toBeTruthy();
    expect(screen.getByText('54:30')).toBeTruthy();
    expect(screen.getByText('Рабочих подходов')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('1 · вне объёма')).toBeTruthy();
    expect(screen.getByText('Жим лёжа · 75 × 8')).toBeTruthy();
    expect(screen.getByText('Отжимания на брусьях — коэффициент своего веса неизвестен')).toBeTruthy();
    expect(screen.getByText('Планка · время')).toBeTruthy();
    expect(screen.getByText('3:00 под нагрузкой')).toBeTruthy();
    expect(screen.getByText('Подтягивания · свой вес')).toBeTruthy();
    expect(screen.getByText('512 кг в тоннаже')).toBeTruthy();
    expect(screen.getByText('Сегодня всего две силовые')).toBeTruthy();
    expect(screen.getByText('14,2 т')).toBeTruthy();
    expect(document.querySelectorAll('.sb-finish-chart-column')).toHaveLength(6);
    expect(document.querySelectorAll('.sb-finish-chart-column.is-latest')).toHaveLength(1);

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
