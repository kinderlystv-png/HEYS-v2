import { registries } from './content/scenario.js';
import { checkCampaignInvariants, unreachableContent, variabilityProfile, type CampaignObservation, type InvariantViolation } from './invariants.js';
import { POLICY_IDS } from './policies.js';
import { runCampaignWithState } from './simulation.js';
import { CONTRACT, type PolicyId, type Registries } from './types.js';

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
 * автоматический профиль он не входит, потому что после Sprint 15 кампания стала
 * тридцатидневной и прогон растёт линейно — по `D74` профиль обменивает
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

export interface QaProfileReport {
  profileVersion: string;
  contracts: typeof CONTRACT;
  seeds: string[];
  policyIds: PolicyId[];
  campaigns: number;
  passed: boolean;
  violations: Array<InvariantViolation & { seed: string; policyId: string }>;
  reachability: { events: string[]; actions: string[] };
  variability: ReturnType<typeof variabilityProfile>;
  replay: { checked: number; mismatched: number };
}

/**
 * Профиль заменяет прежний массовый gate «10 000 зёрен × 7 политик» (`D74`):
 * вместо перебора коротких кампаний он прогоняет фиксированные зёрна и проверяет
 * инварианты, достижимость контента по набору и распределения вариативности.
 */
export function runQaProfile(options: { seeds?: readonly string[]; policyIds?: readonly PolicyId[]; registries?: Registries } = {}): QaProfileReport {
  const seeds = [...(options.seeds ?? REGRESSION_SEEDS)];
  // `random_valid` входит в профиль намеренно: детерминированные политики
  // исследуют каталог узко, и без случайной траектории мёртвый контент
  // выглядит достижимым только на очень больших выборках.
  const policyIds = [...(options.policyIds ?? POLICY_IDS)];
  const activeRegistries = options.registries ?? registries;
  const observations: CampaignObservation[] = [];
  const violations: QaProfileReport['violations'] = [];

  for (const seed of seeds) for (const policyId of policyIds) {
    let observation: CampaignObservation;
    try {
      const { result, finalState } = runCampaignWithState(seed, policyId, true, true, true);
      observation = { seed, policyId, result, finalState };
    } catch (error) {
      // Кампания, которая не смогла завершиться, — это тоже результат профиля,
      // а не повод его уронить: иначе одна поломка скрывает все остальные.
      violations.push({ id: 'campaign_completed', summary: 'Кампания не дошла до конца', evidence: `${seed}/${policyId}: ${error instanceof Error ? error.message : String(error)}`, seed, policyId });
      continue;
    }
    observations.push(observation);
    for (const item of checkCampaignInvariants(observation, activeRegistries)) violations.push({ ...item, seed, policyId });
  }

  let checked = 0, mismatched = 0;
  for (const policyId of policyIds) {
    const seed = seeds[0]!;
    const expected = observations.find((item) => item.seed === seed && item.policyId === policyId);
    if (!expected) continue;
    const replay = runCampaignWithState(seed, policyId, true, true, true);
    checked += 1;
    if (replay.result.finalStateHash !== expected.result.finalStateHash) mismatched += 1;
  }

  const reachability = unreachableContent(observations, activeRegistries);
  return {
    profileVersion: QA_PROFILE_VERSION,
    contracts: { ...CONTRACT },
    seeds,
    policyIds,
    campaigns: observations.length,
    passed: violations.length === 0 && mismatched === 0,
    violations,
    reachability,
    variability: variabilityProfile(observations),
    replay: { checked, mismatched },
  };
}
