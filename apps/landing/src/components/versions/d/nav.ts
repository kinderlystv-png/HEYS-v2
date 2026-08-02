// nav.ts — пункты меню версии D. Общие для липкой шапки и бургер-оверлея,
// поэтому вынесены из обоих компонентов: расхождение порядка или якорей между
// десктопным меню и мобильным читалось бы как две разные страницы.

export interface DNavLink {
  /** Номер слева от названия; у FAQ вместо номера стоит «FAQ». */
  index: string;
  label: string;
  href: string;
}

export const D_NAV_LINKS: readonly DNavLink[] = [
  { index: '01', label: 'ситуация', href: '#pain' },
  { index: '02', label: 'как устроено', href: '#curator' },
  { index: '03', label: 'первый месяц', href: '#how-it-works' },
  { index: '04', label: 'неделя', href: '#week' },
  { index: '05', label: 'доверие', href: '#trust' },
  { index: '06', label: 'тарифы', href: '#pricing' },
  { index: 'FAQ', label: 'вопросы', href: '#faq' },
];

/** Текст главного действия. Один на всю страницу — шапка, меню, липкий CTA. */
export const D_CTA_LABEL = 'Бесплатная неделя Pro';
export const D_CTA_HREF = '#trial';
export const D_CTA_NOTE = 'Без карты и автосписаний';
