# Yandex Lockbox Migration Guide

## Обзор

Руководство по миграции секретов из environment variables в Yandex Lockbox (managed secret storage).

**Текущая ситуация**: Секреты хранятся в environment variables Cloud Functions  
**Целевая архитектура**: Секреты в Yandex Lockbox с доступом через Service Account

## Зачем нужна миграция?

### Проблемы с env variables:

1. **Безопасность**: Секреты видны в консоли и логах
2. **Ротация**: Сложно ротировать без redeploy всех функций
3. **Аудит**: Нет истории изменений секретов
4. **Утечки**: Могут попасть в git или CI/CD логи

### Преимущества Lockbox:

1. ✅ **Централизованное хранилище** секретов
2. ✅ **Автоматическая ротация** без redeploy
3. ✅ **Audit trail** всех изменений
4. ✅ **Granular access control** через IAM
5. ✅ **Версионирование** секретов
6. ✅ **Интеграция** с Cloud Functions, Kubernetes, VMs

---

## Архитектура решения

```
┌─────────────────────────────────────────────────────────────┐
│                      Yandex Lockbox                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Secret: heys-database                                │  │
│  │  ├─ PG_HOST                                           │  │
│  │  ├─ PG_PORT                                           │  │
│  │  ├─ PG_DATABASE                                       │  │
│  │  ├─ PG_USER                                           │  │
│  │  └─ PG_PASSWORD                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Secret: heys-s3                                      │  │
│  │  ├─ S3_ACCESS_KEY_ID                                  │  │
│  │  └─ S3_SECRET_ACCESS_KEY                              │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Secret: heys-telegram                                │  │
│  │  ├─ TELEGRAM_BOT_TOKEN                                │  │
│  │  └─ TELEGRAM_CHAT_ID                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ IAM Permission
                              │ lockbox.payloadViewer
                              │
                    ┌─────────┴──────────┐
                    │  Service Account   │
                    │  heys-functions-sa │
                    └────────────────────┘
                              ▲
                              │ Attached to
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
   │ heys-   │          │ heys-   │          │ heys-   │
   │ api-rpc │          │ api-rest│          │ backup  │
   └─────────┘          └─────────┘          └─────────┘
```

---

## Этап 1: Создание секретов в Lockbox

### 1.1 Создать Secret для БД

```bash
# Create secret
yc lockbox secret create \
  --name heys-database \
  --description "PostgreSQL credentials for HEYS production" \
  --payload '[
    {"key":"PG_HOST","text_value":"rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net"},
    {"key":"PG_PORT","text_value":"6432"},
    {"key":"PG_DATABASE","text_value":"heys_production"},
    {"key":"PG_USER","text_value":"heys_admin"},
    {"key":"PG_PASSWORD","text_value":"<your-password>"}
  ]'

# Save secret ID
HEYS_DB_SECRET_ID=$(yc lockbox secret get heys-database --format json | jq -r '.id')
echo "Database Secret ID: $HEYS_DB_SECRET_ID"
```

### 1.2 Создать Secret для S3

```bash
yc lockbox secret create \
  --name heys-s3 \
  --description "S3 credentials for HEYS backups" \
  --payload '[
    {"key":"S3_ACCESS_KEY_ID","text_value":"<your-key-id>"},
    {"key":"S3_SECRET_ACCESS_KEY","text_value":"<your-secret-key>"}
  ]'

HEYS_S3_SECRET_ID=$(yc lockbox secret get heys-s3 --format json | jq -r '.id')
echo "S3 Secret ID: $HEYS_S3_SECRET_ID"
```

### 1.3 Создать Secret для Telegram

```bash
yc lockbox secret create \
  --name heys-telegram \
  --description "Telegram bot credentials for HEYS notifications" \
  --payload '[
    {"key":"TELEGRAM_BOT_TOKEN","text_value":"<your-bot-token>"},
    {"key":"TELEGRAM_CHAT_ID","text_value":"<your-chat-id>"}
  ]'

HEYS_TELEGRAM_SECRET_ID=$(yc lockbox secret get heys-telegram --format json | jq -r '.id')
echo "Telegram Secret ID: $HEYS_TELEGRAM_SECRET_ID"
```

---

## Этап 2: Настройка Service Account

### 2.1 Создать или использовать существующий SA

```bash
# Check if exists
SA_ID=$(yc iam service-account get heys-functions-sa --format json 2>/dev/null | jq -r '.id')

if [ -z "$SA_ID" ]; then
  # Create new
  SA_ID=$(yc iam service-account create \
    --name heys-functions-sa \
    --description "Service account for HEYS Cloud Functions" \
    --format json | jq -r '.id')
  echo "Created SA: $SA_ID"
else
  echo "Using existing SA: $SA_ID"
fi
```

### 2.2 Выдать права на чтение секретов

