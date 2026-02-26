# 🔄 Рефакторинг heys_storage_supabase_v1.js

> **Версия документа:** 1.0 **Дата:** 2026-01-10 **Файл:**
> `apps/web/heys_storage_supabase_v1.js` **Размер:** 6,010 строк (25,545 слов,
> 238,872 символов) **Версия модуля:** v58 **Экспорт:** `HEYS.cloud` (строки
> 5-6, IIFE паттерн)
>
> **Note (26.02.2026):** Файл сейчас v63 (~6500+ строк). План валиден, не начат.

---

## 📌 TL;DR

**Цель:** Разбить монолит 6,010 строк на 8 модулей по 300-1400 строк каждый

**Что делаем:**

1. Выделяем config + logging в отдельный модуль (~300 строк)
2. Auth система (tokens, PIN auth, sign in/out) → ~700 строк
3. Sync логика (merge, bootstrap, RPC sync) → ~1400 строк
4. Queue management (pending, upload, quota) → ~800 строк
5. Network layer (fetch, routing, timeout) → ~400 строк
6. Utils (diagnostics, cleanup, force push) → ~600 строк
7. Photos → ~300 строк
8. Shared Products API → ~620 строк

**Зачем:**

- Текущий файл невозможно поддерживать (6k строк!)
- `bootstrapClientSync` занимает 930 строк — нужно разбить
- Shared Products вообще отдельная подсистема
- Тестирование станет возможным

**Время:** ~8-10 часов (2-3 сессии)

---

## 📊 Анализ текущей структуры

### Функциональные секции (30 блоков)

| #   | Секция                          | Строки    | ~Размер | Описание                                                                |
| --- | ------------------------------- | --------- | ------- | ----------------------------------------------------------------------- |
| 1   | Константы и конфигурация        | 1-65      | 65      | `KEY_PREFIXES`, `CLIENT_SPECIFIC_KEYS`, `CONNECTION_STATUS`             |
| 2   | Утилиты (normalizeKey)          | 66-90     | 25      | Нормализация ключей для Supabase                                        |
| 3   | Глобальное состояние            | 91-140    | 50      | `_client`, `_user`, `_rpcOnlyMode`, `_pinAuthClientId`                  |
| 4   | Auto Token Refresh              | 141-290   | 150     | `ensureValidToken`, `scheduleAutoRefresh`                               |
| 5   | Auth Token Sanitize (RTR-safe)  | 291-360   | 70      | Ранняя очистка токенов, failsafe таймеры                                |
| 6   | Merge логика                    | 361-700   | 340     | `mergeItemsById`, `mergeDayData`, `mergeProductsData`                   |
| 7   | Quota Management                | 701-900   | 200     | `getStorageSize`, `estimateQuota`, `checkQuota`, `cleanup`              |
| 8   | Pending Queue                   | 901-1100  | 200     | `loadPendingQueue`, `savePendingQueue`, `addToPending`                  |
| 9   | Sync History Log                | 1100-1260 | 160     | `logSyncEvent`, `getSyncHistory`, `clearSyncHistory`                    |
| 10  | Auth Failure Handler            | 1260-1340 | 80      | `handleAuthFailure`, RTR/RLS ошибки                                     |
| 11  | Exponential Backoff             | 1340-1380 | 40      | `getBackoffDelay`, `resetBackoff`, `incrementBackoff`                   |
| 12  | Logging utilities               | 1380-1440 | 60      | `log`, `err`, `logCritical`, `isNetworkError`                           |
| 13  | fetchWithRetry + Routing        | 1440-1700 | 260     | `fetchWithRetry`, `switchToDirectConnection`, `switchToProxyConnection` |
| 14  | withTimeout + tryParse          | 1700-1780 | 80      | `withTimeout`, `tryParse`, `tryParseJSON`                               |
| 15  | Перехват localStorage           | 1780-1970 | 190     | `interceptSetItem`, дедупликация, `maybeInitSync`                       |
| 16  | cloud.init()                    | 1970-2200 | 230     | Инициализация, health-check, PIN auth восстановление                    |
| 17  | cloud.signIn() / signOut()      | 2200-2360 | 160     | Авторизация через Yandex Cloud Auth                                     |
| 18  | Force Push утилиты              | 2360-2550 | 190     | `forcePushProducts`, `forcePushDay`, `forceReupload`                    |
| 19  | Cleanup утилиты                 | 2550-2770 | 220     | `cleanupProducts`, `cleanupOrphanMealItems`, `cleanupCloudProducts`     |
| 20  | cloud.bootstrapSync()           | 2770-2870 | 100     | Синхронизация kv_store (глобальные данные)                              |
| 21  | syncClientViaRPC                | 2870-3070 | 200     | Yandex API sync для PIN-клиентов                                        |
| 22  | saveClientViaRPC                | 3070-3150 | 80      | Сохранение через Yandex API                                             |
| 23  | **cloud.bootstrapClientSync()** | 3150-4080 | **930** | ⚠️ ГИГАНТ — синхронизация клиента                                       |
| 24  | cloud.fetchDays()               | 4080-4250 | 170     | Загрузка данных за диапазон дат                                         |
| 25  | Client Upload Queue             | 4250-4600 | 350     | `doClientUpload`, `scheduleClientPush`, RPC режим                       |
| 26  | cloud.saveClientKey()           | 4600-4850 | 250     | Основная функция сохранения                                             |
| 27  | cloud.ensureClient() / upsert() | 4850-4950 | 100     | Проверка клиента, generic upsert                                        |
| 28  | User-level Queue (kv_store)     | 4950-5080 | 130     | `schedulePush`, `flushPendingQueue`                                     |
| 29  | Диагностика Storage             | 5080-5250 | 170     | `diagnoseStorage`, `cleanupDuplicates`, `checkIntegrity`                |
| 30  | Photo Storage                   | 5250-5500 | 250     | `uploadPhoto`, `deletePhoto`, `getPendingPhotos`                        |
| 31  | Shared Products API             | 5500-6010 | 510     | `getAllSharedProducts`, `searchSharedProducts`, pending/blocklist       |

