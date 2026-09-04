// Копия кадров water-add против продуктовых строк.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  WEB,
  '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/water-add.v4.dc.html',
);

const SOURCES = [
  'heys_widgets_ui_v1.js',
  'heys_day_water_v1.js',
  'heys_day_day_handlers.js',
  'heys_day_page_shell.js',
  'heys_water_custom_volume_v1.js',
  'styles/modules/400-water-and-hydration.css',
  'styles/modules/730-widgets-dashboard.css',
].map((rel) => fs.readFileSync(path.join(WEB, rel), 'utf8')).join('\n');

function readFrameCopy(source) {
  const frames = new Map();
  const re = /<div class="spec"[^>]*><b>([^<]+) · текст<\/b><span data-v="([^"]*)"/g;
  let m;
  while ((m = re.exec(source))) frames.set(m[1], m[2].split(' › '));
  return frames;
}

function readProtocolFrames(source) {
  const labels = new Set();
  const re = /data-demo="protocol"[^>]*data-screen-label="([^"]+)"/g;
  let m;
  while ((m = re.exec(source))) labels.add(m[1]);
  return labels;
}

const isWord = (t) => /[А-Яа-яЁё]{3,}/.test(t) && !/^\d/.test(t);

const NOT_OURS = new Set([
  'Питание',
  'Актив',
  'Отчёт за день',
  'Полоса',
  'Кольцо',
  'Калории',
  '642',
  'ккал',
  'Инсулиновая волна',
  'Белки · Жиры · Углеводы',
  'Сон',
  '8,0',
  'Оценка дня',
]);

const BUILT = new Set([
  'Вода · 7 дней в среднем 2,1 л',
  'из 3,0 · осталось 1,3',
  'Добавить 750 мл',
  'осталось 1,3',
  'осталось 3,0',
  'в среднем 2,1 л',
]);

const PROTOCOL_TEXT = new Set([
  'Вода · вариант А · рябь от плитки',
  'Вода · вариант Б · капля долетает',
  'Вода · вариант В · волна в плитке',
  'Вода · вариант Г · только счётчик',
  'Вода · В1 база',
  'Вода · В2 плеск',
  'Вода · В4 метка нормы',
  'Вода · В5 мерный столбик',
  'Вода · погружение · 0 мс',
  'Вода · погружение · подход',
  'Вода · погружение · касание',
  'Вода · погружение · переезд',
  'Вода · погружение · покой',
  'Вода · погружение · петля',
  'Вода · погружение · уменьшенное движение',
  'Вода · карточка · Полоса',
  'Вода · карточка · Полоса · утро',
  'Вода · норма А · петля',
  'Вода · норма Б · петля (протокол, канон — Вода · норма · петля)',
]);

const IMPLEMENTED = [
  'Вода · карточка · Кольцо',
  'Вода · свой объём · лист',
  'Чипы объёма · обычный вид',
  'Чипы объёма · нечего убавлять',
  'Чипы объёма · нажатие',
  'Вода · столбик · Питание',
  'Вода · столбик · Актив',
  'Вода · столбик · Главная прокручена',
  'Вода · норма · 0,4 л',
  'Вода · норма · 0,8 л',
  'Вода · норма · 1,0 л',
  'Вода · норма · 2,1 л',
  'Вода · норма · 2,7 л',
  'Вода · норма · петля',
  'Вода · В3 · уменьшенное движение',
  'Вода · В3 капля и круг',
  'Вода · В3 · финал',
];

describe('water-add · текст кадров', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const copy = readFrameCopy(canvas);
  const protocol = readProtocolFrames(canvas);

  it('протокольные кадры не требуют копии в продукте', () => {
    for (const label of PROTOCOL_TEXT) {
      expect(protocol.has(label) || copy.has(label)).toBe(true);
    }
  });

  it('слова реализованных кадров есть в коде', () => {
    const missing = [];
    for (const frame of IMPLEMENTED) {
      const words = (copy.get(frame) || []).filter((w) => isWord(w) && !NOT_OURS.has(w) && !BUILT.has(w));
      for (const word of words) {
        if (!SOURCES.includes(word)) missing.push(`${frame}: ${word}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('обязательные подписи воды', () => {
    expect(SOURCES).toContain('Вода');
    expect(SOURCES).toContain('Свой объём');
    expect(SOURCES).toContain('шаг 50 мл');
    expect(SOURCES).toContain('Добавить');
    expect(SOURCES).toMatch(/\+200|200 мл/);
    expect(SOURCES).toContain('мл');
  });
});
