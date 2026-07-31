// VersionC.tsx — эталонная «страница-решение» (`маркетинг/46`).
//
// Порядок блоков отвечает цепочке принятия решения, один блок — один вопрос:
//   Hero            — что это и что я получу
//   Узнавание       — это про меня
//   Разобранная неделя — как это выглядит и что я получу за неделю
//   Цена и действие — сколько и что дальше
//   Форма           — целевое действие
//   Второй слой     — «а если…?», раскрывается по запросу
//
// Hero пока общий с версией A: меню и залипающая шапка живут внутри `HeroSSR`.
// Когда у C появится собственный первый экран, шапку с меню нужно будет вынести
// в отдельный layout-компонент — иначе версия останется без навигации
// (согласовано с параллельной задачей по меню, см. `46` фаза 2).

import FooterSSR from '@/components/FooterSSR';
import HeroSSR from '@/components/HeroSSR';
import PriceSection from '@/components/versions/c/PriceSection';
import RecognitionSection from '@/components/versions/c/RecognitionSection';
import ReviewedWeekSection from '@/components/versions/c/ReviewedWeekSection';
import SecondLayerSection from '@/components/versions/c/SecondLayerSection';
import StickyCta from '@/components/versions/c/StickyCta';
import TrialSection from '@/components/versions/c/TrialSection';
import { VARIANTS } from '@/config/landing-variants';

// Навигация версии C: у неё свои блоки, поэтому пункты меню версии A вели бы
// в никуда. Контракт `NavLink` не меняем и чужой конфиг не трогаем — просто
// передаём собственный список через существующий проп `content`.
const C_NAV_LINKS = [
  { id: 'recognition', label: 'ситуация', href: '#recognition', hint: 'С чем обычно приходят' },
  {
    id: 'reviewed-week',
    label: 'разобранная неделя',
    href: '#reviewed-week',
    hint: 'Что вы получите за неделю',
  },
  { id: 'pricing', label: 'тарифы', href: '#pricing', hint: 'Self, Pro, Pro Спорт' },
  { id: 'trial', label: 'заявка', href: '#trial', hint: 'Неделя Pro бесплатно' },
  { id: 'details', label: 'подробности', href: '#details', hint: 'Сравнение, стандарт, вопросы' },
];

export default function VersionC() {
  const content = { ...VARIANTS.A, nav: { links: C_NAV_LINKS } };

  return (
    <>
      <HeroSSR content={content} variant="A" />

      {/*
        Кнопка hero «Понять, как работает HEYS» и подсказка прокрутки ведут на
        `#curator` — этот якорь зашит в `HeroSSR`, а такой секции у версии C нет.
        Ставим алиас на первый содержательный блок, чтобы переход работал.
        Когда у C появится собственный hero, алиас уйдёт вместе с ним.
      */}
      <div id="curator" aria-hidden="true" />

      <RecognitionSection />
      <ReviewedWeekSection />
      <PriceSection />
      <TrialSection />
      <SecondLayerSection />
      <FooterSSR />

      {/* Действие доступно с любого экрана, а не только из блока формы. */}
      <StickyCta />
    </>
  );
}
