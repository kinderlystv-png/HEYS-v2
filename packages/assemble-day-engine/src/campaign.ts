import { createInitialState } from './content/scenario.js';
import { computeDecisionContext } from './reducer.js';
import type { CampaignOutcome, CampaignOutcomeAxis, CharacterDevelopmentItem, GameState } from './types.js';

function signed(value:number):string { return `${value>0?'+':''}${Math.round(value)}`; }

export function getCharacterDevelopment(state:GameState):CharacterDevelopmentItem[] {
  const initial=createInitialState(state.rng.seed),items:CharacterDevelopmentItem[]=[];
  for(const key of Object.keys(state.character.skills) as Array<keyof GameState['character']['skills']>){const delta=state.character.skills[key]-initial.character.skills[key];if(delta)items.push({id:`skill:${key}`,title:{professional:'Рабочий навык',planning:'Планирование',cooking:'Готовка',physical_fitness:'Физическая форма'}[key],direction:delta>0?'improved':'weakened',summary:`${signed(delta)} за решения этой недели`,evidencePaths:[`character.skills.${key}`]});}
  for(const key of Object.keys(state.character.habits) as Array<keyof GameState['character']['habits']>){const delta=state.character.habits[key]-initial.character.habits[key];if(delta)items.push({id:`habit:${key}`,title:{caffeine_compensation:'Компенсация кофеином',late_work:'Поздняя работа',delivery:'Доставка еды',short_walk:'Короткие прогулки',meal_prep:'Подготовка еды'}[key],direction:delta>0?'improved':'weakened',summary:`Изменение привычки: ${signed(delta)}`,evidencePaths:[`character.habits.${key}`]});}
  for(const capability of state.character.capabilities.filter((id)=>!initial.character.capabilities.includes(id)))items.push({id:`capability:${capability}`,title:capability==='kitchen.batch_prep_familiar'?'Освоена готовка на несколько приёмов':capability==='work.reciprocal_support'?'Открыта взаимная помощь с коллегой':capability,direction:'gained',summary:'Новая возможность меняет последующие развилки.',evidencePaths:['character.capabilities']});
  return items;
}

export function getCampaignOutcome(state:GameState):CampaignOutcome {
  const initial=createInitialState(state.rng.seed),context=computeDecisionContext(state),task=state.work.tasks.find((item)=>item.id==='project_delivery');
  const familyResolved=state.commitments.filter((item)=>item.domain==='family'&&item.status==='resolved').length;
  const familyBroken=state.commitments.filter((item)=>item.domain==='family'&&item.status==='broken').length;
  const trustDelta=state.family.partner.trust-initial.family.partner.trust;
  const axes:CampaignOutcomeAxis[]=[
    {id:'work',title:'Проект',direction:task?.status==='done'?'kept':(task?.remainingMin??999)<initial.work.projectBacklogMin/2?'traded':'strained',summary:task?.status==='done'?'Проект завершён.':`Осталось ${task?.remainingMin??state.work.projectBacklogMin} мин работы.`,evidencePaths:['work.tasks.project_delivery.status','work.projectBacklogMin']},
    {id:'family',title:'Договорённости',direction:familyBroken===0&&trustDelta>=0?'kept':familyBroken<=1?'traded':'strained',summary:`Выполнено: ${familyResolved}; нарушено: ${familyBroken}; доверие ${signed(trustDelta)}.`,evidencePaths:['commitments','family.partner.trust','family.friction']},
    {id:'finance',title:'Финансовый запас',direction:context.cashAfterNextObligationsRub>=0?'kept':state.economy.cashRub>0?'traded':'strained',summary:`Сейчас ${state.economy.cashRub.toLocaleString('ru-RU')} ₽; после ближайших платежей ${context.cashAfterNextObligationsRub.toLocaleString('ru-RU')} ₽.`,evidencePaths:['economy.cashRub','context.cashAfterNextObligationsRub']},
    {id:'recovery',title:'Восстановление',direction:state.vitals.energy>=45&&state.vitals.tension<60?'kept':state.vitals.energy>=25&&state.vitals.tension<80?'traded':'strained',summary:`Энергия ${Math.round(state.vitals.energy)}, напряжение ${Math.round(state.vitals.tension)}, долг сна ${Math.round(state.accumulators.sleepDebtMin)} мин.`,evidencePaths:['vitals.energy','vitals.tension','accumulators.sleepDebtMin']},
  ];
  const openThreads=[...(task?.status!=='done'?[`Проект: осталось ${task?.remainingMin??state.work.projectBacklogMin} мин.`]:[]),...state.commitments.filter((item)=>item.status==='open'||item.status==='renegotiated').map((item)=>`Договорённость ${item.id} остаётся открытой.`)];
  return {axes,development:getCharacterDevelopment(state),openThreads};
}

export function compareCampaignOutcomes(previous:CampaignOutcome,current:CampaignOutcome){
  return current.axes.map((axis)=>{const before=previous.axes.find((item)=>item.id===axis.id)!;return {id:axis.id,title:axis.title,before:before.direction,after:axis.direction,changed:before.direction!==axis.direction||before.summary!==axis.summary,summary:axis.summary};});
}
