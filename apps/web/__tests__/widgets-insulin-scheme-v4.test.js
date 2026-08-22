// Схема волн 2×2 — раздел контракта «Инсулиновая волна» (22 августа).
//
// До этого пакета волны раскладывались по оси времени дня: между ними зияли
// пустые промежутки, а ширина зависела от длительности. Контракт это отменил —
// теперь это схема: волны вплотную, равной ширины, в порядке приёмов.
//
// Живьём не поймать: нужны стык и нахлёст в одном дне, день без приёмов и
// больше восьми приёмов сразу.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_insulin_wave_v4.js'), 'utf8');

function load() {
  const win = { HEYS: { Widgets: {} } };
  new Function('window', 'globalThis', 'self', SRC).call(win, win, win, win);
  return win.HEYS.Widgets.InsulinWaveV4;
}

// Пять приёмов кадра «Волна · стык и нахлёст»: один стык, один нахлёст,
// последняя волна текущая.
//
// Углеводы подобраны так, чтобы первые четыре волны дали ровно кадровую
// амплитуду 24 px: высота пропорциональна углеводам, у самого углеводного она
// полные 30 px (канвас 22 августа), поэтому 80 из 100 — это 24.
const FRAME_WAVES = [
  { id: 'a', startMin: 100, endMin: 200, carbs: 80 },
  { id: 'b', startMin: 200, endMin: 300, carbs: 80 },
  { id: 'c', startMin: 400, endMin: 500, carbs: 80 },
  { id: 'd', startMin: 470, endMin: 600, carbs: 80 },
  { id: 'e', startMin: 700, endMin: 800, carbs: 100, isActive: true }
];

