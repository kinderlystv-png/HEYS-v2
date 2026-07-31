'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  LANDING_VERSIONS,
  VERSION_META,
  versionPath,
  type LandingVersion,
} from '@/config/landing-versions';

/**
 * Приватный переключатель версий лендинга для владельца (`22` п. 3.17).
 *
 * Это НЕ инструмент A/B-эксперимента: посетители всегда видят основную версию,
 * а переключатель существует, чтобы владелец мог открыть A/B/C подряд и выбрать
 * ту, которая нравится больше. Поэтому у постороннего кнопки нет в разметке
 * вообще — компонент возвращает null до тех пор, пока не подтверждён признак
 * «свой». Проверка идёт на клиенте после монтирования, поэтому в SSR-HTML
 * переключателя тоже нет.
 *
 * Признак «свой»: localhost, либо флаг `heys_dev_mode` в localStorage, либо
 * разовый параметр `?owner=1` (он же ставит флаг, чтобы не тащить его дальше).
 */

const OWNER_FLAG_KEY = 'heys_dev_mode';
const OWNER_PARAM = 'owner';

export default function VersionSwitcherFab({ current }: { current: LandingVersion }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const { hostname, search } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    let hasFlag = false;
    try {
      hasFlag = localStorage.getItem(OWNER_FLAG_KEY) === 'true';
      if (new URLSearchParams(search).get(OWNER_PARAM) === '1') {
        localStorage.setItem(OWNER_FLAG_KEY, 'true');
        hasFlag = true;
      }
    } catch {
      /* приватный режим — просто остаёмся скрытыми */
    }

    setAllowed(isLocal || hasFlag);
  }, []);

  // Демонстрация в hero разворачивается на весь экран — не мешаем ей.
  useEffect(() => {
    const handler = (event: Event) => setDemoOpen(!!(event as CustomEvent).detail?.open);
    window.addEventListener('heys:demo-toggle', handler);
    return () => window.removeEventListener('heys:demo-toggle', handler);
  }, []);

  // Escape закрывает список.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const goTo = useCallback((version: LandingVersion) => {
    // Каждая версия — отдельный статический роут; структура у них разная,
    // поэтому позицию скролла между версиями не переносим.
    window.location.assign(versionPath(version));
  }, []);

  if (!allowed || demoOpen) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[9998] font-sans">
      {open ? (
        <div
          role="menu"
          aria-label="Версии лендинга"
          className="absolute bottom-16 left-0 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Версия лендинга</p>
            <p className="mt-0.5 text-xs text-slate-500">Видно только вам</p>
          </div>
          <div className="flex flex-col py-1">
            {LANDING_VERSIONS.map((version) => {
              const meta = VERSION_META[version];
              const isCurrent = version === current;
              return (
                <button
                  key={version}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => (isCurrent ? setOpen(false) : goTo(version))}
                  className={`flex min-h-[44px] items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 ${
                    isCurrent ? 'text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 text-slate-500'
                    }`}
                  >
                    {version}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{meta.label}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      {meta.hint}
                    </span>
                  </span>
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
        aria-label={`Версия лендинга: ${current}. Открыть выбор версии`}
        className={`flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold shadow-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          open
            ? 'scale-95 border-slate-800 bg-slate-800 text-white'
            : 'border-slate-200 bg-white text-slate-800 hover:scale-105'
        }`}
      >
        {current}
      </button>
    </div>
  );
}
