import type { ActionDefinition, ConditionalEffect, Effect, FoodCategory, GeometryRule, ScheduledEffectDefinition, UtilityVector } from '../types.js';
import { ACTION_CONTEXT_COPY, ACTION_EVIDENCE } from './presentation.js';

const U = (work: number, family: number, recovery: number, money: number, time: number, risk: number): UtilityVector => ({ work, family, recovery, money, time, risk });
const add = (path: string, delta: number, reason: string): Effect => ({ op: 'add_state', path, delta, reason });
const compare = (path: string, op: 'lt'|'lte'|'eq'|'gte'|'gt', value: number): GeometryRule['when'] => ({ kind: 'compare', path, op, value });
const lowReserve: GeometryRule = { when: compare('context.cashAfterNextObligationsRub','lt',0), delta: { riskScore:25, optionPressure:20, preview:'Отрицательный прогнозный резерв' }, reason:'отрицательный прогноз резерва', ruleEvidenceId:'re_financial_pressure_choice' };
const tired: GeometryRule = { when: compare('accumulators.recoveryNeed','gte',65), delta: { timeMin:15, effortScore:25, riskScore:20, optionPressure:15, preview:'Восстановление ограничивает нагрузку' }, reason:'высокая потребность в восстановлении', ruleEvidenceId:'re_sleep_movement_effort' };
const lowFocus: GeometryRule = { when: compare('context.focusByTaskId.project_delivery','lt',45), delta: { timeMin:25, effortScore:15, riskScore:18, preview:'Низкий фокус увеличивает время и риск' }, reason:'низкий фокус', ruleEvidenceId:'re_multifactor_task_geometry' };
const highCaffeine: GeometryRule = { when: compare('accumulators.activeCaffeineMg','gte',140), delta: { riskScore:20, optionPressure:15, preview:'Дополнительный кофе ухудшит готовность ко сну' }, reason:'активный кофеин', ruleEvidenceId:'re_caffeine_timing_sleep' };
const partnerFriction: GeometryRule = { when: compare('family.friction','gte',55), delta: { riskScore:20, optionPressure:18, preview:'Просьба повышает семейное трение' }, reason:'семейное трение', ruleEvidenceId:'re_family_load_support' };
// Sprint 8: у партнёра есть своя загрузка и своё окно. Отказ и цена просьбы
// объясняются состоянием, а не скрытым броском.
const partnerOverloaded: GeometryRule = { when: compare('context.partnerLoad','gte',72), delta: { available:false, preview:'Партнёр уже перегружен своими делами' }, reason:'партнёр перегружен', ruleEvidenceId:'re_family_load_support' };
const partnerOutsideWindow: GeometryRule = { when: compare('context.partnerAvailableNow','lt',1), delta: { timeMin:15, riskScore:14, optionPressure:16, preview:'Сейчас не окно партнёра: просьба ляжет поверх его дел' }, reason:'вне окна партнёра', ruleEvidenceId:'re_family_load_support' };
const partnerLoaded: GeometryRule = { when: compare('context.partnerLoad','gte',48), delta: { effortScore:10, riskScore:10, optionPressure:12, preview:'Партнёр уже занят: просьба обойдётся дороже' }, reason:'накопленная нагрузка партнёра', ruleEvidenceId:'re_family_load_support' };
const compressedMondayMorning: GeometryRule['when'] = { kind:'all', conditions:[compare('clock.dayIndex','eq',0),compare('clock.minuteOfDay','gte',360),compare('clock.minuteOfDay','lte',540),compare('context.deadlinePressure','gte',70)] };
const compressedMorningCooking: GeometryRule = { when:compressedMondayMorning, delta:{timeMin:10,effortScore:15,riskScore:8,optionPressure:35,preview:'Сжатое утро: готовка потребует ещё 10 минут, больше усилия и повысит напряжение'}, reason:'готовка в сжатом утре', ruleEvidenceId:'re_multifactor_task_geometry' };
const compressedMorningTension: ConditionalEffect = { when:compressedMondayMorning,evaluateAt:'pre_action',effects:[add('vitals.tension',7,'готовка в сжатом утре')],explanation:'Срочный рабочий хвост и ограниченное утреннее окно повышают напряжение от готовки',ruleEvidenceId:'re_multifactor_task_geometry' };
const cookingRoutine: GeometryRule = { when:compare('character.skills.cooking','gte',37),delta:{timeMin:-10,effortScore:-4,optionPressure:-6,preview:'Навык и привычный порядок сокращают цену готовки'},reason:'освоенный порядок готовки',ruleEvidenceId:'re_habit_skill_future_geometry' };
const batchPrepUnlock: ConditionalEffect = { when:compare('character.skills.cooking','gte',37),evaluateAt:'pre_action',effects:[{op:'grant_capability',capabilityId:'kitchen.batch_prep_familiar',reason:'устойчивый навык готовки на несколько приёмов'}],explanation:'Повторённая готовка открывает устойчивый бытовой процесс',ruleEvidenceId:'re_habit_skill_future_geometry' };
// Sprint 8: разделённый вечер закрепляется как общий ритм и удешевляет будущие
// просьбы — решение партнёра меняет геометрию следующих решений, а не только текст.
const sharedRhythmUnlock: ConditionalEffect = { when:compare('context.partnerLoad','lte',26),evaluateAt:'pre_action',effects:[{op:'grant_capability',capabilityId:'family.shared_rhythm',reason:'разгруженный вечер закрепил общий ритм'}],explanation:'Взятая на себя задача при свободном партнёре закрепляет общий семейный ритм',ruleEvidenceId:'re_family_load_support' };
const sharedRhythmRelief: GeometryRule = { when:{kind:'capability',id:'family.shared_rhythm'},delta:{effortScore:-6,riskScore:-8,optionPressure:-10,preview:'Общий ритм делает просьбу привычной'},reason:'закреплённый общий ритм',ruleEvidenceId:'re_family_load_support' };
// Sprint 9: формат занятости меняет геометрию рабочих решений, а не даёт
// абстрактный процент. Удалённый формат чаще пускает работу в вечер, офисный
// забирает время дорогой, проектный держит выше риск.
const remoteEveningIntrusion: GeometryRule = { when:{kind:'all',conditions:[{kind:'compare',path:'employment.format',op:'eq',value:'remote'},compare('clock.minuteOfDay','gte',1020)]},delta:{riskScore:10,optionPressure:12,preview:'Удалённый формат легче пускает работу в вечер'},reason:'вечернее вторжение удалённого формата',ruleEvidenceId:'re_multifactor_task_geometry' };
const officeCommuteCost: GeometryRule = { when:{kind:'compare',path:'employment.format',op:'eq',value:'office'},delta:{timeMin:10,preview:'Офисный формат добавляет дорогу к рабочему блоку'},reason:'дорога офисного формата',ruleEvidenceId:'re_multifactor_task_geometry' };
const projectInstability: GeometryRule = { when:{kind:'compare',path:'employment.format',op:'eq',value:'project'},delta:{riskScore:8,preview:'Проектный формат держит выше неопределённость'},reason:'нестабильность проектного формата',ruleEvidenceId:'re_multifactor_task_geometry' };
// Вложение в обучение открывает конкретную возможность, а не общий процент.
const trainingUnlock: ConditionalEffect = { when:compare('character.skills.professional','gte',56),evaluateAt:'pre_action',effects:[{op:'grant_capability',capabilityId:'work.focused_block',reason:'обучение закрепило приём длинного фокуса'}],explanation:'Вложение времени в обучение открывает приём длинного рабочего блока',ruleEvidenceId:'re_habit_skill_future_geometry' };
const focusedBlockRelief: GeometryRule = { when:{kind:'capability',id:'work.focused_block'},delta:{timeMin:-15,riskScore:-6,preview:'Приём длинного фокуса сокращает рабочий блок'},reason:'освоенный приём длинного фокуса',ruleEvidenceId:'re_habit_skill_future_geometry' };
const reciprocalSupportUnlock: ConditionalEffect = { when:compare('work.helpDebt','gte',1),evaluateAt:'pre_action',effects:[{op:'grant_capability',capabilityId:'work.reciprocal_support',reason:'взаимная помощь с коллегой подтверждена'}],explanation:'Возвращённая помощь создаёт взаимную поддержку',ruleEvidenceId:'re_habit_skill_future_geometry' };
const repeatedCollaborationUnlock: ConditionalEffect = { when:compare('work.helpDebt','gte',1),evaluateAt:'pre_action',effects:[{op:'grant_capability',capabilityId:'work.reciprocal_support',reason:'повторная совместная работа открыла устойчивый канал помощи'}],explanation:'Повторная совместная работа меняет последующую поддержку',ruleEvidenceId:'re_habit_skill_future_geometry' };

