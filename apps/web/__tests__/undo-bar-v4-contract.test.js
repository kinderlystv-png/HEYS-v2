// Смоук-симуляция бара отмены HEYS.Undo против контракта канваса
// nutrition-tab.v4.dc.html: строки «удаление», «удаление и отмена»,
// «два удаления подряд», «тост и навигация» + кадр «Питание · отмена удаления».
//
// Живые условия человек собрать не может: попасть пальцем в 4999-ю миллисекунду,
// удалить два приёма внутри одного окна отмены и проверить, что первое стало
// необратимым ровно в момент второго удаления, — это работа фейковых таймеров.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UNDO_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_undo_v1.js'), 'utf8');

// Контракт «удаление и отмена»: тост живёт 5 с, окно защиты записи равно
// видимой полосе — невидимого запаса нет.
const UNDO_WINDOW_MS = 5000;
// Запас, заведомо переживающий любую анимацию скрытия бара.
const HIDE_MS = 1000;
// Кадр «Питание · отмена удаления»: вторая строка тоста.
const DEFAULT_SUBTITLE = 'можно вернуть, пока идёт полоса';
// Высота нижней навигации в кадре 375 px.
const TABS_HEIGHT = 64;

function loadUndo() {
  eval(UNDO_SRC);
  return window.HEYS.Undo;
}

const bar = () => document.querySelector('.heys-undo-bar');
const bars = () => document.querySelectorAll('.heys-undo-bar');
const undoBtn = () => document.querySelector('.heys-undo-bar__btn');
const textOf = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;

/** Нажимает «Отменить», если кнопка ещё в документе. Возвращает факт нажатия. */
function tryUndo() {
  const btn = undoBtn();
  if (!btn) return false;
  btn.click();
  return true;
}

/** Отступ бара снизу в пикселях: инлайновый bottom или инлайновая CSS-переменная. */
function bottomOffsetPx() {
  const el = bar();
  if (!el) return NaN;
  const raw =
    el.style.bottom ||
    el.style.getPropertyValue('--heys-undo-bar-bottom') ||
    el.style.getPropertyValue('--undo-bottom') ||
    '';
  const match = /(-?[\d.]+)px/.exec(raw);
  return match ? parseFloat(match[1]) : NaN;
}

/**
 * Остаток окна, который показывает полоса: 1 — полная, 0 — пустая.
 * Компонент рисует её через `transform: scaleX(...)`; ширина в процентах
 * читается как запасной вариант, если полосу переведут на неё.
 */
function progressRatio() {
  const el = document.querySelector('.heys-undo-bar__progress');
  if (!el) return NaN;
  const scale = /scaleX\(\s*(-?[\d.]+)\s*\)/.exec(el.style.transform || '');
  if (scale) return parseFloat(scale[1]);
  const width = /(-?[\d.]+)%/.exec(el.style.width || '');
  if (width) return parseFloat(width[1]) / 100;
  return NaN;
}

function mountTabs(height = TABS_HEIGHT) {
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.getBoundingClientRect = () => ({
    x: 0, y: 812 - height, width: 375, height,
    top: 812 - height, right: 375, bottom: 812, left: 0,
    toJSON() { return this; }
  });
  document.body.appendChild(tabs);
  return tabs;
}

/** Смена экрана под живым баром: старая навигация снимается, встаёт новая. */
function replaceTabs(height) {
  document.querySelectorAll('.tabs').forEach((el) => el.remove());
  return mountTabs(height);
}

