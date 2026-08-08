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

/**
 * Звёздная текстура тёмных поверхностей: герой, карточка пробной недели, шапки
 * Pro и Pro Спорт в тарифах. Inline data-URI, чтобы не заводить сетевой запрос
 * ради 200 байт.
 *
 * Вынесена сюда 2026-08-09: до этого литерал был скопирован в `HeroD` и
 * `TrialSection`, и третья копия в тарифах закрепила бы расхождение — рисунок
 * держит родство поверхностей, и он должен меняться в одном месте.
 *
 * На печати и в PDF текстура мажется — в печатной версии убирать
 * (решение к порту №05, пакет тарифов).
 */
export const D_STAR_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 5.5c.9 4.1.9 4.1 5 4.9-4.1.9-4.1.9-5 5-.9-4.1-.9-4.1-5-5 4.1-.8 4.1-.8 5-4.9Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")";

/** Новые стопы шапок тарифных карточек (пакет тарифов, § Токены). */
export const D_TARIFF_HEADER = {
  /** Self: верхний стоп новый, нижний — системный фон карточек. */
  self: 'linear-gradient(180deg,#E9EFF6 0%,#F3F7FB 100%)',
  pro: 'linear-gradient(180deg,#12263B 0%,#0E1D2E 55%,#0A1420 100%)',
  /** Pro Спорт: от акцента тарифа к производному тёмному `#3E4069`. */
  proSport: 'linear-gradient(180deg,#4A4C7E 0%,#3E4069 100%)',
} as const;

/** Минимальный контраст подписей на светлом: `#5F6A77` ≈ 5.2:1. Серее — ниже AA. */
export const D_TEXT_CAPTION_AA = '#5F6A77';

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
