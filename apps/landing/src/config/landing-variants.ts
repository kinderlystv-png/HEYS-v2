// landing-variants.ts — конфиг основного лендинга
// A: premium (минимализм, делегирование) — единственный активный вариант
// Варианты B/C/D удалены — не использовались в production

export type LandingVariant = 'A';

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
  | 'footer';

export interface NavLink {
  id: string;
  label: string;
  href: string;
  /** Короткая подсказка о содержании раздела — показывается в мобильном меню. */
  hint?: string;
}

export interface VariantContent {
  id: LandingVariant;
  name: string;
  description: string;
  hero: {
    headline: string;
    subheadline: string;
    /**
     * Разбивка подзаголовка на строки для широкого экрана: на мобильном текст
     * всегда идёт сплошняком. По умолчанию — одна строка `subheadline`.
     */
    subheadlineDesktopLines?: string[];
    features?: string[]; // H3 — пункты под subheadline
    ctaPrimary: string;
    /** Куда ведёт главная кнопка первого экрана. По умолчанию `#curator`. */
    ctaPrimaryHref?: string;
    ctaSecondary: string;
    frictionNote?: string; // Снижение трения рядом с CTA
    microtext: string;
    microtextLine2?: string; // Вторая строка microtext
    /** Куда ведёт подсказка прокрутки внизу первого экрана. По умолчанию `#curator`. */
    scrollCueHref?: string;
  };
  nav: {
    links: NavLink[];
  };
  page: {
    order: LandingSectionId[];
  };
  socialProof: {
    eyebrow?: string;
    title: string;
    quotes: string[];
  };
  delegate: {
    eyebrow?: string;
    title: string;
    cards: { title: string; desc: string; icon: string }[];
  };
  interaction: {
    eyebrow?: string;
    title: string;
    steps: { title: string; desc: string; icon: string }[];
    note?: string;
  };
  formats: {
    eyebrow?: string;
    title: string;
    cards: { title: string; desc: string; points: string[]; highlight?: boolean }[];
  };
  layers: {
    eyebrow?: string;
    title: string;
    items: { title: string; desc: string; icon: string }[];
  };
  screens: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    items: { title: string; benefit: string }[];
  };
  matrix: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    rows: {
      label: string;
      base: string;
      pro: string;
      proPlus: string;
    }[];
  };
  cases: {
    eyebrow?: string;
    title: string;
    items: { before: string; after: string }[];
  };
  doDont: {
    eyebrow?: string;
    title: string;
    do: string[];
    dont: string[];
  };
  method: {
    eyebrow?: string;
    title: string;
    steps: { title: string; desc: string }[];
  };
  sla: {
    eyebrow?: string;
    title: string;
    items: { label: string; value: string }[];
    protocol: { icon: string; label: string; desc: string }[];
    note?: string;
  };
  security: {
    eyebrow?: string;
    title: string;
    bullets: string[];
    links: { label: string; href: string }[];
  };
  faq: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    items: { q: string; a: string }[];
  };
  trial: {
    title: string;
    subtitle: string;
    limitation: string;
    startPoint: string;
    ctaAvailable: string;
    ctaQueue: string;
    purchaseLinkText: string;
    purchaseLinkCta: string;
  };
  pricing: {
    intro: string;
    formatSelf: { title: string; desc: string };
    formatConcierge: { title: string; desc: string };
  };
}

const SHARED_QUOTES: string[] = [];

const SHARED_SCREEN_ITEMS = [
  { title: 'Дневник дня', benefit: 'Быстро понимаете, где вы сейчас.' },
  { title: 'Неделя в одном экране', benefit: 'Тренды и ключевые выводы без перегруза.' },
  { title: 'Привычки', benefit: 'Фокус на 1–2 действиях, которые реально двигают.' },
  { title: 'Динамика', benefit: 'Видите причинно‑следственные связи, а не шум.' },
  { title: 'Чек‑ин', benefit: 'Регулярный контроль и план на следующую неделю.' },
];

