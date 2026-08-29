import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const CHECKIN_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const OVERLAYS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_app_overlays_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalDEV = window.DEV;
const CLIENT_ID = 'client-1';
const TODAY = '2026-08-29';
const YESTERDAY = '2026-08-28';

function dayKey(date) {
  return `heys_${CLIENT_ID}_dayv2_${date}`;
}

/** День с едой сильно ниже половины нормы — попадает в развилку разбора. */
function lowFoodDay(date) {
  return {
    date,
    meals: [
      {
        items: [
          { id: `item-${date}`, product_id: `p-${date}`, grams: 100, kcal100: 300, protein100: 20, carbs100: 20, fat100: 10 },
        ],
      },
    ],
  };
}

function filledDay(date) {
  return {
    date,
    meals: [
      {
        items: [
          { id: `item-${date}`, product_id: `p-${date}`, grams: 100, kcal100: 2400, protein100: 100, carbs100: 200, fat100: 90 },
        ],
      },
    ],
  };
}

/** Минимальный React: одноразовый рендер с хуками, эффекты запускаются вручную. */
function makeFakeReact() {
  const cells = [];
  const effects = [];
  let cursor = 0;
  return {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
    }),
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], (next) => {
        cells[index] = typeof next === 'function' ? next(cells[index]) : next;
      }];
    },
    useEffect(fn) {
      effects.push(fn);
    },
    __rewind() {
      cursor = 0;
    },
    __runEffects() {
      effects.splice(0).forEach((fn) => {
        const cleanup = fn();
        if (typeof cleanup === 'function') cleanup();
      });
    },
  };
}

function findByText(node, text) {
  if (!node || typeof node !== 'object') return null;
  if ((node.children || []).some((child) => child === text)) return node;
  for (const child of node.children || []) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function loadYesterdayVerify() {
  window.HEYS.MorningCheckinUtils = {
    writeDayV2Scoped: (dateKey, dayData) => {
      localStorage.setItem(dayKey(dateKey), JSON.stringify(dayData));
      return true;
    },
  };
  // eslint-disable-next-line no-eval
  (0, eval)(YESTERDAY_SRC);
  return window.HEYS.YesterdayVerify;
}

describe('Yesterday verify — «Дописать точно» уводит в дневник', () => {
  let registered;

  beforeEach(() => {
    window.localStorage.clear();
    registered = {};
    window.HEYS = {
      currentClientId: CLIENT_ID,
      utils: { getCurrentClientId: () => CLIENT_ID },
      dayUtils: { todayISO: () => TODAY },
      ui: { setSelectedDate: vi.fn(), switchTab: vi.fn() },
      StepModal: {
        registerStep: (id, config) => { registered[id] = config; },
      },
    };
    window.React = makeFakeReact();
    window.DEV = {};
    localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({ firstName: 'Антон', weight: 90 }));
    localStorage.setItem(dayKey('2026-08-27'), JSON.stringify(filledDay('2026-08-27')));
    localStorage.setItem(dayKey(YESTERDAY), JSON.stringify(lowFoodDay(YESTERDAY)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.HEYS = originalHEYS;
    window.React = originalReact;
    window.DEV = originalDEV;
  });

  it('в блокирующем чек-ине кнопка зовёт onExitToDiary, а не мёртвый onClose', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.shouldShow()).toBe(true);

    const config = registered.yesterdayVerify;
    expect(config).toBeTruthy();

    const context = {
      dateKey: TODAY,
      onClose: vi.fn(),
      onNext: vi.fn(),
      onExitToDiary: vi.fn(),
    };
    let data = config.getInitialData(context);
    const onChange = (next) => { data = next; };

    window.React.__rewind();
    config.component({ data, onChange, context });
    window.React.__runEffects();
    window.React.__rewind();
    const tree = config.component({ data, onChange, context });

    const button = findByText(tree, 'Дописать точно');
    expect(button).toBeTruthy();
    button.props.onClick();

    expect(window.HEYS.ui.setSelectedDate).toHaveBeenCalledWith(YESTERDAY);
    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('diary');
    expect(context.onExitToDiary).toHaveBeenCalledWith(YESTERDAY);
    expect(context.onClose).not.toHaveBeenCalled();
  });

  it('без onExitToDiary (обычная модалка) остаётся прежний onClose', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.shouldShow()).toBe(true);

    const config = registered.yesterdayVerify;
    const context = { dateKey: TODAY, onClose: vi.fn(), onNext: vi.fn() };
    let data = config.getInitialData(context);
    const onChange = (next) => { data = next; };

    window.React.__rewind();
    config.component({ data, onChange, context });
    window.React.__runEffects();
    window.React.__rewind();
    const tree = config.component({ data, onChange, context });

    findByText(tree, 'Дописать точно').props.onClick();
    expect(context.onClose).toHaveBeenCalled();
  });

  it('мастер отдаёт выход наружу, а оверлей гасит показ и не уводит на главную', () => {
    // Контракт склейки: MorningCheckin кладёт onExitToDiary в context шага,
    // AppOverlays на exitToDiary закрывает чек-ин и подавляет его повторный
    // подъём, пока человек в дневнике.
    expect(CHECKIN_SRC).toContain('onExitToDiary: (dateKey) => {');
    expect(CHECKIN_SRC).toContain('onComplete({ exitToDiary: true, dateKey })');
    expect(OVERLAYS_SRC).toContain('if (result && result.exitToDiary) {');
    expect(OVERLAYS_SRC).toContain('window.HEYS.ui.suppressMorningCheckin = true;');
    expect(OVERLAYS_SRC).toContain('if (!checkinExitedToDiary || tab === \'diary\') return;');
  });
});
