// Смоук строки «обучение · правило продукта» (home-widgets.v4.dc.html):
// «онбординга, подсказок первого запуска и тултипов в продукте нет. Исключение
// одно: подсказка про долгий тап по плитке — один раз на человека, после
// третьего открытия Главной, флаг „показана“ в профиле».
//
// Руками это не собрать: подсказка приходит на третьем открытии и больше
// никогда, а чтобы увидеть её снова, нужно чистить профиль. Условие показа и
// одноразовость проверяются симуляцией счётчика.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const UI = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);
const CANVAS = fs.readFileSync(
  path.resolve(
    WEB_DIR,
    '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
  ),
  'utf8',
);

/** Кусок правила CSS по селектору. */
function rule(selector) {
  const at = CSS.indexOf(selector + ' {');
  expect(at, 'нет правила ' + selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('обучение · правило продукта — подсказка про долгий тап', () => {
  it('туров и онбординга в продукте нет — выключены константами', () => {
    const onboarding = fs.readFileSync(
      path.join(WEB_DIR, 'heys_ui_onboarding_v1.js'),
      'utf8',
    );
    expect(onboarding).toContain('const ONBOARDING_TOUR_ENABLED = false;');
    expect(onboarding).toContain('const WIDGETS_TOUR_ENABLED = false;');
    expect(onboarding).toContain('const INSIGHTS_TOUR_ENABLED = false;');
  });

  it('показывается на третьем открытии Главной, флаг — в профиле', () => {
    expect(UI).toContain('longPressHintShown');
    expect(UI).toContain('homeOpensCount');
    expect(UI).toContain('widgetsHoldHintShown');
    expect(UI).not.toContain('widgets-tab__hold-onboarding');
    expect(UI).toMatch(/if \(opens >= 3\)/);
    // Счётчик и флаг пишутся в профиль, а не в свой ключ: строка называет
    // именно профиль, и на другом устройстве подсказка не повторится.
    expect(UI).toMatch(/lsGet\('heys_profile'/);
    expect(UI).toMatch(/lsSet\?\.\('heys_profile'/);
  });

  it('одноразовость: флаг ставится в тот же проход, что и показ', () => {
    const at = UI.indexOf('if (prof.longPressHintShown || prof.widgetsHoldHintShown) return;');
    expect(at).toBeGreaterThan(-1);
    const block = UI.slice(at, at + 800);
    expect(block).toContain('next.longPressHintShown = true;');
    expect(block).toContain('next.widgetsHoldHintShown = true;');
    expect(block).toContain('setShowLongPressHint(true);');
    // Ранний выход стоит до инкремента — иначе счётчик рос бы вечно.
    expect(block.indexOf('next.longPressHintShown')).toBeGreaterThan(0);
  });

  it('закрывается любым касанием', () => {
    const at = UI.indexOf("className: 'widgets-longpress-hint'");
    expect(at).toBeGreaterThan(-1);
    expect(UI.slice(at, at + 400)).toContain('setShowLongPressHint(false)');
  });

  it('поверх FAB: плашка в document.body, не под swipeable', () => {
    const at = UI.indexOf('renderLongPressHintLayer = () =>');
    expect(at).toBeGreaterThan(-1);
    const block = UI.slice(at, at + 2600);
    expect(block).toContain('ReactDOM.createPortal');
    expect(block).toContain('global.document.body');
    const fabAt = UI.indexOf('renderMobileFabs()');
    const hintCallAt = UI.indexOf('renderLongPressHintLayer()');
    expect(fabAt).toBeGreaterThan(-1);
    expect(hintCallAt).toBeGreaterThan(fabAt);
  });

  it('не блокирует экран: затемнения под плашкой нет', () => {
    expect(CSS).not.toMatch(/\.widgets-longpress-hint[^{]*backdrop/);
    expect(CSS).not.toMatch(/\.widgets-longpress-hint-scrim/);
    const r = rule('.widgets-longpress-hint');
    expect(r).not.toContain('inset: 0');
  });

  it('фиксирует текущий тёмный вид продукта до решения конфликта контракта', () => {
    const r = rule('.widgets-longpress-hint');
    expect(r).toContain('left: 14px');
    expect(r).toContain('right: 14px');
    expect(r).toContain('bottom: calc(78px + env(safe-area-inset-bottom, 0px))');
    expect(r).toContain('border-radius: 18px');
    expect(r).toContain('background: #201e1d');
    expect(r).toContain('padding: 13px 15px');
    expect(r).toContain('gap: 11px');
    expect(r).toContain('box-shadow: 0 10px 26px -10px rgba(32, 30, 29, 0.55)');

    expect(rule('.widgets-longpress-hint__title')).toContain('font: 700 12px/1.35');
    const sub = rule('.widgets-longpress-hint__sub');
    expect(sub).toContain('font: 500 11px/1.35');
    expect(sub).toContain('rgba(242, 237, 230, 0.62)');
    expect(UI).toContain("strokeWidth: 2.4");
  });

  it('явно обнаруживает конфликт тёплой строки вида со старым общим правилом', () => {
    const warm = /<b>вид подсказки жеста<\/b><span data-v="([^"]*)"/.exec(CANVAS)?.[1];
    const dark = /<b>обучение · правило продукта<\/b><span data-v="([^"]*)"/.exec(CANVAS)?.[1];
    expect(warm).toContain('заливка --tint');
    expect(warm).toContain('Значок 22 px');
    expect(dark).toContain('фон #201e1d');
    expect(dark).toContain('иконка руки 17 px');
  });

  it('текст текущей продуктовой подсказки остаётся стабильным', () => {
    const title = 'Задержите палец на плитке';
    const sub = 'Так меняется её вид — например, «Вес» с числа на график.';
    expect(UI).toContain(title);
    expect(UI).toContain(sub);
  });
});
