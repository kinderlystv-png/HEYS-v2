import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const pickersSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_pickers.js'),
  'utf8',
);
const sheetCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css'),
  'utf8',
);

const sheetFnStart = pickersSource.indexOf("className: 'date-picker-dropdown date-picker-sheet'");
const calendarFnStart = pickersSource.indexOf('function Calendar(');
const sheetBlock = pickersSource.slice(sheetFnStart, calendarFnStart);

describe('Date picker sheet v4 · вариант А', () => {
  it('sheet legend is nav/fact, not ratio quality', () => {
    expect(sheetBlock).toContain('есть записи');
    expect(sheetBlock).toContain('legend-swatch--dot');
    expect(sheetBlock).toContain('legend-swatch--cycle');
    expect(sheetBlock).toContain('legend-swatch--refeed');
    expect(sheetBlock).toContain('legend-swatch--today');
    expect(sheetBlock).toContain('legend-swatch--selected');
    expect(sheetBlock).not.toContain("legend-item good");
    expect(sheetBlock).not.toContain('● норма');
    expect(sheetBlock).not.toContain('● мало');
    expect(sheetBlock).not.toContain('● переел');
  });

  it('sheet cells drop ratio fill and status/cycle emoji', () => {
    expect(sheetBlock).toContain('day-data-dot');
    expect(sheetBlock).toContain("hasCycle ? 'has-cycle'");
    expect(sheetBlock).toContain("hasRefeed ? 'has-refeed'");
    expect(sheetBlock).not.toContain('getDayBgColor');
    expect(sheetBlock).not.toContain('getGradientColor');
    expect(sheetBlock).not.toContain('day-status');
    expect(sheetBlock).not.toContain('day-cycle-dot');
    expect(sheetBlock).not.toContain('day-refeed-dot');
    expect(sheetBlock).not.toContain('🌸');
    expect(sheetBlock).not.toContain('🍕');
  });

  it('sheet CSS paints today/selected and edge strips', () => {
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.today');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.selected:not(.today)');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.has-cycle::before');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.has-refeed::after');
    expect(sheetCss).toContain('.date-picker-sheet .legend-swatch--dot');
    expect(sheetCss).not.toContain('.date-picker-sheet .day-status');
  });

  it('sheet opens as v4 modal card under date row', () => {
    expect(sheetBlock).toContain('date-picker-sheet__card');
    expect(pickersSource).toContain('date-picker-backdrop--v4-modal');
    expect(pickersSource).toContain('--date-picker-sheet-top');
    expect(sheetBlock).not.toContain('date-picker-sheet-handle');
  });

  it('sheet не наследует legacy datePickerSlide (anti left-flash)', () => {
    const sheetRule = sheetCss.match(
      /\.date-picker-dropdown\.date-picker-sheet\s*\{[^}]+\}/,
    )?.[0] || '';
    expect(sheetRule).toContain('animation: datePickerSheetModalIn');
    expect(sheetRule).toContain('left: 50%');
    expect(sheetRule).toContain('width: min(360px');
    expect(sheetRule).toContain('--date-picker-sheet-top');
    expect(sheetRule).not.toContain('bottom: 0');
    expect(sheetRule).not.toContain('datePickerSlide');
    expect(sheetCss).toMatch(/\.date-picker-backdrop\.date-picker-backdrop--v4-modal[\s\S]*?background:\s*transparent/);
  });

  it('sheet month nav uses v4 sand arrows, not legacy date-picker-nav', () => {
    expect(sheetBlock).toContain('date-picker-sheet-month-nav');
    expect(sheetBlock).toContain("navChevron('left')");
    expect(sheetBlock).not.toMatch(/className:\s*'date-picker-nav'/);
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-sheet-month-nav');
    expect(sheetCss).toMatch(/\.date-picker-sheet \.date-picker-sheet-month-nav[\s\S]*?background:\s*#f7efe2/);
  });

  it('sheet streak banner uses v4 sand chip copy', () => {
    expect(sheetBlock).toContain('date-picker-streak--v4');
    expect(sheetBlock).toContain('formatStreakDayLabel(streakInfo.count)');
    expect(sheetBlock).toContain('Серия ·');
    expect(sheetBlock).not.toContain('дней подряд в норме');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-streak--v4');
    expect(sheetCss).toMatch(/\.date-picker-sheet \.date-picker-streak--v4[\s\S]*?background:\s*#f3e0d2/);
  });
});
