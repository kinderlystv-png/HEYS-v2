// Стенды зоны «Вход» (login.v4.dc.html): состояния экрана входа получаются
// настоящими действиями на настоящем экране — набор телефона и кода клавишами
// продукта, служебный вход, раскрытие выбора оформления — а сервер подменяется
// на уровне ответов RPC (`HEYS.YandexAPI.rpc`) и сети (`page.route`).
//
// Кадры зоны нарисованы в 375 px шириной и 706/766 px высотой; стенд снимает
// экран того же размера, поэтому пара сравнивается один в один без дотяжки.

const FILE = 'login.v4.dc.html';
const PHONE = '9624556111'; // номер кадра: +7 (962) 455-61-11
const CLIENT_ID = 'ui-v4-visual-login-client';
const SESSION_TOKEN = 'ui-v4-visual-login-session';

// Палитровые копии кадра: та же запись с другим themeId и суффиксом метки.
const THEME_SUFFIX = Object.freeze({
  sand: '',
  'sand-dark': ' · тёмная',
  blue: ' · синяя',
  'blue-dark': ' · сине-тёмная',
});

function loginCase({ id, label, themeId, height = 766, scene = 'collapsed', query = '', clock = null, phone = PHONE, oid }) {
  return {
    id,
    zone: 'login',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'login',
    themeId,
    query,
    phone,
    loginScene: scene,
    ...(clock ? { clock } : {}),
    viewport: { width: 375, height },
    rootSelector: '.heys-auth-shell',
    captureSelector: '.heys-auth-shell',
    canvasFrame: { file: FILE, label, oid, palette: themeId },
  };
}

// Часы кадра «блокировка · 15 минут»: строка ошибки называет время открытия
// 14:47, а ступень 15 минут — значит, «сейчас» на несколько минут раньше.
const SHORT_LOCK_CLOCK = Object.freeze({
  iso: '2026-08-28T14:35:00+03:00',
  day: '2026-08-28',
  epochMs: Date.parse('2026-08-28T14:35:00+03:00'),
});

function palettes(ids, build) {
  return ids.map((themeId) => build(themeId, THEME_SUFFIX[themeId]));
}

export const LOGIN_VISUAL_CASES = Object.freeze([
  // Свёрнутый выбор — песочная копия живёт в login-default.
  ...palettes(['sand-dark', 'blue', 'blue-dark'], (themeId, suffix) => loginCase({
    id: `login-collapsed-${themeId}`,
    label: `Вход · выбор свёрнут${suffix}`,
    themeId,
    oid: `LGC-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-intake-${themeId}`,
    label: `Вход в анкету${suffix}`,
    themeId,
    height: 706,
    scene: 'intake',
    query: '?intake=1',
    oid: `LGI-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark', 'blue', 'blue-dark'], (themeId, suffix) => loginCase({
    id: `login-checking-${themeId}`,
    label: `Вход · Вход клиента${suffix}`,
    themeId,
    height: 706,
    scene: 'checking',
    oid: `LGK-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark', 'blue', 'blue-dark'], (themeId, suffix) => loginCase({
    id: `login-error-${themeId}`,
    label: `Вход · ошибка и выбор${suffix}`,
    themeId,
    scene: 'error',
    oid: `LGE-${themeId}`,
  })),
  loginCase({
    id: 'login-lock-short-sand',
    label: 'Вход · блокировка · 15 минут',
    themeId: 'sand',
    scene: 'lock-short',
    clock: SHORT_LOCK_CLOCK,
    oid: 'LGL15',
  }),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-lock-long-${themeId}`,
    label: `Вход · блокировка · час и сутки${suffix}`,
    themeId,
    scene: 'lock-long',
    oid: `LGLH-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-closed-${themeId}`,
    label: `Вход · закрыт${suffix}`,
    themeId,
    scene: 'closed',
    oid: `LGX-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-own-code-${themeId}`,
    label: `Свой код · первый вход${suffix}`,
    themeId,
    scene: 'own-code',
    oid: `LGO1-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-own-code-confirm-${themeId}`,
    label: `Свой код · подтверждение${suffix}`,
    themeId,
    scene: 'own-code-confirm',
    oid: `LGO2-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-new-device-${themeId}`,
    label: `Вход с нового устройства${suffix}`,
    themeId,
    scene: 'new-device',
    oid: `LGND-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-code-after-reset-${themeId}`,
    label: `Новый код после сброса${suffix}`,
    themeId,
    scene: 'code-after-reset',
    oid: `LGOR-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-code-mismatch-${themeId}`,
    label: `Коды не совпали${suffix}`,
    themeId,
    scene: 'code-mismatch',
    oid: `LGOM-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark'], (themeId, suffix) => loginCase({
    id: `login-code-weak-${themeId}`,
    label: `Код слишком простой${suffix}`,
    themeId,
    scene: 'code-weak',
    oid: `LGOW-${themeId}`,
  })),
  ...palettes(['sand', 'sand-dark', 'blue', 'blue-dark'], (themeId, suffix) => loginCase({
    id: `login-curator-${themeId}`,
    label: `Вход · Вход куратора${suffix}`,
    themeId,
    height: 706,
    scene: 'curator',
    oid: `LGCU-${themeId}`,
  })),
  ...['sand', 'sand-dark'].map((themeId) => loginCase({
    id: `login-theme-picker-${themeId}`,
    label: `Выбор · мягкая бежевая${THEME_SUFFIX[themeId]}`,
    themeId,
    scene: 'theme-picker',
    oid: `LGTP-${themeId}`,
  })),
  ...['blue', 'blue-dark'].map((themeId) => loginCase({
    id: `login-theme-picker-${themeId}`,
    label: `Выбор · мягкая синяя${themeId === 'blue-dark' ? ' · тёмная' : ''}`,
    themeId,
    scene: 'theme-picker',
    oid: `LGTP-${themeId}`,
  })),
]);

