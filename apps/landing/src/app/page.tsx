// Главная страница — единственный лендинг (вариант A)
// Порядок секций по COPY_FINAL v2.1:
// Hero → Pain → Context → Decisions → Support → Control →
// Comparison → Navigator → Trust → Objections → Formats → Pricing → Trial → FAQ → Footer

import { Metadata } from 'next'

import HeroSSR from '@/components/HeroSSR'
import {
  ComparisonSection,
  ContextSection,
  ControlSection,
  DecisionsSection,
  NavigatorSection,
  ObjectionsSection,
  PainSection,
  SupportSection,
  TrustSection,
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
      {/* 1. SSR Hero — первый экран, CTA, навигация */}
      <HeroSSR content={content} variant="A" />

      {/* 2. Боль — «Знакомо?» 5 болевых точек */}
      <PainSection />

      {/* 3. Контекст — карта реальности: какие данные собираем */}
      <ContextSection />

      {/* 4. Решения — 4-шаговый воркфлоу куратора */}
      <DecisionsSection />

      {/* 5. Поддержка — протокол восстановления при срыве */}
      <SupportSection />

      {/* 6. Контроль — ощущение управления, финальные бенефиты */}
      <ControlSection />

      {/* 7. Сравнение — 6-строчная таблица vs обычных приложений */}
      <ComparisonSection />

      {/* 8. Навигатор — CRS-шкала, причины, без наказания, инсулиновая волна */}
      <NavigatorSection />

      {/* 9. Доверие — куратор, наука, 3 принципа */}
      <TrustSection />

      {/* 10. Возражения — 4 частых сомнения в аккордеоне */}
      <ObjectionsSection />

      {/* 11-15. Форматы → Прайсинг → Триал → FAQ → Футер */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </main>
  )
}

