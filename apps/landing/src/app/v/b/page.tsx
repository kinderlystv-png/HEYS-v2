// Черновая версия B — «страница-знакомство» по образцу Future (`маркетинг/47`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import VersionB from '@/components/versions/VersionB';
import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия B (черновик)',
  robots: DRAFT_ROBOTS,
};

export default function VersionBPage() {
  return (
    <main>
      <VersionB />

      <VersionSwitcherFab current="B" />
    </main>
  );
}
