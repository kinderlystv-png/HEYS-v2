// sync-local-restore-scope.test.js — восстановление пропавших workspace
// не должно откатывать чужую работу.
//
// `restoreDeletedWorkspaces` в scripts/sync-local-workspace.mjs выполняла
// `git restore packages/ apps/` безусловно: при любой сорванной установке,
// съевшей один package.json, откатывалось всё несохранённое в обоих деревьях —
// у всех параллельных сессий разом. Зовётся она со старта dev, после pull,
// после merge и после каждого push, то есть постоянно. 31 августа так дважды
// снесло правки карточки шагов в apps/web.
//
// Проверяем источником: поднять сорванный pnpm install ради одного git-вызова
// дороже, чем прочитать сам вызов.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

const FILES = [
  // Одна и та же ветка живёт в двух скриптах, и разъехались они ровно так, как
  // разъезжаются копии: sync починили, ensure не заметили. Проверяем обе — иначе
  // возврат к безусловному `restore packages/ apps/` в одной пройдёт молча.
  ['scripts/sync-local-workspace.mjs', 'restoreDeletedWorkspaces', '\nasync function main('],
  ['scripts/ensure-local-toolchain.mjs', 'const deleted = getDeletedWorkspaceManifests();', '\n  if (!ok'],
];

function restoreBody(file, from, to) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = src.indexOf(from);
  expect(start, file).toBeGreaterThan(-1);
  const end = src.indexOf(to, start);
  return src.slice(start, end > start ? end : start + 2500);
}

describe.each(FILES)('Починка workspace не трогает чужую работу — %s', (file, from, to) => {
  const body = () => restoreBody(file, from, to);

  it('деревья целиком больше не откатываются', () => {
    expect(body()).not.toContain("'packages/', 'apps/'");
    expect(body()).not.toMatch(/restore['"],\s*['"]apps\//);
  });

  it('восстанавливаются ровно пакеты пропавших манифестов', () => {
    const text = body();
    // Список уже был — он просто не использовался.
    expect(text).toContain('getDeletedWorkspaceManifests()');
    expect(text).toContain('deleted.map(');
    expect(text).toMatch(/\['restore', '--', \.\.\.targets\]/);
  });

  it('манифест в корне не разворачивается в «всё целиком»', () => {
    expect(body()).toContain("dir === '.'");
  });

  it('пути разделяются одним видом слэша — git не понимает обратный', () => {
    expect(body()).toContain('String.fromCharCode(92)');
  });
});

describe('Границы починки названы, а не забыты', () => {
  it('пустой список ничего не запускает', () => {
    expect(restoreBody(...FILES[0])).toContain('if (!deleted.length) return 0;');
  });

  it('известное ограничение: пропажа apps/web/package.json вернёт apps/web целиком', () => {
    // Это прямое следствие правила «вернуть пакет, чей манифест исчез», и сузить
    // дальше можно только отказавшись от восстановления. Разница с прежним
    // поведением в причине: раньше хватало пропажи любого манифеста в packages/.
    // Названо здесь, чтобы следующий читатель не считал это недосмотром.
    expect(restoreBody(...FILES[0])).toContain('targets');
  });
});
