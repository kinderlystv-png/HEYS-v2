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

function blockKillsFunctionalWater(block) {
  if (!/\.widget-water/.test(block)) return false;
  return /display:\s*none/.test(block) || /\.widget-water[\s\S]*?animation:\s*none/.test(block);
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

  it('виджеты делегируют functional motion в HEYS.motion', () => {
    expect(uiSrc).toContain('HEYS.motion?.functionalAnimationsEnabled');
    expect(uiSrc).toContain('return !enabled');
  });

  it('вода — handlers не читают prefers-reduced-motion для звука/плитки', () => {
    // toContain пропускал `matchMedia?.('(prefers-reduced-motion: reduce)')` —
    // опциональный вызов ломал точное совпадение строки.
    expect(handlersSrc).not.toMatch(/matchMedia(\?\.)?\(\s*['"]\(prefers-reduced-motion/);
    expect(handlersSrc).toContain('MOTION_POLICY.md');
  });

  it('глобальный killer ссылается на политику', () => {
    expect(componentsCss).toContain('MOTION_POLICY.md');
    expect(componentsCss).toContain('.animate-always');
  });

  it('функциональная вода — animate-always, без отдельного reduce-kill в CSS', () => {
    expect(uiSrc).toContain("className: 'widget-water__fill animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");
    const widgetBlocks = reduceMotionBlocks(widgetsCss);
    const waterBlocks = reduceMotionBlocks(waterCss);
    expect(widgetBlocks.some(blockKillsFunctionalWater)).toBe(false);
    expect(waterBlocks.some(blockKillsFunctionalWater)).toBe(false);
    expect(waterBlocks.some((block) => /\.water-column__fill::before[\s\S]*?animation:\s*none/.test(block)))
      .toBe(false);
  });
});
