export const CONTRACT = {
  schemaVersion: 2,
  scenarioId: 'week-01-project-deadline',
  scenarioVersion: '3',
  calibrationVersion: '0.3',
  technicalContractVersion: '0.31',
  priceBookVersion: 'week-01-rub-v1',
  rngAlgorithm: 'fnv1a-mulberry32-v1',
  hashAlgorithm: 'canonical-json-fnv1a64-v1',
} as const;

export type EntityId = string;
export type Intensity = 'none' | 'light' | 'normal' | 'high';
export type Confidence = 'established' | 'plausible_model' | 'personal_hypothesis';
export type FoodCategory = 'ready_meal' | 'quick_base' | 'cook_stock';
export type Comparator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt';

export type Condition =
  | { kind: 'compare'; path: string; op: Comparator; value: number | string | boolean }
  | { kind: 'capability'; id: string }
  | { kind: 'all'; conditions: Condition[] }
  | { kind: 'any'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition };

export type Requirement =
  | { kind: 'range'; path: string; op: Comparator; value: number }
  | { kind: 'clock_window'; fromMin: number; toMin: number }
  | { kind: 'inventory'; category: FoodCategory; minPortions: number }
  | { kind: 'capability'; id: string }
  | { kind: 'task_status'; taskId: string; status: WorkTask['status'] }
  | { kind: 'commitment_status'; commitmentId: string; status: Commitment['status'] }
  | { kind: 'event_is'; eventId: string };

export interface BoundedRoll { seedKey: string; targetPath: string; minDelta: number; maxDelta: number }
export type Effect =
  | { op: 'add_state'; path: string; delta: number; reason: string }
  | { op: 'set_state'; path: string; value: unknown; reason: string }
  | { op: 'set_min' | 'set_max'; path: string; value: number; reason: string }
  | { op: 'consume_resource'; path: string; amount: number; reason: string }
  | { op: 'add_inventory'; category: FoodCategory; portions: number; reason: string }
  | { op: 'advance_time'; minutes: number; reason: string }
  | { op: 'progress_task'; taskId: string; minutes: number; reason: string }
  | { op: 'create_commitment'; value: Commitment; reason: string }
  | { op: 'resolve_commitment' | 'break_commitment'; commitmentId: string; reason: string }
  | { op: 'adjust_relationship'; target: 'partner' | 'child'; dimension: 'closeness' | 'trust'; delta: number; reason: string }
  | { op: 'adjust_habit'; habitId: keyof CharacterState['habits']; delta: number; reason: string }
  | { op: 'adjust_skill'; skillId: keyof CharacterState['skills']; delta: number; reason: string }
  | { op: 'grant_capability'; capabilityId: string; reason: string }
  | { op: 'add_event_cooldown'; eventId: string; days: number; reason: string }
  | { op: 'bounded_roll'; value: BoundedRoll; reason: string }
  | { op: 'append_causal_link'; mechanism: string; resultPath: string; confidence: Confidence }
  | { op: 'create_task'; task: WorkTask; reason: string }
  | { op: 'set_task'; taskId: string; patch: Partial<WorkTask>; reason: string }
  | { op: 'create_income'; income: Income; reason: string }
  | { op: 'receive_income'; incomeId: string; reason: string }
  | { op: 'set_obligation'; obligationId: string; patch: Partial<FinancialObligation>; reason: string }
  | { op: 'renegotiate_commitment'; commitmentId: string; dueDayIndex: number; dueMinuteOfDay?: number; reason: string }
  | { op: 'sleep_transition'; opportunityMin: number; interruptionsMin: number; reason: string };

