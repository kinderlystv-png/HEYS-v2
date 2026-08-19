import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const variantsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

function countCatalogVariantsFromSource(src) {
  const matches = src.match(/\{\s*id:\s*'[^']+'/g) || [];
  return matches.length;
}

describe('widget variants v4', () => {
  it('каталог — 41 вариант', () => {
    expect(countCatalogVariantsFromSource(variantsSrc)).toBe(41);
    expect(variantsSrc).toContain('HEYS.Widgets.VariantsV4');
    expect(variantsSrc).toContain('useWidgetVariantTile');
    expect(variantsSrc).toContain('getSheetCatalog');
    expect(variantsSrc).toContain('subscribeVariantHoldHint');
  });

  it('getActiveVariant — дефолт первого id в каталоге', () => {
    expect(variantsSrc).toContain('function getActiveVariant(widget, widgetType)');
    expect(variantsSrc).toContain('return found || getDefaultVariant(widgetType)');
    // Дефолт задаётся флагом isDefault, а не порядком карточек: порядок в шторке
    // принадлежит канвасу. Риск-радар открывается «Шкалой» (решение владельца).
    expect(variantsSrc).toContain('function getDefaultVariant(widgetType)');
    expect(variantsSrc).toContain("id: 'scale', title: 'Шкала', subtitle: 'уровень из четырёх и что его поднимет', size: '2x2', isDefault: true");
    // Флаг ровно один на весь каталог — иначе дефолт становится лотереей.
    expect(variantsSrc.split('isDefault: true').length - 1).toBe(1);
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
