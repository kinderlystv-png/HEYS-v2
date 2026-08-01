import { beforeAll, describe, expect, it } from 'vitest';

import { registries } from '../content/scenario.js';
import { checkCampaignInvariants, unreachableContent, type CampaignObservation } from '../invariants.js';
import { runQaProfile, type QaProfileReport, type QaProfileResumeState, type QaProfileRunSpec } from '../qa-profile.js';
import type { CampaignResult, GameState } from '../types.js';

const UNIT_HORIZON_DAYS = 14;
const UNIT_RUN_SPECS: readonly QaProfileRunSpec[] = [
  { seed: 'unit-qa-0', policyId: 'balanced', employmentFormat: 'office', horizonDays: UNIT_HORIZON_DAYS },
  { seed: 'unit-qa-0', policyId: 'maximize_work', employmentFormat: 'remote', horizonDays: UNIT_HORIZON_DAYS },
  { seed: 'unit-qa-1', policyId: 'balanced', employmentFormat: 'project', horizonDays: UNIT_HORIZON_DAYS },
];
const UNIT_SEEDS = ['unit-qa-0', 'unit-qa-1'] as const;
const UNIT_POLICIES = ['balanced', 'maximize_work'] as const;

let unitReport: QaProfileReport;
let unitResumeState: QaProfileResumeState;

const reportFromResume = (resumeState: QaProfileResumeState): QaProfileReport => runQaProfile({
  seeds: UNIT_SEEDS,
  policyIds: UNIT_POLICIES,
  runSpecs: UNIT_RUN_SPECS,
  replayPolicyIds: [],
  resumeState,
});