interface Extras { inventory?: Array<{category:FoodCategory;portions:number;fallbackMoneyRub?:number}>; rules?: GeometryRule[]; stabilizes?: ActionDefinition['stabilizes']; scheduled?: ScheduledEffectDefinition[]; conditional?: ConditionalEffect[]; domains?: ActionDefinition['domains'] }
const priorityAlignmentByAction:Record<string,ActionDefinition['priorityAlignment']>={
  eat_ready_meal:{supports:['recovery'],conflicts:[]},
  eat_quick_base:{supports:[],conflicts:[]},
  prepare_simple_meal:{supports:['recovery'],conflicts:['work']},
  cook_meal_batch:{supports:['recovery','family'],conflicts:[]},
  order_food:{supports:[],conflicts:[]},
  drink_coffee_100:{supports:[],conflicts:['recovery']},
  walk_short:{supports:['recovery'],conflicts:[]},
  rest_short:{supports:['recovery'],conflicts:[]},
  train_light:{supports:['recovery'],conflicts:[]},
  train_planned:{supports:['recovery'],conflicts:[]},
  work_standard:{supports:['work'],conflicts:[]},
  work_fast:{supports:['work'],conflicts:['recovery']},
  work_careful:{supports:['work'],conflicts:[]},
  ask_colleague_help:{supports:['work'],conflicts:[]},
  renegotiate_work:{supports:['work'],conflicts:[]},
  work_late:{supports:['work'],conflicts:['family','recovery']},
  ask_partner_help:{supports:['family'],conflicts:[]},
  take_family_load:{supports:['family'],conflicts:[]},
  protect_commitment:{supports:['family'],conflicts:[]},
  wind_down_early:{supports:['recovery'],conflicts:['work']},
  commute_transit:{supports:[],conflicts:[]},
  buy_time_taxi:{supports:[],conflicts:[]},
  accept_scope:{supports:['work'],conflicts:['recovery']},
  decline_extra_project:{supports:['recovery'],conflicts:['work']},
  accept_extra_project:{supports:['work'],conflicts:['family','recovery']},
  repay_colleague_help:{supports:['social'],conflicts:[]},
  shop_food:{supports:['recovery'],conflicts:[]},
  meet_friends_short:{supports:['social'],conflicts:['work']},
  decline_social:{supports:[],conflicts:['social']},
  plan_next_week:{supports:[],conflicts:[]},
  buy_time_and_pickup:{supports:['family'],conflicts:[]},
  postpone_shopping:{supports:[],conflicts:['recovery']},
  attend_school_event_by_taxi:{supports:['family'],conflicts:[]},
};
function action(id:string,label:string,timeMin:number,moneyRub:number,effort:number,risk:number,pressure:number,utility:UtilityVector,effects:Effect[],extras:Extras={}):ActionDefinition {
  const inventory=extras.inventory??[];
  const requirements:ActionDefinition['requirements']=[
    ...(moneyRub>0?[{kind:'range' as const,path:'economy.cashRub',op:'gte' as const,value:moneyRub}]:[]),
    ...inventory.filter((item)=>item.fallbackMoneyRub===undefined).map((item)=>({kind:'inventory' as const,category:item.category,minPortions:item.portions})),
  ];
  const intensity=effort>=35?'high':effort>=15?'normal':effort>0?'light':'none';
  const visibleRisk=risk>=35?'very_high':risk>=24?'high':risk>=12?'moderate':risk>=5?'low':'none';
  const boundedEffects=effects.some((effect)=>effect.op==='add_state'&&effect.path==='vitals.tension'&&effect.delta<0)?[...effects,{op:'set_min' as const,path:'vitals.tension',value:5,reason:'нижняя граница после снятия напряжения'}]:effects;
  const priorityAlignment=priorityAlignmentByAction[id];if(!priorityAlignment)throw new Error(`Missing priority alignment for ${id}`);
  return {
    schemaVersion:2,id,version:1,domains:extras.domains??['state'],priorityAlignment,
    copy:{label,summary:label,knownCost:`${timeMin} мин${moneyRub?` и ${moneyRub} ₽`:''}`,...(ACTION_CONTEXT_COPY[id]?{contextual:ACTION_CONTEXT_COPY[id]}:{})},
    ruleEvidenceId:ACTION_EVIDENCE[id]!,
    requirements,cost:{timeMin,moneyRub,...(inventory.length?{inventory}:{}),effort:{cognitive:intensity}},
    immediateEffects:boundedEffects,conditionalEffects:extras.conditional??[],scheduledEffects:extras.scheduled??[],
    uncertainty:{class:risk?'bounded':'none',confidence:'plausible_model',visibleRisk},
    explanation:{immediate:label,...(risk?{risk:`Видимый риск ${visibleRisk}`}:{ }),unavailable:'Не хватает доступного ресурса'},tags:[...new Set(extras.domains??['state'])],
    geometryRules:extras.rules??[],baseEffortScore:effort,baseRiskScore:risk,baseOptionPressure:pressure,qaUtility:utility,stabilizes:extras.stabilizes??[],
  };
}

