import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const loginSource = fs.readFileSync(path.join(webDir, 'heys_login_screen_v1.js'), 'utf8');
const staticHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');

function loadLoginScreen({ search = '', candidateHint = false } = {}) {
  const localStorage = {
    getItem(key) {
      return key === 'heys_candidate_cookie_session_hint' && candidateHint ? '1' : null;
    },
  };
  const window = { HEYS: {}, location: { search }, localStorage };
  vm.runInNewContext(loginSource, { window, globalThis: window, URLSearchParams });
  return window.HEYS.LoginScreen;
}

describe('trial-intake login copy', () => {
  it('uses the intake copy for ?intake=1', () => {
    const LoginScreen = loadLoginScreen({ search: '?intake=1' });
    const copy = LoginScreen.getClientLoginCopy(LoginScreen.isTrialIntakeLogin());

    expect(copy).toEqual({
      title: 'Вход в анкету',
      instruction: 'Введите номер из заявки и одноразовый код из сообщения куратора.',
      explanation: 'Код действует один раз и три дня после отправки приглашения. Сейчас вы входите только в анкету — доступ к HEYS появится после её проверки и подтверждения пробной недели куратором.',
      supportLead: 'Не получается войти? ',
    });
    expect(copy.title).not.toBe('Вход клиента');
    expect(copy.supportLead).not.toContain('Забыли PIN?');
  });

  it('uses the intake copy for a confirmed candidate session hint', () => {
    const LoginScreen = loadLoginScreen({ candidateHint: true });
    expect(LoginScreen.isTrialIntakeLogin()).toBe(true);
    expect(LoginScreen.getClientLoginCopy(true).title).toBe('Вход в анкету');
  });

  it('keeps the ordinary client login copy unchanged', () => {
    const LoginScreen = loadLoginScreen();
    expect(LoginScreen.isTrialIntakeLogin()).toBe(false);
    expect(LoginScreen.getClientLoginCopy(false)).toEqual({
      title: 'Вход клиента',
      instruction: '',
      explanation: '',
      supportLead: 'Забыли PIN? ',
    });
  });

  it('keeps the static pre-React screen synchronized with both variants', () => {
    expect(staticHtml).toContain('id="hlg-greeting-client"');
    expect(staticHtml).toContain('Введите номер из заявки и одноразовый код из сообщения куратора.');
    expect(staticHtml).toContain('Код действует один раз и три дня после отправки приглашения.');
    expect(staticHtml).toContain("title.textContent = 'Вход в анкету'");
    expect(staticHtml).toContain("supportPrefix.textContent = 'Не получается войти? '");
    expect(staticHtml).toContain('<span id="hlg-support-prefix">Забыли PIN? </span>');
  });
});
