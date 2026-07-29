import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const loginSource = fs.readFileSync('apps/web/heys_login_screen_v1.js', 'utf8');
const staticHtml = fs.readFileSync('apps/web/index.html', 'utf8');

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
      instruction: 'Введите номер из заявки и PIN из сообщения куратора.',
      explanation: 'Сейчас вы входите только в анкету. Доступ к HEYS появится после её проверки и подтверждения пробной недели куратором.',
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
    expect(staticHtml).toContain('Введите номер из заявки и PIN из сообщения куратора.');
    expect(staticHtml).toContain('Сейчас вы входите только в анкету. Доступ к HEYS появится после её проверки и подтверждения пробной недели куратором.');
    expect(staticHtml).toContain("title.textContent = 'Вход в анкету'");
    expect(staticHtml).toContain("supportPrefix.textContent = 'Не получается войти? '");
    expect(staticHtml).toContain('<span id="hlg-support-prefix">Забыли PIN? </span>');
  });
});
