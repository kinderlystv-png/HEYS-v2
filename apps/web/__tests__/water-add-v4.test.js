import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_day_handlers.js'), 'utf8');
const widgetsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const waterCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/400-water-and-hydration.css'), 'utf8');

describe('добавление воды — канвас water-add v4, ветка В₃', () => {
  it('полноэкранной заливки и летящей капли больше нет', () => {
    expect(handlersSrc).not.toContain('water-screen-fill');
    expect(handlersSrc).not.toContain('showScreenFill');
    expect(handlersSrc).not.toContain('showSourceBadge');
    expect(handlersSrc).not.toContain('showSourceDrop');
    expect(handlersSrc).not.toContain('pulseWaterWidget');
    expect(widgetsCss).not.toContain('.water-screen-fill');
    expect(widgetsCss).not.toContain('.widget--water-pulse');
    expect(uiSrc).not.toContain('showScreenFill');
  });

  it('плитка отвечает сама, когда её видно не меньше чем наполовину', () => {
    expect(uiSrc).toContain('WATER_TILE_VISIBLE_RATIO = 0.5');
    expect(uiSrc).toContain('function isWaterTileVisible');
    expect(uiSrc).toContain('function useWaterAddPulse');
    expect(handlersSrc).toContain('WATER_TILE_VISIBLE_RATIO = 0.5');
    expect(handlersSrc).toContain('function waterTileIsVisible');
    // Один ответ на одно действие: плитка видна — столбик молчит.
    expect(handlersSrc).toMatch(/if \(waterTileIsVisible\(\)\) return;/);
  });

  it('капля, круг, уровень и число — параметры из спецификации', () => {
    expect(uiSrc).toContain("className: 'widget-water__drop'");
    expect(uiSrc).toContain("className: 'widget-water__ripple'");
    expect(uiSrc).toContain('--water-drop-travel');
    // капля 6×6, падение 220 мс ease-in, вытяжение до 1,4
    expect(widgetsCss).toMatch(/\.widget-water__drop \{[\s\S]*?width: 6px;[\s\S]*?animation: widgetWaterDrop 240ms ease-in/);
    expect(widgetsCss).toContain('scaleY(1.4)');
    // круг: обводка 1,5 px белым 75 %, рост 0,3 → 3,2 за 420 мс, старт по касанию
    expect(widgetsCss).toContain('border: 1.5px solid rgba(255, 255, 255, 0.75)');
    expect(widgetsCss).toContain('animation: widgetWaterRipple 420ms ease-out 240ms');
    expect(widgetsCss).toContain('transform: scale(3.2)');
    // уровень трогается вместе с кругом, 320 мс
    expect(widgetsCss).toMatch(/\.widget-water__fill \{[\s\S]*?transition: height 320ms[^;]*240ms/);
    // число — кроссфейд 160 мс со сдвигом 5 px, старт через 240 мс
    expect(widgetsCss).toContain('animation: widgetWaterNumOut 160ms ease-in-out 240ms');
    expect(widgetsCss).toContain('animation: widgetWaterNumIn 160ms ease-in-out 240ms');
    // блики живут всегда, независимо от добавления
    expect(widgetsCss).toContain('animation: widgetWaterShine 1.1s linear infinite');
  });

  it('уменьшенное движение — другая анимация, а не замедленная', () => {
    const block = widgetsCss.slice(widgetsCss.indexOf('@media (prefers-reduced-motion: reduce) {\n  .widget-water__drop'));
    expect(block).toContain('.widget-water__ripple');
    expect(block).toContain('display: none');
    expect(block).toContain('animation: none');
    expect(block).toContain('160ms');
  });

  it('тон воды один на все палитры, новых оттенков нет', () => {
    expect(widgetsCss).toContain('--water-tone: #7d98a6');
    expect(widgetsCss).toContain('--water-tone: #8fb3c2');
    expect(widgetsCss).toContain('--water-tone: #3d7f9e');
    expect(widgetsCss).toContain('--water-tone: #7fb6d0');
  });

  it('вне Главной отвечает мерный столбик, и он не кнопка', () => {
    expect(handlersSrc).toContain('water-column__delta');
    expect(handlersSrc).toContain('water-column__total');
    expect(handlersSrc).toContain('water-column__target');
    // держится 1,4 с после последнего тапа, уходит за 160 мс
    expect(handlersSrc).toContain('WATER_COLUMN_HOLD_MS = 1400');
    expect(handlersSrc).toContain('WATER_COLUMN_OUT_MS = 160');
    // частые тапы не выводят второй столбик
    expect(handlersSrc).toContain('if (col._hideTimer) clearTimeout(col._hideTimer)');
    // столбик 7×62 и сквозные касания
    expect(waterCss).toMatch(/\.water-column__bar \{[\s\S]*?width: 7px;[\s\S]*?height: 62px/);
    expect(waterCss).toMatch(/\.water-column \{[\s\S]*?pointer-events: none/);
    expect(waterCss).toContain('transition: opacity 180ms ease-out');
    expect(waterCss).toMatch(/\.water-column__fill \{[\s\S]*?transition: height 320ms/);
    // Столбик живёт вне .widgets-grid, поэтому общий reduce-motion гасил бы ему
    // длительности в ноль — как когда-то кольцам БЖУ и динамике веса.
    expect(handlersSrc).toContain("col.className = 'water-column animate-always'");
  });

  it('новый «звук капли» не реализован — семпла ещё нет, прежний звук цел', () => {
    // Канвас: «пока файла нет, анимацию можно отдавать в разработку, звук — нет».
    // Прежний звук добавления при этом не трогаем — его удаление никто не просил.
    expect(handlersSrc).toContain("HEYS.audio.play('waterAdded'");
    expect(handlersSrc).not.toContain('waterDropSound');
    expect(handlersSrc).not.toContain('30 центов');
  });
});
