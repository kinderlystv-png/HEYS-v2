/**
 * HEYS Secrets Overlay
 *
 * Однократно при cold start подтягивает значения из Yandex Lockbox в
 * process.env. Существующий код, читающий process.env.PG_PASSWORD / JWT_SECRET
 * / etc., продолжает работать без изменений — после initSecrets() значения
 * либо из Lockbox (приоритет), либо из env (fallback, если Lockbox недоступен
 * или ключ отсутствует в секрете).
 *
 * Usage in handler:
 *   const { initSecrets } = require('./shared/secrets');
 *   exports.handler = async (event) => {
 *     await initSecrets();
 *     // ... rest of code reads process.env.PG_PASSWORD etc. as before
 *   };
 *
 * Поддерживаемые env-переменные конфигурации:
 *   LOCKBOX_DB_SECRET_ID   — heys-database (PG_PASSWORD)
 *   LOCKBOX_APP_SECRET_ID  — heys-app-secrets (JWT, SESSION, HEYS_ENCRYPTION_KEY,
 *                            VAPID_PRIVATE_KEY, TELEGRAM_*, INTERNAL_CRON_TOKEN, APP_URL, ...)
 *   LOCKBOX_S3_SECRET_ID   — heys-s3 (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
 *
 * Если LOCKBOX_*_SECRET_ID не задан или Lockbox недоступен — initSecrets()
 * не падает, просто ничего не делает (fallback на env, как раньше).
 *
 * ⚠️ Module-level reads (`const PG_CONFIG = { password: process.env.PG_PASSWORD }`
 * вне функции) подхватывают значение НА МОМЕНТ require/load — до того как handler
 * успеет вызвать initSecrets().
 *
 * Раньше здесь стояло, что это не проблема, потому что .env по-прежнему передаётся
 * через env-флаги и process.env.PG_PASSWORD задан при загрузке модуля. **Это больше
 * не так.** Проверено 21.08.2026 на работающей версии heys-api-rest: PG_PASSWORD в
 * окружении функции — плейсхолдер `__IN_LOCKBOX__…`, а stripPlaceholders() ниже его
 * удаляет. То есть запасного пути нет вовсе: пароль существует только после
 * успешного ответа Lockbox, и между strip и overlay его в окружении нет.
 *
 * Значит любой module-level read пароля теперь даёт пустое значение, а odyssey
 * отвечает на это «incorrect password» — а не «нет пароля», из-за чего диагностика
 * уводит в сторону смены пароля. См. MONITORING_QUICK_REF.md, раздел про эту ошибку.
 * Все такие чтения обязаны быть lazy (образец — heys-api-rest:
 * `let PG_CONFIG = null; function getPgConfig() { if (!PG_CONFIG) ... }`).
 */

const { getSecret } = require('./lockbox-client');

let initPromise = null;

// После Phase 3 .env содержит плейсхолдеры `__IN_LOCKBOX__<secret-name>__` для
// секретов, мигрированных в Lockbox. Они НЕ должны попасть в downstream-код как
// "валидное значение" — иначе бот пошлёт плейсхолдер в Telegram API, payments
// подпишет webhook плейсхолдером как HMAC ключом и т.д. Решение: до overlay
// чистим из process.env все ключи с плейсхолдер-значениями. После этого либо
// Lockbox-значение их перезапишет (good path), либо они останутся undefined
// и downstream-validation сработает корректно (graceful failure).
function PLACEHOLDER_RE() { return /^__IN_LOCKBOX__/; }

function stripPlaceholders() {
  let stripped = 0;
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && PLACEHOLDER_RE().test(value)) {
      delete process.env[key];
      stripped += 1;
    }
  }
  return stripped;
}

function overlay(secrets) {
  if (!secrets || typeof secrets !== 'object') return 0;
  let applied = 0;
  for (const [key, value] of Object.entries(secrets)) {
    if (value && String(value).length > 0 && !PLACEHOLDER_RE().test(String(value))) {
      process.env[key] = String(value);
      applied += 1;
    }
  }
  return applied;
}

// Ключи, без которых экземпляр бесполезен: если сейф их не отдал, помнить такой
// результат нельзя — следующий запрос должен сходить в сейф заново, а не
// наследовать сломанное окружение до конца жизни экземпляра.
const REQUIRED_WHEN_CONFIGURED = { db: ['PG_PASSWORD'] };

function missingRequired(kind) {
  return (REQUIRED_WHEN_CONFIGURED[kind] || []).filter((key) => {
    const value = process.env[key];
    return !value || PLACEHOLDER_RE().test(String(value));
  });
}

async function initSecrets() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dbId = process.env.LOCKBOX_DB_SECRET_ID;
    const appId = process.env.LOCKBOX_APP_SECRET_ID;
    const s3Id = process.env.LOCKBOX_S3_SECRET_ID;

    if (!dbId && !appId && !s3Id) {
      // Полный fallback на env — никаких Lockbox-секретов не настроено.
      console.log('[secrets] no LOCKBOX_*_SECRET_ID configured, using env only');
      return { db: 0, app: 0, s3: 0, stripped: 0, source: 'env-only' };
    }

    // ПОРЯДОК ВАЖЕН: сначала сходить в сейф, потом заменить, и только потом
    // стереть то, что сейф не отдал.
    //
    // Раньше плейсхолдеры стирались ПЕРВОЙ строкой, до похода в сейф. Между
    // стиранием и ответом сейфа лежит сетевой вызов — всё это время пароля в
    // окружении нет вовсе. Кто прочитает его в этом окне, получит пустую
    // строку, а база на пустой пароль отвечает «incorrect password», и разбор
    // уходит в сторону смены пароля (инцидент 21.08.2026, 13:59–14:06).
    const [dbSecrets, appSecrets, s3Secrets] = await Promise.all([
      dbId ? getSecret(dbId) : Promise.resolve(null),
      appId ? getSecret(appId) : Promise.resolve(null),
      s3Id ? getSecret(s3Id) : Promise.resolve(null),
    ]);

    const applied = {
      db: overlay(dbSecrets),
      app: overlay(appSecrets),
      s3: overlay(s3Secrets),
    };

    // Плейсхолдеры, которые сейф так и не заменил, стираем: иначе downstream
    // примет `__IN_LOCKBOX__…` за валидное значение и подпишет им webhook.
    const stripped = stripPlaceholders();

    const result = { ...applied, stripped, source: 'lockbox+env' };

    console.log('[secrets] init complete',
      JSON.stringify({
        db: result.db,
        app: result.app,
        s3: result.s3,
        stripped: result.stripped,
        dbConfigured: !!dbId,
        appConfigured: !!appId,
        s3Configured: !!s3Id,
      }));

    // Сейф настроен, но обязательного ключа так и нет — результат не помним.
    const missing = dbId ? missingRequired('db') : [];
    if (missing.length) {
      console.error('[secrets] init incomplete — сейф не отдал:', missing.join(', '),
        '— следующий запрос попробует снова');
      initPromise = null;
    }

    return result;
  })();

  // Ошибка похода в сейф тоже не должна застревать в памяти экземпляра.
  initPromise.catch(() => { initPromise = null; });

  return initPromise;
}

function resetForTests() {
  initPromise = null;
}

module.exports = { initSecrets, resetForTests };
