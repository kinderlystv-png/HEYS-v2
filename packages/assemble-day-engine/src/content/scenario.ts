import { CONTRACT, type EventSource, type EventTemplate, type GameState, type Registries, type ScenarioSlot } from '../types.js';
import { actions } from './actions.js';
import { EVENT_COPY } from './presentation.js';
import { createPeriodState, daysPerYear } from '../periods.js';

type SlotSeed=[number,number,string,EventSource,string[]];
const raw:SlotSeed[]=[
  [1,420,'mon_breakfast','causal',['eat_ready_meal','cook_meal_batch','eat_quick_base','drink_coffee_100']],
  [1,480,'mon_commute','mandatory',['commute_transit','buy_time_taxi']],
  [1,570,'mon_scope_expansion','mandatory',['accept_scope','renegotiate_work']],
  [1,780,'mon_lunch_window','causal',['eat_ready_meal','eat_quick_base','order_food']],
  [1,960,'mon_project_block','mandatory',['work_standard','work_careful','ask_colleague_help']],
  [1,1140,'mon_family_dinner','mandatory',['protect_commitment','order_food','work_late']],
  [2,150,'tue_night_wakeup','mandatory',['take_family_load','ask_partner_help']],
  [2,420,'tue_recovery_breakfast','causal',['eat_quick_base','eat_ready_meal','drink_coffee_100']],
  [2,540,'tue_review_prep','mandatory',['work_standard','work_fast','ask_colleague_help']],
  [2,720,'tue_review_result','scheduled_consequence',['work_careful','renegotiate_work','ask_colleague_help']],
  [2,930,'tue_pickup_conflict','mandatory',['take_family_load','ask_partner_help','buy_time_and_pickup']],
  [2,1140,'tue_evening_pressure','causal',['order_food','work_late','wind_down_early','protect_commitment']],
  [3,480,'wed_commute_delay','external',['commute_transit','buy_time_taxi','renegotiate_work']],
  [3,600,'wed_long_meeting','mandatory',['work_standard','work_fast','renegotiate_work','eat_quick_base','walk_short']],
  [3,810,'wed_late_lunch','causal',['eat_quick_base','order_food','eat_ready_meal']],
  [3,870,'wed_school_call','mandatory',['take_family_load','ask_partner_help','buy_time_and_pickup']],
  [3,1020,'wed_work_recovery','causal',['work_standard','ask_colleague_help','renegotiate_work']],
  [3,1200,'wed_evening_stabilize','causal',['walk_short','wind_down_early','work_late']],
  [4,480,'thu_hybrid_start','opportunity',['work_standard','walk_short','eat_ready_meal']],
  [4,600,'thu_colleague_help_debt','scheduled_consequence',['repay_colleague_help','work_standard','renegotiate_work']],
  [4,720,'thu_extra_project','opportunity',['accept_extra_project','decline_extra_project']],
  [4,1080,'thu_movement_plan','mandatory',['train_planned','train_light','work_late']],
  [4,1200,'thu_family_evening','mandatory',['protect_commitment','wind_down_early','work_late']],
  [5,480,'fri_deadline_plan','mandatory',['work_standard','work_careful','work_fast','eat_quick_base','walk_short']],
  [5,600,'fri_final_issue','causal',['work_fast','work_careful','ask_colleague_help']],
  [5,780,'fri_lunch','causal',['eat_ready_meal','eat_quick_base','order_food']],
  [5,930,'fri_submit','mandatory',['work_standard','work_careful','renegotiate_work','eat_quick_base','walk_short']],
  [5,1035,'fri_after_submit','opportunity',['walk_short','decline_extra_project','accept_extra_project']],
  [5,1140,'fri_family_plan','mandatory',['protect_commitment','work_late','renegotiate_work']],
  [6,540,'sat_school_event','mandatory',['protect_commitment','attend_school_event_by_taxi']],
  [6,720,'sat_household_stock','mandatory',['shop_food','order_food','postpone_shopping']],
  [6,900,'sat_meal_prep','opportunity',['cook_meal_batch','eat_ready_meal','eat_quick_base','walk_short']],
  [6,1080,'sat_social_invite','opportunity',['meet_friends_short','decline_social','protect_commitment']],
  [6,1320,'sat_evening_close','causal',['wind_down_early','walk_short','work_late']],
  [7,540,'sun_recovery_start','causal',['eat_ready_meal','walk_short','train_light']],
  [7,720,'sun_family_time','mandatory',['take_family_load','protect_commitment','walk_short']],
  [7,960,'sun_week_preparation','mandatory',['cook_meal_batch','plan_next_week','work_standard']],
  [7,1260,'sun_early_finish','mandatory',['wind_down_early','plan_next_week','work_late']],
];

