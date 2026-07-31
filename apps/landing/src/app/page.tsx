// Главная страница — основная (публичная) версия лендинга.
//
// Черновые версии B и C живут отдельными статическими роутами `/v/b/` и
// `/v/c/` и в разметку этой страницы не попадают: посторонний не увидит их ни
// на экране, ни в исходном коде. Переключатель между версиями — приватный
// инструмент владельца (`22` п. 3.17, план `маркетинг/46`), это не
// A/B-эксперимент на посетителях.

import { Metadata } from 'next';

import VersionSwitcherFab from '@/components/VersionSwitcherFab';
import VersionA from '@/components/versions/VersionA';
import { VARIANTS } from '@/config/landing-variants';

// Метаданные для главной страницы
export const metadata: Metadata = {
  title: `HEYS — ${VARIANTS.A.hero.headline}`,
  description: VARIANTS.A.hero.subheadline,
  openGraph: {
    title: `HEYS — ${VARIANTS.A.hero.headline}`,
    description: VARIANTS.A.hero.subheadline,
  },
};

export default function Home() {
  return (
    <main>
      <VersionA />

      {/* Приватный переключатель: у постороннего отсутствует в разметке. */}
      <VersionSwitcherFab current="A" />
    </main>
  );
}
