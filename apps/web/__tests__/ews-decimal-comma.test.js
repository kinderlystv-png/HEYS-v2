// Дробные числа в тексте предупреждений — через запятую.
//
// Замер 12 сентября нашёл на экране «в среднем 4.8 ч при цели 8» и «—» на месте
// числа. Прочерк починили тогда же, точку — нет: она осталась в пяти фразах,
// потому что числа печатали четырьмя разными способами и три давали точку.
// Сторожим не сами фразы (их перепишут), а правило: в строке, которая уходит
// человеку, не должно быть ни toFixed без замены, ни деления на десять.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const SRC = fs.readFileSync(
  path.resolve(path.dirname(__filename), '../insights/pi_early_warning.js'),
  'utf8',
);

// Поля, которые видит человек. Служебные логи и диагностика сюда не входят:
// в консоли точка ничего не ломает и правило про неё не про них.
const ВИДИМЫЕ_ПОЛЯ = /(?:humanMessage|detail|title|message):\s*`/;
const ТОЧКА_В_ЧИСЛЕ = /toFixed\(\s*\d\s*\)(?!\s*\.replace)|Math\.round\([^)]*\*\s*10\s*\)\s*\/\s*10/;

describe('предупреждения: дробные на экране — через запятую', () => {
  it('ни одна видимая строка не печатает число с точкой', () => {
    const виноватые = SRC.split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => ВИДИМЫЕ_ПОЛЯ.test(line) && ТОЧКА_В_ЧИСЛЕ.test(line));

    expect(виноватые.map((x) => `${x.n}: ${x.line.slice(0, 90)}`)).toEqual([]);
  });

  it('хелпер на месте и целое оставляет целым', () => {
    // «8,0 ч» вместо «8 ч» — такой же мусор, как точка вместо запятой.
    expect(SRC).toContain('function sayNumber(');
    expect(SRC).toMatch(/Number\.isInteger\(rounded\)\s*\?\s*String\(rounded\)/);
  });
});
