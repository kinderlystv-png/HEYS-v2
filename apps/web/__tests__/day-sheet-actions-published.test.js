// day-sheet-actions-published.test.js — действия листов разбора должны
// существовать на HEYS.Day, иначе кнопка только переключает вкладку.
//
// Листы разбора зовут день по имени через goToDayAndRun (heys_widgets_ui_v1.js),
// и промах там глотается тихим catch с комментарием «внешние вызовы не должны
// ломать UI». До 31 августа ни одно из пяти имён день не публиковал: кнопка
// внизу любого из восемнадцати листов год выглядела рабочей и не делала ничего.
//
// heys-v2-e7 нашёл первый случай (openWeightEditor), heys-v2-e5 нашёл остальные
// четыре и привёл имена к настоящим. Здесь закрыта половина, которая живёт в
// файлах дня: два пикера были в скоупе DayTab и просто не выводились наружу.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const read = (name) => fs.readFileSync(path.join(WEB_DIR, name), 'utf8');
const TAB_SRC = read('heys_day_tab_impl_v1.js');
const CORE_SRC = read('heys_day_core_bundle_v1.js');

/** Имена, которые день обязан публиковать: их зовут листы и быстрые действия. */
const PUBLISHED = ['openWeightPicker', 'openSleepQualityPicker'];

describe('День публикует действия, которые зовут снаружи', () => {
  it.each(PUBLISHED)('%s выведен на HEYS.Day', (name) => {
    expect(TAB_SRC).toContain(`HEYS.Day.${name} = ${name};`);
  });

  it.each(PUBLISHED)('%s снимается при размонтировании, а не остаётся висеть', (name) => {
    // Иначе после ухода со вкладки на HEYS.Day остаётся ссылка на функцию
    // размонтированного компонента, и вызов уходит в мёртвое состояние.
    expect(TAB_SRC).toContain(`delete HEYS.Day.${name};`);
  });

  it.each(PUBLISHED)('%s не публикуется, когда его нет в скоупе', (name) => {
    const at = TAB_SRC.indexOf(`HEYS.Day.${name} = ${name};`);
    expect(at).toBeGreaterThan(-1);
    const before = TAB_SRC.slice(Math.max(0, at - 260), at);
    expect(before).toContain(`typeof ${name} !== 'function'`);
  });

  it('прежний приём сохранён: addWater выводится тем же способом', () => {
    // Публикация — не новая механика, а тот же эффект с очисткой.
    expect(CORE_SRC).toContain('HEYS.Day.addWater = addWater;');
    expect(CORE_SRC).toContain('delete HEYS.Day.addWater;');
  });

  it('имена в скоупе те же, что публикуются, — опечатка не пройдёт', () => {
    // openWeightEditor и openSleepEditor — имена, которых в дне не было вовсе;
    // именно они год стояли в switch листов.
    expect(TAB_SRC).not.toContain('openWeightEditor');
    expect(TAB_SRC).not.toContain('openSleepEditor');
    for (const name of PUBLISHED) {
      expect(TAB_SRC).toContain(`            ${name},`);
    }
  });
});