### ⚠️ Критический участок: bootstrapClientSync (930 строк!)

Функция `bootstrapClientSync` (строки 3150-4080) — это **930 строк** в одной
функции! Она содержит:

- Дедупликацию продуктов
- Merge локальных и cloud данных
- Миграции legacy данных
- 15+ вложенных проверок и условий
- Защиты от race conditions

**Рекомендация:** Разбить на 4-5 helper-функций внутри sync модуля.

---

## 🎯 План разбиения на модули

### Архитектура после рефакторинга

```
                ┌─────────────────────┐
                │  heys_storage_      │
                │  config_v1.js       │ (~300 строк)
                │  Константы, logging │
                └──────────┬──────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌────────────────┐  ┌─────────────┐  ┌────────────────┐
│ _auth_v1.js    │  │ _network_   │  │  _utils_v1.js  │
│ Auth, tokens   │◄►│ v1.js       │  │  Diagnostics   │
│ PIN auth       │  │ Fetch/retry │  │  Cleanup       │
│ (~700 строк)   │  │ (~400 строк)│  │  (~600 строк)  │
└───────┬────────┘  └──────┬──────┘  └────────┬───────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────────────────────────────────────────────┐
│              heys_storage_sync_v1.js                  │
│  Merge, bootstrapSync, bootstrapClientSync, RPC sync  │
│                    (~1400 строк)                      │
└──────────────────────────┬────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ heys_storage_queue_  │
                │ v1.js                │
                │ Pending, upload,     │
                │ quota (~800 строк)   │
                └──────────┬───────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌────────────────────┐            ┌────────────────────┐
│ heys_storage_      │            │ heys_storage_      │
│ photos_v1.js       │            │ shared_v1.js       │
│ (~300 строк)       │            │ (~620 строк)       │
└────────────────────┘            └────────────────────┘
```

### Модуль 1: heys_storage_config_v1.js (~300 строк)

**Содержимое:**

- Константы: `KEY_PREFIXES`, `CLIENT_SPECIFIC_KEYS`, `CONNECTION_STATUS`
- Утилиты: `normalizeKeyForSupabase`, `isOurKey`, `clearNamespace`, `tryParse`
- Глобальное состояние (экспорт для других модулей)
- Logging: `log`, `err`, `logCritical`, `isNetworkError`

