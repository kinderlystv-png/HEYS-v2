import fs from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { CAMPAIGN_DAYS, createInitialState, registries as baseRegistries } from '../../packages/assemble-day-engine/src/content/scenario.ts';
import { reducePlanningStep } from '../../packages/assemble-day-engine/src/planning.ts';
import { selectAction } from '../../packages/assemble-day-engine/src/policies.ts';
import { getActionOffers, initialEvent, reduceStep } from '../../packages/assemble-day-engine/src/reducer.ts';
import type { Registries, ScenarioSlot } from '../../packages/assemble-day-engine/src/types.ts';

const ROOT = new URL('../../', import.meta.url);
const HORIZON_DAYS = CAMPAIGN_DAYS;
const MEASURED_DAYS = new Set([28, 30, 56, 84, 112, 224, CAMPAIGN_DAYS]);
const BROWSER_MEASURED_DAYS = new Set([7, 14, 28, 30, 112, 224, CAMPAIGN_DAYS]);
const ROUTINE_DAY_ANCHORS = [420, 600, 780, 960, 1140, 1320];

function registriesForHorizon(horizonDays: number): Registries {
  const slots: ScenarioSlot[] = baseRegistries.slots.filter((slot) => slot.dayIndex < horizonDays).map((slot) => ({ ...slot }));
  const firstExtendedDay = slots.length ? Math.max(...slots.map((slot) => slot.dayIndex)) + 1 : 0;
  for (let dayIndex = firstExtendedDay; dayIndex < horizonDays; dayIndex += 1) {
    ROUTINE_DAY_ANCHORS.forEach((minuteOfDay, index) => {
      slots.push({
        slot: slots.length + 1,
        dayIndex,
        minuteOfDay,
        forkKind: 'ordinary',
        ...(index === 0 ? { sleepBeforeMin: 450, interruptionsMin: 0 } : {}),
      });
    });
  }
  return { ...baseRegistries, slots };
}

function measureLongState() {
  const registries = registriesForHorizon(HORIZON_DAYS);
  let state = reducePlanningStep({
    state: createInitialState('sprint-24-growth-baseline'),
    plan: {
      weeklyRuleIds: ['protect_sleep', 'work_blocks'],
      mainGoal: 'work',
      supportingGoal: 'family',
    },
  }).state;
  const checkpoints: Array<Record<string, number>> = [];
  const startedAt = performance.now();
  while (state.scenarioCursor < registries.slots.length) {
    const event = initialEvent(state, registries);
    const offers = getActionOffers(state, event.templateId, registries);
    const selected = selectAction(state, state.scenarioCursor, 'balanced', offers);
    state = reduceStep({ state, openEvent: event, actionId: selected.actionId }, registries).state;
    const completedDay = state.periods.completedDays;
    if (!MEASURED_DAYS.has(completedDay) || checkpoints.some((item) => item.day === completedDay)) continue;
    const serializedState = JSON.stringify(state);
    checkpoints.push({
      day: completedDay,
      serializedStateBytes: serializedState.length * 2,
      journalEntries: state.causalJournal.length,
      rngOccurrenceKeys: Object.keys(state.rng.occurrences).length,
      dayLoadKeys: Object.keys(state.eventLedger.dayTotalLoad).length,
      appliedBoundaries: state.periods.appliedBoundaries.length,
    });
  }
  return {
    horizonDays: HORIZON_DAYS,
    campaignMs: Number((performance.now() - startedAt).toFixed(2)),
    checkpoints,
  };
}

function measureBrowserCheckpoint() {
  const require = createRequire(new URL('package.json', ROOT));
  const { JSDOM } = require('jsdom');
  const React = require('react');
  const source = fs.readFileSync(new URL('apps/web/heys_planning_game_assemble_day_v1.js', ROOT), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3001/' });
  const runtime = globalThis as typeof globalThis & { window: any; document: any };
  runtime.window = dom.window;
  runtime.document = dom.window.document;
  runtime.window.React = React;
  runtime.window.HEYS = {};
  (0, eval)(source);

  const module = runtime.window.HEYS.PlanningGames.modules['assemble-day'];
  const clientId = '12345678-aaaa-bbbb-cccc-1234567890ab';
  let session = module.api.confirmEmployment(module.api.createSession('sprint24-horizon-measure'), 'office');
  session = module.api.confirmPlanning(session, {
    weeklyRuleIds: ['protect_sleep', 'work_blocks'],
    mainGoal: 'work',
    supportingGoal: 'family',
  });
  const checkpoints: Array<{ day: number; bytes: number }> = [];
  let maxCheckpointBytes = 0;
  let maxCheckpointDay = 0;
  const startedAt = performance.now();
  while (!module.api.getCampaignView(session).complete) {
    const view = module.api.getCampaignView(session);
    const action = view.offers.find((offer: { available: boolean }) => offer.available);
    if (!action) throw new Error(`terminal lock at step ${session.state.clock.stepIndex}`);
    session = module.api.confirmAction(session, action.actionId);
    const day = session.state.periods.completedDays;
    if (!session.periodSummaries.length) continue;
    const bytes = module.api.checkpointSizeBytes(clientId, module.api.makeEnvelope(session, clientId));
    if (bytes > maxCheckpointBytes) {
      maxCheckpointBytes = bytes;
      maxCheckpointDay = day;
    }
    if (BROWSER_MEASURED_DAYS.has(day) && !checkpoints.some((item) => item.day === day)) checkpoints.push({ day, bytes });
  }
  let persisted: unknown;
  const store = {
    getPersisted: (_key: string, fallback: unknown) => persisted === undefined ? fallback : persisted,
    set: (_key: string, value: unknown) => { persisted = value; return true; },
  };
  const saveStartedAt = performance.now();
  const saved = module.api.saveCheckpoint(store, clientId, session);
  if (saved.status !== 'saved') throw new Error(`checkpoint failed: ${saved.status}`);
  return {
    horizonDays: session.state.periods.completedDays,
    campaignMs: Number((performance.now() - startedAt).toFixed(2)),
    saveMs: Number((performance.now() - saveStartedAt).toFixed(2)),
    checkpointBytes: saved.sizeBytes,
    maxCheckpointBytes,
    maxCheckpointDay,
    checkpointBudgetBytes: saved.budgetBytes,
    checkpoints,
  };
}

console.log(JSON.stringify({
  browserBaseline: measureBrowserCheckpoint(),
  longStateBaseline: measureLongState(),
}, null, 2));
