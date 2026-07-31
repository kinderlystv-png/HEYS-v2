import { CONTRACT, type ActionDefinition, type Condition, type Effect, type EventTemplate, type GameState, type Registries, type Requirement, type ScenarioSlot } from './types.js';
import { RULE_EVIDENCE } from './content/presentation.js';

const STATE_PATHS=[
  /^scenarioCursor$/, /^clock\.(dayIndex|minuteOfDay|stepIndex|awakeSinceMinute)$/,
  /^vitals\.(energy|mood|tension|hunger|physicalFatigue|discomfort|windDown)$/,
  /^accumulators\.(sleepDebtMin|activeCaffeineMg|satietyWindowMin|recoveryNeed|familyLoadPlayer7d|familyLoadPartner7d)$/,
  /^economy\.cashRub$/, /^economy\.foodPortions\.(ready_meal|quick_base|cook_stock)$/,
  /^economy\.expectedIncome\.\d+\.amountRub$/, /^work\.(reputation|projectBacklogMin|helpDebt)$/,
  /^work\.tasks\.\d+\.(remainingMin|requiredSkill|baseRisk|dueDayIndex|dueMinuteOfDay)$/,
  /^family\.(friction|participationBalance)$/, /^family\.(partner|child)\.(closeness|trust|load|windowFromMin|windowToMin)$/,
  /^character\.skills\.(professional|planning|cooking|physical_fitness)$/,
  /^character\.habits\.(caffeine_compensation|late_work|delivery|short_walk|meal_prep)$/,
  /^weeklyRules$/, /^employment\.format$/,
];
const CONTEXT_PATHS=[/^context\.(sleepiness|sleepReadiness|deadlinePressure|financialPressure|familyImbalance|cashAfterNextObligationsRub|partnerLoad|partnerAvailableNow|childAvailableNow)$/, /^context\.focusByTaskId\.[a-z0-9_]+$/, /^context\.optionPressureByActionId\.[a-z0-9_]+$/];
const snake=/^[a-z0-9]+(?:_[a-z0-9]+)*$/;
function fail(path:string,message:string):never{throw new Error(`${path}: ${message}`);}
function finite(value:unknown,path:string):asserts value is number{if(typeof value!=='number'||!Number.isFinite(value))fail(path,'expected finite number');}
function integer(value:unknown,path:string):asserts value is number{finite(value,path);if(!Number.isInteger(value))fail(path,'expected integer');}
const inRange=(value:unknown,min:number,max:number,path:string)=>{finite(value,path);if(value<min||value>max)fail(path,`expected ${min}..${max}`);};
const unique=(values:string[],path:string)=>{if(new Set(values).size!==values.length)fail(path,'duplicate id');};
const isAllowedPath=(path:string,allowContext=true)=>STATE_PATHS.some((pattern)=>pattern.test(path))||(allowContext&&CONTEXT_PATHS.some((pattern)=>pattern.test(path)));

function validateSerializable(value:unknown,path='value',seen=new Set<object>()):void {
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){finite(value,path);return;}
  if(typeof value==='function'||typeof value==='symbol'||typeof value==='bigint'||typeof value==='undefined')fail(path,`non-JSON value ${typeof value}`);
  if(typeof value==='object'){
    if(value instanceof Date||value instanceof Map||value instanceof Set||Object.getPrototypeOf(value)!==Object.prototype&&!Array.isArray(value))fail(path,'non-plain JSON object');
    if(seen.has(value))fail(path,'cyclic value');seen.add(value);
    if(Array.isArray(value))value.forEach((item,index)=>validateSerializable(item,`${path}[${index}]`,seen));else Object.entries(value as Record<string,unknown>).forEach(([key,item])=>validateSerializable(item,`${path}.${key}`,seen));
    seen.delete(value);return;
  }
  fail(path,'unsupported value');
}

