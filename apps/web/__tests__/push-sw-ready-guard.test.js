import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const PUSH_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_push_v1.js'), 'utf8');
const SHELL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');

describe('push SW ready guard (localhost)', () => {
  it('не ждёт serviceWorker.ready без активной регистрации', () => {
    expect(PUSH_SRC).toContain('async function getPushRegistration');
    expect(PUSH_SRC).toContain('getRegistrations()');
    expect(PUSH_SRC).toMatch(/getStatus[\s\S]*getPushRegistration/);
    expect(PUSH_SRC).toMatch(/async function subscribe[\s\S]*sw_unavailable/);
    expect(PUSH_SRC).toMatch(/async function unsubscribe[\s\S]*getPushRegistration/);
    // ready только через helper после проверки regs — иначе тумблер зависает.
    expect(PUSH_SRC).toMatch(
      /async function getPushRegistration\([\s\S]*?getRegistrations\([\s\S]*?serviceWorker\.ready/,
    );
  });

  it('лист Ещё объясняет sw_unavailable и открывает PIN при needsAccessCode', () => {
    expect(SHELL_SRC).toContain('explainEnableFailure');
    expect(SHELL_SRC).toContain("r.reason === 'consent_needs_access_code'");
    expect(SHELL_SRC).toContain('setSheetPushAccessOpen(true)');
  });

  it('объяснения отказа включения — через ConfirmModal, не browser alert', () => {
    expect(PUSH_SRC).toContain('function explainEnableFailure');
    expect(PUSH_SRC).toContain('function showIosHomeInstallGuide');
    expect(PUSH_SRC).toContain('ios-home-install-modal');
    expect(PUSH_SRC).toContain('Чтобы напоминания приходили, добавьте иконку');
    expect(PUSH_SRC).toContain("case 'sw_unavailable'");
    expect(PUSH_SRC).toContain('ConfirmModal.show');
  });
});
