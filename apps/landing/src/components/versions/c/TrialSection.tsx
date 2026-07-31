// Блок 5 версии C — форма заявки.
//
// Сама форма переиспользуется целиком (`TrialForm`): в ней живут contract
// согласия и валидация, менять их нельзя (решение `3.14`). Отличие версии C —
// только обрамление: оффер сжат до сути, условия не пересказываются второй раз,
// потому что уже названы в блоке цены.
//
// Тексты оффера взяты из общего контента варианта A, без новых обещаний.

import TrialForm from '@/components/TrialForm';
import { VARIANTS } from '@/config/landing-variants';

export default function TrialSection() {
  const trial = VARIANTS.A.trial;

  return (
    <section id="trial" className="bg-slate-50 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
            {trial.title}
          </h2>
          <span className="text-sm font-medium text-slate-500">0 ₽ / 7 дней</span>
        </div>

        <p className="mt-3 text-[15px] leading-6 text-slate-600">{trial.subtitle}</p>

        <p className="mt-3 text-[13px] leading-5 text-slate-500">{trial.limitation}</p>

        <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <TrialForm ctaLabel={trial.ctaAvailable} />
        </div>
      </div>
    </section>
  );
}
