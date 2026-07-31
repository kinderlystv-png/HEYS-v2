// WeekFrame.tsx — карта недели как кадр истории (глава 2 версии B).
//
// Смысловой макет — `маркетинг/45` § «Карта недели как главный proof-артефакт».
// Отличие от артефакта версии C намеренное (`47` § «Риски»): там — рабочая
// схема с легендой и трёхчастным разбором, здесь — типографский кадр с
// минимумом подписей, продолжающий язык отбивок демо. Данные демонстрационные
// и обезличенные.

const OBSERVATIONS = [
  { label: 'Сон', value: '3 ночи короче обычного' },
  { label: 'Обед', value: '2 пропуска' },
  { label: 'Ужин', value: 'стал позже на 1–2 часа' },
  { label: 'Повторяющийся момент', value: 'вечером усиливается тяга' },
];

export default function WeekFrame() {
  return (
    <figure className="rounded-3xl bg-slate-900 px-6 py-8 sm:px-10 sm:py-10">
      <figcaption className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
        Ваша неделя
      </figcaption>

      <dl className="mt-6 space-y-5">
        {OBSERVATIONS.map((o) => (
          <div key={o.label}>
            <dt className="text-[12px] uppercase tracking-wide text-slate-400">{o.label}</dt>
            <dd className="mt-0.5 text-[19px] leading-6 text-white sm:text-[22px]">{o.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 border-t border-white/15 pt-5">
        <p className="text-[12px] uppercase tracking-wide text-emerald-300">Следующий шаг</p>
        <p className="mt-1 text-[17px] leading-6 text-white sm:text-[19px]">
          Вернуть полноценный обед и посмотреть, станет ли вечер спокойнее.
        </p>
      </div>

      <p className="mt-6 text-[11px] text-slate-500">Демонстрационный пример, не клиентский кейс</p>
    </figure>
  );
}