const daySleep:Record<number,[number,number]>={1:[300,55],2:[420,10],3:[435,5],4:[420,15],5:[480,0],6:[480,0]};
export const slots:ScenarioSlot[]=raw.map(([day,minute,eventId],index)=>{
  const dayIndex=day-1,firstOfDay=index===0||raw[index-1]![0]!==day,sleep=firstOfDay?daySleep[dayIndex]:undefined;
  return {slot:index+1,dayIndex,minuteOfDay:minute,eventId,forkKind:eventId==='tue_night_wakeup'||eventId==='sat_school_event'?'hard':'ordinary',...(sleep?{sleepBeforeMin:sleep[0],interruptionsMin:sleep[1]}:{})};
});
slots[7]={...slots[7]!,sleepBeforeMin:210,interruptionsMin:10};

/**
 * Длина играбельной кампании (`D72`, Sprint 15). Авторская неделя задаёт первые
 * семь дней, дальше идёт ровный суточный ритм из тех же временных якорей. Якорь
 * не называет ситуацию: её выбирает отбор по состоянию, поэтому продолжение
 * кампании — это календарь, а не копия недели.
 */
export const CAMPAIGN_DAYS=daysPerYear(createPeriodState());
const ROUTINE_DAY_ANCHORS=[420,600,780,960,1140,1320];
const ROUTINE_SLEEP:[number,number]=[450,0];
const authoredDays=Math.max(...raw.map((item)=>item[0]));
for(let dayIndex=authoredDays;dayIndex<CAMPAIGN_DAYS;dayIndex+=1){
  ROUTINE_DAY_ANCHORS.forEach((minuteOfDay,index)=>{
    slots.push({
      slot:slots.length+1,
      dayIndex,
      minuteOfDay,
      forkKind:'ordinary',
      ...(index===0?{sleepBeforeMin:ROUTINE_SLEEP[0],interruptionsMin:ROUTINE_SLEEP[1]}:{}),
    });
  });
}

const heavyIds=new Set(['tue_night_wakeup','tue_pickup_conflict','wed_school_call','thu_family_evening','fri_final_issue','fri_submit','sat_school_event']);
const familyWindowIds=new Set(['mon_family_dinner','tue_pickup_conflict','thu_family_evening','fri_family_plan','sat_school_event','sun_family_time']);
/**
 * Ситуации, переведённые на условия состояния и времени (`D73`). Окно каждой
 * начинается на предыдущем якоре своего дня и заканчивается с запасом, поэтому
 * между якорями не остаётся дыр, а порядок внутри дня решает отбор, а не
 * позиция в сценарии.
 */
