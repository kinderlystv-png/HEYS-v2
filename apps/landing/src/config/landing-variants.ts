// landing-variants.ts — конфиг основного лендинга
// A: premium (минимализм, делегирование) — единственный активный вариант
// Варианты B/C/D удалены — не использовались в production

export type LandingVariant = 'A'

export type LandingSectionId =
  | 'socialProof'
  | 'delegate'
  | 'interaction'
  | 'formats'
  | 'problem'
  | 'solution'
  | 'howItWorks'
  | 'layers'
  | 'screens'
  | 'matrix'
  | 'cases'
  | 'doDont'
  | 'method'
  | 'sla'
  | 'security'
  | 'pricing'
  | 'trial'
  | 'purchase'
  | 'faq'
  | 'footer'

export interface NavLink {
  id: string
  label: string
  href: string
}

export interface VariantContent {
  id: LandingVariant
  name: string
  description: string
  hero: {
    headline: string
    subheadline: string
    features?: string[] // H3 — пункты под subheadline
    ctaPrimary: string
    ctaSecondary: string
    frictionNote?: string // Снижение трения рядом с CTA
    microtext: string
    microtextLine2?: string // Вторая строка microtext
  }
  nav: {
    links: NavLink[]
  }
  page: {
    order: LandingSectionId[]
  }
  socialProof: {
    eyebrow?: string
    title: string
    quotes: string[]
  }
  delegate: {
    eyebrow?: string
    title: string
    cards: { title: string; desc: string; icon: string }[]
  }
  interaction: {
    eyebrow?: string
    title: string
    steps: { title: string; desc: string; icon: string }[]
    note?: string
  }
  formats: {
    eyebrow?: string
    title: string
    cards: { title: string; desc: string; points: string[]; highlight?: boolean }[]
  }
  layers: {
    eyebrow?: string
    title: string
    items: { title: string; desc: string; icon: string }[]
  }
  screens: {
    eyebrow?: string
    title: string
    subtitle?: string
    items: { title: string; benefit: string }[]
  }
  matrix: {
    eyebrow?: string
    title: string
    subtitle?: string
    rows: {
      label: string
      base: string
      pro: string
      proPlus: string
    }[]
  }
  cases: {
    eyebrow?: string
    title: string
    items: { before: string; after: string }[]
  }
  doDont: {
    eyebrow?: string
    title: string
    do: string[]
    dont: string[]
  }
  method: {
    eyebrow?: string
    title: string
    steps: { title: string; desc: string }[]
  }
  sla: {
    eyebrow?: string
    title: string
    items: { label: string; value: string }[]
    protocol: { icon: string; label: string; desc: string }[]
    note?: string
  }
  security: {
    eyebrow?: string
    title: string
    bullets: string[]
    links: { label: string; href: string }[]
  }
  faq: {
    eyebrow?: string
    title: string
    subtitle?: string
    items: { q: string; a: string }[]
  }
  trial: {
    badge: string
    title: string
    subtitle: string
    bullets: { icon: string; text: string }[]
    limitation: string
    startPoint: string
    ctaAvailable: string
    ctaQueue: string
    purchaseLinkText: string
    purchaseLinkCta: string
  }
  pricing: {
    intro: string
    formatSelf: { title: string; desc: string }
    formatConcierge: { title: string; desc: string }
  }
}

const SHARED_QUOTES = [
  '«Наконец-то перестал(а) жить в таблицах — стало проще, но системнее.»',
  '«После срыва не бросаю — пишу, разбираем и продолжаю.»',
  '«Когда день пошёл не по плану — есть кто-то рядом, кто держит курс.»',
  '«Сняли рутину с дневника. Я просто отмечаю, остальное — процесс.»',
  '«Чек-ин раз в неделю — как якорь. Без него всё разваливалось.»',
]

const SHARED_SCREEN_ITEMS = [
  { title: 'Дневник дня', benefit: 'Понимаете “где вы сейчас” за 5 секунд.' },
  { title: 'Неделя в одном экране', benefit: 'Тренды и ключевые выводы без перегруза.' },
  { title: 'Привычки', benefit: 'Фокус на 1–2 действиях, которые реально двигают.' },
  { title: 'Динамика', benefit: 'Видите причинно‑следственные связи, а не шум.' },
  { title: 'Чек‑ин', benefit: 'Регулярный контроль и план на следующую неделю.' },
]

