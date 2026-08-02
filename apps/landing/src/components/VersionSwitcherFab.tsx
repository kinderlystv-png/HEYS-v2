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
 * Сам параметр сразу вычищается из адресной строки, иначе он уехал бы наружу
 * вместе со скопированной ссылкой. `?owner=0` снимает флаг — это единственный
 * способ отозвать доступ на чужом устройстве.
 *
 * С 2026-08-02 признак «свой» снова единственное условие показа — см.
 * `TEMPORARY_PUBLIC_SWITCHER`.
 */

const OWNER_FLAG_KEY = 'heys_dev_mode';
const OWNER_PARAM = 'owner';

/**
 * Временный публичный режим (решение владельца 2026-07-31, `15` №46) **отменён
 * 2026-08-02 решением `15` №50**: переключатель снова виден только по признаку
 * «свой». Причина отката — черновики `B` и `C` с незаменёнными материалами
 * достижимы с публичной страницы в один клик, а с версией `D` их станет три.
 *
 * Значение оставлено как переключатель на случай, если владельцу снова
 * понадобится сравнивать версии с чужого устройства: `true` возвращает
 * публичный режим, логика признака «свой» ниже при этом не меняется.
 */
const TEMPORARY_PUBLIC_SWITCHER = false;

export default function VersionSwitcherFab({ current }: { current: LandingVersion }) {
  // При временном публичном режиме кнопка есть уже в статической разметке —
  // начальное состояние совпадает с тем, что выставит эффект, поэтому
  // рассинхрона гидратации нет.
  const [allowed, setAllowed] = useState(TEMPORARY_PUBLIC_SWITCHER);
  const [open, setOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const { hostname, search } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    let hasFlag = false;
    try {
      hasFlag = localStorage.getItem(OWNER_FLAG_KEY) === 'true';

      const param = new URLSearchParams(search).get(OWNER_PARAM);
      if (param === '1') {
        localStorage.setItem(OWNER_FLAG_KEY, 'true');
        hasFlag = true;
      } else if (param === '0') {
        // Флаг живёт в браузере бессрочно. Если ссылку с `?owner=1` открыли не
        // на том устройстве, отозвать доступ больше нечем — кроме `?owner=0`.
        localStorage.removeItem(OWNER_FLAG_KEY);
        hasFlag = false;
      }

      if (param !== null) {
        // Параметр разовый: признак уже сохранён в браузере, а в адресной
        // строке он остался бы и уехал дальше вместе со скопированной ссылкой.
        const url = new URL(window.location.href);
        url.searchParams.delete(OWNER_PARAM);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* приватный режим — просто остаёмся скрытыми */
    }

    setAllowed(TEMPORARY_PUBLIC_SWITCHER || isLocal || hasFlag);
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
    <div className="fixed bottom-2 left-2 z-[9998] font-sans">
      {open ? (
        <div
          role="menu"
          aria-label="Версии лендинга"
          className="absolute bottom-11 left-0 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
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

      {/* Кнопка висит поверх страницы, которую владелец в этот момент и
          оценивает, поэтому она отжата в самый угол и в покое приглушена:
          непрозрачный круг закрывал текст на каждом втором экране. При
          наведении, фокусе и в открытом состоянии она снова полностью видима.
          Размер меньше пальцевого минимума сознательно — это приватный
          инструмент владельца, а не элемент продукта. */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Версия лендинга: ${current}. Открыть выбор версии`}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold shadow-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          open
            ? 'scale-95 border-slate-800 bg-slate-800 text-white'
            : 'border-slate-200 bg-white/70 text-slate-800 opacity-45 backdrop-blur-sm hover:scale-105 hover:bg-white hover:opacity-100 focus-visible:bg-white focus-visible:opacity-100'
        }`}
      >
        {current}
      </button>
    </div>
  );
}
