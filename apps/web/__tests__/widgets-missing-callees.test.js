/**
 * Регрессия на «тихие промахи»: вызовы через optional chaining
 * (`HEYS.X?.method?.()`), которые ссылаются на несуществующие имена.
 * Optional chaining глушит промах — ошибок в консоли нет, виджет просто
 * деградирует в нули. Поэтому проверяем не поведение UI, а то, что
 * вызываемое имя реально экспортируется живым модулем.
 *
 * Тесты читают ИСХОДНИК и резолвят путь вызова против настоящего модуля,
 * а не против переписанной в тесте копии логики.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function resolvePath(root, dottedPath) {
  return dottedPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), root);
}

describe('grid metrics: UI зовёт то имя, которое экспортирует ядро', () => {
  let calleePaths;

  beforeAll(() => {
    global.window = global;
    global.HEYS = {};
    // Ядро регистрируется сайд-эффектом IIFE — исполняем явно.
    // eslint-disable-next-line no-new-func
    new Function('window', read('apps/web/heys_widgets_core_v1.js'))(global);

    const ui = read('apps/web/heys_widgets_ui_v1.js');
    calleePaths = [...ui.matchAll(/([\w.]+)\?\.getCellMetrics\?\.\(\)/g)].map((m) => m[1]);
  });

  it('в UI вообще есть вызовы getCellMetrics (иначе тест бессмысленен)', () => {
    expect(calleePaths.length).toBeGreaterThan(0);
  });

  it('каждый вызов getCellMetrics попадает в живой объект ядра', () => {
    for (const dotted of calleePaths) {
      const owner = resolvePath(global, dotted);
      expect(owner, `${dotted} не существует — вызов молча уходит в фолбэк`).toBeTruthy();
      expect(typeof owner.getCellMetrics, `${dotted}.getCellMetrics`).toBe('function');
    }
  });

  it('фолбэк в UI совпадает с фолбэком ядра — иначе шаг привязки при ресайзе разъедется', () => {
    // Ядро без .widgets-grid в DOM отдаёт свой фолбэк: он и есть эталон.
    const kernelFallback = global.HEYS.Widgets.grid.getCellMetrics();
    const ui = read('apps/web/heys_widgets_ui_v1.js');
    const uiFallbacks = [
      ...ui.matchAll(
        /getCellMetrics\?\.\(\)\s*\|\|\s*\{\s*cellWidth:\s*(\d+),\s*cellHeight:\s*(\d+),\s*gap:\s*(\d+)\s*\}/g,
      ),
    ];

    expect(uiFallbacks.length).toBe(calleePaths.length);
    for (const [, cellWidth, cellHeight, gap] of uiFallbacks) {
      expect(Number(cellHeight)).toBe(kernelFallback.cellHeight);
      expect(Number(gap)).toBe(kernelFallback.gap);
      expect(Number(cellWidth)).toBeGreaterThan(0);
    }
  });
});

describe('реестр не объявляет настройки-пустышки', () => {
  it('каждый тумблер из реестра кто-то читает в живом слое', () => {
    const registry = read('apps/web/heys_widgets_registry_v1.js');
    const consumers = [
      'apps/web/heys_widgets_ui_v1.js',
      'apps/web/widgets/widget_data.js',
      'apps/web/heys_widgets_data_crash_risk_v1.js',
    ].map(read).join('\n');

    const declared = new Set(
      [...registry.matchAll(/^\s{6,}(\w+):\s*\{\s*type:\s*'(?:boolean|number|select)'/gm)].map((m) => m[1]),
    );
    expect(declared.size).toBeGreaterThan(10);

    const dead = [...declared].filter((key) => !new RegExp(`\\b${key}\\b`).test(consumers));
    expect(dead, 'настройка есть в модалке, но её никто не читает').toEqual([]);
  });
});