export const VARIANTS: Record<LandingVariant, VariantContent> = {
  // Вариант A — "Премиальный минимализм" (близкий к текущему вайбу)
  A: {
    id: 'A',
    name: 'Premium',
    description: 'Премиальный минимализм',
    hero: {
      headline: 'Верните контроль над своим состоянием. Без диет и насилия над собой.',
      subheadline: 'Куратор ведёт ваш дневник по присланным данным, разбирает причины и пишет первым, когда видит, что что-то идёт не так. Вы не один на один с задачей.',
      features: [],
      ctaPrimary: 'Попробовать бесплатно — 7 дней',
      ctaSecondary: '',
      microtext: 'Без карты · Без автосписаний · Не медицинская услуга',
    },
    nav: {
      links: [
        { id: 'pain', label: 'знакомо?', href: '#pain' },
        { id: 'how', label: 'как работает', href: '#how-it-works' },
        { id: 'navigator', label: 'под капотом', href: '#navigator' },
        { id: 'trust', label: 'фундамент', href: '#trust' },
        { id: 'pricing', label: 'тарифы', href: '#pricing' },
        { id: 'faq', label: 'вопросы (faq)', href: '#objections' },
        { id: 'trial', label: 'неделя старта (0 ₽)', href: '#trial' },
      ],
    },
    page: {
      // A: премиальная подача — эмоции/делегирование/сервис. Меньше “таблиц”, больше ощущений.
      order: [
        'formats',
        'pricing',
        'trial',
        'faq',
        'footer',
      ],
    },
    socialProof: {
      eyebrow: 'Отзывы',
      title: 'Люди приходят за простотой. Остаются за системностью.',
      quotes: SHARED_QUOTES,
    },
    delegate: {
      eyebrow: 'Что вы делегируете',
      title: 'Что HEYS берёт на себя',
      cards: [
        {
          icon: '🧾',
          title: 'Рутину дневника',
          desc: 'Куратор переносит вашу еду в дневник: вы шлёте фото с весов или сообщение «съел 150г творога», он аккуратно вносит всё в приложение. Никаких таблиц и подсчётов с вашей стороны.',
        },
        {
          icon: '🧭',
          title: 'Контроль курса',
          desc: 'Раз в неделю — сверка и корректировка, чтобы «не сойти с рельс» незаметно.',
        },
        {
          icon: '🧘',
          title: 'Спокойная системность',
          desc: 'Не “идеальная дисциплина”, а спокойный режим, который держится.',
        }, {
          icon: '💬',
          title: 'Куратор на связи',
          desc: 'Доступен через удобный вам мессенджер в рабочее время. Обычная переписка, не «обращение в поддержку».',
        },],
    },
    interaction: {
      eyebrow: 'Как работает',
      title: 'Всё начинается с простых отметок',
      steps: [
        {
          icon: '📸',
          title: 'Отметили просто',
          desc: 'Фото еды / короткие сообщения / привычки — без таблиц и микроменеджмента.',
        },
        {
          icon: '👤',
          title: 'Куратор собрал и дал фидбек',
          desc: 'Дневник оформляется и становится понятным: где вы сейчас и что важно сегодня.',
        },
        {
          icon: '✅',
          title: 'Чек‑ин и план',
          desc: 'Раз в неделю — выводы и план, чтобы движение было стабильным.',
        },
      ],
      note: 'HEYS — не медицинская услуга. Мы работаем с режимом, привычками и сопровождением.',
    },
    formats: {
      eyebrow: 'Форматы',
      title: 'Выберите, как вам комфортнее',
      cards: [
        {
          title: 'Self — самостоятельный режим',
          desc: 'Дневник вы ведёте сами в приложении: КБЖУ, динамика, виджеты, своя база продуктов. Куратора в этом формате нет.',
          points: ['Подходит, если вы привыкли вести трекеры сами', 'Нужен только дневник и базовый контроль'],
        },
        {
          title: 'Pro / Pro+ — полная поддержка',
          desc: 'Куратор ведёт ваш дневник, подхватывает при стрессе и держит ритм недели вместе с вами. В Pro+ дополнительно — сопровождение тренировок как у личного тренера.',
          points: [
            'Подходит, если вы устали срываться и бросать',
            'Нужна ежедневная забота и снижение рутины',
            'В Pro+ — куратор сопровождает тренировки',
          ],
          highlight: true,
        },
      ],
    },
    layers: {
      title: 'Что внутри',
      items: [],
    },
    screens: {
      title: 'Как это выглядит в приложении',
      subtitle: 'Пара “редакционных” экранов — чтобы понять вайб без перегруза.',
      items: SHARED_SCREEN_ITEMS,
    },
    matrix: {
      title: 'Сравнение тарифов',
      rows: [],
    },
    cases: {
      title: 'Короткие кейсы',
      items: [],
    },
    doDont: {
      title: 'Чёткие рамки',
      do: [],
      dont: [],
    },
    method: {
      title: 'Метод',
      steps: [],
    },
    sla: {
      title: 'Регламент',
      items: [],
      protocol: [],
    },
    security: {
      title: 'Безопасность данных',
      bullets: [],
      links: [],
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Коротко о важном',
      items: [
        {
          q: 'Как работает бесплатный период (7 дней)?',
          a: 'Вы получаете 7 дней в полноценном тарифе Pro: куратор проведёт стартовую настройку, начнёт разбирать рацион и составит план. Привязывать карту не нужно (0 ₽), скрытых автосписаний нет.',
        },
        {
          q: 'Чем HEYS отличается от приложений-трекеров?',
          a: 'Обычный трекер показывает цифры, но не помогает удержать режим в сложные дни.\n\nВ HEYS на тарифах с сопровождением куратор разбирает присланные фото еды, вносит данные, видит отклонения от плана и помогает вовремя скорректировать день. Приложение даёт измеримость, куратор — регулярную поддержку.\n\nЦена на сайте — окончательная: без скидок с таймером, обязательных созвонов и автосписаний.',
        },
        {
          q: 'Мне придется считать калории и взвешивать еду?',
          a: 'Никаких подсчётов калорий от вас не потребуется — математику, рутину и аналитику куратор берёт на себя. Вам нужно только прислать фото еды на весах (граммовки помогают точно рассчитать метаболизм).\n\nЭто занимает 5 секунд: поставили тарелку на весы → сделали фото → отправили куратору. Никаких таблиц и подсчётов.',
        },
        {
          q: 'Где проходит общение и ведение дневника?',
          a: 'Общение с куратором — в привычном мессенджере: WhatsApp, Telegram или MAX. А ваш дневник живёт в веб-приложении (PWA): работает прямо в браузере телефона, не требует скачиваний. Куратор вносит данные, вы видите графики и аналитику.',
        },
        {
          q: 'Обязательно ли брать куратора на каждый день?',
          a: 'Не обязательно — у нас три варианта.\n\n<strong>Self</strong> — если вам легко даётся дисциплина и нужен только дневник с базовым контролем. Вы ведёте записи сами: КБЖУ, динамика, виджеты. Куратора в этом формате нет.\n\n<strong>Pro</strong> — главный формат HEYS: если вы устали срываться и хотите, чтобы рутину дневника взял на себя куратор. Он сопровождает лично: ведёт ваш дневник по присланным данным, объясняет цифры и подсказывает, как вернуться в режим после срыва.\n\n<strong>Pro+</strong> — всё из Pro плюс сопровождение тренировок как у личного тренера: куратор онлайн или разбирает запись выполнения, корректирует технику, нагрузку и темп.\n\nНа 7-дневный бесплатный тест вы получаете именно тариф Pro.<br><br><a href="#trial" class="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm">Записаться на 7 дней (0 ₽) →</a>',
        },
        {
          q: 'Как работает оплата? Есть ли автопродление?',
          a: 'Оплата происходит помесячно. Мы принципиально не используем скрытые подписки и автопродления — вы сами решаете, когда оплатить следующий месяц. Продление всегда вручную.',
        },
        {
          q: 'Как вы предсказываете срывы?',
          a: 'HEYS анализирует ваш дневной отчёт по 41 паттерну питания и состояния (сон, питание, уровень стресса и др.). Алгоритм Crash Risk Score (CRS) замечает накопившуюся усталость за 2–3 дня до того, как вы попадёте в «яму», и заранее адаптирует план.',
        },
        {
          q: 'Что если я сорвусь или пропаду на пару дней?',
          a: 'Это абсолютно нормально. Мы не ругаем и не требуем отчетов "задним числом".\n\nКуратор бережно уточнит ваше состояние, при необходимости скорректирует план и поможет вернуться в процесс с самого простого шага — без чувства вины и напряжения.',
        },
        {
          q: 'Это медицинская услуга?',
          a: 'Нет. HEYS — про формирование привычек, бережный режим и сопровождение. Мы не ставим диагнозы и не назначаем лечение (но можем порекомендовать обратиться к профильному врачу, если увидим повод).',
        },
      ],
    },
    trial: {
      badge: '🎯 Тестовый период',
      title: '7 дней бесплатно (по записи)',
      subtitle: '7 дней в тарифе Pro, чтобы понять, как вам подходит сопровождение.',
      bullets: [
        { icon: '📱', text: 'Стартовая настройка целей и режима' },
        { icon: '📊', text: 'Первые разборы питания и привычек' },
        { icon: '💬', text: 'Чек-ин по итогам недели и план «что делать дальше»' },
        { icon: '🎯', text: 'Рекомендация подходящего тарифа (Self / Pro / Pro+)' },
      ],
      limitation: 'Берём ограниченное число людей одновременно — иначе не сохранить вовлечённость в каждую жизнь: график, тренировки, сон, контекст.',
      startPoint: 'Формат начинается с первого утреннего чек-ина.',
      ctaAvailable: 'Начать тестовый период (0 ₽) →',
      ctaQueue: 'Встать в очередь на тест →',
      purchaseLinkText: 'Уже решили?',
      purchaseLinkCta: 'Оформить подписку сразу →',
    },
    pricing: {
      intro: 'Выберите, что вам ближе:',
      formatSelf: {
        title: 'Самостоятельный режим',
        desc: 'Вы ведёте дневник в приложении сами: КБЖУ, динамика, виджеты. Без куратора.',
      },
      formatConcierge: {
        title: 'Консьерж-ведение',
        desc: 'Куратор берёт рутину на себя: ведение дневника, чат-поддержка и регулярный созвон.',
      },
    },
  },
}

export const DEFAULT_VARIANT: LandingVariant = 'A'

export function getVariantFromUrl(): LandingVariant {
  return DEFAULT_VARIANT
}
