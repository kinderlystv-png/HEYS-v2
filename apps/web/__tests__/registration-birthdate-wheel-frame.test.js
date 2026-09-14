// Колесо даты рождения — по кадру «Регистрация · персональные данные»
// (решение владельца 11 сентября): выбранное 26 px/700 акцентом, без капсулы,
// соседние 12,5 px/600 тоном ink-4 с интерлиньяжем 2,1. Строка контракта «вид
// колеса значений» просила 15,5 px чернилами на капсуле и спорила с кадром;
// отступление названо здесь и в UI_V4_FINDINGS.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { allDeclarations } from './helpers/css-rule.mjs';

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
// Объявления всех правил селектора разом: `.profile-personal-family` объявлен
// и в группе, и отдельно, и `margin-top` стоит только во втором. Ненайденное
// роняет тест с именем селектора: пустая строка читалась как «не сошлось», а
// означала «не смотрели» (helpers/css-rule).
const rule = (selector) => allDeclarations(CSS, selector);

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

  it('ритм шага: группы через 12 (16 − 4), подпись .flab, поле через 8', () => {
    // «gap-4» в наших стилях — 4 px, не Tailwind-16: промежуток задан явно.
    expect(rule('.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-step')).toContain('gap: 16px');
    expect(rule('.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-family')).toContain('margin-top: -4px');
    expect(rule('.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-step label'))
      .toContain('font: 600 12.5px/1.4 Manrope');
    expect(CSS).toMatch(/\.profile-personal-name > input,\n[^{]*\.profile-personal-family > input \{\s*margin-top: 8px;/);
    // Tailwind «gap-2» и общий margin-bottom 4 у label складывались с отступами
    // кадра: внутри групп промежутка нет, у подписи нижнего поля нет.
    expect(rule('.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-step label')).toContain('margin-bottom: 0');
    expect(CSS).toMatch(/\.profile-personal-name,\n[^{]*\.profile-personal-family,\n[^{]*\.profile-personal-gender \{\s*gap: 0;/);
    const PROFILE = fs.readFileSync(path.join(ROOT, 'apps/web/heys_profile_step_v1.js'), 'utf8');
    expect(PROFILE).not.toContain("style: { color: 'rgba(0,0,0,.7)' }");
  });

  it('соседние — 12,5 px/600 тоном ink-4, интерлиньяж 2,1', () => {
    const neighbours = rule(`${SCOPE} .mc-wheel-value--prev,\n${SCOPE} .mc-wheel-value--next`);
    expect(neighbours).toContain('font: 600 12.5px/2.1 Manrope');
    expect(neighbours).toContain('var(--v4-ink-4');
  });
});
