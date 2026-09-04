import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const catalogSource = fs.readFileSync(path.join(WEB, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');
const css = fs.readFileSync(path.join(WEB, 'styles/modules/750-strength-builder.css'), 'utf8');

describe('strength builder · Своё упражнение v4 canvas contract', () => {
  it('keeps screen copy and unit-driven third question in NewExerciseScreen', () => {
    expect(catalogSource).toContain("'Новое упражнение'");
    expect(catalogSource).toContain("'Три поля, третье — только иногда'");
    expect(catalogSource).toContain("'1 · Что меряем'");
    expect(catalogSource).toContain("'2 · Группы мышц'");
    expect(catalogSource).toContain("'3 · На что похоже движение'");
    expect(catalogSource).toContain("'Создать упражнение'");
    expect(catalogSource).toContain("'Создать · без тоннажа'");
    expect(catalogSource).toContain("const needsFactor = unit === 'bodyweight'");
    expect(catalogSource).toContain('disabled: !ready || (needsFactor && !likeNorm)');
    expect(catalogSource).toContain("className: 'sb-ap-field sb-ex-name'");
  });

  it('uses canvas geometry for head, scroll, name field and panel buttons', () => {
    expect(css).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-head\s*\{[\s\S]*padding: 16px 18px 0;/);
    expect(css).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-head-title\s*\{[\s\S]*flex-direction: column;[\s\S]*gap: 3px;/);
    expect(css).toMatch(/\.sb-list\s*\{[\s\S]*overflow-y: auto;/);
    expect(css).toMatch(/\.sb-ex-name\s*\{[\s\S]*min-height: 44px;[\s\S]*border-radius: 14px;[\s\S]*padding: 0 14px;[\s\S]*margin-top: 12px;/);
    expect(css).toMatch(/\.sb-ex-name\s*\{[\s\S]*font: 700 13px\/1 Figtree/);
    expect(css).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-panel-column \.sb-finish\s*\{[\s\S]*margin-top: 12px;/);
    expect(css).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-panel-column \.sb-btn\s*\{[\s\S]*margin-top: 9px;/);
    expect(css).toMatch(/\.sb-step\s/);
    expect(css).toMatch(/\.sb-radio\.is-on\s*\{[\s\S]*background: var\(--sb-accbg\)/);
  });
});
