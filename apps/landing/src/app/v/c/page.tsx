// Черновая версия C — эталонная «страница-решение» (`маркетинг/46`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import VersionDraft from '@/components/versions/VersionDraft';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия C (черновик)',
  robots: DRAFT_ROBOTS,
};

export default function VersionCPage() {
  return (
    <main>
      <VersionDraft
        version="C"
        plan={[
          'Решение за три экрана: обещание, доказательство, цена с действием',
          'Разобранная неделя как артефакт — главный аргумент вместо прозы',
          'Второй слой по умолчанию: сравнения, регламент и условия раскрываются по запросу',
          'Цель: не больше 7 экранов, форма не ниже 35% страницы',
        ]}
      />

      <VersionSwitcherFab current="C" />
    </main>
  );
}
