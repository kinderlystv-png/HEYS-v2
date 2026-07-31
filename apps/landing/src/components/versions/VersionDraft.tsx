// VersionDraft.tsx — заглушка для версий, которые ещё не собраны.
//
// Показывается только владельцу (B и C открываются по явной ссылке `?v=…`),
// поэтому здесь допустим служебный тон: это рабочая страница, а не публичный
// экран. Hero подключён настоящий, чтобы уже на этом этапе было видно, что
// меню и первый экран одинаково работают во всех версиях.

import { type ReactNode } from 'react';

import HeroSSR from '@/components/HeroSSR';
import { VARIANTS } from '@/config/landing-variants';
import { VERSION_META, type LandingVersion } from '@/config/landing-versions';

interface VersionDraftProps {
  version: LandingVersion;
  /** Что появится в этой версии — короткий план для владельца. */
  plan: string[];
  /**
   * Свой первый экран версии. Пока версия его не задала, показывается hero
   * версии A — чтобы черновик всё равно открывался как страница, а не как
   * голый список планов.
   */
  hero?: ReactNode;
}

export default function VersionDraft({ version, plan, hero }: VersionDraftProps) {
  const meta = VERSION_META[version];

  return (
    <>
      {hero ?? <HeroSSR content={VARIANTS.A} variant="A" />}

      <section className="bg-white px-5 py-16 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-sm font-medium tracking-wide text-blue-700">
            Версия {version} · черновик
          </p>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{meta.label}</h2>
          <p className="mt-3 text-slate-600">{meta.hint}</p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold text-slate-900">Что здесь появится</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {plan.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-slate-400">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 text-sm text-slate-500">
            {hero
              ? 'Первый экран у этой версии собственный, меню общее для всех версий: правки меню появляются здесь автоматически.'
              : 'Первый экран и меню уже общие для всех версий: они берутся из тех же компонентов, что и в версии A, поэтому правки меню появляются здесь автоматически.'}
          </p>
        </div>
      </section>
    </>
  );
}
