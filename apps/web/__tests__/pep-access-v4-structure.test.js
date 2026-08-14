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
  it('keeps legal copy and scoped pep classes', () => {
    expect(setupSource).toContain('heys-auth-card--pep');
    expect(setupSource).toContain('Придумайте код доступа');
    expect(setupSource).toContain('Повторите код');
    expect(setupSource).toContain("'Далее'");
    expect(setupSource).toContain("'Продолжить'");
    expect(setupSource).toContain("'Изменить код'");
    expect(setupSource).not.toContain('← Изменить код');
    expect(setupSource).toContain('Ваш код доступа заменяет собственноручную подпись');
    expect(setupSource).toContain('Никому не сообщайте свой код, в том числе куратору');
    expect(setupSource).toContain('Нажимая «Продолжить», вы заключаете соглашение и создаёте код доступа');
    expect(setupSource).toContain('heys-auth-pep-agree');
    expect(setupSource).toContain('heys-auth-pep-check');
  });

  it('scopes pep paint so login selectors stay generic', () => {
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-label');
    expect(cssSource).toContain('font-size: 13px');
    expect(cssSource).toContain('text-transform: none');
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-subtitle');
    expect(cssSource).toContain('max-width: none');
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-primary');
    expect(cssSource).toContain('border-radius: 999px');
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-pep-check');
    expect(cssSource).toMatch(/\.heys-auth-card--pep \.heys-auth-pep-check \{[\s\S]*?width:\s*20px/);
    expect(cssSource).toContain('.heys-auth-card--pep .heys-auth-change-code');
    expect(cssSource).not.toMatch(/(?<!\.heys-auth-card--pep )\.heys-auth-primary\s*\{/);
  });
});
