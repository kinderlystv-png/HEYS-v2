// quizModel.ts — вопросы, сегменты и логика короткого разбора перед заявкой.
//
// Источник — `маркетинг/17` §§ 3.1–3.3: те же вопросы, те же коды сегментов и
// те же поля карточки лида, что у бота HEYS Старт. Расхождение здесь означало
// бы, что человек, прошедший разбор на сайте и в боте, получает разные типы
// срыва и разные тексты, — а куратор получает два несовместимых сегмента.
//
// Модель намеренно отделена от разметки и не знает про версию страницы: она
// переезжает на любую версию лендинга без изменений.

export type TriggerCode = 'stress' | 'fatigue' | 'social' | 'all_or_nothing' | 'unknown';
export type WhenCode = 'morning' | 'day' | 'evening' | 'night' | 'varies';
export type SegmentCode =
  | 'emotional'
  | 'fatigue'
  | 'social'
  | 'all_or_nothing'
  | 'evening'
  | 'mixed';

export interface Choice<T extends string> {
  code: T;
  label: string;
}

/** Q2 из `17` § 3.1 — основной вопрос, он определяет тип срыва. */
export const TRIGGER_CHOICES: ReadonlyArray<Choice<TriggerCode>> = [
  { code: 'stress', label: 'Стресс или эмоции' },
  { code: 'fatigue', label: 'Усталость или недосып' },
  { code: 'social', label: 'Компания, кафе, праздник' },
  { code: 'all_or_nothing', label: 'Один промах — и режим уже не важен' },
  { code: 'unknown', label: 'Не понимаю' },
];

/** Q1 — спрашивается только когда Q2 = «Не понимаю». */
export const WHEN_CHOICES: ReadonlyArray<Choice<WhenCode>> = [
  { code: 'morning', label: 'Утром' },
  { code: 'day', label: 'Днём' },
  { code: 'evening', label: 'Вечером' },
  { code: 'night', label: 'Ночью' },
  { code: 'varies', label: 'По-разному' },
];

/** Q3, Q5, Q6 — не меняют тип, идут в карточку лида для куратора. */
export const FREQUENCY_CHOICES: ReadonlyArray<Choice<string>> = [
  { code: 'daily', label: 'Почти каждый день' },
  { code: 'weekly', label: 'Несколько раз в неделю' },
  { code: 'weekends', label: 'В основном по выходным' },
  { code: 'rare_strong', label: 'Редко, но сильно' },
];

export const BARRIER_CHOICES: ReadonlyArray<Choice<string>> = [
  { code: 'routine', label: 'Вести рутину' },
  { code: 'no_support', label: 'Оставаться без поддержки' },
  { code: 'no_time', label: 'Найти время' },
  { code: 'know_not_do', label: 'Знаю, что делать, но не удерживаю' },
];

export const GOAL_CHOICES: ReadonlyArray<Choice<string>> = [
  { code: 'lose', label: 'Снизить вес' },
  { code: 'keep', label: 'Удержать результат' },
  { code: 'understand', label: 'Разобраться в питании' },
  { code: 'fewer_breaks', label: 'Снизить количество срывов' },
];

/**
 * Тип срыва по `17` § 3.2: определяется по Q2, уточняется по Q1 только когда
 * человек сам не понимает причину.
 */
export function resolveSegment(trigger: TriggerCode, when: WhenCode | null): SegmentCode {
  switch (trigger) {
    case 'stress':
      return 'emotional';
    case 'fatigue':
      return 'fatigue';
    case 'social':
      return 'social';
    case 'all_or_nothing':
      return 'all_or_nothing';
    case 'unknown':
      return when === 'evening' || when === 'night' ? 'evening' : 'mixed';
  }
}

export interface SegmentResult {
  title: string;
  /** Почему так происходит — без обвинений и без обещаний по весу. */
  explanation: string;
  /** Один выполнимый шаг, который человек может сделать сам уже сегодня. */
  firstStep: string;
  /** Что в этом случае делает куратор — механика как доказательство вникания. */
  curator: string;
}