describe('QA profile for long campaigns (Sprint 23)', () => {
  beforeAll(() => {
    let captured: QaProfileResumeState | undefined;
    unitReport = runQaProfile({
      seeds: UNIT_SEEDS,
      policyIds: UNIT_POLICIES,
      runSpecs: UNIT_RUN_SPECS,
      replayPolicyIds: [],
      onProgress: (progress) => { captured = progress.resumeState; },
    });
    if (!captured) throw new Error('unit QA checkpoint was not captured');
    unitResumeState = captured;
  }, 120_000);

  it('builds the profile matrix and invariant report on a bounded horizon', () => {
    const coreViolations = unitReport.violations.filter((item) => !item.id.startsWith('variability_'));

    expect(unitReport.profileVersion).toBe('1.0');
    expect(unitReport.seeds).toEqual([...UNIT_SEEDS]);
    expect(unitReport.policyIds).toEqual([...UNIT_POLICIES]);
    expect(unitReport.campaigns).toBe(UNIT_RUN_SPECS.length);
    expect(unitReport.employmentFormats).toEqual(['office', 'remote', 'project']);
    expect(coreViolations).toEqual([]);
    expect(unitReport.replay).toEqual({ checked: 0, mismatched: 0 });
    expect(unitResumeState.runs.every((item) => item.observation?.finalState.periods.completedDays === UNIT_HORIZON_DAYS)).toBe(true);
  });

  it('measures reachability across the run set, not inside one campaign', () => {
    const first = unitResumeState.runs[0]!.observation!;
    const single = unreachableContent([first], registries);

    // Одна кампания при свободном порядке и не обязана показать весь каталог.
    expect(single.events.length).toBeGreaterThan(0);
    const covered = structuredClone(unitResumeState);
    const eventIds = Object.keys(registries.events), actionIds = Object.keys(registries.actions);
    covered.runs.forEach((item, runIndex) => {
      if (!item.observation) return;
      item.observation.result.visitedEvents = eventIds.filter((_id, index) => index % covered.runs.length === runIndex);
      item.observation.result.chosenActions = actionIds.filter((_id, index) => index % covered.runs.length === runIndex);
    });
    const report = reportFromResume(covered);
    expect(report.reachability).toEqual({ events: [], actions: [] });
  });

  it('quantifies variability so a collapsed order cannot pass unnoticed', () => {
    const diverse = structuredClone(unitResumeState);
    const eventSequences = [['event-a', 'event-b', 'event-c'], ['event-b', 'event-c', 'event-a'], ['event-c', 'event-a', 'event-b']];
    const actionSequences = [['action-a', 'action-b', 'action-c'], ['action-b', 'action-c', 'action-a'], ['action-c', 'action-a', 'action-b']];
    diverse.runs.forEach((item, index) => {
      if (!item.observation) return;
      item.observation.result.visitedEvents = eventSequences[index]!;
      item.observation.result.chosenActions = actionSequences[index]!;
    });
    const report = reportFromResume(diverse);

    expect(report.variability).toEqual({ campaigns: 3, distinctSequences: 3, topEventShare: 1 / 3, topActionShare: 1 / 3 });
    expect(report.violations).toEqual([]);
    expect(report.passed).toBe(true);

    const collapsed = structuredClone(diverse);
    for (const item of collapsed.runs) if (item.observation) {
      item.observation.result.visitedEvents = ['routine_pause'];
      item.observation.result.chosenActions = ['walk_short'];
    }
    const collapsedReport = reportFromResume(collapsed);
    expect(collapsedReport.passed).toBe(false);
    expect(collapsedReport.violations.map((item) => item.id)).toEqual(expect.arrayContaining([
      'variability_distinct_sequences',
      'variability_top_event_share',
      'variability_top_action_share',
    ]));
  });

  it('keeps the required family and routine content in the registry', () => {
    // Фактическую достижимость этих ситуаций проверяет отдельный полный профиль:
    // unit-suite подтверждает контракт каталога без повторного прогона 56 лет.
    for (const id of ['family_partner_offers', 'family_child_evening', 'routine_pause', 'routine_work_stretch', 'routine_evening_wind', 'routine_family_moment']) {
      expect(registries.events[id], id).toBeDefined();
    }
  });

  it('fails loudly when an invariant is actually broken', () => {
    const base = unitResumeState.runs[0]!.observation!;
    const broken = (patch: (result: CampaignResult, state: GameState) => void): CampaignObservation => {
      const result = structuredClone(base.result), finalState = structuredClone(base.finalState);
      patch(result, finalState);
      return { seed: base.seed, policyId: base.policyId, result, finalState };
    };

    const ids = (observation: CampaignObservation) => checkCampaignInvariants(observation, registries).map((item) => item.id);

    expect(ids(base)).toEqual([]);
    expect(ids(broken((result) => { result.terminalLocks = 1; }))).toContain('no_terminal_locks');
    expect(ids(broken((result) => { result.heavyStates = 3; result.heavyWithStabilizer = 1; result.heavyWithoutStabilizerEvents = ['mon_project_block']; }))).toContain('heavy_state_has_stabilizer');
    expect(ids(broken((result) => { result.maxTotalLoad = 120; }))).toContain('load_budget_total');
    expect(ids(broken((result) => { result.unexplainedLongTermChanges = 2; result.unexplainedPaths = ['work.reputation']; }))).toContain('causality_explained');
    expect(ids(broken((_result, state) => { state.periods.appliedBoundaries = [...state.periods.appliedBoundaries, state.periods.appliedBoundaries[0]!]; }))).toContain('boundaries_idempotent');
    expect(ids(broken((_result, state) => {
      state.causalJournal = [0, 1, 2, 3].map((dayIndex) => ({ ...state.causalJournal[0]!, id: `journal:broken:${dayIndex}`, dayIndex }));
    }))).toContain('state_stays_bounded');
    expect(ids(broken((_result, state) => { state.rng.occurrences['event-select:0:1:causal:a,b'] = 1; }))).toContain('state_stays_bounded');
    expect(ids(broken((_result, state) => { state.eventLedger.dayTotalLoad['0'] = 10; }))).toContain('state_stays_bounded');
    expect(ids(broken((_result, state) => { state.causalJournal[0]!.after = 'x'.repeat(513); }))).toContain('state_stays_bounded');
  }, 60_000);
});