**Строки из оригинала:** 1-65, 66-90, 91-140, 1380-1440, 1700-1780

**Экспорт:**

```javascript
HEYS.StorageConfig = {
  KEY_PREFIXES,
  CLIENT_SPECIFIC_KEYS,
  CONNECTION_STATUS,
  normalizeKeyForSupabase,
  isOurKey,
  clearNamespace,
  tryParse,
  tryParseJSON,
  log,
  err,
  logCritical,
  isNetworkError,
  // Shared state getters/setters
  getClient: () => _client,
  setClient: (c) => {
    _client = c;
  },
  getUser: () => _user,
  setUser: (u) => {
    _user = u;
  },
  getRpcOnlyMode: () => _rpcOnlyMode,
  setRpcOnlyMode: (v) => {
    _rpcOnlyMode = v;
  },
  getPinAuthClientId: () => _pinAuthClientId,
  setPinAuthClientId: (id) => {
    _pinAuthClientId = id;
  },
};
```

### Модуль 2: heys_storage_auth_v1.js (~700 строк)

**Содержимое:**

- Auto Token Refresh: `ensureValidToken`, `scheduleAutoRefresh`
- Auth Token Sanitize (RTR-safe)
- Auth Failure Handler: `handleAuthFailure`
- `cloud.signIn()`, `cloud.signOut()`
- PIN auth логика: `_pinAuthClientId`, `_rpcOnlyMode`
- `cloud.init()` (инициализация)

**Строки из оригинала:** 141-360, 1260-1340, 1970-2360

**Экспорт:**

```javascript
HEYS.StorageAuth = {
  ensureValidToken,
  scheduleAutoRefresh,
  handleAuthFailure,
  sanitizeExpiredTokens,
  init: cloud.init,
  signIn: cloud.signIn,
  signOut: cloud.signOut,
  // PIN auth
  restorePinAuth,
  clearPinAuth,
};
```

### Модуль 3: heys_storage_sync_v1.js (~1400 строк)

**Содержимое:**

- Merge логика: `mergeItemsById`, `mergeDayData`, `mergeProductsData`
- `cloud.syncClient()` (универсальный sync)
- `cloud.bootstrapSync()` (kv_store)
- `cloud.bootstrapClientSync()` — **РАЗБИТЬ НА HELPERS!**
- `syncClientViaRPC()`
- `saveClientViaRPC()`
- `fetchDays()`

**Строки из оригинала:** 361-700, 2770-4250

**Разбиение bootstrapClientSync (930 строк):**

```javascript
// Разбить на 5 helper-функций:
_deduplicateProducts(); // ~150 строк
_mergeLocalAndCloud(); // ~200 строк
_migrateLegacyData(); // ~150 строк
_validateAndSanitize(); // ~200 строк
_applyMergeResults(); // ~230 строк
bootstrapClientSync(); // ~100 строк (оркестратор)
```

**Экспорт:**

```javascript
HEYS.StorageSync = {
  mergeItemsById,
  mergeDayData,
  mergeProductsData,
  syncClient: cloud.syncClient,
  bootstrapSync: cloud.bootstrapSync,
  bootstrapClientSync: cloud.bootstrapClientSync,
  syncClientViaRPC,
  saveClientViaRPC,
  fetchDays: cloud.fetchDays,
};
```

### Модуль 4: heys_storage_queue_v1.js (~800 строк)

**Содержимое:**

- Pending Queue: `loadPendingQueue`, `savePendingQueue`, `addToPending`
- Quota Management: `getStorageSize`, `estimateQuota`, `checkQuota`, `cleanup`
- Client Upload Queue: `doClientUpload`, `scheduleClientPush`
- User-level Queue: `schedulePush`, `flushPendingQueue`
- Exponential Backoff: `getBackoffDelay`, `resetBackoff`
- `cloud.saveClientKey()`, `cloud.saveKey()`

**Строки из оригинала:** 701-1100, 1340-1380, 4250-5080

**Экспорт:**

