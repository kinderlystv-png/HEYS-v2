// Раскладка Главной не должна уменьшаться молча, и вкладка не должна писать
// то, чего человек не менял.
//
// 21 августа фильтр «виджеты в разработке» дважды стёр плитки и оба раза
// сохранил результат — уменьшение выглядело как обычная запись, а по updatedAt
// оно ещё и выигрывало у того, что человек собрал на другом устройстве.
// Проверяем оба вывода: уменьшение без названной причины отбивается, а вкладка,
// в которой ничего не изменилось, в storage не ходит вовсе.
//
// Живьём не собрать: нужны две вкладки, скрытие одной из них и облачный ответ
// между ними.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REGISTRY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_registry_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_core_v1.js'), 'utf8');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html'
);

const LAYOUT_KEY = 'heys_widget_layout_v1';
const META_KEY = 'heys_widget_layout_meta_v1';

function tile(type, id, col = 0, row = 0) {
  return { id, type, size: '2x1', position: { col, row }, settings: {} };
}

/** Хранилище в памяти + загруженные реестр и ядро виджетов. */
function boot(savedLayout, meta) {
  const memory = new Map();
  const writes = [];
  if (savedLayout) memory.set(LAYOUT_KEY, savedLayout);
  if (meta) memory.set(META_KEY, meta);

  window.HEYS = {
    Widgets: { emit: () => {}, on: () => {}, off: () => {} },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => {
        if (k === LAYOUT_KEY) writes.push(v);
        memory.set(k, v);
      },
    },
  };
  eval(REGISTRY_SRC);
  eval(CORE_SRC);
  window.HEYS.Widgets.state.init();
  return { state: window.HEYS.Widgets.state, memory, writes };
}

const layoutOf = (memory) => memory.get(LAYOUT_KEY)?.widgets || [];
const typesOf = (memory) => layoutOf(memory).map((w) => w.type);

describe('раскладка · защита от молчаливой потери', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  it('уменьшение состава без названной причины не сохраняется', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0), tile('sleep', 'w3', 0, 1)],
      updatedAt: 1000,
    };
    const { state, memory } = boot(saved, { retiredMigration: '' });

    // Кто-то «почистил» раскладку и попросил сохранить, не назвавшись.
    state._widgets = state._widgets.slice(0, 1);
    state.saveLayout();

    expect(typesOf(memory)).toHaveLength(3);
    expect(console.warn).toHaveBeenCalled();
  });

  it('снятие плитки человеком проходит и сохраняется', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0), tile('sleep', 'w3', 0, 1)],
      updatedAt: 1000,
    };
    const { state, memory } = boot(saved, { retiredMigration: '' });

    const victim = state.getWidgets().find((w) => w.type === 'water');
    state.removeWidget(victim.id);
    state.saveLayout(null, { reason: 'user-remove' });

    expect(typesOf(memory)).not.toContain('water');
    expect(typesOf(memory)).toHaveLength(2);
  });

  it('вкладка, в которой ничего не менялось, в storage не пишет', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0)],
      updatedAt: 1000,
    };
    const { state, memory, writes } = boot(saved, { retiredMigration: '' });
    const before = writes.length;
    const stamp = memory.get(LAYOUT_KEY).updatedAt;

    // Ровно то, что делает visibilitychange/beforeunload.
    state.saveLayout();

    expect(writes.length).toBe(before);
    expect(memory.get(LAYOUT_KEY).updatedAt).toBe(stamp);
  });

  it('принятую из облака раскладку вкладка не отправляет обратно', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0)],
      updatedAt: 1000,
    };
    const { state, memory, writes } = boot(saved, { retiredMigration: '' });

    // Пришла более свежая раскладка с другого устройства.
    state._widgets = [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0)]
      .map((w) => state._normalizeWidget(w));
    state._rememberSavedFingerprint();
    const before = writes.length;
    const stamp = memory.get(LAYOUT_KEY).updatedAt;

    state.saveLayout();

    expect(writes.length).toBe(before);
    expect(memory.get(LAYOUT_KEY).updatedAt).toBe(stamp);
  });

  it('kill-switch снимает guard', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0)],
      updatedAt: 1000,
    };
    const { state, memory } = boot(saved, { retiredMigration: '' });
    localStorage.setItem('__heys_disable_widget_shrink_guard__', '1');

    state._widgets = state._widgets.slice(0, 1);
    state.saveLayout();

    expect(typesOf(memory)).toHaveLength(1);
    localStorage.removeItem('__heys_disable_widget_shrink_guard__');
  });
});

