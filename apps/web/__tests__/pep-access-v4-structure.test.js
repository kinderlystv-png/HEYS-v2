import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const setupSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_client_access_code_setup_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-login-theme.css'),
  'utf8',
);

describe('PEP access-code setup v4 structure', () => {
  it('keeps login-card frame copy and scoped pep classes', () => {
    expect(setupSource).toContain('heys-auth-card--pep');
    expect(setupSource).toContain('heys-auth-heading');
    expect(setupSource).toContain('heys-auth-mark');
    // Подпись поля «Придумайте код доступа» -> «Новый код»: кадры nc1 и nc4
    // канваса login дают именно её, а прежняя строка дублировала заголовок
    // экрана. Заголовок и объяснение проверяются ниже.
    expect(setupSource).toContain("'Новый код'");
    expect(setupSource).toContain('Придумайте свой код');
    expect(setupSource).toContain('Повторите код');
    expect(setupSource).toContain("'Продолжить'");
    expect(setupSource).toContain("'Изменить код'");
    expect(setupSource).not.toContain('← Изменить код');
    expect(setupSource).not.toContain('Подпись документов в приложении');
    expect(setupSource).toContain('heys-auth-pep-agree');
    expect(setupSource).toContain('heys-auth-pep-check');
    expect(setupSource).toContain('heys-auth-error-slot');
  });

  it('scopes pep paint on login card geometry', () => {
    expect(cssSource).toMatch(/\.heys-auth-card--pep \.heys-auth-pin-box[\s\S]*?width:\s*56px/);
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-primary');
    expect(cssSource).toContain('border-radius: 999px');
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-pep-check');
    expect(cssSource).toMatch(/\.heys-auth-card--pep \.heys-auth-pep-check \{[\s\S]*?width:\s*20px/);
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-change-code');
    expect(cssSource).not.toMatch(/(?<!\.heys-auth-card--pep )\.heys-auth-primary\s*\{/);
  });
});
