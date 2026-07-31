// Черновая версия B — «страница-знакомство» по образцу Future (`маркетинг/47`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.
//
// Страница собрана вокруг скролл-hero (`45`, «Скролл-механика Future»). Готовые
// главы из `VersionB` в репозитории есть, но здесь пока не подключены: сначала
// владелец выбирает первый экран, потом под него собирается тело версии.

import { Metadata } from 'next';

import VersionDraft from '@/components/versions/VersionDraft';
import FontSwitcherFab from '@/components/versions/b/FontSwitcherFab';
import HeroScrollStage from '@/components/versions/b/HeroScrollStage';
import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import { VARIANTS } from '@/config/landing-variants';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия B (черновик)',
  robots: DRAFT_ROBOTS,
};

export default function VersionBPage() {
  return (
    <main>
      <VersionDraft
        version="B"
        hero={<HeroScrollStage content={VARIANTS.A} />}
        plan={[
          'Нарратив по образцу Future: сначала человеческий смысл, затем интерфейс как его доказательство',
          'Видимая работа специалиста вместо описания процесса',
          'Свой ритм блоков: один экран — один смысл',
        ]}
      />

      <VersionSwitcherFab current="B" />
      <FontSwitcherFab />
    </main>
  );
}
