// Стенды зоны date-remainders: капсула даты в шапке «Питания», её ночной и
// прошлый вид, прокрученный экран и лист календаря — кадры
// canvas/date-remainders.v4.dc.html. Экран настоящий: вкладка «Питание» с
// данными дня из хранилища; переходы — тапами по стрелкам и капсуле.
// Год стенда — 2026: кадр «Дата · чужой день» зовёт 7 августа пятницей, а
// пятницей оно было в 2026-м (в 2025-м это четверг), и лист календаря пакета
// подписан «Август 2026».

const CANVAS = 'date-remainders.v4.dc.html';
const SCROLLER = '.tab-active-viewport';

function clock(iso) {
  return { iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) };
}

// Калорийность продукт выводит из макросов (3·Б + 4·У + 9·Ж), поле kcal100 он
// не читает. Ссылка на справочник по product_id в дневном ключе не разбирается:
// строки показывали «продукт» и 0 ккал, и календарь оставался без точек.
let itemSeq = 0;
function item(name, kcal, macros) {
  itemSeq += 1;
  const m = macros || {};
  const protein100 = m.protein100 || 0;
  const fat100 = m.fat100 || 0;
  const carbs100 = m.carbs100 != null ? m.carbs100 : (100 - 3 * protein100 - 9 * fat100) / 4;
  return {
    id: `dr-item-${itemSeq}`,
    name,
    grams: Math.max(1, Math.round(kcal)),
    protein100,
    fat100,
    carbs100,
    simple100: 0,
    complex100: carbs100,
    badFat100: 0,
    goodFat100: fat100,
    trans100: 0,
    fiber100: m.fiber100 || 0,
    harm: 2,
    gi: 40,
  };
}

function day(date, meals, extra) {
  return { date, weightMorning: 0, steps: 6800, waterMl: 1700, meals, trainings: [], ...extra };
}

// Три приёма на 1 289 ккал — число строки «Приёмы пищи 3 · 1 289 ккал» кадра.
const THREE_MEALS = [
  { id: 'dr-breakfast', name: 'Завтрак', time: '08:30', items: [item('Овсяная каша', 320, { protein100: 4 }), item('Ягоды', 90)] },
  { id: 'dr-lunch', name: 'Обед', time: '13:20', items: [item('Куриное филе', 430, { protein100: 22 }), item('Рис с овощами', 289, { protein100: 3 })] },
  { id: 'dr-snack', name: 'Перекус', time: '16:40', items: [item('Творог', 160, { protein100: 16 })] },
];

const PALETTE_SUFFIX = { sand: '', 'sand-dark': ' · тёмная', blue: ' · синяя', 'blue-dark': ' · сине-тёмная' };

function dateCase(idBase, labelBase, themeId, options) {
  const suffix = themeId === 'sand' ? '' : `-${themeId}`;
  return {
    id: `${idBase}${suffix}`,
    zone: 'date-remainders',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    themeId,
    stubGamificationMerge: true,
    rootSelector: '.nutrition-v4',
    // Кадры зоны, кроме капсулы, нарисованы целым экраном 375 × 706 — снимаем
    // всё окно; капсула перекрывает это своим узлом.
    captureSelector: 'body',
    viewport: { width: 375, height: 706 },
    ...options,
    canvasFrame: { file: CANVAS, label: `${labelBase}${PALETTE_SUFFIX[themeId]}`, oid: `${idBase}${suffix}`.toUpperCase(), palette: themeId },
  };
}

// Ночь: до 03:00 капсула зовёт день «Ночь на …» (isNightWindowNow), календарный
// день уже 21-е, а открыт день 20-го.
const night = (themeId) => dateCase('date-capsule-night', 'Капсула · ночь на 21 августа', themeId, {
  clock: clock('2026-08-21T01:30:00+03:00'),
  fixtureDay: day('2026-08-20', THREE_MEALS),
  captureSelector: '.hdr-date-row',
});

const today = (themeId) => dateCase('date-today', 'Дата · сегодня', themeId, {
  clock: clock('2026-08-10T12:00:00+03:00'),
  fixtureDay: day('2026-08-10', THREE_MEALS, { steps: 1980 }),
});

// Прокрученный сегодняшний день: капсула уезжает, дата остаётся полосой.
const todayScrolled = (themeId) => dateCase('date-today-scrolled', 'Дата · сегодня, прокручено', themeId, {
  clock: clock('2026-08-18T14:13:00+03:00'),
  fixtureDay: day('2026-08-18', [
    { id: 'dr-late-breakfast', name: 'Завтрак', time: '13:32', items: [item('Пудинг Hyper High Protein Caramel (Ehrmann)', 120, { protein100: 12 }), item('Филе индейки запечённое', 65, { protein100: 20 })] },
  ]),
  uiSteps: [{ scroll: SCROLLER, top: 420 }],
  preserveScroll: true,
});

