// fonts.ts — типографика версии D (`design/landing-d/README.md` § Design Tokens).
//
// Golos Text — основной гротеск страницы, Playfair Display italic — акценты в
// заголовках, цитаты и «призрачные» номера секций. Оба self-host'ятся через
// `next/font` на сборке: внешних CDN-запросов в runtime нет, это требование CSP
// лендинга (тот же приём, что в версии B — `versions/b/fonts.ts`).
//
// Версия D задаёт шрифт на своей обёртке, а не в `layout.tsx`: публичная версия
// A остаётся на Open Sans, и менять её типографику эта задача не вправе.

import { Golos_Text, Playfair_Display } from 'next/font/google';

export const golos = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-d-sans',
});

export const playfair = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: ['500'],
  style: ['italic'],
  display: 'swap',
  variable: '--font-d-display',
});
