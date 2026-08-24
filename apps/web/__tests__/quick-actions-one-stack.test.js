// Стопка быстрых действий — сколько её адресов и не встречаются ли они на одном
// экране.
//
// Строка контракта home-widgets «где рисуются» говорит: «плавающие кнопки живут
// только в этом файле; канвасы вкладок их не рисуют. В режиме расстановки их
// нет». В продукте сегодня два разных исполнения стопки:
//   1) v4 — одна кнопка «+» с карточкой (WidgetsQuickActionsFab, Главная);
//   2) легаси — столбик из пяти кнопок (QuickActionsFabGroup, вкладки «День»:
//      Питание / Актив / Отчёты).
// Свести их в одно исполнение сейчас нельзя: вместе с легаси-столбиком уходит
// кнопка воды `.water-fab`, а на неё завязаны строки water-add «фича»
// (ряд −200 / +200 / +500), «свой объём» (долгое нажатие) и «якорь» столбика
// (resolveWaterColumnAnchor в heys_day_page_shell → heys_day_day_handlers.js
// ищет именно `.water-fab`). Решение вынесено владельцу.
//
// Пока решения нет, этот тест сторожит то, что от двух адресов и правда болит:
// два исполнения не должны оказаться на экране одновременно. Проверка
// исходниками, а не рендером: обе стопки живут в разных корнях React и в jsdom
// вместе не поднимаются — сравнивать пришлось бы поддельную сборку.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const dayShell = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
const widgetsUi = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

describe('стопка быстрых действий: два адреса не пересекаются', () => {
  it('легаси-столбик рисуется только на активной вкладке «День»', () => {
    const idx = dayShell.indexOf('React.createElement(QuickActionsFabGroup, {');
    expect(idx, 'QuickActionsFabGroup не найден').toBeGreaterThan(-1);
    const guard = dayShell.slice(Math.max(0, idx - 220), idx);
    expect(guard).toContain('isTabActive');
    expect(guard).toContain("mobileSubTab === 'stats'");
    expect(guard).toContain("mobileSubTab === 'diary'");
    expect(guard).toContain("mobileSubTab === 'activity'");
  });

  it('v4-стопка рисуется только на Главной и не в режиме расстановки', () => {
    // Строка контракта «где рисуются», вторая половина: «В режиме
    // расстановки их нет». Она же — строка «в режиме расстановки» у кнопки
    // настройки экрана.
    const idx = widgetsUi.indexOf('const renderMobileFabs = ()');
    expect(idx, 'renderMobileFabs не найден').toBeGreaterThan(-1);
    const body = widgetsUi.slice(idx, idx + 900);
    expect(body).toMatch(/if \(!isMobile \|\| isEditMode\) return null;/);
    expect(body).toContain('widgets-fab-left');
    expect(body).toContain('WidgetsQuickActionsFab');
  });

  it('второго исполнения v4-стопки в дневной оболочке нет', () => {
    expect(dayShell).not.toContain('widgets-quick-fab');
    expect(widgetsUi).not.toContain('QuickActionsFabGroup');
  });
});
