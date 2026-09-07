/**
 * Сборка 48: три решения дизайнера по тач-целям (поведение + CSS).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function rule(css, selector) {
  const needle = `${selector} {`;
  let at = 0;
  while ((at = css.indexOf(needle, at)) >= 0) {
    const block = css.slice(at, css.indexOf('}', at));
    if (!/display:\s*none/.test(block) || block.length > 48) return block;
    at += needle.length;
  }
  return null;
}

describe('сборка 48 · тач-решения дизайнера', () => {
  it('столбик энергии: колонка на всю высоту графика, без припуска ::after', () => {
    const css = read('styles/modules/725-metabolic-intelligence.css');
    const js = read('insights/pi_ui_cards.js');
    expect(rule(css, '.adv-analytics__energy-bar::after')).toBeNull();
    expect(rule(css, '.adv-analytics__energy-graph')).toMatch(/align-items:\s*stretch/);
    expect(rule(css, '.adv-analytics__energy-bar')).toMatch(/min-height:\s*44px/);
    expect(rule(css, '.adv-analytics__energy-bar-fill')).toBeTruthy();
    expect(js).toContain('adv-analytics__energy-bar-fill');
    expect(js).toMatch(/adv-analytics__energy-bar-fill[\s\S]{0,80}style:\s*\{\s*height:/);
    expect(js).not.toMatch(/className: `adv-analytics__energy-bar[\s\S]{0,80}style:\s*\{\s*height:/);
  });

  it('«Дни недели»: цель — вся строка 44 px, подпись остаётся мелкой', () => {
    const css = read('styles/modules/733-ui-v4-reports.css');
    const js = read('heys_monthly_reports_v1.js');
    const days = rule(css, '.reports-v4-periods-card__days');
    const label = rule(css, '.reports-v4-periods-card__days-label');
    expect(days).toMatch(/min-height:\s*44px/);
    expect(days).toMatch(/width:\s*100%/);
    expect(label).toMatch(/11\.5px/);
    expect(js).toContain("className: 'reports-v4-periods-card__days'");
    expect(js).toContain("className: 'reports-v4-periods-card__days-label'");
  });

  it('строка задачи цели: один исход — тап по ряду; статус — чекбокс, без внутренней кнопки', () => {
    const css = read('styles/modules/900-planning.css');
    const js = read('heys_planning_v1.js');
    expect(rule(css, '.planning-goals-workspace__task button')).toBeNull();
    expect(rule(css, '.planning-goals-workspace__task button::after')).toBeNull();
    expect(rule(css, '.planning-goals-workspace__task')).toMatch(/min-height:\s*44px/);
    expect(js).toContain("className: 'planning-goals-workspace__task-title'");
    expect(js).not.toMatch(/planning-goals-workspace__task[\s\S]{0,400}<button/);
    expect(js).toMatch(/stopPropagation\(\)/);
    expect(js).toMatch(/selectGoalFocus\(goal, task\.id\)/);
  });
});
