import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

describe('DatePicker v4 капсула', () => {
    const pickersSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_pickers.js'), 'utf8');
    const baseCss = fs.readFileSync(
        path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
        'utf8',
    );

    it('иконка календаря и inline «Сегодня» на прошлом дне', () => {
        expect(pickersSrc).toContain('date-picker-icon');
        expect(pickersSrc).toContain('date-picker-inline-today');
        expect(pickersSrc).toContain('date-picker-lbl-inner');
        expect(pickersSrc).toMatch(/!isTodaySelected && React\.createElement\('button',[\s\S]{0,120}date-picker-inline-today/);
    });

    it('CSS — кнопка «Сегодня» в капсуле', () => {
        expect(baseCss).toContain('.date-picker--v4 .date-picker-inline-today');
        expect(baseCss).toContain('.date-picker--v4 .date-picker-trigger-lbl');
    });

    // 2026-08-24: контракт date-remainders, «вид чужого дня» — «Сегодня»
    // 11 px/700 тоном --ac. 10,5 px пришли из старого кадра dcap, где кнопка
    // была залитой пилюлей; контракт старше кадра, поэтому кегль поднят.
    it('CSS — кегли по контракту (12.5 / 11 / 10)', () => {
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-lbl-inner \.date-picker-main[\s\S]{0,120}font-size:\s*12\.5px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-inline-today \{[\s\S]{0,260}font-size:\s*11px/,
        );
        expect(baseCss).not.toMatch(
            /\.date-picker--v4 \.date-picker-inline-today \{[\s\S]{0,260}font-size:\s*10\.5px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-sub--relative[\s\S]{0,120}font-size:\s*10px/,
        );
    });

    it('CSS — weekend abbr in today capsule', () => {
        expect(baseCss).toContain('.date-picker--v4 .date-picker-weekend-abbr');
    });

    // Стрелки стали 44×44 ответом дизайнера 1 сентября: «кружок и цель нажатия
    // совпадают. „34 × 44" — это вертикальная пилюля, а не кружок, а прозрачный
    // припуск делает цель невидимой глазу и непроверяемой замером». Тест до
    // этого сторожил литерал 34 и потому упал на починке — ровно тот случай,
    // о котором правило «тест, записанный литералом, охраняет литерал».
    it('CSS — геометрия капсулы: сегодня 44/14, ночь 36/999, стрелки 44', () => {
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger \{[\s\S]*?min-height:\s*44px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger \{[\s\S]*?border-radius:\s*14px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger--night[\s\S]{0,200}height:\s*36px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-day-nav[\s\S]{0,120}width:\s*44px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-day-nav[\s\S]{0,160}height:\s*44px/,
        );
    });

    it('иконки капсулы — размеры и path по кадру ночи', () => {
        expect(pickersSrc).toContain("className: 'date-picker-day-nav-icon'");
        expect(pickersSrc).toContain("className: 'date-picker-icon'");
        expect(pickersSrc).toContain("viewBox: '0 0 24 24'");
        expect(pickersSrc).toContain('width: 14');
        expect(pickersSrc).toContain('height: 14');
        expect(pickersSrc).toContain('width: 12');
        expect(pickersSrc).toContain('height: 12');
        expect(pickersSrc).toContain("d: direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'");
        expect(pickersSrc).toContain("React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 4 })");
        expect(pickersSrc).toContain("React.createElement('path', { d: 'M8 3v4M16 3v4M3 11h18' }");
    });
});
