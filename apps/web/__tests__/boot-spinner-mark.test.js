import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const loading = fs.readFileSync(path.join(webRoot, 'heys_loading_progress_v1.js'), 'utf8');
const init = fs.readFileSync(path.join(webRoot, 'heys_app_initialize_v1.js'), 'utf8');
const css = fs.readFileSync(path.join(webRoot, 'styles/heys-boot-mark.css'), 'utf8');

describe('cold-start spinner mark', () => {
  it('puts the 56 mark in #root instead of a chrome skeleton', () => {
    expect(html).toContain('data-heys-boot-mark="true"');
    expect(html).toContain('heys-boot-mark__spin');
    expect(html).toContain('role="status"');
    expect(html).toContain('Загружаем');
    expect(html).not.toMatch(/id="root"[\s\S]*heys-skeleton/);
    expect(html).not.toContain('Bottom tab bar');
  });

  it('hides the mark when there is no session', () => {
    expect(html).toContain("document.documentElement.setAttribute('data-heys-session'");
    expect(css).toContain('html[data-heys-session="0"] .heys-boot-mark');
  });

  it('uses byte stall and a 15s silent wait, not heartbeat', () => {
    expect(loading).toContain('const SLOW_MS = 15000');
    expect(loading).toContain('const STALL_MS = 60000');
    expect(loading).toContain('transferSize');
    expect(loading).toContain('location.reload()');
    expect(loading).not.toContain('__heysLoadingHeartbeat');
    expect(html).toContain('No boot-byte progress');
    expect(html).not.toContain('autoHeartbeat');
  });

  it('keeps curator contact on the second fail as an external bot link', () => {
    expect(loading).toContain('https://t.me/heyslab_support_bot');
    expect(html).toContain('https://t.me/heyslab_support_bot');
    expect(html).toContain('Написать куратору');
  });

  it('lets the visual guard clone the boot mark and fail with canvas copy', () => {
    expect(init).toContain('[data-heys-boot-mark], .heys-boot-mark, .heys-skeleton');
    expect(init).not.toContain('background:transparent');
    expect(init).toContain("overlay.className = 'heys-boot-visual-guard'");
    expect(css).toContain('#heys-boot-visual-guard');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('flex-direction: column');
    expect(css).toContain('#heys-boot-visual-guard .heys-boot-mark');
    expect(init).toContain('timeoutMs = Number(opts.timeoutMs) || 60000');
    expect(init).toContain('Не удалось загрузить приложение');
    expect(init).not.toContain('Экран не загрузился');
  });

  it('exposes WaitMark for in-app wait: embedded, screen, and button', () => {
    expect(loading).toContain('HEYS.WaitMark');
    expect(loading).toContain("mode === 'button'");
    expect(loading).toContain("opts && opts.idle");
    expect(css).toContain('.heys-wait-mark--embedded');
    expect(css).toContain('.heys-wait-mark--screen');
    expect(css).toContain('.heys-wait-mark--button');
    expect(css).toContain('.heys-wait-mark-overlay');
    expect(css).not.toMatch(/\.heys-wait-mark\s*\{[^}]*min-height:\s*100dvh/);
  });

  it('uses the same mark for cloud tabs and the four server actions', () => {
    const messenger = fs.readFileSync(path.join(webRoot, 'heys_messenger_v1.js'), 'utf8');
    const board = fs.readFileSync(path.join(webRoot, 'heys_board_tab_v1.js'), 'utf8');
    const stepModal = fs.readFileSync(path.join(webRoot, 'heys_step_modal_v1.js'), 'utf8');
    const consents = fs.readFileSync(path.join(webRoot, 'heys_consents_v1.js'), 'utf8');
    const intake = fs.readFileSync(path.join(webRoot, 'heys_trial_intake_v1.js'), 'utf8');
    const userTab = fs.readFileSync(path.join(webRoot, 'heys_user_tab_impl_v1.js'), 'utf8');

    expect(messenger).toContain("mode: 'embedded'");
    expect(messenger).not.toContain('messenger-skeleton__bubble');
    expect(board).toContain("mode: 'embedded'");
    expect(board).toContain('firstCloudWait');
    expect(stepModal).toContain('heys-wait-mark-overlay');
    expect(stepModal).toContain('Сохраняем профиль');
    expect(stepModal).toContain('Не удалось сохранить');
    expect(consents).toContain('WaitMark?.button');
    expect(consents).toContain("busyLabel: 'Подписываем'");
    expect(intake).toContain("title: 'Загружаем анкету'");
    expect(intake).toContain("idle: step === STEPS.length - 1 ? 'Отправить куратору'");
    expect(userTab).toContain('WaitMark?.button');
    expect(userTab).toContain("kind === 'pending'");
  });

  it('keys palettes off data-theme-id so blue is not sand', () => {
    expect(css).toContain('html[data-theme-id="blue"] .heys-boot-mark');
    expect(css).toContain('html[data-theme-id="blue-dark"] .heys-boot-mark');
    expect(css).toContain('html[data-theme-id="sand-dark"] .heys-boot-mark');
    expect(css).not.toMatch(/html\[data-theme="dark"\] #heys-boot-visual-guard/);
    expect(css).toContain('html[data-theme-id="blue"] .heys-boot-visual-guard');
  });

  it('shows Repeat on the slow boot step, not only on second fail', () => {
    expect(css).toContain('.heys-boot-mark.is-slow:not(.is-fail) .heys-boot-mark__slow .heys-boot-mark__retry--ghost');
  });

  it('morphs wait into a check on the same glyph in 200ms', () => {
    expect(loading).toContain("className: 'heys-wait-mark__close'");
    expect(loading).toContain("className: 'heys-wait-mark__check'");
    expect(loading).not.toContain("setTimeout(() => setFrame(1), 100)");
    expect(loading).not.toContain("icon === 'morph'");
    expect(css).toContain('@keyframes heys-wait-close');
    expect(css).toContain('@keyframes heys-wait-check');
    expect(css).toContain('animation: heys-wait-check 100ms ease-out 100ms forwards');
  });

  it('applies canvas wait thresholds for user actions', () => {
    expect(loading).toContain('const WAIT_SHOW_MS = 300');
    expect(loading).toContain('const WAIT_LABEL_MS = 2000');
    expect(loading).toContain('const WAIT_MIN_VISIBLE_MS = 400');
    expect(loading).toContain('WaitMarkButton');
    expect(loading).toContain('WaitMarkScreen');
    expect(loading).toContain('thresholds:');
  });
});
