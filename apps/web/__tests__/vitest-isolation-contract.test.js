// Изоляция прогона: каждый тестовый файл получает свой процесс.
//
// Одни и те же 529 файлов apps/web собираются двумя конфигами — своим и
// корневым (у корневого include по умолчанию). Пока в корневом стоял
// singleFork, файлы делили один процесс: global.HEYS, window и подменённый
// localStorage переживали границу файла, и падал не тот, кто испортил, а
// следующий. Замер 31 августа: с singleFork — 143 файла и 896 тестов красных,
// без него — 6427 тестов зелёных и ни одного упавшего.
//
// По отдельности такие файлы всегда зелёные, поэтому расхождение читалось как
// «флак». Проверка держит настройку, а не воспоминание о ней.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Строки конфига без комментариев: в них singleFork упоминается по делу. */
const code = (rel) =>
  read(rel)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('изоляция vitest', () => {
  it('ни один конфиг не сажает файлы в общий процесс', () => {
    for (const config of ['vitest.config.ts', 'apps/web/vitest.config.ts']) {
      const src = code(config);
      expect(src, `${config}: singleFork`).not.toMatch(/singleFork\s*:\s*true/);
      expect(src, `${config}: singleThread`).not.toMatch(/singleThread\s*:\s*true/);
      expect(src, `${config}: isolate`).not.toMatch(/isolate\s*:\s*false/);
    }
  });

  it('в папке vitest-тестов нет файлов на node:test', () => {
    // node:test-файл среди vitest-тестов не выполняется: под конфигом apps/web
    // он проходит как «no tests» (passWithNoTests), под корневым падает «No
    // test suite found». Так восемь проверок consent-proof-v2 не работали.
    const dir = path.join(ROOT, 'apps/web/__tests__');
    const strays = fs
      .readdirSync(dir)
      .filter((name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name))
      .filter((name) => /from\s+'node:test'|require\(['"]node:test['"]\)/.test(
        fs.readFileSync(path.join(dir, name), 'utf8'),
      ));
    expect(strays).toEqual([]);
  });
});
