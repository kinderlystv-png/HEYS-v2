/**
 * Сверка отбора правил: числа стенда с отбором и без него обязаны совпадать.
 *
 * Отбор в measureZone выбрасывает правила, которые не могут совпасть ни с одним
 * узлом зоны, и этим снимает главную статью расхода — примерку каждого правила
 * к каждому узлу (0,8 с на элемент против мегабайта CSS). Ускорение замера
 * опасно ровно тем, что молча меняет числа: 10 сентября вынос вставки CSS за
 * цикл по наборам дал 644 → 197 с и ложную находку «контраст 2,53» на входе,
 * потому что наборы 2–4 возвращали кеш первого.
 *
 * Поэтому право на ускорение доказывается сверкой, а не рассуждением. Прогон
 * тяжёлый — считает каждую зону дважды, — и поэтому идёт по запросу:
 *
 *   HEYS_STAND_FILTER_AUDIT=1 npx vitest run --root . \
 *     __tests__/v4-palette-stand-filter-equivalence.test.js
 *
 * Замер 10 сентября: 28 зон, 1188 значений, расхождений ноль, 110 → 6,4 с.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureZone } from './helpers/v4-palette-stand.mjs';

const ON = process.env.HEYS_STAND_FILTER_AUDIT === '1';
const DIR = path.resolve(__dirname, 'stands');
const FILES = fs.readdirSync(DIR).filter((file) => file.endsWith('.stand.mjs')).sort();

describe.skipIf(!ON)('отбор правил стенда не меняет числа', () => {
  for (const file of FILES) {
    it(file, async () => {
      const stand = (await import(`./stands/${file}`)).default;
      const withFilter = measureZone(stand, { doc: document });
      document.body.innerHTML = '';
      const withoutFilter = measureZone(stand, { doc: document, noFilter: true });

      expect(withFilter.notFound.sort()).toEqual(withoutFilter.notFound.sort());
      const mismatched = [];
      for (const setId of Object.keys(withoutFilter.sets)) {
        for (const key of Object.keys(withoutFilter.sets[setId])) {
          const full = JSON.stringify(withoutFilter.sets[setId][key]);
          const slim = JSON.stringify(withFilter.sets[setId]?.[key]);
          if (full !== slim) mismatched.push(`${stand.zone} · ${setId} · ${key}: ${full} против ${slim}`);
        }
      }
      expect(mismatched).toEqual([]);
    }, 900_000);
  }
});