export function validateCondition(condition:Condition,path='condition'):void {
  if(!condition||typeof condition!=='object')fail(path,'expected object');
  if(condition.kind==='compare'){
    if(!isAllowedPath(condition.path))fail(`${path}.path`,`unknown or forbidden path ${condition.path}`);
    if(!['lt','lte','eq','gte','gt'].includes(condition.op))fail(`${path}.op`,'unknown comparator');
    if(!['number','string','boolean'].includes(typeof condition.value))fail(`${path}.value`,'invalid compare value');
  }else if(condition.kind==='capability'){
    if(!condition.id)fail(`${path}.id`,'capability id required');
  }else if(condition.kind==='all'||condition.kind==='any'){
    if(!Array.isArray(condition.conditions)||!condition.conditions.length)fail(`${path}.conditions`,'non-empty array required');condition.conditions.forEach((item,index)=>validateCondition(item,`${path}.conditions[${index}]`));
  }else if(condition.kind==='not')validateCondition(condition.condition,`${path}.condition`);else fail(`${path}.kind`,'unknown condition kind');
}

function validateRequirement(requirement:Requirement,path:string):void {
  if(requirement.kind==='range'){if(!isAllowedPath(requirement.path,false))fail(`${path}.path`,'unknown persisted state path');if(!['lt','lte','eq','gte','gt'].includes(requirement.op))fail(`${path}.op`,'unknown comparator');finite(requirement.value,`${path}.value`);return;}
  if(requirement.kind==='clock_window'){integer(requirement.fromMin,`${path}.fromMin`);integer(requirement.toMin,`${path}.toMin`);return;}
  if(requirement.kind==='inventory'){if(!['ready_meal','quick_base','cook_stock'].includes(requirement.category))fail(path,'bad food category');integer(requirement.minPortions,`${path}.minPortions`);return;}
  if(requirement.kind==='capability'){if(!requirement.id)fail(path,'capability id required');return;}
  if(requirement.kind==='task_status'||requirement.kind==='commitment_status'||requirement.kind==='event_is'){if(!('taskId'in requirement?requirement.taskId:'commitmentId'in requirement?requirement.commitmentId:requirement.eventId))fail(path,'entity id required');return;}
  fail(`${path}.kind`,'unknown requirement kind');
}

const EFFECT_OPS=new Set(['add_state','set_state','set_min','set_max','consume_resource','add_inventory','advance_time','progress_task','create_commitment','resolve_commitment','break_commitment','adjust_relationship','adjust_habit','adjust_skill','grant_capability','add_event_cooldown','bounded_roll','append_causal_link','create_task','set_task','create_income','receive_income','set_obligation','renegotiate_commitment','sleep_transition']);
export function validateEffect(effect:Effect,path='effect'):void {
  if(!effect||typeof effect!=='object'||!EFFECT_OPS.has((effect as Effect).op))fail(`${path}.op`,'unknown effect operator');
  if(effect.op!=='append_causal_link'&&(!('reason'in effect)||typeof effect.reason!=='string'||!effect.reason.trim()))fail(`${path}.reason`,'reason required');
  if(effect.op==='add_state'||effect.op==='set_min'||effect.op==='set_max'||effect.op==='consume_resource'){
    if(!isAllowedPath(effect.path,false))fail(`${path}.path`,`unknown or forbidden mutation path ${effect.path}`);
    finite(effect.op==='add_state'?effect.delta:effect.op==='consume_resource'?effect.amount:effect.value,`${path}.value`);
  } else if(effect.op==='set_state') {
    if(effect.path!=='weeklyRules')fail(`${path}.path`,'set_state only permits weeklyRules in v1');validateSerializable(effect.value,`${path}.value`);
  } else if(effect.op==='add_inventory'){integer(effect.portions,`${path}.portions`);}
  else if(effect.op==='advance_time'){integer(effect.minutes,`${path}.minutes`);if(effect.minutes<0)fail(path,'negative time');}
  else if(effect.op==='progress_task'){integer(effect.minutes,`${path}.minutes`);if(!effect.taskId)fail(path,'taskId required');}
  else if(effect.op==='bounded_roll'){if(!isAllowedPath(effect.value.targetPath,false))fail(`${path}.value.targetPath`,'unknown roll path');integer(effect.value.minDelta,`${path}.value.minDelta`);integer(effect.value.maxDelta,`${path}.value.maxDelta`);if(effect.value.minDelta>effect.value.maxDelta)fail(path,'invalid roll range');if(!effect.value.seedKey)fail(path,'seedKey required');}
  else if(effect.op==='create_task'){validateSerializable(effect.task,`${path}.task`);if(!effect.task.id)fail(path,'task id required');}
  else if(effect.op==='create_income'){validateSerializable(effect.income,`${path}.income`);if(!effect.income.id)fail(path,'income id required');}
  else validateSerializable(effect,path);
}

