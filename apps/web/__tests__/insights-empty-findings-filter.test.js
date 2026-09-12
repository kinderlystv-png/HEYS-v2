// Пустые находки детектора на первый экран «Что заметили» не выходят —
// контракт зоны reports-insights, строка «пустые строки на первый экран не
// выходят». Фильтр в pi_ui_dashboard.js узнаёт их по тексту, а тексты пишут
// сами детекторы: 12 сентября при чистке формулировка сменилась на «связь …
// пока не видна», и мимо прежнего списка она прошла на первый экран.
//
// Тест держит две стороны вместе: каждая фраза «ничего не нашли» из правил
// движка обязана попадать в фильтр экрана. Новая формулировка уронит его.
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const DASHBOARD = path.join(WEB, 'insights', 'pi_ui_dashboard.js');
const PATTERN_DIRS = [path.join(WEB, 'insights'), path.join(WEB, 'insights', 'patterns')];

/** Регулярка фильтра, вынутая из самого экрана, — не копия. */
function readScreenFilter() {
  const src = fs.readFileSync(DASHBOARD, 'utf8');
  const m = src.match(/return \/([^/]+)\/i\.test\(text\);/);
  expect(m, 'фильтр пустых находок не найден в pi_ui_dashboard.js').toBeTruthy();
  return new RegExp(m[1], 'i');
}

/** Фразы правил, которые сообщают об отсутствии находки. */
function collectEmptyFindingPhrases() {
  const phrases = new Set();
  const GHOST = /(пока не вид|пока не выявл|пока не наблюда|недостаточно данных|мало данных|не хватает данных|связь .{0,40}не (видна|видно|выявлена))/i;
  for (const dir of PATTERN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (!fs.statSync(file).isFile() || !name.endsWith('.js')) continue;
      if (name.startsWith('pi_ui_')) continue; // слой отрисовки, не правила
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:insight|title|message)\s*[:=]\s*[`'"]([^`'"\n]{15,})[`'"]/g)) {
        const text = m[1];
        if (GHOST.test(text)) phrases.add(text);
      }
    }
  }
  return [...phrases];
}

describe('первый экран «Что заметили» не показывает пустые находки', () => {
  it('фильтр экрана узнаёт каждую фразу «ничего не нашли» из правил движка', () => {
    const filter = readScreenFilter();
    const phrases = collectEmptyFindingPhrases();
    // Охват называется вслух: пустой список означал бы, что тест ничего не
    // проверяет, а не что всё хорошо.
    expect(phrases.length).toBeGreaterThan(5);
    const missed = phrases.filter((p) => !filter.test(p));
    expect(missed, 'эти фразы попадут на первый экран').toEqual([]);
  });

  it('настоящая находка со словом «недостаточно» фильтром не съедается', () => {
    const filter = readScreenFilter();
    expect(filter.test('Недостаточно белка — голод наступает быстрее')).toBe(false);
  });
});