describe('бар отмены v4 — контракт канваса «удаление и отмена»', () => {
  let Undo;

  beforeEach(() => {
    // performance/rAF фейкуем вместе с таймерами: полоса времени и коммит
    // должны идти по одним часам, иначе «ровно 5000» не проверить.
    vi.useFakeTimers({
      toFake: [
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'
      ]
    });
    document.body.innerHTML = '';
    delete window.HEYS;
    Undo = loadUndo();
  });

  afterEach(() => {
    try { Undo?.commit?.('test-teardown'); } catch { /* компонент уже мог быть снят */ }
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // ── 1. Единственное действие ──

  it('в баре ровно одна кнопка — «Отменить»', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    const buttons = document.querySelectorAll('.heys-undo-bar button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('heys-undo-bar__btn')).toBe(true);
    expect(buttons[0].textContent.trim()).toBe('Отменить');
  });

  it('кнопки закрытия и счётчика очереди в разметке нет', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    expect(document.querySelector('.heys-undo-bar__close')).toBeNull();
    expect(document.querySelector('.heys-undo-bar__meta')).toBeNull();
  });

  it('каркас разметки: подпись, пояснение, кнопка и полоса времени', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    const root = bar();
    expect(root).not.toBeNull();
    expect(root.querySelector('.heys-undo-bar__content')).not.toBeNull();
    expect(root.querySelector('.heys-undo-bar__content .heys-undo-bar__copy')).not.toBeNull();
    expect(root.querySelector('.heys-undo-bar__copy b.heys-undo-bar__label')).not.toBeNull();
    expect(root.querySelector('.heys-undo-bar__copy span.heys-undo-bar__subtitle')).not.toBeNull();
    expect(root.querySelector('button.heys-undo-bar__btn')).not.toBeNull();
    expect(root.querySelector('.heys-undo-bar__track > .heys-undo-bar__progress')).not.toBeNull();
    expect(textOf('.heys-undo-bar__label')).toBe('Перекус удалён');
  });

  // ── 2. 5 секунд ──

  it('5 с: на 4999 мс отмена ещё доступна', () => {
    const onUndo = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo });

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);

    expect(bar()).not.toBeNull();
    expect(tryUndo()).toBe(true);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('5 с: после 5000 мс запись закоммичена и отмена не срабатывает', () => {
    const onUndo = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo });

    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    tryUndo();
    vi.advanceTimersByTime(HIDE_MS);
    tryUndo();

    expect(onUndo).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  // ── 3. Окно защиты равно видимой полосе ──

  it('коммит происходит ровно на 5000 мс: невидимого запаса нет', () => {
    const onExpire = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn(), onExpire });

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HIDE_MS);
    expect(bar()).toBeNull();
  });

  // ── 4. Новый заменяет предыдущий ──

  it('два удаления подряд: в DOM один бар, показана вторая подпись', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });
    vi.advanceTimersByTime(2000);
    Undo.push({ label: 'Обед удалён', onUndo: vi.fn() });

    expect(bars()).toHaveLength(1);
    expect(textOf('.heys-undo-bar__label')).toBe('Обед удалён');
  });

  it('два удаления подряд: первое становится необратимым в момент второго', () => {
    const undoFirst = vi.fn();
    const undoSecond = vi.fn();

    Undo.push({ label: 'Перекус удалён', onUndo: undoFirst });
    vi.advanceTimersByTime(2000);
    Undo.push({ label: 'Обед удалён', onUndo: undoSecond });

    expect(tryUndo()).toBe(true);
    expect(undoSecond).toHaveBeenCalledTimes(1);
    expect(undoFirst).not.toHaveBeenCalled();

    // и позже к первому вернуться тоже нельзя
    vi.advanceTimersByTime(UNDO_WINDOW_MS + HIDE_MS);
    tryUndo();
    expect(undoFirst).not.toHaveBeenCalled();
  });

  // ── 5. Отмена возвращает последнее удалённое ──

  it('клик по «Отменить» вызывает onUndo один раз и прячет бар', () => {
    const onUndo = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo });

    expect(tryUndo()).toBe(true);
    expect(onUndo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HIDE_MS);
    expect(bar()).toBeNull();

    // истёкший таймер уже отменённой записи не вызывает её повторно
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // ── 6. Истечение срока ──

  it('по истечении 5 с вызывается onExpire, но не onUndo', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    Undo.push({ label: 'Перекус удалён', onUndo, onExpire });

    vi.advanceTimersByTime(UNDO_WINDOW_MS + HIDE_MS);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  // ── 7. runAction ──

  it('runAction: apply сразу, undo — только по нажатию «Отменить»', () => {
    const apply = vi.fn(() => ({ mealId: 'm3' }));
    const undo = vi.fn();

    Undo.runAction({ label: 'Перекус удалён', apply, undo });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();

    expect(tryUndo()).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('runAction: если apply бросает исключение, бар не показывается', () => {
    const undo = vi.fn();
    const apply = vi.fn(() => { throw new Error('удаление не прошло'); });

    Undo.runAction({ label: 'Перекус удалён', apply, undo });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(bar()).toBeNull();

    vi.advanceTimersByTime(UNDO_WINDOW_MS + HIDE_MS);
    expect(undo).not.toHaveBeenCalled();
  });

  // Очистка дня из статистики держит окно 7 с, и её подпись — единственное
  // место, где срок назван словами. Через runAction подпись раньше терялась.
  it('runAction: подпись вызывающего доходит до бара', () => {
    Undo.runAction({
      label: 'День очищен',
      subtitle: 'можно вернуть в течение семи секунд',
      apply: () => ({ day: '2026-08-21' }),
      undo: () => {},
    });

    expect(textOf('.heys-undo-bar__subtitle')).toBe('можно вернуть в течение семи секунд');
  });

  // ── 8. Позиция над нижней навигацией ──

  it('бар стоит над нижней навигацией: отступ снизу не меньше высоты .tabs', () => {
    mountTabs(TABS_HEIGHT);
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    const offset = bottomOffsetPx();
    expect(Number.isNaN(offset)).toBe(false);
    expect(offset).toBeGreaterThanOrEqual(TABS_HEIGHT);
  });

  it('без нижней навигации бар всё равно отступает от края экрана', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    const offset = bottomOffsetPx();
    expect(Number.isNaN(offset)).toBe(false);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(TABS_HEIGHT);
  });

  // ── 9. Подпись по умолчанию ──

  it('подпись по умолчанию — «можно вернуть, пока идёт полоса»', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    expect(textOf('.heys-undo-bar__subtitle')).toBe(DEFAULT_SUBTITLE);
  });

  it('явно переданный subtitle не перетирается', () => {
    Undo.push({ label: 'Обед удалён', subtitle: 'вернём вместе с продуктами', onUndo: vi.fn() });

    expect(textOf('.heys-undo-bar__subtitle')).toBe('вернём вместе с продуктами');
  });

  // ── 17. Полоса убывает: показывает остаток окна ──
  // Решение принято за дизайнера, запись 5 в docs/ui/UI_V4_FINDINGS.md
  // («полоса убывает — показывает остаток окна»), поэтому направление
  // зафиксировано тестом: иначе следующая правка развернёт его молча.
  // В живом предпросмотре не проверить — вкладка фоновая, rAF заморожен.

  it('полоса убывает от полной к нулю по мере расхода окна', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    // старт: полоса целая
    expect(progressRatio()).toBeCloseTo(1, 2);

    vi.advanceTimersByTime(1000); // ~20 % окна израсходовано
    const atStart = progressRatio();

    vi.advanceTimersByTime(3000); // ~80 % окна израсходовано
    const atLate = progressRatio();

    vi.advanceTimersByTime(950); // 4950 мс — окно почти исчерпано
    const atEnd = progressRatio();

    expect(Number.isNaN(atStart)).toBe(false);
    expect(Number.isNaN(atLate)).toBe(false);
    expect(Number.isNaN(atEnd)).toBe(false);

    // остаток окна, а не прошедшее время: на 20 % полоса ещё почти целая
    expect(atStart).toBeCloseTo(0.8, 1);
    expect(atLate).toBeCloseTo(0.2, 1);

    // направление: строго убывает и заметно, а не дрожит около единицы
    expect(atStart).toBeGreaterThan(atLate);
    expect(atLate).toBeGreaterThan(atEnd);
    expect(atStart - atLate).toBeGreaterThan(0.4);
    expect(atEnd).toBeLessThan(0.1);
  });

  // ── 18. Отступ пересчитывается, пока бар висит ──
  // Контракт «тост и навигация»: бар живёт свои 5 с поверх нижней навигации на
  // любом экране, а высота .tabs между экранами меняется прямо под ним.

  it('отступ снизу пересчитывается на живом баре при смене нижней навигации', () => {
    Undo.push({ label: 'Перекус удалён', onUndo: vi.fn() });

    // экран без нижней навигации
    const withoutTabs = bottomOffsetPx();
    expect(Number.isNaN(withoutTabs)).toBe(false);
    expect(withoutTabs).toBeLessThan(TABS_HEIGHT);

    // ушли на экран с навигацией — бар тот же, окно то же
    mountTabs(TABS_HEIGHT);
    vi.advanceTimersByTime(300); // с запасом на троттл 200 мс
    const withTabs = bottomOffsetPx();
    expect(bar()).not.toBeNull();
    expect(withTabs).toBeGreaterThanOrEqual(TABS_HEIGHT);
    expect(withTabs).toBeGreaterThan(withoutTabs);

    // экран сменился на другой: узел навигации пересоздан и стал выше
    replaceTabs(96);
    vi.advanceTimersByTime(300);
    const withTallerTabs = bottomOffsetPx();
    expect(bar()).not.toBeNull();
    expect(withTallerTabs).toBeGreaterThanOrEqual(96);
    expect(withTallerTabs).toBeGreaterThan(withTabs);

    // переезды не съели окно возврата: отмена всё ещё работает
    expect(tryUndo()).toBe(true);
  });
});
