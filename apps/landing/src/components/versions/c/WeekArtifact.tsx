// Артефакт разобранной недели — главный аргумент версии C (`маркетинг/46`).
//
// Принцип версии: доказательство вместо описания. Вместо прозы о качестве
// разбора человек видит, как выглядит итог недели — заполненный дневник,
// найденное отклонение от обычного ритма и один следующий шаг.
//
// Данные демонстрационные и обезличенные: показываем только процесс (что
// зафиксировано и что отклонилось), без цифр результата, обещаний и сроков —
// обезличенный proof-канон `30` L3.

const DAYS = [
  { day: 'Пн', meals: true, sleepShort: false, lateDinner: false },
  { day: 'Вт', meals: true, sleepShort: false, lateDinner: true },
  { day: 'Ср', meals: true, sleepShort: true, lateDinner: false },
  { day: 'Чт', meals: true, sleepShort: true, lateDinner: true, skippedLunch: true },
  { day: 'Пт', meals: true, sleepShort: true, lateDinner: true, skippedLunch: true },
  { day: 'Сб', meals: true, sleepShort: false, lateDinner: false },
  { day: 'Вс', meals: true, sleepShort: false, lateDinner: false },
];

// Легенда обязана покрывать все состояния схемы, иначе бледный столбик
// читается как «непонятно что». Форма значка повторяет форму на схеме:
// столбик — про день целиком, точка — про отдельное обстоятельство.
const LEGEND = [
  { shape: 'bar', className: 'bg-emerald-500/90', label: 'все приёмы пищи' },
  { shape: 'bar', className: 'bg-emerald-100', label: 'день с пропуском' },
  { shape: 'dot', className: 'bg-amber-400', label: 'поздний ужин' },
  { shape: 'dot', className: 'bg-rose-400', label: 'короткий сон' },
] as const;

export default function WeekArtifact() {
  return (
    <figure className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-sm font-semibold text-slate-900">Ваша неделя в HEYS</p>
        <p className="text-[11px] text-slate-400">7 дней подряд</p>
      </figcaption>

      {/* Дневник за неделю: что зафиксировано и где ритм отклонился. */}
      <div className="px-5 pt-4">
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500">{d.day}</span>
              <span
                aria-hidden="true"
                className={`h-8 w-full rounded-md ${
                  d.skippedLunch ? 'bg-emerald-100' : 'bg-emerald-500/90'
                }`}
              />
              <span className="flex gap-0.5">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.lateDinner ? 'bg-amber-400' : 'bg-slate-200'
                  }`}
                />
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.sleepShort ? 'bg-rose-400' : 'bg-slate-200'
                  }`}
                />
              </span>
            </div>
          ))}
        </div>

        <p className="sr-only">
          Дневник заполнен все семь дней. В четверг и пятницу пропущен обед, три ночи подряд сон
          короче обычного, три вечера ужин позже привычного.
        </p>

        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                aria-hidden="true"
                className={`shrink-0 ${
                  item.shape === 'bar' ? 'h-2.5 w-2 rounded-[3px]' : 'h-1.5 w-1.5 rounded-full'
                } ${item.className}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Разбор куратора: то, ради чего неделя и собиралась. */}
      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Что заметил куратор
          </p>
          <p className="mt-1 text-[15px] leading-6 text-slate-700">
            Три ночи подряд сон был короче обычного, в четверг и пятницу пропускался обед, а ужин
            стал позже.
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Что могло повлиять
          </p>
          <p className="mt-1 text-[15px] leading-6 text-slate-700">
            Недосып и накопленный за день голод могут усиливать вечернюю тягу.
          </p>
        </div>

        <div className="bg-blue-50/50 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
            Следующий шаг
          </p>
          <p className="mt-1 text-[15px] leading-6 text-slate-800">
            Вернуть полноценный обед в четверг и пятницу — и посмотреть, станет ли вечер спокойнее.
          </p>
        </div>
      </div>

      <p className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400">
        Демонстрационный пример
      </p>
    </figure>
  );
}
