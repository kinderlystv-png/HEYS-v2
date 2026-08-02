// theme.ts — палитра версии D (`design/landing-d/README.md` § Design Tokens).
//
// Цвета держим здесь, а не в `tailwind.config.js`: конфиг общий для всех версий
// лендинга, и добавлять туда десяток частных токенов одной черновой версии —
// значит тянуть их в сборку публичной страницы. В разметке используются
// arbitrary-значения Tailwind (`bg-[#F7F6F2]`) и CSS-переменная акцента.

/** Акцент темы. Вынесен в переменную: дизайнер предусмотрел смену акцента. */
export const D_ACCENT = '#2E7CC0';
export const D_ACCENT_HOVER = '#1D5E96';
/** Акцент на тёмном фоне — контраст на `#0E1D2E` и `#12283E`. */
export const D_ACCENT_ON_DARK = '#8FC1E8';

export const D_TEXT = '#101826';
export const D_TEXT_SECONDARY = '#5B6472';
export const D_TEXT_MUTED = '#8A94A2';
export const D_TEXT_CAPTION = '#9AA3B0';

export const D_DARK = '#12283E';
export const D_DARK_CARD = '#0E1D2E';
export const D_DARK_DEEP = '#0A1119';

export const D_BG_WARM = '#F7F6F2';
export const D_BG_CARD = '#FBFAF7';

/** Семантика недельного артефакта — секция 04. */
export const D_WEEK = {
  full: '#4CAF7D',
  skipped: '#DDEEE4',
  lateDinner: '#E0A93E',
  shortSleep: '#D9707E',
  neutral: '#E4E2DB',
} as const;

/** Переменные, которые версия вешает на свою обёртку. */
export const D_THEME_VARS = {
  '--da': D_ACCENT,
  '--da-hover': D_ACCENT_HOVER,
} as Record<string, string>;
