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

    // date-remainders «вид чипа „Сегодня“» (56-я сборка, 13 сентября): кнопка
    // возврата — чип с подложкой --bg, радиусом 999 и полями 0 10, а не голая
    // надпись. Прежняя редакция строки требовала заливки transparent — она
    // отменена: без подложки единственное нажимаемое место капсулы отличалось
    // от подписи только цветом.
    it('CSS — кегли по контракту (12.5 / 11 / 10)', () => {
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-lbl-inner \.date-picker-main[\s\S]{0,120}font-size:\s*12\.5px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-inline-today \{[\s\S]{0,320}font-size:\s*11px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-inline-today \{[\s\S]{0,400}background:\s*var\(--v4-bg\)/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-inline-today \{[\s\S]{0,400}padding:\s*0 10px/,
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
    // Ночь стала 44 пакетом 42 (6 сентября): числа 36 не называла ни одна
    // строка контракта, кадр «Капсула · ночь» ·04 всегда рисовал 44, а решение
    // «44 pt у каждой цели зоны» закрыло вопрос. Тест снова сторожил литерал —
    // теперь сторожит правило: своя min-height, фиксированной height нет.
    // Радиус стал 999 решением владельца 13 сентября: капсула — пилюля в любом
    // дне. Кадры рисовали у одного элемента три формы (сегодня 14, чужой день
    // 999, прокрученный экран 999), и ряд с круглыми стрелками разваливался.
    // Проверка держала прежние 14 и при этом ЗЕЛЕНЕЛА: `[\s\S]*?` перескакивал
    // закрывающую скобку правила и находил 14px в следующем. Оба числа теперь
    // читаются из одного правила — `[^}]*` за скобку не выходит.
    it('CSS — геометрия капсулы: сегодня 44/999, ночь 44/999, стрелки 44', () => {
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger \{[^}]*min-height:\s*44px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger \{[^}]*border-radius:\s*999px/,
        );
        expect(baseCss).toMatch(
            /\.date-picker--v4 \.date-picker-trigger--night \{[\s\S]{0,200}min-height:\s*44px/,
        );
        expect(baseCss).not.toMatch(
            /\.date-picker--v4 \.date-picker-trigger--night \{[^}]*[\s;]height:\s*\d/,
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