export function validateAction(action:ActionDefinition):void {
  validateSerializable(action,'action');
  if(action.schemaVersion!==2||action.version!==1)fail(`action.${action.id}.version`,'expected schema 2/version 1');
  if(!snake.test(action.id))fail('action.id','snake_case required');if(!action.copy?.label||!action.copy.summary||!action.copy.knownCost)fail(`action.${action.id}.copy`,'complete copy required');
  if(!RULE_EVIDENCE[action.ruleEvidenceId])fail(`action.${action.id}.ruleEvidenceId`,'unknown evidence id');
  for(const [eventId,copy] of Object.entries(action.copy.contextual??{}))if(!eventId||!copy.label.trim()||!copy.summary.trim())fail(`action.${action.id}.copy.contextual.${eventId}`,'complete contextual copy required');
  unique(action.priorityAlignment.supports,`action.${action.id}.priorityAlignment.supports`);unique(action.priorityAlignment.conflicts,`action.${action.id}.priorityAlignment.conflicts`);if(action.priorityAlignment.supports.some((domain)=>action.priorityAlignment.conflicts.includes(domain)))fail(`action.${action.id}.priorityAlignment`,'same domain cannot support and conflict');
  integer(action.cost.timeMin,`action.${action.id}.cost.timeMin`);integer(action.cost.moneyRub,`action.${action.id}.cost.moneyRub`);if(action.cost.timeMin<0||action.cost.moneyRub<0)fail(`action.${action.id}.cost`,'negative known cost');
  for(const [index,item] of (action.cost.inventory??[]).entries()){integer(item.portions,`action.${action.id}.cost.inventory[${index}].portions`);if(item.portions<1)fail(`action.${action.id}.cost.inventory[${index}]`,'positive portions required');if(item.fallbackMoneyRub!==undefined){integer(item.fallbackMoneyRub,`action.${action.id}.cost.inventory[${index}].fallbackMoneyRub`);if(item.fallbackMoneyRub<0)fail(`action.${action.id}.cost.inventory[${index}]`,'negative fallback price');}}
  action.requirements.forEach((item,index)=>validateRequirement(item,`action.${action.id}.requirements[${index}]`));
  action.immediateEffects.forEach((item,index)=>validateEffect(item,`action.${action.id}.immediateEffects[${index}]`));
  action.conditionalEffects.forEach((item,index)=>{if(item.evaluateAt!=='pre_action')fail(`action.${action.id}.conditionalEffects[${index}]`,'must evaluate pre_action');if(!RULE_EVIDENCE[item.ruleEvidenceId])fail(`action.${action.id}.conditionalEffects[${index}].ruleEvidenceId`,'unknown evidence id');validateCondition(item.when);item.effects.forEach((effect,effectIndex)=>validateEffect(effect,`conditional[${index}].effects[${effectIndex}]`));});
  unique(action.scheduledEffects.map((item)=>item.id),`action.${action.id}.scheduledEffects`);const rollKeys:string[]=[];
  for(const scheduled of action.scheduledEffects){if(!snake.test(scheduled.id))fail('scheduled.id','snake_case required');if(!RULE_EVIDENCE[scheduled.ruleEvidenceId])fail(`scheduled.${scheduled.id}.ruleEvidenceId`,'unknown evidence id');if(scheduled.trigger.kind==='condition')validateCondition(scheduled.trigger.condition);else if(scheduled.trigger.kind==='after_steps'){integer(scheduled.trigger.steps,`scheduled.${scheduled.id}.trigger.steps`);if(scheduled.trigger.steps<1)fail(`scheduled.${scheduled.id}.trigger.steps`,'must be positive');}else{integer(scheduled.trigger.dayOffset,`scheduled.${scheduled.id}.trigger.dayOffset`);integer(scheduled.trigger.minuteOfDay,`scheduled.${scheduled.id}.trigger.minuteOfDay`);if(scheduled.trigger.dayOffset<0||scheduled.trigger.minuteOfDay<0||scheduled.trigger.minuteOfDay>1439)fail(`scheduled.${scheduled.id}.trigger`,'invalid at_time bounds');}scheduled.effects.forEach((effect,index)=>validateEffect(effect,`scheduled.${scheduled.id}.effects[${index}]`));}
  const collectRoll=(effect:Effect)=>{if(effect.op==='bounded_roll')rollKeys.push(effect.value.seedKey);};action.immediateEffects.forEach(collectRoll);action.conditionalEffects.flatMap((item)=>item.effects).forEach(collectRoll);action.scheduledEffects.flatMap((item)=>item.effects).forEach(collectRoll);unique(rollKeys,`action.${action.id}.boundedRollKeys`);
  action.geometryRules.forEach((rule,index)=>{validateCondition(rule.when,`action.${action.id}.geometryRules[${index}]`);if(!rule.reason)fail('geometryRule.reason','required');if(!RULE_EVIDENCE[rule.ruleEvidenceId])fail(`action.${action.id}.geometryRules[${index}].ruleEvidenceId`,'unknown evidence id');});
}

