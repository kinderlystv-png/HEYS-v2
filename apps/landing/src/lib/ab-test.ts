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
    // control: "Начать бесплатно →"
    // variant_a: "Попробовать 7 дней бесплатно"
    // variant_b: "Получить куратора бесплатно"
  },
  {
    id: 'hero_heading',
    variants: ['control', 'variant_a'],
    // control: "Похудеть получится, если кто-то рядом"
    // variant_a: "Персональный куратор питания — 7 дней бесплатно"
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
  control: 'Начать бесплатно →',
  variant_a: 'Попробовать 7 дней бесплатно',
  variant_b: 'Получить куратора бесплатно'
}

// Hero заголовки
export const HERO_VARIANTS: Record<string, string> = {
  control: 'Похудеть получится, если кто-то рядом',
  variant_a: 'Персональный куратор питания — 7 дней бесплатно'
}

// Получить текст CTA по варианту
export function getCTAText(variant: string): string {
  return CTA_VARIANTS[variant] || CTA_VARIANTS.control
}

// Получить заголовок Hero по варианту  
export function getHeroText(variant: string): string {
  return HERO_VARIANTS[variant] || HERO_VARIANTS.control
}
