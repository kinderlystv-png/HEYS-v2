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

const SHARED_QUOTES: string[] = []

const SHARED_SCREEN_ITEMS = [
  { title: 'Дневник дня', benefit: 'Быстро понимаете, где вы сейчас.' },
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
      headline: 'Ваш дневник питания ведёт куратор.',
      subheadline: 'Фото, голосовое или короткое сообщение — этого достаточно. Куратор вносит данные в приложение, оценивает всё в контексте вашей недели и делится своими рекомендациями.',
      features: [],
      ctaPrimary: 'Понять, как работает HEYS',
      ctaSecondary: '',
      microtext: 'Без карты · Без автосписаний · Не медицинская услуга',
    },
    nav: {
      links: [
        { id: 'curator', label: 'как устроено', href: '#curator' },
        { id: 'pain', label: 'ситуация', href: '#pain' },
        { id: 'how', label: 'первый месяц', href: '#how-it-works' },
        { id: 'navigator', label: 'сигналы', href: '#navigator' },
        { id: 'trust', label: 'доверие', href: '#trust' },
        { id: 'pricing', label: 'тарифы', href: '#pricing' },
        { id: 'faq', label: 'вопросы', href: '#faq' },
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
      title: 'Отзывы появятся после первых клиентов.',
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
          title: 'Контекст в одном месте',
          desc: 'Первый контакт — во внешнем канале из заявки, дальше можно перейти в HEYS-мессенджер: дневник и переписка рядом.',
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
          title: 'Pro / Pro+ — ведение с куратором',
          desc: 'Куратор ведёт ваш дневник, видит контекст недели и помогает удерживать ритм без стыда. В Pro+ дополнительно — больше внимания к тренировкам и восстановлению.',
          points: [
            'Подходит, если вы устали срываться и бросать',
            'Нужен живой человек в контуре и меньше рутины',
            'В Pro+ — приоритетное внимание к тренировкам и восстановлению',
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
          a: 'Обычный трекер показывает цифры, но дневник всё равно ведёте вы. В HEYS на тарифах с сопровождением куратор переносит присланные данные в дневник, видит контекст недели и помогает выбрать следующий шаг, когда ритм сбивается.\n\nЦена на сайте — окончательная: без скидок с таймером, обязательных созвонов и автосписаний.',
        },
        {
          q: 'Мне придется считать калории и взвешивать еду?',
          a: 'В Pro подсчёты и внесение дневника берёт на себя куратор. Вам нужно прислать фото еды на весах, короткое сообщение с порцией или голосовое: так данные в дневнике становятся точнее, а разбор недели — полезнее.\n\nЭто заметно проще, чем вести таблицу вручную: поставили тарелку на весы → сделали фото → отправили куратору. Никаких таблиц и ручных подсчётов.',
        },
        {
          q: 'Где проходит общение и ведение дневника?',
          a: 'Первый контакт проходит в канале из заявки: Telegram, WhatsApp, MAX или звонок. После входа можно перейти во встроенный мессенджер HEYS — рекомендуем его, потому что дневник, переписка и контекст рядом.\n\nДневник ведёт куратор, а вы видите виджеты и отчёты недели/месяца в веб-приложении. Устанавливать отдельное приложение не обязательно.',
        },
        {
          q: 'Чем HEYS отличается от работы с нутрициологом или тренером?',
          a: 'HEYS не заменяет врача или нутрициолога при медицинских показаниях. Отличие в формате: консультация даёт решение на встрече, а в HEYS куратор помогает вести повседневный контекст — дневник, срывы, сон, нагрузку и ритм недели.\n\nВам не нужно каждый раз собирать всё заново: история уже в системе, а куратор видит свежую картину.',
        },
        {
          q: 'Обязательно ли брать куратора?',
          a: 'Не обязательно — у нас три варианта.\n\n<strong>Self</strong> — если вам легко даётся дисциплина и нужен только дневник с базовым контролем. Вы ведёте записи сами: КБЖУ, динамика, виджеты. Куратора в этом формате нет.\n\n<strong>Pro</strong> — главный формат HEYS: если вы устали срываться и хотите, чтобы рутину дневника взял на себя куратор. Он ведёт ваш дневник по присланным данным, помогает увидеть паттерны недели и спокойно вернуться в режим после срыва.\n\n<strong>Pro+</strong> — всё из Pro плюс больше внимания к тренировкам: куратор помогает учитывать нагрузку, технику, темп и восстановление.\n\nНа 7-дневный бесплатный тест вы получаете именно тариф Pro.<br><br><a href="#trial" class="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm">Оставить заявку на неделю Pro (0 ₽) →</a>',
        },
        {
          q: 'Как работает оплата? Есть ли автопродление?',
          a: 'Оплата происходит помесячно. Мы принципиально не используем скрытые подписки и автопродления — вы сами решаете, когда оплатить следующий месяц. Продление всегда вручную.',
        },
        {
          q: 'Как HEYS замечает риск срыва?',
          a: 'Navigator собирает питание, сон, активность, стресс и ритм недели в одну картину. RiskRadar подсвечивает ранний сигнал риска, а куратор переводит его в простой следующий шаг: где упростить день, где добавить приём пищи, где не требовать от себя идеальности.',
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
      title: 'Неделя Pro бесплатно',
      subtitle: '7 дней сопровождения, чтобы понять, как вам подходит формат: куратор ведёт дневник, вы видите картину.',
      bullets: [
        { icon: '📱', text: 'Куратор знакомится с вашей целью и режимом' },
        { icon: '📊', text: 'Первые данные попадают в дневник и виджеты' },
        { icon: '💬', text: 'Разбор недели и понятный следующий шаг' },
        { icon: '🎯', text: 'Рекомендация подходящего тарифа (Self / Pro / Pro+)' },
      ],
      limitation: 'Берём ограниченное число людей одновременно — иначе не сохранить вовлечённость в каждую жизнь: график, тренировки, сон, контекст.',
      startPoint: 'Формат начинается с первого утреннего чек-ина.',
      ctaAvailable: 'Оставить заявку на неделю Pro (0 ₽) →',
      ctaQueue: 'Встать в очередь на тест →',
      purchaseLinkText: 'Уже решили?',
      purchaseLinkCta: 'Оформить подписку сразу →',
    },
    pricing: {
      intro: 'Форматы HEYS',
      formatSelf: {
        title: 'Самостоятельный режим',
        desc: 'Вы ведёте дневник в приложении сами: КБЖУ, динамика, виджеты. Без куратора.',
      },
      formatConcierge: {
        title: 'Консьерж-ведение',
        desc: 'Куратор ведёт дневник по присланным данным, держит контекст недели и помогает удерживать режим без стыда.',
      },
    },
  },
}

export const DEFAULT_VARIANT: LandingVariant = 'A'

export function getVariantFromUrl(): LandingVariant {
  return DEFAULT_VARIANT
}