export function validateEvent(event:EventTemplate):void {
  validateSerializable(event,'event');if(event.schemaVersion!==1||event.version!==1)fail(`event.${event.id}.version`,'expected schema/version 1');if(!snake.test(event.id))fail('event.id','snake_case required');
  if(!event.copy?.title||!event.copy.situation||event.copy.situation.startsWith('Контрольная развилка'))fail(`event.${event.id}.copy`,'authored title and situation required');validateCondition(event.trigger,`event.${event.id}.trigger`);
  integer(event.urgency,`event.${event.id}.urgency`);inRange(event.urgency,0,3,`event.${event.id}.urgency`);integer(event.selectionWeight,`event.${event.id}.selectionWeight`);if(event.selectionWeight<=0)fail('selectionWeight','positive integer required');
  integer(event.cooldownDays,`event.${event.id}.cooldownDays`);if(event.source==='external'&&(event.cooldownDays<2||event.load.external<=0||!event.maxOccurrencesPerCampaign))fail(`event.${event.id}`,'external event requires cooldown>=2, load and cap');
  if(event.load.external>event.load.total)fail(`event.${event.id}.load`,'external exceeds total');if(!event.actionIds.length)fail(`event.${event.id}.actionIds`,'at least one action required');
  const openOps=new Set(['advance_time','add_state','create_commitment','append_causal_link']);event.onOpenEffects.forEach((effect,index)=>{validateEffect(effect,`event.${event.id}.onOpenEffects[${index}]`);if(!openOps.has(effect.op))fail(`event.${event.id}.onOpenEffects[${index}]`,'operator forbidden on event open');if(effect.op==='add_state'&&!/^vitals\.(tension|mood|energy)$/.test(effect.path))fail('onOpen.path','only visible vitals allowed');});
  if(event.source==='causal'&&!event.copy.causeHint)fail(`event.${event.id}.copy.causeHint`,'required for causal event');
}

export function validateSlot(slot:ScenarioSlot):void {integer(slot.slot,'slot.slot');integer(slot.dayIndex,'slot.dayIndex');integer(slot.minuteOfDay,'slot.minuteOfDay');if(slot.slot<1||slot.dayIndex<0||slot.minuteOfDay<0||slot.minuteOfDay>1439)fail(`slot.${slot.slot}`,'out of range');}