describe('дефолтный набор · контракт home-widgets', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  // Состав из строки контракта «состав дефолта». 23 августа: «Вес» — 2×1
  // «Число и неделя» (number_week), не 2×2 «График».
  const EXPECTED = [
    ['calories', '2x2', 'hero'],
    ['insulinWave', '2x2', 'day_as_is'],
    ['macros', '3x2', 'rings'],
    ['sleep', '1x1', 'mini'],
    ['water', '1x1', 'mini'],
    ['steps', '2x1', 'week'],
    ['heatmap', '2x1', 'week_bar'],
    ['relapseRisk', '2x2', 'scale'],
    ['protein', '1x1', 'now'],
    ['fiber', '1x1', 'now'],
    ['healthTrend', '2x1', 'compact'],
    ['weight', '2x1', 'number_week'],
    ['crashRisk', '2x1', 'curve'],
  ];

  it('чистый старт даёт тринадцать плиток в порядке контракта', () => {
    const { state } = boot(null, null);
    const got = state.getWidgets().map((w) => [w.type, w.size, w.settings?.displayVariant]);
    expect(got).toEqual(EXPECTED);
  });

  it('каждый вид дефолта существует в каталоге видов и совпадает по размеру', () => {
    const VARIANTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_variants_v4.js'), 'utf8');
    window.HEYS = { Widgets: { emit: () => {}, on: () => {}, off: () => {} } };
    eval(VARIANTS_SRC);
    const V4 = window.HEYS.Widgets.VariantsV4;

    const mismatched = EXPECTED.filter(([type, size, variantId]) => {
      const v = V4.getCatalog(type).find((x) => x.id === variantId);
      return !v || v.size !== size;
    });
    expect(mismatched).toEqual([]);
  });

  it('в дефолт входят «Шаги», но не снятые типы и не «Оценка дня»', () => {
    const { state } = boot(null, null);
    const types = state.getWidgets().map((w) => w.type);
    expect(types).toContain('steps');
    expect(types).not.toContain('dayScore');
    expect(types).not.toContain('insulin');
    expect(types).not.toContain('streak');
    expect(types).not.toContain('cascade');
  });

  it('строка контракта «состав дефолта» всё ещё называет тринадцать плиток', () => {
    // Если дизайнер поменяет состав, тест выше начнёт врать молча — привязываем
    // его к самому канвасу, как гейт геометрии.
    const canvas = fs.readFileSync(CANVAS, 'utf8');
    const line = canvas.match(/<b>состав дефолта<\/b><span data-v="([^"]+)"/);
    expect(line).not.toBeNull();
    expect(line[1]).toMatch(/тринадцать плиток/);
    expect(line[1]).toMatch(/Тренд здоровья — 2×1, вид «Компакт»/);
    // Отступление 29 августа, названо поимённо. Владелец переставил позиции
    // 9–13 (Белок · Клетчатка · Тренд здоровья · Вес · Динамика веса), чтобы
    // последний ряд закрывали две 2×1: 1×1 в нижнем углу запрещён строкой
    // «1×1 в нижнем углу не ставится». Код уже на новом порядке, пакет канваса
    // с этой правкой ещё не собран — поэтому нумерация ниже прежняя. Когда
    // пакет приедет, эти три строки покраснеют: это и есть сигнал снять
    // отступление и переписать их на 9. Белок · 10. Клетчатка · 13. Динамика.
    expect(line[1]).toMatch(/11\.\s*Динамика веса/);
    expect(line[1]).toMatch(/12\.\s*Белок — 1×1, вид «Как сейчас»/);
    expect(line[1]).toMatch(/13\.\s*Клетчатка — 1×1, вид «Как сейчас»/);
    // Обе формулировки закрыты владельцем 22 августа. Уедут назад — состав в
    // EXPECTED разойдётся с контрактом молча.
    expect(line[1]).toMatch(/Тепловая карта — 2×1, вид «Как сейчас»/);
    expect(line[1]).toMatch(/Динамика веса — 2×1, вид «За месяц» кривой/);
  });
});

describe('сброс к рекомендуемому экрану', () => {
  // Блок «Рекомендуемый экран» должен быть виден всю расстановку. 22 августа
  // он был привязан к раскрытому каталогу — и человек кнопку просто не нашёл:
  // её ищут как раз тогда, когда добавлять ничего не собираются.
  it('блок сброса не спрятан за раскрытым каталогом', () => {
    const ui = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_ui_v1.js'), 'utf8');
    const at = ui.indexOf('React.createElement(RecommendedScreenBlock');
    expect(at).toBeGreaterThan(-1);
    const lineStart = ui.lastIndexOf(String.fromCharCode(10), at);
    const line = ui.slice(lineStart, at);
    expect(line).toContain('isEditMode');
    expect(line).not.toContain('catalogOpen');
  });

  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  it('сброс возвращает состав дефолта целиком, даже когда плиток было больше', () => {
    const many = Array.from({ length: 14 }, (_, i) => tile('calories', `w${i}`, 0, i));
    const { state, memory } = boot({ widgets: many, updatedAt: 1000 }, { retiredMigration: '' });

    state.resetLayout();

    expect(layoutOf(memory)).toHaveLength(13);
    expect(typesOf(memory)[0]).toBe('calories');
  });

  it('сброс в расстановке не пишется до «Готово»', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0)],
      updatedAt: 1000,
    };
    const { state, memory, writes } = boot(saved, { retiredMigration: '' });
    state._editMode = true;
    const before = writes.length;

    state.resetLayout();

    expect(state.getWidgets()).toHaveLength(13);
    expect(writes.length).toBe(before);
    expect(typesOf(memory)).toEqual(['calories', 'water']);

    // «Готово» фиксирует то, что человек собрал.
    state._editMode = false;
    state.saveLayout(null, { reason: 'edit-done' });
    expect(layoutOf(memory)).toHaveLength(13);
  });

  it('один шаг назад после сброса возвращает прежний состав', () => {
    const saved = {
      widgets: [tile('calories', 'w1', 0, 0), tile('water', 'w2', 2, 0), tile('sleep', 'w3', 0, 1)],
      updatedAt: 1000,
    };
    const { state, memory } = boot(saved, { retiredMigration: '' });

    state.resetLayout();
    expect(state.getWidgets()).toHaveLength(13);

    state.undo();
    state.saveLayout(null, { reason: 'undo' });

    expect(typesOf(memory)).toEqual(['calories', 'water', 'sleep']);
  });
});
