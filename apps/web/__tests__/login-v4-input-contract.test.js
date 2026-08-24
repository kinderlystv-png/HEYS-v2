// Строки контракта login.v4.dc.html (двенадцатая сборка):
//
// «пределы и формат» — код ровно 4 цифры, ввод дальше не принимается; телефон
// 10 цифр после кода страны, маска «+7 (962) 455-61-11» ставится по мере
// ввода: скобки у кода города, дефисы в последних четырёх цифрах.
//
// «подпись поля кода» — подпись зависит от входа: в анкете «Код от куратора»,
// у клиента и при входе с нового устройства «Код доступа». Плоской одной
// подписи нет.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const loginSource = fs.readFileSync(path.join(webDir, 'heys_login_screen_v1.js'), 'utf8');

function loadLoginScreen({ search = '' } = {}) {
  const localStorage = { getItem: () => null };
  const window = { HEYS: {}, location: { search }, localStorage };
  vm.runInNewContext(loginSource, { window, globalThis: window, URLSearchParams });
  return window.HEYS.LoginScreen;
}

describe('login «пределы и формат»: маска телефона по мере ввода', () => {
  const LoginScreen = loadLoginScreen();
  const format = LoginScreen.formatPhoneBody;

  it('ставит скобки у кода города и дефисы в последних четырёх цифрах', () => {
    expect(format('9624556111')).toBe('(962) 455-61-11');
  });

  it('дорисовывает разделители по мере набора, а не по завершении', () => {
    const steps = '9624556111'.split('').map((_, i) => format('9624556111'.slice(0, i + 1)));
    expect(steps).toEqual([
      '(9',
      '(96',
      '(962) ',
      '(962) 4',
      '(962) 45',
      '(962) 455-',
      '(962) 455-6',
      '(962) 455-61-',
      '(962) 455-61-1',
      '(962) 455-61-11',
    ]);
  });

  it('не принимает больше десяти цифр после кода страны', () => {
    expect(format('96245561119999')).toBe('(962) 455-61-11');
    expect(format('')).toBe('');
  });

  it('держит код ровно в четырёх цифрах — и в клавиатуре, и во вставке', () => {
    // Своя клавиатура: пятая цифра в заполненный код не проходит.
    expect(loginSource).toMatch(/const appendPinDigit = \(digit\) => \{[\s\S]*?if \(list\.every\(Boolean\)\) return;/);
    // Вставка из буфера обрезается до четырёх.
    expect(loginSource).toMatch(/clipboardData[\s\S]*?replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
    // Поле бокса принимает одну цифру.
    expect(loginSource).toMatch(/maxLength: 1/);
  });
});

describe('login «подпись поля кода»: подпись зависит от входа', () => {
  it('в анкете — «Код от куратора»', () => {
    const LoginScreen = loadLoginScreen({ search: '?intake=1' });
    expect(LoginScreen.isTrialIntakeLogin()).toBe(true);
    expect(LoginScreen.getClientLoginCopy(true).pinLabel).toBe('Код от куратора');
  });

  it('у клиента и при входе с нового устройства — «Код доступа»', () => {
    const LoginScreen = loadLoginScreen();
    expect(LoginScreen.getClientLoginCopy(false).pinLabel).toBe('Код доступа');
    expect(LoginScreen.getNewDeviceLoginCopy().pinLabel).toBe('Код доступа');
  });

  it('подпись выбирается контекстом, плоской одной подписи в коде нет', () => {
    expect(loginSource).toMatch(
      /const pinFieldLabel = clientEntryMode === 'new_device'[\s\S]*?clientLoginCopy\.pinLabel/,
    );
    // Одна и та же подпись уходит и в видимый ярлык, и в подпись для
    // скринридера («… , N из 4») — строка «доступность».
    expect(loginSource).toContain("'heys-auth-label' }, pinFieldLabel");
    expect(loginSource).toContain("'aria-label': pinFieldLabel + ', ' + (i + 1) + ' из 4'");
  });
});