const STATE_DRIVEN_DAYS=new Set([1,2,3,4,5,6,7]);
const dayAnchors=(day:number):number[]=>raw.filter((item)=>item[0]===day).map((item)=>item[1]);
const domainCondition:Record<string,EventTemplate['trigger']>={
  mon_breakfast:{kind:'compare',path:'vitals.hunger',op:'gte',value:5},
  mon_commute:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  mon_scope_expansion:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  mon_lunch_window:{kind:'compare',path:'vitals.hunger',op:'gte',value:5},
  mon_project_block:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  mon_family_dinner:{kind:'compare',path:'family.partner.closeness',op:'gte',value:1},
  tue_night_wakeup:{kind:'compare',path:'family.child.closeness',op:'gte',value:1},
  tue_recovery_breakfast:{kind:'compare',path:'vitals.hunger',op:'gte',value:5},
  tue_review_prep:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  tue_pickup_conflict:{kind:'compare',path:'family.child.closeness',op:'gte',value:1},
  wed_long_meeting:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  wed_late_lunch:{kind:'compare',path:'vitals.hunger',op:'gte',value:5},
  wed_school_call:{kind:'compare',path:'family.child.closeness',op:'gte',value:1},
  wed_work_recovery:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  thu_family_evening:{kind:'compare',path:'family.partner.closeness',op:'gte',value:1},
  fri_deadline_plan:{kind:'compare',path:'work.projectBacklogMin',op:'gte',value:1},
  fri_lunch:{kind:'compare',path:'vitals.hunger',op:'gte',value:5},
  fri_family_plan:{kind:'compare',path:'family.partner.closeness',op:'gte',value:1},
  sat_school_event:{kind:'compare',path:'family.child.closeness',op:'gte',value:1},
  sun_family_time:{kind:'compare',path:'family.partner.closeness',op:'gte',value:1},
};
function situationTrigger(day:number,minute:number,id:string):EventTemplate['trigger'] {
  const anchors=dayAnchors(day),position=anchors.indexOf(minute);
  // Ситуация становится доступной со своего якоря и остаётся доступной до конца
  // дня: верхней границы нет, поэтому длинное действие не может оставить день
  // без единой подходящей ситуации.
  const fromMin=position<=0?0:anchors[position-1]!;
  const dayIndex=day-1;
  const ownDay:EventTemplate['trigger']={kind:'all',conditions:[
    {kind:'compare',path:'clock.dayIndex',op:'eq',value:dayIndex},
    {kind:'compare',path:'clock.minuteOfDay',op:'gte',value:fromMin},
  ]};
  // Следующая ситуация выбирается ещё до перевода часов на её якорь, поэтому
  // первая ситуация дня доступна начиная с последнего якоря предыдущего дня.
  const previousAnchors=dayAnchors(day-1);
  const handoverFrom=previousAnchors.length?previousAnchors[previousAnchors.length-1]!:0;
  const window:EventTemplate['trigger']=position<=0&&dayIndex>0
    ? {kind:'any',conditions:[ownDay,{kind:'all',conditions:[
        {kind:'compare',path:'clock.dayIndex',op:'eq',value:dayIndex-1},
        {kind:'compare',path:'clock.minuteOfDay',op:'gte',value:handoverFrom},
      ]}]}
    : ownDay;
  const domain=domainCondition[id];
  return domain?{kind:'all',conditions:[window,domain]}:window;
}

export const events:Record<string,EventTemplate>=Object.fromEntries(raw.map(([day,minute,id,source,actionIds],index)=>{
  const heavy=heavyIds.has(id),large=source==='external',dayIndex=day-1;
  const event:EventTemplate={
    schemaVersion:1,id,version:1,source,
    copy:{...EVENT_COPY[id]!,...(source==='causal'&&!EVENT_COPY[id]?.causeHint?{causeHint:'Ситуация учитывает накопленное состояние и предыдущие решения.'}:{})},
    trigger:STATE_DRIVEN_DAYS.has(day)?situationTrigger(day,minute,id):{kind:'compare',path:'scenarioCursor',op:'eq',value:index},
    ...(STATE_DRIVEN_DAYS.has(day)?{}:{hardWindow:{fromDayIndex:dayIndex,fromMinuteOfDay:minute,toDayIndex:dayIndex,toMinuteOfDay:Math.min(1439,minute+120)}}),
    urgency:heavy?3:source==='mandatory'?2:1,selectionWeight:1,cooldownDays:source==='external'?2:0,maxOccurrencesPerCampaign:1,
    load:{external:source==='external'?35:0,total:source==='external'?40:source==='causal'?12:0,size:large?'large':heavy?'medium':'small'},
    onOpenEffects:source==='external'?[{op:'add_state',path:'vitals.tension',delta:5,reason:'внешняя задержка'}]:[],actionIds,tags:[source,...(heavy?['heavy']:[]),...(day<=5&&minute>=540&&minute<1080?['planned_work_window']:[]),...(familyWindowIds.has(id)?['family_anchor_window']:[]),...(minute>=1080?['sleep_boundary_window']:[])],
  };
  return [id,event];
}));

