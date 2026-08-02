// Черновая версия D — «вникание» (решение владельца `маркетинг/15` №50).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import VersionD from '@/components/versions/VersionD';
import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия D (черновик)',
  robots: DRAFT_ROBOTS,
  openGraph: {
    title: 'HEYS — версия D (черновик)',
    description: 'Куратор, который спрашивает, прежде чем советовать. Внутренний черновик.',
    type: 'website',
  },
};

export default function VersionDPage() {
  return (
    <main>
      <VersionD />

      <VersionSwitcherFab current="D" />
    </main>
  );
}
