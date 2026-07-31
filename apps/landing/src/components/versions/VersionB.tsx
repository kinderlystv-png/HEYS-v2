// VersionB.tsx — «страница-знакомство» по образцу Future (`маркетинг/47`).
//
// Роль версии: ответить, кто именно будет вести неделю и почему ему можно
// доверять. `C` отвечает на «что я получу и сколько это стоит», `B` — на
// «кто этот человек». Ритм — четыре полноэкранные главы по `45`; смысловой
// центр — глава-знакомство (решение `15` №45 о публичной личности).
//
// Hero общий с A и C: демо-фильм с отбивками — часть нарратива B, якоря
// версия передаёт через контент, как это делает C. Тарифы, форма, FAQ и футер
// переиспользуются каноническим хвостом варианта A: `44` и контракт `3.14` в
// версии B не пересобираются (`47`, принцип 5).

import HeroSSR from '@/components/HeroSSR';
import VariantLandingSectionsSSR from '@/components/VariantLandingSectionsSSR';
import Chapter from '@/components/versions/b/Chapter';
import CuratorIntro from '@/components/versions/b/CuratorIntro';
import MediaSlot from '@/components/versions/b/MediaSlot';
import WeekFrame from '@/components/versions/b/WeekFrame';
import { VARIANTS } from '@/config/landing-variants';

// Навигация версии B: пункты меню ведут в главы этой версии, а не в блоки A.
// Контракт `NavLink` не меняем — передаём свой список через проп `content`.
const B_NAV_LINKS = [
  { id: 'diary', label: 'дневник', href: '#chapter-diary', hint: 'Не нужно вести дневник самому' },
  { id: 'week', label: 'неделя', href: '#chapter-week', hint: 'Один день не объясняет неделю' },
  {
    id: 'life',
    label: 'обычная жизнь',
    href: '#chapter-life',
    hint: 'План выдерживает обычную жизнь',
  },
  { id: 'curator', label: 'куратор', href: '#chapter-curator', hint: 'Кто ведёт вашу неделю' },
  { id: 'pricing', label: 'тарифы', href: '#pricing', hint: 'Self, Pro, Pro Спорт' },
  { id: 'faq', label: 'вопросы', href: '#faq', hint: 'Ответы на частые вопросы' },
];

export default function VersionB() {
  // Кнопка hero обещает объяснить, как работает HEYS, — в B ответ начинается
  // с первой главы; туда же ведёт и подсказка прокрутки.
  const content = {
    ...VARIANTS.A,
    hero: {
      ...VARIANTS.A.hero,
      ctaPrimaryHref: '#chapter-diary',
      scrollCueHref: '#chapter-diary',
    },
    nav: { links: B_NAV_LINKS },
  };

  return (
    <>
      <HeroSSR content={content} variant="A" />

      <Chapter
        id="chapter-diary"
        kicker="Глава 1"
        phrase="Не нужно вести дневник самому."
        lead="Фото, голосовое или короткое сообщение — этого достаточно. Запись в дневнике делает куратор."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <MediaSlot format="видео 3–5 сек" frame="Завтрак снимают на телефон и уходят по делам" />
          <MediaSlot format="экран приложения" frame="Дневник за день: запись внёс куратор" />
        </div>
      </Chapter>

      <Chapter
        id="chapter-week"
        tone="shaded"
        kicker="Глава 2"
        phrase="Один день не объясняет неделю."
        lead="Смысл появляется, когда семь дней видны рядом — вместе со сном, нагрузкой и контекстом."
      >
        <WeekFrame />
      </Chapter>

      <Chapter
        id="chapter-life"
        kicker="Глава 3"
        phrase="План выдерживает обычную жизнь."
        lead="Поездка, поздний ужин, тренировка. Куратор не отменяет неделю и не требует идеальности — он учитывает контекст и помогает выбрать следующий шаг."
      >
        <div className="grid grid-cols-3 gap-3">
          <MediaSlot ratio="square" format="3–5 сек" frame="Еда на ходу, рабочий день" />
          <MediaSlot ratio="square" format="3–5 сек" frame="Поздний ужин" />
          <MediaSlot ratio="square" format="3–5 сек" frame="Прогулка или тренировка" />
        </div>
      </Chapter>

      <Chapter
        id="chapter-curator"
        tone="shaded"
        kicker="Глава 4"
        phrase="Рядом человек, который знает контекст."
        lead="Дневник и карту недели смотрит не алгоритм, а куратор — и решение всегда учитывает вашу неделю, а не идеальный план."
      >
        <CuratorIntro />
      </Chapter>

      {/* Тарифы, форма, FAQ и футер — канонический хвост варианта A. */}
      <VariantLandingSectionsSSR content={content} variant="A" />
    </>
  );
}
