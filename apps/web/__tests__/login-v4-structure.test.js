import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(webDir, 'styles/modules/733-ui-v4-login-theme.css'), 'utf8');
const login = fs.readFileSync(path.join(webDir, 'heys_login_screen_v1.js'), 'utf8');
const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const components = fs.readFileSync(path.join(webDir, 'styles/heys-components.css'), 'utf8');

describe('login v4 canvas structure', () => {
  it('keeps PIN cells at 56×64 with 8px gap and 46px keys', () => {
    expect(css).toMatch(/\.heys-auth-pin-box\s*\{[\s\S]*?width:\s*56px/);
    expect(css).toMatch(/\.heys-auth-pin-box\s*\{[\s\S]*?height:\s*64px/);
    expect(css).toMatch(/\.heys-auth-pin-grid\s*\{[\s\S]*?gap:\s*8px/);
    expect(css).toMatch(/\.heys-auth-key,\s*\n\.heys-auth-key-spacer\s*\{[\s\S]*?height:\s*46px/);
  });

  it('reserves the error slot in flow instead of a fixed overlay', () => {
    expect(css).toMatch(/\.heys-auth-error-slot[\s\S]*?visibility:\s*hidden/);
    expect(css).not.toMatch(/#hlg-client-err\.is-pin-error\s*\{[\s\S]*?position:\s*fixed/);
    expect(html).toMatch(/hlg-client-err[\s\S]*?hlg-pin-keypad/);
    expect(login.indexOf('heys-auth-error-slot')).toBeLessThan(login.indexOf('heys-auth-keypad'));
  });

  it('uses canvas card and shell tokens, not glass', () => {
    expect(css).toMatch(/\.heys-auth-shell[\s\S]*?background:\s*var\(--v4-sand-hero/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?max-width:\s*294px/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?border-radius:\s*26px/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?background:\s*var\(--v4-bg/);
    expect(css).toMatch(/backdrop-filter:\s*none/);
  });

  it('draws the horizontal SVG logo and a key-only service entry', () => {
    expect(html).toContain('class="heys-auth-logo"');
    expect(html).not.toContain('heys-logo-hero-blue.png');
    expect(html).toContain('aria-label="Служебный вход"');
    expect(html).not.toMatch(/hlg-service-entry[\s\S]{0,400}служебный вход/);
    expect(login).toContain('heys-auth-service-entry');
    expect(login).not.toContain("'служебный вход'");
  });

  it('keeps shared keypad width contract in heys-components', () => {
    const gridBlock = components.match(/\.heys-auth-pin-grid\s*\{[^}]+\}/);
    expect(gridBlock?.[0]).toContain('max-width: 276px');
    expect(gridBlock?.[0]).toContain('justify-content: center');
    expect(gridBlock?.[0]).not.toContain('space-between');
  });
});
