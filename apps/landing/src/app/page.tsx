// Главная страница — единственный лендинг (вариант A)
// SSR версия с полным контентом в HTML

import { Metadata } from 'next'

import HeroSSR from '@/components/HeroSSR'
import {
  ContextSection,
  DecisionsSection,
  SupportSection,
  ControlSection,
} from '@/components/sections'
import VariantLandingSectionsSSR from '@/components/VariantLandingSectionsSSR'
import { VARIANTS } from '@/config/landing-variants'

// Метаданные для главной страницы
export const metadata: Metadata = {
  title: `HEYS — ${VARIANTS.A.hero.headline}`,
  description: VARIANTS.A.hero.subheadline,
  openGraph: {
    title: `HEYS — ${VARIANTS.A.hero.headline}`,
    description: VARIANTS.A.hero.subheadline,
  },
}

export default function Home() {
  const content = VARIANTS.A
  
  return (
    <main>
      {/* SSR Hero — контент в HTML */}
      <HeroSSR content={content} variant="A" />
      
      {/* Секция Контекст — карта реальности */}
      <ContextSection />
      
      {/* Секция Решения — следующий шаг */}
      <DecisionsSection />
      
      {/* Секция Поддержка — система выдерживает жизнь */}
      <SupportSection />
      
      {/* Секция Контроль — ощущение управления */}
      <ControlSection />
      
      {/* SSR секции — контент в HTML */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </main>
  )
}
