// Блок 3 версии C — «Разобранная неделя». Ядро версии.
//
// Объединяет то, что в версии A размазано по четырём блокам: механику
// (кто что делает), пример разбора по дневнику и логику решения куратора
// («что изменилось → что могло повлиять → следующий шаг»). Главный аргумент —
// артефакт: человек видит результат недели, а не читает описание качества.
//
// Все формулировки перенесены из версии A без новых обещаний: пометка о
// демонстрационном характере примера сохранена (обезличенный proof-канон).

import WeekArtifact from '@/components/versions/c/WeekArtifact';

const FLOW = [
  {
    step: '01',
    title: 'Вы присылаете',
    text: 'Фото еды, снимок с весов, короткое сообщение или голосовое.',
  },
  {
    step: '02',
    title: 'Куратор ведёт дневник',
    text: 'Заносит еду, сон, нагрузку и обстоятельства дня.',
  },
  {
    step: '03',
    title: 'Вы видите картину',
    text: 'Открываете HEYS и видите готовый дневник и динамику.',
  },
];

export default function ReviewedWeekSection() {
  return (
    <section id="reviewed-week" className="bg-slate-50 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Дневник ведёт куратор. Вы получаете разобранную неделю.
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Не один неидеальный день, а изменения за неделю — и один выполнимый шаг дальше.
        </p>

        {/* Механика: компактный список, а не три карточки в колонку — на
            мобильном карточки съедали половину экрана ради трёх фраз. */}
        <ol className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {FLOW.map((item) => (
            <li key={item.step} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 text-xs font-semibold text-blue-700">{item.step}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-slate-600">
                  {item.text}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* Артефакт недели — главный аргумент блока. */}
        <div className="mt-8">
          <WeekArtifact />
        </div>

        <p className="mt-6 text-[15px] leading-6 text-slate-600">
          Решение принимает куратор: он смотрит несколько дней целиком и уточняет контекст, а не
          делает выводы по одному продукту или неидеальному дню.
        </p>
      </div>
    </section>
  );
}
