// FontSwitcherFab.tsx — приватный подбор шрифта для версии B.
//
// Инструмент владельца, не элемент продукта: кнопка стоит рядом с
// переключателем версий, видна только на localhost или при флаге `heys_dev_mode`
// и в SSR-разметке отсутствует. Выбор применяется ко ВСЕМ текстовым элементам
// страницы сразу, чтобы решение принималось по цельной картинке, а не по
// одному заголовку. Выбор запоминается в браузере — перезагрузка его не сбросит.
//
// Кандидаты подобраны под задачу «как у Future»: у них дисплейная антиква с
// сильным контрастом штриха (`seasonMix`). Все варианты обязательно с
// кириллицей и self-host через `next/font` — внешних CDN-запросов в runtime нет
// (важно для CSP лендинга). Шрифт скачивается только когда он реально выбран.

'use client';

import {
  Cormorant_Garamond,
  Golos_Text,
  Manrope,
  Playfair_Display,
  Prata,
  Spectral,
} from 'next/font/google';
import { useCallback, useEffect, useState } from 'react';

const playfair = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const prata = Prata({ subsets: ['cyrillic', 'latin'], weight: '400', display: 'swap' });
const cormorant = Cormorant_Garamond({
  subsets: ['cyrillic', 'latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});
const spectral = Spectral({
  subsets: ['cyrillic', 'latin'],
  weight: ['300', '400', '600'],
  display: 'swap',
});
const manrope = Manrope({ subsets: ['cyrillic', 'latin'], display: 'swap' });
const golos = Golos_Text({ subsets: ['cyrillic', 'latin'], display: 'swap' });

interface FontOption {
  id: string;
  label: string;
  /** Чем этот вариант отличается на глаз — подсказка для выбора. */
  hint: string;
  /** `null` — ничего не подменяем, страница в своём обычном шрифте. */
  stack: string | null;
}

const FONTS: ReadonlyArray<FontOption> = [
  {
    id: 'default',
    label: 'Как на странице',
    hint: 'Spectral — шрифт версии B по умолчанию',
    stack: null,
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    hint: 'Контрастная антиква — та же, что в отбивках демо',
    stack: playfair.style.fontFamily,
  },
  {
    id: 'prata',
    label: 'Prata',
    hint: 'Дисплейная антиква, нарисована под кириллицу',
    stack: prata.style.fontFamily,
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    hint: 'Самая тонкая и воздушная из антикв',
    stack: cormorant.style.fontFamily,
  },
  {
    id: 'spectral',
    label: 'Spectral',
    hint: 'Спокойная антиква, хорошо читается в мелком',
    stack: spectral.style.fontFamily,
  },
  {
    id: 'manrope',
    label: 'Manrope',
    hint: 'Геометрический гротеск, если антиква не зайдёт',
    stack: manrope.style.fontFamily,
  },
  {
    id: 'golos',
    label: 'Golos Text',
    hint: 'Нейтральный русский гротеск',
    stack: golos.style.fontFamily,
  },
];

const STORAGE_KEY = 'heys_landing_font';
const OWNER_FLAG_KEY = 'heys_dev_mode';

export default function FontSwitcherFab() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('default');

  useEffect(() => {
    const { hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    let hasFlag = false;
    try {
      hasFlag = localStorage.getItem(OWNER_FLAG_KEY) === 'true';
    } catch {
      /* приватный режим — просто остаёмся скрытыми */
    }
    setAllowed(isLocal || hasFlag);
  }, []);

  const applyFont = useCallback((id: string) => {
    const option = FONTS.find((font) => font.id === id) ?? FONTS[0];
    const root = document.documentElement;
    if (option.stack) {
      root.style.setProperty('--hb-font', option.stack);
      root.setAttribute('data-hb-font', option.id);
    } else {
      root.style.removeProperty('--hb-font');
      root.removeAttribute('data-hb-font');
    }
    setCurrent(option.id);
    try {
      localStorage.setItem(STORAGE_KEY, option.id);
    } catch {
      /* выбор просто не переживёт перезагрузку */
    }
  }, []);

  // Восстанавливаем прошлый выбор до первого клика — иначе после перезагрузки
  // сравнение начинается заново.
  useEffect(() => {
    if (!allowed) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* нечего восстанавливать */
    }
    if (saved && saved !== 'default') applyFont(saved);
  }, [allowed, applyFont]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!allowed) return null;

  const currentLabel = FONTS.find((font) => font.id === current)?.label ?? 'Как сейчас';

  return (
    <>
      {/* Подмена идёт по всей странице, включая шапку и текст внутри демо:
          решение о шрифте принимается по цельному экрану. `!important` нужен,
          потому что почти у каждого текстового узла шрифт задан утилитой.
          Сама панель выбора из подмены исключена, а каждое название набрано
          своим шрифтом — иначе список превращается в семь одинаковых строк и
          сравнивать нечего. Специфичность правил подобрана так, чтобы превью
          перебивало исключение, а исключение — общую подмену. */}
      <style>
        {[
          'html[data-hb-font] body, html[data-hb-font] body * { font-family: var(--hb-font) !important; }',
          'html[data-hb-font] .hb-font-ui, html[data-hb-font] .hb-font-ui * { font-family: ui-sans-serif, system-ui, sans-serif !important; }',
          // Панель не должна расти вместе со страницей: компенсация кегля
          // рассчитана на Spectral в контенте, а не на служебный интерфейс.
          '.hb-font-ui, .hb-font-ui * { font-size-adjust: none; }',
          ...FONTS.filter((font) => font.stack).map(
            (font) =>
              `html[data-hb-font] .hb-font-ui .hb-font-preview-${font.id} { font-family: ${font.stack} !important; }`,
          ),
        ].join('\n')}
      </style>

      <div className="hb-font-ui fixed bottom-2 left-12 z-[9998] font-sans">
        {open ? (
          <div
            role="menu"
            aria-label="Шрифт страницы"
            className="absolute bottom-11 left-0 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Шрифт страницы</p>
              <p className="mt-0.5 text-xs text-slate-500">Меняется сразу, видно только вам</p>
            </div>
            <div className="flex max-h-[60vh] flex-col overflow-y-auto py-1">
              {FONTS.map((font) => {
                const isCurrent = font.id === current;
                return (
                  <button
                    key={font.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    onClick={() => applyFont(font.id)}
                    className={`flex min-h-[44px] flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 ${
                      isCurrent ? 'text-blue-700' : 'text-slate-700'
                    }`}
                  >
                    {/* Название набрано самим шрифтом — так видно начертание до
                        применения ко всей странице. */}
                    <span
                      className={`hb-font-preview-${font.id} text-[15px] font-medium`}
                      style={font.stack ? { fontFamily: font.stack } : undefined}
                    >
                      {font.label}
                    </span>
                    <span className="text-xs leading-4 text-slate-500">{font.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Шрифт страницы: ${currentLabel}. Открыть выбор шрифта`}
          className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-semibold shadow-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            open
              ? 'scale-95 border-slate-800 bg-slate-800 text-white'
              : 'border-slate-200 bg-white/70 text-slate-800 opacity-45 backdrop-blur-sm hover:scale-105 hover:bg-white hover:opacity-100 focus-visible:bg-white focus-visible:opacity-100'
          }`}
        >
          Aa
        </button>
      </div>
    </>
  );
}
