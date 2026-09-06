import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_planning_store_v1.js'), 'utf8');

function loadPluralHelper() {
  const start = storeSrc.indexOf('function ruPluralNewTasksLabel');
  const end = storeSrc.indexOf('function countSettingsNewTasks', start);
  const helperSource = storeSrc.slice(start, end);
  return Function(`${helperSource}; return { ruPluralNewTasksLabel };`)();
}

describe('settings-system: badge «Задачи · N новые»', () => {
  it('app shell рендерит счётчик в строке задач акцентным тоном', () => {
    expect(shellSrc).toContain('getSettingsTasksBadgeMeta');
    expect(shellSrc).toContain('settingsTasksBadgeMeta');
    expect(shellSrc).toContain("key: 'tasks'");
    expect(shellSrc).toContain("metaTone: settingsTasksBadgeMeta ? 'accent'");
    expect(shellSrc).toContain('hdr-settings-sheet__meta-text--accent');
  });

  it('planning store считает задачи со статусом todo', () => {
    expect(storeSrc).toContain("task.status === 'todo'");
    expect(storeSrc).toContain('getSettingsTasksBadgeMeta');
  });

  it('форматирует подпись по-русски', () => {
    const { ruPluralNewTasksLabel } = loadPluralHelper();
    expect(ruPluralNewTasksLabel(1)).toBe('новая');
    expect(ruPluralNewTasksLabel(3)).toBe('новые');
    expect(ruPluralNewTasksLabel(5)).toBe('новых');
  });
});
