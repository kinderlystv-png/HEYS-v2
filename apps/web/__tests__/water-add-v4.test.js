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
    expect(uiSrc).toContain('widget-water__numV');
    expect(widgetsCss).toContain('.widget-water__numV');
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__ripple animate-always'");
    expect(uiSrc).toContain('--water-drop-travel');
    // капля 6×6, падение 220 мс ease-in, вытяжение до 1,4
    expect(widgetsCss).toMatch(/\.widget-water__drop \{[\s\S]*?width: 6px;[\s\S]*?animation: widgetWaterDrop 220ms ease-in/);
    expect(widgetsCss).toContain('scaleY(1.4)');
    // круг: обводка 1,5 px белым 75 %, рост 0,3 → 3,2 за 420 мс, старт по касанию
    expect(widgetsCss).toContain('border: 1.5px solid rgba(255, 255, 255, 0.75)');
    expect(widgetsCss).toContain('animation: widgetWaterRipple 420ms ease-out 240ms');
    expect(widgetsCss).toContain('transform: scale(3.2)');
    // уровень: смена дня / intro — --widget-motion-ms; добавление — 320 мс + 240 мс задержка
    expect(uiSrc).toContain('function useWaterFillDisplayPct');
    expect(uiSrc).toContain('height: `${displayFillPct}%`');
    expect(widgetsCss).toMatch(/\.widget-water__fill \{[\s\S]*?transition:[\s\S]*?height var\(--widget-motion-ms/);
    expect(widgetsCss).toMatch(/\.widget-water--adding \.widget-water__fill \{[\s\S]*?320ms[^;]*240ms/);
    // число — кроссфейд 160 мс со сдвигом 5 px, старт через 240 мс
    expect(widgetsCss).toContain('animation: widgetWaterNumOut 160ms ease-in-out 240ms');
    expect(widgetsCss).toContain('animation: widgetWaterNumIn 160ms ease-in-out 240ms');
    // блики живут всегда, независимо от добавления
    expect(widgetsCss).toContain('animation: widgetWaterShine 3.4s linear infinite');
    // Вода заливает карточку от края до края и обрезается её скруглением.
    // Если контейнеру вернуть position: relative, заливка снова зажмётся
    // отступами карточки и перестанет доходить до краёв.
    const waterRootRule = widgetsCss.match(/\.widget-water--v4 \{[^}]*\}/)[0];
    expect(waterRootRule).not.toContain('position: relative');
    // Кикер и число стоят одной строкой сверху, а не абсолютом от карточки:
    // абсолют игнорирует её отступы и прилепляет число к самому краю.
    expect(uiSrc).toContain("className: 'widget-water__head'");
    expect(widgetsCss).toMatch(/\.widget-water__head \{[^}]*justify-content: space-between/);
    const numRule = widgetsCss.match(/\.widget-water__numV \{[^}]*\}/)[0];
    expect(numRule).toContain('position: relative');
    expect(numRule).not.toContain('position: absolute');
    // Легаси-центрирование микро-плитки перебито — содержимое стоит сверху.
    expect(waterRootRule).toContain('justify-content: flex-start');

    // Кромка заливки: два слоя пунктира, крупный шагом 16 px и мелкий шагом
    // 11 px; крупный уезжает на один свой шаг, мелкий на два — «вдвое быстрее».
    // Оба сдвига целые, иначе на стыке петли виден шов.
    expect(widgetsCss).toContain('background-size: 16px 100%, 11px 100%');
    expect(widgetsCss).toMatch(/@keyframes widgetWaterShine \{[^}]*background-position: 16px 0, 22px 0/);
    expect(widgetsCss).toContain('animation: widgetWaterShine 3.4s linear infinite');
    // Тот же дрейф по кромке столбика, но шагом 5 px.
    expect(waterCss).toContain('background-size: 5px 100%');
    expect(waterCss).toMatch(/@keyframes waterColumnShine \{[^}]*background-position: 5px 0/);
    expect(uiSrc).toContain('function waterTileCard');
    expect(uiSrc).toContain("closest('.widget')");
  });

  it('функциональная анимация — animate-always, политика в MOTION_POLICY', () => {
    expect(uiSrc).toContain("className: 'widget-water__fill animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");
    const blocks = widgetsCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
    const killsWater = blocks.some((block) => /\.widget-water/.test(block)
      && (/display:\s*none/.test(block) || /\.widget-water[\s\S]*?animation:\s*none/.test(block)));
    expect(killsWater).toBe(false);
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
    // Канvас: подписи слева от столбика, столбик вплотную к FAB.
    expect(handlersSrc).toMatch(/water-column__text[\s\S]*?water-column__bar/);
    expect(handlersSrc).toMatch(/fab-slot--off/);
    expect(handlersSrc).toContain('function resolveWaterColumnAnchor');
    expect(handlersSrc).toMatch(/resolveWaterColumnAnchor[\s\S]*?querySelectorAll\('\.water-fab'\)/);
    expect(handlersSrc).not.toContain('water-card-anim-above');
    expect(handlersSrc).toContain("col.className = 'water-column animate-always'");
  });

  it('погружение и ramp тона — контракт 2026-08-20', () => {
    expect(uiSrc).toContain('function waterToneMixPct');
    expect(uiSrc).toContain('widget-water--submerged');
    expect(uiSrc).toContain("'--water-tone-mix'");
    expect(widgetsCss).toContain('--water-tone-deep: #4e6d7a');
    expect(widgetsCss).toContain('--water-tone-deep: #3f6c7e');
    expect(widgetsCss).toContain('--water-tone-deep: #2c5f76');
    expect(widgetsCss).toContain('--water-tone-deep: #35657d');
    expect(widgetsCss).toMatch(/color-mix\([\s\S]*?var\(--water-tone\)[\s\S]*?var\(--water-tone-deep\)/);
    expect(widgetsCss).toMatch(/\.widget-water--submerged \.widget-v4-kicker[\s\S]*?translateY\(38\.5px\)/);
    expect(widgetsCss).toMatch(/\.widget-water--submerged \.widget-water__numV[\s\S]*?translateY\(37px\)/);
    expect(widgetsCss).toContain('transition: transform 220ms ease-out, color 220ms ease-out');
  });

  it('новый «звук капли» не реализован — семпла ещё нет, прежний звук цел', () => {
    // Канвас: «пока файла нет, анимацию можно отдавать в разработку, звук — нет».
    // Прежний звук добавления при этом не трогаем — его удаление никто не просил.
    expect(handlersSrc).toContain("HEYS.audio.play('waterAdded'");
    expect(handlersSrc).toContain('setTimeout(playSound, 240)');
    expect(handlersSrc).not.toContain('waterDropSound');
    expect(handlersSrc).not.toContain('30 центов');
  });

  it('быстрые объёмы FAB — столбик после ухода чипов, якорь не трогаем', () => {
    const dayShellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
    expect(dayShellSrc).toContain('function WaterFabButton');
    expect(dayShellSrc).toContain('water-fab-vol');
    expect(dayShellSrc).toContain('pickVolume(200)');
    expect(dayShellSrc).toContain('pickVolume(500)');
    expect(dayShellSrc).toContain('markVolumeChipsClosing');
    expect(handlersSrc).toContain('setVolumeChipsOpen');
    expect(handlersSrc).toContain('markVolumeChipsClosing');
    expect(handlersSrc).toContain('isVolumeChipsBlockingColumn');
    expect(handlersSrc).toContain('pendingColumnDetail');
    expect(handlersSrc).toMatch(/if \(isVolumeChipsBlockingColumn\(\)\) \{[\s\S]*?pendingColumnDetail = detail/);
    expect(waterCss).toContain('.water-fab-vol');
    expect(waterCss).toMatch(/@keyframes waterFabVolIn[\s\S]*?translateX\(10px\)/);
  });
});
