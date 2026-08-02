// Заявка (`#trial`) — тёмная карточка оффера и квиз с формой.
//
// Строка ёмкости намеренно БЕЗ числа. Счётчик «осталось N из M» рядом с блоком
// о возвратах и отсутствии автосписаний работает против доверия, на котором
// держится вся страница, и запрещён `COPY_VOICE` § Лендинг как фейковый
// дефицит. Число вернётся только с реальным источником — общим с capacity-gate
// бота (`маркетинг/17` § 3.5).

import { Accent } from './primitives';

import TrialQuiz from '@/components/quiz/TrialQuiz';

export default function TrialSection() {
  return (
    <section id="trial" className="bg-white px-5 pb-[104px] pt-[84px] sm:px-8">
      <div className="mx-auto w-full max-w-[760px]">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[28px] bg-[#0E1D2E] px-8 py-12 sm:px-12 sm:py-[52px]"
        >
          <h2 className="text-balance text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            Неделя Pro <Accent>бесплатно</Accent>
          </h2>

          <p className="mt-6 flex items-baseline gap-3">
            <span className="text-[56px] font-semibold leading-none text-white">0 ₽</span>
            <span className="text-[15px] text-white/60">/ 7 дней</span>
          </p>

          <p className="mt-7 max-w-[540px] text-[15px] leading-[1.65] text-white/75">
            За 7 дней куратор перенесёт первые приёмы в дневник, посмотрит ритм недели и разберёт с
            вами, где день начинает сбиваться. Вы поймёте, каково это — когда в вашу неделю
            действительно вникают.
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            {['Без привязки карты', 'Без автосписаний'].map((chip) => (
              <span
                key={chip}
                className="whitespace-nowrap rounded-full border border-white/25 px-4 py-2 text-[13px] text-white/85"
              >
                {chip}
              </span>
            ))}
          </div>

          <p className="mt-7 max-w-[540px] text-[13px] leading-[1.6] text-white/55">
            Идёт первый набор. Куратор берёт ограниченное число участников в неделю — чтобы вникать
            в ритм каждого, а не отвечать по шаблону.
          </p>
        </div>

        <div data-reveal className="mt-6">
          <TrialQuiz abVariant="D" />
        </div>
      </div>
    </section>
  );
}
