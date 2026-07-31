// Черновая версия C — эталонная «страница-решение» (`маркетинг/46`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import VersionC from '@/components/versions/VersionC';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия C (черновик)',
  robots: DRAFT_ROBOTS,
};

export default function VersionCPage() {
  return (
    <main>
      <VersionC />

      <VersionSwitcherFab current="C" />
    </main>
  );
}
