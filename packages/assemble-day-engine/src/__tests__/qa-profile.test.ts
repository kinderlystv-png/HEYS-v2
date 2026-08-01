import { describe, expect, it } from 'vitest';

import { registries } from '../content/scenario.js';
import { checkCampaignInvariants, unreachableContent, variabilityProfile, type CampaignObservation } from '../invariants.js';
import { runCampaignWithState } from '../simulation.js';
import { EXTENDED_REGRESSION_SEEDS, REGRESSION_SEEDS, runQaProfile } from '../qa-profile.js';
import type { CampaignResult, GameState } from '../types.js';

function observe(seed: string, policyId: 'balanced' | 'maximize_work' = 'balanced'): CampaignObservation {
  const { result, finalState } = runCampaignWithState(seed, policyId, true, true, true);
  return { seed, policyId, result, finalState };
}

describe('QA profile for long campaigns (Sprint 23)', () => {
  it('passes the regression seed set on invariants instead of positional coverage', { timeout: 600_000 }, () => {
    const report = runQaProfile();

    expect(report.profileVersion).toBe('1.0');
    expect(report.seeds).toEqual([...REGRESSION_SEEDS]);
    expect(report.campaigns).toBe(REGRESSION_SEEDS.length * report.policyIds.length);
    expect(report.employmentFormats).toEqual(['office', 'remote', 'project']);
    expect(report.violations).toEqual([]);
    expect(report.replay.mismatched).toBe(0);
    expect(report.passed).toBe(true);
  });

  it('measures reachability across the seed set, not inside one campaign', { timeout: 900_000 }, () => {
    const report = runQaProfile({ seeds: EXTENDED_REGRESSION_SEEDS });
    const single = unreachableContent([observe(REGRESSION_SEEDS[0]!)], registries);

    // Одна кампания при свободном порядке и не обязана показать весь каталог.
    expect(single.events.length).toBeGreaterThan(0);
    // Полный набор зёрен обязан покрывать действия целиком: недостижимое
    // действие — это мёртвый контент, а не особенность одного прохождения.
    expect(report.reachability.actions).toEqual([]);
  });

  it('quantifies variability so a collapsed order cannot pass unnoticed', { timeout: 300_000 }, () => {
    const profile = variabilityProfile([
      observe(REGRESSION_SEEDS[0]!, 'balanced'),
      observe(REGRESSION_SEEDS[0]!, 'maximize_work'),
      observe(REGRESSION_SEEDS[1]!, 'balanced'),
    ]);

    expect(profile.campaigns).toBe(3);
    // Все дни открываются по состоянию, поэтому три кампании дают уже не одну
    // последовательность. Нижняя граница фиксируется, чтобы схлопывание порядка
    // обратно в единственный маршрут нельзя было не заметить.
    expect(profile.distinctSequences).toBeGreaterThan(1);
    // Пороги отражают текущее содержание: авторская неделя занимает семь дней
    // из тридцати, остальное держат бытовые ситуации, поэтому доля самой частой
    // ситуации закономерно выше. Порог фиксирует потолок, а не идеал: рост выше
    // него означает, что кампания снова схлопывается в один сюжет.
    expect(profile.topEventShare).toBeLessThan(0.4);
    expect(profile.topActionShare).toBeLessThan(0.5);
  });

  it('covers the situations added by the family, routine and economy sprints', { timeout: 900_000 }, () => {
    const report = runQaProfile({ seeds: EXTENDED_REGRESSION_SEEDS });
    const unreachable = new Set(report.reachability.events);

    // Новые семьи ситуаций обязаны быть достижимыми на наборе зёрен: иначе это
    // мёртвый контент, который проверять нечем.
    for (const id of ['family_partner_offers', 'family_child_evening', 'routine_pause', 'routine_work_stretch', 'routine_evening_wind', 'routine_family_moment']) {
      expect(unreachable.has(id), id).toBe(false);
    }

    // Известный содержательный пробел: финансовое давление стабилизирует только
    // готовка на несколько раз, а она требует запаса продуктов. Поэтому на
    // расширенном наборе остаются единичные тяжёлые состояния без выхода именно
    // по деньгам. Граница зафиксирована: она не должна расти, а закрывается
    // отдельным действием «отложить платёж» в экономическом спринте.
    expect(report.violations.every((item) => item.id === 'heavy_state_has_stabilizer')).toBe(true);
    expect(report.violations.length).toBeLessThanOrEqual(2);
  });

  it('fails loudly when an invariant is actually broken', () => {
    const base = observe(REGRESSION_SEEDS[0]!);
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
  }, 60_000);
});