function validatePeriods(state:GameState):void {
  const periods=state.periods;
  if(!periods||typeof periods!=='object')fail('state.periods','required');
  if(periods.version!==1)fail('state.periods.version','expected 1');
  for(const key of ['daysPerWeek','weeksPerMonth'] as const){integer(periods[key],`state.periods.${key}`);if(periods[key]<1)fail(`state.periods.${key}`,'must be positive');}
  for(const key of ['completedDays','completedWeeks','completedMonths'] as const){integer(periods[key],`state.periods.${key}`);if(periods[key]<0)fail(`state.periods.${key}`,'negative');}
  if(!Array.isArray(periods.appliedBoundaries)||periods.appliedBoundaries.some((id)=>typeof id!=='string'))fail('state.periods.appliedBoundaries','expected string ids');
  unique(periods.appliedBoundaries,'state.periods.appliedBoundaries');
  if(!Array.isArray(periods.plannedWeeks)||periods.plannedWeeks.some((index)=>!Number.isInteger(index)||index<0))fail('state.periods.plannedWeeks','expected non-negative week indexes');
  unique(periods.plannedWeeks.map(String),'state.periods.plannedWeeks');
  const employment=state.employment;
  if(!employment||typeof employment!=='object')fail('state.employment','required');
  if(employment.format!==null&&!['office','remote','project'].includes(employment.format))fail('state.employment.format','unknown format');
  if(employment.chosenAtStepIndex!==null){integer(employment.chosenAtStepIndex,'state.employment.chosenAtStepIndex');if(employment.chosenAtStepIndex<0)fail('state.employment.chosenAtStepIndex','negative');}
  if((employment.format===null)!==(employment.chosenAtStepIndex===null))fail('state.employment','format and choice step must be set together');
  const stats=state.weekStats;
  if(!stats||typeof stats!=='object')fail('state.weekStats','required');
  integer(stats.weekIndex,'state.weekStats.weekIndex');integer(stats.previousWeekIndex,'state.weekStats.previousWeekIndex');
  for(const [key,counts] of [['actionCounts',stats.actionCounts],['previousActionCounts',stats.previousActionCounts]] as const){
    if(!counts||typeof counts!=='object'||Array.isArray(counts))fail(`state.weekStats.${key}`,'expected map');
    for(const [actionId,value] of Object.entries(counts)){integer(value,`state.weekStats.${key}.${actionId}`);if(value<0)fail(`state.weekStats.${key}.${actionId}`,'negative');}
  }
}

