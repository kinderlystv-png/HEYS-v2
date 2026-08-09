// Черновая версия B — «страница-знакомство» по образцу Future (`маркетинг/47`).
//
// Отдельный статический роут: страница существует для личного выбора владельца
// и не связана ссылками с публичной версией. Индексация запрещена.

import { Metadata } from 'next';

import { VERSION_B_FONT_SIZE_ADJUST, versionBFont } from '@/components/versions/b/fonts';
import FontSwitcherFab from '@/components/versions/b/FontSwitcherFab';
import VersionB from '@/components/versions/VersionB';
import { DRAFT_ROBOTS } from '@/config/landing-versions';

export const metadata: Metadata = {
  title: 'HEYS — версия B (черновик)',
  robots: DRAFT_ROBOTS,
};

export default function VersionBPage() {
  return (
    // Шрифт версии и компенсация его мелкости задаются здесь, а не поблочно:
    // так они действуют на всю страницу сразу и приходят уже с сервера, без
    // подмены шрифта на глазах у посетителя. Подробности — в `fonts.ts`.
    <main className={versionBFont.className} style={{ fontSizeAdjust: VERSION_B_FONT_SIZE_ADJUST }}>
      <VersionB />

      <FontSwitcherFab />
    </main>
  );
}
