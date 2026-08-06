/**
 * Регрессия инцидента 2026-08-06 — «завтрак Александры».
 *
 * Что произошло: куратор записал приём пищи в облако, пока PWA клиента лежала
 * в фоне. При возврате из фона телефон выгрузил свою старую копию дня, и приём
 * куратора исчез из облака.
 *
 * Почему защита не сработала: сервер уходит в mergeDayData только когда
 * last_seen_updated_at < cloud.updatedAt. Клиент подставлял в last_seen
 * updatedAt собственного исходящего payload'а — тот бампается при каждой
 * локальной правке, поэтому конфликт был не виден и работал fast-path
 * `mergedValue = incomingValue`. Существовавший hasNewerCurrentItemEdit тоже
 * промахивался: он сверяет только id, присутствующие на ОБЕИХ сторонах, а
 * приём куратора телефон вообще никогда не видел.
 *
 * Здесь проверяется предикат hasUntombstonedEntityDrop, который определяет
 * актуальность по самим данным, а не по присланному клиентом времени.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, test, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Тот же .cjs, который грузит Cloud Function — одинаковый код на обеих сторонах.
const { hasUntombstonedEntityDrop, mergeDayData } = require(
  path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs'),
);

const CURATOR_MEAL = {
  id: 'm_fd413eb530a7',
  name: 'Завтрак',
  time: '12:07',
  updatedAt: 1000,
  items: [
    { id: 'it_2f18298ff5d8', name: 'Куриное филе тушёное в сливках 10', grams: 178, updatedAt: 1000 },
    { id: 'it_016a7f8298b4', name: 'Белок яйца варёный', grams: 77, updatedAt: 1000 },
  ],
};

const cloudDayWithCuratorMeal = () => ({
  date: '2026-08-06',
  updatedAt: 1000,
  meals: [structuredClone(CURATOR_MEAL)],
});

// Телефон пролежал в фоне и приёма куратора не видел, но свой updatedAt
// бампнул — именно эта комбинация и съедала запись.
const staleClientDay = (overrides = {}) => ({
  date: '2026-08-06',
  updatedAt: 2000,
  meals: [],
  ...overrides,
});

describe('hasUntombstonedEntityDrop — защита от затирания облака устаревшей копией', () => {
  test('ловит пропажу приёма, которого нет во входящем и на который нет tombstone', () => {
    expect(hasUntombstonedEntityDrop(staleClientDay(), cloudDayWithCuratorMeal())).toBe(true);
  });

  test('срабатывает даже когда клиент прислал более свежий updatedAt', () => {
    // Ровно случай инцидента: incoming.updatedAt (2000) > cloud.updatedAt (1000),
    // то есть noConflict на сервере был бы true и fast-path затёр бы облако.
    const incoming = staleClientDay({ updatedAt: 99999 });
    expect(incoming.updatedAt).toBeGreaterThan(cloudDayWithCuratorMeal().updatedAt);
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(true);
  });

  test('осознанное удаление приёма (есть tombstone) потерей не считается', () => {
    const incoming = staleClientDay({
      deletedMealIds: { [CURATOR_MEAL.id]: 1500 }, // tombstone свежее правки (1000)
    });
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(false);
  });

  test('tombstone старше правки приёма не прикрывает пропажу (приём воскрешён)', () => {
    const incoming = staleClientDay({
      deletedMealIds: { [CURATOR_MEAL.id]: 500 }, // старше meal.updatedAt = 1000
    });
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(true);
  });

  test('ловит пропажу отдельной позиции внутри сохранившегося приёма', () => {
    const incoming = {
      date: '2026-08-06',
      updatedAt: 2000,
      meals: [{ ...structuredClone(CURATOR_MEAL), items: [structuredClone(CURATOR_MEAL.items[0])] }],
    };
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(true);
  });

  test('осознанное удаление позиции (есть tombstone) потерей не считается', () => {
    const incoming = {
      date: '2026-08-06',
      updatedAt: 2000,
      deletedItemIds: { [CURATOR_MEAL.items[1].id]: 1500 },
      meals: [{ ...structuredClone(CURATOR_MEAL), items: [structuredClone(CURATOR_MEAL.items[0])] }],
    };
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(false);
  });

  test('tombstone из облака (удаление с другого устройства) тоже учитывается', () => {
    const cloud = cloudDayWithCuratorMeal();
    cloud.deletedMealIds = { [CURATOR_MEAL.id]: 1500 };
    expect(hasUntombstonedEntityDrop(staleClientDay(), cloud)).toBe(false);
  });

  test('обычная запись — входящее надмножество облака — потерей не считается', () => {
    const incoming = {
      date: '2026-08-06',
      updatedAt: 2000,
      meals: [
        structuredClone(CURATOR_MEAL),
        { id: 'm_client_lunch', name: 'Обед', updatedAt: 2000, items: [{ id: 'it_x', grams: 100 }] },
      ],
    };
    expect(hasUntombstonedEntityDrop(incoming, cloudDayWithCuratorMeal())).toBe(false);
  });

  test('пустое облако ничего не теряет', () => {
    expect(hasUntombstonedEntityDrop(staleClientDay(), { date: '2026-08-06', meals: [] })).toBe(false);
  });

  test('битые/отсутствующие значения не роняют предикат', () => {
    expect(hasUntombstonedEntityDrop(null, cloudDayWithCuratorMeal())).toBe(false);
    expect(hasUntombstonedEntityDrop(staleClientDay(), null)).toBe(false);
    expect(hasUntombstonedEntityDrop({}, {})).toBe(false);
  });
});

describe('слияние после срабатывания защиты возвращает приём куратора', () => {
  test('mergeDayData с forceKeepAll сохраняет приём, которого не было у клиента', () => {
    const merged = mergeDayData(staleClientDay(), cloudDayWithCuratorMeal(), { forceKeepAll: true });
    const mealIds = (merged.meals || []).map((m) => m.id);
    expect(mealIds).toContain(CURATOR_MEAL.id);
    const restored = merged.meals.find((m) => m.id === CURATOR_MEAL.id);
    expect(restored.items.map((i) => i.id)).toEqual([
      'it_2f18298ff5d8',
      'it_016a7f8298b4',
    ]);
  });

  test('а осознанное удаление слияние не воскрешает', () => {
    const incoming = staleClientDay({ deletedMealIds: { [CURATOR_MEAL.id]: 1500 } });
    const merged = mergeDayData(incoming, cloudDayWithCuratorMeal(), { forceKeepAll: true });
    const mealIds = (merged.meals || []).map((m) => m.id);
    expect(mealIds).not.toContain(CURATOR_MEAL.id);
  });
});