/** Ответы сервера входа по сценам: строки RPC такие, какие отдаёт SQL. */
function rpcRowsForScene(scene, clock) {
  const lockAt = (minutes) => new Date(clock.epochMs + minutes * 60_000).toISOString();
  switch (scene) {
    case 'checking':
      return { login_client_v1: 'hang' };
    case 'error':
      return { login_client_v1: { success: false, error: 'invalid_credentials' } };
    case 'lock-short':
      // 14:47 по часам кадра (стенд стоит на 14:35).
      return { login_client_v1: { success: false, error: 'pin_rate_limited', locked_until: lockAt(12) } };
    case 'lock-long':
      return { login_client_v1: { success: false, error: 'pin_rate_limited', locked_until: lockAt(60) } };
    case 'new-device':
      return { login_client_v1: { success: false, error: 'access_code_required' } };
    case 'own-code':
    case 'own-code-confirm':
    case 'code-after-reset':
    case 'code-mismatch':
    case 'code-weak':
      return {
        login_client_v1: { success: false, error: 'access_code_not_set' },
        verify_client_onetime_pin: {
          success: true,
          needs_access_code: true,
          client_id: CLIENT_ID,
          session_token: SESSION_TOKEN,
        },
      };
    default:
      return null;
  }
}

/** До загрузки страницы: сеть и хранилище, которые экран читает при старте. */
export async function prepareLoginPage(page, item) {
  if (item.loginScene === 'closed') {
    // Флаг «вход закрыт» приходит ответом сервера уже после набора номера:
    // ответ держим до сигнала стенда, иначе поле телефона закроется раньше.
    page.__uiV4MaintenanceRoutes = [];
    await page.route(
      (url) => url.href.includes('fn=get_public_app_status'),
      (route) => { page.__uiV4MaintenanceRoutes.push(route); },
    );
  }
  if (item.loginScene === 'code-after-reset') {
    await page.addInitScript((clientId) => {
      // Соглашение ПЭП уже принято этим клиентом — экран без соглашения.
      try { localStorage.setItem('heys_pep_agreement_accepted_v1_' + clientId, '1'); } catch (_) {}
    }, CLIENT_ID);
  }
}

async function installRpcStub(page, rows) {
  await page.waitForFunction(() => typeof window.HEYS?.YandexAPI?.rpc === 'function', undefined, { timeout: 45_000 });
  await page.evaluate((table) => {
    const api = window.HEYS.YandexAPI;
    if (!api.__uiV4LoginOriginalRpc) api.__uiV4LoginOriginalRpc = api.rpc;
    const original = api.__uiV4LoginOriginalRpc;
    api.rpc = function uiV4LoginRpc(name, params, options) {
      if (!Object.prototype.hasOwnProperty.call(table, name)) return original.call(this, name, params, options);
      const row = table[name];
      if (row === 'hang') return new Promise(() => {});
      return Promise.resolve({ data: { [name]: row }, error: null });
    };
  }, rows);
}

// Таймеры ≥ 1 с не заводятся: строка ошибки кода живёт 1,8 с и сама гаснет,
// а снимок делается позже. Короткие таймеры продукта (сброс боксов через 360 мс,
// задержка проверки) идут как есть.
async function holdLongTimers(page) {
  await page.evaluate(() => {
    if (window.__uiV4RealSetTimeout) return;
    window.__uiV4RealSetTimeout = window.setTimeout;
    window.setTimeout = function uiV4HeldSetTimeout(fn, delay, ...args) {
      if (Number(delay) >= 1000) return 0;
      return window.__uiV4RealSetTimeout(fn, delay, ...args);
    };
  });
}

async function tapKeys(page, digits) {
  for (const digit of String(digits)) {
    await page.locator('.heys-auth-keypad .heys-auth-key', { hasText: new RegExp(`^${digit}$`) }).first().click();
  }
}

