// Версия A — прежняя основная страница-объяснение.
//
// До 2026-08-09 жила в корне; решением владельца основной стала `D`, и `A`
// переехала сюда. Не удалена намеренно: она baseline, с которым сравнивают
// остальные версии, и вернуть её в корень — правка `VERSION_PATHS`.
//
// Индексацию запрещаем: контент почти совпадает с корнем, и две живые копии в
// поиске конкурировали бы друг с другом за один и тот же запрос.

import { Metadata } from 'next';

import VersionA from '@/components/versions/VersionA';
import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import { VARIANTS } from '@/config/landing-variants';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия A (прежняя основная)',
  description: VARIANTS.A.hero.subheadline,
  robots: DRAFT_ROBOTS,
  openGraph: {
    title: 'HEYS — версия A (прежняя основная)',
    description: VARIANTS.A.hero.subheadline,
    type: 'website',
  },
};

export default function VersionAPage() {
  return (
    <main>
      <VersionA />

      <VersionSwitcherFab current="A" />
    </main>
  );
}