export function validateState(state:GameState):void {
  validateSerializable(state,'state');
  if(state.schemaVersion!==3||state.scenarioId!==CONTRACT.scenarioId||state.scenarioVersion!==CONTRACT.scenarioVersion||state.calibrationVersion!==CONTRACT.calibrationVersion||state.priceBookVersion!==CONTRACT.priceBookVersion||state.rng.algorithm!==CONTRACT.rngAlgorithm)fail('state.versions','contract mismatch');
  if('derived'in(state as unknown as Record<string,unknown>)||'context'in(state as unknown as Record<string,unknown>))fail('state','derived context must not be serialized');
  if(!state.campaignId||!state.rng.seed)fail('state','campaignId and rng.seed required');if(state.activeEventId!==null&&typeof state.activeEventId!=='string')fail('state.activeEventId','expected event id or null');integer(state.scenarioCursor,'state.scenarioCursor');if(state.scenarioCursor<0)fail('state.scenarioCursor','negative');validatePeriods(state);
  integer(state.clock.dayIndex,'state.clock.dayIndex');integer(state.clock.minuteOfDay,'state.clock.minuteOfDay');integer(state.clock.stepIndex,'state.clock.stepIndex');if(state.clock.dayIndex<0)fail('state.clock.dayIndex','negative');inRange(state.clock.minuteOfDay,0,1439,'state.clock.minuteOfDay');
  Object.entries(state.vitals).forEach(([key,value])=>inRange(value,0,100,`state.vitals.${key}`));for(const key of ['recoveryNeed','familyLoadPlayer7d','familyLoadPartner7d'] as const)inRange(state.accumulators[key],0,100,`state.accumulators.${key}`);
  inRange(state.accumulators.sleepDebtMin,0,480,'state.accumulators.sleepDebtMin');inRange(state.accumulators.activeCaffeineMg,0,600,'state.accumulators.activeCaffeineMg');inRange(state.accumulators.satietyWindowMin,0,360,'state.accumulators.satietyWindowMin');
  Object.entries(state.character.skills).forEach(([key,value])=>inRange(value,0,100,`state.character.skills.${key}`));Object.entries(state.character.habits).forEach(([key,value])=>inRange(value,0,100,`state.character.habits.${key}`));
  inRange(state.work.reputation,0,100,'state.work.reputation');inRange(state.family.friction,0,100,'state.family.friction');inRange(state.family.participationBalance,-100,100,'state.family.participationBalance');for(const person of ['partner','child'] as const){inRange(state.family[person].closeness,0,100,`state.family.${person}.closeness`);inRange(state.family[person].trust,0,100,`state.family.${person}.trust`);inRange(state.family[person].load,0,100,`state.family.${person}.load`);integer(state.family[person].windowFromMin,`state.family.${person}.windowFromMin`);integer(state.family[person].windowToMin,`state.family.${person}.windowToMin`);inRange(state.family[person].windowFromMin,0,1439,`state.family.${person}.windowFromMin`);inRange(state.family[person].windowToMin,0,1439,`state.family.${person}.windowToMin`);if(state.family[person].windowToMin<state.family[person].windowFromMin)fail(`state.family.${person}.windowToMin`,'window ends before it starts');}
  const nonnegativeIntegers=[state.economy.cashRub,...Object.values(state.economy.foodPortions),state.work.projectBacklogMin,state.work.helpDebt];for(const value of nonnegativeIntegers){integer(value,'state.integerResource');if(value<0)fail('state.integerResource','negative');}
  unique(state.work.tasks.map((item)=>item.id),'state.work.tasks');unique(state.commitments.map((item)=>item.id),'state.commitments');unique(state.economy.expectedIncome.map((item)=>item.id),'state.economy.expectedIncome');unique(state.economy.obligations.map((item)=>item.id),'state.economy.obligations');unique(state.scheduledEffects.map((item)=>item.id),'state.scheduledEffects');unique(state.causalJournal.map((item)=>item.id),'state.causalJournal');
  for(const effect of state.scheduledEffects){if(effect.trigger.kind==='condition')validateCondition(effect.trigger.condition);else if(effect.trigger.kind==='after_steps'){integer(effect.trigger.remainingSteps,`state.scheduledEffects.${effect.id}.remainingSteps`);if(effect.trigger.remainingSteps<0)fail(`state.scheduledEffects.${effect.id}.remainingSteps`,'negative remaining steps');}else{integer(effect.trigger.dayIndex,`state.scheduledEffects.${effect.id}.dayIndex`);integer(effect.trigger.minuteOfDay,`state.scheduledEffects.${effect.id}.minuteOfDay`);if(effect.trigger.dayIndex<0||effect.trigger.minuteOfDay<0||effect.trigger.minuteOfDay>1439)fail(`state.scheduledEffects.${effect.id}.trigger`,'invalid at_time bounds');}effect.effects.forEach((item,index)=>validateEffect(item,`state.scheduledEffects.${effect.id}.effects[${index}]`));}
  const backlog=state.work.tasks.filter((task)=>task.status==='open'||task.status==='renegotiated').reduce((sum,task)=>sum+task.remainingMin,0);if(backlog!==state.work.projectBacklogMin)fail('state.work.projectBacklogMin',`expected ${backlog}`);
}

