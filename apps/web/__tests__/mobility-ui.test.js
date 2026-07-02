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
  ev('heys_mobility_course_planner_v1.js');
  ev('heys_mobility_ui_v1.js');
};

const UI = () => globalThis.HEYS.Mobility.UI;
const startGuidedSession = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Начать с подсказками' }));
};
const startTodayTraining = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Начать тренировку' }));
};
const openTestsProfile = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Самочувствие и замеры' }));
};

const profile = {
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster'],
  goal: 'morning',
  acceptedDisclaimer: true
};

describe('Mobility UI', { timeout: 60000 }, () => {
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

  it('рендерит focus-mode как у пальцев и открывает runner только после запуска тренировки', { timeout: 20000 }, () => {
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
    expect(screen.getByText('Сегодняшняя тренировка')).toBeTruthy();
    expect(screen.queryByText('Сессия по методологии')).toBeNull();
    expect(screen.queryByText('Сегодняшняя сессия')).toBeNull();
    expect(container.textContent).toContain('Учли цель, самочувствие, инвентарь и ограничения.');
    expect(container.textContent).not.toContain('Короткий набор под цель, инвентарь и ограничения.');
    expect(container.textContent).not.toContain('Короткая тренировка под цель, инвентарь и ограничения.');
    expect(container.textContent).not.toContain('Подбор учитывает цель, готовность, доступный инвентарь и ограничения.');
    expect(container.querySelector('.mobility-fs-mixcard .mobility-technique-card')).toBeNull();
    expect(container.querySelector('.mobility-fs-mixcard__exthumb img')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Начать тренировку' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Запустить микс' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Все планы' })).toBeTruthy();
    expect(container.querySelector('.mobility-guided')).toBeNull();
    expect(screen.queryByLabelText('Возраст')).toBeNull();

    startTodayTraining();
    expect(screen.getByRole('button', { name: 'Начать с подсказками' })).toBeTruthy();
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-execution')).not.toBeNull();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.querySelector('[data-training-runner="guided"]')).not.toBeNull();
    expect(container.querySelector('.mobility-execution .mobility-technique-card--compact')).not.toBeNull();
    expect(screen.getAllByText('Быстрая тренировка').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Учли цель, самочувствие, инвентарь и ограничения.');
    expect(container.textContent).not.toContain('Подобрана под цель, инвентарь и ограничения.');
    expect(container.textContent).not.toContain('Быстрый микс');
    expect(container.textContent).not.toContain('Автосборка');

    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.querySelector('.mobility-progress')).not.toBeNull();
    expect(container.querySelector('.mobility-fs-equipment')).toBeNull();
    expect(container.querySelector('.mobility-fs-goalsel')).toBeNull();
    expect(container.querySelector('.mobility-fs-load')).toBeNull();
    expect(container.querySelector('.mobility-session')).toBeNull();
    expect(container.querySelector('.mobility-runner')).toBeNull();
    expect(screen.queryByText('Карта эффектов')).toBeNull();
    expect(screen.getByText('Замеры и контроль изменений')).toBeTruthy();
    expect(screen.queryByText('ROM и ретест')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Планы/ }));
    expect(screen.getByText('Пауза от сидения')).toBeTruthy();
    expect(container.querySelectorAll('.mobility-protocol-card').length).toBeGreaterThan(0);
  });

  it('перед тренировкой с сопровождением показывает preflight-модалку и запускает runner после подтверждения', () => {
    let modalOptions = null;
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalOptions = options;
      })
    };
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    startTodayTraining();
    startGuidedSession();

    expect(globalThis.HEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);
    expect(modalOptions.title).toBe('Перед началом');
    expect(modalOptions.actions.find((action) => action.key === 'go').label).toBe('Начать тренировку');
    expect(modalOptions.text.props.preset.prep).toContain('60 секунд');
    expect(modalOptions.icon).toBe('🌙');
    expect(container.textContent).not.toContain('риск резкого старта');
    expect(container.querySelector('.mobility-guided')).toBeNull();

    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });

    expect(container.querySelector('.mobility-execution')).not.toBeNull();
    expect(container.querySelector('[data-training-runner="guided"]')).not.toBeNull();
    expect(screen.getAllByText('Тренировка с сопровождением').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ведомая тренировка')).toBeNull();
  });

  it('тренировка с сопровождением озвучивает старт и фазу как voice coach', async () => {
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

  it('resume запускает восстановленный план с choose-экрана и partial-save использует snapshot built', { timeout: 20000 }, async () => {
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
    expect(container.textContent).toContain('Квадратное дыхание');
    expect(container.textContent).not.toContain('Box breathing');

    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    expect(container.textContent).toContain('Пауза в тренировке');
    expect(container.textContent).toContain('Продолжение с того места, где вы остановились');
    expect(container.textContent).not.toContain('Прерванная тренировка');
    expect(modalQueue[0].title).toBe('Остановить тренировку?');
    act(() => modalQueue[0].onConfirm());
    expect(modalQueue[1].title).toBe('Сохранить то, что уже сделали?');
    expect(modalQueue[1].confirmText).toBe('Сохранить результат');
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
    startTodayTraining();
    startGuidedSession();

    await waitFor(() => expect(globalThis.HEYS.Mobility.lastTimerLockDenied).toMatchObject({
      reason: 'held-by-another-tab'
    }));
    expect(globalThis.HEYS.Mobility.activeTimerLock).not.toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('выбирает готовый план и возвращает в тренировку с сопровождением', { timeout: 20000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Планы/ }));
    expect(screen.getByText('Готовые тренировки')).toBeTruthy();
    expect(screen.getByText('Выберите сценарий')).toBeTruthy();
    expect(container.textContent).toContain('Сегодня выбран');
    expect(container.textContent).toContain('Сегодняшний выбор запускается');
    expect(container.textContent).not.toContain('Планы тренировок');
    expect(container.textContent).not.toContain('Готовая структура');
    expect(container.textContent).not.toContain('Протоколы');
    expect(container.textContent).toContain('структура разминки');
    expect(container.textContent).toContain('задняя линия');
    expect(container.textContent).toContain('конец диапазона');
    expect(container.textContent).toContain('Разминка перед нагрузкой');
    expect(container.textContent).not.toContain('RAMP перед нагрузкой');
    expect(container.textContent).not.toContain('разминка RAMP');
    expect(container.textContent).not.toContain('end-range');
    expect(container.textContent).not.toContain('hamstring');
    expect(container.textContent).not.toContain('pain-free');
    expect(container.textContent).not.toContain('CARs');
    expect(container.textContent).not.toContain('Deload');
    fireEvent.click(screen.getByRole('button', { name: /Пауза от сидения/ }));
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('anti_sedentary');
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Пауза от сидения').length).toBeGreaterThan(0);
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
  });

  it('календарь показывает человекочитаемый фокус недели', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Календарь/ }));
    expect(screen.getByText('План недели')).toBeTruthy();
    expect(container.textContent).toContain('развитие диапазона');
    expect(container.textContent).toContain('замеры нужны');
    expect(container.textContent).toContain('Настроить курс');
    expect(container.textContent).not.toContain('develop');
    expect(container.textContent).not.toContain('проверка позже');
    expect(container.textContent).not.toContain('Открыть прогресс');
  });

  it('позволяет собрать свою тренировку из упражнений и запустить сопровождение', { timeout: 60000 }, async () => {
    const directBuilt = UI()._buildCustomBuilt(['joint_cars_hip', 'breath_box_tonify'], 'morning_tonify', profile, {});
    expect(directBuilt.session.blocks.map((block) => block.atoms[0].id)).toEqual(['joint_cars_hip', 'breath_box_tonify']);
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Свой план/ }));
    expect(screen.getByText('Соберите короткую тренировку')).toBeTruthy();
    expect(screen.getByText('Подойдут сейчас')).toBeTruthy();
    expect(container.textContent).toContain('план пуст');
    expect(container.textContent).not.toContain('Выберите 2-5 упражнений');
    expect(container.textContent).not.toContain('Рекомендуемые');
    expect(container.textContent).not.toContain('пока пусто');
    expect(container.textContent).not.toContain('Быстрый выбор');
    expect(container.textContent).not.toContain('ничего не выбрано');
    expect(screen.queryByText('Медленное укрепление задней линии')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Контрольные круги тазобедренного/ }));
    await waitFor(() => expect(screen.getByText('1 в плане')).toBeTruthy());
    expect(container.textContent).toContain('Почти готово');
    expect(container.textContent).toContain('Ограничения и безопасность останутся включены');
    expect(container.textContent).not.toContain('Сборка готовится');
    fireEvent.click(screen.getByRole('button', { name: /Квадратное дыхание/ }));
    await waitFor(() => expect(screen.getByText('2 в плане')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Начать свой план' }));
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Свой план').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('Личная сборка');
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.querySelectorAll('.mobility-guided-step').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Контрольные круги тазобедренного');
    expect(container.textContent).toContain('Квадратное дыхание');
    expect(container.textContent).not.toContain('Hip CARs');
    expect(container.textContent).not.toContain('Box breathing');
  });

  it('кнопка списка упражнений в шапке открывает реестр и добавляет в свою сборку', { timeout: 60000 }, async () => {
    render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Упражнения' }));
    const dialog = screen.getByRole('dialog', { name: 'Упражнения' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/\d+ упражнений · фото, как выполнять и зачем/)).toBeTruthy();
    expect(dialog.textContent).not.toContain('доза и назначение');
    expect(dialog.textContent).not.toContain('атомов');
    expect(dialog.querySelectorAll('.mobility-fs-registry-card__img').length).toBeGreaterThan(0);
    expect(dialog.textContent).toContain('дыхание ровное');
    expect(dialog.textContent).toContain('Самочувствие');
    expect(dialog.textContent).not.toContain('Готовность');
    expect(dialog.textContent).toContain('Активация');
    expect(dialog.textContent).toContain('Мягкие ткани');
    expect(dialog.textContent).toContain('Суставной контроль');
    expect(dialog.textContent).not.toContain('bodyweight');
    expect(dialog.textContent).not.toContain('activation');
    expect(dialog.textContent).not.toContain('foam_roll');
    expect(dialog.textContent).not.toContain('readiness');
    expect(dialog.textContent).not.toContain('tissue_recovery');
    expect(dialog.textContent).not.toContain('Hip CARs');
    expect(dialog.textContent).not.toContain('Box breathing');
    expect(dialog.textContent).not.toContain('Wall angels');
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Поиск по упражнениям' }), {
      target: { value: 'тазобедренного' }
    });
    expect(within(dialog).getByText('Контрольные круги тазобедренного')).toBeTruthy();
    expect(within(dialog).queryByText('Квадратное дыхание')).toBeNull();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'В план' })[0]);
    await waitFor(() => expect(within(dialog).getByText('1 в плане')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть свой план' }));
    expect(screen.queryByRole('dialog', { name: 'Упражнения' })).toBeNull();
    expect(screen.getByRole('tab', { name: /Свой план/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('1 в плане')).toBeTruthy();
  });

  it('переключает цель кнопкой и перестраивает режим без запуска runner', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Вечер/ }));
    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('evening_relax');
    expect(container.querySelector('.mobility-guided')).toBeNull();
  });

  it('показывает Осанку как полноценный режим и запускает тренировку осанки', { timeout: 60000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    fireEvent.click(screen.getByRole('tab', { name: /Осанка/ }));

    expect(container.querySelector('.mobility-app').getAttribute('data-mode')).toBe('posture');
    expect(screen.getAllByText('Осанка').length).toBeGreaterThan(0);
    expect(screen.queryByText('Режим осанки готовится')).toBeNull();
    expect(screen.queryByText('без запуска')).toBeNull();
    expect(screen.getByRole('button', { name: 'Начать тренировку' })).toBeTruthy();
    expect(screen.getByText('Осанка собрана через контроль и укрепление, не через одну растяжку')).toBeTruthy();
    expect(container.textContent).toContain('Осанка: лопатка с резинкой');
    const mixCard = container.querySelector('.mobility-fs-mixcard');
    const exerciseRows = mixCard.querySelectorAll('.mobility-fs-mixcard__exrow');
    const countChip = Array.from(mixCard.querySelectorAll('.mobility-chip'))
      .map((node) => node.textContent || '')
      .find((text) => /\d+ упр$/.test(text));
    expect(countChip).toBeTruthy();
    expect(exerciseRows.length).toBe(Number(countChip.match(/\d+/)[0]));

    startTodayTraining();
    startGuidedSession();
    expect(container.querySelector('.mobility-guided')).not.toBeNull();
    expect(container.textContent).toContain('Кивок глубоких сгибателей шеи');
  });

  it('запускает курс осанки, заменяет упражнение в зоне и пишет feedback', { timeout: 60000 }, async () => {
    const storage = globalThis.HEYS.Mobility.recordsStore.createMemoryStorage();
    const clientId = 'course-client';
    const postureProfile = Object.assign({}, profile, { goal: 'posture', loadLevel: 4 });
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile: postureProfile,
      modeId: 'posture',
      clientId,
      storage,
      nowDate: '2026-06-08'
    }));

    expect(screen.getByRole('tab', { name: /Календарь/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть курс' })).toBeTruthy();
    expect(container.querySelectorAll('.mobility-course-card__slot')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть курс' }));
    expect(screen.getByText('Замеры и контроль изменений')).toBeTruthy();
    expect(container.querySelector('.mobility-fs-equipment')).toBeNull();
    expect(container.querySelector('.mobility-fs-goalsel')).toBeNull();
    expect(container.querySelector('.mobility-fs-load')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Начать курс' }));
    expect(container.querySelector('[data-course-active]')).not.toBeNull();
    expect(container.textContent).toContain('Курс обновлён');
    expect(container.textContent).not.toContain('Боль отмечена');
    expect(container.textContent).toContain('Что делать сейчас');
    expect(container.textContent).toContain('Сделайте сегодняшнюю тренировку');
    expect(container.textContent).toContain('Если упражнение не подходит');
    expect(container.textContent).toContain('Проверяйте изменения');
    expect(container.textContent).toContain('Заменить зону, если нужно');
    expect(container.textContent).not.toContain('Кнопки ниже заменяют упражнение');
    expect(container.textContent).not.toContain('управление курсом');
    expect(screen.getByRole('button', { name: 'Перейти к тренировке' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть замеры' })).toBeTruthy();
    expect(globalThis.HEYS.Mobility.recordsStore.latestCourse(clientId, storage)).toBeTruthy();

    const replaceButtons = container.querySelectorAll('.mobility-course-card__slot');
    expect(replaceButtons.length).toBeGreaterThan(0);
    Array.from(replaceButtons).forEach(function (btn) {
      expect(btn.textContent).not.toContain('Заменить:');
      expect(btn.textContent).not.toContain('_');
    });
    for (const btn of replaceButtons) {
      fireEvent.click(btn);
      if (globalThis.HEYS.Mobility.recordsStore.load(clientId, storage).slotHistory.length) break;
    }
    expect(globalThis.HEYS.Mobility.recordsStore.load(clientId, storage).slotHistory.length).toBe(1);

    fireEvent.click(screen.getByRole('tab', { name: /Календарь/ }));
    expect(container.querySelector('[data-course-calendar="1"]')).not.toBeNull();
    expect(container.textContent).toContain('Курс уже влияет на тренировку недели');
    expect(container.textContent).toContain('Посмотреть курс');
    expect(container.textContent).not.toContain('Недельный план учитывает курс');
    expect(container.textContent).not.toContain('повторная проверка');
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть курс' }));
    expect(screen.getAllByText('Курс осанки').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /Сегодня/ }));
    expect(container.textContent).toContain('Здесь кратко: курс уже учитывается');
    expect(container.querySelectorAll('.mobility-course-card__slot')).toHaveLength(0);

    startTodayTraining();
    startGuidedSession();
    await waitFor(() => expect(container.querySelector('.mobility-step-feedback')).not.toBeNull());
    expect(screen.getByLabelText('Ощущения после упражнения')).toBeTruthy();
    expect(screen.getByText('В самый раз')).toBeTruthy();
    expect(screen.getByText('Потерял технику')).toBeTruthy();
    expect(container.textContent).not.toContain('Техника ухудшилась');
    expect(screen.getByRole('button', { name: 'Потерял технику' })).toBeTruthy();
    expect(screen.queryByLabelText('Оценка упражнения')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Техника нестабильна' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'В самый раз' }));
    const saved = globalThis.HEYS.Mobility.recordsStore.load(clientId, storage);
    expect(saved.stepFeedback.length).toBe(1);
    expect(saved.stepFeedback[0].slotId).toBeTruthy();
    expect(saved.stepFeedback[0].courseId).toBeTruthy();
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
    expect(container.textContent).toContain('Гипермобильность');
    expect(container.textContent).toContain('Ролл');
    expect(container.textContent).not.toContain('hypermobile');
    expect(container.textContent).not.toContain('foam_roll');
  });

  it('показывает боль как ограничение тренировки', { timeout: 20000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'anti_sedentary',
      painFlags: [{ level: 'pain', zone: 'hip' }]
    }));
    startTodayTraining();
    expect(container.textContent).toContain('острая боль');
    expect(container.textContent).toContain('1 ограничение');
    expect(container.textContent).not.toContain('1 огранич.');
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.textContent).not.toContain('острая боль');
  });

  it('SourceBadge — общий kernel-бейдж (автор/год)', () => {
    const { container } = render(React.createElement(UI().SourceBadge, { sourceId: 'behm2016' }));
    expect(container.querySelector('.fingers-source-badge')).not.toBeNull();
    expect(container.textContent).toContain('Behm et al.');
    expect(container.textContent).toContain('2016');
  });

  it('открывает обоснование плана без академического заголовка', { timeout: 12000 }, () => {
    render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Обоснование плана' }));
    expect(screen.getByRole('dialog', { name: 'Обоснование плана' })).toBeTruthy();
    expect(screen.getByText(/исследований и рекомендаций, на которых основаны план и ограничения/)).toBeTruthy();
    expect(screen.getByText('Как выстроить разминку перед нагрузкой')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Доказательная база' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Источники и методология' })).toBeNull();
    expect(document.body.textContent).not.toContain('RAMP');
    expect(document.body.textContent).not.toContain('PNF');
    expect(document.body.textContent).not.toContain('CARs');
    expect(document.body.textContent).not.toContain('DOMS');
    expect(document.body.textContent).not.toContain('DNIC');
  });

  it('показывает прогресс замеров и статус повторной проверки из records', () => {
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
    expect(screen.getByText('Замеры и контроль изменений')).toBeTruthy();
    expect(container.textContent).toContain('нужно обновить замеры');
    expect(container.textContent).not.toContain('пора повторить проверку');
    expect(container.textContent).toContain('Голеностоп: тыльное сгибание');
    expect(container.textContent).not.toContain('ankle_dorsiflexion');
    expect(container.textContent).toContain('+4°');
    expect(container.textContent).not.toContain('+4deg');
  });

  it('показывает следующий шаг прогресса без технической оси', () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'develop_mobility',
      progressionHistory: { romValues: [70, 71, 70.5], progressionAxis: 'amplitude' }
    }));
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(screen.getByText('Следующий шаг')).toBeTruthy();
    expect(screen.getByText('Изменения замедлились: поменяйте один параметр нагрузки')).toBeTruthy();
    expect(container.textContent).toContain('Здесь замеры и подсказка, как двигаться дальше');
    expect(screen.queryByText('Следующая настройка')).toBeNull();
    expect(screen.queryByText('Прогресс встал: поменяйте параметр нагрузки')).toBeNull();
    expect(container.textContent).not.toContain('правило прогрессии');
    expect(screen.queryByText('Подсказка прогрессии')).toBeNull();
    expect(screen.queryByText('Прогресс остановился: смените ось нагрузки')).toBeNull();
    fireEvent.change(screen.getByLabelText('Что скорректировать'), { target: { value: 'load' } });
    expect(screen.getByLabelText('Что скорректировать').value).toBe('load');
  });

  it('замеры подвижности дают ручной ввод без технических кодов', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'develop_mobility' }));
    openTestsProfile();
    expect(screen.getByText('Перед тренировкой')).toBeTruthy();
    expect(container.textContent).toContain('Самочувствие задаёт нагрузку на сегодня');
    expect(screen.getByText('Замеры движения')).toBeTruthy();
    expect(screen.queryByText('Проверка подвижности')).toBeNull();
    expect(screen.queryByText('Аудит подвижности')).toBeNull();
    expect(screen.getByText('Настройки тренировки')).toBeTruthy();
    expect(screen.queryByText('Данные для подбора')).toBeNull();
    expect(screen.queryByText('Контроль перед подбором')).toBeNull();
    expect(screen.queryByText('Контрольные замеры')).toBeNull();
    expect(screen.queryByText('Настройки подбора')).toBeNull();
    expect(screen.queryByText('Профиль')).toBeNull();
    expect(screen.getByText('Самочувствие сегодня')).toBeTruthy();
    expect(screen.queryByText('Готовность')).toBeNull();
    expect(screen.getByLabelText('Голеностоп: тыльное сгибание текущий замер')).toBeTruthy();
    expect(screen.getByLabelText('Плечо: наружная ротация самостоятельно')).toBeTruthy();
    expect(container.textContent).toContain('ориентир');
    expect(container.textContent).not.toContain('deg');
    expect(container.textContent).not.toContain('ankle_dorsiflexion');
    expect(container.textContent).not.toContain('shoulder_er');
    fireEvent.change(screen.getByLabelText('Голеностоп: тыльное сгибание текущий замер'), { target: { value: '12' } });
    expect(container.textContent).toContain('Что сейчас мешает движению');
    expect(container.textContent).toContain('Голеностоп');
    expect(container.textContent).toContain('диапазон пока ниже ориентира');
    expect(container.textContent).not.toContain('пассивный потолок ниже нормы');
    expect(container.textContent).toContain('40%');
  });

  it('сохраняет тренировку и проверку через client-scoped recordsStore', () => {
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
    startTodayTraining();
    openTestsProfile();
    fireEvent.change(screen.getByLabelText('Голеностоп: тыльное сгибание текущий замер'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замеры' }));
    expect(container.textContent).toContain('Замеры сохранены');
    fireEvent.click(screen.getByRole('tab', { name: /Сегодня/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в тренировку' }));
    expect(container.textContent).toContain('Тренировка сохранена');
    expect(container.textContent).not.toContain('Сессия сохранена');
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

    startTodayTraining();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить тренировку' }));
    expect(savedTrainings).toHaveLength(0);
    expect(globalThis.HEYS.Mobility.recordsStore.load('client-a', storage).sessions).toHaveLength(1);
    delete globalThis.HEYS.TrainingStep;
  });

  it('readiness UI принимает субъективные шкалы и меняет advisory', () => {
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'morning_tonify' }));
    openTestsProfile();
    expect(container.textContent).toContain('можно работать по обычному плану');
    expect(container.textContent).not.toContain('готовность нормальная');
    expect(screen.getByLabelText('Пульс: обычный уровень')).toBeTruthy();
    expect(screen.getByLabelText('Пульс: дневной разброс')).toBeTruthy();
    expect(container.textContent).not.toContain('ВСР');
    expect(container.textContent).not.toContain('HRV MAD');
    expect(container.textContent).not.toContain('HRV база');
    fireEvent.change(screen.getByLabelText('Скованность'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Боль и дискомфорт'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Сон'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Стресс'), { target: { value: '10' } });
    expect(container.textContent).toContain('снизить интенсивность');
  });

  it('показывает CWI advisory перед запуском тренировки с сопровождением', { timeout: 60000 }, () => {
    const { container } = render(React.createElement(UI().MobilityApp, {
      profile,
      modeId: 'post_workout',
      coldWaterPlanned: true,
      afterAdaptiveStrength: true
    }));
    startTodayTraining();
    expect(container.textContent).toContain('может глушить адаптацию');
    expect(container.textContent).not.toContain('CWI.after_adaptive_strength');
    fireEvent.click(screen.getByRole('tab', { name: /Прогресс/ }));
    expect(container.textContent).not.toContain('может глушить адаптацию');
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
    startTodayTraining();
    expect(container.textContent).toContain('может глушить адаптацию');
    expect(container.textContent).not.toContain('CWI.after_adaptive_strength');
  });

  it('execution panel показывает дыхательные фазы и lifecycle controls', () => {
    let modalOptions = null;
    globalThis.HEYS.ConfirmModal = {
      show: vi.fn((options) => {
        modalOptions = options;
      })
    };
    const { container } = render(React.createElement(UI().MobilityApp, { profile, modeId: 'evening_relax' }));
    startTodayTraining();
    expect(container.querySelector('.mobility-guided')).toBeNull();
    startGuidedSession();
    expect(modalOptions.title).toBe('Перед началом');
    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });
    expect(screen.getAllByText('Тренировка с сопровождением').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ведомая тренировка')).toBeNull();
    expect(container.textContent).toContain('План занятия');
    expect(container.textContent).toContain('Упражнение');
    expect(container.textContent).not.toContain('Этапы тренировки');
    expect(within(container.querySelector('.mobility-execution')).queryByRole('button', { name: 'Пропустить фазу' })).toBeNull();
    expect(within(container.querySelector('.mobility-execution')).getByRole('button', { name: 'Пропустить часть' })).toBeTruthy();
    expect(container.querySelector('.mobility-breath-phases')).not.toBeNull();
    expect(container.querySelector('.mobility-guided__visual img')).not.toBeNull();
    const compactTechnique = container.querySelector('.mobility-technique-card--compact');
    expect(compactTechnique).not.toBeNull();
    expect(compactTechnique.querySelector('ul')).toBeNull();
    expect(compactTechnique.textContent).not.toContain('Проще:');
    expect(compactTechnique.textContent).not.toContain('Сложнее:');
    expect(container.textContent).toContain('длинный выдох');
    const execution = container.querySelector('.mobility-execution');
    const status = () => execution.querySelector('.mobility-execution__status').getAttribute('data-status');
    expect(status()).toBe('running');
    expect(within(execution).queryByRole('button', { name: 'Прервать' })).toBeNull();
    expect(container.textContent).not.toContain('Прервано');
    fireEvent.click(within(execution).getByRole('button', { name: 'Пауза' }));
    expect(status()).toBe('paused');
    fireEvent.click(within(execution).getByRole('button', { name: 'Завершить тренировку' }));
    expect(globalThis.HEYS.ConfirmModal.show).toHaveBeenCalled();
    expect(modalOptions.title).toBe('Остановить тренировку?');
    expect(status()).toBe('paused');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(modalOptions.title).toBe('Сохранить то, что уже сделали?');
    expect(modalOptions.text).toContain('Отметим тренировку как частично выполненную');
    expect(modalOptions.confirmText).toBe('Сохранить результат');
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
    startTodayTraining();
    startGuidedSession();
    expect(modalOptions.title).toBe('Перед началом');
    act(() => {
      modalOptions.actions.find((action) => action.key === 'go').onClick();
    });
    const execution = container.querySelector('.mobility-execution');
    fireEvent.click(within(execution).getByRole('button', { name: 'Завершить тренировку' }));
    expect(modalOptions.title).toBe('Остановить тренировку?');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(modalOptions.title).toBe('Сохранить то, что уже сделали?');
    expect(modalOptions.text).toContain('Отметим тренировку как частично выполненную');
    act(() => {
      modalOptions.onConfirm();
    });
    expect(container.querySelector('.mobility-guided')).toBeNull();
    expect(container.textContent).toContain('Тренировка сохранена');
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
    startTodayTraining();
    startGuidedSession();
    let execution = container.querySelector('.mobility-execution');
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('running');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(screen.getByRole('tab', { name: /Нагрузка/ }));
    startTodayTraining();
    expect(container.querySelector('.mobility-execution')).toBeNull();
    startGuidedSession();
    execution = container.querySelector('.mobility-execution');
    expect(execution.querySelector('.mobility-execution__status').getAttribute('data-status')).toBe('running');
  });
});
