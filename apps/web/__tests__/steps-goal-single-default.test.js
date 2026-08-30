// Цель шагов по умолчанию — одна на весь продукт.
//
// Поля `stepsGoal` у человека может не быть: профиль заводился до того, как оно
// появилось, или мастер первого входа не дошёл до шагов. Тогда срабатывает
// запасное значение рядом с `||`, и до 31 августа их было три — 7000 в десяти
// местах, 10000 в пяти, 8000 в одном. У такого человека вкладка «Актив»
// считала дисциплину от одной цели, матрица «Дисциплина» от другой, а детектор
// гиподинамии от третьей: одни и те же шаги давали разный результат на
// соседних экранах, и объяснить это было нечем.
//
// Правильное значение — то, что стоит в модели профиля
// (`heys_user_v12.js`, `stepsGoal: 10000`): запасное обязано совпадать с ним,
// иначе оно молча спорит с тем, что записано человеку при заполнении.
//
// Тест держит единственное значение по всему дереву. Голая правка шестнадцати
// мест без него — это ровно то, как получились те три.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const DEFAULT = 10000;

// Запасное значение рядом со `stepsGoal`: `|| 7000`, `?? 8000`, `|| 10000`.
const FALLBACK = /tepsGoal[^\n;]{0,60}?(?:\|\||\?\?)\s*(\d{3,6})/g;

// Каталоги продукта. `public/` — собранные бандлы, их чинит пересборка.
const SKIP = new Set(['public', 'node_modules', '__tests__', 'fingers', 'mobility']);

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      sources(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.js')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Отступлений нет: значение одно на всё дерево. Список здесь заведён пустым
// намеренно — он показывает, что механизм исключений есть, и первое же
// отступление придётся назвать поимённо и с причиной, а не просто добавить
// четвёртое число.
const KNOWN = new Map();

describe('цель шагов по умолчанию', () => {
  const files = sources(WEB);

  // Модель профиля живёт в двух копиях, и это не опечатка теста: одна в ядре,
  // вторая во вкладке профиля. Пока копии две, обе обязаны объявлять одно
  // число — разъехавшийся дубль это ровно тот механизм, которым получились
  // три разных запасных значения.
  const MODELS = ['heys_user_v12.js', 'heys_user_tab_impl_v1.js'];

  it('обе копии модели профиля объявляют то же число, что и запасные значения', () => {
    const wrong = MODELS.filter((rel) => {
      const model = fs.readFileSync(path.join(WEB, rel), 'utf8');
      return !model.includes(`stepsGoal: ${DEFAULT}`);
    });
    expect(wrong).toEqual([]);
  });

  it('другого запасного значения в продукте нет', () => {
    const wrong = [];
    for (const file of files) {
      const rel = path.relative(WEB, file).split(path.sep).join('/');
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(FALLBACK)) {
        const value = Number(m[1]);
        if (value === DEFAULT) continue;
        if (KNOWN.get(rel) === value) continue;
        wrong.push(`${rel}: ${value}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('список известных отступлений пуст', () => {
    expect([...KNOWN.keys()]).toEqual([]);
  });

  it('запасное значение вообще есть — правило не о пустом множестве', () => {
    // Если завтра кто-то уберёт все `|| 10000`, три проверки выше станут
    // зелёными на пустоте и правило перестанет что-либо держать.
    let seen = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      seen += [...src.matchAll(FALLBACK)].filter((m) => Number(m[1]) === DEFAULT).length;
    }
    expect(seen).toBeGreaterThanOrEqual(10);
  });
});
