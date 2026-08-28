import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

// Строка контракта settings-system «повторное включение уведомлений»
// (25 августа заменила «отключение уведомлений после согласия»): согласие
// действует, пока его не отозвали в явном виде, — повторное включение тумблера
// ничего не спрашивает, и включать/выключать его можно сколько угодно раз.
//
// Раньше в коде это была одна сущность: выключение тумблера звало
// revoke_consent_by_session, сервер ставил granted = false / revoked_at, и
// следующее включение снова просило подпись кодом доступа. Здесь проверяется
// поведение, а не текст: фальшивый журнал согласий ведёт себя как серверный
// (log_consents всегда требует код доступа, когда у клиента есть access_code;
// revoke помечает строку отозванной).

const WEB_DIR = path.resolve(__dirname, '..');
const CONSENTS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_consents_v1.js'), 'utf8');
const PUSH_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_push_v1.js'), 'utf8');
const SHELL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const USER_TAB_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');

const ACCESS_CODE = '1234';

function createConsentJournal() {
  const rows = [];
  let seq = 0;
  return {
    rows,
    activePush(version) {
      return rows.filter(
        (r) => r.type === 'push_notifications'
          && r.granted
          && !r.revoked_at
          && (!version || r.version === version),
      );
    },
    pushRows() {
      return rows.filter((r) => r.type === 'push_notifications');
    },
    api: {
      // Клиент с кодом доступа: сервер не принимает checkbox-подпись вовсе.
      async logConsentsBySession() {
        return {
          data: {
            log_consents_by_session: {
              success: false,
              error: 'signing_requires_access_code',
            },
          },
        };
      },
      async signConsentsWithAccessCodeBySession(consents, accessCode) {
        if (accessCode !== ACCESS_CODE) {
          return {
            data: {
              sign_consents_with_access_code_by_session: {
                success: false,
                error: 'invalid_access_code',
              },
            },
          };
        }
        (consents || []).forEach((c) => {
          seq += 1;
          rows.unshift({
            id: seq,
            type: c.type,
            version: c.version,
            granted: !!c.granted,
            signature_method: c.signature_method || 'pin_confirm',
            created_at: new Date(Date.now() + seq).toISOString(),
            revoked_at: null,
          });
        });
        return { data: { sign_consents_with_access_code_by_session: { success: true } } };
      },
      async getMyConsentsBySession() {
        return {
          data: { get_my_consents_by_session: { consents: rows.map((r) => ({ ...r })) } },
        };
      },
      // Точная копия серверного UPDATE ... WHERE granted AND revoked_at IS NULL.
      async revokeConsentBySession(type) {
        const active = rows.filter((r) => r.type === type && r.granted && !r.revoked_at);
        if (!active.length) {
          return {
            data: {
              revoke_consent_by_session: {
                success: false,
                error: 'consent_not_found_or_already_revoked',
              },
            },
          };
        }
        active.forEach((r) => {
          r.granted = false;
          r.revoked_at = new Date().toISOString();
        });
        return { data: { revoke_consent_by_session: { success: true, consent_type: type } } };
      },
    },
  };
}

