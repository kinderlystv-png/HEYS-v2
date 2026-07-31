// CuratorIntro.tsx — знакомство с куратором (глава 4 версии B).
//
// Смысловой центр версии (`маркетинг/47`): публичная личность куратора
// разрешена решением `15` №45, материалы появятся после съёмки. До интеграции
// фазы 3 слоты честно показывают состав знакомства: портрет, имя и видео
// 20–40 секунд. Формула-цитата — канонический ориентир из `45`; финальный
// текст пишет владелец от первого лица.

import MediaSlot from './MediaSlot';

const FACTS = [
  'Опыт более 20 лет в питании и сопровождении',
  'Одновременно ведётся ограниченное число участников — чтобы вникать в ритм недели каждого',
];

export default function CuratorIntro() {
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-start">
        <MediaSlot
          ratio="portrait"
          format="портрет"
          frame="Куратор в рабочей обстановке"
          src="/b/curator-placeholder.svg"
          alt="Место портрета куратора"
        />

        <div>
          <blockquote className="border-l-2 border-slate-300 pl-4 text-[17px] leading-7 text-slate-800">
            Моя задача — не оценивать идеальность питания, а собрать факты, увидеть повторяющийся
            сбой и предложить один выполнимый следующий шаг.
          </blockquote>

          <ul className="mt-5 space-y-2">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-2 text-[14px] leading-6 text-slate-600">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
                />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5">
        <MediaSlot format="видео 20–40 сек" frame="Знакомство: кто ведёт вашу неделю и как выглядит эта работа" />
      </div>
    </div>
  );
}
