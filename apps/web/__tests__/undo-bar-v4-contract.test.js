// Смоук-симуляция общего бара отмены против канваса undo-bar.v4.dc.html —
// главного источника правды по отмене во всём продукте.
//
// Живые условия человек собрать не может: попасть в 4999-ю миллисекунду,
// удалить три продукта подряд внутри одного окна и проверить, что «Отменить»
// вернуло все три в обратном порядке, — это работа фейковых таймеров.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UNDO_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_undo_v1.js'), 'utf8');
const UNDO_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/heys-components.css'), 'utf8');

// Строка «длительность»: 5 с на все места вызова, невидимого запаса нет.
const UNDO_WINDOW_MS = 5000;
// Запас, заведомо переживающий анимацию ухода (160 мс по строке «истёк без нажатия»).
const HIDE_MS = 600;
// Кольцо 30 px, r 12.5 — числа кадра.
const RING_CIRCUMFERENCE = 2 * Math.PI * 12.5;
// Строка «положение»: врезка по бокам и зазор снизу — одна величина.
const GAP = 12;
const TABS_HEIGHT = 64;

function loadUndo() {
  eval(UNDO_SRC);
  return window.HEYS.Undo;
}

const bar = () => document.querySelector('.heys-undo-bar');
const bars = () => document.querySelectorAll('.heys-undo-bar');
const undoBtn = () => document.querySelector('.heys-undo-bar__btn');
const labelText = () => document.querySelector('.heys-undo-bar__label')?.textContent?.trim();
const countText = () => document.querySelector('.heys-undo-bar__count')?.textContent?.trim();

function tryUndo() {
  const btn = undoBtn();
  if (!btn) return false;
  btn.click();
  return true;
}

/** Доля залитой дуги кольца: dasharray = «залито всего». NaN, если не прочиталось. */
function ringRatio() {
  const arc = document.querySelector('.heys-undo-bar__arc');
  if (!arc) return NaN;
  const raw = arc.getAttribute('stroke-dasharray');
  if (!raw) return NaN;
  const filled = parseFloat(raw.split(/\s+/)[0]);
  if (!Number.isFinite(filled)) return NaN;
  return filled / RING_CIRCUMFERENCE;
}

function bottomPx() {
  const el = bar();
  if (!el) return NaN;
  const match = /(-?[\d.]+)px/.exec(el.style.bottom || '');
  return match ? parseFloat(match[1]) : NaN;
}

/** Кладёт настоящий CSS модуля в документ — getComputedStyle отвечает то же,
 * что ответил бы браузер (для свойств, которые happy-dom умеет считать;
 * calc(env(...)) он не резолвит, поэтому safe-area всё ещё сверяется текстом
 * ниже). */
function mountCss() {
  const style = document.createElement('style');
  style.textContent = UNDO_CSS;
  document.head.appendChild(style);
  return style;
}

