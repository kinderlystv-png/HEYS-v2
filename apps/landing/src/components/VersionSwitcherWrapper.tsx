// VersionSwitcherWrapper.tsx — Client wrapper для скрытия switcher в проде
// Показывает переключатель версий только при ?debug=1 в URL
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import VersionSwitcherSSR from './VersionSwitcherSSR'

import type { LandingVariant } from '@/config/landing-variants'

interface VersionSwitcherWrapperProps {
  currentVariant: LandingVariant
}

// Внутренний компонент использующий useSearchParams (требует Suspense)
function VersionSwitcherInner({ currentVariant }: VersionSwitcherWrapperProps) {
  const searchParams = useSearchParams()
  const isDebug = searchParams.get('debug') === '1'

  // В production показываем только с ?debug=1
  // В dev режиме показываем всегда для удобства
  const isDev = process.env.NODE_ENV === 'development'
  
  if (!isDebug && !isDev) {
    return null
  }

  return <VersionSwitcherSSR currentVariant={currentVariant} />
}

// Обёртка с Suspense (Next.js требует для useSearchParams)
export default function VersionSwitcherWrapper({ currentVariant }: VersionSwitcherWrapperProps) {
  return (
    <Suspense fallback={null}>
      <VersionSwitcherInner currentVariant={currentVariant} />
    </Suspense>
  )
}
