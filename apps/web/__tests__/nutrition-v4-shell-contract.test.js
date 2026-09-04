import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const dayShellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
const nutritionSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_nutrition_v1.js'), 'utf8');
const nutritionCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/732-ui-v4-nutrition.css'), 'utf8');

describe('nutrition v4 · isolated Canvas shell', () => {
  it('does not render global gamification or messenger FAB on Nutrition', () => {
    expect(shellSrc).toContain("tab !== 'diary' && React.createElement(\n                'div',\n                { className: 'hdr-top hdr-gamification' }");
    expect(shellSrc).toContain("!hideProductHeader && tab !== 'diary' && showMessengerFabGroup");
  });

  it('does not render the widgets quick-actions FAB over Nutrition totals', () => {
    expect(dayShellSrc).toContain("(mobileSubTab === 'stats' || mobileSubTab === 'activity')");
    expect(dayShellSrc).not.toContain("mobileSubTab === 'diary' ? ['meal'] : []");
  });

  it('scopes the exact Canvas title/date rhythm to the Nutrition tab', () => {
    expect(nutritionCss).toMatch(/\.wrap--tab-diary\s*\{[^}]*font-family:\s*Figtree, sans-serif/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary\s*\{[^}]*padding-top:\s*0/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.hdr\s*\{[^}]*padding:\s*16px 18px 0/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.hdr-bottom\s*\{[^}]*margin-top:\s*0[^}]*padding:\s*0/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.hdr-client-tab-title-text\s*\{[^}]*font-size:\s*15px/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.hdr-tab-title-group\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*space-between/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.date-picker-icon\s*\{[^}]*display:\s*none/);
    expect(nutritionCss).toMatch(/\.wrap--tab-diary \.hdr-sticky-strip\s*\{[^}]*padding:\s*11px 18px 0/);
    expect(nutritionCss).toMatch(/\.nutrition-v4 \.water-review\s*\{[^}]*margin-top:\s*10px/);
    expect(nutritionCss).toMatch(/\.nutrition-v4\s*\{[^}]*margin-top:\s*0/);
  });

  it('wakes the shell meta after the lazy Nutrition module becomes ready', () => {
    expect(shellSrc).toContain("window.addEventListener('heys:nutrition-v4-ready', bump)");
    expect(shellSrc).toContain("window.removeEventListener('heys:nutrition-v4-ready', bump)");
    expect(nutritionSrc).toContain("global.dispatchEvent(new CustomEvent('heys:nutrition-v4-ready'))");
  });
});
