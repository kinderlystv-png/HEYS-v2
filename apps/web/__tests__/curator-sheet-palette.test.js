/**
 * Canvas contract: curator review sheet palettes (не sand поверх blue).
 * Source: docs/ui/handoff-v4/canvas/Регистрация и чек-ин v4.dc.html (.bd/.md/.bl/.bldk)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../styles/modules/500-pwa-and-offline.css'),
  'utf8'
);

describe('curator sheet palette contract', () => {
  it('keys sheet themes off data-theme-id so blue is not sand-dark', () => {
    expect(css).toContain('html[data-theme-id="blue"] .ca-modal');
    expect(css).toContain('html[data-theme-id="blue-dark"] .ca-modal');
    expect(css).toContain('html[data-theme-id="sand-dark"] .ca-modal');
    expect(css).not.toMatch(/\[data-theme\$="dark"\]\s+\.ca-modal\b/);
  });

  it('uses palette-specific backdrops with 2.5px blur', () => {
    expect(css).toMatch(/\.ca-modal-backdrop--visible\s*\{[^}]*rgba\(42,\s*26,\s*12,\s*0\.5\)/);
    expect(css).toMatch(/html\[data-theme-id="sand-dark"\][^{]*\.ca-modal-backdrop--visible[^}]*rgba\(0,\s*0,\s*0,\s*0\.62\)/);
    expect(css).toMatch(/html\[data-theme-id="blue"\][^{]*\.ca-modal-backdrop--visible[^}]*rgba\(10,\s*22,\s*38,\s*0\.5\)/);
    expect(css).toMatch(/html\[data-theme-id="blue-dark"\][^{]*\.ca-modal-backdrop--visible[^}]*rgba\(0,\s*8,\s*16,\s*0\.62\)/);
    expect(css).toMatch(/\.ca-modal-backdrop--visible\s*\{[^}]*backdrop-filter:\s*blur\(var\(--v4-modal-backdrop-blur,\s*2\.5px\)\)/);
  });

  it('paints blue delta accent #1d5e96 / #7fbceb, not terracotta', () => {
    expect(css).toMatch(/html\[data-theme-id="blue"\][^{]*\.ca-modal__date-kcal[^}]*#1d5e96/);
    expect(css).toMatch(/html\[data-theme-id="blue"\][^{]*\.ca-modal__more-products[^}]*#1d5e96/);
    expect(css).toMatch(/html\[data-theme-id="blue-dark"\][^{]*\.ca-modal__date-kcal[^}]*#7fbceb/);
    expect(css).toMatch(/html\[data-theme-id="blue"\][^{]*\.ca-modal__item[^}]*#eef3f9/);
    expect(css).toMatch(/html\[data-theme-id="blue"\][^{]*\.ca-modal__ack-btn[^}]*#1d5e96/);
  });

  it('keeps canvas date→capsule rhythm: line-height 1 and group gap 8px', () => {
    expect(css).toMatch(/\.ca-modal__group\s*\{[^}]*gap:\s*8px/);
    expect(css).toMatch(/\.ca-modal__date-label\s*\{[^}]*line-height:\s*1/);
    expect(css).toMatch(/\.ca-modal__date-kcal\s*\{[^}]*line-height:\s*1/);
  });
});
