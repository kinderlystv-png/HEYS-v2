/**
 * Контракт ролей палитры: вторая и первая поверхность заданы во всех четырёх
 * наборах.
 *
 * Почему тест нужен. `--v4-card`, `--v4-chip` и `--v4-chip-2` использовались в
 * шестнадцати местах, но заданы не были: каждый автор писал свой литеральный
 * фолбэк, и во всех наборах подставлялась песочная поверхность. Ревизия
 * контракта нашла это независимо на двух зонах.
 *
 * 2026-08-24: наборов четыре, а не шесть. Каноничная палитра и её тёмная
 * убраны из файла — канон живёт только на зеркале stable.heyslab.ru, которое
 * этот файл вообще не грузит, а миграция в `heys_theme_v1.js` переписывает
 * сохранённое `classic` на `sand` при каждой загрузке. Вместе с ними отпал
 * бывший здесь пункт «роли поверхностей НЕ заданы в каноничной»: он охранял
 * литералы классики от подстановки роли, а охранять больше нечего. Список
 * наборов сверяется точным равенством — если каноничная вернётся в файл, тест
 * это покажет.
 *
 * Источник значений — контракт канваса (роли --c1 и --c2), не другой токен
 * продукта: `--v4-hero` несёт ту же роль, но в синих наборах разошёлся с
 * канвасом на волос (#e2edf7 против #e2ecf6, #1d3348 против #1e3448).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

/**
 * Разобрать файл на блоки палитр: id набора → карта ролей.
 *
 * Комментарии снимаются до разбора, и это не косметика. В них встречается
 * `--v4-hero:` — упоминание роли в прозе; без снятия жадный `[^;]+` тянется от
 * него до первой точки с запятой и проглатывает следующее настоящее
 * объявление. Тест на этом и споткнулся: значения в файле были, а парсер их не
 * видел.
 */
function palettes() {
  const out = {};
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const id = block[1].match(/data-theme-id="([a-z-]+)"/);
    if (!id) continue;
    const vars = {};
    for (const v of block[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      vars[v[1]] = v[2].trim().toLowerCase();
    }
    out[id[1]] = vars;
  }
  return out;
}

// Роли канваса по наборам — из блока [data-contract] пакета дизайна.
const C1 = { sand: '#f7efe2', 'sand-dark': '#23201b', blue: '#eef3f9', 'blue-dark': '#182a3a' };
const C2 = { sand: '#efe3cf', 'sand-dark': '#2f2820', blue: '#e2ecf6', 'blue-dark': '#1e3448' };
const V4 = Object.keys(C1);

describe('контракт ролей палитры v4', () => {
  const pals = palettes();

  it('находит все четыре набора и ни одного лишнего', () => {
    expect(Object.keys(pals).sort()).toEqual(['blue', 'blue-dark', 'sand', 'sand-dark'].sort());
  });

  it.each(V4)('%s: --v4-card равен первой поверхности канваса', (id) => {
    expect(pals[id]['--v4-card']).toBe(C1[id]);
  });

  it.each(V4)('%s: --v4-chip и --v4-chip-2 равны второй поверхности канваса', (id) => {
    expect(pals[id]['--v4-chip']).toBe(C2[id]);
    expect(pals[id]['--v4-chip-2']).toBe(C2[id]);
  });

  // Роль канваса --val-good — метка «факт есть» (точка записи в сетке
  // календаря и её пара в легенде). До 24.08 роль не была задана нигде, и
  // `var(--v4-good, #7a8a5e)` подставлял песочный шалфей во все четыре набора.
  it('--v4-good задан во всех четырёх наборах значениями --val-good', () => {
    const good = {
      sand: '#7a8a5e',
      'sand-dark': '#8faa6d',
      blue: '#3e9a6b',
      'blue-dark': '#4caf7d',
    };
    for (const id of V4) expect(pals[id]['--v4-good']).toBe(good[id]);
  });

  it('--v4-tint остаётся ролью тинта во всех четырёх наборах', () => {
    const tint = { sand: '#f6e6dd', 'sand-dark': '#3a241a', blue: '#fbe6e2', 'blue-dark': '#33242a' };
    for (const id of V4) expect(pals[id]['--v4-tint']).toBe(tint[id]);
  });
});
