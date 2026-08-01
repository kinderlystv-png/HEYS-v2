import { describe, expect, it } from 'vitest';
import { mergeCausalQaReports } from '../qa-merge.js';
import { runCausalQa } from '../qa.js';
import { registries } from '../content/scenario.js';

/**
 * Массовый harness остаётся как исторический инструмент и как источник отчётов
 * `causal-qa-v0.1/v0.2`. После `D74` обязательным профилем стал `qa-profile.ts`,
 * поэтому здесь остаётся дымовой прогон на коротком горизонте: он проверяет,
 * что harness жив и его инвариантные гейты держатся, но не дублирует годовой
 * приёмочный профиль.
 */
describe('causal QA harness (historical)', () => {
  const unitHorizonDays = 3;

  it('still runs and keeps its invariant gates green on a small sample', { timeout: 600_000 }, () => {
    const report = runCausalQa(2, '2026-01-01T00:00:00.000Z', 0, unitHorizonDays);
    expect(report.simulation.runCount).toBe(14);
    expect(report.simulation.coverage.slots).toBeGreaterThan(0);
    expect(report.simulation.coverage.events).toBeGreaterThan(0);
    expect(report.simulation.counterfactuals).toHaveLength(11);
    expect(report.simulation.counterfactuals.every((item) => item.changedFields.length >= 2)).toBe(true);
    expect(Object.entries(report.simulation.gates).filter(([, gate]) => !gate.passed), JSON.stringify({ heavy: report.simulation.distributions.heavyWithoutStabilizerByEvent, unexplained: report.simulation.distributions.unexplainedPathFrequency })).toEqual([]);
    expect(report.simulation.metrics.terminalLockCount).toBe(0);
    expect(report.simulation.metrics.heavyStateStabilizationRate).toBe(1);
    expect(report.simulation.coverage.slots).toBeLessThanOrEqual(registries.slots.length);
  });

  it('produces partition-independent campaign and simulation hashes', { timeout: 600_000 }, () => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    const monolith = runCausalQa(2, createdAt, 0, unitHorizonDays);
    const merged = mergeCausalQaReports([runCausalQa(1, createdAt, 0, unitHorizonDays), runCausalQa(1, createdAt, 1, unitHorizonDays)], createdAt);
    expect(merged.simulation.campaignSeedHashes).toEqual(monolith.simulation.campaignSeedHashes);
    expect(merged.simulation.campaignHash).toBe(monolith.simulation.campaignHash);
    expect(merged.simulation.simulationHash).toBe(monolith.simulation.simulationHash);
  });
});
