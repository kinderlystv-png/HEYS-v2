import { describe, expect, it } from 'vitest';
import { mergeCausalQaReports } from '../qa-merge.js';
import { runCausalQa } from '../qa.js';
import { runCampaign } from '../simulation.js';

describe('causal QA harness', () => {
  it('passes counterfactual, reachability, stabilization and reproducibility gates', () => {
    const report = runCausalQa(20, '2026-01-01T00:00:00.000Z');
    expect(report.simulation.runCount).toBe(140);
    expect(report.simulation.coverage.slots).toBe(38);
    expect(report.simulation.coverage.events).toBeGreaterThanOrEqual(38);
    expect(report.simulation.counterfactuals).toHaveLength(11);
    expect(report.simulation.counterfactuals.every((item) => item.changedFields.length >= 2)).toBe(true);
    expect(Object.entries(report.simulation.gates).filter(([, gate]) => !gate.passed), JSON.stringify({ heavy: report.simulation.distributions.heavyWithoutStabilizerByEvent, unexplained: report.simulation.distributions.unexplainedPathFrequency, boundary: report.simulation.distributions.boundaryPathFrequency })).toEqual([]);
    expect(report.simulation.metrics.terminalLockCount).toBe(0);
    expect(report.simulation.metrics.heavyStateStabilizationRate).toBe(1);
  }, 60_000);

  it('produces partition-independent campaign and simulation hashes', () => {
    const createdAt='2026-01-01T00:00:00.000Z';
    const monolith=runCausalQa(2,createdAt);
    const merged=mergeCausalQaReports([runCausalQa(1,createdAt,0),runCausalQa(1,createdAt,1)],createdAt);
    expect(merged.simulation.campaignSeedHashes).toEqual(monolith.simulation.campaignSeedHashes);
    expect(merged.simulation.campaignHash).toBe(monolith.simulation.campaignHash);
    expect(merged.simulation.simulationHash).toBe(monolith.simulation.simulationHash);
  }, 30_000);

  it('keeps real stabilizers in the sparse D56 regression seeds', () => {
    for (const seed of ['qa-00120','qa-00163','qa-00261']) {
      expect(runCampaign(seed,'random_valid',true).heavyWithoutStabilizerEvents,seed).toEqual([]);
    }
  });
});
