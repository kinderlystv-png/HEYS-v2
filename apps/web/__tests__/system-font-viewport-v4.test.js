// Viewport + системный шрифт: UI_V4_COMPLETION_PROMPT §3 (третий приоритет),
// home-widgets «крупный системный шрифт · правило продукта»,
// settings-system «нажатие и крупный шрифт» (местное: значение второй строкой).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const BASE_CSS = fs.readFileSync(
  path.join(WEB, 'styles/modules/000-base-and-gamification.css'),
  'utf8',
);
const CRITICAL_CSS = fs.readFileSync(path.join(WEB, 'styles/critical.css'), 'utf8');

function ruleBlock(cssSource, selectorLine) {
  const idx = cssSource.indexOf(selectorLine);
  expect(idx, `selector "${selectorLine}" not found`).toBeGreaterThanOrEqual(0);
  const close = cssSource.indexOf('}', idx);
  return cssSource.slice(idx, close);
}

describe('viewport: pinch-zoom не блокируется (index.html)', () => {
  it('meta viewport без user-scalable=no и maximum-scale=1', () => {
    expect(INDEX).toMatch(/name="viewport"/);
    expect(INDEX).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(INDEX).not.toMatch(/maximum-scale\s*=\s*1(?:\.0)?/i);
    expect(INDEX).toMatch(/viewport-fit=cover/);
  });
});

describe('крупный системный шрифт: Android text-size-adjust', () => {
  it('html разрешает системное увеличение текста', () => {
    expect(PALETTE_CSS).toMatch(/-webkit-text-size-adjust:\s*auto/);
    expect(PALETTE_CSS).toMatch(/text-size-adjust:\s*auto/);
  });

  it('body базовый кегль относительный (81.25% ≈ 13px при 16px корне)', () => {
    expect(BASE_CSS).toMatch(/\/\* === 03\. common\.css === \*\/[\s\S]*?body\s*\{[^}]*font-size:\s*81\.25%/);
    expect(ruleBlock(CRITICAL_CSS, 'body {')).toMatch(/font-size:\s*81\.25%/);
  });
});

describe('settings-system: нажатие и крупный шрифт', () => {
  it('строка яруса переносит значение и гаснет при нажатии', () => {
    const row = ruleBlock(BASE_CSS, '.hdr-settings-sheet__row {');
    expect(row).toContain('flex-wrap: wrap');
    expect(row).toMatch(/font:[^;]*0\.8125rem/);
    expect(BASE_CSS).toMatch(
      /\.hdr-settings-sheet__row:active:not\(\.is-disabled\)\s*\{[^}]*opacity:\s*0\.7/,
    );
    expect(ruleBlock(BASE_CSS, '.hdr-settings-sheet__meta {')).toMatch(/0\.75rem/);
    expect(ruleBlock(BASE_CSS, '.hdr-settings-sheet__label {')).toContain('min-width: 0');
  });
});
