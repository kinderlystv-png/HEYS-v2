// Стенды зоны curator-edits: лист «Куратор … обновил ваш дневник» в состояниях
// кадров canvas/curator-edits.v4.dc.html. Лист открывает настоящий продукт
// (`HEYS.debug.replayCuratorReview`) из снимка правок в sessionStorage —
// подменяются только данные сервера, не компоненты.

const CANVAS = 'curator-edits.v4.dc.html';

const DINNER_ITEMS = [
  ['Люля куриные на гриле', 70], ['Бризоль куриная', 70], ['Рис с овощами', 288],
  ['Капуста квашеная', 100], ['Кофе американо', 150], ['Молоко 3.2', 200], ['Кетчуп томатный', 15],
].map(([name, grams], i) => ({ item_id: `seed-dinner-${i}`, name, grams }));

function dinner(date) {
  return { type: 'meal_added', date, meal_id: 'seed-dinner', meal_label: 'Ужин', time: '16:46', kcal: 697, items: DINNER_ITEMS };
}

function entry(id, date, time, actions, before, after) {
  const row = {
    id,
    created_at: `${date}T${time}:00.000Z`,
    keys: [`heys_dayv2_${date}`],
    actions: { actions: actions.map((a) => (a.date ? a : { ...a, date })) },
  };
  if (before != null) {
    row.actions.day_kcal_before = before;
    row.actions.day_kcal_after = after;
  }
  return row;
}

function seed(...rows) {
  const byDate = {};
  for (const row of rows) {
    const date = row.keys[0].replace('heys_dayv2_', '');
    (byDate[date] = byDate[date] || { entries: [] }).entries.push(row);
  }
  return { heys_curator_reviewed_by_date_v1: byDate };
}

function clock(iso) {
  return { iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) };
}

const AUG15 = '2026-08-15';
const AUG16 = '2026-08-16';

// Кадр «свёрнуто по типам»: больше пяти правок одного типа за дату сворачивает
// тип в строку (контракт «очень много правок за день»). Двенадцать правок
// приёмов, три по воде, одна по весу.
function collapsedByTypeActions(date) {
  const meals = [
    dinner(date),
    { type: 'meal_item_changed', meal_id: 'seed-lunch', meal_label: 'Обед', name: 'Рис', from_grams: 200, to_grams: 288, kcal_delta: 118 },
    { type: 'meal_item_removed', meal_id: 'seed-breakfast', meal_label: 'Завтрак', count: 2, kcal_delta: -298 },
    ...Array.from({ length: 9 }, (_, i) => ({
      type: 'meal_item_added', meal_id: `seed-meal-${i}`, meal_label: `Перекус ${i + 1}`, count: 1, kcal_delta: 90 + i,
    })),
  ];
  const water = [300, 800, 1400].map((to) => ({ type: 'water_set', to }));
  return [...meals, ...water, { type: 'weight_set', from: 82, to: 81.5 }];
}

// «Много дней»: свежий день раскрыт, вчера свёрнут, старше — хвост «Ещё … за
// N дней». Кадр подписан «за шесть дней», но перечисляет семь дат (15, 14 и
// 9—13); стенд повторяет перечень дат — подпись считает продукт.
function manyDaysRows() {
  const dates = ['2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09'];
  return dates.map((date, i) => {
    const actions = i === 0
      ? [dinner(date)]
      : i === 1
        ? [
          { type: 'meal_item_added', meal_label: 'Обед', count: 1 },
          { type: 'meal_item_changed', meal_label: 'Ужин', name: 'Рис', from_grams: 100, to_grams: 110 },
          { type: 'meal_item_removed', meal_label: 'Завтрак', count: 1 },
          { type: 'meal_item_added', meal_label: 'Перекус', count: 2 },
        ]
        : Array.from({ length: i < 6 ? 9 : 7 }, (_, k) => ({ type: 'meal_item_added', meal_label: `Приём ${k + 1}`, count: 1 }));
    return entry(`seed-many-${i}`, date, '09:00', actions, i === 0 ? 1240 : i === 1 ? 2010 : null, i === 0 ? 1937 : i === 1 ? 1866 : null);
  });
}

