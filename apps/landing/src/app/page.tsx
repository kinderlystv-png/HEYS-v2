// Главная страница — единственный лендинг (вариант A)
// Порядок секций по COPY_FINAL v3.0:
// Hero → Pain → HowItWorks → Comparison → Navigator → Trust → Objections → Formats → Pricing → Trial → FAQ → Footer

import { Metadata } from 'next'

import HeroSSR from '@/components/HeroSSR'
import {
  ComparisonSection,
  CuratorSection,
  DemoSection,
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

      {/* 2. Интерактивное приложение — живой HEYS в iframe (try.heyslab.ru) */}
      <DemoSection />

      {/* 3. Куратор (01) — раскрытие 2-й колонны обещания Hero (приложение + человек) */}
      <CuratorSection />

      {/* 4. Боль (02) — «Знакомо?» 5 болевых точек */}
      <PainSection />

      {/* 5. Ваш первый месяц (03) — timeline: ДЕНЬ 1 → ДНИ 2-7 → НЕДЕЛЯ 2 → МЕСЯЦ+ */}
      <HowItWorksSection />

      {/* 6. Сравнение (04) — 6-строчная таблица vs обычных приложений */}
      <ComparisonSection />

      {/* 7. Под капотом (05) — CRS-шкала, причины, без наказания, инсулиновая волна */}
      <NavigatorSection />

      {/* 8. Доверие (06) — наука + 3 принципа */}
      <TrustSection />

      {/* 9. Возражения (07) — частые сомнения в аккордеоне */}
      <ObjectionsSection />

      {/* 10-13. Форматы (08) → Прайсинг (09) → Триал (10) → FAQ (11) → Футер */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </main>
  )
}