```bash
# Grant lockbox.payloadViewer role on each secret
yc lockbox secret add-access-binding heys-database \
  --role lockbox.payloadViewer \
  --service-account-id $SA_ID

yc lockbox secret add-access-binding heys-s3 \
  --role lockbox.payloadViewer \
  --service-account-id $SA_ID

yc lockbox secret add-access-binding heys-telegram \
  --role lockbox.payloadViewer \
  --service-account-id $SA_ID

echo "✓ Granted access to all secrets"
```

---

## Этап 3: Создание helper модуля для Lockbox

Создать файл `yandex-cloud-functions/shared/lockbox-client.js`:

```javascript
/**
 * HEYS Yandex Lockbox Client
 * 
 * Unified interface for reading secrets from Yandex Lockbox.
 * Automatically caches secrets in memory for performance.
 */

const https = require('https');

// Cache для секретов (в памяти на время жизни инстанса)
const secretsCache = new Map();
const CACHE_TTL = 300000; // 5 минут

/**
 * Получает IAM токен для Service Account из метаданных
 */
async function getIamToken() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.access_token);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Получает payload секрета из Lockbox
 */
async function getSecretPayload(secretId, iamToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'payload.lockbox.api.cloud.yandex.net',
      path: `/lockbox/v1/secrets/${secretId}/payload`,
      headers: {
        'Authorization': `Bearer ${iamToken}`
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Lockbox API error: ${res.statusCode} ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Получает секреты из Lockbox с кэшированием
 * 
 * @param {string} secretId - ID секрета в Lockbox
 * @returns {Promise<Object>} Object с ключами и значениями
 */
async function getSecrets(secretId) {
  // Проверяем кэш
  const cached = secretsCache.get(secretId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`[Lockbox] Using cached secrets for ${secretId}`);
    return cached.data;
  }

  console.log(`[Lockbox] Fetching secrets for ${secretId}`);

  try {
    const iamToken = await getIamToken();
    const payload = await getSecretPayload(secretId, iamToken);

    // Преобразуем entries в удобный объект
    const secrets = {};
    for (const entry of payload.entries) {
      secrets[entry.key] = entry.textValue;
    }

    // Сохраняем в кэш
    secretsCache.set(secretId, {
      data: secrets,
      timestamp: Date.now()
    });

    return secrets;
  } catch (error) {
    console.error('[Lockbox] Failed to fetch secrets:', error.message);
    
    // Fallback на env vars если Lockbox недоступен
    console.warn('[Lockbox] Falling back to environment variables');
    return null;
  }
}

/**
 * Очищает кэш (для тестов или принудительного обновления)
 */
function clearCache() {
  secretsCache.clear();
}

module.exports = {
  getSecrets,
  clearCache
};
```

---

## Этап 4: Обновление db-pool.js

Обновить `shared/db-pool.js` для использования Lockbox:

```javascript
const { getSecrets } = require('./lockbox-client');

async function createPoolConfig() {
  // Если указан LOCKBOX_SECRET_ID, используем Lockbox
  const lockboxSecretId = process.env.LOCKBOX_DB_SECRET_ID;
  
  let dbConfig;
  if (lockboxSecretId) {
    console.log('[DB-Pool] Loading credentials from Lockbox');
    const secrets = await getSecrets(lockboxSecretId);
    
    if (!secrets) {
      // Fallback на env vars
      console.warn('[DB-Pool] Lockbox unavailable, using env vars');
      dbConfig = {
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT || '6432'),
        database: process.env.PG_DATABASE,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD
      };
    } else {
      dbConfig = {
        host: secrets.PG_HOST,
        port: parseInt(secrets.PG_PORT || '6432'),
        database: secrets.PG_DATABASE,
        user: secrets.PG_USER,
        password: secrets.PG_PASSWORD
      };
    }
  } else {
    // Legacy: используем env vars
    dbConfig = {
      host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
      port: parseInt(process.env.PG_PORT || '6432'),
      database: process.env.PG_DATABASE || 'heys_production',
      user: process.env.PG_USER || 'heys_admin',
      password: process.env.PG_PASSWORD
    };
  }
  
  const CA_CERT = loadCACert();
  
  return {
    ...dbConfig,
    ssl: CA_CERT ? {
      rejectUnauthorized: true,
      ca: CA_CERT
    } : {
      rejectUnauthorized: false
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    allowExitOnIdle: true
  };
}

// Сделать getPool async
async function getPool(functionName = null) {
  if (!pool) {
    const config = await createPoolConfig(); // Now async!
    pool = new Pool(config);
    // ... rest of initialization
  }
  return pool;
}
```

---

## Этап 5: Поэтапная миграция функций

### 5.1 Порядок миграции (от менее критичных к более критичным):

1. ✅ heys-backup (можно откатить без impact)
2. ✅ heys-api-leads (низкая нагрузка)
3. ✅ heys-api-payments (важная, но редкая)
4. ✅ heys-api-auth (средняя критичность)
5. ✅ heys-api-rest (высокая нагрузка)
6. ✅ heys-api-rpc (самая критичная)

### 5.2 Deployment с Lockbox для каждой функции:

