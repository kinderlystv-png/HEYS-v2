import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const source = fs.readFileSync(path.join(WEB, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const css = fs.readFileSync(path.join(WEB, 'styles/modules/750-strength-builder.css'), 'utf8');

function cssRule(selector) {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  expect(start, `missing CSS rule ${selector}`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `unterminated CSS rule ${selector}`).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

describe('strength builder · M7 interrupted-session v4 canvas contract', () => {
  it('renders the interruption as an exclusive decision state before mutable child views', () => {
    expect(source.indexOf('if (showInterrupted)')).toBeGreaterThan(-1);
    expect(source.indexOf('if (showInterrupted)')).toBeLessThan(source.indexOf('const CatUI'));
    expect(source).not.toContain("showInterrupted && h('section'");
    expect(source).toContain("className: 'sb-root sb-root--interrupted'");
    expect(source).toContain("'aria-label': 'Закрыть конструктор'");
    expect(source).not.toMatch(/sb-interrupted-head[\s\S]{0,1000}'aria-label': 'Ещё'/);
  });

  it('keeps the exact M7 identity, time rows, actions and 45-minute explanation', () => {
    expect(source).toContain("h('b', null, 'Тренировка на паузе')");
    expect(source).toContain("h('span', null, 'Последняя отметка')");
    expect(source).toContain("h('span', null, 'Сейчас')");
    expect(source).toContain("}, 'Продолжить')");
    expect(source).toContain("'Завершить в ' + fmtTime(lastMarkAt)");
    expect(source).toContain('Разрыв больше 45 минут — и второй кнопкой предлагаем закрыть тренировку временем последней отметки, а не текущим:');
    expect(source).toContain('Длительность в итогах всегда считается от первой отметки до последней.');
    expect(source).toContain('breakSec > 45 * 60');
  });

  it('uses canvas geometry and palette tokens for the decision surface', () => {
    expect(cssRule('.sb-interrupted-scroll')).toContain('padding: 6px 18px 18px;');
    expect(cssRule('.sb-interrupted-copy')).toContain('font: 600 12.5px/1.55 Figtree');
    expect(cssRule('.sb-interrupted-head .sb-head-sub')).toContain('color: var(--v4-ink-data,');
    expect(cssRule('.sb-interrupted-meta')).toContain('margin-top: 12px;');
    expect(cssRule('.sb-interrupted-meta')).toContain('padding: 2px 16px;');
    expect(cssRule('.sb-interrupted-meta')).toContain('border-radius: 20px;');
    expect(cssRule('.sb-interrupted-row')).toContain('padding: 13px 0;');
    expect(cssRule('.sb-interrupted-row')).toContain('border-bottom: 1px solid rgba(var(--v4-ink-rgb), .07);');
    expect(cssRule('.sb-interrupted-row:last-child')).toContain('border-bottom: 0;');
    expect(cssRule('.sb-interrupted-actions')).toContain('gap: 7px;');
    expect(cssRule('.sb-interrupted-actions')).toContain('margin-top: 12px;');
    expect(cssRule('.sb-interrupted-actions .sb-btn')).toContain('flex: 1;');
    expect(cssRule('.sb-interrupted-actions .sb-btn')).toContain('background: var(--v4-chip-2, #efe3cf);');
    expect(cssRule('.sb-interrupted-actions .sb-btn')).toContain('color: var(--v4-muted, rgba(var(--v4-ink-rgb), .58));');
    expect(css).not.toContain('var(--v4-c2');
    expect(cssRule('.sb-interrupted-actions .sb-btn.is-accent')).toContain('background: var(--acs,');
    expect(cssRule('.sb-interrupted-actions .sb-btn.is-accent')).toContain('color: var(--on-acs,');
    expect(cssRule('.sb-interrupted-note')).toContain('font: 500 11px/1.55 Figtree');
    expect(cssRule('.sb-interrupted-note')).toContain('color: var(--v4-ink-data,');
  });
});
