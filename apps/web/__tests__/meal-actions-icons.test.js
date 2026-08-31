/**
 * Иконки листа «Действия с приёмом» (кадр «Приём · правка», канвас food-meal).
 *
 * Ответ дизайнера №34: у двух пунктов иконка изображала другое действие —
 * обмен стрелками вместо переноса на день, закладка вместо сохранения набором.
 * Обмен означает «поменять местами», закладка — «в избранное». Иконка здесь
 * единственное, что различает четыре одинаковых по длине строки при беглом
 * взгляде, поэтому подмена смысла тут дороже, чем кажется.
 *
 * Проверка читает формы из САМОГО КАДРА, а не из литералов в тесте: тест,
 * записанный литералом, охраняет литерал, а не правило, и падает на починке.
 * Заодно это снимает ограничение, из-за которого «Сохранить набором» едва не
 * отложили: разбор режет `data-v` на 95 знаках (долг дизайнера №45) и обрывает
 * рисунок 12 многоточием — но обрезан пересказ, а разметка кадра полна.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
const CANVAS = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения'
      + '/design_handoff_heys_v4/food-meal.v4.dc.html',
  ),
  'utf8',
);

// Иконки кадра «Приём · правка»: разметка <svg> и подпись сразу за ней.
function frameIcons() {
  const at = CANVAS.indexOf('data-screen-label="Приём · правка"');
  expect(at).toBeGreaterThan(-1);
  const frame = CANVAS.slice(at, at + 9000);
  const found = new Map();
  for (const m of frame.matchAll(/<svg[^>]*>((?:(?!<svg)[\s\S])*?)<\/svg>([^<]{2,60})/g)) {
    const label = m[2].trim();
    if (label) found.set(label, m[1].replace(/\s+/g, ' ').trim());
  }
  return found;
}

describe('лист действий с приёмом: иконка называет то же действие, что подпись', () => {
  const icons = frameIcons();

  it('кадр вообще прочитан — иначе пустая карта пройдёт молча', () => {
    // Проверка обязана отличать «сошлось» от «не смотрели».
    expect([...icons.keys()]).toEqual(
      expect.arrayContaining([
        'Копировать приём', 'Переместить на другой день', 'Сохранить набором',
      ]),
    );
  });

  it('перенос на день — календарь со стрелкой, а не обмен стрелками', () => {
    const drawn = icons.get('Переместить на другой день');
    expect(drawn).toContain('rx="3"');
    const curve = /<path d="([^"]+)"/.exec(drawn)[1];
    expect(SRC).toContain(curve);
    expect(SRC).toContain('{ x: 3, y: 5, width: 18, height: 16, rx: 3 }');
    // Прежняя форма: обмен стрелками. Её быть не должно нигде в файле.
    expect(SRC).not.toContain('M4 7h11l-3-3M20 17H9l3 3');
  });

  it('сохранение набором — документ с загнутым углом, а не закладка', () => {
    const drawn = icons.get('Сохранить набором');
    const curves = [...drawn.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(curves).toHaveLength(2);
    for (const curve of curves) expect(SRC).toContain(curve);
    expect(SRC).not.toContain('M5 4h14v16l-7-4-7 4z');
  });

  it('копирование — верхний лист рамкой со скруглением, а не острыми углами', () => {
    const drawn = icons.get('Копировать приём');
    expect(drawn).toContain('rx="2.5"');
    expect(SRC).toContain('{ x: 9, y: 9, width: 11, height: 11, rx: 2.5 }');
    expect(SRC).not.toContain('M9 9h11v11H9z');
  });
});

describe('помощник иконок: рамка появилась, одна кривая не сломалась', () => {
  it('третий аргумент принимает и строку, и список частей', () => {
    const at = SRC.indexOf('function svgIcon(');
    const body = SRC.slice(at, at + 900);
    expect(body).toContain('Array.isArray(parts)');
    // Строка — по-прежнему кривая: так вызывают остальные иконки файла.
    expect(body).toMatch(/typeof part === 'string'[\s\S]*?'path'/);
    // Объект — рамка. Больше видов частей нет: произвольная SVG-разметка тут
    // не нужна, и второй помощник рядом не заводился.
    expect(body).toContain("'rect'");
  });

  it('остальные вызовы помощника остались на одной кривой', () => {
    // Списки приходят только из actionRow — через переменную icon. Прямые
    // вызовы помощника как звали кривой строкой, так и зовут: если бы старая
    // ветка отвалилась, эти иконки перестали бы рисоваться совсем.
    const literal = [...SRC.matchAll(/svgIcon\(React, \{[^}]*\}, '/g)];
    expect(literal.length).toBeGreaterThan(5);
    expect(SRC).not.toMatch(/svgIcon\(React, \{[^}]*\}, \[/);
  });
});
