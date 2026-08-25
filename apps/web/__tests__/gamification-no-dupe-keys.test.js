// Публичный объект HEYS.gamification собирается одним литералом длиной в
// несколько тысяч строк. Дублирующийся ключ в таком литерале движок принимает
// молча: побеждает последний, а первый исчезает вместе со своей документацией.
// Пока обе копии совпадают, вреда нет — но это ровно то состояние, из которого
// следующая правка одной копии тихо ничего не меняет.
//
// Сторож структурный, а не поведенческий, и это осознанно: поведенческий тест
// на дубль-копию написать нельзя — обе ветки дают один результат, падать ему
// не на чем.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

describe('gamification: объект экспорта без дублей ключей', () => {
  it('в heys_gamification_v1.js нет повторяющихся ключей объектных литералов', () => {
    const file = path.join(WEB_DIR, 'heys_gamification_v1.js');
    const source = fs.readFileSync(file, 'utf8');

    const linter = new Linter({ configType: 'eslintrc' });
    const messages = linter.verify(source, {
      parserOptions: { ecmaVersion: 2023, sourceType: 'script' },
      rules: { 'no-dupe-keys': 'error' },
    });

    const dupes = messages.filter((m) => m.ruleId === 'no-dupe-keys');
    const report = dupes.map((m) => `  ${m.line}:${m.column} ${m.message}`).join('\n');

    // Страховка от ложного «прошло»: если бы файл не разобрался, dupes был бы
    // пуст по совсем другой причине.
    const fatal = messages.filter((m) => m.fatal);
    expect(fatal, `файл не разобрался:\n${JSON.stringify(fatal, null, 1)}`).toEqual([]);

    expect(dupes, `дублирующиеся ключи:\n${report}`).toEqual([]);
  });
});
