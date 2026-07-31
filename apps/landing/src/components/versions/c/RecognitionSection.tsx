// Блок 2 версии C — «Это про меня?».
//
// Компактнее, чем одноимённый блок версии A: четыре ситуации в одну колонку без
// карточек и иконок, сразу за ними — переход к сути. Тексты ситуаций взяты из
// версии A без изменения смысла (они уже прошли COPY_VOICE).

const SITUATIONS = [
  'Утром нет сил, хотя спали восемь часов',
  'Вес не меняется, хотя кажется, что с питанием всё нормально',
  'Держитесь две недели, срываетесь и вините себя',
  'Пробовали приложения и бросали — надоело всё считать вручную',
];

export default function RecognitionSection() {
  return (
    <section id="recognition" className="bg-white px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">Знакомо?</h2>

        <ul className="mt-6 space-y-3">
          {SITUATIONS.map((text) => (
            <li key={text} className="flex gap-3 text-[15px] leading-6 text-slate-700">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
              />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <p className="mt-7 text-[17px] font-semibold leading-7 text-slate-900">
          Сила воли тут ни при чём. Рядом нужен человек, которому не всё равно.
        </p>
      </div>
    </section>
  );
}