function branchTrigger(cursor:number, condition:EventTemplate['trigger']):EventTemplate['trigger'] {
  const seed=raw[cursor]!;
  const base:EventTemplate['trigger']=STATE_DRIVEN_DAYS.has(seed[0])
    ? situationTrigger(seed[0],seed[1],seed[2])
    : {kind:'compare',path:'scenarioCursor',op:'eq',value:cursor};
  return {kind:'all',conditions:[base,condition]};
}
function addEcho(fallbackId:string, echo:EventTemplate, when:EventTemplate['trigger']):void {
  const cursor=raw.findIndex((item)=>item[2]===fallbackId);
  if(cursor<0)throw new Error(`Unknown echo anchor ${fallbackId}`);
  events[fallbackId]!.trigger=branchTrigger(cursor,{kind:'not',condition:when});
  events[echo.id]={...echo,trigger:branchTrigger(cursor,when)};
}

addEcho('thu_colleague_help_debt',{
  ...events.thu_colleague_help_debt!,id:'thu_colleague_reciprocity',source:'causal',
  copy:{title:'Помощь стала взаимной',situation:'Ранее вы вернули поддержку коллеге. Теперь можно опереться на согласованный рабочий ритм.',causeHint:'Ситуация появилась после возвращённой помощи коллеге.'},
  onOpenEffects:[{op:'add_state',path:'vitals.tension',delta:-4,reason:'взаимная помощь уменьшила неопределённость'}],
  actionIds:['work_standard','work_careful','walk_short'],tags:['causal','echo','social_reciprocity'],
},{kind:'capability',id:'work.reciprocal_support'});

addEcho('fri_final_issue',{
  ...events.fri_final_issue!,id:'fri_final_issue_with_support',source:'causal',
  copy:{title:'Коллега помнит о взаимной помощи',situation:'Перед сдачей нашлась ошибка, но теперь проверку можно разделить без нового одностороннего долга.',causeHint:'Ранее возвращённая помощь изменила доступную поддержку.'},
  onOpenEffects:[{op:'add_state',path:'vitals.tension',delta:-5,reason:'поддержка коллеги снизила давление перед сдачей'}],tags:['causal','heavy','echo','social_reciprocity'],
},{kind:'capability',id:'work.reciprocal_support'});

addEcho('sat_meal_prep',{
  ...events.sat_meal_prep!,id:'sat_meal_prep_familiar',source:'causal',
  copy:{title:'Подготовка еды уже знакома',situation:'Повторённая готовка сделала бытовой процесс предсказуемее, поэтому окно можно использовать иначе.',causeHint:'Навык готовки вырос после предыдущих решений.'},
  tags:['causal','echo','development'],
},{kind:'compare',path:'character.skills.cooking',op:'gte',value:37});

addEcho('sun_family_time',{
  ...events.sun_family_time!,id:'sun_family_time_reciprocal',source:'causal',
  copy:{title:'Нагрузка распределяется вместе',situation:'Надёжные семейные решения изменили разговор: партнёр предлагает разделить оставшиеся дела.',causeHint:'Доверие выросло после выполненных семейных договорённостей.'},
  onOpenEffects:[{op:'add_state',path:'vitals.tension',delta:-5,reason:'взаимная семейная поддержка снизила неопределённость'}],tags:['causal','echo','family_reciprocity'],
},{kind:'compare',path:'family.partner.trust',op:'gte',value:79});

/**
 * Бытовые ситуации (`D73`, Sprint 10). Они доступны в своём окне любого дня и
 * имеют самый низкий приоритет источника, поэтому не вытесняют авторские, а
 * подхватывают якорь, когда авторские ситуации дня уже прожиты. Каждая содержит
 * хотя бы одно стабилизирующее действие, иначе анти-спираль отбросила бы её в
 * тяжёлом состоянии и запас не сработал бы именно тогда, когда он нужнее всего.
 */
