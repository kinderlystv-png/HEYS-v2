import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sourcePath = path.resolve(__dirname, '../heys_planning_game_assemble_day_v1.js');
const entryPath = path.resolve(__dirname, '../assemble-day/heys_assemble_day_game_v1.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const entry = fs.readFileSync(entryPath, 'utf8');
const clientId = '12345678-aaaa-bbbb-cccc-1234567890ab';
const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalClipboard = window.navigator.clipboard;
const defaultPlan = { weeklyRuleIds: ['protect_sleep', 'family_anchor', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' };

function memoryStore(initial = null) {
  let value = initial;
  return {
    get: vi.fn((_key, fallback) => value ?? fallback),
    getPersisted: vi.fn((_key, fallback) => value ?? fallback),
    set: vi.fn((_key, next) => { value = next; return true; }),
    value: () => value,
  };
}

function loadModule(store = memoryStore()) {
  window.HEYS = { currentClientId: clientId, store };
  window.React = React;
  // eslint-disable-next-line no-eval
  (0, eval)(source);
  return { module: window.HEYS.PlanningGames.modules['assemble-day'], store };
}

describe('Planning Assemble Day', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.HEYS = originalHEYS;
    window.React = originalReact;
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: originalClipboard });
  });

  it('bundles the real engine behind a narrow browser adapter', () => {
    const { module } = loadModule();
    const session = module.api.createSession('adapter-smoke');
    const before = JSON.stringify(session.state);
    const view = module.api.getCampaignView(session);

    expect(module.api.version).toBe(1);
    expect(view.event.id).toBe('mon_breakfast');
    expect(view.event.title).toBe('Начало недели');
    expect(view.offers).toHaveLength(4);
    expect(view.offers.find((offer) => offer.actionId === 'eat_ready_meal')).toMatchObject({
      label: 'Съесть заранее приготовленный завтрак',
      summary: 'Разогреть готовую порцию: утром готовить не нужно.',
      effectiveTimeMin: 20,
      effortLabel: 'лёгкое усилие',
      riskLabel: 'без заметного риска',
      consequencePreview: [],
    });
    expect(view.offers.find((offer) => offer.actionId === 'cook_meal_batch')).toMatchObject({
      label: 'Приготовить завтрак',
      summary: 'Приготовить еду сейчас и оставить две готовые порции на следующие приёмы.',
      effectiveTimeMin: 70,
      effortLabel: 'высокое усилие',
      riskLabel: 'умеренный риск',
    });
    expect(view.offers.find((offer) => offer.actionId === 'cook_meal_batch').consequencePreview).toEqual(['Сжатое утро: готовка потребует ещё 10 минут, больше усилия и повысит напряжение']);
    expect(view.offers.every((offer) => offer.label && Number.isFinite(offer.effectiveTimeMin))).toBe(true);
    expect(view.offers.every((offer) => offer.consequenceSummary.startsWith('Сразу:'))).toBe(true);
    expect(view.offers.find((offer) => offer.actionId === 'drink_coffee_100').consequenceSummary).toContain('Позже: отложенный спад после кофе');

    const cooked = module.api.confirmAction(session, 'cook_meal_batch');
    expect(cooked.lastSummary).toMatchObject({
      actionLabel: 'Приготовить завтрак',
      mainChange: 'Главное изменение: домашний запас еды.',
      causalLink: 'Начало недели → Приготовить завтрак → созданы готовые порции → домашний запас еды.',
    });
    expect(cooked.state.clock.awakeSinceMinute).toBe(session.state.clock.awakeSinceMinute);
    expect(cooked.state.causalJournal.some((entry) => entry.resultPath === 'decisionGeometry.cook_meal_batch.context.deadlinePressure')).toBe(true);
    expect(cooked.diagnostics).toMatchObject({ version: 1, history: 'complete' });
    expect(cooked.diagnostics.decisions).toEqual([{ kind: 'action', revision: 1, stepIndex: 0, eventId: 'mon_breakfast', actionId: 'cook_meal_batch' }]);

    const next = module.api.confirmAction(session, view.offers.find((offer) => offer.available).actionId);
    expect(JSON.stringify(session.state)).toBe(before);
    expect(next.state.clock.stepIndex).toBe(1);
    expect(next.state.causalJournal.length).toBeGreaterThan(0);
    expect(next.lastSummary.causalLink).toContain('→');
    expect(Object.keys(module.api.eventCopy)).toHaveLength(38);
    expect(source).not.toMatch(/node:(?:fs|path|url|child_process)/);
  });

  it('keeps operational costs out of the main causal result and names the chosen action', () => {
    const { module } = loadModule();
    const session = module.api.createSession('causal-summary');
    const next = module.api.confirmAction(session, 'drink_coffee_100');

    expect(next.lastSummary.mainChange).toBe('Главное изменение: запас сил.');
    expect(next.lastSummary.causalLink).toBe('Начало недели → Выпить кофе → краткий стимул → запас сил.');
    expect(next.lastSummary.causalLink).not.toContain('денежная цена действия');
  });

  it('persists only a confirmed reducer step and resumes it after reload', () => {
    const { module, store } = loadModule();
    const session = module.api.createSession('checkpoint');
    const actionId = module.api.getCampaignView(session).offers.find((offer) => offer.available).actionId;
    expect(store.set).not.toHaveBeenCalled();

    const confirmed = module.api.confirmAction(session, actionId);
    const saved = module.api.saveCheckpoint(store, clientId, confirmed);
    expect(saved.status).toBe('saved');
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set.mock.calls[0][0]).toBe('heys_planning_assemble_day_campaign_v1');
    expect(store.value().revision).toBe(1);
    expect(store.value().state.clock.stepIndex).toBe(1);
    expect(store.value().diagnostics.decisions).toHaveLength(1);
    expect(JSON.stringify(store.value())).not.toContain('selectedActionId');

    const reloaded = module.api.loadCheckpoint(store, clientId);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.session.state.clock.stepIndex).toBe(1);
    expect(reloaded.session.diagnostics.decisions).toHaveLength(1);
    expect(module.api.getCampaignView(reloaded.session).progress.current).toBe(2);
  });

  it('shows known consequences before the irreversible tap, then inserts a separate result beat', () => {
    const { module, store } = loadModule();
    const planned = module.api.confirmPlanning(module.api.createSession('ui-choice'), defaultPlan);
    expect(module.api.saveCheckpoint(store, clientId, planned).status).toBe('saved');
    store.set.mockClear();
    render(React.createElement(module.Component, { onExit: vi.fn() }));

    const readyBreakfast = screen.getByRole('radio', { name: /Съесть заранее приготовленный завтрак/ });
    const cookBreakfast = screen.getByRole('radio', { name: /Приготовить завтрак/ });
    const quickSnack = screen.getByRole('radio', { name: /Быстро перекусить/ });
    const coffee = screen.getByRole('radio', { name: /Выпить кофе/ });
    const confirm = screen.getByRole('button', { name: 'Подтвердить решение' });

    expect(document.querySelectorAll('.assemble-day-option__known')).toHaveLength(4);
    expect(confirm.disabled).toBe(true);
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(readyBreakfast);

    expect(readyBreakfast.getAttribute('aria-checked')).toBe('true');
    expect(readyBreakfast.disabled).toBe(false);
    expect(cookBreakfast.disabled).toBe(true);
    expect(quickSnack.disabled).toBe(true);
    expect(coffee.disabled).toBe(true);
    expect(document.querySelectorAll('.assemble-day-option__known')).toHaveLength(4);
    expect(screen.getByText('Вариант зафиксирован. Проверьте последствия и подтвердите решение.')).toBeTruthy();
    expect(screen.getAllByText('Закрыто после первого выбора')).toHaveLength(3);
    expect(confirm.disabled).toBe(false);
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(quickSnack);
    expect(readyBreakfast.getAttribute('aria-checked')).toBe('true');
    expect(quickSnack.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(confirm);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.value().state.clock.stepIndex).toBe(1);
    expect(store.value().diagnostics.decisions).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Съесть заранее приготовленный завтрак' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Дорога к первому делу' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByRole('heading', { name: 'Дорога к первому делу' })).toBeTruthy();
  });

  it('never silently resets an incompatible snapshot or overwrites newer progress', () => {
    const first = loadModule();
    const session = first.module.api.createSession('protected');
    const actionId = first.module.api.getCampaignView(session).offers.find((offer) => offer.available).actionId;
    const stepOne = first.module.api.confirmAction(session, actionId);
    first.module.api.saveCheckpoint(first.store, clientId, stepOne);
    const incompatible = structuredClone(first.store.value());
    incompatible.contract.scenarioVersion = 'future';
    const incompatibleStore = memoryStore(incompatible);

    expect(first.module.api.loadCheckpoint(incompatibleStore, clientId)).toMatchObject({ status: 'incompatible' });
    expect(incompatibleStore.set).not.toHaveBeenCalled();

    const stepTwoView = first.module.api.getCampaignView(stepOne);
    const stepTwo = first.module.api.confirmAction(stepOne, stepTwoView.offers.find((offer) => offer.available).actionId);
    first.module.api.saveCheckpoint(first.store, clientId, stepTwo);
    const staleSave = first.module.api.saveCheckpoint(first.store, clientId, stepOne);
    expect(staleSave.status).toBe('conflict');
    expect(first.store.value().revision).toBe(2);
  });

  it('confirms an atomic plan without advancing scenario time and resumes its separate revision', () => {
    const { module, store } = loadModule();
    const session = module.api.createSession('planning-checkpoint');
    const plan = { weeklyRuleIds: ['protect_sleep', 'family_anchor', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' };
    const view = module.api.getPlanningCampaignView(session, plan);

    expect(view.valid).toBe(true);
    expect(view.conflicts.map((item) => item.id)).toEqual(expect.arrayContaining(['work_family_window', 'work_sleep_window']));
    expect(view.financialHorizon.cashAfterNextObligationsRub).toBe(59000);
    expect(store.set).not.toHaveBeenCalled();

    const confirmed = module.api.confirmPlanning(session, plan);
    expect(confirmed.revision).toBe(1);
    expect(confirmed.state.clock.stepIndex).toBe(0);
    expect(confirmed.state.scenarioCursor).toBe(0);
    expect(confirmed.state.weeklyRules.map((item) => item.id)).toEqual(plan.weeklyRuleIds);
    expect(confirmed.diagnostics.decisions).toEqual([{ kind: 'planning', revision: 1, stepIndex: 0, plan }]);
    expect(module.api.saveCheckpoint(store, clientId, confirmed).status).toBe('saved');
    expect(store.value().revision).toBe(1);
    expect(store.value().state.clock.stepIndex).toBe(0);

    const reloaded = module.api.loadCheckpoint(store, clientId);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.session.revision).toBe(1);
    expect(reloaded.session.state.monthlyPriorities).toEqual(expect.arrayContaining([
      { domain: 'work', level: 2 },
      { domain: 'family', level: 1 },
    ]));
  });

  it('replays and copies a complete privacy-safe diagnostic trace', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { module, store } = loadModule();
    const rawSeed = `assemble-day:${clientId}:2026-07-29`;
    const session = module.api.createSession(rawSeed);
    const confirmed = module.api.confirmAction(session, 'cook_meal_batch');
    expect(module.api.saveCheckpoint(store, clientId, confirmed).status).toBe('saved');

    const text = module.api.serializeDiagnosticTrace(confirmed);
    const trace = JSON.parse(text);
    expect(trace.replayIntegrity.status).toBe('match');
    expect(trace.replayIntegrity.replayStateHash).toBe(trace.replayIntegrity.actualStateHash);
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0].offersBefore).toHaveLength(4);
    expect(trace.steps[0].reducerStages).toHaveLength(10);
    expect(trace.steps[0].reducerStages.every((stage) => stage.hash)).toBe(true);
    expect(trace.steps[0].journalEntries.length).toBeGreaterThan(0);
    expect(trace.catalog.actions.cook_meal_batch.geometryRules.length).toBeGreaterThan(0);
    expect(text).not.toContain(clientId);
    expect(text).not.toContain(rawSeed);
    expect(text).not.toContain(confirmed.state.campaignId);
    expect(text).not.toMatch(/dayv2|diary|heys_game/i);

    render(React.createElement(module.Component, { onExit: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Жизнь' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать технический лог' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(() => JSON.parse(writeText.mock.calls[0][0])).not.toThrow();
    expect(screen.getByText(/Технический лог скопирован/)).toBeTruthy();
  });

  it('marks old checkpoints as partial and keeps the compact ledger below the storage limit', () => {
    const first = loadModule();
    let session = first.module.api.createSession('diagnostic-size');
    while (!first.module.api.getCampaignView(session).complete) {
      const view = first.module.api.getCampaignView(session);
      session = first.module.api.confirmAction(session, view.offers.find((offer) => offer.available).actionId);
    }
    expect(first.module.api.saveCheckpoint(first.store, clientId, session).status).toBe('saved');
    const storageBytes = ('heys_planning_assemble_day_campaign_v1'.length + JSON.stringify(first.store.value()).length) * 2;
    expect(storageBytes).toBeLessThan(512 * 1024);
    expect(session.diagnostics.decisions).toHaveLength(38);

    const fullTraceText = first.module.api.serializeDiagnosticTrace(session);
    const fullTrace = JSON.parse(fullTraceText);
    expect(fullTrace.replayIntegrity.status).toBe('match');
    expect(fullTrace.replayIntegrity.replayStateHash).toBe(fullTrace.replayIntegrity.actualStateHash);
    expect(fullTrace.steps).toHaveLength(38);
    expect(fullTrace.steps.every((step) => step.reducerStages.length === 10)).toBe(true);
    expect(fullTraceText).not.toContain(session.state.rng.seed);
    expect(fullTraceText).not.toContain(session.state.campaignId);

    render(React.createElement(first.module.Component, { onExit: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByRole('heading', { name: 'Итог складывается из четырёх линий' })).toBeTruthy();
    expect(screen.getByText('Проект')).toBeTruthy();
    expect(screen.getByText('Договорённости')).toBeTruthy();
    expect(screen.queryByText(/общий балл:/i)).toBeNull();
    const savedCount = first.store.set.mock.calls.length;
    const completedSeed = session.state.rng.seed;
    fireEvent.click(screen.getByRole('button', { name: 'Пройти этот сценарий иначе' }));
    expect(screen.getByRole('heading', { name: 'Какие границы сохранить' })).toBeTruthy();
    expect(first.store.set).toHaveBeenCalledTimes(savedCount);
    fireEvent.click(screen.getByRole('checkbox', { name: /Закончить день вовремя/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Защитить рабочие блоки/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить к приоритетам' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить план' }));
    expect(first.store.value().state.rng.seed).toBe(completedSeed);
    expect(first.store.value().comparisonBaseline?.finalStateHash).toBeTruthy();
    cleanup();

    const legacyEnvelope = structuredClone(first.store.value());
    delete legacyEnvelope.diagnostics;
    const legacyStore = memoryStore(legacyEnvelope);
    const loaded = first.module.api.loadCheckpoint(legacyStore, clientId);
    expect(loaded.status).toBe('ready');
    expect(loaded.session.diagnostics).toEqual({ version: 1, history: 'legacy_partial', decisions: [] });
    expect(first.module.api.createDiagnosticTrace(loaded.session).replayIntegrity.status).toBe('partial');
  }, 20_000);

  it('renders progressive planning, exposes conflicts and saves only on final confirmation', () => {
    const { module, store } = loadModule();
    render(React.createElement(module.Component, { onExit: vi.fn() }));

    expect(screen.getByRole('heading', { name: 'Координатор проектов' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }));
    expect(screen.getByRole('heading', { name: 'Какие границы сохранить' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Продолжить к приоритетам' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Закончить день вовремя/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Сохранить семейный вечер/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Защитить рабочие блоки/ }));
    expect(screen.getByText('Работа и семья претендуют на одно окно')).toBeTruthy();
    expect(screen.getByText('Срок проекта давит на границу сна')).toBeTruthy();
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Продолжить к приоритетам' }));
    expect(screen.getByRole('heading', { name: 'Что защищать в первую очередь' })).toBeTruthy();
    expect(screen.getByText('Финансовый горизонт')).toBeTruthy();
    expect(screen.getByText(/59.*000 ₽/)).toBeTruthy();
    expect(screen.getAllByText('Срок проекта').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ожидаемое поступление').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Семья' })[0]);
    expect(screen.getByText('Главный и поддерживающий фокус должны отличаться.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подтвердить план' }).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Работа' })[0]);
    expect(screen.getByRole('button', { name: 'Подтвердить план' }).disabled).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить план' }));
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.value().revision).toBe(1);
    expect(store.value().state.clock.stepIndex).toBe(0);
    expect(screen.getByText(/План принят/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Перейти к дню' }));
    const firstChoice = screen.getByRole('radio', { name: /Приготовить завтрак/ });
    fireEvent.click(firstChoice);
    expect(document.querySelector('.assemble-day-option__signals')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Жизнь' }));
    expect(screen.getByText(/История решений/)).toBeTruthy();
    fireEvent.click(screen.getByText(/История решений/));
    expect(screen.getByText('Контракт недели')).toBeTruthy();
    expect(screen.getByText('Диагностика кампании')).toBeTruthy();
  });

  it('keeps diary data and the existing HEYS gamification key outside the adapter', () => {
    expect(entry).not.toMatch(/heys_game(?:\W|$)/);
    expect(entry).not.toMatch(/dayv2|diary|дневник/i);
    expect(entry).not.toMatch(/localStorage|sessionStorage/);
  });
});
