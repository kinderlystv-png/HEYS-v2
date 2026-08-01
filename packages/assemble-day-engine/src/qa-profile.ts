import { registries } from './content/scenario.js';
import { checkCampaignInvariants, unreachableContent, variabilityProfile, type CampaignObservation, type InvariantViolation } from './invariants.js';
import { POLICY_IDS } from './policies.js';
import { runCampaignWithState } from './simulation.js';
import { CONTRACT, type EmploymentFormat, type PolicyId, type Registries } from './types.js';

/**
 * Фиксированный набор регрессионных зёрен (`D74`). Он версионируется вместе с
 * профилем и переживает изменения контента: смысл не в покрытии позиций, а в
 * том, чтобы одни и те же прожитые кампании продолжали удовлетворять
 * инвариантам после каждой правки каталога.
 */
export const REGRESSION_SEEDS = [
  'qa-00000',
  'qa-00001',
  'qa-00042',
  'qa-01024',
] as const;

/**
 * Расширенный набор для ручного прогона: та же проверка, больше зёрен. В
 * автоматический профиль он не входит, потому что после Sprint 24 кампания стала
 * годовой и прогон растёт линейно — по `D74` профиль обменивает
 * количество зёрен на длину кампании.
 */
export const EXTENDED_REGRESSION_SEEDS = [
  ...['qa-00000', 'qa-00001', 'qa-00042', 'qa-01024'],
  'qa-00007',
  'qa-00099',
  'qa-00256',
  'qa-04096',
] as const;

export const QA_PROFILE_VERSION = '1.0';

export const QA_VARIABILITY_LIMITS = {
  minDistinctSequences: 2,
  maxTopEventShareExclusive: 0.4,
  maxTopActionShareExclusive: 0.5,
} as const;

export interface QaProfileRunSpec {
  seed: string;
  policyId: PolicyId;
  employmentFormat: EmploymentFormat;
  horizonDays?: number;
}

export const QA_SMOKE_HORIZON_DAYS = 112;
export const QA_SMOKE_RUN_SPECS: readonly QaProfileRunSpec[] = [
  { seed: REGRESSION_SEEDS[0], policyId: 'balanced', employmentFormat: 'office', horizonDays: QA_SMOKE_HORIZON_DAYS },
  { seed: REGRESSION_SEEDS[0], policyId: 'maximize_work', employmentFormat: 'remote', horizonDays: QA_SMOKE_HORIZON_DAYS },
  { seed: REGRESSION_SEEDS[1], policyId: 'balanced', employmentFormat: 'project', horizonDays: QA_SMOKE_HORIZON_DAYS },
] as const;

export interface QaProfileCompletedRun {
  spec: QaProfileRunSpec;
  observation?: CampaignObservation;
  violations: InvariantViolation[];
  error?: string;
}

export interface QaProfileReplayRecord {
  spec: QaProfileRunSpec;
  expectedHash?: string;
  actualHash?: string;
  mismatched: boolean;
  error?: string;
}

export interface QaProfileResumeState {
  version: 1;
  runs: QaProfileCompletedRun[];
  replays: QaProfileReplayRecord[];
}

export interface QaProfileProgress {
  stage: 'campaign' | 'replay';
  completed: number;
  total: number;
  label: string;
  resumeState: QaProfileResumeState;
}

export interface QaProfileReport {
  profileVersion: string;
  contracts: typeof CONTRACT;
  seeds: string[];
  policyIds: PolicyId[];
  employmentFormats: EmploymentFormat[];
  campaigns: number;
  passed: boolean;
  violations: Array<InvariantViolation & { seed: string; policyId: string }>;
  reachability: { events: string[]; actions: string[] };
  variability: ReturnType<typeof variabilityProfile>;
  replay: { checked: number; mismatched: number };
}

export interface QaProfileOptions {
  seeds?: readonly string[];
  policyIds?: readonly PolicyId[];
  registries?: Registries;
  runSpecs?: readonly QaProfileRunSpec[];
  replayPolicyIds?: readonly PolicyId[];
  resumeState?: QaProfileResumeState;
  onProgress?: (progress: QaProfileProgress) => void;
}

export type QaSmokeOptions = Pick<QaProfileOptions, 'registries' | 'resumeState' | 'onProgress'>;

const EMPLOYMENT_FORMATS: EmploymentFormat[] = ['office', 'remote', 'project'];

export function createQaProfileRunSpecs(seeds: readonly string[], policyIds: readonly PolicyId[]): QaProfileRunSpec[] {
  let runIndex = 0;
  return seeds.flatMap((seed) => policyIds.map((policyId) => ({
    seed,
    policyId,
    employmentFormat: EMPLOYMENT_FORMATS[runIndex++ % EMPLOYMENT_FORMATS.length]!,
  })));
}

const runKey = (spec: QaProfileRunSpec): string => `${spec.seed}\u0000${spec.policyId}\u0000${spec.employmentFormat}\u0000${spec.horizonDays ?? 'full'}`;

function variabilityViolations(profile: ReturnType<typeof variabilityProfile>): InvariantViolation[] {
  if (profile.campaigns < 3) return [];
  const issues: InvariantViolation[] = [];
  if (profile.distinctSequences < QA_VARIABILITY_LIMITS.minDistinctSequences) issues.push({
    id: 'variability_distinct_sequences',
    summary: 'Порядок кампании схлопнулся в одну последовательность',
    evidence: `${profile.distinctSequences} < ${QA_VARIABILITY_LIMITS.minDistinctSequences}`,
  });
  if (profile.topEventShare >= QA_VARIABILITY_LIMITS.maxTopEventShareExclusive) issues.push({
    id: 'variability_top_event_share',
    summary: 'Одна ситуация заняла слишком большую долю кампании',
    evidence: `${profile.topEventShare} >= ${QA_VARIABILITY_LIMITS.maxTopEventShareExclusive}`,
  });
  if (profile.topActionShare >= QA_VARIABILITY_LIMITS.maxTopActionShareExclusive) issues.push({
    id: 'variability_top_action_share',
    summary: 'Одно действие заняло слишком большую долю кампании',
    evidence: `${profile.topActionShare} >= ${QA_VARIABILITY_LIMITS.maxTopActionShareExclusive}`,
  });
  return issues;
}