```javascript
HEYS.StorageQueue = {
  // Pending
  loadPendingQueue,
  savePendingQueue,
  addToPending,
  flushPendingQueue: cloud.flushPendingQueue,
  // Quota
  getStorageSize,
  estimateQuota,
  checkQuota,
  cleanupQuota,
  // Upload
  doClientUpload,
  scheduleClientPush,
  schedulePush,
  // Backoff
  getBackoffDelay,
  resetBackoff,
  // Save
  saveClientKey: cloud.saveClientKey,
  saveKey: cloud.saveKey,
};
```

### Модуль 5: heys_storage_network_v1.js (~400 строк)

**Содержимое:**

- `fetchWithRetry()`
- Routing: `switchToDirectConnection`, `switchToProxyConnection`
- `withTimeout()`
- Перехват localStorage: `interceptSetItem`
- Online/offline listeners

**Строки из оригинала:** 1440-1700, 1780-1970

**Экспорт:**

```javascript
HEYS.StorageNetwork = {
  fetchWithRetry,
  switchToDirectConnection,
  switchToProxyConnection,
  withTimeout,
  interceptSetItem,
  setupOnlineOfflineListeners,
};
```

### Модуль 6: heys_storage_utils_v1.js (~600 строк)

**Содержимое:**

- Sync History Log: `logSyncEvent`, `getSyncHistory`, `clearSyncHistory`
- Диагностика: `diagnoseStorage`, `cleanupDuplicates`, `checkIntegrity`
- Cleanup: `cleanupProducts`, `cleanupOrphanMealItems`, `cleanupCloudProducts`
- Force Push: `forcePushProducts`, `forcePushDay`, `forceReupload`
- `switchClient()`

**Строки из оригинала:** 1100-1260, 2360-2770, 5080-5250

**Экспорт:**

```javascript
HEYS.StorageUtils = {
  // Sync log
  logSyncEvent,
  getSyncHistory,
  clearSyncHistory,
  // Diagnostics
  diagnoseStorage: cloud.diagnoseStorage,
  cleanupDuplicates: cloud.cleanupDuplicates,
  checkIntegrity: cloud.checkIntegrity,
  // Cleanup
  cleanupProducts: cloud.cleanupProducts,
  cleanupOrphanMealItems,
  cleanupCloudProducts,
  // Force
  forcePushProducts: cloud.forcePushProducts,
  forcePushDay: cloud.forcePushDay,
  forceReupload: cloud.forceReupload,
  // Client
  switchClient: cloud.switchClient,
};
```

### Модуль 7: heys_storage_photos_v1.js (~300 строк)

**Содержимое:**

- Photo upload/delete
- Pending photos
- beforeunload handler

**Строки из оригинала:** 5250-5500

**Экспорт:**

```javascript
HEYS.StoragePhotos = {
  uploadPhoto: cloud.uploadPhoto,
  deletePhoto: cloud.deletePhoto,
  getPendingPhotos: cloud.getPendingPhotos,
  retryPendingPhotos,
};
```

### Модуль 8: heys_storage_shared_v1.js (~620 строк)

**Содержимое:**

- `getAllSharedProducts`, `searchSharedProducts`
- `publishToShared`, `deleteSharedProduct`
- Pending products: `createPendingProduct`, approve/reject
- Blocklist

**Строки из оригинала:** 5500-6010

**Экспорт:**

```javascript
HEYS.StorageShared = {
  getAllSharedProducts: cloud.getAllSharedProducts,
  searchSharedProducts: cloud.searchSharedProducts,
  publishToShared: cloud.publishToShared,
  deleteSharedProduct: cloud.deleteSharedProduct,
  // Pending
  createPendingProduct: cloud.createPendingProduct,
  approvePendingProduct: cloud.approvePendingProduct,
  rejectPendingProduct: cloud.rejectPendingProduct,
  getPendingProducts: cloud.getPendingProducts,
  // Blocklist
  addToBlocklist: cloud.addToBlocklist,
  removeFromBlocklist: cloud.removeFromBlocklist,
  getBlocklist: cloud.getBlocklist,
};
```

---

## 🔌 Порядок загрузки модулей

