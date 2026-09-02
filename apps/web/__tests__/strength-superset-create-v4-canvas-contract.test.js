import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(webRoot, 'styles/modules/750-strength-builder.css'), 'utf8');
const source = fs.readFileSync(path.join(webRoot, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');

describe('strength builder · З1 superset create v4 canvas contract', () => {
  it('keeps the kind rows inside the canvas card inset', () => {
    expect(css).toMatch(/\.sb-superset-kinds\s*\{[\s\S]*padding: 2px 16px 1\.5px;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-list\s*\{[\s\S]*padding: 19\.5px 18px 18px;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-radio\s*\{[\s\S]*min-height: 0;[\s\S]*gap: 10px;[\s\S]*padding: 13\.5px 0;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-radio\.is-on\s*\{[\s\S]*padding: 13\.5px 8px;/);
  });

  it('uses the canvas control, result and note typography', () => {
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-head\s*\{[\s\S]*align-items: flex-start;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-head-sub\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*letter-spacing: 0\.04em;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-step span\s*\{[\s\S]*font: inherit;[\s\S]*letter-spacing: inherit;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-radio \.sb-ex-num\s*\{[\s\S]*border-radius: 9px;[\s\S]*background: var\(--sb-soft\);[\s\S]*font: 700 11px\/1 Figtree, sans-serif;/);
    expect(css).toMatch(/\.sb-superset-control\s*\{[\s\S]*padding: 12px;/);
    expect(css).toMatch(/\.sb-superset-controls\s*\{[\s\S]*margin-bottom: 21px;/);
    expect(css).toMatch(/\.sb-control-label\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*letter-spacing: 0\.04em;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-stepper \.sb-btn\s*\{[\s\S]*background: var\(--sb-soft\);/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-block\s*\{[\s\S]*padding: 16px;/);
    expect(css).toMatch(/\.sb-superset-create-screen \.sb-tile span\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*text-transform: none;/);
    expect(css).toMatch(/\.sb-superset-note\s*\{[\s\S]*font: 500 11px\/1\.55 Figtree, sans-serif;/);
  });

  it('matches the canvas copy without changing the superset calculation', () => {
    expect(source).toContain("d: 'два упражнения подряд без паузы'");
    expect(source).toContain("d: 'три подряд — плотнее и тяжелее'");
    expect(source).toContain("d: 'четыре и больше, круг за кругом'");
    expect(source).toContain('const totalApproaches = count * rounds;');
  });
});
