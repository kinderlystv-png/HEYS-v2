// VersionA.tsx — текущая страница-объяснение (baseline).
// Композиция вынесена из page.tsx без изменений: порядок секций, пропсы и
// комментарии сохранены один в один, чтобы вариант A рендерился как раньше.

import HeroSSR from '@/components/HeroSSR';
import {
  ComparisonSection,
  CuratorSection,
  HowItWorksSection,
  NavigatorSection,
  PainSection,
  TrustSection,
} from '@/components/sections';
import VariantLandingSectionsSSR from '@/components/VariantLandingSectionsSSR';
import { VARIANTS } from '@/config/landing-variants';

export default function VersionA() {
  const content = VARIANTS.A;

  return (
    <>
      {/* 1. SSR Hero — первый экран, CTA, навигация */}
      <HeroSSR content={content} variant="A" />

      {/* 2. Как устроено — куратор ведёт контекст, связь, виджеты */}
      <CuratorSection />

      {/* DemoSection временно не подключаем: демонстрации в hero достаточно. */}

      {/* 3. Боль (02) — «Знакомо?» 5 болевых точек */}
      <PainSection />

      {/* 4. Ваш первый месяц (03) — timeline: ДЕНЬ 1 → ДНИ 2-7 → НЕДЕЛЯ 2 → МЕСЯЦ+ */}
      <HowItWorksSection />

      {/* 5. Сравнение (04) — 6-строчная таблица vs обычных приложений */}
      <ComparisonSection />

      {/* 6. Как куратор принимает решение (05) — изменения недели, причины, следующий шаг */}
      <NavigatorSection />

      {/* 7. Доверие (06) — опыт куратора, стандарт, честный первый набор */}
      <TrustSection />

      {/* 8-11. Тарифы и форматы → Триал → единый FAQ → Футер */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </>
  );
}
