import type {
  CharacterPresentation,
  CharacterPresentationIndicator,
  CharacterPresentationLevel,
  CharacterPresentationReason,
  Confidence,
  GameState,
  RuleEvidence,
  RuleEvidenceId,
} from '../types.js';

export const EVENT_COPY: Record<string, { title: string; situation: string; causeHint?: string }> = {
  // Бытовые ситуации (`D73`, Sprint 10): они не привязаны ко дню и наполняют
  // якорь тогда, когда авторские ситуации дня уже прожиты. Без этого запаса
  // свободный порядок упирается в день без единой доступной развилки.
  routine_morning_start: { title: 'Обычное утро', situation: 'День начинается без отдельного повода: нужно решить, с чего именно.' },
  routine_work_stretch: { title: 'Рабочий отрезок', situation: 'Впереди рядовой рабочий блок без внешнего давления.' },
  routine_evening_wind: { title: 'Вечер без событий', situation: 'Вечер свободен: его можно закрыть спокойно или дотянуть работу.' },
  routine_pause: { title: 'Короткая передышка', situation: 'Есть свободный промежуток: его можно потратить на работу, движение или восстановление.' },
  family_partner_offers: { title: 'Партнёр предлагает разделить', situation: 'У партнёра сегодня разгруженный вечер, и он сам предлагает взять часть дел.', causeHint: 'Ситуация появилась потому, что нагрузка партнёра низкая, а доверие держится высоким.' },
  family_child_evening: { title: 'Ребёнок ждёт внимания', situation: 'Ребёнок дома и свободен именно сейчас; позже это окно закроется.', causeHint: 'Ситуация открылась в собственном окне ребёнка при снизившейся близости.' },
  routine_family_moment: { title: 'Домашний момент', situation: 'Дома обычный вечерний ритм, и внимание можно распределить по-разному.' },
  mon_breakfast: { title: 'Начало недели', situation: 'Утро уже началось, а завтрак и первый рабочий блок конкурируют за время.' },
  mon_commute: { title: 'Дорога к первому делу', situation: 'До начала работы нужно выбрать между временем в пути и расходами.' },
  mon_scope_expansion: { title: 'Проект стал больше', situation: 'В задачу добавили новые требования, но срок остался прежним.' },
  mon_lunch_window: { title: 'Окно на обед', situation: 'Работа идёт плотнее плана, а пауза быстро сокращается.' },
  mon_project_block: { title: 'Основной рабочий блок', situation: 'Можно ускориться, вложиться в качество или разделить нагрузку.' },
  mon_family_dinner: { title: 'Вечерняя договорённость', situation: 'Семейный ужин начинается в то же время, когда работа требует продолжения.' },
  tue_night_wakeup: { title: 'Ночная нагрузка', situation: 'Ночью ребёнку понадобилась помощь, и утро началось раньше обычного.' },
  tue_recovery_breakfast: { title: 'Утро после короткого сна', situation: 'Нужно восстановить силы и не потерять темп перед рабочим днём.' },
  tue_review_prep: { title: 'Подготовка к просмотру', situation: 'До проверки проекта осталось немного времени, а часть работы не закрыта.' },
  tue_review_result: { title: 'Результат проверки', situation: 'Проверка выявила вопросы, которые нужно разобрать без потери всего дня.' },
  tue_pickup_conflict: { title: 'Кто заберёт ребёнка', situation: 'Семейная задача совпала с рабочим обязательством.' },
  tue_evening_pressure: { title: 'Насыщенный вечер', situation: 'После плотного дня остаются быт, восстановление и незакрытая работа.' },
  wed_commute_delay: { title: 'Задержка в дороге', situation: 'Внешняя задержка сдвинула начало дня и усилила давление на расписание.' },
  wed_long_meeting: { title: 'Встреча затянулась', situation: 'Длинная встреча заняла время, запланированное на работу и паузу.' },
  wed_late_lunch: { title: 'Поздний обед', situation: 'Перерыв снова сдвинулся, а до следующей задачи осталось мало времени.' },
  wed_school_call: { title: 'Звонок из школы', situation: 'Нужно быстро решить семейный вопрос в середине рабочего дня.' },
  wed_work_recovery: { title: 'Вернуться в рабочий ритм', situation: 'После неожиданного перерыва нужно заново собрать оставшуюся часть дня.' },
  wed_evening_stabilize: { title: 'Стабилизировать вечер', situation: 'День был напряжённым; следующий выбор повлияет на сон и завтрашний запас сил.' },
  thu_hybrid_start: { title: 'Гибкое начало дня', situation: 'Свободное окно можно направить на работу, движение или бытовой запас.' },
  thu_colleague_help_debt: { title: 'Ответить на помощь', situation: 'Коллега помог раньше, и теперь нужно решить, когда вернуть поддержку.' },
  thu_extra_project: { title: 'Дополнительный проект', situation: 'Появилась новая возможность, но она увеличит нагрузку текущей недели.' },
  thu_movement_plan: { title: 'Запланированное движение', situation: 'В календаре есть тренировка, а рабочие задачи ещё не завершены.' },
  thu_family_evening: { title: 'Семейный вечер', situation: 'Время с близкими снова пересекается с рабочим давлением.' },
  fri_deadline_plan: { title: 'План на день сдачи', situation: 'До отправки проекта нужно распределить внимание между скоростью и устойчивостью.' },
  fri_final_issue: { title: 'Последняя проблема', situation: 'Перед сдачей обнаружена ошибка, которую нельзя просто игнорировать.' },
  fri_lunch: { title: 'Пауза перед финишем', situation: 'До отправки осталось несколько часов, и решение о паузе повлияет на концентрацию.' },
  fri_submit: { title: 'Отправка проекта', situation: 'Наступил момент сдачи: важно выбрать реалистичный способ завершить работу.' },
  fri_after_submit: { title: 'После отправки', situation: 'Главная задача закрыта, и освободившееся время можно распределить по-разному.' },
  fri_family_plan: { title: 'Планы на вечер', situation: 'После рабочей недели нужно подтвердить или пересобрать семейную договорённость.' },
  sat_school_event: { title: 'Школьное событие', situation: 'Важное семейное событие требует времени и точного решения по дороге.' },
  sat_household_stock: { title: 'Домашние запасы', situation: 'Продукты заканчиваются, и выбор сейчас повлияет на следующие дни.' },
  sat_meal_prep: { title: 'Запас еды', situation: 'Есть окно, чтобы подготовить еду заранее, перекусить или восстановиться.' },
  sat_social_invite: { title: 'Встреча с друзьями', situation: 'Появилось приглашение, которое нужно совместить с уже данными обещаниями.' },
  sat_evening_close: { title: 'Завершение субботы', situation: 'Вечер можно использовать для восстановления, движения или работы.' },
  sun_recovery_start: { title: 'Спокойное начало дня', situation: 'Последний день недели начинается с выбора темпа и способа восстановиться.' },
  sun_family_time: { title: 'Время с семьёй', situation: 'Совместное время нужно распределить так, чтобы нагрузка не легла на одного.' },
  sun_week_preparation: { title: 'Подготовка новой недели', situation: 'Можно заранее уменьшить бытовую или рабочую нагрузку следующих дней.' },
  sun_early_finish: { title: 'Закрыть неделю', situation: 'Последнее решение определит, с каким запасом сил начнётся понедельник.' },
};

