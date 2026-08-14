import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(webDir, 'styles/modules/733-ui-v4-login-theme.css'), 'utf8');
const login = fs.readFileSync(path.join(webDir, 'heys_login_screen_v1.js'), 'utf8');
const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const components = fs.readFileSync(path.join(webDir, 'styles/heys-components.css'), 'utf8');
const picker = fs.readFileSync(path.join(webDir, 'heys_login_theme_picker_v1.js'), 'utf8');
const setup = fs.readFileSync(path.join(webDir, 'heys_client_access_code_setup_v1.js'), 'utf8');
const consents = fs.readFileSync(path.join(webDir, 'heys_consents_v1.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(webDir, 'styles/modules/000-base-and-gamification.css'), 'utf8');

describe('login v4 canvas structure', () => {
  it('keeps PIN cells at 56×64 with 8px gap and 46px keys', () => {
    expect(css).toMatch(/\.heys-auth-pin-box\s*\{[\s\S]*?width:\s*56px/);
    expect(css).toMatch(/\.heys-auth-pin-box\s*\{[\s\S]*?height:\s*64px/);
    expect(css).toMatch(/\.heys-auth-pin-grid\s*\{[\s\S]*?gap:\s*8px/);
    expect(css).toMatch(/\.heys-auth-key,\s*\n\.heys-auth-key-spacer\s*\{[\s\S]*?height:\s*46px/);
  });

  it('reserves the error slot in flow instead of a fixed overlay', () => {
    expect(css).toMatch(/\.heys-auth-error-slot[\s\S]*?visibility:\s*hidden/);
    expect(css).toMatch(/\.heys-auth-error-slot:empty[\s\S]*?min-height:\s*38px/);
    expect(css).toMatch(/\.heys-auth-error-slot:empty[\s\S]*?height:\s*38px/);
    expect(css).toMatch(/\.heys-auth-error-slot:empty[\s\S]*?margin-top:\s*14px/);
    expect(css).toMatch(/\.heys-auth-error-slot:not\(:empty\)[\s\S]*?min-height:\s*38px/);
    expect(css).toMatch(/\.heys-auth-error-slot:not\(:empty\)[\s\S]*?height:\s*38px/);
    expect(css).toMatch(/\.heys-auth-error-slot:not\(:empty\)[\s\S]*?max-height:\s*38px/);
    expect(css).toMatch(/\.heys-auth-error-slot:not\(:empty\)[\s\S]*?background:\s*#f3e0d2/);
    expect(css).not.toMatch(/#hlg-client-err\.is-pin-error\s*\{[\s\S]*?position:\s*fixed/);
    expect(html).toMatch(/hlg-client-err[\s\S]*?hlg-pin-keypad/);
    expect(login.indexOf('heys-auth-error-slot')).toBeLessThan(login.indexOf('heys-auth-keypad'));
  });

  it('keeps t1 client column in the viewport with dock at the bottom', () => {
    expect(css).toMatch(/\.heys-auth-shell[\s\S]*?overflow:\s*hidden/);
    expect(css).toMatch(/\.heys-auth-shell-client[\s\S]*?justify-content:\s*center/);
    expect(css).toMatch(/\.heys-auth-shell-client[\s\S]*?min-height:\s*0/);
    expect(css).not.toMatch(/\.heys-auth-shell-client[\s\S]*?min-height:\s*100dvh/);
    expect(css).toMatch(/\.heys-auth-shell-dock[\s\S]*?position:\s*absolute/);
    expect(css).toMatch(/\.heys-auth-shell-dock[\s\S]*?bottom:\s*0/);
    expect(css).toMatch(/text-decoration:\s*none\s*!important/);
    expect(html).not.toMatch(/id="hlg-phone-wrap"[^>]*is-active/);
  });

  it('uses canvas card and shell tokens, not glass', () => {
    expect(css).toMatch(/\.heys-auth-shell[\s\S]*?position:\s*fixed\s*!important/);
    expect(css).toMatch(/\.heys-auth-shell[\s\S]*?inset:\s*0\s*!important/);
    expect(css).toContain('.heys-auth-shell-client');
    expect(css).toContain('.heys-auth-shell-dock');
    expect(css).toContain('.heys-auth-shell--curator');
    expect(css).toMatch(/\.heys-auth-logo \.lab path[\s\S]*rgba\(0,\s*0,\s*0,\s*0\.42\)/);
    expect(css).toMatch(/\.heys-auth-shell[\s\S]*?background:\s*var\(--v4-hero/);
    expect(css).toMatch(/--auth-card-max:\s*294px/);
    expect(css).toMatch(/--auth-inline-gutter:\s*max\(/);
    expect(css).toMatch(/padding:\s*28px var\(--auth-inline-gutter\) 0\s*!important/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?width:\s*100%/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?max-width:\s*var\(--auth-card-max,\s*294px\)/);
    expect(css).not.toMatch(/\.heys-auth-shell-client[\s\S]*?max-width:\s*330px/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?border-radius:\s*26px/);
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?background:\s*var\(--v4-bg/);
    expect(css).toMatch(/backdrop-filter:\s*none/);
  });

  it('keeps login phone type at 20/600 against phone-input-large', () => {
    expect(css).toMatch(/\.heys-auth-shell input\.phone-input-large[\s\S]*?font-size:\s*20px\s*!important/);
    expect(css).toMatch(/\.heys-auth-shell input\.phone-input-large[\s\S]*?font-weight:\s*600\s*!important/);
    expect(css).toMatch(/\.heys-auth-shell input\.phone-input-large[\s\S]*?width:\s*auto\s*!important/);
    expect(css).toMatch(/\.heys-auth-shell \.phone-prefix-large[\s\S]*?font-size:\s*17px\s*!important/);
    expect(css).toMatch(/\.heys-auth-field[\s\S]*?min-height:\s*52px/);
    expect(css).toMatch(/\.heys-auth-field[\s\S]*?justify-content:\s*center/);
    expect(login).not.toMatch(/heys-auth-shell[^"]*px-5/);
    expect(login).not.toMatch(/className:\s*'heys-auth-shell z-\[9999\][^']*justify-center/);
    expect(login).toContain('heys-auth-shell--curator');
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

  it('paints dark auth controls from palette tokens instead of light sand literals', () => {
    expect(css).toMatch(/\[data-theme="sand-dark"\][\s\S]*?\.heys-auth-field[\s\S]*?background:\s*var\(--v4-hero/);
    expect(css).toMatch(/\[data-theme="sand-dark"\][\s\S]*?\.heys-auth-pin-input[\s\S]*?background:\s*var\(--v4-hero/);
    expect(css).toMatch(/\[data-theme="sand-dark"\][\s\S]*?\.heys-auth-title[\s\S]*?color:\s*var\(--v4-ink/);
    expect(css).toMatch(/\[data-theme="blue-dark"\][\s\S]*?\.heys-auth-shell[\s\S]*?background:\s*var\(--v4-hero/);
  });

  it('keeps canvas section rhythm inside the client form', () => {
    expect(css).toMatch(/#hlg-client-form\.space-y-6 > \.space-y-3:first-child[\s\S]*?margin-top:\s*22px\s*!important/);
    expect(css).toMatch(/#hlg-client-form\.space-y-6 > \.heys-auth-pin-section[\s\S]*?margin-top:\s*18px\s*!important/);
    expect(css).toMatch(/#hlg-client-form \.space-y-3[\s\S]*?gap:\s*9px/);
  });

  it('aligns static gate shell with flex-start to avoid pre-hydration center flash', () => {
    expect(html).toMatch(/id="heys-login-gate"[\s\S]*?justify-content:flex-start/);
    expect(html).not.toMatch(/id="heys-login-gate"[\s\S]*?justify-content:center/);
  });
});

describe('login v4 frame groups', () => {
  it('implements intake compact and new-device PIN-only modifiers', () => {
    expect(css).toContain('.heys-auth-shell--intake');
    expect(css).toContain('.heys-auth-card--intake');
    expect(css).toContain('.heys-auth-card--new-device');
    expect(css).toContain('height: 42px');
    expect(css).toContain('.heys-auth-intake-dock');
    expect(login).toContain('heys-auth-shell--intake');
    expect(login).toContain('heys-auth-shell-client');
    expect(login).toContain('heys-auth-shell-dock');
    expect(login).toContain('heys-auth-theme-panel-slot');
    expect(login).toContain('dockLayout: true');
    expect(login).toContain('heys-auth-card--new-device');
    expect(login).toContain('heys-auth-pin-spacer');
    expect(login).toContain('проверьте цифры');
    expect(login).toContain("scope: 'login'");
  });

  it('implements login-only expanded picker with Done and hero panel box', () => {
    expect(picker).toContain("scope === 'login'");
    expect(picker).toContain("done: 'Готово'");
    expect(picker).toContain('heys-login-theme--login-only');
    expect(css).toContain('.heys-login-theme--login-only.is-expanded .heys-login-theme__panel');
    expect(css).toMatch(/background:\s*#f7efe2/);
    expect(picker).toContain('heys-login-theme__done');
  });

  it('reshapes PEP setup to login card frame without explainer wall', () => {
    expect(setup).toContain('heys-auth-card--pep');
    expect(setup).toContain('heys-auth-heading');
    expect(setup).toContain('heys-auth-mark');
    expect(setup).not.toContain('Подпись документов в приложении');
    expect(setup).not.toContain('собственноручную подпись');
    expect(setup).toContain('heys-auth-error-slot');
    expect(css).toMatch(/\.heys-auth-card\s*\{[\s\S]*?max-width:\s*var\(--auth-card-max,\s*294px\)/);
  });

  it('uses v4 bottom sheet for access-code document signing', () => {
    expect(consents).toContain('heys-consent-sign-root');
    expect(consents).toContain('heys-consent-sign-sheet');
    expect(consents).toContain('Подписание');
    expect(consents).toContain('Осталось');
    expect(consents).toContain('signSuccess');
    expect(css).toContain('.heys-consent-sign-sheet__handle');
    expect(css).toContain('.heys-consent-sign-sheet__success');
    expect(css).toMatch(/\.heys-consent-sign-sheet\s*\{[\s\S]*?padding:\s*18px 18px calc\(22px \+ env\(safe-area-inset-bottom/);
  });

  it('restyles in-app settings theme sheet as header popover ad5a', () => {
    expect(shellCss).toMatch(/tab-settings-menu--v4-sheet[\s\S]*?--settings-sheet-top/);
    expect(shellCss).toContain('tab-settings-backdrop--v4-popover');
    expect(shellCss).toContain('settingsMenuSlideDown');
    expect(shellCss).toContain('box-shadow');
    expect(shellCss).toContain('hdr-settings-sheet__soft-card');
    expect(shellCss).toContain('hdr-settings-sheet__hint');
  });

  it('hooks maintenance gate lk2 to boot/server flag readers', () => {
    expect(login).toContain('readLoginMaintenanceFlag');
    expect(login).toContain('resolveLoginMaintenanceFlag');
    expect(login).toContain('heys-auth-maintenance-block');
    expect(login).toContain('__HEYS_AUTH_MAINTENANCE');
    expect(login).toContain('get_public_app_status');
    expect(css).toContain('.heys-auth-shell--maintenance');
  });
});
