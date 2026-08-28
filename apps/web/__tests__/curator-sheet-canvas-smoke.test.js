// @vitest-environment jsdom
/**
 * Canvas smoke: кадры «Куратор · …» из
 * docs/ui/handoff-v4/canvas/Регистрация и чек-ин v4.dc.html
 * Симулируем вариации — руками их не собрать.
 */
import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modulePath = path.resolve(__dirname, '../heys_curator_actions_banner_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const originalConsoleInfo = console.info;

const DINNER_ITEMS = [
  { name: 'Люля куриные на гриле', grams: 70 },
  { name: 'Бризоль куриная', grams: 70 },
  { name: 'Рис с овощами', grams: 288 },
  { name: 'Капуста квашеная', grams: 100 },
  { name: 'Кофе американо', grams: 150 },
  { name: 'Молоко 3.2', grams: 200 },
  { name: 'Кетчуп томатный', grams: 15 },
];

function response(entries, serverNow = '2026-07-05T10:00:00.000Z') {
  return {
    ok: true,
    since: '2026-07-01T00:00:00.000Z',
    server_now: serverNow,
    has_more: false,
    entries,
  };
}

function entry(id, createdAt, date, actions, kcal = null) {
  const row = {
    id,
    curator_id: '22222222-2222-4222-8222-222222222222',
    keys: [`heys_dayv2_${date}`],
    created_at: createdAt,
    actions: {
      actions: (actions || []).map((a) => (a.date ? a : { ...a, date })),
    },
  };
  if (kcal) {
    row.actions.day_kcal_before = kcal.before;
    row.actions.day_kcal_after = kcal.after;
  }
  return row;
}

function dinnerMeal(date = '2026-07-05') {
  return {
    type: 'meal_added',
    date,
    meal_id: 'dinner',
    meal_label: 'Ужин',
    time: '16:46',
    kcal: 697,
    items: DINNER_ITEMS.map((it) => ({ ...it })),
  };
}

function loadBanner() {
  window.history.replaceState({}, '', '/');
  window.HEYS = {
    cloud: { isPinAuthClient: vi.fn(() => true), _syncLastCompleted: false },
    auth: { getSessionToken: vi.fn(() => 'pin-session') },
    YandexAPI: {
      getMyCuratorChangelogSince: vi.fn(),
      ackCuratorChangelog: vi.fn().mockResolvedValue({ ok: true }),
    },
    utils: {
      lsSet: vi.fn((key, value) => Storage.prototype.setItem.call(window.localStorage, key, JSON.stringify(value))),
      lsGet: vi.fn((key) => (key === 'heys_profile' ? { curatorName: 'Антон' } : null)),
    },
    ui: { switchTab: vi.fn(), setSelectedDate: vi.fn() },
  };
  console.info = vi.fn();
  eval(moduleSource);
  return window.HEYS.CuratorActionsBanner;
}

function title() {
  return document.querySelector('.ca-modal__header-title')?.textContent;
}
function subtitle() {
  return document.querySelector('.ca-modal__header-subtitle')?.textContent;
}
function bodyText() {
  return document.querySelector('.ca-modal__content')?.textContent || '';
}
function dateLabels() {
  return Array.from(document.querySelectorAll('.ca-modal__date-label')).map((el) => el.textContent);
}
function itemTitles() {
  return Array.from(document.querySelectorAll('.ca-modal__item-title')).map((el) => el.textContent);
}

describe('Canvas frames: curator review sheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'));
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.HEYS = undefined;
    console.info = originalConsoleInfo;
  });

  it('Куратор · один приём — meal card, 3 продукта + «и ещё», ккал в шапке', async () => {
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [dinnerMeal()],
      { before: 1240, after: 1937 }
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(title()).toBe('Куратор Антон обновил ваш дневник');
    expect(subtitle()).toBe('Проверьте, что изменилось по вашим данным');
    expect(document.querySelector('.ca-modal__meal-card')).toBeTruthy();
    expect(document.querySelector('.ca-modal__date-kcal')?.textContent).toMatch(/1\s240 → 1\s937 ккал/);
    expect(bodyText()).toMatch(/Ужин в 16:46 · 697 ккал/);
    expect(bodyText()).toMatch(/Приём добавлен · 7 продуктов/);
    expect(document.querySelectorAll('.ca-modal__meal-product')).toHaveLength(3);
    expect(document.querySelector('.ca-modal__more-products')?.textContent).toBe('и ещё 4 продукта');
    expect(document.querySelector('.ca-modal__later-btn')?.textContent).toBe('Позже');
    expect(document.querySelector('.ca-modal__ack-btn')?.textContent).toBe('Понятно');
    expect(document.querySelector('.ca-modal__close-svg')).toBeTruthy();
  });

  it('Куратор · длинный приём — разворот продуктов и «Свернуть»', async () => {
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [dinnerMeal()],
      { before: 1240, after: 1937 }
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();
    document.querySelector('[data-ca-expand-meal]').click();

    expect(document.querySelectorAll('.ca-modal__meal-product')).toHaveLength(7);
    expect(document.querySelector('.ca-modal__more-products')?.textContent).toBe('Свернуть');
    expect(bodyText()).toContain('Кетчуп томатный');
  });

  it('Куратор · много правок за день — шесть строк и сводка «за вчера»', async () => {
    const y = '2026-07-04';
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-04T20:00:00.000Z',
      y,
      [
        dinnerMeal(y),
        {
          type: 'meal_item_changed',
          meal_label: 'Обед',
          name: 'Рис',
          from_grams: 200,
          to_grams: 288,
          kcal_delta: 118,
        },
        {
          type: 'meal_item_removed',
          meal_label: 'Завтрак',
          count: 2,
          kcal_delta: -298,
        },
        { type: 'training_added', kind: 'силовая', duration_min: 45, time: '18:30' },
        { type: 'weight_set', from: 82, to: 81.5 },
        { type: 'norms_changed', fields: ['kcal', 'prot'] },
      ],
      { before: 1240, after: 1757 }
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    // Продукт: цифра («6…»), не слова из canvas — решение владельца.
    expect(subtitle()).toBe('6 изменений за вчера');
    expect(document.querySelector('.ca-modal__date-kcal')?.textContent).toMatch(/1\s240 → 1\s757 ккал/);
    expect(document.querySelector('.ca-modal__meal-card')).toBeFalsy();
    expect(itemTitles().length).toBeGreaterThanOrEqual(6);
    expect(bodyText()).toMatch(/Рис.*200 → 288/);
    expect(bodyText()).toMatch(/Тренировка: силовая, 45 минут/);
    expect(bodyText()).toMatch(/Вес: 82 → 81[,.]5 кг/);
    expect(bodyText()).toMatch(/Обновлены нормы/);
  });

  // Контракт curator-edits, «очень много правок за день» (15-я сборка):
  // «Больше пяти правок одного типа за дату — тип сворачивается в одну строку.
  // Порядок типов фиксирован: Приёмы · Вода · Замеры · Активность · Добавки».
  // Прежние тесты держали порог по дню целиком (больше десяти строк за дату) и
  // категории «Тренировки»/«Шаги»/«Вес» — 15-я сборка это отменила, тесты
  // переписаны под строку.
  it('Куратор · больше пяти правок одного типа — свёртка по типам, тап раскрывает список в листе', async () => {
    const date = '2026-07-05';
    const meals = Array.from({ length: 12 }, (_, i) => ({
      type: 'meal_added',
      date,
      meal_id: `meal_${i}`,
      meal_label: `Приём ${i + 1}`,
      time: `0${(i % 9) + 1}:1${i % 9}`,
      kcal: 120 + i,
      items: [{ name: `Продукт ${i + 1}`, grams: 100 + i }],
    }));
    const trainings = [
      { type: 'training_added', kind: 'силовая', duration_min: 45, time: '08:30' },
      { type: 'training_added', kind: 'кардио', duration_min: 30, time: '12:30' },
      { type: 'training_added', kind: 'растяжка', duration_min: 15, time: '20:30' },
    ];
    const supplements = [
      { type: 'supplement_course_assigned', supplement_ids: ['vitD', 'omega3'] },
      { type: 'supplement_mark_removed', supplement_id: 'omega3' },
    ];
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      date,
      [...meals, ...trainings, ...supplements],
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    // Формат подписи — из строки контракта дословно: существительное, «·»,
    // число. Счётчик вынесен отдельным элементом тоном --ac, поэтому в
    // textContent пробела перед «·» нет — он задан полем 7 px.
    const typeRows = () => Array.from(document.querySelectorAll('[data-ca-expand-type]'))
      .map((el) => `${el.querySelector('.ca-modal__type-title')?.firstChild?.textContent || ''}`
        + ` ${el.querySelector('.ca-modal__type-count')?.textContent || ''}`);
    // Порог берут только «Приёмы» (12 > 5), но в строки типов уходит вся дата —
    // и порядок фиксирован контрактом, а не числом правок.
    expect(typeRows()).toEqual(['Приёмы · 12', 'Активность · 3', 'Добавки · 2']);
    // Второй строки-расшифровки у свёрнутой группы нет.
    expect(document.querySelector('[data-ca-expand-type] .ca-modal__item-sub')).toBeFalsy();
    // Пока не раскрыли — самих правок в листе нет.
    expect(bodyText()).not.toContain('Продукт 1');
    expect(bodyText()).not.toContain('Тренировка: силовая');
    expect(document.querySelectorAll('.ca-modal__type-members')).toHaveLength(0);

    const mealsToggle = () => Array.from(document.querySelectorAll('[data-ca-expand-type]'))
      .find((el) => el.textContent.includes('Приёмы'));
    expect(mealsToggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(mealsToggle()?.getAttribute('aria-label')).toBe('Приёмы: 12 изменений, развернуть');
    mealsToggle().click();

    // Раскрылось внутри того же листа: одна модалка, счётчик в шапке тот же.
    expect(document.querySelectorAll('.ca-modal-backdrop')).toHaveLength(1);
    expect(subtitle()).toBe('17 изменений за сегодня');
    // Первые три правки и закрывающая строка «и ещё N правок…».
    expect(document.querySelectorAll('.ca-modal__type-members > li:not(.ca-modal__type-more)')).toHaveLength(3);
    expect(document.querySelector('.ca-modal__type-more')?.textContent).toContain('и ещё 9 правок приёмов');
    expect(bodyText()).toContain('Продукт 1');
    expect(bodyText()).not.toContain('Продукт 12');
    // Другой тип остался свёрнутым.
    expect(bodyText()).not.toContain('Тренировка: силовая');
    expect(typeRows()).toContain('Активность · 3');

    // Тап по закрывающей строке дораскрывает группу на месте.
    document.querySelector('[data-ca-expand-type-all]').click();
    expect(document.querySelectorAll('.ca-modal-backdrop')).toHaveLength(1);
    expect(document.querySelectorAll('.ca-modal__type-members > li')).toHaveLength(12);
    expect(document.querySelector('[data-ca-expand-type-all]')).toBeFalsy();
    expect(bodyText()).toContain('Продукт 12');

    // Повторный тап по строке типа сворачивает обратно — вместе с «показать все».
    mealsToggle().click();
    expect(document.querySelectorAll('.ca-modal__type-members')).toHaveLength(0);
    expect(typeRows()).toEqual(['Приёмы · 12', 'Активность · 3', 'Добавки · 2']);
    mealsToggle().click();
    expect(document.querySelectorAll('.ca-modal__type-members > li:not(.ca-modal__type-more)')).toHaveLength(3);
  });

  it('Куратор · ровно пять правок одного типа — обычный список, свёртки по типам нет', async () => {
    const date = '2026-07-05';
    const meal = (i) => ({
      type: 'meal_added',
      date,
      meal_id: `meal_${i}`,
      meal_label: `Приём ${i + 1}`,
      time: `0${(i % 9) + 1}:1${i % 9}`,
      items: [{ name: `Продукт ${i + 1}`, grams: 100 + i }],
    });
    // Пять приёмов и пять тренировок: десять строк за дату, но ни один тип
    // порога не берёт. Прежнее правило («больше десяти за день») здесь бы уже
    // сработало — новое считает по типу.
    const actions = [
      ...Array.from({ length: 5 }, (_, i) => meal(i)),
      ...Array.from({ length: 5 }, (_, i) => ({
        type: 'training_added', date, training_index: i, kind: `вид ${i + 1}`, duration_min: 20 + i, time: `1${i}:00`,
      })),
    ];
    const row = entry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', date, actions);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(banner._test.constants.DAY_TYPE_COLLAPSE_MIN).toBe(5);
    expect(document.querySelectorAll('[data-ca-expand-type]')).toHaveLength(0);
    expect(bodyText()).toContain('Продукт 1');
    expect(bodyText()).toContain('Продукт 5');
    expect(bodyText()).toContain('вид 5');
  });

  it('свёртка по типам держит фиксированный порядок и не прячет серверную обрезку', () => {
    const banner = loadBanner();
    const pair = (action) => ({ entry: { id: 'e1' }, action });
    // Правки приходят в обратном порядке — раскладка всё равно идёт по
    // контракту: Приёмы · Вода · Замеры · Активность.
    const plan = banner._test.planDayTypeGroups('2026-07-05', [
      pair({ type: 'steps_set', to: 8000 }),
      pair({ type: 'training_added', kind: 'силовая' }),
      pair({ type: 'weight_set', from: 82, to: 81.5 }),
      pair({ type: 'water_set', to: 300 }),
      pair({ type: 'meal_added', meal_label: 'Обед' }),
      pair({ type: 'meal_item_changed', meal_label: 'Обед' }),
      // Сон и нормы в пятёрку контракта не входят: остаются обычными строками.
      pair({ type: 'sleep_set', to: 7 }),
      pair({ type: 'norms_changed', fields: ['kcal'] }),
      pair({ type: 'truncated', count: 40 }),
    ]);

    expect(plan.groups.map((g) => `${g.label} · ${g.pairs.length}`)).toEqual([
      'Приёмы · 2',
      'Вода · 1',
      'Замеры · 1',
      'Активность · 2',
    ]);
    // «…и ещё N изменений» — обрезка сервера, а не тип правки: остаётся строкой.
    expect(plan.loose.map((p) => p.action.type)).toEqual(['sleep_set', 'norms_changed', 'truncated']);
    expect(banner._test.dayTypeMoreLabel(9, 'приёмов')).toBe('и ещё 9 правок приёмов');
    expect(banner._test.dayTypeMoreLabel(2, 'по активности')).toBe('и ещё 2 правки по активности');
  });

  it('Куратор · две даты — свежий день раскрыт, прошлый свёрнут', async () => {
    const head = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [
        dinnerMeal('2026-07-05'),
        { type: 'water_set', to: 1800 },
      ],
      { before: 1240, after: 1937 }
    );
    const tail = entry(
      '33333333-3333-4333-8333-333333333333',
      '2026-07-04T09:00:00.000Z',
      '2026-07-04',
      [
        { type: 'meal_item_added', meal_label: 'Обед', count: 1 },
        { type: 'meal_item_changed', meal_label: 'Ужин', from_grams: 100, to_grams: 120 },
        { type: 'steps_set', to: 8000 },
      ],
      { before: 2010, after: 1866 }
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([head, tail]));

    await banner.checkAndShow();

    expect(subtitle()).toBe('Изменения за два дня');
    expect(dateLabels()[0]).toBe('5 июля');
    expect(bodyText()).toMatch(/Ужин в 16:46/);
    expect(bodyText()).toMatch(/Вода: 1\s?800 мл/);
    expect(bodyText()).toMatch(/3 изменения по еде и шагам/);
    expect(bodyText()).toMatch(/Развернуть/);
    expect(document.querySelector('[data-ca-expand-date]')).toBeTruthy();
  });

  it('Куратор · сухие строки — без еды, без ккал в шапке даты', async () => {
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [
        { type: 'weight_set', from: 82, to: 81.5 },
        { type: 'training_added', kind: 'силовая', duration_min: 45, time: '18:30' },
        { type: 'steps_set', to: 8432 },
        { type: 'norms_changed', fields: ['kcal', 'prot'], kcal: 1940, prot: 128 },
      ]
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(subtitle()).toBe('Еду не трогали — правки по весу и активности');
    expect(document.querySelector('.ca-modal__date-kcal')).toBeFalsy();
    expect(document.querySelector('.ca-modal__meal-card')).toBeFalsy();
    expect(bodyText()).toMatch(/Вес: 82 → 81/);
    expect(bodyText()).toMatch(/Тренировка: силовая/);
    expect(bodyText()).toMatch(/Шаги: 8\s?432/);
    expect(bodyText()).toMatch(/Обновлены нормы/);
  });

  it('Куратор · много дней — хвост «Ещё … за N дней» и subtitle про отсутствие', async () => {
    const dates = [
      '2026-07-05',
      '2026-07-04',
      '2026-07-03',
      '2026-07-02',
      '2026-07-01',
      '2026-06-30',
    ];
    const rows = dates.map((date, i) => entry(
      `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      `${date}T09:00:00.000Z`,
      date,
      [
        { type: 'meal_item_added', meal_label: 'Обед', count: 1 },
        ...(i === 0 ? [dinnerMeal(date)] : []),
        ...(i === 1
          ? [
            { type: 'meal_item_changed', meal_label: 'Ужин', from_grams: 100, to_grams: 110 },
            { type: 'meal_item_removed', meal_label: 'Завтрак', count: 1 },
            { type: 'steps_set', to: 5000 },
          ]
          : []),
      ],
      i < 2 ? { before: 1240 + i * 10, after: 1937 - i * 10 } : null
    ));
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response(rows));

    await banner.checkAndShow();

    // Продукт: цифра («6 дней»), не «шесть» из canvas.
    expect(subtitle()).toBe('Пока вас не было — правки за 6 дней');
    expect(document.querySelector('[data-ca-expand-tail]')).toBeTruthy();
    expect(bodyText()).toMatch(/Развернуть по дням/);
    expect(bodyText()).toMatch(/Ещё .+ за 3 дня/);
  });

  it('Куратор · повторяющиеся правки — группа ×5, компактный перекус, карточка ужина', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00.000Z'));
    const date = '2026-08-16';
    const coffeeItem = { name: 'Кофе растворимый с молоком 2,5', grams: 200 };
    const coffees = ['08:30', '09:30', '10:30', '11:30', '12:30'].map((time, index) => ({
      type: 'meal_added',
      date,
      meal_id: `coffee-${index}`,
      meal_label: 'Кофе-брейк',
      time,
      kcal: 58,
      items: [coffeeItem],
    }));
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-08-16T09:00:00.000Z',
      date,
      [
        {
          type: 'meal_added',
          date,
          meal_id: 'dinner',
          meal_label: 'Ужин',
          time: '23:09',
          kcal: 637,
          items: [
            { name: 'Хлеб тостовый «Премиум суперсемечковый»', grams: 74 },
            { name: 'Грудка копчёная Орион', grams: 100 },
            { name: 'Творожный сыр 30 самокат', grams: 30 },
            { name: 'Сыр', grams: 20 },
            { name: 'Огурец', grams: 100 },
            { name: 'Помидор', grams: 120 },
          ],
        },
        {
          type: 'meal_added',
          date,
          meal_id: 'snack',
          meal_label: 'Перекус',
          time: '18:40',
          kcal: 498,
          items: [{ name: 'Удон с курицей в подливе', grams: 280 }],
        },
        ...coffees,
        {
          type: 'meal_removed',
          date,
          name: 'Ужин',
          meal_label: 'Ужин',
          time: '21:15',
          kcal: 240,
          reason: 'дубль вечернего приёма',
        },
      ],
      { before: 888, after: 1958 }
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(subtitle()).toBe('8 изменений за вчера');
    expect(document.querySelector('.ca-modal__date-kcal')?.textContent).toMatch(/888 → 1\s958 ккал/);
    expect(document.querySelectorAll('.ca-modal__meal-card')).toHaveLength(1);
    expect(document.querySelector('.ca-modal__repeat-badge')?.textContent).toBe('×5');
    expect(bodyText()).toMatch(/Пять кофе-брейков, 08:30 — 12:30/);
    expect(bodyText()).toMatch(/В каждом кофе растворимый с молоком 2,5 · 200 г/i);
    expect(bodyText()).toMatch(/\+ 290 ккал за все 5/);
    expect(bodyText()).toMatch(/Приём добавлен · удон с курицей в подливе, 280 г/i);
    expect(bodyText()).toMatch(/Удалён приём: ужин в 21:15/);
    expect(bodyText()).toMatch(/− 240 ккал · дубль вечернего приёма/);
    expect(document.querySelectorAll('.ca-modal__meal-product')).toHaveLength(3);
  });

  it('Куратор · одинаковые удаления продуктов — одна строка ×5', async () => {
    vi.setSystemTime(new Date('2026-08-17T10:00:00.000Z'));
    const date = '2026-08-16';
    const removals = Array.from({ length: 5 }, (_, index) => ({
      type: 'meal_item_removed',
      date,
      meal_label: 'Кофе с молоком',
      kcal_delta: -113,
      meal_id: `coffee-${index}`,
    }));
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-08-16T09:00:00.000Z',
      date,
      [
        { type: 'meal_added', date, meal_id: 'dinner', meal_label: 'Ужин', time: '23:09', kcal: 637, items: [{ name: 'Сыр', grams: 20 }] },
        { type: 'steps_set', date, to: 5000 },
        ...removals,
      ],
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(subtitle()).toBe('7 изменений за вчера');
    expect(document.querySelectorAll('.ca-modal__repeat-badge')).toHaveLength(1);
    expect(document.querySelector('.ca-modal__repeat-badge')?.textContent).toBe('×5');
    expect(bodyText()).toMatch(/Из «Кофе с молоком» убран продукт/);
    expect(bodyText()).toMatch(/− 565 ккал за все 5/);
    expect((bodyText().match(/Из «Кофе с молоком» убран продукт/g) || []).length).toBe(1);
  });

  it('Куратор · точка на Питании — после двух «Позже», без счётчика', async () => {
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [dinnerMeal()]
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();
    expect(banner.shouldShowNutritionDot()).toBe(false);
    document.querySelector('.ca-modal__later-btn').click();
    expect(banner.shouldShowNutritionDot()).toBe(false);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    document.querySelector('.ca-modal__later-btn').click();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(banner.shouldShowNutritionDot()).toBe(true);
  });

  it('Куратор · строка входа в дне — cue «этот день» / чужая дата', async () => {
    const edited = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-04T09:00:00.000Z',
      '2026-07-04',
      [
        dinnerMeal('2026-07-04'),
        { type: 'meal_item_changed', meal_label: 'Обед', from_grams: 200, to_grams: 288 },
        { type: 'meal_item_removed', meal_label: 'Завтрак', count: 2 },
        { type: 'training_added', kind: 'силовая', duration_min: 45, time: '18:30' },
        { type: 'weight_set', from: 82, to: 81.5 },
        { type: 'norms_changed', fields: ['kcal'] },
      ]
    );
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([edited]));

    await banner.checkAndShow();
    document.querySelector('.ca-modal__later-btn').click();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    document.querySelector('.ca-modal__later-btn').click();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    const sameDay = banner.getVisibleCue('2026-07-04');
    expect(sameDay?.title).toBe('Куратор обновил этот день');
    expect(sameDay?.subtitle).toMatch(/6 изменений · посмотреть|Шесть изменений · посмотреть/i);

    const otherDay = banner.getVisibleCue('2026-07-05');
    expect(otherDay?.title).toBe('Куратор обновил 4 июля');
    expect(otherDay?.date).toBe('2026-07-04');
  });

  it('пустой лист не открывается', async () => {
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
  });

  it('без имени — fallback заголовка, не псевдоимя «Куратор»', async () => {
    const row = entry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [dinnerMeal()]
    );
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockReturnValue({});
    window.HEYS.config = {};
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([row]));

    await banner.checkAndShow();

    expect(title()).toBe('Ваш куратор обновил дневник');
  });
});
