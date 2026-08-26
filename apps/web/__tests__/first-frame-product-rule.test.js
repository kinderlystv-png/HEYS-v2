// Смоук строки «производительность · правило продукта» (home-widgets.v4.dc.html):
// «первый кадр экрана рисуется из локальных данных, не дожидаясь сети <…> Место
// под тяжёлое содержимое держится с первого кадра: график, кривая и кольцо
// занимают свою высоту сразу — заливкой поверхности без содержимого, — и при
// появлении данных ничего ниже не сдвигается».
//
// Руками не поймать: на быстрой сети держатель живёт доли секунды, а дефект
// виден только как «экран дёрнулся» — это списывают на телефон. Проверяем
// механизм: спиннера в плитке нет, держатель занимает высоту готового
// элемента, раскладка берётся из кеша без ожидания сети.
import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const UI = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const VARIANTS = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const DASH = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

/** Значение свойства в правиле — читаем деревом, а не строкой. */
function decl(css, selector, prop) {
  const root = postcss.parse(css, { from: 'x' });
  let out = null;
  root.walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    rule.walkDecls(prop, (d) => { out = d.value; });
  });
  return out;
}

describe('производительность · правило продукта — первый кадр', () => {
  it('в плитке нет знака ожидания: место занимает держатель', () => {
    const at = UI.indexOf("className: 'widget__loading v4-place-holder'");
    expect(at, 'плитка не использует держатель').toBeGreaterThan(-1);
    // Спиннера внутри плитки быть не должно — знак ожидания живёт на экране,
    // а не в тяжёлом элементе (spinners.v4.dc.html владеет его порогами).
    expect(UI).not.toMatch(/widget__loading[\s\S]{0,200}WaitMark/);
    expect(UI).not.toMatch(/widget__loading[\s\S]{0,200}heys-wait-mark/);
  });

  it('держатель плитки заполняет её, а не задаёт свою высоту', () => {
    // Высоту плитки даёт сетка (--widget-row-height), поэтому при приходе
    // данных ничего ниже не сдвигается.
    expect(decl(DASH, '.widget__loading', 'flex')).toBe('1');
    expect(decl(DASH, '.widget__loading', 'border-radius')).toBe('inherit');
    expect(DASH).toContain('--widget-row-height: 64px;');
  });

  it('держатель волны в разборе равен готовому элементу до пикселя', () => {
    const holder = decl(DASH, '.widget-bd-sheet__wave-placeholder', 'height');
    const ready = decl(DASH, '.widget-bd-sheet__wave-day', 'height');
    expect(holder).toBeTruthy();
    expect(ready).toBeTruthy();
    expect(holder).toBe(ready);
  });

  it('держатели — ровная заливка, класс общий', () => {
    expect(UI).toContain('v4-place-holder');
    expect(VARIANTS).toContain('v4-place-holder');
    const roles = fs.readFileSync(
      path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
      'utf8',
    );
    expect(decl(roles, '.v4-place-holder', 'animation')).toBe('none');
  });

  it('своих чисел порога ожидания у Главной нет — они в зоне знака', () => {
    // Строка прямо говорит: «Порог знака ожидания и вся его шкала —
    // spinners.v4.dc.html, раздел „Пороги“; чисел здесь нет».
    expect(DASH).not.toMatch(/--widget-wait-(delay|threshold)/);
    expect(UI).not.toMatch(/WAIT_(SHOW|LABEL|REASON)_MS\s*=/);
  });
});
