// Контракт home-widgets «держатель места · правило продукта»:
// заливка --c1 без пульсации/скелетона/спиннера; проявление данных 200 ms.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(webRoot, rel), 'utf8');
}

describe('v4 держатель места — CSS и контракт', () => {
  const palette = read('styles/modules/002-ui-v4-palette-roles.css');
  const critical = read('styles/critical.css');
  const widgetsCss = read('styles/modules/730-widgets-dashboard.css');

  it('общий класс: --v4-c1, без animation, reveal 200ms', () => {
    expect(palette).toMatch(/\.v4-place-holder\s*\{[\s\S]*?background:\s*var\(--v4-c1/);
    expect(palette).toMatch(/\.v4-place-holder\s*\{[\s\S]*?animation:\s*none/);
    expect(palette).toMatch(/\.v4-place-reveal\s*\{[\s\S]*?v4-place-reveal-in\s+200ms/);
  });

  it('critical.css: tab skeleton без shimmer 1,65s', () => {
    expect(critical).not.toMatch(/heys-tab-skeleton-shimmer\s+1\.65s/);
    expect(critical).toMatch(/\.heys-tab-skeleton__line[\s\S]*?background:\s*var\(--v4-c1/);
    expect(critical).toMatch(/\.heys-tab-skeleton__line[\s\S]*?animation:\s*none/);
  });

  it('730-widgets: cascade holder и без pulse 2s на latest', () => {
    expect(widgetsCss).toContain('.widget-cascade__holder');
    expect(widgetsCss).not.toMatch(/widget-cascade-pulse\s+2s/);
    expect(widgetsCss).toMatch(/\.widget-bd-sheet__wave-placeholder\s*\{/);
  });
});

describe('v4 держатель места — product callers', () => {
  const widgetsUi = read('heys_widgets_ui_v1.js');
  const variants = read('heys_widgets_variants_v4.js');
  const pickers = read('heys_day_pickers.js');
  const diary = read('heys_day_diary_section.js');

  it('виджет Главной: v4-place-holder вместо WaitMark внутри плитки', () => {
    expect(widgetsUi).toMatch(/className:\s*'widget__loading v4-place-holder'/);
    expect(widgetsUi).not.toMatch(/className:\s*'widget__loading'[\s\S]{0,400}?WaitMark/);
  });

  it('каскад без данных: holder bar, с данными — v4-place-reveal', () => {
    expect(widgetsUi).toContain("className: 'widget-cascade__holder v4-place-holder'");
    expect(widgetsUi).not.toContain('widget-cascade__dot--placeholder');
    expect(widgetsUi).toContain("hasData ? 'v4-place-reveal' : ''");
  });

  it('разбор · волна и дневник ждут модуль через v4-place-holder', () => {
    expect(variants).toContain('widget-bd-sheet__wave-placeholder v4-place-holder');
    expect(pickers).toContain('date-picker-trigger--placeholder v4-place-holder');
    expect(diary).toContain("deferred-card-slot deferred-card-slot--pending' + (minHeightPx ? ' v4-place-holder' : '')");
  });
});
