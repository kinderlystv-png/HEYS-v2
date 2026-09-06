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

  it('затемнение подложки берётся ролью набора, размытие 2,5 px', () => {
    // Прежде здесь стояли ЧЕТЫРЕ захардкоженных rgba — по одному на палитру, —
    // и это ровно то, что снято решением дизайнера 5 сентября: одно затемнение
    // на все наборы не отделяло лист от экрана на тёмном фоне, а четыре записи
    // одного и того же разъезжались запасными значениями (по коду встречались
    // .42, .55 и .62). Теперь роль --scrim объявлена в четырёх наборах и
    // различается сама; переопределять её под палитру не нужно, и проверять
    // литералы по палитрам — значит охранять снятое решение.
    expect(css).toMatch(/\.ca-modal-backdrop--visible\s*\{[^}]*background:\s*var\(--scrim/);
    expect(css).toMatch(/\.ca-modal-backdrop--visible\s*\{[^}]*backdrop-filter:\s*blur\(var\(--v4-modal-backdrop-blur,\s*2\.5px\)\)/);
    // Своего rgba у подложки не осталось ни в одном правиле.
    expect(css).not.toMatch(/\.ca-modal-backdrop--visible\s*\{[^}]*background:\s*rgba\(/);
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
    expect(css).toMatch(/\.ca-modal__meal-card\s*>\s*\.ca-modal__item\s*\{[^}]*min-height:\s*44px/);
  });

  // Регресс: `.ca-modal__items > li { padding: 0 }` перебивал одноклассовый
  // `.ca-modal__meal-card`, и карточка приёма шла без внутренних отступов.
  it('scopes meal-card padding above the `.ca-modal__items > li` reset', () => {
    expect(css).toMatch(
      /\.ca-modal__items\s*>\s*\.ca-modal__meal-card\s*\{[^}]*padding:\s*11px 13px 12px/,
    );
    expect(css).not.toMatch(/(?:^|\n)\.ca-modal__meal-card\s*\{/);
  });
});