export interface ActionCost {
  timeMin: number;
  moneyRub: number;
  inventory?: Array<{ category: FoodCategory; portions: number; fallbackMoneyRub?: number }>;
  effort?: { cognitive?: Intensity; physical?: Intensity; social?: Intensity };
}
export interface ConditionalEffect { when: Condition; evaluateAt: 'pre_action'; effects: Effect[]; explanation: string }
export interface ScheduledEffectDefinition {
  id: string;
  trigger: { kind: 'at_time'; dayOffset: number; minuteOfDay: number } | { kind: 'after_steps'; steps: number } | { kind: 'condition'; condition: Condition };
  effects: Effect[];
}
export interface GeometryRule {
  when: Condition;
  delta: { available?: boolean; timeMin?: number; moneyRub?: number; effortScore?: number; riskScore?: number; optionPressure?: number; preview?: string };
  reason: string;
}
export interface UtilityVector { work: number; family: number; recovery: number; money: number; time: number; risk: number }
export interface ActionDefinition {
  schemaVersion: 1;
  id: string;
  version: 1;
  domains: Array<'state' | 'food' | 'work' | 'family' | 'finance' | 'movement' | 'social'>;
  copy: { label: string; summary: string; knownCost: string };
  requirements: Requirement[];
  cost: ActionCost;
  immediateEffects: Effect[];
  conditionalEffects: ConditionalEffect[];
  scheduledEffects: ScheduledEffectDefinition[];
  uncertainty?: { class: 'none' | 'bounded'; confidence: Confidence; visibleRisk: 'none' | 'low' | 'moderate' | 'high' | 'very_high' };
  explanation: { immediate: string; risk?: string; unavailable?: string };
  tags: string[];
  geometryRules: GeometryRule[];
  baseEffortScore: number;
  baseRiskScore: number;
  baseOptionPressure: number;
  qaUtility: UtilityVector;
  stabilizes: Array<'deadline' | 'financial' | 'family' | 'recovery'>;
}
export interface ActionOffer {
  actionId: string;
  available: boolean;
  unavailableReasons: string[];
  effectiveTimeMin: number;
  moneyRub: number;
  effort: ActionCost['effort'];
  effortScore: number;
  effortLevel: Intensity;
  risk: NonNullable<ActionDefinition['uncertainty']>['visibleRisk'];
  riskScore: number;
  optionPressure: number;
  consequencePreview: string[];
  geometryReasons: Array<{ reason: string; inputPaths: string[] }>;
  utility: UtilityVector;
  stabilizes: string[];
  planningSignals: PlanningSignal[];
}

export type EventSource = 'mandatory' | 'scheduled_consequence' | 'causal' | 'external' | 'opportunity';
export type EventSize = 'none' | 'small' | 'medium' | 'large';
export interface EventTemplate {
  schemaVersion: 1;
  id: string;
  version: 1;
  source: EventSource;
  copy: { title: string; situation: string; causeHint?: string };
  trigger: Condition;
  hardWindow?: { fromDayIndex: number; fromMinuteOfDay: number; toDayIndex: number; toMinuteOfDay: number };
  urgency: 0 | 1 | 2 | 3;
  selectionWeight: number;
  cooldownDays: number;
  maxOccurrencesPerCampaign?: number;
  load: { total: number; external: number; size: EventSize };
  onOpenEffects: Effect[];
  actionIds: string[];
  tags: string[];
}
export interface EventCandidate {
  templateId: string;
  source: EventSource;
  urgency: number;
  selectionWeight: number;
  triggerReasons: string[];
  practicallyAvailableActionIds: string[];
}
export interface EventInstance {
  id: string;
  templateId: string;
  dayIndex: number;
  stepIndex: number;
  source: EventSource;
  actionIds: string[];
  openedBy: { triggerReasons: string[]; selectionRule: string; rngKey?: string };
}
export interface ScenarioSlot { slot: number; dayIndex: number; minuteOfDay: number; eventId: string; forkKind: 'ordinary' | 'hard'; sleepBeforeMin?: number; interruptionsMin?: number }