```html
<!-- 1. Конфигурация (никаких зависимостей) -->
<script src="heys_storage_config_v1.js"></script>

<!-- 2. Network (зависит от config) -->
<script src="heys_storage_network_v1.js"></script>

<!-- 3. Auth (зависит от config, network) -->
<script src="heys_storage_auth_v1.js"></script>

<!-- 4. Utils (зависит от config) -->
<script src="heys_storage_utils_v1.js"></script>

<!-- 5. Sync (зависит от config, network, auth) -->
<script src="heys_storage_sync_v1.js"></script>

<!-- 6. Queue (зависит от config, network, sync) -->
<script src="heys_storage_queue_v1.js"></script>

<!-- 7. Photos (зависит от config, network, queue) -->
<script src="heys_storage_photos_v1.js"></script>

<!-- 8. Shared Products (зависит от config, network) -->
<script src="heys_storage_shared_v1.js"></script>

<!-- 9. Core Facade (объединяет всё в HEYS.cloud) -->
<script src="heys_storage_core_v1.js"></script>
```

---

## 🧪 Тестирование

### Критические функции (smoke tests)

```javascript
// 1. Auth
await HEYS.cloud.signIn('test@example.com', 'password');
console.assert(HEYS.cloud.getStatus() === 'online', 'Auth failed');

// 2. PIN Auth
const result = await HEYS.YandexAPI.rpc('client_pin_auth', {
  phone: '+7...',
  pin: '1234',
});
console.assert(result.success, 'PIN auth failed');

// 3. Sync
await HEYS.cloud.syncClient('client-uuid');
console.assert(localStorage.getItem('heys_products'), 'Sync failed');

// 4. Save
await HEYS.cloud.saveClientKey('heys_test', { value: 123 });
const saved = JSON.parse(localStorage.getItem('heys_test'));
console.assert(saved.value === 123, 'Save failed');

// 5. Shared Products
const products = await HEYS.cloud.getAllSharedProducts();
console.assert(Array.isArray(products), 'Shared products failed');

// 6. Photos
// await HEYS.cloud.uploadPhoto(file); // Требует реальный файл
```

### Регрессионные тесты

| Сценарий                       | Ожидание                              | Модуль |
| ------------------------------ | ------------------------------------- | ------ |
| Авторизация куратора           | Успешный signIn, токен сохранён       | auth   |
| PIN авторизация клиента        | Успешный auth, session token          | auth   |
| Синхронизация при первом входе | Данные загружены в localStorage       | sync   |
| Сохранение приёма пищи         | Данные в localStorage + pending queue | queue  |
| Offline → Online               | Pending queue отправлен               | queue  |
| Merge конфликт                 | Более новые данные побеждают          | sync   |
| Поиск shared products          | Возвращает массив                     | shared |
| Upload фото                    | Файл загружен, URL получен            | photos |

---

## 🛡️ Правила безопасности

### ❌ ЗАПРЕЩЕНО

1. **Менять API `HEYS.cloud.*`** — это публичный контракт!
2. **Менять логику merge** без понимания всех edge cases
3. **Трогать RTR-safe код** (строки 291-360) — критичная безопасность
4. **Удалять legacy compatibility** — другие модули зависят от них
5. **Менять структуру pending queue** — данные пользователей!

### ✅ ОБЯЗАТЕЛЬНО

1. **Сохранить все методы `cloud.*`** — через facade или прямой экспорт
2. **Тестировать offline режим** после каждого изменения
3. **Проверять PIN auth** — это отдельный flow от curator auth
4. **Логировать все изменения** — `logSyncEvent` должен работать
5. **Сохранить backward compatibility** с `HEYS.cloud.bootstrapClientSync`

---

## 📋 Чеклист выполнения

### Этап 1: Config модуль

- [ ] Создать `heys_storage_config_v1.js`
- [ ] Перенести константы (KEY_PREFIXES и др.)
- [ ] Перенести утилиты (normalizeKey, tryParse)
- [ ] Перенести logging (log, err)
- [ ] Экспортировать state getters/setters
- [ ] Тест: `HEYS.StorageConfig.KEY_PREFIXES` существует

### Этап 2: Network модуль

- [ ] Создать `heys_storage_network_v1.js`
- [ ] Перенести fetchWithRetry
- [ ] Перенести routing (switchToDirectConnection)
- [ ] Перенести interceptSetItem
- [ ] Тест: `HEYS.StorageNetwork.fetchWithRetry` работает