describe('схема волн · геометрия кадра', () => {
  let V4;
  beforeEach(() => { V4 = load(); });

  it('полоса 122 px делится на число волн', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    expect(scheme.slot).toBeCloseTo(122 / 5, 5);
  });

  it('слипшиеся волны дают одну фигуру на столько слотов, сколько в ней волн', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    // Стык склеил первые две, нахлёст — третью с четвёртой, пятая отдельно.
    expect(scheme.figures).toHaveLength(3);
    expect(scheme.figures[0].d.startsWith('M4.0,46')).toBe(true);
    expect(scheme.figures[1].d.startsWith('M52.8,46')).toBe(true);
    expect(scheme.figures[2].d.startsWith('M101.6,46')).toBe(true);
  });

  it('кривая первой фигуры совпадает с кадром до десятых', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    // Кадр: M4,46 C10.8,46 9.4,22 16.2,22 C23.5,22 24,35.9 28.4,35.9 …
    expect(scheme.figures[0].d).toContain('C10.8,46.0 9.4,22.0 16.2,22.0');
    expect(scheme.figures[0].d).toContain('C23.5,22.0 24.0,35.9 28.4,35.9');
    expect(scheme.figures[0].d).toContain('C32.8,35.9 33.3,22.0 40.6,22.0');
  });

  it('стык — провал до 42 % высоты и точка 2,2 px, без подписи', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    expect(scheme.joints).toHaveLength(1);
    // 46 − 24 × 0,42 = 35,92
    expect(scheme.joints[0].y).toBeCloseTo(46 - 24 * 0.42, 2);
    expect(scheme.joints[0].x).toBeCloseTo(28.4, 1);
  });

  it('нахлёст — провал до 68 % и полоса шириной 0,9 слота', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    expect(scheme.overlaps).toHaveLength(1);
    const band = scheme.overlaps[0];
    expect(band.width).toBeCloseTo((122 / 5) * 0.9, 2);
    // Кадр: rect x=66.2 width=22, скоба на y=49.
    expect(band.x).toBeCloseTo(66.2, 1);
    expect(band.braceY).toBe(49);
    expect(scheme.figures[1].d).toContain((46 - 24 * 0.68).toFixed(1));
  });

  it('между несоединёнными фигурами стоит риска, внутри фигуры — нет', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    expect(scheme.dividers.map((x) => Number(x.toFixed(1)))).toEqual([52.8, 101.6]);
  });

  it('незакрытая волна заливается плотнее закрытых', () => {
    const scheme = V4.buildWaveScheme(FRAME_WAVES);
    expect(scheme.figures.map((f) => f.opacity)).toEqual([0.45, 0.45, 0.8]);
  });

  it('больше восьми приёмов — восемь последних, счётчик остаётся полным', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`, startMin: 100 + i * 60, endMin: 140 + i * 60
    }));
    const scheme = V4.buildWaveScheme(many);
    expect(scheme.shownCount).toBe(8);
    expect(scheme.figures).toHaveLength(8);
    const built = V4.buildV4FromWave({ waveHistory: many }, 600);
    expect(built.mealCountLabel).toBe('12 приёмов');
  });

  it('минимальная ширина фигуры — 12 px', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, startMin: i * 60, endMin: i * 60 + 10 }));
    expect(V4.buildWaveScheme(many).slot).toBeGreaterThanOrEqual(12);
  });
});

describe('схема волн · высота вершины по углеводам', () => {
  let V4;
  beforeEach(() => { V4 = load(); });

  it('самый углеводный приём даёт полные 30 px, остальные пропорционально', () => {
    expect(V4.waveAmplitudes([{ carbs: 100 }, { carbs: 50 }])).toEqual([30, 20]);
  });

  it('ниже 20 px вершина не опускается', () => {
    expect(V4.waveAmplitudes([{ carbs: 100 }, { carbs: 10 }])).toEqual([30, 20]);
  });

  it('углеводов не знает ни одна волна — все вершины полные', () => {
    // Занижать без причины нельзя: это показало бы разницу, которой нет.
    expect(V4.waveAmplitudes([{}, { carbs: 0 }])).toEqual([30, 30]);
  });

  it('провал считается от меньшей из соседних волн', () => {
    // Иначе высокая волна утопила бы стык ниже основания низкой.
    const scheme = V4.buildWaveScheme([
      { id: 'a', startMin: 100, endMin: 200, carbs: 100 },
      { id: 'b', startMin: 200, endMin: 300, carbs: 50 }
    ]);
    expect(scheme.joints[0].y).toBeCloseTo(46 - 20 * 0.42, 2);
  });
});

describe('схема волн · день без приёмов и текущая волна', () => {
  let V4;
  beforeEach(() => { V4 = load(); });

  it('день без приёмов: силуэта нет, счётчик словами, покой от подъёма', () => {
    const built = V4.buildV4FromWave({ waveHistory: [] }, 10 * 60);
    expect(built.hasMeals).toBe(false);
    expect(built.scheme.figures).toHaveLength(0);
    expect(built.mealCountLabel).toBe('приёмов не было');
    expect(built.emptyStateLabel).toBe('покой 3 ч от подъёма');
    // Данные прошлого дня не подставляются ни в силуэт, ни в строку.
    expect(built.activeWavePath).toBeNull();
    expect(built.underWaveLabel).toBeNull();
  });

  it('есть стыки — справа стоит их счётчик, как в кадре', () => {
    // Кадр «Волна · стык и нахлёст»: слева «2 волны наложились», справа «1 стык».
    const built = V4.buildV4FromWave({ waveHistory: FRAME_WAVES, overlaps: [{}] }, 750);
    expect(built.jointCountLabel).toBe('1 стык');
    expect(built.overlapCountLabel).toBe('1 волна наложилась');
  });

  it('стыков нет — счётчика нет, снизу остаётся строка состояния', () => {
    const built = V4.buildV4FromWave({
      waveHistory: [{ id: 'a', startMin: 600, endMin: 800, isActive: true }]
    }, 700);
    expect(built.jointCountLabel).toBeNull();
    expect(built.underWaveLabel).toBe('под волной 13:20');
  });

  it('текущая волна: строка называет время её конца', () => {
    const built = V4.buildV4FromWave({
      waveHistory: [{ id: 'a', startMin: 600, endMin: 800, isActive: true }]
    }, 700);
    expect(built.underWaveLabel).toBe('под волной 13:20');
  });

  it('все волны закрыты — вместо неё покой', () => {
    const built = V4.buildV4FromWave({
      waveHistory: [{ id: 'a', startMin: 600, endMin: 700 }]
    }, 900);
    expect(built.underWaveLabel).toMatch(/^покой /);
    expect(built.scheme.figures[0].opacity).toBe(0.45);
  });
});

describe('схема волн · это не таймлайн', () => {
  it('ось времени и метка «сейчас» в схеме не рисуются', () => {
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const start = ui.indexOf('function InsulinWaveDaySvg');
    const end = ui.indexOf('function InsulinWaveCurrentSvg');
    const body = ui.slice(start, end);
    expect(body).not.toContain('InsulinWaveBaseline');
    expect(body).not.toContain('nowX');
  });

  it('в видах 28 и 29 нет базовой линии, а обводка — незамкнутая 1,2 px', () => {
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const start = ui.indexOf('function InsulinWaveCurrentSvg');
    const end = ui.indexOf('function InsulinWaveDayBar');
    const body = ui.slice(start, end);
    expect(body).not.toContain('InsulinWaveBaseline');
    expect(body).toContain('strokeWidth: 1.2');
    expect(body).toContain('activeWaveOpenPath');
  });

  it('незамкнутый путь действительно без Z', () => {
    const V4 = load();
    expect(V4.fullWavePath().trim().endsWith('Z')).toBe(true);
    expect(V4.openWavePath().trim().endsWith('Z')).toBe(false);
  });
});
