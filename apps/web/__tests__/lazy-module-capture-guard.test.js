// Захват компонента из лениво загружаемого куска — только внутри рендера.
//
// heys_day_page_shell.js живёт в раннем бандле boot-day, а QuickActionsFab
// регистрирует heys_widgets_ui_v1.js из postboot-3-ui-lazy — тот доезжает уже
// после первого рендера. Пока ссылка бралась на уровне модуля, она навсегда
// оставалась undefined: условие показа FAB её проверяет, поэтому стопка
// быстрых действий не появлялась на «Питании» и «Активе» вообще, а вместо неё
// оставался глобальный FAB мессенджера (он прячется правилом
// `body:has(.widgets-quick-fab-wrap)`, которого без стопки на экране нет).
//
// На Главной этого не было: там компонент используется внутри своего же
// модуля. Тестами класс не ловился — они рендерят компонент напрямую, когда
// HEYS.Widgets уже подставлен фикстурой, то есть мимо самого порядка загрузки.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SHELL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
const BUNDLE_CONFIG = fs.readFileSync(
  path.resolve(WEB_DIR, '../../scripts/legacy-bundle-config.mjs'),
  'utf8',
);

/** Имя бандла, в списке которого лежит файл. */
function bundleOf(fileName) {
  const at = BUNDLE_CONFIG.indexOf(`'${fileName}'`);
  if (at === -1) return null;
  const before = BUNDLE_CONFIG.slice(0, at);
  const headers = [...before.matchAll(/^\s{4}'([a-z0-9-]+)':\s*\[/gm)];
  return headers.length ? headers[headers.length - 1][1] : null;
}

describe('ленивый модуль не захватывается на уровне модуля', () => {
  it('QuickActionsFab действительно приезжает лениво, а оболочка дня — рано', () => {
    // Если раскладка бандлов изменится, тест ниже потеряет смысл — сверяем.
    expect(bundleOf('heys_widgets_ui_v1.js')).toBe('postboot-3-ui-lazy');
    expect(bundleOf('heys_day_page_shell.js')).toBe('boot-day');
  });

  it('оболочка дня читает HEYS.Widgets внутри функции, а не при загрузке', () => {
    const at = SHELL_SRC.indexOf('HEYS.Widgets?.QuickActionsFab');
    expect(at, 'ссылка на QuickActionsFab не найдена').toBeGreaterThan(-1);

    // Ссылка обязана стоять внутри renderDayPage: она выполняется на каждой
    // отрисовке, когда ленивый кусок уже доехал. Любое место выше — это код
    // времени загрузки файла, там HEYS.Widgets ещё не существует.
    const renderStart = SHELL_SRC.indexOf('function renderDayPage(');
    expect(renderStart, 'renderDayPage не найдена').toBeGreaterThan(-1);
    expect(
      at,
      'HEYS.Widgets захвачен вне renderDayPage — к первому рендеру ленивый кусок ещё не загружен',
    ).toBeGreaterThan(renderStart);
  });
});
