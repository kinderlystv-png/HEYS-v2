// mobility-ui.test.js — React source UI for mobility mode.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  const evKernel = (f) => {
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.resolve(MOB_DIR, '..', '_kernel', f), 'utf8'));
  };
  [
    'heys_training_focus_ui_v1.js',
    'heys_kernel_bibliography_v1.js',
    'heys_kernel_bibliography_ui_v1.js',
    'heys_kernel_stats_v1.js',
    'heys_kernel_assess_v1.js',
    'heys_kernel_gate_v1.js',
    'heys_kernel_session_v1.js',
    'heys_kernel_runner_v1.js',
    'heys_kernel_timer_v1.js',
    'heys_kernel_active_session_v1.js',
    'heys_kernel_records_v1.js',
    'heys_kernel_progression_v1.js',
    'heys_kernel_dates_v1.js',
    'heys_kernel_calendar_v1.js',
    'heys_kernel_periodization_v1.js'
  ].forEach(evKernel);
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_load_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_protocols_catalog_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  ev('heys_mobility_breath_runner_v1.js');
  ev('heys_mobility_routine_runner_v1.js');
  ev('heys_mobility_voice_v1.js');
  ev('heys_mobility_session_persistence_v1.js');
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
const startGuidedSession = () => {
  fireEvent.click(screen.getByRole('button', { name: '▶ Запустить ведомую сессию' }));
};
const openTestsProfile = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Тесты и профиль' }));
};

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

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete globalThis.HEYS.TrainingStep;
    delete globalThis.HEYS.ConfirmModal;
    delete globalThis.HEYS.Toast;
    delete globalThis.HEYS.currentClientId;
    delete globalThis.window.__heysSyncCompletedFired;
    try { globalThis.window.localStorage.clear(); } catch (_) { /* noop */ }
  });

  it('рендерит focus-mode как у пальцев и открывает runner только после запуска микса', { timeout: 20000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    expect(screen.getByText('Мобильность')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Цель тренировки')).toBeTruthy();
    expect(container.querySelector('.mobility-fs-equipment')).not.toBeNull();
    const loadSlider = screen.getByRole('slider', { name: 'Сложность и тяжесть тренировки' });
    expect(loadSlider.value).toBe('3');
    fireEvent.change(loadSlider, { target: { value: '5' } });
    expect(loadSlider.value).toBe('5');
    expect(screen.getByText('Атлет')).toBeTruthy();
    expect(screen.getByText('Сессия по методологии')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Запустить микс' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Все протоколы' })).toBeTruthy();
    expect(container.querySelector('.mobility-guided')).toBeNull();
    expect(screen.queryByLabelText('Возраст')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    expect(screen.getByRole('button', { name: '▶ Запустить ведомую сессию' })).toBeTruthy();
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-execution')).not.toBeNull();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.querySelector('[data-training-runner="guided"]')).not.toBeNull();
    expect(screen.getAllByText('Быстрый микс').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.querySelector('.mobility-session')).not.toBeNull();
    expect(container.querySelector('.fingers-source-badge')).not.toBeNull();
    expect(container.textContent).toContain('разогрев учтён');
    expect(container.textContent).toContain('Доза');
    const visuals = container.querySelectorAll('.mobility-block__visual img');
    expect(visuals.length).toBeGreaterThan(0);
    expect(visuals[0].getAttribute('src')).toMatch(/^\/exercises\/mobility\/.+\.webp$/);
    expect(visuals[0].getAttribute('alt')).toContain('Фото упражнения');
    expect(container.querySelector('.mobility-runner')).not.toBeNull();
    expect(screen.getByText('Карта эффектов')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Протоколы/ }));
    expect(screen.getByText('Пауза от сидения')).toBeTruthy();
    expect(container.querySelectorAll('.mobility-protocol-card').length).toBeGreaterThan(0);
  });

  it('перед ведомой сессией показывает preflight-модалку и запускает runner после подтверждения', () => {
    let modalOptions = null;
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalOptions = options;
      })
    };
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    startGuidedSession();

    expect(globalThis.HEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);
    expect(modalOptions.title).toBe('Готовы начать?');
    expect(modalOptions.icon).toBe('🌙');
    expect(container.querySelector('.mobility-guided')).toBeNull();

    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });

    expect(container.querySelector('.mobility-execution')).not.toBeNull();
    expect(container.querySelector('[data-training-runner="guided"]')).not.toBeNull();
    expect(screen.getAllByText('Ведомая тренировка').length).toBeGreaterThan(0);
  });

  it('ведомая сессия озвучивает старт и фазу как voice coach', async () => {
    const built = UI()._buildCustomBuilt(['act_deep_neck_flexor_nod'], 'posture', profile, {});
    const plan = globalThis.HEYS.Mobility.routineRunner.buildRunPlan(built.session);
    const say = vi.fn();
    globalThis.HEYS.Mobility.voice.say = say;

    const { container } = render(React.createElement(UI().ExecutionPanel, {
      plan,
      built,
      autoStart: true
    }));

    await waitFor(() => expect(say).toHaveBeenCalledWith('cue.start_session', expect.anything()));
    await waitFor(() => expect(say).toHaveBeenCalledWith('cue.prep', expect.anything()));
    expect(container.querySelector('.mobility-voice-mini')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Голос:/ })).toBeTruthy();
  });

  it('resume запускает восстановленный план с choose-экрана и partial-save использует snapshot built', async () => {
    globalThis.HEYS.Mobility.persistence = globalThis.HEYS.TrainingKernel.activeSession.create({
      keySuffix: 'routine_active_session',
      staleMs: 24 * 60 * 60 * 1000,
      debounceMs: 250
    });
    const resumeBuilt = UI()._buildCustomBuilt(['joint_cars_hip', 'breath_box_tonify'], 'morning_tonify', profile, {});
    const resumePlan = globalThis.HEYS.Mobility.routineRunner.buildRunPlan(resumeBuilt.session);
    const breathIndex = resumePlan.steps.findIndex((step) => step.atomId === 'breath_box_tonify');
    expect(breathIndex).toBeGreaterThanOrEqual(0);
    globalThis.window.localStorage.setItem('heys_routine_active_session', JSON.stringify({
      planSteps: resumePlan.steps,
      sessionMode: resumePlan.sessionMode,
      estimatedDurationSec: resumePlan.estimatedDurationSec,
      built: {
        ok: resumeBuilt.ok !== false,
        issues: resumeBuilt.issues || [],
        session: resumeBuilt.session
      },
      index: breathIndex,
      remainingSec: 12,
      status: 'running',
      lastTickAt: Date.now()
    }));
    globalThis.window.__heysSyncCompletedFired = true;
    const savedTrainings = [];
    globalThis.HEYS.TrainingStep = {
      saveMobility: (ctx, mobilityLog, meta) => savedTrainings.push({ ctx, mobilityLog, meta })
    };
    const storage = globalThis.HEYS.Mobility.recordsStore.createMemoryStorage();
    const modalQueue = [];
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalQueue.push(options);
      })
    };

    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'evening_relax',
      clientId: 'client-a',
      storage,
      dateKey: '2026-06-13',
      trainingIndex: 2
    }));

    await waitFor(() => expect(container.querySelector('[data-resume-banner="1"]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    await waitFor(() => expect(container.querySelector('.mobility-execution')).not.toBeNull());
    expect(container.textContent).toContain('Box breathing');

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }));
    expect(modalQueue[0].title).toBe('Прервать тренировку?');
    act(() => modalQueue[0].onConfirm());
    expect(modalQueue[1].title).toBe('Записать прогресс?');
    act(() => modalQueue[1].onConfirm());

    expect(savedTrainings).toHaveLength(1);
    expect(savedTrainings[0].ctx).toEqual({ dateKey: '2026-06-13', trainingIndex: 2 });
    expect(savedTrainings[0].mobilityLog.mode).toBe('morning_tonify');
    expect(savedTrainings[0].mobilityLog.partial).toBe(true);
    expect(savedTrainings[0].mobilityLog.plan.steps.some((step) => step.atomId === 'breath_box_tonify')).toBe(true);
  });

  it('не стартует второй mobility runner при свежем owner-lock', async () => {
    globalThis.window.localStorage.setItem('heys_mobility_timer_lock_v1', JSON.stringify({
      ownerTabId: 'another-tab',
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
      reason: 'start'
    }));
    const warn = vi.fn();
    globalThis.HEYS.Toast = { warn };

    render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    startGuidedSession();

    await waitFor(() => expect(globalThis.HEYS.Mobility.lastTimerLockDenied).toMatchObject({
      reason: 'held-by-another-tab'
    }));
    expect(globalThis.HEYS.Mobility.activeTimerLock).not.toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('выбирает готовый протокол и возвращает в ведомую тренировку', { timeout: 20000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Протоколы/ }));
    fireEvent.click(screen.getByRole('button', { name: /Пауза от сидения/ }));
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('anti_sedentary');
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Пауза от сидения').length).toBeGreaterThan(0);
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
  });

  it('позволяет собрать свою тренировку из упражнений и запустить сопровождение', { timeout: 60000 }, async () => {
    const directBuilt = UI()._buildCustomBuilt(['joint_cars_hip', 'breath_box_tonify'], 'morning_tonify', profile, {});
    expect(directBuilt.session.blocks.map((block) => block.atoms[0].id)).toEqual(['joint_cars_hip', 'breath_box_tonify']);
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Своя/ }));
    fireEvent.click(screen.getByRole('button', { name: /Hip CARs/ }));
    await waitFor(() => expect(screen.getByText('1 выбрано')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Box breathing/ }));
    await waitFor(() => expect(screen.getByText('2 выбрано')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Запустить свою' }));
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Своя сборка').length).toBeGreaterThan(0);
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.querySelectorAll('.mobility-guided-step').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Hip CARs');
    expect(container.textContent).toContain('Box breathing');
  });

  it('кнопка списка упражнений в шапке открывает реестр и добавляет в свою сборку', { timeout: 60000 }, async () => {
    render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Все упражнения' }));
    const dialog = screen.getByRole('dialog', { name: 'Все упражнения' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/\d+ атомов · фото, доза и назначение/)).toBeTruthy();
    expect(dialog.querySelectorAll('.mobility-fs-registry-card__img').length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Поиск по упражнениям' }), {
      target: { value: 'Hip CARs' }
    });
    expect(within(dialog).getByText('Hip CARs')).toBeTruthy();
    expect(within(dialog).queryByText('Box breathing')).toBeNull();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Добавить' })[0]);
    await waitFor(() => expect(within(dialog).getByText('1 выбрано')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть свою сборку' }));
    expect(screen.queryByRole('dialog', { name: 'Все упражнения' })).toBeNull();
    expect(screen.getByRole('tab', { name: /Своя/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('1 выбрано')).toBeTruthy();
  });

  it('переключает цель кнопкой и перестраивает режим без запуска runner', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Вечер/ }));
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('evening_relax');
    expect(container.querySelector('.mobility-guided')).toBeNull();
  });

  it('показывает Осанку как полноценный режим и запускает posture-микс', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Осанка/ }));

    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('posture');
    expect(screen.getAllByText('Осанка').length).toBeGreaterThan(0);
    expect(screen.queryByText('Режим осанки готовится')).toBeNull();
    expect(screen.queryByText('без запуска')).toBeNull();
    expect(screen.getByRole('button', { name: 'Запустить микс' })).toBeTruthy();
    expect(screen.getByText('Осанка собрана через контроль и укрепление, не через одну растяжку')).toBeTruthy();
    expect(container.textContent).toContain('Осанка: лопатка с резинкой');
    const mixCard = container.querySelector('.mobility-fs-mixcard');
    const exerciseRows = mixCard.querySelectorAll('.mobility-fs-mixcard__exrow');
    const countChip = Array.from(mixCard.querySelectorAll('.mobility-chip'))
      .map((node) => node.textContent || '')
      .find((text) => /\d+ упр$/.test(text));
    expect(countChip).toBeTruthy();
    expect(exerciseRows.length).toBe(Number(countChip.match(/\d+/)[0]));

    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.textContent).toContain('Кивок глубоких сгибателей шеи');
  });

  it('цель в расширенном профиле перестраивает рекомендуемый режим', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    openTestsProfile();
    fireEvent.change(screen.getByLabelText('Цель'), { target: { value: 'relax' } });
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('evening_relax');
  });

  it('показывает дисклеймер, если он не принят в профиле', () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile: Object.assign({}, profile, { acceptedDisclaimer: false }),
      modeId: 'morning_tonify'
    }));
    openTestsProfile();
    expect(container.textContent).toContain('режим не является медицинской рекомендацией');
  });

  it('показывает боль как ограничение сессии', { timeout: 20000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'anti_sedentary',
      painFlags: [{ level: 'pain', zone: 'hip' }]
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.textContent).toContain('S2.pain_stop');
    expect(container.textContent).toContain('есть ограничения');
  });

  it('SourceBadge — общий kernel-бейдж (автор/год)', () => {
    const { container } = render(React.createElement(UI().SourceBadge, { sourceId: 'behm2016' }));
    expect(container.querySelector('.fingers-source-badge')).not.toBeNull();
    expect(container.textContent).toContain('Behm et al.');
    expect(container.textContent).toContain('2016');
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
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
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
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(screen.getByText('Подсказка прогрессии')).toBeTruthy();
    expect(screen.getByText('Прогресс остановился: смените ось нагрузки')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ось прогрессии'), { target: { value: 'load' } });
    expect(screen.getByLabelText('Ось прогрессии').value).toBe('load');
  });

  it('аудит подвижности даёт ручной ввод полного ROM-скрина', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'develop_mobility' }));
    openTestsProfile();
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
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    openTestsProfile();
    fireEvent.change(screen.getByLabelText('ankle_dorsiflexion замер'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить аудит' }));
    expect(container.textContent).toContain('Аудит сохранён');
    fireEvent.click(screen.getByRole('tab', { name: /Сегодня/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в тренировку' }));
    expect(container.textContent).toContain('Сессия сохранена');
    startGuidedSession();
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
  }, 15000);

  it('не пишет mobilityLog в дневник без явного контекста тренировки', { timeout: 60000 }, () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сессию' }));
    expect(savedTrainings).toHaveLength(0);
    expect(globalThis.HEYS.Mobility.recordsStore.load('client-a', storage).sessions).toHaveLength(1);
    delete globalThis.HEYS.TrainingStep;
  });

  it('readiness UI принимает субъективные шкалы и меняет advisory', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    openTestsProfile();
    expect(container.textContent).toContain('готовность нормальная');
    fireEvent.change(screen.getByLabelText('Скованность'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Болезненность'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Сон'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Стресс'), { target: { value: '10' } });
    expect(container.textContent).toContain('снизить интенсивность');
  });

  it('показывает CWI advisory в session panel', { timeout: 60000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'post_workout',
      coldWaterPlanned: true,
      afterAdaptiveStrength: true
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.textContent).toContain('CWI.after_adaptive_strength');
  });

  it('execution panel показывает дыхательные фазы и lifecycle controls', () => {
    let modalOptions = null;
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalOptions = options;
      })
    };
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(modalOptions.title).toBe('Готовы начать?');
    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });
    expect(screen.getAllByText('Ведомая тренировка').length).toBeGreaterThan(0);
    expect(container.querySelector('.mobility-breath-phases')).not.toBeNull();
    expect(container.querySelector('.mobility-guided__visual img')).not.toBeNull();
    expect(container.textContent).toContain('длинный выдох');
    const execution = container.querySelector('.mobility-execution');
    const status = () => execution.querySelector('.mobility-execution__status').getAttribute('data-status');
    expect(status()).toBe('running');
    fireEvent.click(within(execution).getByRole('button', { name: 'Пауза' }));
    expect(status()).toBe('paused');
    fireEvent.click(within(execution).getByRole('button', { name: 'Стоп' }));
    expect(globalThis.HEYS.ConfirmModal.show).toHaveBeenCalled();
    expect(modalOptions.title).toBe('Прервать тренировку?');
    expect(status()).toBe('paused');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(modalOptions.title).toBe('Записать прогресс?');
    act(() => {
      modalOptions.onCancel();
    });
    expect(container.querySelector('.mobility-guided')).toBeNull();
  });

  it('abort-flow записывает частичный прогресс после подтверждения как у пальцев', () => {
    const storage = globalThis.HEYS.Mobility.recordsStore.createMemoryStorage();
    const savedTrainings = [];
    let modalOptions = null;
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalOptions = options;
      })
    };
    globalThis.HEYS.TrainingStep = {
      saveMobility: (ctx, mobilityLog, meta) => savedTrainings.push({ ctx, mobilityLog, meta })
    };
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'morning_tonify',
      clientId: 'client-a',
      storage,
      dateKey: '2026-06-13',
      trainingIndex: 3
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    startGuidedSession();
    expect(modalOptions.title).toBe('Готовы начать?');
    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });
    const execution = container.querySelector('.mobility-execution');
    fireEvent.click(within(execution).getByRole('button', { name: 'Стоп' }));
    expect(modalOptions.title).toBe('Прервать тренировку?');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(modalOptions.title).toBe('Записать прогресс?');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(container.querySelector('.mobility-guided')).toBeNull();
    expect(container.textContent).toContain('Сессия сохранена');
    const records = globalThis.HEYS.Mobility.recordsStore.load('client-a', storage);
    expect(records.sessions).toHaveLength(1);
    expect(records.sessions[0].session.partial).toBe(true);
    expect(records.sessions[0].session.partialProgress.completedSteps).toBeGreaterThan(0);
    expect(savedTrainings).toHaveLength(1);
    expect(savedTrainings[0].mobilityLog.partial).toBe(true);
    expect(savedTrainings[0].meta.activityLabel).toContain('частично');
  });

  it('execution lifecycle сбрасывается при смене режима', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    startGuidedSession();
    let execution = container.querySelector('.mobility-execution');
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('running');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(screen.getByRole('tab', { name: /Нагрузка/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Запустить микс' }));
    expect(container.querySelector('.mobility-execution')).toBeNull();
    startGuidedSession();
    execution = container.querySelector('.mobility-execution');
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('running');
  });
});
