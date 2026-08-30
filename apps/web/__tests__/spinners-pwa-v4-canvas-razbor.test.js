// Кадры знака ожидания и слоя обновления против раздела канваса «Разбор кадров
// · элемент за элементом» (пакет 30 августа).
//
// Обе зоны сошлись без правок кода — сверка это фиксирует, чтобы следующая
// правка не увела числа молча. Спорные места решает именованная строка своей
// зоны; они перечислены в EXCEPTIONS.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const PACK = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const BOOT_CSS = path.resolve(__dirname, '../styles/heys-boot-mark.css');
const COMPONENTS_CSS = path.resolve(__dirname, '../styles/heys-components.css');

const W = '.heys-wait-mark';
const B = '.heys-boot-mark';

const EXCEPTIONS = new Map([
  // Отступ 18 от круга до заголовка задан якорем `.heys-boot-mark__sign`, а не
  // самим заголовком: у заголовка margin-top: 0, и это записано у правила.
  ['Спиннер · не удалось запустить · 3|marginTop', 'отступ от круга держит якорь __sign'],
  // Строка «вид подписи»: «заголовок 15 px/700… причина 12 px/500 тоном 50 %»,
  // и «ступени не меняют геометрию». Кадр отказа набирает 17/12,5 — контракт
  // старше кадра, у соседнего элемента это уже записано в CSS.
  ['Спиннер · не удалось запустить · 3|fontSize', 'строка «вид подписи»: заголовок 15'],
  ['Спиннер · не удалось запустить · 4|fontSize', 'строка «вид подписи»: причина 12'],
  // Строка «вид страховки»: подложка — «--scrim без прозрачности, 90 %», а
  // --scrim песочного набора это rgba(42,26,12,…). Кадр печатает литерал
  // rgba(13,11,8,.9) — тон другого набора; верна строка со своей ролью.
  ['Требуется обновление · с версией · 6|background', 'строка «вид страховки»: --scrim набора под 90 %'],
]);

const CAPTION = [
  [1, `${W}--screen`, ['align']],
  [2, `${W}__disc`, ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [3, [`${W}--screen`, `${W}__title`], ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [4, `${W}__text`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

const OK = [[2, [`${W}__disc`, `${W}.is-ok ${W}__disc`], ['width', 'height', 'radius', 'background']]];
const FAIL = [[2, [`${W}__disc`, `${W}.is-fail ${W}__disc`], ['width', 'height', 'radius', 'background']]];

const BOOT_FAIL = [
  [2, [`${B}__disc`, `${B}.is-fail ${B}__disc`], ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [3, [B, `${B}__title`], ['fontWeight', 'textAlign']],
  [4, [B, `${B}__text`], ['fontWeight', 'textAlign']],
];

describe('«Знак ожидания» и «Обновление» · разбор кадров канваса', () => {
  const spinners = readRazbor(fs.readFileSync(path.join(PACK, 'spinners.v4.dc.html'), 'utf8'));
  const pwa = readRazbor(fs.readFileSync(path.join(PACK, 'pwa-update.v4.dc.html'), 'utf8'));
  const boot = readRules(fs.readFileSync(BOOT_CSS, 'utf8'));
  const components = readRules(fs.readFileSync(COMPONENTS_CSS, 'utf8'));

  it('кадр «Спиннер · с подписью» совпадает со знаком ожидания', () => {
    expect(compare({ razbor: spinners, rules: boot, frame: 'Спиннер · с подписью', pairs: CAPTION })).toEqual([]);
  });

  it('круг знака меняет только подложку: успех — шалфейная, отказ — тинт', () => {
    expect(compare({ razbor: spinners, rules: boot, frame: 'Спиннер · успех', pairs: OK })).toEqual([]);
    expect(compare({ razbor: spinners, rules: boot, frame: 'Спиннер · ошибка', pairs: FAIL })).toEqual([]);
  });

  it('кадр «Спиннер · не удалось запустить» совпадает с экраном холодного старта', () => {
    expect(compare({
      razbor: spinners, rules: boot, frame: 'Спиннер · не удалось запустить', pairs: BOOT_FAIL,
    })).toEqual([]);
  });

  // Строка «вид подписи» одна на все ступени: «ступени не меняют геометрию».
  it('подпись знака одного кегля на всех ступенях', () => {
    expect(boot.get(`${B}__title`).font).toMatch(/700 15px\/1\.35/);
    expect(boot.get(`${B}__slow-text`).font).toMatch(/700 15px\/1\.35/);
    expect(boot.get(`${B}__text`).font).toMatch(/500 12px\/1\.5/);
  });

  // Строка «вид страховки»: подложка плотнее и без блюра, тон — --scrim набора
  // под 90 %. Кадр печатает литерал другого набора; верна строка.
  it('подложка страховки — тон набора под 90 % и без блюра', () => {
    const prompt = components.get('.heys-update-prompt__backdrop');
    expect(prompt.background).toBe('rgba(42, 26, 12, 0.9)');
    expect(prompt['backdrop-filter']).toBeUndefined();
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(4);
  });
});
