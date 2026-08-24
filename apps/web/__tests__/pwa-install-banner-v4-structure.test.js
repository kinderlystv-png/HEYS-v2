import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const overlays = fs.readFileSync(path.join(webDir, 'heys_app_overlays_v1.js'), 'utf8');
const css = fs.readFileSync(path.join(webDir, 'styles/modules/500-pwa-and-offline.css'), 'utf8');

describe('pwa install banner v4 structure', () => {
  it('uses sand card + later link on android/desktop', () => {
    expect(overlays).toContain("className: 'pwa-banner-content pwa-banner-content--android'");
    expect(overlays).toContain("className: 'pwa-banner-later'");
    expect(overlays).toContain('Иконка на главном экране — открывается сразу');
    expect(overlays).not.toContain('pwa-banner-dismiss');
    expect(overlays).not.toContain('pwa-banner-icon');
    expect(overlays).not.toContain('Быстрый доступ с главного экрана');
  });

  it('uses sand card + steps on ios safari', () => {
    expect(overlays).toContain("className: 'ios-sheet-handle'");
    expect(overlays).toContain('На весь экран, с главного экрана — и без сети');
    expect(overlays).toContain('внизу экрана');
    expect(overlays).not.toContain('ios-arrow-hint');
    expect(overlays).not.toContain('✨ Полный экран • Быстрый доступ • Работа offline');
    expect(overlays).not.toContain('✨');
  });

  it('paints banners from v4 sand tokens without gradients', () => {
    const pwaCss = css.split(/\/\* =+\s*\n\s*Update Toast/)[0];
    expect(pwaCss).toMatch(/\.pwa-banner-content--android[\s\S]*?background:\s*var\(--v4-float/);
    expect(pwaCss).toMatch(/\.pwa-banner-install[\s\S]*?background:\s*var\(--v4-sand-act/);
    expect(pwaCss).toMatch(/\.ios-pwa-banner \.pwa-banner-content[\s\S]*?background:\s*var\(--v4-float/);
    expect(pwaCss).toMatch(/bottom:\s*0/);
    expect(pwaCss).toMatch(/border-radius:\s*26px 26px 0 0/);
    expect(pwaCss).toMatch(/z-index:\s*1100/);
    expect(pwaCss).toMatch(/\.ios-got-it-btn[\s\S]*?background:\s*var\(--v4-sand-act/);
    expect(pwaCss).not.toMatch(/linear-gradient/);
    expect(pwaCss).not.toMatch(/#007AFF/);
  });

  // Лист «на домашний экран» — раздел канваса settings-system.v4.dc.html.
  it('лист «на домашний экран»: шаг на первой поверхности без обводки, глиф по центру круга', () => {
    // Контракт «вид шага»: карточка ПЕРВОЙ поверхности, радиус 16, поля 10/13.
    // Обводки в контракте нет; #faf7f2 не был ни фоном экрана, ни поверхностью.
    const step = css.match(/\.ios-home-install-modal__step \{([\s\S]*?)\}/)[1];
    expect(step).toMatch(/background:\s*#f7efe2/);
    expect(step).not.toMatch(/\bborder:/);
    expect(step).toMatch(/border-radius:\s*16px/);
    expect(step).toMatch(/padding:\s*10px 13px/);

    // Контракт «вид шапки листа»: круг 40 px с иконкой телефона 19 px — глиф по
    // центру, а не прижат к краю.
    const phone = css.match(/\.ios-home-install-modal__phone \{([\s\S]*?)\}/)[1];
    expect(phone).toMatch(/justify-content:\s*center/);
    expect(phone).toMatch(/width:\s*40px/);
  });
});