export interface CharacterState {
  profile: { sleepNeedMin: number; chronotype: 'early' | 'neutral' | 'late'; caffeineHalfLifeMin: number; caffeineSensitivity: number; digestionSensitivity: number; moodBaseline: number };
  skills: Record<'professional' | 'planning' | 'cooking' | 'physical_fitness', number>;
  habits: Record<'caffeine_compensation' | 'late_work' | 'delivery' | 'short_walk' | 'meal_prep', number>;
  capabilities: string[];
}
export interface WorkTask { id: string; remainingMin: number; requiredSkill: number; baseRisk: number; dueDayIndex: number; dueMinuteOfDay: number; status: 'open' | 'done' | 'renegotiated' | 'failed' }
export interface Income { id: string; dueDayIndex: number; amountRub: number; status: 'expected' | 'received' | 'cancelled'; source: 'salary' | 'bonus' | 'extra_work' }
export interface FinancialObligation { id: string; dueDayIndex: number; amountRub: number; status: 'scheduled' | 'deferred' | 'paid' | 'overdue'; deferrable: boolean; deferralsUsed: number; maxDeferrals: number; deferCostRub: number }
export interface Commitment { id: string; domain: 'work' | 'family' | 'finance' | 'recovery' | 'social'; dueDayIndex: number; dueMinuteOfDay?: number; status: 'open' | 'resolved' | 'renegotiated' | 'broken'; owner: 'player' | 'partner' | 'shared'; hard: boolean; renegotiationsUsed: number; sourceId: string }
export interface WeeklyRule { id: string; kind: 'protected_window' | 'spending_limit' | 'work_boundary' | 'movement_plan'; enabled: boolean; sourceId: string }
export interface MonthlyPriority { domain: 'work' | 'family' | 'recovery' | 'social'; level: 0 | 1 | 2 }
export type PlanningDomain = MonthlyPriority['domain'];
export type WeeklyRulePresetId = 'protect_sleep' | 'family_anchor' | 'work_blocks';
export interface PlanningPlan { weeklyRuleIds: WeeklyRulePresetId[]; mainGoal: PlanningDomain; supportingGoal: PlanningDomain }
export interface PlanningSignal {
  kind: 'supports_weekly_rule' | 'conflicts_weekly_rule' | 'supports_main_goal' | 'supports_supporting_goal';
  sourceId: WeeklyRulePresetId | PlanningDomain;
  reason: string;
}
export interface PlanningAdjustment {
  delta: { timeMin: number; moneyRub: number; effortScore: number; riskScore: number; optionPressure: number };
  signals: PlanningSignal[];
  inputPaths: string[];
}
export interface PlanningView {
  valid: boolean;
  issues: Array<{ code: string; message: string }>;
  weeklyRules: Array<{ id: WeeklyRulePresetId; title: string; summary: string; selected: boolean }>;
  monthlyGoals: Array<{ id: PlanningDomain; title: string }>;
  pressures: Array<{ domain: PlanningDomain; title: string; level: 'низкое' | 'умеренное' | 'высокое'; reason: string }>;
  conflicts: Array<{ id: string; severity: 'important' | 'critical'; title: string; reason: string; inputPaths: string[] }>;
  financialHorizon: { cashRub: number; expectedIncomeRub: number; obligationsRub: number; cashAfterNextObligationsRub: number };
  importantDates: Array<{ id: string; dayIndex: number; title: string }>;
  risks: Array<{ id: string; title: string; reason: string }>;
  opportunities: Array<{ id: string; title: string; reason: string }>;
}
export interface ScheduledEffect {
  id: string; sourceId: string;
  trigger: { kind: 'at_time'; dayIndex: number; minuteOfDay: number } | { kind: 'after_steps'; remainingSteps: number } | { kind: 'condition'; condition: Condition };
  effects: Effect[]; status: 'pending' | 'applied' | 'cancelled';
}
export interface CausalEntry { id: string; dayIndex: number; stepIndex: number; sourceId: string; mechanism: string; resultPath: string; before?: number | string; after?: number | string; confidence: Confidence }
export interface EventLedger { occurrences: Record<string, number>; dayExternalLoad: Record<string, number>; dayTotalLoad: Record<string, number>; dayLargeCount: Record<string, number>; weekLargeCount: number; consecutiveHeavy: number }
export interface GameState {
  schemaVersion: 2;
  campaignId: string;
  scenarioId: typeof CONTRACT.scenarioId;
  scenarioVersion: typeof CONTRACT.scenarioVersion;
  calibrationVersion: typeof CONTRACT.calibrationVersion;
  priceBookVersion: typeof CONTRACT.priceBookVersion;
  rng: { seed: string; algorithm: typeof CONTRACT.rngAlgorithm; occurrences: Record<string, number> };
  clock: { dayIndex: number; minuteOfDay: number; stepIndex: number; awakeSinceMinute: number };
  scenarioCursor: number;
  activeEventId: string | null;
  character: CharacterState;
  vitals: { energy: number; mood: number; tension: number; hunger: number; physicalFatigue: number; discomfort: number; windDown: number };
  accumulators: { sleepDebtMin: number; activeCaffeineMg: number; satietyWindowMin: number; recoveryNeed: number; familyLoadPlayer7d: number; familyLoadPartner7d: number };
  economy: { cashRub: number; foodPortions: Record<FoodCategory, number>; expectedIncome: Income[]; obligations: FinancialObligation[]; financialGoal?: { id: string; targetRub: number; reservedRub: number } };
  work: { reputation: number; projectBacklogMin: number; helpDebt: number; tasks: WorkTask[] };
  family: { partner: { closeness: number; trust: number; available: boolean }; child: { closeness: number; trust: number; available: boolean }; friction: number; participationBalance: number };
  commitments: Commitment[];
  scheduledEffects: ScheduledEffect[];
  eventCooldownUntilDay: Record<string, number>;
  eventLedger: EventLedger;
  weeklyRules: WeeklyRule[];
  monthlyPriorities: MonthlyPriority[];
  causalJournal: CausalEntry[];
}
export interface DecisionContext { sleepiness: number; sleepReadiness: number; deadlinePressure: number; financialPressure: number; familyImbalance: number; cashAfterNextObligationsRub: number; focusByTaskId: Record<string, number>; optionPressureByActionId: Record<string, number> }
export interface Registries { actions: Record<string, ActionDefinition>; events: Record<string, EventTemplate>; slots: ScenarioSlot[] }