export function validateRegistries(registries:Registries,initialState:GameState):void {
  Object.values(registries.actions).forEach(validateAction);Object.values(registries.events).forEach(validateEvent);registries.slots.forEach(validateSlot);
  if(!Object.keys(registries.actions).length)fail('registries.actions','at least one authored action required');if(!Object.keys(registries.events).length)fail('registries.events','at least one authored situation required');if(!registries.slots.length)fail('registries.slots','at least one slot required');
  if(initialState.activeEventId!==registries.slots[0]?.eventId)fail('state.activeEventId','initial active event must match first slot');
  if(registries.slots.some((slot,index)=>slot.slot!==index+1))fail('registries.slots','slot numbers must be contiguous from 1');if(registries.slots.some((slot,index)=>index>0&&slot.dayIndex<registries.slots[index-1]!.dayIndex))fail('registries.slots','slot days must not go backwards');
  if(!registries.slots[0]?.eventId)fail('registries.slots','the first anchor must name the opening situation');
  for(const slot of registries.slots){if(!slot.eventId)continue;const event=registries.events[slot.eventId];if(!event){fail(`slot.${slot.slot}`,`unknown event ${slot.eventId}`);}if(event.hardWindow&&(event.hardWindow.fromDayIndex!==slot.dayIndex||event.hardWindow.fromMinuteOfDay!==slot.minuteOfDay))fail(`slot.${slot.slot}`,'event hardWindow does not match anchor');}
  for(const event of Object.values(registries.events))for(const actionId of event.actionIds)if(!registries.actions[actionId])fail(`event.${event.id}`,`unknown action ${actionId}`);
  {
    const taskIds=new Set(initialState.work.tasks.map((item)=>item.id)),commitmentIds=new Set(initialState.commitments.map((item)=>item.id)),incomeIds=new Set(initialState.economy.expectedIncome.map((item)=>item.id)),obligationIds=new Set(initialState.economy.obligations.map((item)=>item.id)),eventIds=new Set(Object.keys(registries.events));
    const allEffects:Effect[]=[];for(const action of Object.values(registries.actions)){for(const requirement of action.requirements){if(requirement.kind==='task_status'&&!taskIds.has(requirement.taskId))fail(`action.${action.id}.requirements`,`unknown task ${requirement.taskId}`);if(requirement.kind==='commitment_status'&&!commitmentIds.has(requirement.commitmentId))fail(`action.${action.id}.requirements`,`unknown commitment ${requirement.commitmentId}`);if(requirement.kind==='event_is'&&!eventIds.has(requirement.eventId))fail(`action.${action.id}.requirements`,`unknown event ${requirement.eventId}`);}allEffects.push(...action.immediateEffects,...action.conditionalEffects.flatMap((item)=>item.effects),...action.scheduledEffects.flatMap((item)=>item.effects));for(const effect of action.immediateEffects)if(effect.op==='create_task')taskIds.add(effect.task.id);}
    for(const event of Object.values(registries.events))allEffects.push(...event.onOpenEffects);for(const item of initialState.scheduledEffects)allEffects.push(...item.effects);
    for(const effect of allEffects){if((effect.op==='progress_task'||effect.op==='set_task')&&!taskIds.has(effect.taskId))fail('registries.effects',`unknown task ${effect.taskId}`);if((effect.op==='resolve_commitment'||effect.op==='break_commitment'||effect.op==='renegotiate_commitment')&&!commitmentIds.has(effect.commitmentId))fail('registries.effects',`unknown commitment ${effect.commitmentId}`);if(effect.op==='receive_income'&&!incomeIds.has(effect.incomeId))fail('registries.effects',`unknown income ${effect.incomeId}`);if(effect.op==='set_obligation'&&!obligationIds.has(effect.obligationId))fail('registries.effects',`unknown obligation ${effect.obligationId}`);if(effect.op==='add_event_cooldown'&&!eventIds.has(effect.eventId))fail('registries.effects',`unknown event ${effect.eventId}`);if(effect.op==='create_commitment')commitmentIds.add(effect.value.id);if(effect.op==='create_income')incomeIds.add(effect.income.id);}
  }
}

/**
 * Инвариант `D73`: ситуация открывается состоянием и временем, а не позицией в
 * сценарии. Возвращает шаблоны, у которых в триггере остался `scenarioCursor`.
 */
export function findCursorBoundEvents(registries:Registries):string[] {
  const usesCursor=(condition:Condition):boolean=>{
    if(condition.kind==='compare')return condition.path==='scenarioCursor'||condition.path.startsWith('scenarioCursor.');
    if(condition.kind==='capability')return false;
    if(condition.kind==='not')return usesCursor(condition.condition);
    return condition.conditions.some(usesCursor);
  };
  return Object.values(registries.events).filter((event)=>usesCursor(event.trigger)).map((event)=>event.id).sort();
}
