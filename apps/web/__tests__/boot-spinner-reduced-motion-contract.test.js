// Сверка кода со строкой контракта spinners «без анимации».
//
// Правило про дыхание уже один раз исчезло молча: коммит 43bbc3bc завёл его по
// контракту, а 43bbc3bc → e68e327c («figtree font and v4 css palette polish»)
// снял внутри правки про шрифт и палитру, ни словом не упомянув движение.
// Проверка ниже читает саму строку канваса и сверяет её с CSS, поэтому
// расхождение всплывает при правке любой из сторон — и кода, и пакета дизайна.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readKeyframes, readReducedMotionBlock, readRule } from './boot-mark-css-helpers.js';

const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');
const canvasPath = path.join(
  repoRoot,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/spinners.v4.dc.html',
);

const css = fs.readFileSync(path.join(webRoot, 'styles/heys-boot-mark.css'), 'utf8');
const canvas = fs.readFileSync(canvasPath, 'utf8');

/** Значение строки контракта: `<b>ключ</b><span data-v="…">`. */
function contractRow(html, key) {
  const re = new RegExp(`<b>${key}</b>\\s*<span data-v="([^"]*)"`);
  const m = re.exec(html);
  if (!m) throw new Error(`в канвасе spinners нет строки контракта «${key}»`);
  return m[1];
}

describe('contract spinners → «без анимации»', () => {
  const block = canvas.slice(canvas.indexOf('data-contract="spinners"'));
  const row = contractRow(block, 'без анимации');

  it('reads the contract row from the canvas', () => {
    // Если дизайнер переписал строку — тест падает здесь, и код сверяют заново,
    // а не тихо оставляют под старую формулировку.
    expect(row).toBe('при prefers-reduced-motion вращение выключается, дуга дышит прозрачностью 1,6 с');
  });

  it('turns rotation off and breathes the arc for the duration the row names', () => {
    // Длительность берём из самой строки, а не из константы в тесте.
    const seconds = /дышит прозрачностью\s+(\d+),(\d+)\s*с/.exec(row);
    expect(seconds).not.toBeNull();
    const duration = `${seconds[1]}.${seconds[2]}s`;

    const reduced = readReducedMotionBlock(css);
    const rule = readRule(reduced, '.heys-boot-mark__spin');

    // «вращение выключается»
    expect(rule.body).not.toContain('heys-boot-spin');
    // «дуга дышит прозрачностью 1,6 с» — и знак ожидания, и диск загрузчика
    expect(rule.selector).toContain('.heys-boot-mark__spin');
    expect(rule.selector).toContain('.heys-wait-mark__spin');
    expect(rule.body).toContain('heys-boot-breathe');
    expect(rule.body).toContain(duration);

    const breathe = readKeyframes(css, 'heys-boot-breathe');
    expect(breathe).toContain('opacity');
    expect(breathe).not.toContain('transform');
  });

  it('keeps the arc moving rather than frozen — «замерший круг читается как сломанный элемент»', () => {
    const reduced = readReducedMotionBlock(css);
    const rule = readRule(reduced, '.heys-boot-mark__spin');
    expect(rule.body).toContain('infinite');
    expect(rule.body).not.toMatch(/animation:\s*none/);

    // Каскад: правило дыхания должно пережить приход глобального гашения
    // *:not(.animate-always):not(.animate-always *) весом (0,2,0) с !important,
    // которое грузится позже этого файла. Отсюда флаг в селекторе (вес 0,3,0
    // и вывод дуги из-под глобального правила) и !important на самой анимации.
    expect(rule.selector).toContain('.animate-always');
    expect(rule.body).toContain('!important');
  });
});
