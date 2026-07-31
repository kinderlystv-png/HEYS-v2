// Что человек получит за бесплатную неделю — конкретно, а не «попробуйте».
//
// Одно из самых частых мест потери конверсии: бесплатный период описан как
// «попробовать формат», и человек не понимает, что окажется у него на руках в
// конце. Здесь перечислен осязаемый результат недели.
//
// Формулировки описывают работу и артефакты, а не эффект: никакого «похудеете»,
// «наладите режим» и сроков — это запрещено каноном и `COPY_VOICE`.

const OUTCOME = [
  {
    title: 'Заполненный дневник за 7 дней',
    text: 'Еда, сон, активность и обстоятельства — внесены куратором, а не вами.',
  },
  {
    title: 'Найденное место, где ритм сбивается',
    text: 'Не «неправильный продукт», а повторяющийся сдвиг в вашей неделе.',
  },
  {
    title: 'Разбор недели и один следующий шаг',
    text: 'Что сработало, что мешало и с чего начать дальше — без списка запретов.',
  },
];

export default function WeekOutcome() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-900">Что останется у вас после недели</p>

      <ul className="mt-4 space-y-3.5">
        {OUTCOME.map((item) => (
          <li key={item.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700"
            >
              ✓
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-5 text-slate-900">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-slate-600">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