export const ACTION_CONTEXT_COPY: Record<string, Record<string, { label: string; summary: string }>> = {
  eat_ready_meal: {
    mon_breakfast: { label: 'Съесть заранее приготовленный завтрак', summary: 'Разогреть готовую порцию: утром готовить не нужно.' },
  },
  cook_meal_batch: {
    mon_breakfast: { label: 'Приготовить завтрак', summary: 'Приготовить еду сейчас и оставить две готовые порции на следующие приёмы.' },
  },
};

const evidence = (
  id: RuleEvidenceId,
  confidence: Confidence,
  sourceLabel: string,
  transferLimit: string,
): RuleEvidence => ({ id, confidence, sourceLabel, transferLimit });

export const RULE_EVIDENCE: Record<RuleEvidenceId, RuleEvidence> = {
  re_action_effect_contract: evidence('re_action_effect_contract', 'plausible_model', 'Правила вымышленной кампании', 'Это игровой эффект, а не прогноз реакции конкретного человека.'),
  re_sleep_task_effort: evidence('re_sleep_task_effort', 'plausible_model', 'Модель состояния и рабочей нагрузки', 'Направление опирается на общую закономерность; точные числа и пороги относятся только к игре.'),
  re_sleep_movement_effort: evidence('re_sleep_movement_effort', 'plausible_model', 'Модель восстановления и нагрузки', 'Игра меняет цену варианта, но не объявляет нагрузку правильной или запрещённой.'),
  re_movement_affect_response: evidence('re_movement_affect_response', 'plausible_model', 'Модель движения и состояния', 'Эффект относится к вымышленной кампании и не гарантирует одинаковую реакцию человека.'),
  re_caffeine_timing_sleep: evidence('re_caffeine_timing_sleep', 'plausible_model', 'Модель времени и активного кофеина', 'Реальная реакция различается; игра не задаёт универсальный безопасный час или дозу.'),
  re_multifactor_task_geometry: evidence('re_multifactor_task_geometry', 'plausible_model', 'Многофакторная модель решения', 'Вес и пороги факторов — игровая калибровка, а не научная оценка человека.'),
  re_habit_skill_future_geometry: evidence('re_habit_skill_future_geometry', 'plausible_model', 'Правило развития вымышленного персонажа', 'Изменение относится только к этой кампании и не описывает личную черту игрока.'),
  re_family_load_support: evidence('re_family_load_support', 'plausible_model', 'Контракт вымышленной семьи', 'Сценарий не задаёт универсальную семейную норму и не оценивает реальные отношения.'),
  re_financial_pressure_choice: evidence('re_financial_pressure_choice', 'plausible_model', 'Экономика вымышленной кампании', 'Это игровая доступность и компромисс, а не финансовая рекомендация.'),
  re_planning_capacity_tradeoff: evidence('re_planning_capacity_tradeoff', 'plausible_model', 'Недельный контракт кампании', 'Два окна и распределение 2+1 — игровые ограничения, а не норма планирования.'),
};