function mountTabs(height = TABS_HEIGHT) {
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.getBoundingClientRect = () => ({
    x: 0,
    y: 812 - height,
    width: 375,
    height,
    top: 812 - height,
    right: 375,
    bottom: 812,
    left: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(tabs);
  return tabs;
}

/** Прокручивает время так, чтобы отработали и таймеры, и кадры анимации. */
function advance(ms) {
  vi.advanceTimersByTime(ms);
}

/** Свернули/развернули приложение: движок сам это состояние не меняет. */
function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
}

describe('бар отмены · контракт undo-bar.v4.dc.html', () => {
  let Undo;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
    document.body.innerHTML = '';
    delete window.HEYS;
    Undo = loadUndo();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    setVisibility('visible');
  });

  // ── Форма ──

  it('порядок слева направо: кольцо, текст, пилюля «Отменить»', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    const content = document.querySelector('.heys-undo-bar__content');
    const kids = [...content.children].map((n) => n.className);
    expect(kids).toEqual([
      'heys-undo-bar__ring',
      'heys-undo-bar__label',
      'heys-undo-bar__btn',
    ]);
  });

  it('единственное действие называется «Отменить»', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    const buttons = bar().querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent.trim()).toBe('Отменить');
  });

  it('индикатор — кольцо, полосы внизу плашки нет', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    expect(document.querySelector('.heys-undo-bar__arc')).not.toBeNull();
    expect(document.querySelector('.heys-undo-bar__count')).not.toBeNull();
    expect(document.querySelector('.heys-undo-bar__track')).toBeNull();
    expect(document.querySelector('.heys-undo-bar__progress')).toBeNull();
  });

  // ── Таймер ──

  it('окно 5 с: на 4999 мс отмена ещё доступна', () => {
    const onUndo = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo });

    advance(UNDO_WINDOW_MS - 1);
    expect(tryUndo()).toBe(true);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('окно 5 с: невидимого запаса за таймером нет — на 5000 мс уже поздно', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo, onExpire });

    advance(UNDO_WINDOW_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();

    advance(1);
    expect(onExpire).toHaveBeenCalledTimes(1);

    advance(HIDE_MS);
    expect(tryUndo()).toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('дуга и цифра убывают: показывают остаток, а не прошедшее время', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    expect(countText()).toBe('5');
    expect(ringRatio()).toBeCloseTo(1, 1);

    // Замеряем не на самой границе секунды: цифра — потолок остатка, и ровно
    // на 1000 мс остаётся 4,00x с, то есть честная «5».
    advance(1100);
    expect(countText()).toBe('4');
    expect(ringRatio()).toBeCloseTo(0.78, 1);

    advance(3000);
    expect(countText()).toBe('1');
    expect(ringRatio()).toBeCloseTo(0.18, 1);

    // Ни разу не выросла.
    expect(Number.isNaN(ringRatio())).toBe(false);
  });

  it('цифра не опускается ниже 1, пока окно живо', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    advance(UNDO_WINDOW_MS - 1);
    expect(countText()).toBe('1');
  });

  // ── Пачка ──

  it('подряд идущие удаления одного вида собираются в один бар', () => {
    const batch = { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] };
    const undos = [vi.fn(), vi.fn(), vi.fn()];

    Undo.push({ label: 'Рис бурый удалён', batch, onUndo: undos[0] });
    advance(500);
    Undo.push({ label: 'Кефир удалён', batch, onUndo: undos[1] });
    advance(500);
    Undo.push({ label: 'Хлеб удалён', batch, onUndo: undos[2] });

    expect(bars()).toHaveLength(1);
    expect(labelText()).toBe('Удалено 3 продукта');
  });

  it('«Отменить» на пачке возвращает все, в обратном порядке', () => {
    const batch = { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] };
    const order = [];

    Undo.push({ label: 'Рис бурый удалён', batch, onUndo: () => order.push('рис') });
    Undo.push({ label: 'Кефир удалён', batch, onUndo: () => order.push('кефир') });
    Undo.push({ label: 'Хлеб удалён', batch, onUndo: () => order.push('хлеб') });

    expect(tryUndo()).toBe(true);
    // Последнее удалённое ложится обратно первым, иначе индексы соседей едут.
    expect(order).toEqual(['хлеб', 'кефир', 'рис']);
  });

  it('таймер пачки перезапускается: первое удаление доживает до последнего', () => {
    const batch = { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] };
    const first = vi.fn();

    Undo.push({ label: 'Рис бурый удалён', batch, onUndo: first });
    advance(4000);
    Undo.push({ label: 'Кефир удалён', batch, onUndo: () => {} });

    // По старому правилу первое здесь было бы уже необратимо.
    advance(4000);
    expect(tryUndo()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('текст пачки склоняет число: 1, 2 и 5 продуктов', () => {
    const batch = { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] };

    Undo.push({ label: 'Рис бурый удалён', batch, onUndo: () => {} });
    expect(labelText()).toBe('Рис бурый удалён');

    Undo.push({ label: 'Кефир удалён', batch, onUndo: () => {} });
    expect(labelText()).toBe('Удалено 2 продукта');

    for (let i = 0; i < 3; i++) {
      Undo.push({ label: 'Ещё удалён', batch, onUndo: () => {} });
    }
    expect(labelText()).toBe('Удалено 5 продуктов');
  });

  it('пачка не ограничена числом и всегда называет количество', () => {
    const batch = { key: 'task', forms: ['задача', 'задачи', 'задач'] };
    for (let i = 0; i < 11; i++) {
      Undo.push({ label: 'Задача удалена', batch, onUndo: () => {} });
    }
    expect(labelText()).toBe('Удалено 11 задач');
  });

  // ── Разные виды ──

  it('разные виды подряд в пачку не идут: предыдущее становится необратимым', () => {
    const product = vi.fn();
    const productExpire = vi.fn();
    const task = vi.fn();

    Undo.push({
      label: 'Рис бурый удалён',
      batch: { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] },
      onUndo: product,
      onExpire: productExpire,
    });
    Undo.push({
      label: 'Задача удалена',
      batch: { key: 'task', forms: ['задача', 'задачи', 'задач'] },
      onUndo: task,
    });

    expect(bars()).toHaveLength(1);
    expect(labelText()).toBe('Задача удалена');
    expect(productExpire).toHaveBeenCalledTimes(1);

    expect(tryUndo()).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    expect(product).not.toHaveBeenCalled();
  });

  it('без ключа пачки удаления не собираются', () => {
    const first = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo: first });
    Undo.push({ label: 'Обед удалён', onUndo: () => {} });

    expect(labelText()).toBe('Обед удалён');
    expect(tryUndo()).toBe(true);
    expect(first).not.toHaveBeenCalled();
  });

  // ── После «Отменить» ──

  it('после «Отменить» бар исчезает и подтверждающего тоста нет', () => {
    const success = vi.fn();
    window.HEYS.Toast = { success, error: vi.fn(), info: vi.fn() };

    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });
    expect(tryUndo()).toBe(true);

    advance(HIDE_MS);
    expect(bar()).toBeNull();
    expect(success).not.toHaveBeenCalled();
  });

  it('истёк без нажатия: onExpire есть, onUndo нет, бар уехал', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo, onExpire });

    advance(UNDO_WINDOW_MS + HIDE_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  // ── runAction ──

  it('runAction: apply сразу, undo — только по нажатию', () => {
    const apply = vi.fn(() => ({ mealId: 'm3' }));
    const undo = vi.fn();

    Undo.runAction({ label: 'Перекус удалён', apply, undo });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(tryUndo()).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('runAction: если apply бросает исключение, бара нет', () => {
    const undo = vi.fn();
    const apply = vi.fn(() => {
      throw new Error('удаление не прошло');
    });

    Undo.runAction({ label: 'Перекус удалён', apply, undo });

    expect(bar()).toBeNull();
    advance(UNDO_WINDOW_MS + HIDE_MS);
    expect(undo).not.toHaveBeenCalled();
  });

  it('runAction прокидывает ключ пачки', () => {
    const batch = { key: 'meal-product', forms: ['продукт', 'продукта', 'продуктов'] };
    Undo.runAction({ label: 'Рис бурый удалён', batch, apply: () => ({}), undo: () => {} });
    Undo.runAction({ label: 'Кефир удалён', batch, apply: () => ({}), undo: () => {} });

    expect(labelText()).toBe('Удалено 2 продукта');
  });

  // ── Положение ──

  it('стоит над нижней навигацией с зазором 12 px', () => {
    mountTabs(TABS_HEIGHT);
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    expect(bottomPx()).toBe(TABS_HEIGHT + GAP);
  });

  it('без навигации отступ отдан CSS, а не инлайну', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    // Инлайн пуст — значит работает правило из heys-components.css, где стоит
    // calc(12px + env(safe-area-inset-bottom, 0px)).
    expect(bar().style.bottom).toBe('');
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/heys-components.css'), 'utf8');
    const block = css.slice(css.indexOf('.heys-undo-bar {'), css.indexOf('@keyframes heysUndoBarIn'));
    expect(block).toContain('calc(12px + env(safe-area-inset-bottom, 0px))');
  });

  it('отступ пересчитывается, пока бар висит: навигация сменилась под ним', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });
    expect(Number.isNaN(bottomPx())).toBe(true);

    const tabs = mountTabs(TABS_HEIGHT);
    advance(400);
    expect(bottomPx()).toBe(TABS_HEIGHT + GAP);

    // Узел навигации пересоздан с другой высотой — React так и делает.
    tabs.remove();
    mountTabs(96);
    advance(400);
    expect(bottomPx()).toBe(96 + GAP);

    // Переезды не съели окно.
    expect(tryUndo()).toBe(true);
  });

  // ── Доступность ──

  it('озвучивается текст и «Отменить, осталось N секунд»', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    expect(bar().getAttribute('role')).toBe('status');
    expect(undoBtn().getAttribute('aria-label')).toBe('Отменить, осталось 5 секунд');
    expect(document.querySelector('.heys-undo-bar__ring').getAttribute('aria-hidden')).toBe('true');

    advance(2000);
    expect(undoBtn().getAttribute('aria-label')).toBe('Отменить, осталось 3 секунд');
  });

  // ── Правило продукта: выделение текста ──

  it('текст бара не выделяется — он живёт пять секунд (строка «язык, выделение, часовой пояс»)', () => {
    mountCss();
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    // Правило стоит на контейнере .heys-undo-bar__content и наследуется на
    // подпись и кнопку в настоящем браузере; happy-dom инициализм наследования
    // для getComputedStyle не считает, поэтому проверяем сам узел с правилом —
    // ровно тот, что оборачивает и label, и btn.
    const content = document.querySelector('.heys-undo-bar__content');
    expect(getComputedStyle(content).userSelect).toBe('none');
    expect(content.contains(document.querySelector('.heys-undo-bar__label'))).toBe(true);
    expect(content.contains(undoBtn())).toBe(true);
  });

  // ── Правило продукта: врезка снизу ──

  it('врезка снизу реально применяется через настоящий CSS-каскад', () => {
    mountCss();
    Undo.push({ label: 'Перекус удалён', onUndo: () => {} });

    // Без навигации инлайн пуст — отступ берёт правило .heys-undo-bar,
    // и раз оно совпало с элементом, остальные его свойства тоже читаются:
    // подтверждает, что именно это правило, а не случайный текст в файле,
    // применяется к настоящему бару.
    expect(bar().style.bottom).toBe('');
    const cs = getComputedStyle(bar());
    expect(cs.position).toBe('fixed');
    expect(cs.borderRadius).toBe('22px');

    // calc(env(...)) happy-dom не резолвит в число, поэтому нижняя врезка
    // сверяется текстом объявления — вместе с проверкой выше это и есть
    // «прочитан вычисленный стиль» настолько, насколько это возможно в jsdom/
    // happy-dom без реального движка рендеринга.
    const block = UNDO_CSS.slice(UNDO_CSS.indexOf('.heys-undo-bar {'), UNDO_CSS.indexOf('@keyframes heysUndoBarIn'));
    expect(block).toMatch(/bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });

  // ── Правило продукта: повторный тап ──

  it('второй клик по «Отменить» уже не находит бар — защита конструктивная, не таймером', () => {
    const onUndo = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo });

    const btn = undoBtn();
    btn.click();
    btn.click(); // тот же узел, второй клик — на кнопке, которую логика уже отпустила
    // Второй клик синхронно бьёт в тот же обработчик: onUndoClick — currentUndo
    // уже null, ранний выход не даёт повторно провести onUndo.
    expect(onUndo).toHaveBeenCalledTimes(1);

    advance(HIDE_MS);
    // Бар пересоздаваться не должен — второй клик ничего не запустил повторно.
    expect(bar()).toBeNull();
  });

  // ── Строка «закрытие приложения внутри окна» (решение 24 августа) ──

  it('приложение свернули внутри окна — окно истекло, удаление применено, бара при возврате нет', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo, onExpire });

    advance(2000); // середина окна: до истечения ещё три секунды
    expect(bar()).toBeTruthy();
    expect(Undo.pending).toBe(true);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Свёрнутое приложение окно не продлевает и остаток времени не сохраняет:
    // удаление применяется прямо здесь.
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire.mock.calls[0][0]).toBe('document-hidden');
    expect(onUndo).not.toHaveBeenCalled();
    expect(Undo.pending).toBe(false);
    advance(HIDE_MS); // бар уезжает вниз своей штатной анимацией
    expect(bar()).toBeNull();

    // Вернулись на экран внутри бывших пяти секунд — бара нет и не будет.
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    advance(UNDO_WINDOW_MS + HIDE_MS);
    expect(bar()).toBeNull();
    expect(Undo.pending).toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
    // Ничего не отложено на следующий запуск: состояние живёт только в модуле.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('вкладку закрывают внутри окна — удаление закрепляется до ухода страницы', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    Undo.push({ label: 'Рис бурый удалён', onUndo, onExpire });

    advance(1000);
    window.dispatchEvent(new Event('beforeunload'));

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire.mock.calls[0][0]).toBe('beforeunload');
    expect(onUndo).not.toHaveBeenCalled();
    expect(Undo.pending).toBe(false);
  });

  // ── Строка «отмена на другом устройстве» (решение 24 августа) ──

  it('бар живёт только на своём устройстве: состояние не уходит ни в хранилище, ни в облако', () => {
    const cloudCalls = [];
    window.HEYS.cloud = new Proxy({}, {
      get: (_t, prop) => { cloudCalls.push(String(prop)); return () => {}; },
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn(), onExpire: vi.fn() });
    advance(2000);
    expect(bar()).toBeTruthy();

    // Второе устройство — это другой документ с собственным модулем: у него
    // своя переменная состояния, и она пуста. Симулируем повторной загрузкой.
    const second = loadUndo();
    expect(second.pending).toBe(false);

    advance(UNDO_WINDOW_MS + HIDE_MS);
    // Ни записи в хранилище, ни обращения к облаку за всё окно.
    expect(setItem).not.toHaveBeenCalled();
    expect(cloudCalls).toHaveLength(0);
    setItem.mockRestore();
  });
});
