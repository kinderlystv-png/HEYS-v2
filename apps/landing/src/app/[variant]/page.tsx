// SSR-версии вариантов: /a, /b, /c, /d
// Контент рендерится на сервере — виден в HTML без JavaScript

import { Metadata } from 'next'
import { notFound } from 'next/navigation'

import HeroSSR from '@/components/HeroSSR'
import {
  ContextSection,
  DecisionsSection,
  SupportSection,
  ControlSection,
} from '@/components/sections'
import VariantLandingSectionsSSR from '@/components/VariantLandingSectionsSSR'
import VersionSwitcherWrapper from '@/components/VersionSwitcherWrapper'
import { LandingVariant, VARIANTS } from '@/config/landing-variants'

// Статическая генерация для /a, /b, /c, /d
export function generateStaticParams() {
  return [
    { variant: 'a' },
    { variant: 'b' },
    { variant: 'c' },
    { variant: 'd' },
  ]
}

// Динамические метаданные для каждого варианта
export async function generateMetadata({
  params,
}: {
  params: { variant: string }
}): Promise<Metadata> {
  const variantKey = params.variant.toUpperCase() as LandingVariant
  
  if (!['A', 'B', 'C', 'D'].includes(variantKey)) {
    return {}
  }
  
  const content = VARIANTS[variantKey]
  
  return {
    title: `HEYS — ${content.hero.headline}`,
    description: content.hero.subheadline,
    openGraph: {
      title: `HEYS — ${content.hero.headline}`,
      description: content.hero.subheadline,
    },
  }
}

export default function VariantPage({
  params,
}: {
  params: { variant: string }
}) {
  // Преобразуем /a → A, /b → B, etc.
  const variantKey = params.variant.toUpperCase() as LandingVariant
  
  // Проверяем валидность
  if (!['A', 'B', 'C', 'D'].includes(variantKey)) {
    notFound()
  }
  
  const content = VARIANTS[variantKey]
  
  return (
    <main>
      {/* SSR Hero — контент в HTML */}
      <HeroSSR content={content} variant={variantKey} />
      
      {/* Секция Контекст — карта реальности */}
      <ContextSection />
      
      {/* Секция Решения — следующий шаг */}
      <DecisionsSection />
      
      {/* Секция Поддержка — система выдерживает жизнь */}
      <SupportSection />
      
      {/* Секция Контроль — ощущение управления */}
      <ControlSection />
      
      {/* SSR секции — контент в HTML */}
      <VariantLandingSectionsSSR content={content} variant={variantKey} />

      {/* Навигация между вариантами (только с ?debug=1) */}
      <VersionSwitcherWrapper currentVariant={variantKey} />
    </main>
  )
}
