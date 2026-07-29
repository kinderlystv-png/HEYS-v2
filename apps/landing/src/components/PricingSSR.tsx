// PricingSSR.tsx — Server Component версии блока 07.

import PricingSectionContent from './pricing/PricingSectionContent';
import SectionBadgeBar from './SectionBadgeBar';

import type { LandingVariant, VariantContent } from '@/config/landing-variants';

interface PricingSSRProps {
  content: VariantContent;
  variant: LandingVariant;
}

export default function PricingSSR(_props: PricingSSRProps) {
  return (
    <section className="relative bg-gray-50 pb-12" id="pricing">
      <SectionBadgeBar>07 — ФОРМАТЫ И ТАРИФЫ</SectionBadgeBar>
      <PricingSectionContent />
    </section>
  );
}
