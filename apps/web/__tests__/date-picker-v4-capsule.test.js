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

    it('CSS — геометрия dcap: капсула 36px, стрелки 34px', () => {
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger[\s\S]{0,200}height:\s*36px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-day-nav[\s\S]{0,120}width:\s*34px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-day-nav[\s\S]{0,160}height:\s*34px/,
        );
    });
});
