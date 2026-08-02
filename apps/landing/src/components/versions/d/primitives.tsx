// primitives.tsx — общая обвязка секций версии D.
//
// Все девять блоков страницы устроены одинаково: разделитель сверху, слева
// эйбров «NN — НАЗВАНИЕ», справа «призрачный» номер антиквой, дальше контент.
// Держим это в одном месте, чтобы порядок и отступы не расходились от секции к
// секции при правках.

import type { ReactNode } from 'react';

import { playfair } from './fonts';

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
      className={`px-5 pb-[104px] pt-[84px] sm:px-8 ${tone === 'warm' ? 'bg-[#F7F6F2]' : 'bg-white'}`}
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
    <h2 className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]">
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

/** Строка-вывод антиквой в конце блока: вторая половина — цветом акцента. */
export function ClosingLine({ lead, accent }: { lead: ReactNode; accent: ReactNode }) {
  return (
    <p
      className={`${playfair.className} mx-auto mt-14 max-w-[720px] text-balance text-center text-[clamp(20px,2.4vw,26px)] font-medium italic leading-[1.45] text-[#101826]`}
    >
      {lead} <span className="text-[color:var(--da)]">{accent}</span>
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
