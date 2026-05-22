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
 * успеет вызвать initSecrets(). На текущем этапе это не проблема: .env по-прежнему
 * передаётся в Cloud Function через env-флаги, значит process.env.PG_PASSWORD
 * корректно задан при загрузке модуля.
 *
 * При финальном удалении значений из .env (этап „24ч watch завершён") такие
 * module-level reads нужно мигрировать на lazy-lookup (см. heys-api-rest как
 * образец `let PG_CONFIG = null; function getPgConfig() { if (!PG_CONFIG) ... }`).
 */

const { getSecret } = require('./lockbox-client');

let initPromise = null;

function overlay(secrets) {
  if (!secrets || typeof secrets !== 'object') return 0;
  let applied = 0;
  for (const [key, value] of Object.entries(secrets)) {
    if (value && String(value).length > 0) {
      process.env[key] = String(value);
      applied += 1;
    }
  }
  return applied;
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
      return { db: 0, app: 0, s3: 0, source: 'env-only' };
    }

    const [dbSecrets, appSecrets, s3Secrets] = await Promise.all([
      dbId ? getSecret(dbId) : Promise.resolve(null),
      appId ? getSecret(appId) : Promise.resolve(null),
      s3Id ? getSecret(s3Id) : Promise.resolve(null),
    ]);

    const result = {
      db: overlay(dbSecrets),
      app: overlay(appSecrets),
      s3: overlay(s3Secrets),
      source: 'lockbox+env',
    };

    console.log('[secrets] init complete',
      JSON.stringify({
        db: result.db,
        app: result.app,
        s3: result.s3,
        dbConfigured: !!dbId,
        appConfigured: !!appId,
        s3Configured: !!s3Id,
      }));

    return result;
  })();

  return initPromise;
}

function resetForTests() {
  initPromise = null;
}

module.exports = { initSecrets, resetForTests };
