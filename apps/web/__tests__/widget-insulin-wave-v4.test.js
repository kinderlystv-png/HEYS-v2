import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function loadInsulinWaveV4() {
  const src = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_insulin_wave_v4.js'), 'utf8');
  const ctx = { window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'heys_widgets_insulin_wave_v4.js' });
  return ctx.HEYS.Widgets.InsulinWaveV4;
}

describe('insulin wave v4', () => {
  it('buildV4FromWave — приёмы, пересечения и полоса дня', () => {
    const V4 = loadInsulinWaveV4();
    const wave = {
      status: 'settling',
      waveHistory: [
        { id: 'a', startMin: 8 * 60, endMin: 10 * 60 + 30, time: '08:00', timeDisplay: '8:00', mealName: 'Завтрак', isActive: false },
        { id: 'b', startMin: 10 * 60, endMin: 13 * 60 + 20, time: '10:00', timeDisplay: '10:00', mealName: 'Перекус', isActive: true },
        { id: 'c', startMin: 13 * 60 + 10, endMin: 15 * 60, time: '13:10', timeDisplay: '13:10', mealName: 'Обед', isActive: false }
      ],
      overlaps: [{ from: '10:00', to: '13:10', overlapMinutes: 90, toDisplay: '13:10' }],
      worstOverlap: { from: '10:00', to: '13:10', overlapMinutes: 90, toDisplay: '13:10' }
    };
    const v4 = V4.buildV4FromWave(wave, 11 * 60);
    expect(v4.mealCount).toBe(3);
    expect(v4.mealCountLabel).toBe('3 приёма');
    expect(v4.overlapCount).toBe(1);
    expect(v4.overlapCountLabel).toBe('1 волна наложилась');
    expect(v4.dayWaves.length).toBe(3);
    expect(v4.dayBar.segments.length).toBeGreaterThan(2);
    expect(v4.calmWindowMinutes).toBeGreaterThan(0);
    expect(v4.currentMealMeta).toContain('перекус');
  });

  it('UI — 5 видов инсулиновой волны', () => {
    const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
    expect(uiSrc).toContain('InsulinWaveDaySvg');
    expect(uiSrc).toContain('InsulinWaveCurrentSvg');
    expect(uiSrc).toContain('InsulinWaveOverlapSvg');
    expect(uiSrc).toContain('InsulinWaveDayBar');
    expect(uiSrc).toContain("variantId === 'calm_window'");
    expect(uiSrc).toContain('InsulinWaveDaySvg');
    expect(uiSrc).toContain('widget-v4-insulin-wave--day');
    expect(cssSrc).toMatch(/\.widget-v4-insulin-wave--day\s*\{[^}]*margin-top:\s*8px;/s);
    expect(cssSrc).toMatch(/body:has\(\.widgets-tab\) \.widgets-grid\s*\{[^}]*font-family:\s*Figtree,/s);
  });
});
