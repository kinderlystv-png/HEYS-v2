// Черновая версия C — эталонная «страница-решение» (`маркетинг/46`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import VersionC from '@/components/versions/VersionC';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

// Свои OG-метаданные: без них отправленная владельцу ссылка на черновик
// показывала бы превью публичной версии A, и в переписке две версии было бы не
// различить. Черновик остаётся закрытым от индексации.
export const metadata: Metadata = {
  title: 'HEYS — версия C (черновик)',
  robots: DRAFT_ROBOTS,
  openGraph: {
    title: 'HEYS — версия C (черновик)',
    description: 'Страница-решение: разобранная неделя, цена и заявка. Внутренний черновик.',
    type: 'website',
  },
};

export default function VersionCPage() {
  return (
    <main>
      <VersionC />
    </main>
  );
}
