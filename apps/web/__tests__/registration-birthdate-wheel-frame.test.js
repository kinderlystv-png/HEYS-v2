// Колесо даты рождения — по кадру «Регистрация · персональные данные»
// (решение владельца 11 сентября): выбранное 26 px/700 акцентом, без капсулы,
// соседние 12,5 px/600 тоном ink-4 с интерлиньяжем 2,1. Строка контракта «вид
// колеса значений» просила 15,5 px чернилами на капсуле и спорила с кадром;
// отступление названо здесь и в UI_V4_FINDINGS.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const CSS = fs.readFileSync(path.join(ROOT, 'apps/web/styles/modules/500-pwa-and-offline.css'), 'utf8');
const CANVAS = fs.readFileSync(
  path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/registration.v4.dc.html',
  ),
  'utf8',
);
const SCOPE = '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-wheel-card';
const rule = (selector) => {
  const at = CSS.indexOf(`\n${selector} {`);
  return at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at));
};

describe('регистрация · колесо даты рождения по кадру', () => {
  it('кадр рисует выбранное 26 px/700 акцентом, соседние 12,5 px/600', () => {
    const frameAt = CANVAS.indexOf('data-screen-label="Регистрация · персональные данные"');
    const wheel = CANVAS.slice(CANVAS.indexOf('data-dim="вид колеса значений"', frameAt));
    expect(wheel).toMatch(/font:700 26px\/1\.4 [A-Za-z]+,sans-serif;color:var\(--ac\);">01/);
    expect(wheel).toMatch(/font:600 12\.5px\/2\.1 [A-Za-z]+,sans-serif;color:var\(--ink-4\);">31/);
  });

  it('продукт: выбранное 26 px/700 акцентом, капсулы под ним нет', () => {
    const current = rule(`${SCOPE} .mc-wheel-value--current`);
    expect(current).toContain('font: 700 26px/1.4 Manrope');
    expect(current).toContain('var(--v4-act-text');
    expect(rule(`${SCOPE} .mc-wheel-values::before`)).toContain('display: none');
  });

  it('соседние — 12,5 px/600 тоном ink-4, интерлиньяж 2,1', () => {
    const neighbours = rule(`${SCOPE} .mc-wheel-value--prev,\n${SCOPE} .mc-wheel-value--next`);
    expect(neighbours).toContain('font: 600 12.5px/2.1 Manrope');
    expect(neighbours).toContain('var(--v4-ink-4');
  });
});
