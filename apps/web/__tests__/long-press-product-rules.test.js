/**
 * Единый порог долгого нажатия — контракт home-widgets «долгое нажатие · правило продукта».
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(WEB, rel), 'utf8');
}

describe('долгое нажатие · правило продукта', () => {
  it('единая точка — HEYS.longPress.MS = 350, MIN_MS = 250', () => {
    const src = read('heys_long_press_v1.js');
    expect(src).toContain('MS: 350');
    expect(src).toContain('MIN_MS: 250');
    expect(src).toContain('HEYS.longPress = Object.freeze');
  });

  it('модуль подключён в boot-core до потребителей', () => {
    const cfg = read('../../scripts/legacy-bundle-config.mjs');
    const audioIdx = cfg.indexOf("'heys_audio_v1.js'");
    const longPressIdx = cfg.indexOf("'heys_long_press_v1.js'");
    expect(longPressIdx).toBeGreaterThan(-1);
    expect(longPressIdx).toBeLessThan(audioIdx);
  });

  const consumers = [
    ['heys_widgets_variants_v4.js', 'HEYS.longPress'],
    ['heys_water_custom_volume_v1.js', 'HEYS.longPress'],
    ['heys_planning_tasks_v1.js', 'HEYS.longPress'],
    ['heys_hunger_energy_status_ui_v1.js', 'HEYS.longPress'],
    ['heys_planning_chrono_v1.js', 'HEYS.longPress'],
    ['heys_planning_schedule_v1.js', 'HEYS.longPress'],
    ['heys_messenger_v1.js', 'HEYS.longPress'],
    ['heys_supplements_v1.js', 'HEYS.longPress'],
    ['day/_meals.js', 'HEYS.longPress'],
  ];

  it.each(consumers)('%s берёт порог из HEYS.longPress', (file, needle) => {
    const src = read(file);
    expect(src).toContain(needle);
    expect(src).not.toMatch(/LONG_PRESS_MS\s*=\s*(520|500|480|450|560)/);
    if (!file.includes('_meals.js')) {
      expect(src).not.toMatch(/setTimeout\([^,]+,\s*(520|500|480|450|560)\)/);
    }
  });

  it('легаси-подложки не обходят лестницу голым z-index 2147483400', () => {
    const css = read('styles/modules/000-base-and-gamification.css');
    expect(css).not.toContain('2147483400');
    expect(css).not.toContain('2147483401');
    expect(css).not.toContain('2147483402');
    expect(css).not.toContain('2147482000');
    expect(css).toContain('z-index: var(--v4-z-sheet-scrim, 1200)');
  });

  it('ландшафтная заглушка ссылается на ступень лестницы', () => {
    const roles = read('styles/modules/002-ui-v4-palette-roles.css');
    const platform = read('heys_platform_apis_v1.js');
    expect(roles).toContain('--v4-z-landscape-gate:');
    expect(platform).toContain("zIndex: 'var(--v4-z-landscape-gate, 900000)'");
    expect(platform).not.toContain('2147483647');
  });
});
