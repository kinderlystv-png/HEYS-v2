// Блок 5 версии C — форма заявки.
//
// Сама форма переиспользуется целиком (`TrialForm`): в ней живут contract
// согласия и валидация, менять их нельзя (решение `3.14`). Отличие версии C —
// только обрамление: оффер сжат до сути, условия не пересказываются второй раз,
// потому что уже названы в блоке цены.
//
// Тексты оффера взяты из общего контента варианта A, без новых обещаний.

import TrialForm from '@/components/TrialForm';
import WeekOutcome from '@/components/versions/c/WeekOutcome';
import { VARIANTS } from '@/config/landing-variants';

// Источник передаётся deep link'ом по конвенции `18`: `?start=src_<код>`.
// Отдельный код у версии C нужен, чтобы лиды из неё были отличимы от лидов
// публичной страницы, пока владелец сравнивает версии.
const QUIZ_URL = 'https://t.me/heys_start_bot?start=src_landing_c';

export default function TrialSection() {
  const trial = VARIANTS.A.trial;

  return (
    // Тёплый фон отделяет целевой блок от четырёх нейтральных секций вокруг:
    // до этого форма визуально весила столько же, сколько подробности. Приём
    // прямо разрешён `COPY_VOICE` для trial-блока (запись 2026-06-27) и не
    // требует служебных бейджей. Оттенок продолжает нижнюю часть градиента
    // первого экрана, поэтому страница остаётся одной системой.
    <section id="trial" className="bg-[#FFF8EA] px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
            {trial.title}
          </h2>
          <span className="text-sm font-medium text-slate-500">0 ₽ / 7 дней</span>
        </div>

        <p className="mt-3 text-[15px] leading-6 text-slate-600">{trial.subtitle}</p>

        {/* `trial.limitation` намеренно не выводится: ёмкость куратора теперь
            объясняется один раз — в опоре над тарифами. Повтор того же
            аргумента через полтора экрана запрещён `COPY_VOICE` (запись
            2026-06-27, дополнение про блок доверия). */}

        {/* Конкретный результат недели — прямо перед полями формы. */}
        <div className="mt-6">
          <WeekOutcome />
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <TrialForm ctaLabel={trial.ctaAvailable} />
        </div>

        {/* Выход для тех, кто не готов оставлять телефон. До этого действие на
            странице было ровно одно — заявка, и человек «ещё не готов» уходил
            навсегда. Квиз-бот существует и работает (`22` п. 1.1), поэтому
            второй путь не выдуман. Оформлен намеренно тихо: вторичное действие
            остаётся доступным, но не спорит с главным. */}
        <p className="mt-5 text-[14px] leading-6 text-slate-600">
          Не готовы оставлять контакты?{' '}
          <a
            href={QUIZ_URL}
            className="font-medium text-[#1D70B7] underline underline-offset-2 hover:text-[#185F9D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Шесть вопросов в Telegram
          </a>{' '}
          покажут ваш типичный сценарий срыва. Телефон понадобится, только если после этого сами
          захотите неделю Pro.
        </p>
      </div>
    </section>
  );
}
