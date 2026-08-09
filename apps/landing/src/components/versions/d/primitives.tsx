// primitives.tsx — общая обвязка секций версии D.
//
// Все девять блоков страницы устроены одинаково: разделитель сверху, слева
// эйбров «NN — НАЗВАНИЕ», справа «призрачный» номер антиквой, дальше контент.
// Держим это в одном месте, чтобы порядок и отступы не расходились от секции к
// секции при правках.

import type { ReactNode } from 'react';

import { playfair, playfairRoman } from './fonts';

/** Акцент внутри заголовка: Playfair Display italic (`README` § Типографика). */
export function Accent({ children }: { children: ReactNode }) {
  return <span className={`${playfair.className} font-medium italic`}>{children}</span>;
}

interface SectionProps {
  id: string;
  /** Номер секции: «01»…«06». FAQ идёт без номера — тогда `null`. */
  index: string | null;
  label: string;
  /** `warm` — тёплый фон `#F7F6F2`, `white` — белый. */
  tone?: 'white' | 'warm';
  children: ReactNode;
}

export function Section({ id, index, label, tone = 'white', children }: SectionProps) {
  return (
    <section
      id={id}
      className={`px-8 pb-[104px] pt-[84px] ${tone === 'warm' ? 'bg-[#F7F6F2]' : 'bg-white'}`}
    >
      <div className="mx-auto w-full max-w-[1060px]">
        <div className="border-t border-[rgba(16,24,38,0.12)] pt-6">
          <div className="flex items-start justify-between gap-6">
            <p className="max-w-[240px] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.18em] text-[#8A94A2]">
              {index ? `${index} — ` : ''}
              {label}
            </p>
            {index ? (
              <span
                aria-hidden="true"
                className={`${playfair.className} select-none text-[44px] italic leading-[0.6] text-[rgba(16,24,38,0.09)]`}
              >
                {index}
              </span>
            ) : null}
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}

/** Заголовок секции по центру. `text-wrap: balance` — требование макета. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(30px,3.8vw,44px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]">
      {children}
    </h2>
  );
}

/** Подзаголовок под заголовком секции. */
export function SectionLead({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-5 max-w-[600px] text-center text-[15px] leading-[1.6] text-[#5B6472]">
      {children}
    </p>
  );
}

/**
 * Строка-вывод антиквой в конце блока: вторая половина — цветом акцента.
 *
 * Без курсива: в прототипе (`design/landing-d/prototype.html` строка 244) он
 * оставлен только акценту внутри заголовков (`Accent`). Иначе две курсивные
 * строки подряд — в секциях 01 и 02 — спорят с акцентами в H2 и читаются
 * тяжелее.
 *
 * Вступление мелкое и приглушённое, вторая половина — крупнее, полужирная и
 * цветом акцента: это не декоративный хвост фразы, а сам вывод блока (в
 * `PainSection` — «не всё равно», в `HowItWorks` — что куратор уточняет раньше
 * совета). Решение владельца 2026-08-08: раньше обе половины шли одним кеглем,
 * и главная мысль терялась рядом со вступлением того же веса.
 */
// ПРАВИЛО МАСШТАБА (действует на всю версию D).
//
// Заголовки секций адаптивные, и ниже ~1150px они падают до своего минимума.
// Всё крупное внутри секций обязано падать вместе с ними, иначе иерархия
// схлопывается: замер 2026-08-08 на 440px показывал акцент 0.77 от заголовка,
// «Антон» 0.73, цену «0 ₽» — 2.00, то есть вдвое крупнее заголовка секции.
// Читается это не как «крупный шрифт», а как отсутствие иерархии.
//
// Поэтому крупные размеры задаются через `clamp`: максимум равен прототипу
// (десктоп не меняется), минимум держит здоровую долю от заголовка —
// подзаголовок 0.55–0.60, акцентная строка 0.60–0.65. Фиксированный `px`
// допустим только для текста мельче ~16px: он и так не спорит с заголовком.
//
// У самой `ClosingLine` доля выше нормы — 0.80 от заголовка на узких экранах,
// и это осознанное исключение. Норма выведена для элементов, которые видны
// одновременно с заголовком секции; `ClosingLine` же стоит в самом низу, через
// весь список или всю переписку от него, и одновременно они не встречаются
// никогда. Её реальные соседи — пункты в 15px, и на их фоне первая правка до
// 19px потеряла главную мысль блока (замечание владельца 2026-08-08: «теряется
// на фоне того, что выше»). Обе половины подняты вместе: коэффициенты `vw`
// тоже в отношении 1.5, поэтому вступление и вывод держат одну пропорцию на
// любой ширине, а не только на границах диапазона.
export function ClosingLine({ lead, accent }: { lead: ReactNode; accent: ReactNode }) {
  return (
    <p
      className={`${playfairRoman.className} mx-auto mt-14 max-w-[720px] text-balance text-center text-[clamp(16px,1.8vw,20px)] font-normal leading-[1.5] text-[#5B6472]`}
    >
      {lead}
      {/* Вывод отдельной строкой, а не инлайном за вступлением. Инлайновый
          вариант отдавал перенос на волю ширины экрана: на десктопе строка
          рвалась перед выводом и выглядела задуманной, а на 360px (Galaxy S9+,
          замечание владельца 2026-08-09) вывод начинался в хвосте предыдущей
          строки — два кегля в одной строке читались обрывком, а не переходом
          к главной мысли. `block` убирает эту случайность: перенос одинаков на
          любой ширине. */}
      <span className="mt-2 block text-[clamp(24px,2.7vw,30px)] font-semibold leading-[1.35] text-[color:var(--da)]">
        {accent}
      </span>
    </p>
  );
}

/** Основная кнопка страницы: тёмная плашка, ведёт к действию. */
export function PrimaryCta({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      data-own-cta
      href={href}
      className={`inline-flex items-center justify-center rounded-[14px] bg-[#12283E] px-[26px] py-[14px] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(18,40,62,0.18)] transition-transform duration-[250ms] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(18,40,62,0.24)] ${className}`}
    >
      {children}
    </a>
  );
}

/** Подпись под кнопкой или карточкой. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[12px] leading-[1.5] text-[#9AA3B0]">{children}</p>;
}
