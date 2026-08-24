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
    // 2026-08-24: контракт «вид клетки» — «выбранный день — заливка --c2»,
    // без исключения для сегодняшнего. Прежний :not(.today) существовал, пока
    // сегодня было залито акцентом и перекрывало выбор.
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.selected {');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.has-cycle::before');
    expect(sheetCss).toContain('.date-picker-sheet .date-picker-day.has-refeed::after');
    expect(sheetCss).toContain('.date-picker-sheet .legend-swatch--dot');
    expect(sheetCss).not.toContain('.date-picker-sheet .day-status');
  });

  // 2026-08-24, контракт date-remainders, «вид шторки календаря»: «лист прижат
  // к низу: фон --bg, радиус 26 сверху, поля 18/16/16 px, ручка 38×4 px тоном
  // чернил 14 %». Тест охранял предыдущее решение — popover под строкой даты с
  // якорем --date-picker-sheet-top и без ручки. Решение отменено контрактом,
  // поэтому проверки переписаны на нижний лист.
  it('sheet opens as v4 bottom sheet with handle', () => {
    expect(sheetBlock).toContain('date-picker-sheet__card');
    expect(pickersSource).toContain('date-picker-backdrop--v4-modal');
    expect(pickersSource).not.toContain('--date-picker-sheet-top');
    expect(sheetBlock).toContain('date-picker-sheet-handle');
    expect(sheetCss).toMatch(/\.date-picker-sheet__card\s*\{[^}]*border-radius:\s*26px 26px 0 0/);
    expect(sheetCss).toMatch(/\.date-picker-sheet__card\s*\{[^}]*padding:\s*18px 16px calc\(16px/);
    expect(sheetCss).toMatch(/\.date-picker-sheet-handle\s*\{[^}]*width:\s*38px/);
  });

  // Инвариант этого теста — «лист не наследует legacy datePickerSlide», иначе
  // он на кадр вспыхивает у левого края. Он и остался. Позиционирование же
  // переехало с popover'а на нижний лист (контракт «вид шторки календаря»),
  // поэтому left/width/--date-picker-sheet-top заменены на bottom: 0.
  // Подложка перестала быть прозрачной по тому же контракту («под ним
  // затемнение»); тон и блюр берутся из общих токенов scrim'а — отступление от
  // «34 % без блюра» названо в комментарии у самого правила.
  it('sheet не наследует legacy datePickerSlide (anti left-flash)', () => {
    const sheetRule = sheetCss.match(
      /\.date-picker-dropdown\.date-picker-sheet\s*\{[^}]+\}/,
    )?.[0] || '';
    expect(sheetRule).toContain('animation: datePickerSheetModalIn');
    expect(sheetRule).toContain('bottom: 0');
    expect(sheetRule).toContain('left: 0');
    expect(sheetRule).not.toContain('--date-picker-sheet-top');
    expect(sheetRule).not.toContain('datePickerSlide');
    expect(sheetCss).toMatch(/\.date-picker-backdrop\.date-picker-backdrop--v4-modal[\s\S]*?background:\s*var\(--v4-modal-backdrop-dim/);
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
