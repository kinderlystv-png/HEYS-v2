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

const SRC = fs.readFileSync(path.join(ROOT, 'scripts/sync-local-workspace.mjs'), 'utf8');

function restoreBody() {
  const start = SRC.indexOf('function restoreDeletedWorkspaces(');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\nasync function main(', start);
  return SRC.slice(start, end > start ? end : start + 2000);
}

describe('Починка workspace не трогает чужую работу', () => {
  it('деревья целиком больше не откатываются', () => {
    const body = restoreBody();
    expect(body).not.toContain("'packages/', 'apps/'");
    expect(body).not.toMatch(/restore['"],\s*['"]apps\//);
  });

  it('восстанавливаются ровно пакеты пропавших манифестов', () => {
    const body = restoreBody();
    // Список уже был — он просто не использовался.
    expect(body).toContain('const deleted = getDeletedWorkspaceManifests();');
    expect(body).toContain('deleted.map(');
    expect(body).toContain("run('restore workspace sources', 'git', ['restore', '--', ...targets]);");
  });

  it('манифест в корне не разворачивается в «всё целиком»', () => {
    const body = restoreBody();
    expect(body).toContain("dir === '.'");
  });

  it('пути разделяются одним видом слэша — git не понимает обратный', () => {
    const body = restoreBody();
    expect(body).toContain('String.fromCharCode(92)');
  });

  it('пустой список по-прежнему ничего не запускает', () => {
    expect(restoreBody()).toContain('if (!deleted.length) return 0;');
  });
});
