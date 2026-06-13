// mobility-ui.test.js — React source UI for mobility mode.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  ev('heys_mobility_breath_runner_v1.js');
  ev('heys_mobility_routine_runner_v1.js');
  ev('heys_mobility_assessment_v1.js');
  ev('heys_mobility_onboarding_v1.js');
  ev('heys_mobility_readiness_v1.js');
  ev('heys_mobility_bibliography_v1.js');
  ev('heys_mobility_records_store_v1.js');
  ev('heys_mobility_progression_v1.js');
  ev('heys_mobility_calendar_v1.js');
  ev('heys_mobility_ui_v1.js');
};

const UI = () => globalThis.HEYS.Mobility.UI;

const profile = {
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster'],
  goal: 'morning',
  acceptedDisclaimer: true
};

describe('Mobility UI', () => {
  beforeAll(setupOnce);

  it('рендерит основной flow: режим, сессию, runner и карту эффектов', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    expect(screen.getByText('Мобильность')).toBeTruthy();
    expect(screen.getAllByText('Вечер').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.mobility-session')).not.toBeNull();
    expect(container.querySelector('.mobility-runner')).not.toBeNull();
    expect(screen.getByText('Карта эффектов')).toBeTruthy();
    expect(screen.getByText('План недели')).toBeTruthy();
    expect(container.textContent).toContain('Источник A');
    expect(container.textContent).toContain('Регуляция');
    expect(container.textContent).toContain('Расслабление');
    expect(container.textContent).toContain('разогрев учтён');
    expect(container.textContent).toContain('Сессия собрана под расслабление');
    expect(container.textContent).toContain('Мягкое расслабляющее удержание');
    expect(container.textContent).toContain('Автономика');
    expect(container.textContent).toContain('Доза');
    expect(container.textContent).toContain('амплитуда комфортная');
  });

  it('переключает режим кнопкой', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Вечер/ }));
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('evening_relax');
  });

  it('цель в профиле перестраивает рекомендуемый режим', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.change(screen.getByLabelText('Цель'), { target: { value: 'relax' } });
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('evening_relax');
  });

  it('показывает дисклеймер, если он не принят в профиле', () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile: Object.assign({}, profile, { acceptedDisclaimer: false }),
      modeId: 'morning_tonify'
    }));
    expect(container.textContent).toContain('режим не является медицинской рекомендацией');
  });

  it('показывает боль как ограничение сессии', () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'anti_sedentary',
      painFlags: [{ level: 'pain', zone: 'hip' }]
    }));
    expect(container.textContent).toContain('S2.pain_stop');
    expect(container.textContent).toContain('есть ограничения');
  });

  it('SourceBadge показывает силу источника', () => {
    render(React.createElement(UI().SourceBadge, { sourceId: 'behm2016' }));
    expect(screen.getByText('Источник A')).toBeTruthy();
  });

  it('показывает ROM-прогресс и статус ретеста из records', () => {
    const records = {
      assessments: [
        {
          savedAt: '2026-01-01T00:00:00.000Z',
          audit: { rows: [{ ok: true, testId: 'ankle_dorsiflexion', jointRegion: 'ankle', measure: 12, norm: 20, unit: 'deg', deficit: 0.4 }] }
        },
        {
          savedAt: '2026-02-01T00:00:00.000Z',
          audit: { rows: [{ ok: true, testId: 'ankle_dorsiflexion', jointRegion: 'ankle', measure: 16, norm: 20, unit: 'deg', deficit: 0.2 }] }
        }
      ]
    };
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'evening_relax',
      records,
      nowDate: '2026-03-20T00:00:00.000Z'
    }));
    expect(screen.getByText('Прогресс ROM')).toBeTruthy();
    expect(container.textContent).toContain('нужен ретест');
    expect(container.textContent).toContain('ankle_dorsiflexion');
    expect(container.textContent).toContain('+4deg');
  });

  it('показывает подсказку прогрессии и ручной выбор оси', () => {
    render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'develop_mobility',
      progressionHistory: { romValues: [70, 71, 70.5], progressionAxis: 'amplitude' }
    }));
    expect(screen.getByText('Подсказка прогрессии')).toBeTruthy();
    expect(screen.getByText('Прогресс остановился: смените ось нагрузки')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ось прогрессии'), { target: { value: 'load' } });
    expect(screen.getByLabelText('Ось прогрессии').value).toBe('load');
  });

  it('аудит подвижности даёт ручной ввод полного ROM-скрина', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'develop_mobility' }));
    expect(screen.getByLabelText('ankle_dorsiflexion замер')).toBeTruthy();
    expect(screen.getByLabelText('shoulder_er активно')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ankle_dorsiflexion замер'), { target: { value: '12' } });
    expect(container.textContent).toContain('пассивный потолок ниже нормы');
    expect(container.textContent).toContain('40%');
  });

  it('сохраняет сессию и аудит через client-scoped recordsStore', () => {
    const storage = globalThis.HEYS.Mobility.recordsStore.createMemoryStorage();
    const savedTrainings = [];
    globalThis.HEYS.TrainingStep = {
      saveMobility: (ctx, mobilityLog, meta) => savedTrainings.push({ ctx, mobilityLog, meta })
    };
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'develop_mobility',
      clientId: 'client-a',
      storage,
      dateKey: '2026-06-13',
      trainingIndex: 2
    }));
    fireEvent.change(screen.getByLabelText('ankle_dorsiflexion замер'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить аудит' }));
    expect(container.textContent).toContain('Аудит сохранён');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сессию' }));
    expect(container.textContent).toContain('Сессия сохранена');
    fireEvent.click(screen.getByRole('button', { name: 'Отметить боль' }));
    expect(container.textContent).toContain('Боль отмечена');
    const records = globalThis.HEYS.Mobility.recordsStore.load('client-a', storage);
    expect(records.assessments).toHaveLength(1);
    expect(records.sessions).toHaveLength(1);
    expect(savedTrainings).toHaveLength(1);
    expect(savedTrainings[0].ctx).toEqual({ dateKey: '2026-06-13', trainingIndex: 2 });
    expect(savedTrainings[0].mobilityLog).toMatchObject({
      version: 1,
      mode: 'develop_mobility',
      ok: true
    });
    expect(savedTrainings[0].mobilityLog.totalDurationMinutes).toBeGreaterThan(0);
    expect(records.painFlags).toHaveLength(1);
    expect(records.painFlags[0].level).toBe('pain');
    expect(records.painFlags[0].atomId).toBeTruthy();
    expect(globalThis.HEYS.Mobility.recordsStore.load('client-b', storage).sessions).toHaveLength(0);
    delete globalThis.HEYS.TrainingStep;
  });

  it('не пишет mobilityLog в дневник без явного контекста тренировки', () => {
    const storage = globalThis.HEYS.Mobility.recordsStore.createMemoryStorage();
    const savedTrainings = [];
    globalThis.HEYS.TrainingStep = {
      saveMobility: (ctx, mobilityLog, meta) => savedTrainings.push({ ctx, mobilityLog, meta })
    };
    render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'evening_relax',
      clientId: 'client-a',
      storage
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сессию' }));
    expect(savedTrainings).toHaveLength(0);
    expect(globalThis.HEYS.Mobility.recordsStore.load('client-a', storage).sessions).toHaveLength(1);
    delete globalThis.HEYS.TrainingStep;
  });

  it('readiness UI принимает субъективные шкалы и меняет advisory', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    expect(container.textContent).toContain('готовность нормальная');
    fireEvent.change(screen.getByLabelText('Скованность'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Болезненность'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Сон'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Стресс'), { target: { value: '10' } });
    expect(container.textContent).toContain('снизить интенсивность');
  });

  it('показывает CWI advisory в session panel', () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'post_workout',
      coldWaterPlanned: true,
      afterAdaptiveStrength: true
    }));
    expect(container.textContent).toContain('CWI.after_adaptive_strength');
    expect(container.textContent).toContain('может глушить адаптацию');
  });

  it('пересобирает session при изменении CWI/phase props', () => {
    const { container, rerender } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'post_workout',
      coldWaterPlanned: false,
      afterAdaptiveStrength: true
    }));
    expect(container.textContent).not.toContain('CWI.after_adaptive_strength');

    rerender(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'post_workout',
      coldWaterPlanned: true,
      afterAdaptiveStrength: true
    }));
    expect(container.textContent).toContain('CWI.after_adaptive_strength');
  });

  it('execution panel показывает дыхательные фазы и lifecycle controls', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    expect(screen.getByText('Выполнение')).toBeTruthy();
    expect(container.querySelector('.mobility-breath-phases')).not.toBeNull();
    expect(container.textContent).toContain('длинный выдох');
    const execution = container.querySelector('.mobility-execution');
    const status = () => execution.querySelector('.mobility-execution__status').getAttribute('data-status');
    expect(status()).toBe('idle');
    fireEvent.click(within(execution).getByRole('button', { name: 'Старт' }));
    expect(status()).toBe('running');
    fireEvent.click(within(execution).getByRole('button', { name: 'Пауза' }));
    expect(status()).toBe('paused');
    fireEvent.click(within(execution).getByRole('button', { name: 'Стоп' }));
    expect(status()).toBe('aborted');
  });

  it('execution lifecycle сбрасывается при смене режима', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    let execution = container.querySelector('.mobility-execution');
    fireEvent.click(within(execution).getByRole('button', { name: 'Старт' }));
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('running');
    fireEvent.click(screen.getByRole('tab', { name: /Перед нагрузкой/ }));
    execution = container.querySelector('.mobility-execution');
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('idle');
  });
});