export const ACTION_EVIDENCE: Record<string, RuleEvidenceId> = {
  eat_ready_meal: 're_action_effect_contract', eat_quick_base: 're_action_effect_contract', cook_meal_batch: 're_habit_skill_future_geometry', order_food: 're_financial_pressure_choice', drink_coffee_100: 're_caffeine_timing_sleep',
  walk_short: 're_movement_affect_response', train_light: 're_movement_affect_response', train_planned: 're_movement_affect_response', work_standard: 're_multifactor_task_geometry', work_fast: 're_multifactor_task_geometry', work_careful: 're_multifactor_task_geometry',
  ask_colleague_help: 're_habit_skill_future_geometry', renegotiate_work: 're_multifactor_task_geometry', work_late: 're_sleep_task_effort', ask_partner_help: 're_family_load_support', take_family_load: 're_family_load_support', protect_commitment: 're_family_load_support',
  wind_down_early: 're_sleep_task_effort', commute_transit: 're_action_effect_contract', buy_time_taxi: 're_financial_pressure_choice', accept_scope: 're_multifactor_task_geometry', decline_extra_project: 're_multifactor_task_geometry', accept_extra_project: 're_financial_pressure_choice',
  repay_colleague_help: 're_habit_skill_future_geometry', shop_food: 're_financial_pressure_choice', meet_friends_short: 're_action_effect_contract', decline_social: 're_action_effect_contract', plan_next_week: 're_planning_capacity_tradeoff', buy_time_and_pickup: 're_financial_pressure_choice', postpone_shopping: 're_financial_pressure_choice', attend_school_event_by_taxi: 're_financial_pressure_choice',
};

export function getRuleEvidence(id: RuleEvidenceId): RuleEvidence {
  return RULE_EVIDENCE[id];
}

