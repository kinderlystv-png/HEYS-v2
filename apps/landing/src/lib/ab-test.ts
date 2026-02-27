/**
 * A/B Test — минимальная инфраструктура для тестирования CTA и других элементов
 * 
 * Использование:
 * 1. В компоненте: const variant = useABTest('cta_button')
 * 2. В форме: передаётся автоматически через UTM-like параметр ab_variant
 */

// Конфигурация экспериментов
export interface ABExperiment {
  id: string
  variants: string[]
  weights?: number[] // По умолчанию равномерное распределение
}

// Активные эксперименты
export const EXPERIMENTS: ABExperiment[] = [
  {
    id: 'cta_button',
    variants: ['control', 'variant_a', 'variant_b'],
    // control: "Начать бесплатно"
    // variant_a: "Записаться на неделю старта (0 ₽)"
    // variant_b: "Выбрать тариф"
  },
  {
    id: 'hero_copy',
    variants: ['control', 'variant_a', 'variant_b'],
    // control: Системный (текущий — "для тех, кто хочет управлять")
    // variant_a: Эмоциональный ("Похудеть получится, если кто-то рядом")
    // variant_b: Рациональный ("Трекер + куратор. Чтобы вы реально дошли до режима.")
  }
]

// Получить эксперимент по ID
export function getExperiment(experimentId: string): ABExperiment | undefined {
  return EXPERIMENTS.find(exp => exp.id === experimentId)
}

// Выбрать вариант (детерминированно по userId или рандомно)
export function assignVariant(experimentId: string, userId?: string): string {
  const experiment = getExperiment(experimentId)
  if (!experiment) return 'control'

  const { variants, weights } = experiment

  // Если есть userId — детерминированный выбор (один юзер видит один вариант всегда)
  if (userId) {
    const hash = hashString(userId + experimentId)
    const index = hash % variants.length
    return variants[index]
  }

  // Рандомный выбор с учётом весов
  if (weights && weights.length === variants.length) {
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let random = Math.random() * totalWeight
    for (let i = 0; i < variants.length; i++) {
      random -= weights[i]
      if (random <= 0) return variants[i]
    }
  }

  // Равномерное распределение
  return variants[Math.floor(Math.random() * variants.length)]
}

// Простой хеш для детерминированного выбора
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Сохранить вариант в localStorage
export function saveVariant(experimentId: string, variant: string): void {
  if (typeof window === 'undefined') return
  try {
    const key = `ab_${experimentId}`
    localStorage.setItem(key, variant)
  } catch (e) {
    // localStorage недоступен
  }
}

// Получить сохранённый вариант
export function getSavedVariant(experimentId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const key = `ab_${experimentId}`
    return localStorage.getItem(key)
  } catch (e) {
    return null
  }
}

// Получить все активные варианты для текущего пользователя
export function getAllVariants(): Record<string, string> {
  const result: Record<string, string> = {}

  for (const experiment of EXPERIMENTS) {
    let variant = getSavedVariant(experiment.id)
    if (!variant) {
      variant = assignVariant(experiment.id)
      saveVariant(experiment.id, variant)
    }
    result[experiment.id] = variant
  }

  return result
}

// Сформировать строку для отправки в API (формат: "cta_button:variant_a,hero_heading:control")
export function getVariantsString(): string {
  const variants = getAllVariants()
  return Object.entries(variants)
    .map(([key, value]) => `${key}:${value}`)
    .join(',')
}

// CTA варианты для кнопки
export const CTA_VARIANTS: Record<string, string> = {
  control: 'Начать бесплатно',
  variant_a: 'Записаться на неделю старта (0 ₽)',
  variant_b: 'Выбрать тариф'
}

// Hero заголовки — 3 варианта A/B теста
export const HERO_VARIANTS: Record<string, { headline: string; subheadline: string }> = {
  control: {
    headline: 'HEYS — для тех, кто хочет управлять своей жизнью.',
    subheadline: 'Вы управляете решениями. Мы держим процесс.\nНе за счёт силы воли, а за счёт системы:\nконтекст → решения → поддержка → контроль.',
  },
  variant_a: {
    headline: 'Похудеть получится, если кто-то рядом.',
    subheadline: 'Не сила воли — а человек рядом.\nHEYS — экосистема с живым куратором, который ведёт дневник за вас\nи поддерживает при срывах.',
  },
  variant_b: {
    headline: 'HEYS — трекер + куратор. Чтобы вы реально дошли до режима.',
    subheadline: 'Вы отмечаете максимально просто: фото еды / короткие сообщения / отметки привычек.\nДальше куратор ведёт, сверяет прогресс раз в неделю и даёт понятные шаги.',
  },
}

// Получить текст CTA по варианту
export function getCTAText(variant: string): string {
  return CTA_VARIANTS[variant] || CTA_VARIANTS.control
}

// Получить заголовок Hero по варианту
export function getHeroHeadline(variant: string): string {
  return HERO_VARIANTS[variant]?.headline || HERO_VARIANTS.control.headline
}

// Получить подзаголовок Hero по варианту
export function getHeroSubheadline(variant: string): string {
  return HERO_VARIANTS[variant]?.subheadline || HERO_VARIANTS.control.subheadline
}