const ROUTINE_SITUATIONS:Array<{id:string;fromMin:number;toMin:number;actionIds:string[]}>=[
  {id:'routine_morning_start',fromMin:240,toMin:660,actionIds:['eat_quick_base','prepare_simple_meal','walk_short','drink_coffee_100','work_standard']},
  {id:'routine_work_stretch',fromMin:540,toMin:1080,actionIds:['prepare_simple_meal','work_standard','walk_short','ask_colleague_help']},
  {id:'routine_family_moment',fromMin:900,toMin:1380,actionIds:['prepare_simple_meal','protect_commitment','take_family_load','walk_short','rest_short','wind_down_early','work_standard']},
  {id:'routine_evening_wind',fromMin:1020,toMin:1439,actionIds:['prepare_simple_meal','wind_down_early','walk_short','rest_short','work_late']},
  // Страховочная ситуация: доступна почти всегда и держит стабилизаторы сразу
  // двух доменов, поэтому тяжёлое состояние не остаётся без платного выхода,
  // когда авторские и остальные бытовые ситуации не подходят.
  {id:'routine_pause',fromMin:300,toMin:1380,actionIds:['prepare_simple_meal','walk_short','rest_short','work_standard','wind_down_early']},
];

for(const routine of ROUTINE_SITUATIONS){
  events[routine.id]={
    schemaVersion:1,id:routine.id,version:1,source:'opportunity',
    copy:EVENT_COPY[routine.id]!,
    trigger:{kind:'all',conditions:[
      {kind:'compare',path:'clock.minuteOfDay',op:'gte',value:routine.fromMin},
      {kind:'compare',path:'clock.minuteOfDay',op:'lte',value:routine.toMin},
    ]},
    urgency:0,selectionWeight:1,cooldownDays:0,
    load:{external:0,total:0,size:'none'},
    onOpenEffects:[],actionIds:routine.actionIds,tags:['opportunity','routine'],
  };
}

/**
 * Семейные ситуации (`D21`–`D23`, Sprint 8). Они открываются собственным окном и
 * состоянием близких, а не расписанием игрока: партнёр предлагает помощь, когда
 * у него самого есть ресурс, а ребёнок появляется в своё окно.
 */
events.family_partner_offers={
  schemaVersion:1,id:'family_partner_offers',version:1,source:'causal',
  copy:EVENT_COPY.family_partner_offers!,
  trigger:{kind:'all',conditions:[
    {kind:'compare',path:'context.partnerAvailableNow',op:'gte',value:1},
    {kind:'compare',path:'context.partnerLoad',op:'lte',value:26},
    {kind:'compare',path:'family.partner.trust',op:'gte',value:70},
  ]},
  urgency:1,selectionWeight:2,cooldownDays:2,
  load:{external:0,total:8,size:'small'},
  onOpenEffects:[{op:'add_state',path:'vitals.tension',delta:-4,reason:'разделённая нагрузка снизила напряжение'}],
  actionIds:['take_family_load','protect_commitment','rest_short','wind_down_early','work_standard'],tags:['causal','family_anchor_window','family_reciprocity'],
};
events.family_child_evening={
  schemaVersion:1,id:'family_child_evening',version:1,source:'causal',
  copy:EVENT_COPY.family_child_evening!,
  trigger:{kind:'all',conditions:[
    {kind:'compare',path:'context.childAvailableNow',op:'gte',value:1},
    {kind:'compare',path:'family.child.closeness',op:'lte',value:82},
  ]},
  urgency:2,selectionWeight:2,cooldownDays:1,
  load:{external:0,total:10,size:'small'},
  onOpenEffects:[],
  actionIds:['take_family_load','protect_commitment','walk_short','work_standard'],tags:['causal','family_anchor_window'],
};

export const registries:Registries={actions,events,slots};