async function waitForAccessCodeSetup(page) {
  await page.locator('.heys-auth-card--pep').waitFor({ state: 'visible', timeout: 45_000 });
}

async function continueAccessCode(page) {
  await page.locator('.heys-auth-card--pep .heys-auth-primary').click();
}

/** После набора телефона: доводит экран до состояния кадра. */
export async function driveLoginCase(page, item) {
  const scene = item.loginScene || 'collapsed';
  const clock = item.clock || { epochMs: Date.parse('2026-08-28T09:30:00+03:00') };
  const rows = rpcRowsForScene(scene, clock);
  if (rows) await installRpcStub(page, rows);

  switch (scene) {
    case 'collapsed':
    case 'intake':
      return;
    case 'checking':
      await tapKeys(page, '2580');
      // Набранная цифра стоит 1,2 с и сменяется точкой — кадр рисует точки.
      await page.locator('.heys-auth-status.is-visible').waitFor({ state: 'visible', timeout: 45_000 });
      await page.waitForTimeout(1500);
      return;
    case 'error':
      await tapKeys(page, '258');
      await holdLongTimers(page);
      await tapKeys(page, '0');
      await page.locator('.heys-auth-error-slot.is-pin-error').waitFor({ state: 'visible', timeout: 45_000 });
      // Сброс боксов к пустому идёт через 360 мс — ждём его, как ждал бы человек.
      await page.waitForTimeout(500);
      return;
    case 'lock-short':
      await tapKeys(page, '2580');
      await page.locator('.heys-auth-error-slot.is-lock').waitFor({ state: 'visible', timeout: 45_000 });
      return;
    case 'lock-long':
      await tapKeys(page, '2580');
      await page.locator('.heys-auth-lockout').waitFor({ state: 'visible', timeout: 45_000 });
      return;
    case 'closed': {
      const routes = page.__uiV4MaintenanceRoutes || [];
      if (!routes.length) throw new Error('Экран не спросил get_public_app_status — нечего закрывать');
      for (const route of routes) await route.fulfill({ json: { login_closed: true } });
      await page.locator('.heys-auth-maintenance-block').waitFor({ state: 'visible', timeout: 45_000 });
      return;
    }
    case 'new-device':
      await tapKeys(page, '2580');
      await page.locator('.heys-auth-card--new-device').waitFor({ state: 'visible', timeout: 45_000 });
      // Клавиатуры продукта на этом экране нет — цифру набирает системная.
      await page.locator('#heys-client-pin-1').pressSequentially('7');
      await page.waitForTimeout(1500);
      return;
    case 'own-code':
    case 'code-after-reset':
      await tapKeys(page, '2580');
      await waitForAccessCodeSetup(page);
      await tapKeys(page, '25');
      await page.waitForTimeout(1500);
      return;
    case 'own-code-confirm':
      await tapKeys(page, '2580');
      await waitForAccessCodeSetup(page);
      await tapKeys(page, '2580');
      await page.locator('.heys-auth-pep-check').check();
      await continueAccessCode(page);
      await page.locator('.heys-auth-card--pep .heys-auth-title', { hasText: 'Повторите код' }).waitFor({ timeout: 45_000 });
      return;
    case 'code-mismatch':
      await tapKeys(page, '2580');
      await waitForAccessCodeSetup(page);
      await tapKeys(page, '2580');
      await page.locator('.heys-auth-pep-check').check();
      await continueAccessCode(page);
      await page.locator('.heys-auth-card--pep .heys-auth-title', { hasText: 'Повторите код' }).waitFor({ timeout: 45_000 });
      await tapKeys(page, '2581');
      await continueAccessCode(page);
      await page.locator('.heys-auth-card--pep .heys-auth-title', { hasText: 'Коды не совпали' }).waitFor({ timeout: 45_000 });
      return;
    case 'code-weak':
      await tapKeys(page, '2580');
      await waitForAccessCodeSetup(page);
      await tapKeys(page, '1234');
      await page.locator('.heys-auth-pep-check').check();
      await continueAccessCode(page);
      await page.locator('.heys-auth-card--pep .heys-auth-title', { hasText: 'Код слишком простой' }).waitFor({ timeout: 45_000 });
      return;
    case 'curator':
      await page.locator('.heys-auth-service-entry').click();
      await page.locator('.heys-auth-shell--curator').waitFor({ state: 'visible', timeout: 45_000 });
      await page.locator('.heys-auth-shell--curator input[name="email"]').fill('anton@heyslab.ru');
      // Кадр рисует восемь точек — пароль из восьми знаков.
      await page.locator('.heys-auth-shell--curator input[name="password"]').fill('heys2026');
      return;
    case 'theme-picker':
      await page.locator('.heys-login-theme__dots').click();
      await page.locator('.heys-login-theme__panel:not([hidden])').waitFor({ state: 'visible', timeout: 45_000 });
      return;
    default:
      throw new Error(`Unknown login scene: ${scene}`);
  }
}
