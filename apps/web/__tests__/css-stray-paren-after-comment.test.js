// Сторож одной опечатки, которая молча выключает правило: закрывающая скобка
// после комментария — `color: var(--v4-ink-3) /* v4-intentional */);`.
// Браузер считает такое объявление недействительным и берёт цвет из соседнего
// правила. 11 сентября так нашлись семь объявлений пустого дня Главной:
// прочерк калорий шёл акцентом вместо чернил 42 %, «— / N» у колец БЖУ —
// чернилами и бледной нормой. Гейты ролей видели имя роли и молчали.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const STYLES = path.resolve(__dirname, '../styles');

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

describe('CSS: скобка после комментария не ломает объявление', () => {
  const files = cssFiles(STYLES);

  it('обходит все стили, а не пустой список', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('нет «*/)» — объявления с такой скобкой браузер отбрасывает', () => {
    const hits = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/\*\/\s*\)/.test(line)) hits.push(`${path.relative(STYLES, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
