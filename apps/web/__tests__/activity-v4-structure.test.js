import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const activitySource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_activity_v1.js'),
  'utf8',
);
const calendarSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_morning_activation_calendar_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/731-ui-v4-activity.css'),
  'utf8',
);
const shellSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_page_shell.js'),
  'utf8',
);

describe('Activity tab v4 structure', () => {
  it('exports ActivityTabV4 with tiered layout markers', () => {
    expect(activitySource).toContain('function ActivityTabV4');
    expect(activitySource).toContain('activity-v4-hero');
    expect(activitySource).toContain('activity-v4-tier');
    expect(activitySource).toContain('Добавить активность');
    // «Кардио» как имя снято: под ним лежали семь сущностей, и кардио было
    // одной из них. Ярус раскладывается на три строки — контракт строка 6.
    expect(activitySource).toContain('activity-v4-today');
    expect(activitySource).not.toContain('activity-v4-cardio');
  });

  it('does not keep legacy formula-card header block', () => {
    expect(activitySource).not.toContain('formula-card--activity-top');
    expect(activitySource).not.toContain('📏 АКТИВНОСТЬ');
  });

  it('calendar supports v4 heading and hides footer in v4', () => {
    expect(calendarSource).toContain('ma-habit-cal--activity-v4');
    expect(calendarSource).toContain('Зарядка ·');
    expect(calendarSource).toContain('ma-habit-cal-grid--dot');
    expect(calendarSource).toContain('!isActivityV4 && React.createElement(\'div\', { className: \'ma-habit-cal-weekdays\'');
  });

  it('три строки яруса стоят до «Действия» и «Истории»', () => {
    const tierIdx = activitySource.indexOf('activity-v4-today');
    const actionIdx = activitySource.indexOf("'Действие'");
    const historyIdx = activitySource.indexOf("'История'");
    expect(tierIdx).toBeGreaterThan(-1);
    expect(tierIdx).toBeLessThan(actionIdx);
    expect(tierIdx).toBeLessThan(historyIdx);
    for (const name of ['Тренировки', 'Бытовая активность', 'Зарядка']) {
      expect(activitySource).toContain(name);
    }
  });

  it('activity renders only on activity mobile subtab', () => {
    expect(shellSource).toMatch(/mobileSubTab === 'activity'\) && isTabActive && compactActivity/);
    expect(shellSource).not.toMatch(/mobileSubTab === 'stats' \|\| mobileSubTab === 'activity'\) && compactActivity/);
  });

  it('structure css is imported and uses v4 paint roles', () => {
    const mainCss = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    expect(mainCss).toContain('731-ui-v4-activity.css');
    expect(cssSource).toContain('.activity-v4-cta');
    expect(cssSource).toContain('var(--v4-hero');
    expect(cssSource).toContain('var(--v4-ink-2');
    expect(cssSource).toContain('.activity-v4-steps__fill');
    expect(cssSource).toMatch(/\.activity-v4-steps__fill[^}]*background:\s*#7a8a5e/s);
    expect(cssSource).toMatch(/\.activity-v4-steps__label[^}]*var\(--v4-ink-2/s);
    expect(cssSource).toContain('ma-habit-cal-grid--dot');
    expect(cssSource).not.toMatch(/\.activity-v4-hero\s*\{[^}]*border:\s*1px/s);
    expect(cssSource).toMatch(/v4-intentional.*var\(--v4-act\)/s);
  });

  it('steps progress bar uses css fill role, not legacy scale color inline', () => {
    expect(activitySource).toMatch(/activity-v4-steps__fill[\s\S]*width: stepsPercent \+ '%'/);
    expect(activitySource).not.toMatch(/activity-v4-steps__fill[\s\S]*background: stepsColor/);
  });
});