export const VARIANTS: Record<LandingVariant, VariantContent> = {
  // Вариант A — "Премиальный минимализм" (близкий к текущему вайбу)
  A: {
    id: 'A',
    name: 'Premium',
    description: 'Премиальный минимализм',
    hero: {
      headline: 'Ваш дневник питания ведёт куратор.',
      subheadline:
        'Фото, голосовое или короткое сообщение — этого достаточно. Куратор вносит данные в приложение, оценивает всё в контексте вашей недели и делится своими рекомендациями.',
      subheadlineDesktopLines: [
        'Фото, голосовое или короткое сообщение — этого достаточно.',
        'Куратор вносит данные в приложение, оценивает всё в контексте вашей недели и делится своими рекомендациями.',
      ],
      features: [],
      ctaPrimary: 'Понять, как работает HEYS',
      ctaSecondary: '',
      microtext: '7 дней Pro — 0 ₽ · без карты и автосписаний',
    },
    nav: {
      links: [
        { id: 'curator', label: 'как устроено', href: '#curator', hint: 'Дневник ведёт куратор' },
        { id: 'pain', label: 'ситуация', href: '#pain', hint: 'С чем обычно приходят' },
        {
          id: 'how',
          label: 'первый месяц',
          href: '#how-it-works',
          hint: 'От заявки до первой недели',
        },
        { id: 'navigator', label: 'сигналы', href: '#navigator', hint: 'Что видно в вашей неделе' },
        { id: 'trust', label: 'доверие', href: '#trust', hint: 'Опыт куратора и стандарт разбора' },
        { id: 'pricing', label: 'тарифы', href: '#pricing', hint: 'Self, Pro, Pro Спорт' },
        { id: 'faq', label: 'вопросы', href: '#faq', hint: 'Ответы на частые вопросы' },
      ],
    },
    page: {
      // A: премиальная подача — эмоции/делегирование/сервис. Меньше “таблиц”, больше ощущений.
      order: ['pricing', 'trial', 'faq', 'footer'],
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
        },
        {
          icon: '💬',
          title: 'Контекст в одном месте',
          desc: 'Первый контакт — во внешнем канале из заявки, дальше можно перейти в HEYS-мессенджер: дневник и переписка рядом.',
        },
      ],
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
          points: [
            'Подходит, если вы привыкли вести трекеры сами',
            'Нужен только дневник и базовый контроль',
          ],
        },
        {
          title: 'Pro / Pro Спорт — персональное ведение',
          desc: 'В Pro куратор ведёт дневник и держит контекст недели. В Pro Спорт один специалист соединяет питание, тренировки и восстановление в общей работе.',
          points: [
            'Подходит, если вы устали срываться и бросать',
            'Нужен живой человек в контуре и меньше рутины',
            'В Pro Спорт — программа тренировок, общий недельный созвон и ограниченный разбор техники',
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
          q: 'Нужно ли самому считать калории и заполнять дневник?',
          a: 'В Pro и Pro Спорт считать калории и заполнять дневник вручную не нужно. Вы присылаете фото еды, короткий текст или голосовое, а куратор переносит данные в дневник и при необходимости уточняет детали. В Self дневник ведёте сами. Чем точнее описана порция, тем точнее получится запись.',
        },
        {
          q: 'Где проходит общение и когда отвечает куратор?',
          a: 'Первый контакт проходит в выбранном при заявке канале. После входа можно продолжить общение во встроенном мессенджере HEYS — так переписка, дневник и контекст остаются рядом.\n\nСообщения обрабатываются с 09:00 до 21:00 по московскому времени в дни и объёме, предусмотренных выбранным тарифом. Ориентир первой реакции — 1–2 часа в часы сопровождения, но это не гарантированный срок: полный разбор может занять больше времени. Отдельное приложение устанавливать не обязательно.',
        },
        {
          q: 'Придётся ли готовить отдельно от семьи?',
          a: 'Нет. HEYS работает с вашим обычным рационом: семейными ужинами, бизнес-ланчами и доставкой. Куратор помогает подобрать выполнимые сочетания и порции под вашу цель, не превращая питание в отдельный режим для одного человека.',
        },
        {
          q: 'Что если я уеду, собьюсь с графика или пропущу несколько дней?',
          a: 'Не нужно восстанавливать дневник задним числом или компенсировать пропуски жёсткими ограничениями. В Pro и Pro Спорт пришлите свежий контекст: куратор учтёт поездку, изменения графика и нагрузки и поможет выбрать ближайший выполнимый шаг. Задача — спокойно вернуться в привычный ритм, а не собрать идеальный дневник.',
        },
        {
          q: 'Можно ли пользоваться HEYS без куратора?',
          a: 'Да. В Self вы ведёте дневник самостоятельно. В Pro дневник ведёт куратор и помогает по ходу недели. В Pro Спорт один специалист ведёт питание и тренировки: тариф включает всё сопровождение Pro и персональное ведение тренировок. Состав и цены показаны выше.',
        },
        {
          q: 'Что происходит после бесплатной недели Pro?',
          a: 'Платный период не начинается автоматически, и деньги не списываются. Чтобы продолжить, нужно самостоятельно выбрать и оплатить тариф.\n\nБесплатная неделя не распространяется на Pro Спорт: этот формат подключается и оплачивается только после личного согласования запроса и подтверждения свободного места.',
        },
        {
          q: 'Как работают оплата, отказ от тарифа и возврат денег?',
          a: 'Оплата производится помесячно, без автосписаний. Вы сами решаете, продлевать ли тариф. От платных услуг можно отказаться в любое время; правила расчёта, сроки и порядок возврата указаны в <a href="/legal/refund" class="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800">Условиях возврата денежных средств</a>. Если активную подписку прекращает HEYS, возвращается 100% суммы, уплаченной за текущий расчётный период.',
        },
        {
          q: 'Это медицинская услуга?',
          a: 'Нет. Куратор не ставит диагнозы, не назначает лечение и не интерпретирует результаты анализов. Рекомендации носят информационный характер и не заменяют консультацию врача. При заболеваниях или сомнениях в состоянии здоровья нужно обратиться к врачу. В Pro Спорт разбор техники по видео также не является медицинской или реабилитационной оценкой.',
        },
      ],
    },
    trial: {
      title: 'Неделя Pro бесплатно',
      subtitle:
        'За 7 дней куратор перенесёт первые приёмы в дневник, посмотрит ритм недели и разберёт с вами, где день начинает сбиваться и какой шаг взять дальше.',
      limitation:
        'Берём ограниченное число людей одновременно — иначе не сохранить вовлечённость в каждую жизнь: график, тренировки, сон, контекст.',
      startPoint: 'Формат начинается с первого утреннего чек-ина.',
      ctaAvailable: 'Оставить заявку на неделю Pro (0 ₽) →',
      ctaQueue: 'Встать в очередь на тест →',
      purchaseLinkText: 'Хотите сравнить форматы?',
      purchaseLinkCta: 'Вернуться к тарифам →',
    },
    pricing: {
      intro: 'Выберите объём сопровождения',
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
};

export const DEFAULT_VARIANT: LandingVariant = 'A';

export function getVariantFromUrl(): LandingVariant {
  return DEFAULT_VARIANT;
}
