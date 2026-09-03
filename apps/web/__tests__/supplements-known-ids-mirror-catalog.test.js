/**
 * @fileoverview Два списка идентификаторов добавок обязаны совпадать:
 * `SUPPLEMENTS_CATALOG` (heys_supplements_v1.js) — то, что человек видит в
 * экране курса, `KNOWN_SUPPLEMENT_IDS` (heys_health_features_v1.js) — allowlist
 * того, что вообще можно сохранить (docs/release/lawyer-B-fields.md, строка
 * «Добавки»).
 *
 * Почему нужен гейт. Расхождение не падает и ничего не сообщает: позиция,
 * которой нет в allowlist, показывается в списке, а `filterCatalogSupplementIds`
 * выбрасывает её при сохранении — молча. 3 сентября так вёл себя `iodine`: он
 * приехал в каталог коммитом 9683ae782 и не приехал в allowlist, и завести Йод
 * в курс было нельзя вообще, без единого признака отказа.
 *
 * Проверка читает оба файла текстом, а не через импорт: `heys_supplements_v1.js`
 * — IIFE на `window` весом 3771 строку, поднимать его ради двух списков дороже,
 * чем разобрать.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

function catalogIds() {
  const src = read('heys_supplements_v1.js');
  const start = src.indexOf('const SUPPLEMENTS_CATALOG = {');
  expect(start, 'SUPPLEMENTS_CATALOG не найден').toBeGreaterThan(-1);
  const end = src.indexOf('\n  };', start);
  expect(end, 'конец SUPPLEMENTS_CATALOG не найден').toBeGreaterThan(start);
  return [...src.slice(start, end).matchAll(/^ {4}(\w+):\s*\{/gm)].map((m) => m[1]);
}

function allowlistIds() {
  const src = read('heys_health_features_v1.js');
  const start = src.indexOf('const KNOWN_SUPPLEMENT_IDS = new Set([');
  expect(start, 'KNOWN_SUPPLEMENT_IDS не найден').toBeGreaterThan(-1);
  const end = src.indexOf(']);', start);
  expect(end, 'конец KNOWN_SUPPLEMENT_IDS не найден').toBeGreaterThan(start);
  return [...src.slice(start, end).matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

describe('добавки: каталог и allowlist — один и тот же набор', () => {
  it('разбор обоих списков дал непустой результат', () => {
    // Гейт обязан отличать «сошлось» от «не смотрели»: пустой разбор — это
    // уехавший якорь, а не согласие двух списков.
    expect(catalogIds().length).toBeGreaterThan(30);
    expect(allowlistIds().length).toBeGreaterThan(30);
  });

  it('в каталоге нет позиции, которую нельзя сохранить', () => {
    const allow = new Set(allowlistIds());
    const orphans = catalogIds().filter((id) => !allow.has(id));
    // Такая позиция показывается в экране курса и молча выпадает при
    // сохранении — отказ без ошибки и без подсказки.
    expect(orphans).toEqual([]);
  });

  it('в allowlist нет позиции, которой нет в каталоге', () => {
    const catalog = new Set(catalogIds());
    const ghosts = allowlistIds().filter((id) => !catalog.has(id));
    // Обратное расхождение безвредно для человека, но означает, что один из
    // списков правили без второго — то есть следующее расхождение будет живым.
    expect(ghosts).toEqual([]);
  });

  it('свободный ввод остаётся запрещённым', () => {
    // Строка согласия supplements_tracking 1.0: «только позиции из справочника
    // сервиса», custom_* запрещён (docs/release/lawyer-B-fields.md).
    const src = read('heys_health_features_v1.js');
    expect(src).toContain("if (value.startsWith('custom_')) return false;");
  });
});
