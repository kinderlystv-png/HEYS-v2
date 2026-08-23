import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const variantsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

/** Раскладывает литерал CATALOG на пары «тип виджета → его кусок исходника». */
function catalogBlocksFromSource(src) {
  const start = src.indexOf('const CATALOG = {');
  const end = src.indexOf('\n  };', start);
  if (start < 0 || end < 0) throw new Error('CATALOG literal not found in heys_widgets_variants_v4.js');
  const body = src.slice(start, end);
  const blocks = [];
  const typeRe = /^ {4}(\w+): \[/gm;
  let match;
  const starts = [];
  while ((match = typeRe.exec(body)) !== null) starts.push([match[1], match.index]);
  starts.forEach(([widgetType, at], i) => {
    const until = i + 1 < starts.length ? starts[i + 1][1] : body.length;
    blocks.push([widgetType, body.slice(at, until)]);
  });
  if (!blocks.length) throw new Error('CATALOG has no widget types');
  return blocks;
}

function countCatalogVariantsFromSource(src) {
  const matches = src.match(/\{\s*id:\s*'[^']+'/g) || [];
  return matches.length;
}

describe('widget variants v4', () => {
  it('каталог — 59 видов: шесть виджетов пакета 22 августа + number_week для веса', () => {
    // 43 + клетчатка 3, белок 3, окно до сна 2, качество еды 3, ритм приёмов 2,
    // готовность ко сну 2, number_week (вес дефолт) — кадры 37–51 канваса + home-widgets.
    expect(countCatalogVariantsFromSource(variantsSrc)).toBe(59);
    expect(variantsSrc).toContain("id: 'number_week', title: 'Число и неделя'");
    // Шаги переписаны 22 августа: оба вида — тренды, вида «сейчас» нет.
    expect(variantsSrc).toContain("id: 'week', title: 'Неделя', subtitle: 'семь столбиков и среднее'");
    expect(variantsSrc).toContain('HEYS.Widgets.VariantsV4');
    expect(variantsSrc).toContain('useWidgetVariantTile');
    expect(variantsSrc).toContain('getSheetCatalog');
    expect(variantsSrc).toContain('subscribeVariantHoldHint');
  });

  it('getActiveVariant — дефолт по флагу isDefault, не по порядку', () => {
    expect(variantsSrc).toContain('function getActiveVariant(widget, widgetType)');
    expect(variantsSrc).toContain('return found || getDefaultVariant(widgetType)');
    // Дефолт задаётся флагом isDefault, а не порядком карточек: порядок в шторке
    // принадлежит канвасу. Риск-радар открывается «Шкалой» (решение владельца).
    expect(variantsSrc).toContain('function getDefaultVariant(widgetType)');
    expect(variantsSrc).toContain("id: 'scale', title: 'Шкала', subtitle: 'уровень из четырёх и что его поднимет', size: '2x2', isDefault: true");
    // Флаг не больше одного на тип виджета — getDefaultVariant берёт первый
    // найденный, и два флага в одном типе делают дефолт лотереей. Разные типы
    // держат свои дефолты независимо: у crashRisk это «График».
    const withTwoDefaults = catalogBlocksFromSource(variantsSrc)
      .filter(([, block]) => block.split('isDefault: true').length - 1 > 1)
      .map(([widgetType]) => widgetType);
    expect(withTwoDefaults).toEqual([]);
  });

  it('карточка листа рисуется в своём формате, а не в формате плитки на экране', () => {
    // Иначе «Семь дней» (2×2) показывался бы строкой 2×1 текущей плитки, и
    // человек выбирал бы картинку, которая не совпадёт с результатом
    // (канвас home-widgets v4, строки 27 и 28).
    const shell = uiSrc.slice(uiSrc.indexOf('function WidgetV4VariantShell'), uiSrc.indexOf('function WidgetV4VariantShell') + 1800);
    expect(shell).toContain('const size = meta?.size || widget?.size');
    expect(shell).toContain('widget: previewWidget');
    expect(shell).toMatch(/cols: sizeInfo\?\.cols/);

    // Тела видов обязаны брать виджет из meta, иначе подмена формата не дойдёт.
    const bodyWidgetExprs = [...uiSrc.matchAll(/React\.createElement\(\w+VariantBody, \{[^}]*?widget: ([^,]+),/gs)]
      .map((m) => m[1].trim());
    expect(bodyWidgetExprs.length).toBeGreaterThanOrEqual(10);
    expect(bodyWidgetExprs.every((expr) => expr === 'meta?.widget || widget')).toBe(true);
  });

  it('превью в листе носит классы настоящей плитки', () => {
    const sheet = variantsSrc.slice(variantsSrc.indexOf('const previewClass = ['), variantsSrc.indexOf('const previewClass = [') + 400);
    expect(sheet).toContain("'widget',");
    expect(sheet).toContain('`widget--${item.size}`');
    expect(sheet).toContain('`widget--${widgetType}`');
  });

  it('registry — displayVariant через applyCatalogToRegistry', () => {
    expect(variantsSrc).toContain('applyCatalogToRegistry');
    expect(variantsSrc).toContain('displayVariant: dv');
  });

  it('UI — shell и варианты на плитках', () => {
    expect(uiSrc).toContain('WidgetV4VariantShell');
    expect(uiSrc).not.toContain('widget-v4-variant-num');
    expect(uiSrc).toContain('CrashRiskDynamicsVariantTile');
    expect(uiSrc).toContain('WeightWidgetV4_2x2');
    expect(uiSrc).toContain('widgetV4NotifyWeightSparkDrawComplete');
  });

  it('CSS — tile motion, sheet preview sizes', () => {
    expect(cssSrc).not.toContain('.widget-v4-variant-num');
    expect(cssSrc).toContain('.widget-v4-tile--holding');
    expect(cssSrc).toContain('.widget-wd-sheet__preview--1x1');
    expect(cssSrc).toContain('.widget-wd-sheet__preview--3x2');
    expect(cssSrc).toContain('.widget-v4-tile--bg-sand');
    expect(cssSrc).toMatch(/\.widget-v4-tile[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
    expect(cssSrc).toContain('.widget-v4-tile > *');
    expect(uiSrc).toContain('widget-v4-hold-hint__pill');
    expect(cssSrc).toContain('.widget-v4-hold-hint__pill');
    expect(cssSrc).toMatch(/\.widget-calories__hero-bar-wrap[\s\S]*margin-top:\s*auto/);
  });
});