// Тексты — из `17` § 3.3, адаптированы под тон лендинга: без эмодзи в
// заголовках и без «мы не ругаем», которое звучит как обещание поведения.
export const SEGMENTS: Record<SegmentCode, SegmentResult> = {
  evening: {
    title: 'Вечерний срыв',
    explanation:
      'К вечеру копится усталость и дневной недобор — организм требует быстрого топлива. Это биология, а не распущенность.',
    firstStep:
      'Не урезайте день в ноль: ровный завтрак и полноценный обед заметно снижают вечерние набеги на холодильник.',
    curator:
      'Куратор видит ваш день целиком и замечает, где он начинает сбиваться, — и спрашивает об этом до того, как что-то предлагать.',
  },
  emotional: {
    title: 'Эмоциональный срыв',
    explanation:
      'Еда работает как быстрый способ снять напряжение. Дело не в еде, а в моменте, когда накрывает.',
    firstStep:
      'За пять минут до «захвата» — пауза и стакан воды. Часто волна спадает, и решение принимаете уже вы, а не состояние.',
    curator:
      'Куратор держит ваш контекст и помогает разобрать, что стало триггером, — без оценок и без разговора про силу воли.',
  },
  social: {
    title: 'Социальный срыв',
    explanation:
      'Срыв запускает среда: компания, кафе, праздник. Сила воли тут почти ни при чём — решает подготовка.',
    firstStep: 'Выбирайте блюдо заранее, до того как сядете за стол и начнётся общий заказ.',
    curator:
      'Куратор готовит вас к кафе и поездкам заранее — это часть ежедневного ведения, а не отдельная услуга.',
  },
  all_or_nothing: {
    title: 'Всё или ничего',
    explanation:
      'Один промах — и «неделя насмарку». На деле один приём пищи почти ничего не решает: решает то, что происходит наутро.',
    firstStep:
      'Не «начинать с понедельника»: возвращайтесь в режим со следующего приёма пищи, а не со следующей недели.',
    curator:
      'После сбоя куратор помогает вернуться в ритм с самого простого шага и не требует отчётов задним числом.',
  },
  fatigue: {
    title: 'Усталость и недосып',
    explanation:
      'Недосып и перегруз бьют по гормонам голода — тянет на быстрые углеводы. Это физиология сна и стресса, а не лень.',
    firstStep: 'Сон и вода часто важнее «правильного» ужина — начните с них.',
    curator:
      'Куратор смотрит не только на еду, но и на сон, нагрузку и график — и показывает, где в вашей неделе реальный рычаг.',
  },
  mixed: {
    title: 'Смешанный сценарий',
    explanation:
      'Похоже, срыв запускает не один фактор, а сочетание режима, усталости и обстоятельств. Искать «главную слабость» тут бесполезно.',
    firstStep:
      'Начните с одного наблюдения: когда появляется первый сигнал, что режим сейчас сорвётся.',
    curator:
      'Куратор собирает питание, режим и контекст в одну картину и помогает найти самый простой первый рычаг.',
  },
};

export interface QuizAnswers {
  trigger: TriggerCode | null;
  when: WhenCode | null;
  frequency: string | null;
  barrier: string | null;
  goal: string | null;
}

export const EMPTY_ANSWERS: QuizAnswers = {
  trigger: null,
  when: null,
  frequency: null,
  barrier: null,
  goal: null,
};

/**
 * Короткая человеческая сводка ответов — её показывают перед формой («куратор
 * увидит: …»), чтобы человек понимал, что именно уходит вместе с контактом.
 */
export function describeAnswers(answers: QuizAnswers): string[] {
  const parts: string[] = [];
  const label = <T extends string>(list: ReadonlyArray<Choice<T>>, code: string | null) =>
    list.find((item) => item.code === code)?.label;

  const segment = answers.trigger ? resolveSegment(answers.trigger, answers.when) : null;
  if (segment) parts.push(SEGMENTS[segment].title);

  const frequency = label(FREQUENCY_CHOICES, answers.frequency);
  if (frequency) parts.push(`повторяется: ${frequency.toLowerCase()}`);

  const barrier = label(BARRIER_CHOICES, answers.barrier);
  if (barrier) parts.push(`сложнее всего: ${barrier.toLowerCase()}`);

  const goal = label(GOAL_CHOICES, answers.goal);
  if (goal) parts.push(`цель: ${goal.toLowerCase()}`);

  return parts;
}