/**
 * Профиль заменяет прежний массовый gate «10 000 зёрен × 7 политик» (`D74`):
 * вместо перебора коротких кампаний он прогоняет фиксированные зёрна и проверяет
 * инварианты, достижимость контента по набору и распределения вариативности.
 */
export function runQaProfile(options: QaProfileOptions = {}): QaProfileReport {
  const seeds = [...(options.seeds ?? REGRESSION_SEEDS)];
  // `random_valid` входит в профиль намеренно: детерминированные политики
  // исследуют каталог узко, и без случайной траектории мёртвый контент
  // выглядит достижимым только на очень больших выборках.
  const policyIds = [...(options.policyIds ?? POLICY_IDS)];
  const activeRegistries = options.registries ?? registries;
  const runSpecs = [...(options.runSpecs ?? createQaProfileRunSpecs(seeds, policyIds))];
  const replayPolicyIds = [...(options.replayPolicyIds ?? policyIds)];
  const observations: CampaignObservation[] = [];
  const violations: QaProfileReport['violations'] = [];
  const resumedRuns = new Map((options.resumeState?.runs ?? []).map((record) => [runKey(record.spec), record]));
  const completedRuns: QaProfileCompletedRun[] = [];
  const completedReplays: QaProfileReplayRecord[] = [];
  const total = runSpecs.length + replayPolicyIds.length;
  const emitProgress = (stage: QaProfileProgress['stage'], label: string): void => options.onProgress?.({
    stage,
    completed: completedRuns.length + completedReplays.length,
    total,
    label,
    resumeState: { version: 1, runs: structuredClone(completedRuns), replays: structuredClone(completedReplays) },
  });

  for (const spec of runSpecs) {
    let record = resumedRuns.get(runKey(spec));
    if (!record) {
      try {
        const { result, finalState } = runCampaignWithState(spec.seed, spec.policyId, true, true, true, spec.employmentFormat, spec.horizonDays);
        const observation = { seed: spec.seed, policyId: spec.policyId, result, finalState };
        record = { spec, observation, violations: checkCampaignInvariants(observation, activeRegistries) };
      } catch (error) {
        record = { spec, violations: [], error: error instanceof Error ? error.message : String(error) };
      }
    }
    completedRuns.push(record);
    if (record.observation) observations.push(record.observation);
    if (record.error) violations.push({ id: 'campaign_completed', summary: 'Кампания не дошла до конца', evidence: `${spec.seed}/${spec.policyId}: ${record.error}`, seed: spec.seed, policyId: spec.policyId });
    for (const item of record.violations) violations.push({ ...item, seed: spec.seed, policyId: spec.policyId });
    emitProgress('campaign', `${spec.seed}/${spec.policyId}/${spec.employmentFormat}`);
  }

  const resumedReplays = new Map((options.resumeState?.replays ?? []).map((record) => [runKey(record.spec), record]));
  let checked = 0, mismatched = 0;
  for (const policyId of replayPolicyIds) {
    const expectedRun = completedRuns.find((item) => item.spec.seed === seeds[0] && item.spec.policyId === policyId && item.observation);
    const spec = expectedRun?.spec ?? createQaProfileRunSpecs([seeds[0]!], [policyId])[0]!;
    let record = resumedReplays.get(runKey(spec));
    if (!record) {
      if (!expectedRun?.observation) record = { spec, mismatched: true, error: 'expected campaign missing' };
      else {
        try {
          const replay = runCampaignWithState(spec.seed, spec.policyId, true, true, true, spec.employmentFormat, spec.horizonDays);
          record = { spec, expectedHash: expectedRun.observation.result.finalStateHash, actualHash: replay.result.finalStateHash, mismatched: replay.result.finalStateHash !== expectedRun.observation.result.finalStateHash };
        } catch (error) {
          record = { spec, expectedHash: expectedRun.observation.result.finalStateHash, mismatched: true, error: error instanceof Error ? error.message : String(error) };
        }
      }
    }
    completedReplays.push(record);
    if (!record.error) checked += 1;
    if (record.mismatched) mismatched += 1;
    emitProgress('replay', `${spec.seed}/${spec.policyId}/${spec.employmentFormat}`);
  }

  const reachability = unreachableContent(observations, activeRegistries);
  const variability = variabilityProfile(observations);
  for (const item of variabilityViolations(variability)) violations.push({ ...item, seed: 'profile', policyId: 'all' });
  return {
    profileVersion: QA_PROFILE_VERSION,
    contracts: { ...CONTRACT },
    seeds,
    policyIds,
    employmentFormats: EMPLOYMENT_FORMATS,
    campaigns: observations.length,
    passed: violations.length === 0 && mismatched === 0,
    violations,
    reachability,
    variability,
    replay: { checked, mismatched },
  };
}

export function runQaSmokeProfile(options: QaSmokeOptions = {}): QaProfileReport {
  return runQaProfile({
    ...options,
    seeds: [...new Set(QA_SMOKE_RUN_SPECS.map((item) => item.seed))],
    policyIds: [...new Set(QA_SMOKE_RUN_SPECS.map((item) => item.policyId))],
    runSpecs: QA_SMOKE_RUN_SPECS,
    replayPolicyIds: [],
  });
}