describe('согласие на уведомления и тумблер — разные сущности', () => {
  let journal;
  let HEYS;
  let version;

  beforeEach(() => {
    journal = createConsentJournal();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: () => {},
        getRegistrations: async () => [],
      },
    });
    window.HEYS = undefined;
    window.HEYS = {
      auth: { isCuratorSession: () => false },
      YandexAPI: journal.api,
    };
    window.fetch = async () => ({
      ok: true,
      status: 200,
      async text() {
        return '# Согласие на уведомления\n\n**Версия:** 1.2\n';
      },
    });
    // Модули — IIFE над window; исполняем их так же, как это делает браузер.
    new Function(CONSENTS_SRC)();
    new Function(PUSH_SRC)();
    HEYS = window.HEYS;
    version = HEYS.Consents.getCurrentLegalVersions().push_notifications;
    expect(version, 'версия документа push должна быть известна').toBeTruthy();
  });

  // Тумблер в листе настроек: выключение без отзыва согласия.
  const toggleOff = () => HEYS.push.setEnabled(false, { revokeConsent: false });
  const toggleOn = () => HEYS.push.setEnabled(true);

  it('первое включение просит подпись кодом доступа', async () => {
    const r = await toggleOn();
    expect(r.reason).toBe('consent_needs_access_code');
    expect(journal.pushRows()).toHaveLength(0);
  });

  it('подпись кодом заводит ровно одну запись в журнале', async () => {
    const r = await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    expect(r.reason).not.toBe('consent_needs_access_code');
    expect(r.consent?.success).toBe(true);
    expect(journal.activePush(version)).toHaveLength(1);
  });

  it('включение при действующем согласии подпись не открывает', async () => {
    await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    const r = await toggleOn();
    expect(r.reason).not.toBe('consent_needs_access_code');
    expect(r.consent?.alreadySigned).toBe(true);
    // Второй подписи нет — вторая запись в журнал не пишется.
    expect(journal.pushRows()).toHaveLength(1);
  });

  it('выключение тумблера не отзывает согласие', async () => {
    await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    const off = await toggleOff();
    expect(off.ok).toBe(true);
    expect(off.consent).toBeNull();
    expect(journal.activePush(version)).toHaveLength(1);
  });

  it('выключение и включение подряд — сколько угодно раз без подписи', async () => {
    await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    for (let i = 0; i < 3; i += 1) {
      await toggleOff();
      const on = await toggleOn();
      expect(on.reason, `повтор ${i + 1}: подпись не должна запрашиваться`)
        .not.toBe('consent_needs_access_code');
      expect(on.consent?.alreadySigned).toBe(true);
    }
    expect(journal.pushRows()).toHaveLength(1);
    expect(journal.activePush(version)).toHaveLength(1);
  });

  it('после явного отзыва согласия подпись требуется снова', async () => {
    await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    // Явный отзыв на экране согласий — setEnabled(false) без опций.
    const revoke = await HEYS.push.setEnabled(false);
    expect(revoke.consent?.success).toBe(true);
    expect(journal.activePush(version)).toHaveLength(0);
    // Запись из журнала не исчезает: отозванная строка остаётся историей.
    expect(journal.pushRows()).toHaveLength(1);
    expect(journal.pushRows()[0].revoked_at).toBeTruthy();

    const r = await toggleOn();
    expect(r.reason).toBe('consent_needs_access_code');
  });

  it('чужая версия согласия не считается действующей', async () => {
    await HEYS.push.setEnabled(true, { accessCode: ACCESS_CODE });
    journal.pushRows().forEach((r) => { r.version = '0.9'; });
    const r = await toggleOn();
    expect(r.reason).toBe('consent_needs_access_code');
  });
});

describe('источники: кто отзывает согласие, а кто только выключает', () => {
  it('тумблер листа настроек выключается без отзыва согласия', () => {
    expect(SHELL_SRC).toContain('setEnabled(false, { revokeConsent: false })');
  });

  it('шторка подписи открывается только по consent_needs_access_code', () => {
    expect(SHELL_SRC).toContain("r.reason === 'consent_needs_access_code'");
    expect(SHELL_SRC).toContain('setSheetPushAccessOpen(true)');
  });

  it('отзыв на экране согласий остаётся явным действием и отзывает', () => {
    // Кнопка отзыва зовёт setEnabled(false) без опций — ветка с отзывом.
    expect(USER_TAB_SRC).toContain("consentType === 'push_notifications' && HEYS.push?.setEnabled");
    expect(USER_TAB_SRC).toContain('const r = await HEYS.push.setEnabled(false);');
  });

  it('журнал согласий не чистится с клиента', () => {
    expect(PUSH_SRC).not.toMatch(/deleteConsent|purgeConsents/);
    expect(CONSENTS_SRC).not.toMatch(/deleteConsentsBySession/);
  });
});
