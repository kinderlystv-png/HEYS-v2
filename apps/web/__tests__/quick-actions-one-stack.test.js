// Стопка быстрых действий — одно исполнение v4 на Главной и на вкладках «День».
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const dayShell = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
const widgetsUi = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

describe('стопка быстрых действий: одно v4-исполнение', () => {
  it('вкладки «День» рисуют WidgetsQuickActionsFab через HEYS.Widgets.QuickActionsFab', () => {
    const idx = dayShell.indexOf('React.createElement(DayQuickActionsFab');
    expect(idx, 'DayQuickActionsFab не найден').toBeGreaterThan(-1);
    const guard = dayShell.slice(Math.max(0, idx - 220), idx);
    expect(guard).toContain('isTabActive');
    expect(guard).toContain("mobileSubTab === 'stats'");
    expect(guard).not.toContain("mobileSubTab === 'diary'");
    expect(guard).toContain("mobileSubTab === 'activity'");
    expect(dayShell).toContain('const DayQuickActionsFab = HEYS.Widgets?.QuickActionsFab');
    expect(dayShell).not.toContain('QuickActionsFabGroup');
    expect(dayShell).not.toContain('water-fab');
  });

  it('v4-стопка на Главной и не в режиме расстановки', () => {
    const idx = widgetsUi.indexOf('const renderMobileFabs = ()');
    expect(idx, 'renderMobileFabs не найден').toBeGreaterThan(-1);
    const body = widgetsUi.slice(idx, idx + 1500);
    expect(body).toMatch(/if \(!isMobile \|\| isWidgetsCuratorReadOnly\(\)\) return null;/);
    expect(body).toContain('done: isEditMode');
    expect(body).toContain('!isEditMode && React.createElement(WidgetsQuickActionsFab');
    expect(body).toContain('widgets-fab-left');
  });

  it('легаси-столбик fab-group в дневной оболочке не рисуется', () => {
    expect(dayShell).not.toContain('fab-group');
    expect(dayShell).not.toContain('QuickActionsFabGroup');
    expect(widgetsUi).not.toContain('QuickActionsFabGroup');
  });
});
