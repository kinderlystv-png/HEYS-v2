// Заявка (`#trial`) — тёмная карточка оффера и квиз с формой.
//
// Строка ёмкости намеренно БЕЗ числа. Счётчик «осталось N из M» рядом с блоком
// о возвратах и отсутствии автосписаний работает против доверия, на котором
// держится вся страница, и запрещён `COPY_VOICE` § Лендинг как фейковый
// дефицит. Число вернётся только с реальным источником — общим с capacity-gate
// бота (`маркетинг/17` § 3.5).

import { Accent } from './primitives';

import TrialQuiz from '@/components/quiz/TrialQuiz';

// Тот же орнамент-плюс, что на тёмном фоне героя (`HeroD`). Скопирован, а не
// импортирован: в `HeroD` он локальная константа, а экспортировать её ради
// одной карточки — трогать чужой файл. Обе тёмные поверхности версии D должны
// иметь одинаковую фактуру.
const PLUS_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 5.5c.9 4.1.9 4.1 5 4.9-4.1.9-4.1.9-5 5-.9-4.1-.9-4.1-5-5 4.1-.8 4.1-.8 5-4.9Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")";

// Паддинги на узких экранах меньше общесекционных. На 390px внутренние 52/48
// плюс 32 у контейнера съедали 96px ширины — почти четверть экрана уходила в
// поля, и чипы «Без привязки карты» / «Без автосписаний» вставали в столбик.
// Порог 560px, а не `sm`: до него карточке хватает места, а ниже арифметика
// полей начинает съедать содержимое.
export default function TrialSection() {
  return (
    <section id="trial" className="bg-white px-5 pb-[104px] pt-[84px] min-[561px]:px-8">
      <div className="mx-auto w-full max-w-[760px]">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[22px] bg-[#0E1D2E] px-6 py-8 min-[561px]:rounded-[28px] min-[561px]:px-8 min-[561px]:py-12 sm:px-12 sm:py-[52px]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: PLUS_PATTERN, backgroundSize: '56px 56px' }}
          />

          {/* Контент поверх орнамента: без `relative` абсолютный слой лёг бы
              сверху, как и в герое. */}
          <div className="relative">
            <h2 className="text-balance text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
              Неделя Pro <Accent>бесплатно</Accent>
            </h2>

            <p className="mt-6 flex items-baseline gap-3">
              <span className="text-[clamp(36px,6.2vw,56px)] font-semibold leading-none text-white">
                0 ₽
              </span>
              <span className="text-[15px] text-white/60">/ 7 дней</span>
            </p>

            <p className="mt-7 max-w-[540px] text-[15px] leading-[1.65] text-white/75">
              За 7 дней куратор перенесёт первые приёмы в дневник, посмотрит ритм недели и разберёт
              с вами, где день начинает сбиваться. Вы поймёте, каково это — когда в вашу неделю
              действительно вникают.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {['Без привязки карты', 'Без автосписаний'].map((chip) => (
                <span
                  key={chip}
                  className="whitespace-nowrap rounded-full border border-white/25 px-3 py-[7px] text-[12.5px] text-white/85 min-[561px]:px-4 min-[561px]:py-2 min-[561px]:text-[13px]"
                >
                  {chip}
                </span>
              ))}
            </div>

            {/* Зелёная точка связывает строку набора с пилюлей «7 дней Pro — 0 ₽»
                в герое: один и тот же сигнал «место есть сейчас». */}
            <p className="mt-7 flex max-w-[540px] gap-2.5 text-[13px] leading-[1.6] text-white/55">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7FD1A0]"
              />
              <span>
                Идёт первый набор. Куратор берёт ограниченное число участников в неделю — чтобы
                вникать в ритм каждого, а не отвечать по шаблону.
              </span>
            </p>
          </div>
        </div>

        <div data-reveal className="mt-6">
          <TrialQuiz abVariant="D" />
        </div>
      </div>
    </section>
  );
}
