// Главная страница — единственный лендинг (вариант A)
// Порядок секций по COPY_FINAL v3.0:
// Hero → Pain → HowItWorks → Comparison → Navigator → Trust → Objections → Formats → Pricing → Trial → FAQ → Footer

import { Metadata } from 'next'

import HeroSSR from '@/components/HeroSSR'
import {
  ComparisonSection,
  HowItWorksSection,
  NavigatorSection,
  ObjectionsSection,
  PainSection,
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

      {/* 3. Как это работает — 4 шага: ВИЖУ → ПОНИМАЮ → НЕ ОДИН → РЕЗУЛЬТАТ */}
      <HowItWorksSection />

      {/* 4. Сравнение — 6-строчная таблица vs обычных приложений */}
      <ComparisonSection />

      {/* 5. Навигатор — CRS-шкала, причины, без наказания, инсулиновая волна */}
      <NavigatorSection />

      {/* 6. Доверие — куратор, наука, 3 принципа */}
      <TrustSection />

      {/* 7. Возражения — 4 частых сомнения в аккордеоне */}
      <ObjectionsSection />

      {/* 8-12. Форматы → Прайсинг → Триал → FAQ → Футер */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </main>
  )
}