function repeatRows() {
  const date = AUG16;
  const coffee = { name: 'Кофе растворимый с молоком 2,5', grams: 200 };
  const coffees = ['08:30', '09:30', '10:30', '11:30', '12:30'].map((time, i) => ({
    type: 'meal_added', date, meal_id: `coffee-${i}`, meal_label: 'Кофе-брейк', time, kcal: 58, items: [coffee],
  }));
  return [entry('seed-repeat', date, '09:00', [
    {
      type: 'meal_added', date, meal_id: 'dinner', meal_label: 'Ужин', time: '23:09', kcal: 637,
      items: [
        { name: 'Хлеб тостовый «Премиум»', grams: 74 },
        { name: 'Грудка копчёная Орион', grams: 100 },
        { name: 'Творожный сыр 30 самокат', grams: 30 },
        { name: 'Сыр', grams: 20 },
        { name: 'Огурец', grams: 100 },
        { name: 'Помидор', grams: 120 },
      ],
    },
    { type: 'meal_added', date, meal_id: 'snack', meal_label: 'Перекус', time: '18:40', kcal: 498, items: [{ name: 'Удон с курицей', grams: 280 }] },
    ...coffees,
    { type: 'meal_removed', date, name: 'Ужин', meal_label: 'Ужин', time: '21:15', kcal: 240, reason: 'дубль вечернего приёма' },
  ], 888, 1958)];
}

function curatorCase(id, label, options) {
  return {
    id,
    zone: 'curator-edits',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-curator-edits',
    tab: 'widgets',
    themeId: 'sand',
    viewport: { width: 375, height: 706 },
    rootSelector: '.ca-modal-backdrop--visible .ca-modal',
    captureSelector: '.ca-modal-backdrop--visible .ca-modal',
    curatorName: 'Антон',
    canvasFrame: { file: CANVAS, label, oid: id.toUpperCase(), palette: 'sand' },
    ...options,
  };
}

export const CURATOR_EDITS_VISUAL_CASES = Object.freeze([
  curatorCase('curator-edits-single-meal', 'Куратор · один приём', {
    clock: clock('2026-08-15T12:00:00+03:00'),
    sessionSeed: seed(entry('seed-single', AUG15, '09:00', [dinner(AUG15)], 1240, 1937)),
  }),
  curatorCase('curator-edits-long-meal', 'Куратор · длинный приём', {
    clock: clock('2026-08-15T12:00:00+03:00'),
    sessionSeed: seed(entry('seed-long', AUG15, '09:00', [dinner(AUG15)], 1240, 1937)),
    uiSteps: [{ tap: '[data-ca-expand-meal]' }],
  }),
  curatorCase('curator-edits-many-per-day', 'Куратор · много правок за день', {
    clock: clock('2026-08-16T10:00:00+03:00'),
    sessionSeed: seed(entry('seed-many-per-day', AUG15, '20:00', [
      dinner(AUG15),
      { type: 'meal_item_changed', meal_id: 'seed-lunch', meal_label: 'Обед', name: 'Рис', from_grams: 200, to_grams: 288, kcal_delta: 118 },
      { type: 'meal_item_removed', meal_id: 'seed-breakfast', meal_label: 'Завтрак', count: 2, kcal_delta: -298 },
      { type: 'training_added', kind: 'силовая', duration_min: 45, time: '18:30' },
      { type: 'weight_set', from: 82, to: 81.5 },
      { type: 'norms_changed', fields: ['kcal', 'prot'] },
    ], 1240, 1757)),
  }),
  curatorCase('curator-edits-collapsed-types', 'Куратор · свёрнуто по типам', {
    clock: clock('2026-08-16T10:00:00+03:00'),
    sessionSeed: seed(entry('seed-types', AUG15, '20:00', collapsedByTypeActions(AUG15), 1240, 2148)),
    // Кадр рисует «Приёмы» уже раскрытыми: три строки и «и ещё девять правок».
    uiSteps: [{ tap: '[data-ca-expand-type]' }],
  }),
  curatorCase('curator-edits-dry-rows', 'Куратор · сухие строки', {
    clock: clock('2026-08-15T12:00:00+03:00'),
    sessionSeed: seed(entry('seed-dry', AUG15, '09:00', [
      { type: 'weight_set', from: 82, to: 81.5 },
      { type: 'training_added', kind: 'силовая', duration_min: 45, time: '18:30' },
      { type: 'steps_set', to: 8432 },
      { type: 'norms_changed', fields: ['kcal', 'prot'], kcal: 1940, prot: 128 },
    ])),
  }),
  curatorCase('curator-edits-many-days', 'Куратор · много дней', {
    clock: clock('2026-08-15T12:00:00+03:00'),
    sessionSeed: seed(...manyDaysRows()),
  }),
  curatorCase('curator-edits-repeated', 'Куратор · повторяющиеся правки', {
    clock: clock('2026-08-17T10:00:00+03:00'),
    sessionSeed: seed(...repeatRows()),
  }),
]);