export function createInitialState(seed:string):GameState {
  return {
    schemaVersion:4,periods:createPeriodState(),weekStats:{weekIndex:0,actionCounts:{},previousWeekIndex:-1,previousActionCounts:{}},employment:{format:null,chosenAtStepIndex:null},campaignId:`week01:${seed}`,scenarioId:CONTRACT.scenarioId,scenarioVersion:CONTRACT.scenarioVersion,calibrationVersion:CONTRACT.calibrationVersion,priceBookVersion:CONTRACT.priceBookVersion,
    rng:{seed,algorithm:CONTRACT.rngAlgorithm,occurrences:{}},clock:{dayIndex:0,minuteOfDay:420,stepIndex:0,awakeSinceMinute:60},scenarioCursor:0,activeEventId:'mon_breakfast',
    character:{
      profile:{sleepNeedMin:480,chronotype:'neutral',caffeineHalfLifeMin:300,caffeineSensitivity:1,digestionSensitivity:1,moodBaseline:55},
      skills:{professional:52,planning:45,cooking:35,physical_fitness:45},habits:{caffeine_compensation:45,late_work:40,delivery:35,short_walk:30,meal_prep:20},
      capabilities:['kitchen.basic','work.ask_colleague_help','transport.taxi','family.partner_help'],
    },
    vitals:{energy:68,mood:61,tension:34,hunger:25,physicalFatigue:18,discomfort:0,windDown:20},
    accumulators:{sleepDebtMin:30,activeCaffeineMg:0,satietyWindowMin:0,recoveryNeed:22,familyLoadPlayer7d:18,familyLoadPartner7d:18},
    economy:{cashRub:32000,foodPortions:{ready_meal:2,quick_base:3,cook_stock:5},expectedIncome:[{id:'salary',amountRub:72000,dueDayIndex:4,status:'expected',source:'salary'},{id:'bonus',amountRub:0,dueDayIndex:4,status:'expected',source:'bonus'}],obligations:[{id:'monthly_payment',amountRub:45000,dueDayIndex:7,status:'scheduled',deferrable:true,deferralsUsed:0,maxDeferrals:1,deferCostRub:1500}]},
    work:{reputation:58,projectBacklogMin:420,helpDebt:0,tasks:[{id:'project_delivery',remainingMin:420,dueDayIndex:4,dueMinuteOfDay:1020,requiredSkill:60,baseRisk:25,status:'open'}]},
    family:{partner:{closeness:72,trust:74,available:true,load:28,windowFromMin:1020,windowToMin:1380},child:{closeness:76,trust:73,available:true,load:0,windowFromMin:960,windowToMin:1260},friction:18,participationBalance:0},
    commitments:[{id:'family_week',domain:'family',dueDayIndex:4,dueMinuteOfDay:1140,status:'open',owner:'shared',hard:true,renegotiationsUsed:0,sourceId:'initial_state'},{id:'school_event',domain:'family',dueDayIndex:5,dueMinuteOfDay:540,status:'open',owner:'player',hard:true,renegotiationsUsed:0,sourceId:'initial_state'}],
    scheduledEffects:[
      {id:'salary_effect',sourceId:'salary',trigger:{kind:'at_time',dayIndex:4,minuteOfDay:1020},effects:[{op:'receive_income',incomeId:'salary',reason:'зарплата получена'}],status:'pending'},
      {id:'bonus_effect',sourceId:'bonus',trigger:{kind:'at_time',dayIndex:4,minuteOfDay:1020},effects:[{op:'bounded_roll',value:{minDelta:0,maxDelta:4000,seedKey:'friday_bonus',targetPath:'economy.expectedIncome.1.amountRub'},reason:'размер бонуса'},{op:'receive_income',incomeId:'bonus',reason:'бонус получен'}],status:'pending'},
      {id:'payment_effect',sourceId:'monthly_payment',trigger:{kind:'at_time',dayIndex:7,minuteOfDay:540},effects:[{op:'set_obligation',obligationId:'monthly_payment',patch:{status:'paid'},reason:'обязательный платёж'},{op:'consume_resource',path:'economy.cashRub',amount:45000,reason:'списание платежа'}],status:'pending'},
    ],
    eventCooldownUntilDay:{},eventLedger:{occurrences:{mon_breakfast:1},dayExternalLoad:{'0':0},dayTotalLoad:{'0':12},dayLargeCount:{'0':0},weekLargeCount:0,consecutiveHeavy:0},
    weeklyRules:[],monthlyPriorities:[{domain:'work',level:2},{domain:'family',level:2},{domain:'recovery',level:1}],causalJournal:[],
  };
}