export type ReducerErrorCode = 'invalid_state' | 'stale_event' | 'unavailable_action' | 'invalid_content' | 'invariant_violation' | 'terminal_lock';
export class ReducerError extends Error {
  constructor(public code: ReducerErrorCode, public stage: string, public entityId: string | undefined, public details: string[]) { super(`${code}@${stage}${entityId ? `:${entityId}` : ''}: ${details.join('; ')}`); this.name = 'ReducerError'; }
}
export interface StageTrace { stage: string; hash: string }
export interface StepOutput { state: GameState; appliedAction: ActionOffer; nextEvent: EventInstance | null; journalEntries: CausalEntry[]; stateHash: string; stages: StageTrace[] }
export interface PlanningStepOutput { state: GameState; journalEntries: CausalEntry[]; stateHash: string }
export type PolicyId = 'maximize_work' | 'protect_family' | 'protect_recovery' | 'save_money' | 'buy_time' | 'balanced' | 'random_valid';
export type OutcomeDirection = 'kept' | 'traded' | 'strained';
export interface CampaignOutcomeAxis { id: 'work' | 'family' | 'finance' | 'recovery'; title: string; direction: OutcomeDirection; summary: string; evidencePaths: string[] }
export interface CharacterDevelopmentItem { id: string; title: string; direction: 'gained' | 'improved' | 'weakened'; summary: string; evidencePaths: string[] }
export interface CampaignOutcome { axes: CampaignOutcomeAxis[]; development: CharacterDevelopmentItem[]; openThreads: string[] }
export interface CampaignResult { seed: string; policyId: PolicyId; finalStateHash: string; visitedSlots: number[]; visitedEvents: string[]; chosenActions: string[]; ordinaryForks: number; ordinaryTwoChoiceForks: number; hardForks: number; hardSingleChoiceForks: number; heavyStates: number; heavyWithStabilizer: number; heavyWithMultipleStabilizers: number; heavyWithoutStabilizerEvents: string[]; heavyWithoutMultipleStabilizerEvents: string[]; terminalLocks: number; maxExternalLoad: number; maxTotalLoad: number; maxLargePerDay: number; weekLargeCount: number; boundarySteps: number; boundaryPaths: string[]; totalSteps: number; auditedTransitions: number; unexplainedLongTermChanges: number; unexplainedPaths: string[]; personalizationInputsDetected: number; transitions: Array<{ inputKey: string; outputHash: string }>; outcomes: { money: number; work: number; family: number; recovery: number; sleep: number } }
