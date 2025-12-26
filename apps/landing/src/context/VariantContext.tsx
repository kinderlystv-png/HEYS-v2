'use client'

import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

import { DEFAULT_VARIANT, getVariantFromUrl, LandingVariant, VariantContent,VARIANTS } from '@/config/landing-variants'

interface VariantContextType {
  variant: LandingVariant
  content: VariantContent
  setVariant: (v: LandingVariant) => void
}

const VariantContext = createContext<VariantContextType | null>(null)

export function VariantProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<LandingVariant>(DEFAULT_VARIANT)

  useEffect(() => {
    // Читаем из URL при загрузке
    const urlVariant = getVariantFromUrl()
    setVariantState(urlVariant)
  }, [])

  const setVariant = (v: LandingVariant) => {
    setVariantState(v)
    // Обновляем URL без перезагрузки
    const url = new URL(window.location.href)
    url.searchParams.set('v', v)
    window.history.replaceState({}, '', url.toString())
  }

  return (
    <VariantContext.Provider value={{ variant, content: VARIANTS[variant], setVariant }}>
      {children}
    </VariantContext.Provider>
  )
}

export function useVariant() {
  const ctx = useContext(VariantContext)
  if (!ctx) {
    // Fallback для SSR или если провайдер не подключён
    return {
      variant: DEFAULT_VARIANT,
      content: VARIANTS[DEFAULT_VARIANT],
      setVariant: () => {},
    }
  }
  return ctx
}
