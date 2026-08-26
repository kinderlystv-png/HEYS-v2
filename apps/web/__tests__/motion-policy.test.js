import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const policySrc = fs.readFileSync(path.join(WEB_DIR, 'heys_motion_policy_v1.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_day_handlers.js'), 'utf8');
const widgetsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const waterCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/400-water-and-hydration.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
const bundleConfig = fs.readFileSync(
  path.resolve(WEB_DIR, '../../scripts/legacy-bundle-config.mjs'),
  'utf8'
);

function reduceMotionBlocks(css) {
  return css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
}

/** Правила блока: селектор → тело. Обёртку `@media … {` снимаем, иначе она
 *  сама читается как первый селектор и все пары съезжают на одну. */
function ruleEntries(block) {
  const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
  return [...inner.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    body,
  }));
}

// Прежняя версия искала `animation: none` где угодно в блоке, где встретилось
// `.widget-water` — и потому запрещала гасить что угодно рядом, включая блики
// на псевдоэлементе. Смотрим на правила поимённо.
const FUNCTIONAL_WATER = /\.widget-water(__fill|__drop|__ripple|--v4)(?!.*::before)/;

function blockKillsFunctionalWater(block) {
  return ruleEntries(block).some(
    ({ selector, body }) =>
      FUNCTIONAL_WATER.test(selector) &&
      !/::before|::after/.test(selector) &&
      (/display:\s*none/.test(body) || /animation:\s*none/.test(body)),
  );
}

describe('motion policy — глобальные правила', () => {
  it('модуль HEYS.motion в boot-core', () => {
    expect(bundleConfig).toContain("'heys_motion_policy_v1.js'");
    expect(bundleConfig.indexOf('heys_motion_policy_v1.js'))
      .toBeLessThan(bundleConfig.indexOf('heys_audio_v1.js'));
    expect(policySrc).toContain('FUNCTIONAL_ROOT_CLASS');
    expect(policySrc).toContain("FUNCTIONAL_ROOT_CLASS = 'animate-always'");
    expect(policySrc).toContain('functionalAnimationsEnabled');
    expect(policySrc).toContain('decorativeAnimationsEnabled');
    expect(policySrc).toContain('withFunctionalClass');
  });

  it('виджеты спрашивают настройку, а не functionalAnimationsEnabled', () => {
    // Проверка была неверной по построению: widgetMotionDisabled() звал
    // functionalAnimationsEnabled(), который по контракту возвращает true
    // всегда — значит функция не возвращала true ни при какой настройке ОС,
    // и интерполяция чисел/колец/полос шла в JS даже при «уменьшить движение».
    // Гейт замораживал именно это. Канвас home-widgets, строки «без анимации»
    // и «меньше движения»: при настройке значения стоят на месте, а CSS-гашение
    // JS-интерполяцию не останавливает — решение принимается в JS.
    expect(uiSrc).toContain('HEYS.motion : null');
    expect(uiSrc).toMatch(/function widgetMotionDisabled\(\)[\s\S]{0,400}policy\.prefersReducedMotion\(\)/);
    expect(uiSrc).not.toContain('HEYS.motion?.functionalAnimationsEnabled');
  });

  it('сетка Главной не выведена из-под настройки флагом', () => {
    // Флаг на корне .widgets-grid стоял безусловно (8de305b9, 11.2025 — обход
    // ради отрисовки спарклайнов) и укрывал всё поддерево. Спарклайны носят
    // свой animate-always на .sparkline-svg, поэтому обход больше не нужен.
    expect(uiSrc).not.toMatch(/widgets-grid animate-always/);
    expect(uiSrc).toMatch(/className: `widgets-grid \$\{isEditMode/);
    // Guard `:not(.animate-always)` в правиле гашения сетки был мёртвым:
    // флаг стоял всегда. Вернуть guard — значит снова выключить правило молча.
    expect(widgetsCss).not.toMatch(/\.widgets-grid:not\(\.animate-always\)/);
  });

  it('плитка Главной держит v4-place-holder без знака ожидания', () => {
    // Контракт «держатель места»: ровная заливка --c1, без спиннера внутри плитки.
    // Знак ожидания остаётся на уровне экрана (#heys-widgets-live), не в каждой плитке.
    expect(uiSrc).not.toContain('widget__spinner');
    expect(uiSrc).toMatch(/className:\s*'widget__loading v4-place-holder'/);
    expect(uiSrc).not.toMatch(/className:\s*'widget__loading'[\s\S]{0,400}?WaitMark/);
  });

  it('вода — звук при reduced-motion сразу, плитка без reduce-ветки', () => {
    expect(handlersSrc).toMatch(/prefers-reduced-motion: reduce/);
    expect(handlersSrc).toMatch(/waterTileIsVisible\(\) && !reducedMotion/);
    expect(handlersSrc).toContain('MOTION_POLICY.md');
  });

  it('глобальный killer ссылается на политику', () => {
    expect(componentsCss).toContain('MOTION_POLICY.md');
    expect(componentsCss).toContain('.animate-always');
  });

  it('функциональная вода остаётся, декоративные блики гасятся', () => {
    expect(uiSrc).toContain("className: 'widget-water__fill animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");

    // Прежняя проверка запрещала любое гашение в reduce-блоке, где встретился
    // `.widget-water`, и отдельно запрещала гашение `.water-column__fill::before`.
    // Она была неверной: под запрет попадал не только функциональный ярус
    // (капля, круг, подъём уровня — решение владельца), но и блики поверхности,
    // которых это решение никогда не касалось. Автор ac25bb47 (19.08) писал
    // прямо: «блики останавливаются». Через день 38c2f763 снёс блок гашения
    // воды целиком, блики уехали прицепом и в сообщении коммита не упомянуты —
    // отдельного решения оставить их нет ни в одном коммите. Гейт заморозил
    // случайность. Теперь проверяем по существу: функциональное живо, декор гаснет.
    const widgetBlocks = reduceMotionBlocks(widgetsCss);
    const waterBlocks = reduceMotionBlocks(waterCss);
    expect(widgetBlocks.some(blockKillsFunctionalWater)).toBe(false);
    expect(waterBlocks.some(blockKillsFunctionalWater)).toBe(false);
  });

  it('бесконечные петли бликов гасятся адресно, без снятия флага с родителя', () => {
    // Флаг стоит на .widget-water__fill и на корне .water-column, а
    // `:not(.animate-always *)` укрывает всё поддерево, включая псевдоэлементы.
    // Снять флаг с родителя нельзя — вместе с бликами встал бы подъём уровня.
    // Поэтому нужно адресное правило по самому псевдоэлементу, и с !important:
    // базовое правило бликов в 730 стоит ниже по файлу и при равной
    // специфичности выиграло бы порядком.
    const widgetBlocks = reduceMotionBlocks(widgetsCss);
    const waterBlocks = reduceMotionBlocks(waterCss);
    const killsShine = (blocks, selector) =>
      blocks.some((block) =>
        new RegExp(`${selector}\\s*\\{[^}]*animation:\\s*none\\s*!important`).test(block),
      );
    expect(killsShine(widgetBlocks, '\\.widget-water__fill::before')).toBe(true);
    expect(killsShine(waterBlocks, '\\.water-column__fill::before')).toBe(true);

    // Флаг с родителей не снят — подъём уровня и капля остаются решением.
    expect(widgetsCss).toContain('.widget-water--v4 .widget-water__fill');
    expect(handlersSrc).toContain("col.className = 'water-column animate-always'");
  });
});
