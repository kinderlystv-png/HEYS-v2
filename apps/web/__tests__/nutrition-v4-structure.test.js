import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const nutritionSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_nutrition_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css'),
  'utf8',
);
const shellSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_page_shell.js'),
  'utf8',
);
const diarySource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_diary_section.js'),
  'utf8',
);

describe('Nutrition tab v4 structure', () => {
  it('exports NutritionTabV4 with tiered layout markers', () => {
    expect(nutritionSource).toContain('function NutritionTabV4');
    expect(nutritionSource).toContain('nutrition-v4-hero');
    expect(nutritionSource).toContain('nutrition-v4-tier');
    expect(nutritionSource).toContain('Добавить приём пищи');
    expect(nutritionSource).toContain('nutrition-v4-breakdown');
    expect(nutritionSource).toContain('nutrition-v4-water');
  });

  it('localizes diary meal titles instead of showing english type keys', () => {
    expect(nutritionSource).toContain('function mealTypeLabel');
    expect(nutritionSource).toMatch(/info\?\.name \|\| info\?\.label \|\| meal\?\.name/);
    expect(nutritionSource).toContain('localizeMealName');
    expect(nutritionSource).not.toMatch(/if \(info\?\.type\) return info\.type/);
  });

  it('keeps legacy meals UI in hidden mount for editing', () => {
    expect(nutritionSource).toContain('nutrition-v4-legacy-meals');
    expect(nutritionSource).toContain('id: \'diary-heading\'');
    expect(nutritionSource).toContain('legacyMealsUI');
  });

  it('does not use inline lazy module race checks', () => {
    expect(nutritionSource).not.toMatch(/HEYS\.\w+\s*&&\s*HEYS\./);
  });

  it('nutrition renders only on diary mobile subtab', () => {
    expect(shellSource).toMatch(/mobileSubTab === 'diary'\) && compactNutrition/);
    expect(shellSource).not.toMatch(/mobileSubTab === 'stats' \|\| mobileSubTab === 'diary'\) && compactNutrition/);
  });

  it('legacy diary section skips mobile diary when v4 is active', () => {
    expect(diarySource).toMatch(/isMobile && mobileSubTab === 'diary'/);
    expect(diarySource).toMatch(/return null/);
  });

  it('structure css is imported and uses v4 paint roles', () => {
    const mainCss = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    expect(mainCss).toContain('732-ui-v4-nutrition.css');
    expect(cssSource).toContain('.nutrition-v4-cta');
    expect(cssSource).toContain('var(--v4-hero');
    expect(cssSource).toContain('var(--v4-ink-2');
    expect(cssSource).toMatch(/v4-intentional.*var\(--v4-act\)/s);
  });
});
