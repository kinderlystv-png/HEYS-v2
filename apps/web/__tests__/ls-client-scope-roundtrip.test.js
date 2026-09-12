// Ключ клиента скоупится ровно один раз — на записи и на чтении.
//
// Обёртка HEYS.utils.lsGet/lsSet живёт в heys_core_v12.js двумя слоями: сначала
// базовые lsGet/lsSet, потом IIFE, которая подменяет их на `(k, d) => base(nsKey(k), d)`.
// Оба слоя умеют дописать clientId, поэтому подозрение «ключ скоупится дважды и
// профиль читается пустым» возникает регулярно. Защита стоит в обоих местах
// (`nsKey`: `if (String(k).includes(cid)) return k`; `scoped()` в
// heys_storage_layer_v1.js — то же условие), но держится она только на том, что
// обе проверки на месте: убери любую — и heys_<cid>_heys_<cid>_profile появится
// молча, а UI увидит пустой объект и уедет на запасные 70 кг.
//
// Тест гоняет НАСТОЯЩИЕ исходники, а не копию логики: симуляция здесь ничего не
// стоит, потому что сломаться может ровно то, что она не воспроизводит.
//
// Отдельно закрыт сжатый слот: значения длиннее 384 символов Store кладёт с
// префиксом ¤Z¤, и всякий путь чтения, который делает голый JSON.parse, на них
// падает и возвращает значение по умолчанию. Эта ошибка в проекте всплывала уже
// не раз (см. Store.readSafe в heys_storage_layer_v1.js).
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const LAYER_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_storage_layer_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_core_v12.js'), 'utf8');

const CID = '11111111-1111-1111-1111-111111111111';
const DOUBLE_SCOPED = `heys_${CID}_heys_${CID}_profile`;

/** Поднимает настоящие слои хранилища поверх чистого localStorage. */
function boot(currentClientId) {
  delete window.HEYS;
  window.HEYS = { currentClientId };
  (0, eval)(LAYER_SRC);
  (0, eval)(CORE_SRC);
  return window.HEYS;
}

/** Слоты клиента в LS; служебный маркер разовой уборки к делу не относится. */
function clientSlots() {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith('heys_') && k !== 'heys_cleanup_scoped_uikeys_v2')
    .sort();
}

describe('lsGet/lsSet · клиентский скоуп', () => {
  beforeEach(() => {
    localStorage.clear();
    // Трассировка записей в storage-слое шумит в stdout и к делу не относится.
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('запись и чтение по короткому ключу дают один слот', () => {
    const HEYS = boot(CID);

    HEYS.utils.lsSet('heys_profile', { weight: 74 });

    expect(HEYS.utils.lsGet('heys_profile', {}).weight).toBe(74);
    expect(clientSlots()).toEqual([`heys_${CID}_profile`]);
    expect(localStorage.getItem(DOUBLE_SCOPED)).toBeNull();
  });

  it('уже скоупленный ключ не скоупится повторно', () => {
    const HEYS = boot(CID);

    HEYS.utils.lsSet(`heys_${CID}_profile`, { weight: 81 });

    // Короткая и длинная форма — один и тот же слот, а не два.
    expect(HEYS.utils.lsGet('heys_profile', {}).weight).toBe(81);
    expect(HEYS.utils.lsGet(`heys_${CID}_profile`, {}).weight).toBe(81);
    expect(clientSlots()).toEqual([`heys_${CID}_profile`]);
  });

  it('обёртка и HEYS.store читают один слот', () => {
    const HEYS = boot(CID);

    HEYS.utils.lsSet('heys_profile', { weight: 74 });

    expect(HEYS.store.get('heys_profile', {}).weight).toBe(74);
    expect(HEYS.store.get(`heys_${CID}_profile`, {}).weight).toBe(74);
  });

  it('сжатое значение переживает round-trip', () => {
    const HEYS = boot(CID);
    const products = Array.from({ length: 40 }, (_, i) => ({
      name: `Продукт ${i}`, kcal100: 100, protein100: 1, carbs100: 2, fat100: 3,
    }));

    HEYS.utils.lsSet('heys_products', products);

    // Проверка имеет смысл, только если Store действительно сжал значение.
    expect(localStorage.getItem(`heys_${CID}_products`).startsWith('¤Z¤')).toBe(true);
    expect(HEYS.utils.lsGet('heys_products', []).length).toBe(40);
  });

  it('до авторизации обёртка находит данные выбранного клиента', () => {
    // Перезагрузка страницы: клиент в LS уже выбран, HEYS.currentClientId ещё
    // не проставлен. nsKey берёт клиента из heys_client_current — профиль
    // должен находиться, а не подменяться значением по умолчанию.
    const first = boot(CID);
    first.utils.lsSet('heys_profile', { weight: 74 });

    const booted = boot(undefined);
    localStorage.setItem('heys_client_current', JSON.stringify(CID));

    expect(booted.utils.lsGet('heys_profile', {}).weight).toBe(74);
  });

  it('до авторизации обёртка и HEYS.store читают один слот', () => {
    // Расхождение этих двух читателей и выходило наружу разной нормой воды:
    // карточка «Питания» берёт профиль через обёртку, плитка Главной — через
    // Store, и вторая уезжала на запасные 70 кг.
    const first = boot(CID);
    first.utils.lsSet('heys_profile', { weight: 74 });

    const booted = boot(undefined);
    localStorage.setItem('heys_client_current', JSON.stringify(CID));

    expect(booted.utils.lsGet('heys_profile', {}).weight).toBe(74);
    expect(booted.store.get('heys_profile', {}).weight).toBe(74);
  });

  it('до авторизации сжатое значение читается, а не подменяется пустым', () => {
    const first = boot(CID);
    first.utils.lsSet('heys_products', Array.from({ length: 40 }, (_, i) => ({
      name: `Продукт ${i}`, kcal100: 100, protein100: 1, carbs100: 2, fat100: 3,
    })));
    expect(localStorage.getItem(`heys_${CID}_products`).startsWith('¤Z¤')).toBe(true);

    const booted = boot(undefined);
    localStorage.setItem('heys_client_current', JSON.stringify(CID));

    expect(booted.utils.lsGet('heys_products', []).length).toBe(40);
  });

  it('глобальные ключи остаются вне клиентского скоупа', () => {
    const HEYS = boot(CID);

    HEYS.utils.lsSet('heys_client_current', CID);

    expect(localStorage.getItem('heys_client_current')).toBe(JSON.stringify(CID));
    expect(localStorage.getItem(`heys_${CID}_client_current`)).toBeNull();
  });
});
