'use client'

import { useState, useEffect } from 'react'

import { 
  assignVariant, 
  getSavedVariant, 
  saveVariant, 
  getVariantsString 
} from './ab-test'

/**
 * React hook для A/B тестирования
 * 
 * @param experimentId - ID эксперимента из конфигурации
 * @returns текущий вариант ('control', 'variant_a', etc.)
 * 
 * @example
 * const ctaVariant = useABTest('cta_button')
 * // 'control' | 'variant_a' | 'variant_b'
 */
export function useABTest(experimentId: string): string {
  const [variant, setVariant] = useState<string>('control')

  useEffect(() => {
    // Проверяем сохранённый вариант
    let savedVariant = getSavedVariant(experimentId)
    
    if (!savedVariant) {
      // Присваиваем новый вариант
      savedVariant = assignVariant(experimentId)
      saveVariant(experimentId, savedVariant)
    }
    
    setVariant(savedVariant)
  }, [experimentId])

  return variant
}

/**
 * Hook для получения всех A/B вариантов (для отправки в API)
 * 
 * @returns строка формата "cta_button:variant_a,hero_heading:control"
 */
export function useABVariants(): string {
  const [variants, setVariants] = useState<string>('')

  useEffect(() => {
    setVariants(getVariantsString())
  }, [])

  return variants
}