### Этап 3: Auth модуль

- [ ] Создать `heys_storage_auth_v1.js`
- [ ] Перенести token refresh
- [ ] Перенести signIn/signOut
- [ ] Перенести init
- [ ] Тест: авторизация работает

### Этап 4: Utils модуль

- [ ] Создать `heys_storage_utils_v1.js`
- [ ] Перенести sync history
- [ ] Перенести diagnostics
- [ ] Перенести cleanup
- [ ] Тест: diagnoseStorage работает

### Этап 5: Sync модуль (СЛОЖНЫЙ!)

- [ ] Создать `heys_storage_sync_v1.js`
- [ ] Перенести merge логику
- [ ] **Разбить bootstrapClientSync на helpers!**
- [ ] Перенести syncClientViaRPC
- [ ] Тест: полный цикл sync работает

### Этап 6: Queue модуль

- [ ] Создать `heys_storage_queue_v1.js`
- [ ] Перенести pending queue
- [ ] Перенести quota management
- [ ] Перенести saveClientKey
- [ ] Тест: сохранение в offline работает

### Этап 7: Photos модуль

- [ ] Создать `heys_storage_photos_v1.js`
- [ ] Перенести upload/delete
- [ ] Тест: загрузка фото работает

### Этап 8: Shared модуль

- [ ] Создать `heys_storage_shared_v1.js`
- [ ] Перенести search/get products
- [ ] Перенести publish/pending
- [ ] Тест: поиск продуктов работает

### Этап 9: Core Facade

- [ ] Создать `heys_storage_core_v1.js`
- [ ] Собрать все экспорты в `HEYS.cloud`
- [ ] Тест: **ВСЕ старые методы работают!**
- [ ] Обновить `index.html` с новым порядком загрузки

### Финал

- [ ] Удалить старый `heys_storage_supabase_v1.js`
- [ ] Полный регрессионный тест
- [ ] Тест offline → online sync
- [ ] Тест PIN auth flow
- [ ] Тест curator auth flow

---

## 🔄 Откат

При критических проблемах:

```bash
# 1. Вернуть старый файл из git
git checkout HEAD~1 -- apps/web/heys_storage_supabase_v1.js

# 2. Удалить новые модули
rm apps/web/heys_storage_*_v1.js

# 3. Вернуть старый script tag в index.html
```

---

## 📊 Ожидаемые метрики

| Метрика               | До      | После         |
| --------------------- | ------- | ------------- |
| Строк в главном файле | 6,010   | ~200 (facade) |
| Макс. строк в модуле  | 6,010   | ~1,400 (sync) |
| Количество файлов     | 1       | 9             |
| Тестируемость         | Низкая  | Высокая       |
| Время понимания кода  | ~2 часа | ~30 мин       |

---

## 📝 Заметки

### Особенности этого файла

1. **Два типа авторизации:**
   - Curator auth (email + password → JWT)
   - PIN auth (phone + PIN → session token)
2. **Два API endpoint:**
   - Yandex Cloud Functions (`api.heyslab.ru`)
   - Legacy Supabase (отключён, но код остался)

3. **RTR-safe код (строки 291-360):**
   - Критически важен для безопасности
   - Не трогать без понимания Refresh Token Rotation!

4. **Pending Queue:**
   - Сохраняет данные при offline
   - При восстановлении соединения — автоматический push
   - Нельзя терять данные пользователей!

5. **bootstrapClientSync (930 строк!):**
   - Самая сложная функция в проекте
   - Содержит 15+ вложенных условий
   - Разбить на helper-функции при рефакторинге!

### Связанные файлы

- `heys_yandex_api_v1.js` — API клиент (зависимость)
- `heys_auth_v1.js` — использует auth модуль
- `heys_core_v12.js` — использует sync и queue
- `heys_day_v12.js` — использует saveClientKey
- `index.html` — порядок загрузки скриптов

---

## Changelog

| Версия | Дата       | Изменения               |
| ------ | ---------- | ----------------------- |
| 1.0    | 2026-01-10 | Первоначальный документ |
