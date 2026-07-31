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
const defaultPlan = { weeklyRuleIds: ['protect_sleep', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' };

function memoryStore(initial = undefined) {
  let value = initial;
  return {
    get: vi.fn((_key, fallback) => value === undefined ? fallback : value),
    getPersisted: vi.fn((_key, fallback) => value === undefined ? fallback : value),
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
    expect(cooked.lastStepSummary).toMatchObject({
      actionLabel: 'Приготовить завтрак',
      mainChange: 'Главное изменение: домашний запас еды вырос.',
      causalLink: 'Начало недели → Приготовить завтрак → созданы готовые порции → домашний запас еды вырос.',
    });
    expect(cooked.state.clock.awakeSinceMinute).toBe(session.state.clock.awakeSinceMinute);
    expect(cooked.state.causalJournal.some((entry) => entry.resultPath === 'decisionGeometry.cook_meal_batch.context.deadlinePressure')).toBe(true);
    expect(cooked.diagnostics).toMatchObject({ version: 1, history: 'complete' });
    expect(cooked.diagnostics.decisions).toEqual([{ kind: 'action', revision: 1, stepIndex: 0, eventId: 'mon_breakfast', actionId: 'cook_meal_batch' }]);

    const next = module.api.confirmAction(session, view.offers.find((offer) => offer.available).actionId);
    expect(JSON.stringify(session.state)).toBe(before);
    expect(next.state.clock.stepIndex).toBe(1);
    expect(next.state.causalJournal.length).toBeGreaterThan(0);
    expect(next.lastStepSummary.causalLink).toContain('→');
    expect(Object.keys(module.api.eventCopy)).toHaveLength(49);
    expect(source).not.toMatch(/node:(?:fs|path|url|child_process)/);
  });

  it('keeps operational costs out of the main causal result and names the chosen action', () => {
    const { module } = loadModule();
    const session = module.api.createSession('causal-summary');
    const next = module.api.confirmAction(session, 'drink_coffee_100');

    expect(next.lastStepSummary.mainChange).toBe('Главное изменение: запас сил вырос.');
    expect(next.lastStepSummary.causalLink).toBe('Начало недели → Выпить кофе → краткий стимул → запас сил вырос.');
    expect(next.lastStepSummary.causalLink).not.toContain('денежная цена действия');
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
    expect(store.value().envelopeVersion).toBe(3);
    expect(store.value().revision).toBe(1);
    expect(store.value().gameSeed).toBe('checkpoint');
    expect(store.value()).not.toHaveProperty('state');
    expect(store.value()).not.toHaveProperty('lastSummary');
    expect(store.value()).not.toHaveProperty('clientId');
    expect(store.value()).not.toHaveProperty('campaignId');
    expect(store.value().diagnostics.decisions).toHaveLength(1);
    expect(JSON.stringify(store.value())).not.toContain('selectedActionId');
    expect(JSON.stringify(store.value())).not.toContain(clientId);
    expect(saved.sizeBytes).toBe(module.api.checkpointSizeBytes(clientId, saved.envelope));
    expect(saved.sizeBytes).toBeLessThan(module.api.checkpointBudgetBytes);

    const reloaded = module.api.loadCheckpoint(store, clientId);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.session.state.clock.stepIndex).toBe(1);
    expect(reloaded.session.state).toEqual(confirmed.state);
    expect(reloaded.session.lastSummary).toEqual(confirmed.lastSummary);
    expect(reloaded.session.diagnostics.decisions).toHaveLength(1);
    expect(module.api.getCampaignView(reloaded.session).progress.current).toBe(2);
  });

  it('shows known consequences before the irreversible tap, then inserts a separate result beat', async () => {
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
    expect(document.querySelectorAll('.assemble-day-option__evidence')).toHaveLength(4);
    expect(confirm.disabled).toBe(true);
    expect(store.set).not.toHaveBeenCalled();

    readyBreakfast.focus();
    fireEvent.keyDown(readyBreakfast, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(cookBreakfast));
    expect(readyBreakfast.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(cookBreakfast, { key: 'Enter' });
    expect(cookBreakfast.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(readyBreakfast);
    expect(cookBreakfast.getAttribute('aria-checked')).toBe('true');

    cleanup();
    render(React.createElement(module.Component, { onExit: vi.fn() }));
    const restoredReadyBreakfast = screen.getByRole('radio', { name: /Съесть заранее приготовленный завтрак/ });
    const restoredCookBreakfast = screen.getByRole('radio', { name: /Приготовить завтрак/ });
    const restoredQuickSnack = screen.getByRole('radio', { name: /Быстро перекусить/ });
    const restoredCoffee = screen.getByRole('radio', { name: /Выпить кофе/ });
    const restoredConfirm = screen.getByRole('button', { name: 'Подтвердить решение' });

    fireEvent.click(restoredReadyBreakfast);

    expect(restoredReadyBreakfast.getAttribute('aria-checked')).toBe('true');
    expect(restoredReadyBreakfast.disabled).toBe(false);
    expect(restoredCookBreakfast.getAttribute('aria-disabled')).toBe('true');
    expect(restoredQuickSnack.getAttribute('aria-disabled')).toBe('true');
    expect(restoredCoffee.getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelectorAll('.assemble-day-option__known')).toHaveLength(4);
    expect(screen.getByText('Вариант зафиксирован. Проверьте последствия и подтвердите решение.')).toBeTruthy();
    expect(screen.getAllByText('Закрыто после первого выбора')).toHaveLength(3);
    expect(restoredConfirm.disabled).toBe(false);
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(restoredQuickSnack);
    expect(restoredReadyBreakfast.getAttribute('aria-checked')).toBe('true');
    expect(restoredQuickSnack.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(restoredConfirm);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.value().diagnostics.decisions).toHaveLength(2);
    expect(module.api.loadCheckpoint(store, clientId).session.state.clock.stepIndex).toBe(1);
    const resultHeading = screen.getByRole('heading', { name: 'Съесть заранее приготовленный завтрак' });
    expect(resultHeading).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(resultHeading));
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Дорога к первому делу' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByRole('heading', { name: 'Дорога к первому делу' })).toBeTruthy();
  });

  it('renders the engine-owned Pocket Retro scene and restores it only from confirmed state', () => {
    const { module, store } = loadModule();
    const planned = module.api.confirmPlanning(module.api.createSession('character-scene'), defaultPlan);
    expect(module.api.saveCheckpoint(store, clientId, planned).status).toBe('saved');
    store.set.mockClear();
    render(React.createElement(module.Component, { onExit: vi.fn() }));

    const beforeScene = document.querySelector('.assemble-day-character__scene');
    const beforeKey = beforeScene.getAttribute('data-frame-key');
    const beforeProjection = module.api.getCharacterPresentation(planned.state);
    expect(beforeKey).toBe(Object.values(beforeProjection.frame).join(':'));
    expect(beforeScene.querySelectorAll('rect,path,line,polyline,circle,ellipse').length).toBeLessThanOrEqual(80);
    expect(beforeScene.querySelector('image')).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.querySelectorAll('.assemble-day-status strong')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.assemble-day-status strong')).map((node) => node.textContent)).toEqual(beforeProjection.indicators.map((item) => item.value));
    expect(document.querySelector('#assemble-day-character-summary').textContent).toBe(beforeProjection.ariaSummary);

    fireEvent.click(screen.getByText('Состояние персонажа'));
    expect(screen.getAllByText(beforeProjection.summary)).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: /Съесть заранее приготовленный завтрак/ }));
    expect(document.querySelector('.assemble-day-character__scene').getAttribute('data-frame-key')).toBe(beforeKey);
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить решение' }));
    expect(store.set).toHaveBeenCalledTimes(1);
    const confirmed = module.api.loadCheckpoint(store, clientId);
    expect(confirmed.status).toBe('ready');
    const confirmedProjection = module.api.getCharacterPresentation(confirmed.session.state);
    expect(document.querySelector('.assemble-day-character__scene').getAttribute('data-frame-key')).toBe(Object.values(confirmedProjection.frame).join(':'));

    cleanup();
    render(React.createElement(module.Component, { onExit: vi.fn() }));
    expect(document.querySelector('.assemble-day-character__scene').getAttribute('data-frame-key')).toBe(Object.values(confirmedProjection.frame).join(':'));
    expect(document.querySelector('#assemble-day-character-summary').textContent).toBe(confirmedProjection.ariaSummary);
    expect(entry).not.toMatch(/state\.vitals\.(?:energy|mood|tension)\s*[<>]=?\s*(?:38|67)/);
    expect(entry).not.toMatch(/\.png|setInterval/);
  });

  it('shows exactly one replay-derived day summary before the next authored day', () => {
    const { module, store } = loadModule();
    let session = module.api.confirmPlanning(module.api.createSession('day-summary-flow'), defaultPlan);
    for (let index = 0; index < 6; index += 1) {
      const view = module.api.getCampaignView(session);
      session = module.api.confirmAction(session, view.offers.find((offer) => offer.available).actionId);
    }
    expect(session.periodSummaries.map((item) => item.id)).toEqual(['day:0']);
    expect(module.api.saveCheckpoint(store, clientId, session).status).toBe('saved');
    const journalLength = session.state.causalJournal.length;
    const saveCount = store.set.mock.calls.length;

    render(React.createElement(module.Component, { onExit: vi.fn() }));
    expect(screen.getByText('Результат решения')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByRole('heading', { name: 'День завершён: Понедельник' })).toBeTruthy();
    expect(document.querySelectorAll('.assemble-day-summary')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Перейти к следующему дню' }));
    expect(screen.getByRole('heading', { name: 'Ночная нагрузка' })).toBeTruthy();
    expect(store.set).toHaveBeenCalledTimes(saveCount);

    cleanup();
    render(React.createElement(module.Component, { onExit: vi.fn() }));
    expect(screen.getByText('Результат решения')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByRole('heading', { name: 'День завершён: Понедельник' })).toBeTruthy();
    expect(module.api.loadCheckpoint(store, clientId).session.state.causalJournal).toHaveLength(journalLength);
    expect(store.set).toHaveBeenCalledTimes(saveCount);
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
    const plan = { weeklyRuleIds: ['protect_sleep', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' };
    const view = module.api.getPlanningCampaignView(session, plan);

    expect(view.valid).toBe(true);
    expect(view.conflicts.map((item) => item.id)).toContain('work_sleep_window');
    expect(view.capacity.weekly).toEqual({ totalSlots: 2, allocatedSlots: 2, remainingSlots: 0 });
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
    expect(store.value()).not.toHaveProperty('state');

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
    const rawSeed = 'privacy-safe-trace';
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
    expect(text).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
    expect(text).not.toMatch(/dayv2|diary|heys_game/i);

    render(React.createElement(module.Component, { onExit: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Жизнь' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать технический лог' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(() => JSON.parse(writeText.mock.calls[0][0])).not.toThrow();
    expect(screen.getByText(/Технический лог скопирован/)).toBeTruthy();
  });

  it('creates an opaque browser seed and rejects UUID-bearing seeds before state creation', () => {
    const { module } = loadModule();
    const session = module.api.createSession();
    const serialized = JSON.stringify({ state: session.state, ledger: session.diagnostics });

    expect(session.state.rng.seed).toMatch(/^ad1_[0-9a-f]{32}$/);
    expect(serialized).not.toContain(clientId);
    expect(serialized).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
    expect(() => module.api.createSession(`unsafe:${clientId}`)).toThrow(/opaque|UUID/i);
  });

  it('keeps a checkpoint bounded by one period and rebuilds state, summary and trace from the anchor', () => {
    const first = loadModule();
    let session = first.module.api.createSession('diagnostic-size');
    let earlySizeBytes = 0;
    let maxTail = 0;
    while (true) {
      const view = first.module.api.getCampaignView(session);
      if (view.complete) break;
      session = first.module.api.confirmAction(session, view.offers.find((offer) => offer.available).actionId);
      maxTail = Math.max(maxTail, session.diagnostics.decisions.length);
      if (!earlySizeBytes && session.anchor.revision > 0) {
        earlySizeBytes = first.module.api.checkpointSizeBytes(clientId, first.module.api.makeEnvelope(session, clientId));
      }
    }
    const saved = first.module.api.saveCheckpoint(first.store, clientId, session);
    expect(saved.status).toBe('saved');
    expect(saved.sizeBytes).toBe(first.module.api.checkpointSizeBytes(clientId, first.store.value()));
    expect(saved.sizeBytes).toBeLessThan(first.module.api.checkpointBudgetBytes);
    // Стоимость сохранения ограничена одним периодом: снимок и хвост решений не
    // растут вместе с длиной кампании, поэтому размер к концу недели остаётся
    // сопоставимым с размером после первой закрытой границы.
    expect(earlySizeBytes).toBeGreaterThan(0);
    // Кампания идёт тридцать дней, но чекпойнт ограничен одним периодом,
    // поэтому размер в конце сопоставим с размером после первой границы.
    expect(saved.sizeBytes).toBeLessThan(earlySizeBytes * 2);
    expect(maxTail).toBeLessThanOrEqual(8);
    expect(first.store.value()).not.toHaveProperty('state');
    expect(first.store.value()).not.toHaveProperty('lastSummary');
    expect(first.store.value().envelopeVersion).toBe(3);
    expect(first.store.value().lifetime.decisions).toBe(session.revision);
    expect(session.diagnostics.decisions).toHaveLength(0);
    expect(session.anchor.revision).toBe(session.revision);

    const reloaded = first.module.api.loadCheckpoint(first.store, clientId);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.session.state).toEqual(session.state);
    expect(reloaded.session.lastStepSummary).toEqual(session.lastStepSummary);
    expect(reloaded.session.periodSummaries).toEqual(session.periodSummaries);
    expect(reloaded.session.diagnostics).toEqual(session.diagnostics);

    const fullTraceText = first.module.api.serializeDiagnosticTrace(session);
    const fullTrace = JSON.parse(fullTraceText);
    // Полный лог строится от якоря: детали до него усечены осознанно, поэтому
    // статус честно называется частичным, а хэш по-прежнему сходится.
    expect(fullTrace.replayIntegrity.status).toBe('partial');
    expect(fullTrace.steps).toHaveLength(0);
    expect(fullTrace.steps.every((step) => step.reducerStages.length === 10)).toBe(true);
    expect(fullTraceText).not.toContain(session.state.rng.seed);
    expect(fullTraceText).not.toContain(session.state.campaignId);

    render(React.createElement(first.module.Component, { onExit: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    // Кампания идёт тридцать дней, поэтому последний закрытый день — не
    // воскресенье авторской недели.
    expect(screen.getByRole('heading', { name: /^День завершён:/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть итог недели' }));
    expect(screen.getByRole('heading', { name: 'Контрольная точка недели' })).toBeTruthy();
    expect(screen.getByText('Проект')).toBeTruthy();
    expect(screen.getByText('Договорённости')).toBeTruthy();
    expect(screen.getByText('Что осталось открытым')).toBeTruthy();
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
    expect(first.module.api.loadCheckpoint(first.store, clientId).session.state.rng.seed).toBe(completedSeed);
    expect(first.store.value().comparisonBaseline?.finalStateHash).toBeTruthy();
    cleanup();
  }, 45_000);

  it('loads only replay-safe legacy checkpoints and upgrades them after the next confirmed step', () => {
    const { module, store } = loadModule();
    const confirmed = module.api.confirmAction(module.api.createSession('legacy-safe'), 'eat_ready_meal');
    const saved = module.api.saveCheckpoint(store, clientId, confirmed);
    expect(saved.status).toBe('saved');
    const legacyEnvelope = {
      envelopeVersion: 1,
      clientId,
      campaignId: confirmed.state.campaignId,
      savedAt: new Date().toISOString(),
      revision: confirmed.revision,
      stateHash: saved.envelope.stateHash,
      contract: structuredClone(saved.envelope.contract),
      state: structuredClone(confirmed.state),
      lastSummary: structuredClone(confirmed.lastSummary),
      diagnostics: structuredClone(confirmed.diagnostics),
    };
    const legacyStore = memoryStore(legacyEnvelope);
    const loaded = module.api.loadCheckpoint(legacyStore, clientId);
    expect(loaded.status).toBe('ready');
    expect(loaded.session.state).toEqual(confirmed.state);
    expect(legacyStore.set).not.toHaveBeenCalled();

    const nextView = module.api.getCampaignView(loaded.session);
    const next = module.api.confirmAction(loaded.session, nextView.offers.find((offer) => offer.available).actionId);
    expect(module.api.saveCheckpoint(legacyStore, clientId, next).status).toBe('saved');
    expect(legacyStore.value().envelopeVersion).toBe(3);
    expect(JSON.stringify(legacyStore.value())).not.toContain(clientId);

    const partialEnvelope = structuredClone(legacyEnvelope);
    delete partialEnvelope.diagnostics;
    const partialStore = memoryStore(partialEnvelope);
    expect(module.api.loadCheckpoint(partialStore, clientId)).toMatchObject({ status: 'incompatible', message: expect.stringContaining('полной истории') });
    expect(partialStore.set).not.toHaveBeenCalled();

    const privacyEnvelope = structuredClone(legacyEnvelope);
    privacyEnvelope.state.rng.seed = `legacy:${clientId}`;
    privacyEnvelope.state.campaignId = `week01:legacy:${clientId}`;
    privacyEnvelope.campaignId = privacyEnvelope.state.campaignId;
    const privacyStore = memoryStore(privacyEnvelope);
    expect(module.api.loadCheckpoint(privacyStore, clientId)).toMatchObject({ status: 'privacy' });
    expect(privacyStore.set).not.toHaveBeenCalled();
    expect(privacyStore.value()).toEqual(privacyEnvelope);
  });

  it('fails closed for missing, corrupt, foreign, malformed-ledger and oversized persisted checkpoints', () => {
    const { module } = loadModule();
    expect(module.api.loadCheckpoint(memoryStore(), clientId)).toEqual({ status: 'empty' });
    const malformedStore = memoryStore(null);
    expect(module.api.loadCheckpoint(malformedStore, clientId)).toMatchObject({ status: 'corrupt' });
    expect(malformedStore.set).not.toHaveBeenCalled();

    const validStore = memoryStore();
    const confirmed = module.api.confirmAction(module.api.createSession('scope-safe'), 'eat_ready_meal');
    expect(module.api.saveCheckpoint(validStore, clientId, confirmed).status).toBe('saved');
    const foreignStore = memoryStore(structuredClone(validStore.value()));
    expect(module.api.loadCheckpoint(foreignStore, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toMatchObject({ status: 'foreign' });
    const corruptEnvelope = structuredClone(validStore.value());
    corruptEnvelope.stateHash = '0000000000000000';
    const corruptStore = memoryStore(corruptEnvelope);
    expect(module.api.loadCheckpoint(corruptStore, clientId)).toMatchObject({ status: 'corrupt' });
    expect(corruptStore.set).not.toHaveBeenCalled();

    const skippedRevisionEnvelope = structuredClone(validStore.value());
    skippedRevisionEnvelope.diagnostics.decisions[0].revision = 2;
    skippedRevisionEnvelope.revision = 2;
    const skippedRevisionStore = memoryStore(skippedRevisionEnvelope);
    expect(module.api.loadCheckpoint(skippedRevisionStore, clientId)).toMatchObject({ status: 'corrupt' });
    expect(skippedRevisionStore.set).not.toHaveBeenCalled();

    const oversizedPersistedEnvelope = structuredClone(validStore.value());
    oversizedPersistedEnvelope.padding = 'x'.repeat(70_000);
    const oversizedPersistedStore = memoryStore(oversizedPersistedEnvelope);
    expect(module.api.loadCheckpoint(oversizedPersistedStore, clientId)).toMatchObject({ status: 'incompatible', message: expect.stringContaining('размер') });
    expect(oversizedPersistedStore.set).not.toHaveBeenCalled();

    const oversized = module.api.createSession('oversized-checkpoint');
    oversized.comparisonBaseline = {
      outcome: module.api.createDiagnosticTrace(oversized).derivedOutcome,
      finalStateHash: 'baseline',
      padding: 'x'.repeat(70_000),
    };
    const oversizedStore = memoryStore();
    expect(module.api.saveCheckpoint(oversizedStore, clientId, oversized)).toMatchObject({ status: 'failed', message: expect.stringContaining('размер') });
    expect(oversizedStore.set).not.toHaveBeenCalled();
  });

  it('restarts the campaign from the menu only after an explicit confirmation', () => {
    const { module, store } = loadModule();
    const planned = module.api.confirmPlanning(module.api.createSession('ui-restart'), defaultPlan);
    expect(module.api.saveCheckpoint(store, clientId, planned).status).toBe('saved');
    store.set.mockClear();
    render(React.createElement(module.Component, { onExit: vi.fn() }));

    expect(screen.getByRole('radio', { name: /Приготовить завтрак/ })).toBeTruthy();

    // Отмена возвращает к той же кампании и ничего не пишет.
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByRole('alertdialog', { name: 'Начать кампанию заново' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /Приготовить завтрак/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к кампании' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('radio', { name: /Приготовить завтрак/ })).toBeTruthy();
    expect(store.set).not.toHaveBeenCalled();

    // Подтверждение открывает новую кампанию с начала, но сохранение не переписывается до первого решения.
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Начать заново' })[1]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('radio', { name: /Приготовить завтрак/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Сначала выберите, что будете защищать' })).toBeTruthy();
    expect(store.set).not.toHaveBeenCalled();
    expect(module.api.loadCheckpoint(store, clientId).session.state.rng.seed).toBe('ui-restart');
  });

  it('renders progressive planning, exposes conflicts and saves only on final confirmation', async () => {
    const { module, store } = loadModule();
    render(React.createElement(module.Component, { onExit: vi.fn() }));

    expect(screen.getByRole('heading', { name: 'Координатор проектов' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Сдать проект и не потерять опоры недели' })).toBeTruthy();
    expect(screen.getByText(/420 мин работы нужно завершить/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }));
    expect(screen.getByRole('heading', { name: 'Какие границы сохранить' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Продолжить к приоритетам' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Сохранить семейные вечера/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Защитить рабочие блоки/ }));
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Закончить день вовремя/ }).disabled).toBe(true);
    expect(screen.getByText('Работа и семья претендуют на одно окно')).toBeTruthy();
    expect(store.set).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Продолжить к приоритетам' }));
    expect(screen.getByRole('heading', { name: 'Что защищать в первую очередь' })).toBeTruthy();
    expect(screen.getByText('Финансовый горизонт')).toBeTruthy();
    expect(screen.getByText(/59.*000 ₽/)).toBeTruthy();
    expect(screen.getAllByText('Срок проекта').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ожидаемое поступление').length).toBeGreaterThan(0);
    const mainWork = screen.getAllByRole('radio', { name: 'Работа' })[0];
    mainWork.focus();
    fireEvent.keyDown(mainWork, { key: 'ArrowRight' });
    const mainFamily = screen.getAllByRole('radio', { name: 'Семья' })[0];
    await waitFor(() => expect(document.activeElement).toBe(mainFamily));
    expect(mainFamily.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Главный и поддерживающий фокус должны отличаться.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подтвердить план' }).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Работа' })[0]);
    expect(screen.getByRole('button', { name: 'Подтвердить план' }).disabled).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить план' }));
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.value().revision).toBe(1);
    expect(store.value()).not.toHaveProperty('state');
    expect(module.api.loadCheckpoint(store, clientId).session.state.clock.stepIndex).toBe(0);
    expect(screen.getByText(/План принят/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Перейти к дню' }));
    const firstChoice = screen.getByRole('radio', { name: /Приготовить завтрак/ });
    fireEvent.click(firstChoice);
    expect(document.querySelector('.assemble-day-option__signals')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Жизнь' }));
    expect(screen.getByText('Игровое наблюдение')).toBeTruthy();
    expect(screen.getByText(/не использует данные дневника HEYS/)).toBeTruthy();
    expect(screen.getByText(/История решений/)).toBeTruthy();
    fireEvent.click(screen.getByText(/История решений/));
    expect(screen.getByText('Контракт недели')).toBeTruthy();
    expect(screen.queryByText('Точные изменения')).toBeNull();
    expect(screen.getByText(/Недельный контракт кампании/)).toBeTruthy();
    expect(screen.getByText('Диагностика кампании')).toBeTruthy();
  });

  it('keeps diary data and the existing HEYS gamification key outside the adapter', () => {
    expect(entry).not.toMatch(/heys_game(?:\W|$)/);
    expect(entry).not.toMatch(/dayv2|diary|дневник/i);
    expect(entry).not.toMatch(/localStorage|sessionStorage/);
    expect(entry).not.toMatch(/const EVENT_COPY|const EVENT_ACTION_COPY/);
  });
});
