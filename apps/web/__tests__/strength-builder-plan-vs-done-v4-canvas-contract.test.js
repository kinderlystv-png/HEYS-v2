import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');

describe('Г2 · Программа · назначено против сделано · canvas contract', () => {
  it('·02 — колонка заголовка column + gap 3px', () => {
    expect(CSS).toMatch(/\.sb-plan-vs-done \.sb-head-title[\s\S]*flex-direction:\s*column/);
    expect(CSS).toMatch(/\.sb-plan-vs-done \.sb-head-title[\s\S]*gap:\s*3px/);
  });

  it('·12 — карточка .grp: margin-bottom 8px, radius 14px', () => {
    expect(CSS).toMatch(/\.sb-plan-vs-row[\s\S]*margin-bottom:\s*8px/);
    expect(CSS).toMatch(/\.sb-plan-vs-row[\s\S]*border-radius:\s*14px/);
  });

  it('·32 — строка списка .cd: разделитель none у последней', () => {
    expect(CSS).toMatch(/\.sb-plan-vs-cd-row\.is-last[\s\S]*border-bottom:\s*none/);
    expect(CSS).toMatch(/\.sb-plan-vs-cd-row:last-child[\s\S]*border-bottom:\s*none/);
  });
});