export function unavailableMessage(code: string): string {
  if (code === 'insufficient_cash') return 'Недостаточно денег для этого варианта.';
  if (code === 'insufficient_ready_meal') return 'Нет заранее приготовленной порции.';
  if (code === 'insufficient_quick_base') return 'Нет быстрого базового запаса.';
  if (code === 'insufficient_cook_stock') return 'Не хватает продуктов для готовки.';
  if (code.startsWith('requirement:inventory')) return 'Не хватает нужного домашнего запаса.';
  if (code.startsWith('requirement:capability')) return 'Эта возможность ещё не открыта.';
  if (code.startsWith('requirement:')) return 'Текущее состояние не позволяет выбрать этот вариант.';
  return 'Этот вариант сейчас недоступен из-за указанного контекста.';
}

export function getCharacterPresentationLevel(value: number): CharacterPresentationLevel {
  return value >= 67 ? 'high' : value >= 38 ? 'moderate' : 'low';
}

function dayPhase(minuteOfDay: number): CharacterPresentation['frame']['dayPhase'] {
  if (minuteOfDay < 300 || minuteOfDay >= 1320) return 'night';
  if (minuteOfDay < 720) return 'morning';
  if (minuteOfDay < 1080) return 'day';
  return 'evening';
}

function indicator(
  id: CharacterPresentationIndicator['id'],
  value: number,
  label: string,
  labels: Record<CharacterPresentationLevel, string>,
  warning: (level: CharacterPresentationLevel) => boolean,
): CharacterPresentationIndicator {
  const level = getCharacterPresentationLevel(value);
  return { id, label, level, value: labels[level], tone: warning(level) ? 'warning' : id === 'energy' ? 'calm' : 'neutral' };
}

export function getCharacterPresentation(state: GameState): CharacterPresentation {
  const energy = indicator('energy', state.vitals.energy, 'Энергия', { low: 'низкая', moderate: 'умеренная', high: 'высокая' }, (level) => level === 'low');
  const mood = indicator('mood', state.vitals.mood, 'Настроение', { low: 'низкое', moderate: 'умеренное', high: 'высокое' }, () => false);
  const tension = indicator('tension', state.vitals.tension, 'Напряжение', { low: 'низкое', moderate: 'умеренное', high: 'высокое' }, (level) => level === 'high');
  const reasons: CharacterPresentationReason[] = [];
  if (state.accumulators.sleepDebtMin >= 180) reasons.push({ id: 'sleep_debt', label: 'Дефицит сна', summary: 'Короткий сон поддерживает потребность в восстановлении.' });
  if (state.vitals.hunger >= 67) reasons.push({ id: 'hunger', label: 'Нужна еда', summary: 'Голод уже влияет на запас сил и следующие решения.' });
  if (state.accumulators.recoveryNeed >= 67) reasons.push({ id: 'recovery_need', label: 'Нужно восстановление', summary: 'Накопленная нагрузка требует отдельного окна восстановления.' });
  if (state.accumulators.activeCaffeineMg >= 80) reasons.push({ id: 'caffeine', label: 'Кофеин действует', summary: 'Кофеин временно поддерживает бодрость и влияет на готовность ко сну.' });
  if (state.family.friction >= 67) reasons.push({ id: 'family_load', label: 'Семейная нагрузка', summary: 'Незакрытая семейная нагрузка поддерживает текущее напряжение.' });
  const visibleReasons = reasons.slice(0, 2);
  const summary = `Энергия ${energy.value}, настроение ${mood.value}, напряжение ${tension.value}.`;
  return {
    frame: {
      pose: energy.level === 'low' ? 'depleted' : state.accumulators.recoveryNeed >= 67 || state.vitals.physicalFatigue >= 67 ? 'recovering' : 'steady',
      expression: mood.level === 'high' ? 'bright' : mood.level === 'low' ? 'subdued' : 'neutral',
      load: tension.level === 'high' ? 'pressured' : 'calm',
      dayPhase: dayPhase(state.clock.minuteOfDay),
    },
    indicators: [energy, mood, tension],
    reasons: visibleReasons,
    summary,
    ariaSummary: visibleReasons[0] ? `${summary} Учтено: ${visibleReasons[0].summary}` : summary,
  };
}