// Чужой день: стрелка «назад» открывает пятницу 7 августа, капсула получает
// пилюлю «Сегодня».
const otherDay = (themeId) => dateCase('date-other-day', 'Дата · чужой день', themeId, {
  // Кадр зовёт день «пт, 7 августа»: по строке «формат» словами называются
  // только сегодня и вчера, поэтому часы стенда стоят на воскресенье 10-е —
  // три тапа «назад» доводят до пятницы, минуя «Вчера» и «Сегодня».
  clock: clock('2026-08-10T12:00:00+03:00'),
  fixtureDay: day('2026-08-07', [
    ...THREE_MEALS,
    { id: 'dr-dinner', name: 'Ужин', time: '19:10', items: [item('Лосось с овощами', 320, { protein100: 8, fat100: 6 }), item('Гречка', 177, { protein100: 4 })] },
  ], { steps: 11240, waterMl: 2400 }),
  uiSteps: [
    { tap: '.date-picker-day-nav', nth: 0 },
    { tap: '.date-picker-day-nav', nth: 0 },
    { tap: '.date-picker-day-nav', nth: 0 },
  ],
});

const pastScrolled = (themeId) => dateCase('date-past-scrolled', 'Дата · прошлый день, прокручено', themeId, {
  clock: clock('2026-08-18T12:00:00+03:00'),
  fixtureDay: day('2026-08-17', [
    ...THREE_MEALS,
    { id: 'dr-late', name: 'Завтрак', time: '20:54', items: [item('Протеин Whey Supreme (Snickers)', 80, { protein100: 20 })] },
  ]),
  uiSteps: [{ tap: '.date-picker-day-nav', nth: 0 }, { scroll: SCROLLER, top: 600 }],
  preserveScroll: true,
});

// История августа 2026 для сетки календаря: без записей клетки пустые, и
// сверять с кадром нечего — ни точек факта, ни ленты цикла, ни полосы
// загрузки. Дни повторяют кадр: записи 1–5 и 7–9, цикл 3–5, загрузка 8.
const CAL_MONTH_DAYS = [1, 2, 3, 4, 5, 7, 8, 9].map((d) => {
  const date = `2026-08-0${d}`;
  const extra = {};
  if (d >= 3 && d <= 5) extra.cycleDay = d - 2;
  if (d === 8) extra.isRefeedDay = true;
  return day(date, THREE_MEALS, extra);
});

// Лист календаря открывает тап по капсуле. Часы — 10 августа 2026, как в кадре
// («Август 2026», сегодня — 10-е).
const calendar = (themeId) => dateCase('calendar-legend', 'Календарь · легенда', themeId, {
  clock: clock('2026-08-10T12:00:00+03:00'),
  fixtureDay: day('2026-08-10', THREE_MEALS),
  fixtureDays: CAL_MONTH_DAYS,
  uiSteps: [{ tap: '.date-picker-trigger-lbl' }, { waitFor: '.date-picker-sheet .date-picker-legend' }],
});

// Тот же лист, но выбран не сегодняшний день: только так видно обводку
// выбранного дня — когда выбран сегодня, её перекрывает заливка.
const calendarOtherDay = (themeId) => dateCase('calendar-other-day', 'Календарь · легенда', themeId, {
  clock: clock('2026-08-10T12:00:00+03:00'),
  fixtureDay: day('2026-08-10', THREE_MEALS),
  fixtureDays: CAL_MONTH_DAYS,
  uiSteps: [
    { tap: '.date-picker-trigger-lbl' },
    { waitFor: '.date-picker-sheet .date-picker-legend' },
    // Пустые клетки сетки несут тот же класс `date-picker-day` и стоят первыми,
    // а обработчика у них нет: тап по ним лист не закрывал, и следующий тап по
    // капсуле упирался в открытый лист. Берём клетку с записями — она и выбором
    // служит, и точку факта показывает.
    { tap: '.date-picker-sheet .date-picker-day.has-data:not(.today):not(.future)' },
    { tap: '.date-picker-trigger-lbl' },
    { waitFor: '.date-picker-sheet .date-picker-day.selected:not(.today)' },
  ],
});

export const DATE_REMAINDERS_VISUAL_CASES = Object.freeze([
  ...['sand', 'sand-dark', 'blue', 'blue-dark'].map(night),
  ...['sand', 'sand-dark'].map(today),
  ...['sand', 'sand-dark'].map(todayScrolled),
  ...['sand', 'sand-dark'].map(otherDay),
  ...['sand', 'sand-dark'].map(pastScrolled),
  ...['sand', 'sand-dark', 'blue', 'blue-dark'].map(calendar),
  ...['sand'].map(calendarOtherDay),
]);
