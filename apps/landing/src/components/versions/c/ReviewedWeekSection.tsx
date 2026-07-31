// Блок 3 версии C — «Разобранная неделя». Ядро версии.
//
// Объединяет то, что в версии A размазано по четырём блокам: механику
// (кто что делает), пример разбора по дневнику и логику решения куратора
// («что изменилось → что могло повлиять → следующий шаг»). Главный аргумент —
// артефакт: человек видит результат недели, а не читает описание качества.
//
// Все формулировки перенесены из версии A без новых обещаний: пометка о
// демонстрационном характере примера сохранена (обезличенный proof-канон).

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

const WEEK_CARD = [
  {
    label: 'Что изменилось',
    text: 'Три ночи подряд сон был короче обычного, два дня пропускался обед, а ужин стал позже.',
  },
  {
    label: 'Что могло повлиять',
    text: 'Недосып и накопленный голод могут усиливать вечернюю тягу.',
  },
  {
    label: 'Следующий шаг',
    text: 'Вернуть полноценный обед и упростить вечер — затем посмотреть, станет ли тяга слабее.',
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

        {/* Механика: три шага в строку, без отдельного экрана под каждый. */}
        <ol className="mt-7 grid gap-3 sm:grid-cols-3">
          {FLOW.map((item) => (
            <li key={item.step} className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-semibold tracking-wide text-blue-700">{item.step}</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-slate-600">{item.text}</p>
            </li>
          ))}
        </ol>

        {/* Артефакт недели — главный аргумент блока. */}
        <figure className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <figcaption className="border-b border-slate-100 bg-white px-5 py-3">
            <p className="text-xs font-semibold tracking-wide text-blue-700">ИТОГ НЕДЕЛИ</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              Вечером снова тянет на еду
            </p>
          </figcaption>

          <div className="divide-y divide-slate-100">
            {WEEK_CARD.map((row) => (
              <div key={row.label} className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {row.label}
                </p>
                <p className="mt-1 text-[15px] leading-6 text-slate-700">{row.text}</p>
              </div>
            ))}
          </div>

          <p className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400">
            Демонстрационный пример
          </p>
        </figure>

        <p className="mt-6 text-[15px] leading-6 text-slate-600">
          Решение принимает куратор: он смотрит несколько дней целиком и уточняет контекст, а не
          делает выводы по одному продукту или неидеальному дню.
        </p>
      </div>
    </section>
  );
}