```bash
FUNCTION_NAME="heys-backup"

# Deploy with Lockbox environment variable
yc serverless function version create \
  --function-name=$FUNCTION_NAME \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 512m \
  --execution-timeout 600s \
  --source-path ./${FUNCTION_NAME}.zip \
  --service-account-id=$SA_ID \
  --environment LOCKBOX_DB_SECRET_ID=$HEYS_DB_SECRET_ID \
  --environment LOCKBOX_S3_SECRET_ID=$HEYS_S3_SECRET_ID \
  --environment LOCKBOX_TELEGRAM_SECRET_ID=$HEYS_TELEGRAM_SECRET_ID

# Test immediately
yc serverless function invoke $FUNCTION_NAME

# Monitor logs
yc serverless function logs $FUNCTION_NAME --follow
```

### 5.3 Rollback план на каждую функцию:

```bash
# If issues, rollback to previous version
PREVIOUS_VERSION_ID=$(yc serverless function version list \
  --function-name=$FUNCTION_NAME \
  --format json | jq -r '.[1].id')

yc serverless function set-tag \
  --name=$FUNCTION_NAME \
  --tag="\$latest" \
  --version-id=$PREVIOUS_VERSION_ID
```

---

## Этап 6: Очистка (после успешной миграции всех функций)

### 6.1 Удалить env variables из функций:

```bash
# После подтверждения что Lockbox работает 24+ часа
for FUNC in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-payments heys-backup; do
  echo "Removing env vars from $FUNC..."
  yc serverless function version create \
    --function-name=$FUNC \
    --runtime nodejs18 \
    --entrypoint index.handler \
    --source-path ./${FUNC}.zip \
    --service-account-id=$SA_ID \
    --environment LOCKBOX_DB_SECRET_ID=$HEYS_DB_SECRET_ID \
    --environment LOCKBOX_S3_SECRET_ID=$HEYS_S3_SECRET_ID \
    --environment LOCKBOX_TELEGRAM_SECRET_ID=$HEYS_TELEGRAM_SECRET_ID
    # Не передаём PG_PASSWORD, S3_SECRET_ACCESS_KEY и т.д.
done
```

---

## Мониторинг и алерты

### Метрики для мониторинга:

1. **Lockbox API latency** - должна быть <100ms
2. **Cache hit rate** - должна быть >90%
3. **Lockbox API errors** - должна быть 0

### Логи для проверки:

```bash
# Проверить что Lockbox используется
yc serverless function logs heys-api-rpc --filter "Lockbox"

# Должны видеть:
# [Lockbox] Loading credentials from Lockbox
# [Lockbox] Using cached secrets for ...
```

---

## Ротация секретов

### Пример ротации database password:

```bash
# 1. Создать новую версию секрета с новым паролем
yc lockbox secret add-version heys-database \
  --payload '[
    {"key":"PG_HOST","text_value":"rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net"},
    {"key":"PG_PORT","text_value":"6432"},
    {"key":"PG_DATABASE","text_value":"heys_production"},
    {"key":"PG_USER","text_value":"heys_admin"},
    {"key":"PG_PASSWORD","text_value":"<NEW-PASSWORD>"}
  ]'

# 2. Изменить пароль в PostgreSQL
# Console → Managed PostgreSQL → Users → heys_admin → Change Password

# 3. Дождаться обновления кэша (5 минут) или перезапустить функции
# Функции автоматически подхватят новый пароль при следующем запросе к Lockbox
```

**Важно**: Lockbox поддерживает версионирование, можно откатить на предыдущую версию:

```bash
# Rollback к предыдущей версии
yc lockbox secret list-versions heys-database
yc lockbox secret activate-version heys-database --version-id <previous-version-id>
```

---

## Стоимость

**Yandex Lockbox pricing**:
- Хранение секретов: **Бесплатно** до 5 секретов
- API запросы: 1.20₽ за 10,000 запросов

**Расчёт для HEYS**:
- 3 секрета (database, s3, telegram)
- 5 функций × 100 req/day × 30 days = 15,000 requests/month
- Кэш снижает запросы на 90% → 1,500 actual requests/month
- Стоимость: 1,500 / 10,000 × 1.20₽ = **0.18₽/месяц** (~2₽/год)

---

## Чеклист миграции

- [ ] Создал секреты в Lockbox
- [ ] Настроил Service Account с правами
- [ ] Создал lockbox-client.js helper
- [ ] Обновил db-pool.js для поддержки Lockbox
- [ ] Протестировал на staging окружении
- [ ] Мигрировал heys-backup (наименее критичная)
- [ ] Мониторил 24 часа - OK
- [ ] Мигрировал heys-api-leads
- [ ] Мониторил 24 часа - OK
- [ ] Мигрировал остальные функции поэтапно
- [ ] Удалил env variables из функций
- [ ] Настроил алерты на Lockbox errors
- [ ] Документировал процесс ротации
- [ ] Запланировал quarterly audit секретов

---

**Последнее обновление**: 2026-01-23  
**Версия**: 1.0  
**Статус**: Ready for implementation
