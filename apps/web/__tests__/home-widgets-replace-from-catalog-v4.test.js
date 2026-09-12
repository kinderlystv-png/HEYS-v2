/**
 * Главная: бросок плитки из каталога на занятое место.
 *
 * Кадры «Замена · до броска» и «Замена · после броска» (home-widgets.v4.dc.html)
 * рисуют схему правила, а не экран: контракт у обоих — только «высота 236px,
 * поля 16px». Само правило записано строкой «замена перетаскиванием»: «в
 * расстановке плитку из каталога можно бросить на занятое место: стоявший там
 * виджет уходит в каталог, счётчик не меняется. Одно движение вместо „сначала
 * освободи, потом добавь“».
 *
 * Смоуком, а не глазами: собрать это руками — войти в расстановку, взять
 * плитку из каталога, донести до занятого места и отпустить; а проверять надо
 * не картинку, а что ушло, что встало и на каком месте. Гейта у правила не
 * было вовсе.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 },
};

// Типы кадров «Замена»: калории, риск, вес, динамика веса и клетчатка, которую
// приносят из каталога на место динамики.
const TYPES = {
  calories: { type: 'calories', name: 'Калории', defaultSize: '2x2' },
  relapseRisk: { type: 'relapseRisk', name: 'Риск-радар', defaultSize: '2x1' },
  weight: { type: 'weight', name: 'Вес', defaultSize: '2x1' },
  crashRisk: { type: 'crashRisk', name: 'Динамика веса', defaultSize: '2x1' },
  fiber: { type: 'fiber', name: 'Клетчатка', defaultSize: '1x1' },
  heatmap: { type: 'heatmap', name: 'Тепловая карта', defaultSize: '2x2' },
  soon: { type: 'soon', name: 'Скоро', defaultSize: '1x1', comingSoon: { about: 'скоро' } },
};

let state;
let events;

function loadCore() {
  global.window = global;
  global.HEYS = {};
  const src = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);

  let seq = 0;
  global.HEYS.Widgets.registry = {
    getSize: (id) => SIZES[id] || null,
    getType: (key) => TYPES[key] || null,
    normalizeSizeId: (id) => id,
    createWidget: (key) => {
      const def = TYPES[key];
      if (!def) return null;
      seq += 1;
      return { id: `${key}_${seq}`, type: key, size: def.defaultSize, settings: {} };
    },
  };
  events = [];
  global.HEYS.Widgets.emit = (name, payload) => events.push({ name, payload });
  global.HEYS.Widgets.state._debouncedSave = () => {};
  return global.HEYS.Widgets.state;
}

/** Раскладка кадра «Замена · до броска» — тем же ядром, что и продукт. */
function seed(spec) {
  spec.forEach(([type, size], index) => {
    const placed = state.addWidget({ id: `${type}_seed${index}`, type, size, settings: {} }, true);
    if (!placed) throw new Error(`Раскладка кадра не собралась: ${type} ${size}`);
  });
  // События сборки раскладки — не события броска: дальше смотрим только то,
  // что продукт сказал про саму замену.
  events.length = 0;
}

const typesOnScreen = () => state.getWidgets().map((w) => w.type);

describe('Главная: бросок из каталога на занятое место', () => {
  beforeEach(() => {
    state = loadCore();
  });

  it('кадр «после броска»: новая плитка встаёт на место старой, старая уходит с экрана', () => {
    seed([['calories', '2x2'], ['relapseRisk', '2x1'], ['weight', '2x1'], ['crashRisk', '2x1']]);
    const target = state.getWidgets().find((w) => w.type === 'crashRisk');

    const placed = state.replaceWidgetFromCatalog(target.id, 'fiber');

    expect(placed, 'замена не выполнилась').toBeTruthy();
    expect(placed.type).toBe('fiber');
    // Клетчатка встала ровно на место «Динамики веса» — четвёртой по порядку
    // чтения, а не в конец списка.
    expect(typesOnScreen()).toEqual(['calories', 'relapseRisk', 'weight', 'fiber']);
    // Снятая плитка уходит с экрана — значит, возвращается в каталог: каталог
    // показывает то, чего на экране нет.
    expect(typesOnScreen()).not.toContain('crashRisk');
  });

  it('о замене сообщается одним событием вместе со снятой плиткой', () => {
    seed([['calories', '2x2'], ['crashRisk', '2x1']]);
    const target = state.getWidgets().find((w) => w.type === 'crashRisk');

    state.replaceWidgetFromCatalog(target.id, 'fiber');

    const replaced = events.filter((e) => e.name === 'widget:replaced');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].payload.removed.type).toBe('crashRisk');
    expect(replaced[0].payload.widget.type).toBe('fiber');
    expect(replaced[0].payload.index).toBe(1);
    // Пары «сняли» + «добавили» быть не должно: строка контракта — «одно
    // движение вместо „сначала освободи, потом добавь“».
    expect(events.some((e) => e.name === 'widget:removed')).toBe(false);
    expect(events.some((e) => e.name === 'widget:added')).toBe(false);
  });

  it('бросок можно отменить: прежняя раскладка возвращается целиком', () => {
    seed([['calories', '2x2'], ['weight', '2x1'], ['crashRisk', '2x1']]);
    const target = state.getWidgets().find((w) => w.type === 'crashRisk');

    state.replaceWidgetFromCatalog(target.id, 'fiber');
    expect(typesOnScreen()).toEqual(['calories', 'weight', 'fiber']);

    state.undo();
    expect(typesOnScreen()).toEqual(['calories', 'weight', 'crashRisk']);
  });

  it('замена крупнее места отбивается, экран остаётся прежним', () => {
    // Бюджет экрана 32 клетки. Занято 31: шесть плиток 2×2 (24), одна 3×2 (6)
    // и «Клетчатка» 1×1. Замена этой единицы на «Тепловую карту» 2×2 просит
    // 34 — строка «добавление при полном экране»: плитка не добавляется.
    seed([
      ['calories', '2x2'], ['relapseRisk', '2x2'], ['weight', '2x2'],
      ['crashRisk', '2x2'], ['heatmap', '2x2'], ['calories', '2x2'],
      ['weight', '3x2'], ['fiber', '1x1'],
    ]);
    const before = typesOnScreen();
    const small = state.getWidgets().find((w) => w.type === 'fiber');

    const placed = state.replaceWidgetFromCatalog(small.id, 'heatmap');

    expect(placed, 'замена не должна была пройти по месту').toBeNull();
    expect(typesOnScreen()).toEqual(before);
    const blocked = events.filter((e) => e.name === 'widget:add-blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].payload.reason).toBe('budget');
    expect(blocked[0].payload.replace).toBe(true);
  });

  it('строка ожидания «скоро» на занятое место не бросается', () => {
    // Строка контракта «готовится»: у строки «скоро» нажатие ничего не делает.
    seed([['calories', '2x2'], ['crashRisk', '2x1']]);
    const target = state.getWidgets().find((w) => w.type === 'crashRisk');

    expect(state.replaceWidgetFromCatalog(target.id, 'soon')).toBeNull();
    expect(typesOnScreen()).toEqual(['calories', 'crashRisk']);
  });
});
