'use client';

// VersionD.tsx — версия «вникание» (решение владельца `маркетинг/15` №50).
//
// Канон — `apps/landing/design/landing-d/README.md`. Порядок блоков отвечает
// пути холодного посетителя: сначала его ситуация, потом механика, потом
// доказательство неделей, потом цена и заявка. Сквозная линия страницы одна —
// куратор уточняет, прежде чем советовать; она проведена через пять точек
// (подзаголовок героя, переписка в 02, узел «что уточнил куратор» в 04,
// стандарт в 05, карточка заявки). Если при правках какая-то точка выпадет,
// страница вернётся к защите копируемого — снятой рутины.

import { useRef, useState } from 'react';

import CuratorSection from '@/components/versions/d/CuratorSection';
import FaqD from '@/components/versions/d/FaqD';
import FirstMonth from '@/components/versions/d/FirstMonth';
import { golos, playfair } from '@/components/versions/d/fonts';
import FooterD from '@/components/versions/d/FooterD';
import HeroD from '@/components/versions/d/HeroD';
import HowItWorks from '@/components/versions/d/HowItWorks';
import NavD from '@/components/versions/d/NavD';
import PainSection from '@/components/versions/d/PainSection';
import PricingD from '@/components/versions/d/PricingD';
import ReviewedWeek from '@/components/versions/d/ReviewedWeek';
import { D_THEME_VARS } from '@/components/versions/d/theme';
import TrialSection from '@/components/versions/d/TrialSection';
import useReveal from '@/components/versions/d/useReveal';

export default function VersionD() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useReveal(rootRef);

  // Меню открывается и из шапки первого экрана, и из липкой шапки, поэтому его
  // состояние живёт здесь, а не внутри одной из них.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={rootRef}
      className={`${golos.className} ${golos.variable} ${playfair.variable} bg-white text-[#101826] antialiased`}
      style={D_THEME_VARS}
    >
      <HeroD onOpenMenu={() => setMenuOpen(true)} />

      <PainSection />
      <HowItWorks />
      <FirstMonth />
      <ReviewedWeek />
      <CuratorSection />
      <PricingD />
      <TrialSection />
      <FaqD />
      <FooterD />

      <NavD
        menuOpen={menuOpen}
        onOpenMenu={() => setMenuOpen(true)}
        onCloseMenu={() => setMenuOpen(false)}
      />
    </div>
  );
}
