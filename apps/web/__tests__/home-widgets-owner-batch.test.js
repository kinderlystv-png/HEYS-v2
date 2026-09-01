import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const dateSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_date_state_v1.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const dataSrc = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
const nutritionCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/732-ui-v4-nutrition.css'), 'utf8');
const widgetsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

describe('home-widgets owner batch: дата, куратор, вода, онбординг', () => {
  it('возврат из фона переносит «сегодня» при смене суток', () => {
    expect(dateSrc).toContain('visibilitychange');
    expect(dateSrc).toContain('snap.selected === snap.today');
    expect(dateSrc).toContain('setSelectedDate(today)');
  });

  it('куратор не входит в расстановку и не видит FAB', () => {
    expect(coreSrc).toContain('isCuratorSession?.()');
    expect(uiSrc).toContain('isWidgetsCuratorReadOnly()');
    expect(uiSrc).toContain('if (!isMobile || isWidgetsCuratorReadOnly()) return null');
    expect(uiSrc).toContain('disabled: isWidgetV4EditMode() || isWidgetsCuratorReadOnly()');
  });

  it('вода считает час по локальному времени устройства', () => {
    expect(dataSrc).toContain('_deviceNowMinutes()');
    expect(dataSrc).not.toContain("timeZone: 'Europe/Moscow'");
    expect(dataSrc).not.toContain('timeZone: "Europe/Moscow"');
  });

  it('новые короткие шапки воды и недельного долга не выталкивают данные из 2×1', () => {
    const rhythm = uiSrc.slice(
      uiSrc.indexOf("if (variantId === 'rhythm')"),
      uiSrc.indexOf('// 2x2 — Оптимальный layout', uiSrc.indexOf("if (variantId === 'rhythm')")),
    );
    const debt = uiSrc.slice(
      uiSrc.indexOf("if (variantId === 'week_debt')"),
      uiSrc.indexOf("if (variantId === 'window')"),
    );

    expect(rhythm).toContain("v4Kicker('Вода')");
    expect(rhythm).not.toContain('v4Kicker(`Вода ·');
    expect(rhythm).toContain("className: 'widget-v4-water-rhythm__body'");
    expect(rhythm).toContain('formatRuDecimal(drunk / 1000, 1)');
    expect(debt).toContain("v4Kicker('Недосып · 7 дней')");
    expect(debt).not.toContain('норма ${formatRuDecimal(target, 1)}');
    expect(debt).toContain("formatRuUnit(formatRuDecimal(target, 1), 'ч')");
  });

  it('подсказка долгого тапа после третьего открытия', () => {
    expect(uiSrc).toContain('homeOpensCount');
    expect(uiSrc).toContain('longPressHintShown');
    expect(uiSrc).toContain('widgetsHoldHintShown');
    expect(uiSrc).toContain('renderLongPressHintLayer');
    expect(uiSrc).toContain('Задержите палец на плитке');
    expect(uiSrc).not.toContain('widgets-tab__hold-onboarding');
    expect(widgetsCss).toContain('.widgets-longpress-hint');
  });

  it('чипы «Питания» 30 px без припуска', () => {
    expect(nutritionCss).toMatch(/\.nutrition-v4-chip[\s\S]*?min-height:\s*30px/);
    expect(nutritionCss).toMatch(/\.nutrition-v4-chip::after[\s\S]*?content:\s*none/);
  });

  it('копирайт плиток: без emoji в insulin 2x2/micro, heatmap title локализован', () => {
    expect(uiSrc).toContain('formatWidgetHeatmapDayTitle');
    expect(uiSrc).toContain('widget-insulin__micro-status');
    expect(uiSrc).not.toMatch(/widget-insulin--2x2[\s\S]{0,400}info\.emoji/);
  });

  it('нижняя граница правки: выход при одном включённом без скрытых закрывает карточку', () => {
    expect(uiSrc).toMatch(/enabledCount === 1 && hiddenOrdered\.length === 0[\s\S]{0,120}closeSheet\(\)/);
    expect(uiSrc).toContain('enabledCount > 1 || hiddenOrdered.length > 0 || editing');
  });
});