const workConditional:ConditionalEffect={when:{kind:'compare',path:'accumulators.sleepDebtMin',op:'gte',value:180},evaluateAt:'pre_action',effects:[add('vitals.tension',4,'дефицит сна повысил цену работы')],explanation:'После короткого сна работа повышает напряжение',ruleEvidenceId:'re_sleep_task_effort'};
const coffeeCrash:ScheduledEffectDefinition={id:'coffee_crash',trigger:{kind:'after_steps',steps:3},effects:[add('vitals.energy',-6,'отложенный спад после кофе'),add('vitals.tension',3,'кофеиновая компенсация')],ruleEvidenceId:'re_caffeine_timing_sleep'};

const definitions:ActionDefinition[]=[
  action('eat_ready_meal','Съесть готовую порцию',20,0,5,2,-18,U(0,0,3,2,1,1),[add('vitals.hunger',-42,'сытная еда'),add('accumulators.satietyWindowMin',210,'окно сытости')],{inventory:[{category:'ready_meal',portions:1}],domains:['food','state'],stabilizes:['recovery']}),
  action('eat_quick_base','Быстро перекусить',10,0,4,3,-10,U(0,0,2,2,3,0),[add('vitals.hunger',-28,'перекус'),add('accumulators.satietyWindowMin',120,'короткая сытость')],{inventory:[{category:'quick_base',portions:1,fallbackMoneyRub:350}],domains:['food','state'],stabilizes:['recovery']}),
  action('prepare_simple_meal','Приготовить простую еду',40,0,14,2,-22,U(-1,0,4,1,-2,2),[add('vitals.hunger',-30,'простая еда'),add('accumulators.satietyWindowMin',120,'короткая сытость')],{domains:['food','state'],stabilizes:['recovery']}),
  action('cook_meal_batch','Приготовить еду на несколько раз',60,0,22,4,-15,U(0,2,3,3,-1,0),[{op:'add_inventory',category:'ready_meal',portions:2,reason:'созданы готовые порции'},add('vitals.hunger',-35,'приём пищи'),{op:'adjust_skill',skillId:'cooking',delta:2,reason:'практика готовки'},{op:'adjust_habit',habitId:'meal_prep',delta:3,reason:'закрепление подготовки еды'}],{inventory:[{category:'cook_stock',portions:3}],rules:[compressedMorningCooking,cookingRoutine],conditional:[compressedMorningTension,batchPrepUnlock],domains:['food','family'],stabilizes:['recovery','financial']}),
  action('order_food','Заказать еду',15,1100,3,8,-20,U(1,1,2,-3,4,-1),[add('vitals.hunger',-38,'доставка еды'),add('accumulators.satietyWindowMin',180,'сытость')],{rules:[lowReserve],domains:['food','finance'],stabilizes:['recovery']}),
  action('drink_coffee_100','Выпить кофе',10,250,2,14,-8,U(2,0,-2,-1,2,-2),[add('accumulators.activeCaffeineMg',100,'кофеин'),add('vitals.energy',10,'краткий стимул'),{op:'adjust_habit',habitId:'caffeine_compensation',delta:2,reason:'закрепление компенсации кофеином'}],{rules:[highCaffeine],scheduled:[coffeeCrash],domains:['state']}),
  action('walk_short','Коротко пройтись',25,0,6,1,-18,U(0,1,4,1,1,2),[add('vitals.tension',-16,'движение'),add('vitals.energy',6,'свежий воздух'),{op:'adjust_habit',habitId:'short_walk',delta:2,reason:'закрепление короткой прогулки'}],{domains:['movement','state'],stabilizes:['recovery','family']}),
  action('rest_short','Коротко отдохнуть',30,0,2,1,-24,U(0,1,5,1,1,3),[add('vitals.energy',18,'короткий отдых'),add('vitals.tension',-8,'пауза снизила напряжение'),add('accumulators.recoveryNeed',-6,'часть потребности в восстановлении закрыта')],{domains:['state'],stabilizes:['recovery']}),
  action('train_light','Лёгкая тренировка',35,0,18,5,-12,U(0,0,4,1,0,1),[add('vitals.tension',-12,'движение'),add('vitals.physicalFatigue',8,'лёгкая нагрузка'),add('accumulators.recoveryNeed',-8,'восстановительный эффект')],{rules:[tired],domains:['movement','state'],stabilizes:['recovery']}),
  action('train_planned','Плановая тренировка',70,0,42,12,-8,U(0,0,5,1,-2,-1),[add('vitals.tension',-18,'тренировка'),add('vitals.physicalFatigue',20,'нагрузка'),add('accumulators.recoveryNeed',-12,'запланированное движение')],{rules:[tired],domains:['movement','state'],stabilizes:['recovery']}),
  action('work_standard','Работать в обычном режиме',75,0,32,16,-16,U(5,0,-2,2,0,-1),[{op:'progress_task',taskId:'project_delivery',minutes:75,reason:'прогресс проекта'},add('vitals.energy',-5,'умственная работа'),add('vitals.tension',4,'рабочая нагрузка'),{op:'adjust_skill',skillId:'professional',delta:1,reason:'практика проекта'}],{rules:[lowFocus,officeCommuteCost,remoteEveningIntrusion,projectInstability,focusedBlockRelief],conditional:[workConditional,trainingUnlock],domains:['work','state'],stabilizes:['deadline']}),
  action('work_fast','Работать быстро',60,0,38,28,-20,U(5,0,-3,2,3,-4),[{op:'progress_task',taskId:'project_delivery',minutes:82,reason:'быстрый прогресс'},add('vitals.energy',-7,'интенсивная работа'),add('vitals.tension',7,'риск переделки')],{rules:[lowFocus],conditional:[workConditional],domains:['work','state'],stabilizes:['deadline']}),
  action('work_careful','Работать тщательно',90,0,30,8,-14,U(4,0,-2,2,-2,3),[{op:'progress_task',taskId:'project_delivery',minutes:70,reason:'надёжный прогресс'},add('vitals.energy',-4,'сосредоточенная работа'),{op:'adjust_skill',skillId:'professional',delta:2,reason:'практика тщательной проверки'},{op:'append_causal_link',mechanism:'тщательная проверка уменьшила риск возврата',resultPath:'work.reviewRisk',confidence:'plausible_model'}],{rules:[lowFocus],conditional:[workConditional],domains:['work','state'],stabilizes:['deadline']}),
  action('ask_colleague_help','Попросить коллегу о помощи',15,0,8,12,-25,U(4,0,0,2,5,-1),[{op:'progress_task',taskId:'project_delivery',minutes:90,reason:'помощь коллеги'},add('work.helpDebt',1,'социальный долг'),add('vitals.tension',-10,'нагрузка разделена с коллегой'),{op:'append_causal_link',mechanism:'совместная проверка снижает риск переделки',resultPath:'work.reviewRisk',confidence:'plausible_model'}],{conditional:[repeatedCollaborationUnlock],domains:['work','social'],stabilizes:['deadline','recovery']}),
  action('renegotiate_work','Пересогласовать работу',25,0,12,16,-22,U(3,1,2,2,3,-2),[{op:'set_task',taskId:'project_delivery',patch:{dueDayIndex:4,status:'renegotiated'},reason:'срок уточнён'},add('work.reputation',-2,'цена пересогласования'),add('vitals.tension',-10,'объём и ожидания уточнены')],{rules:[{when:compare('work.reputation','lt',45),delta:{riskScore:18,optionPressure:15,preview:'Низкая репутация делает переговоры сложнее'},reason:'репутационный контекст',ruleEvidenceId:'re_multifactor_task_geometry'}],domains:['work'],stabilizes:['deadline','recovery']}),
  action('work_late','Работать допоздна',90,0,45,25,-20,U(5,-3,-4,2,1,-3),[{op:'progress_task',taskId:'project_delivery',minutes:105,reason:'поздний рабочий блок'},add('vitals.tension',9,'поздняя нагрузка'),add('vitals.windDown',-25,'сбитое завершение дня'),add('family.friction',4,'вечернее рабочее пересечение'),{op:'adjust_relationship',target:'partner',dimension:'trust',delta:-2,reason:'семейное окно снова уступило работе'},{op:'adjust_habit',habitId:'late_work',delta:2,reason:'закрепление поздней работы'}],{rules:[tired,{when:compare('family.friction','gte',55),delta:{riskScore:18,optionPressure:20,preview:'Предыдущие нарушения делают отмену семейного плана дороже'},reason:'история нарушенных семейных планов',ruleEvidenceId:'re_family_load_support'}],domains:['work','state'],stabilizes:['deadline']}),
  action('ask_partner_help','Попросить партнёра помочь',10,0,6,14,-18,U(2,-2,2,2,4,-2),[add('accumulators.familyLoadPartner7d',12,'нагрузка перенесена'),add('accumulators.familyLoadPlayer7d',-10,'нагрузка снижена'),add('family.friction',6,'цена просьбы'),add('family.partner.load',16,'просьба легла на партнёра')],{rules:[partnerFriction,partnerOverloaded,partnerOutsideWindow,partnerLoaded,sharedRhythmRelief,{when:compare('context.familyImbalance','gte',20),delta:{timeMin:10,riskScore:16,preview:'Перекос нагрузки делает просьбу чувствительнее'},reason:'перекос семейной нагрузки',ruleEvidenceId:'re_family_load_support'}],domains:['family','social'],stabilizes:['family']}),
  action('take_family_load','Взять семейную задачу',60,0,26,4,-24,U(-2,5,-1,1,-2,2),[add('accumulators.familyLoadPlayer7d',12,'вклад в семью'),add('family.participationBalance',10,'участие'),add('family.friction',-10,'обязательство закрыто'),add('vitals.tension',-8,'семейная неопределённость снята'),{op:'adjust_relationship',target:'partner',dimension:'trust',delta:3,reason:'нагрузка разделена надёжно'},{op:'adjust_relationship',target:'child',dimension:'closeness',delta:2,reason:'время уделено ребёнку'},add('family.partner.load',-14,'нагрузка снята с партнёра')],{conditional:[sharedRhythmUnlock],domains:['family'],stabilizes:['family','recovery']}),
  action('protect_commitment','Сохранить обещание',75,0,28,5,-25,U(-2,5,-1,1,-2,2),[{op:'resolve_commitment',commitmentId:'family_week',reason:'обещание выполнено'},{op:'adjust_relationship',target:'partner',dimension:'trust',delta:5,reason:'надёжность'}],{rules:[{when:compare('context.deadlinePressure','gte',70),delta:{timeMin:20,optionPressure:18,preview:'Высокое давление дедлайна повышает цену обещания'},reason:'конфликт дедлайна',ruleEvidenceId:'re_multifactor_task_geometry'},{when:compare('family.friction','gte',55),delta:{riskScore:16,optionPressure:14,preview:'Предыдущие нарушения повышают цену отмены'},reason:'история семейного трения',ruleEvidenceId:'re_family_load_support'}],domains:['family'],stabilizes:['family']}),
  action('wind_down_early','Завершить день раньше',60,0,4,1,-28,U(-2,1,5,2,-1,3),[add('vitals.windDown',38,'спокойное завершение'),add('vitals.tension',-14,'снижение возбуждения')],{rules:[{when:compare('context.deadlinePressure','gte',70),delta:{timeMin:15,optionPressure:20,preview:'Срочный хвост останется до следующего дня'},reason:'срочный рабочий хвост',ruleEvidenceId:'re_multifactor_task_geometry'}],domains:['state'],stabilizes:['recovery']}),
  action('commute_transit','Поехать общественным транспортом',55,120,10,8,0,U(0,0,0,3,-1,0),[add('vitals.tension',-8,'дорога без необходимости управлять')],{domains:['finance','state'],stabilizes:['recovery']}),
  action('buy_time_taxi','Поехать на такси',25,1800,4,4,-10,U(1,1,1,-4,5,1),[add('vitals.energy',4,'сэкономленное время в дороге'),add('vitals.tension',-6,'дорога стала предсказуемее')],{rules:[lowReserve],domains:['finance','state'],stabilizes:['deadline','recovery']}),
  action('accept_scope','Принять расширение объёма',10,0,6,20,12,U(4,0,-2,2,1,-3),[add('work.tasks.0.remainingMin',120,'объём проекта вырос')],{domains:['work']}),
  action('decline_extra_project','Отказаться от дополнительного проекта',15,0,4,3,-12,U(-1,0,3,0,2,2),[add('vitals.tension',-8,'дополнительная нагрузка не принята'),{op:'append_causal_link',mechanism:'новая задача не создана',resultPath:'work.tasks.extra_project.avoided',confidence:'established'}],{domains:['work'],stabilizes:['deadline','recovery']}),
  action('accept_extra_project','Принять дополнительный проект',150,0,42,24,18,U(4,0,-3,4,-3,-3),[{op:'create_task',task:{id:'extra_project',remainingMin:150,dueDayIndex:6,dueMinuteOfDay:1260,requiredSkill:55,baseRisk:30,status:'open'},reason:'дополнительная задача'},{op:'create_income',income:{id:'extra_income',amountRub:3000,dueDayIndex:6,status:'expected',source:'extra_work'},reason:'ожидаемый доход'}],{rules:[tired],domains:['work','finance'],stabilizes:['financial']}),
  action('repay_colleague_help','Вернуть помощь коллеге',45,0,15,2,-10,U(-1,1,1,1,-1,2),[add('work.helpDebt',-1,'долг помощи возвращён'),{op:'append_causal_link',mechanism:'социальное обязательство перед коллегой закрыто',resultPath:'work.helpDebt.repaid',confidence:'established'}],{conditional:[reciprocalSupportUnlock],domains:['work','social'],stabilizes:['recovery']}),
  action('shop_food','Купить продукты',90,5500,20,4,-18,U(0,2,3,-4,-2,2),[{op:'add_inventory',category:'quick_base',portions:4,reason:'закупка'},{op:'add_inventory',category:'cook_stock',portions:6,reason:'закупка'}],{rules:[lowReserve],domains:['food','finance'],stabilizes:['financial']}),
  action('meet_friends_short','Коротко встретиться с друзьями',90,1200,12,4,-15,U(0,1,3,-2,-2,2),[add('vitals.mood',14,'социальная поддержка'),add('vitals.tension',-10,'переключение')],{rules:[{when:compare('context.deadlinePressure','gte',70),delta:{timeMin:20,riskScore:18,optionPressure:16,preview:'Ранний дедлайн делает встречу дороже'},reason:'близкий дедлайн',ruleEvidenceId:'re_multifactor_task_geometry'}],domains:['social']}),
  action('decline_social','Отказаться от встречи',5,0,1,1,-5,U(1,0,1,1,4,1),[add('vitals.tension',-8,'освобождённое вечернее окно')],{domains:['social','state'],stabilizes:['recovery']}),
  action('plan_next_week','Спланировать следующую неделю',45,0,12,2,-18,U(2,2,2,2,0,3),[{op:'set_state',path:'weeklyRules',value:[{id:'protect_sleep',kind:'protected_window',enabled:true,sourceId:'plan_next_week'},{id:'work_blocks',kind:'work_boundary',enabled:true,sourceId:'plan_next_week'}],reason:'два защищённых окна следующей недели созданы'},{op:'adjust_skill',skillId:'planning',delta:2,reason:'практика планирования'}],{domains:['work','family','state'],stabilizes:['deadline','family','recovery']}),
  action('buy_time_and_pickup','Купить время и забрать ребёнка',70,1800,18,4,-25,U(-1,5,0,-4,2,2),[add('family.participationBalance',12,'обязательство выполнено'),add('family.friction',-12,'конфликт снят')],{rules:[lowReserve],domains:['family','finance'],stabilizes:['family']}),
  action('postpone_shopping','Отложить покупки',5,0,1,14,12,U(1,-1,-2,3,4,-2),[],{domains:['food','finance']}),
  action('attend_school_event_by_taxi','Поехать на школьное событие на такси',45,1800,12,3,-28,U(-1,5,0,-4,3,2),[add('family.participationBalance',15,'школьное обязательство выполнено'),{op:'resolve_commitment',commitmentId:'school_event',reason:'событие посещено'}],{rules:[lowReserve],domains:['family','finance'],stabilizes:['family']}),
];

export const actions:Record<string,ActionDefinition>=Object.fromEntries(definitions.map((item)=>[item.id,item]));
