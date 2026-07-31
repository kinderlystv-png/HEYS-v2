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
// Hero общий с версией A намеренно: он совпал бы с ним по фону, демо, анимациям
// и логике масштабирования, а расходились бы только тексты и якоря — их версия
// передаёт через контент. Решение и условия пересмотра — в `46` фаза 3.

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
  // Две цели первого экрана намеренно разные. Кнопка обещает объяснить, как
  // работает HEYS, — ведём сразу в блок механики и артефакта недели, это прямой
  // ответ на её подпись. Подсказка прокрутки обещает следующий блок и ведёт
  // именно в него, чтобы тот, кто просто листает, не пропустил узнавание.
  const content = {
    ...VARIANTS.A,
    hero: {
      ...VARIANTS.A.hero,
      ctaPrimaryHref: '#reviewed-week',
      scrollCueHref: '#recognition',
    },
    nav: { links: C_NAV_LINKS },
  };

  return (
    <>
      <HeroSSR content={content} variant="A" />

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
