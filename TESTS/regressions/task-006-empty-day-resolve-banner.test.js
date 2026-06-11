/**
 * Regression test для TASK-006.
 *
 * Bug: полностью пустой прошлый день (meals:0, «?» в спарклайне калорий) не давал
 * в DayTab баннер-аффорданс для разбора. Low-cal баннер резал такой день гейтом
 * `!hasMeals` (return null), и разобрать его можно было только автошагом утреннего
 * чекина (1×/день + лаг гидрации). Парадокс: день с НЕМНОГО еды (<50%) показывал
 * баннер выбора, а совсем пустой (хуже для статистики) — ничего.
 *
 * Fix: renderLowCalBanner показывает тот же State A (голодание / дописать /
 * не учитывать) и для пустого дня, но лишь если он pending по версии
 * HEYS.YesterdayVerify.getPendingPastDays() — то же окно, что у автошага чекина,
 * чтобы баннер не вылезал на всех исторических пустых днях.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const evalScript = (relativePath) => {
  const filePath = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  // eslint-disable-next-line no-eval
  eval(source);
};

// Рекурсивно собрать все vnode'ы заданного типа из дерева React-mock.
function findByType(node, type, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (node.type === type) acc.push(node);
  (node.children || []).forEach((ch) => findByType(ch, type, acc));
  return acc;
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object') return (node.children || []).map(textOf).join('');
  return String(node);
}

function setPending(dates) {
  window.HEYS.YesterdayVerify = {
    getPendingPastDays: () => ({
      missingDays: dates.map((d) => ({ date: d })),
      totalPendingDays: dates.length
    })
  };
  // сбрасываем кэш баннера, чтобы новый набор pending подхватился
  window.HEYS.dayLowCalBanner.invalidatePendingCache();
}

const render = (params) => window.HEYS.dayLowCalBanner.renderLowCalBanner(params);

beforeEach(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  window.HEYS = {};
  window.addEventListener = () => {};
  // Лёгкий мок React.createElement → сериализуемое дерево
  window.React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(Infinity).filter((c) => c != null)
    })
  };
  evalScript('../../apps/web/heys_day_low_cal_banner_v1.js');
});

describe('TASK-006: баннер разбора для полностью пустого прошлого дня', () => {
  it('экспортирует публичный API', () => {
    const api = window.HEYS.dayLowCalBanner;
    expect(typeof api.renderLowCalBanner).toBe('function');
    expect(typeof api.isPendingEmptyDay).toBe('function');
    expect(typeof api.invalidatePendingCache).toBe('function');
  });

  it('ядро бага: пустой pending-день (meals:0) показывает баннер выбора с 3 действиями', () => {
    setPending(['2026-06-10']);
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [] },
      eatenKcal: 0,
      displayOptimum: 2000,
      isToday: false
    });
    expect(vnode).toBeTruthy();
    expect(vnode.props.className).toContain('low-cal-banner-full');
    const buttons = findByType(vnode, 'button');
    expect(buttons).toHaveLength(3);
    const labels = buttons.map(textOf);
    expect(labels.some((t) => t.includes('голодание'))).toBe(true);
    expect(labels.some((t) => t.includes('Дописать'))).toBe(true);
    expect(labels.some((t) => t.includes('Не учитывать'))).toBe(true);
    // описание — про отсутствие данных, не про «съедено N ккал»
    const full = textOf(vnode);
    expect(full).toContain('нет данных');
  });

  it('пустой день ВНЕ окна pending (не в missingDays) баннер НЕ показывает', () => {
    setPending(['2026-06-09']); // другой день pending, наш — нет
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [] },
      eatenKcal: 0,
      displayOptimum: 2000,
      isToday: false
    });
    expect(vnode).toBeNull();
  });

  it('сегодняшний день не показывает баннер даже если пустой и pending', () => {
    setPending(['2026-06-11']);
    const vnode = render({
      date: '2026-06-11',
      day: { date: '2026-06-11', meals: [] },
      eatenKcal: 0,
      displayOptimum: 2000,
      isToday: true
    });
    expect(vnode).toBeNull();
  });

  it('не регрессирует: день с едой <50% показывает баннер выбора как прежде', () => {
    setPending([]); // не нужно pending — путь через hasMeals
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [{ items: [{ name: 'x' }] }] },
      eatenKcal: 400,
      displayOptimum: 2000,
      isToday: false
    });
    expect(vnode).toBeTruthy();
    expect(vnode.props.className).toContain('low-cal-banner-full');
    expect(findByType(vnode, 'button')).toHaveLength(3);
    expect(textOf(vnode)).toContain('Съедено');
  });

  it('не регрессирует: отмеченный голоданием день → компактный баннер с «Изменить»', () => {
    setPending([]);
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [], isFastingDay: true },
      isToday: false
    });
    expect(vnode).toBeTruthy();
    expect(vnode.props.className).toContain('low-cal-banner-compact');
    const buttons = findByType(vnode, 'button');
    expect(buttons).toHaveLength(1);
    expect(textOf(buttons[0])).toContain('Изменить');
  });

  it('пустой день <= порога окна, но уже отмеченный пропуском → компактный, а не выбор', () => {
    setPending(['2026-06-10']);
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [], isIncomplete: true },
      isToday: false
    });
    expect(vnode.props.className).toContain('low-cal-banner-compact');
    expect(textOf(vnode)).toContain('пропуск');
  });

  it('isPendingEmptyDay отражает набор pending и сбрасывается invalidatePendingCache', () => {
    const api = window.HEYS.dayLowCalBanner;
    setPending(['2026-06-10']);
    expect(api.isPendingEmptyDay('2026-06-10')).toBe(true);
    expect(api.isPendingEmptyDay('2026-06-08')).toBe(false);
    setPending([]); // setPending уже инвалидирует кэш
    expect(api.isPendingEmptyDay('2026-06-10')).toBe(false);
  });

  it('YesterdayVerify не загружен → пустой набор, баннер не падает и не показывается', () => {
    // не задаём window.HEYS.YesterdayVerify вовсе
    window.HEYS.dayLowCalBanner.invalidatePendingCache();
    const vnode = render({
      date: '2026-06-10',
      day: { date: '2026-06-10', meals: [] },
      eatenKcal: 0,
      displayOptimum: 2000,
      isToday: false
    });
    expect(vnode).toBeNull();
  });
});
