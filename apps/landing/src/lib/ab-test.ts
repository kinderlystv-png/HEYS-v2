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
    // control: «Верните контроль над своим состоянием. Без диет и насилия над собой.»
    // variant_a: «Устали от диет, срывов и чувства вины? Есть другой путь.»
    // variant_b: «Энергия, вес, ясность — под вашим управлением. Без силы воли.»
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

// Hero заголовки — 4 варианта A/B/C теста
// control:   COPY_FINAL «боль» — «Верните контроль...»
// variant_a: COPY_FINAL «боль» — «Устали от диет...»
// variant_b: Старый «системный» вариант — benchmark
// variant_c: COPY_FINAL «выгода» — «Энергия, вес, ясность...»
export const HERO_VARIANTS: Record<string, { headline: string; subheadline: string }> = {
  control: {
    headline: 'Верните контроль над своим состоянием. Без диет и насилия над собой.',
    subheadline: 'Умная система находит скрытые причины срывов, а живой куратор берёт на себя всю рутину. Вам больше не нужно считать калории и думать "что съесть" — вы просто получаете 1-2 простых шага на день.',
  },
  variant_a: {
    headline: 'Устали от диет, срывов и чувства вины? Есть другой путь.',
    subheadline: 'Мы объединили метаболический трекер и живого куратора. Система анализирует ваше состояние, а человек рядом помогает вырулить, когда всё идёт не по плану. Без диет, чувства вины и подсчёта калорий.',
  },
  variant_b: {
    // Старый заголовок — оставлен как benchmark для A/B теста
    headline: 'HEYS — для тех, кто хочет управлять своей жизнью.',
    subheadline: 'Вы управляете своей жизнью, мы управляем процессом. Система собирает данные, куратор адаптирует их под вас. Вы просто видите результат — без борьбы с собой.',
  },
  variant_c: {
    headline: 'Энергия, вес, ясность — под вашим управлением. Без силы воли.',
    subheadline: 'Умная система находит скрытые причины срывов, а живой куратор берёт на себя всю рутину. Вам больше не нужно считать калории и думать "что съесть" — вы просто получаете 1-2 простых шага на день.',
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
