# HEYS Storage Patterns

> **Version:** v3.0.0 | **Updated:** 26.02.2026
>
> Правила работы с localStorage и cloud sync
>
> См. также: [SYNC_REFERENCE.md](../SYNC_REFERENCE.md) |
> [SYNC_PERFORMANCE_REPORT.md](../SYNC_PERFORMANCE_REPORT.md)

---

## Storage APIs

### Legacy API (в heys_core_v12.js) — с clientId namespace

```javascript
U.lsSet('heys_products', products); // Автоматически добавляет clientId
U.lsGet('heys_products', []);
```

### Modern API (в heys_storage_layer_v1.js) — с кэшем и watchers

```javascript
HEYS.store.set('key', value); // Сохранение + notify watchers
HEYS.store.get('key', defaultVal); // Получение из cache/localStorage
```

### Global storage (без namespace)

```javascript
localStorage.setItem('heys_client_current', clientId);
```

---

## localStorage ключи

| Ключ                        | Описание                | Namespace     |
| --------------------------- | ----------------------- | ------------- |
| `heys_dayv2_{date}`         | Данные дня              | ✅ clientId   |
| `heys_products`             | База продуктов          | ✅ clientId   |
| `heys_profile`              | Профиль пользователя    | ✅ clientId   |
| `heys_norms`                | Нормы питания           | ✅ clientId   |
| `heys_hr_zones`             | Пульсовые зоны          | ✅ clientId   |
| `heys_ews_weekly_v1`        | EWS еженедельные данные | ✅ clientId   |
| `heys_pending_client_queue` | Очередь синхронизации   | ❌ глобальный |
| `heys_session_token`        | Сессия клиента          | ❌ глобальный |
| `heys_client_current`       | Текущий клиент          | ❌ глобальный |

> ⚠️ **Версионированные ключи**: `heys_dayv2_{date}` (не `heys_day_{date}`!) и
> `heys_ews_weekly_v1` (не `heys_ews_weekly`). Всегда используйте точные имена,
> иначе данные не синхронизируются.

---

## Правила сохранения продуктов

```javascript
// ✅ ПРАВИЛЬНО — с cloud sync
HEYS.products.setAll(newProducts); // React state + localStorage + cloud

// ✅ ПРАВИЛЬНО — через store с правильным ключом
HEYS.store.set('heys_products', newProducts); // localStorage + cloud

// ❌ НЕПРАВИЛЬНО — только localStorage
U.lsSet('heys_products', newProducts); // БЕЗ cloud sync!

// ❌ НЕПРАВИЛЬНО — неверный ключ
HEYS.store.set('products', newProducts); // Создаст heys_<clientId>_products!
```

---

## heysSyncCompleted — двухфазный dispatch

`heysSyncCompleted` генерируется **дважды** на каждый холодный старт:

| Фаза        | detail                                         | Что загружено                        |
| ----------- | ---------------------------------------------- | ------------------------------------ |
| **Phase A** | `{ clientId, phaseA: true }`                   | 5 критичных ключей (без истории)     |
| **Phase B** | `{ clientId, phase: 'full', viaYandex: true }` | 530+ ключей (включая `heys_dayv2_*`) |

```javascript
// ✅ Правильно: оставлять только Phase B (full sync)
window.addEventListener('heysSyncCompleted', function (e) {
  var detail = e && e.detail;
  if (!detail || !detail.clientId || detail.phaseA) return; // отклоняем Phase A
  // ... код, которому нужны все исторические данные
});

// ✅ Правильно: принять любой приход (DayTab, достаточно Phase A)
window.addEventListener('heysSyncCompleted', function (e) {
  var detail = e && e.detail;
  if (!detail || !detail.clientId) return; // отклоняем synthetic events
  setDayTabReady(true);
});

// ❌ НЕПРАВИЛЬНО: не фильтруют Phase A — получают пустую историю
window.addEventListener('heysSyncCompleted', computeHistoricalAnalytics);
```

> ⚠️ **Cascade Guard v6.2** в `heys_cascade_card_v1.js` является эталоном
> Phase-фильтрации. См. [SYNC_REFERENCE.md §12](../SYNC_REFERENCE.md) для полной
> документации guard.

---

## window.\_\_heysCascade\* — глобальные флаги Cascade Guard

Эти безсерверные флаги создаются `heys_cascade_card_v1.js`. Нельзя устанавливать
вручную без чёткого понимания последствий.

| Флаг                                | Тип     | Описание                                   |
| ----------------------------------- | ------- | ------------------------------------------ |
| `__heysCascadeBatchSyncReceived`    | boolean | Layer 1: разрешает `computeCascadeState()` |
| `__heysCascadeAllowEmptyHistory`    | boolean | Layer 2: разрешает render с 0 ист. днями   |
| `__heysCascadeGuardCount`           | number  | Счётчик подавленных рендеров               |
| `__heysCascadeGuardTimer`           | timeout | 5s фоллбэк для Layer 1                     |
| `__heysCascadeHistoryBypassTimer`   | timeout | 8s фоллбэк для Layer 2                     |
| `__heysCascadeLastRenderKey`        | string  | Дедупликация render по state key           |
| `__heysCascadeBatchSyncInvalidator` | boolean | Гард ординарной регистрации                |
| `__heysCascadeCacheInvalidator`     | boolean | Гард ординарной регистрации                |

```javascript
// Диагностика guard в консоли:
console.log({
  layer1: window.__heysCascadeBatchSyncReceived,
  layer2: window.__heysCascadeAllowEmptyHistory,
  suppressed: window.__heysCascadeGuardCount,
});
// Сброс для отладки (не использовать в prod):
window.__heysCascadeBatchSyncReceived = true;
window.__heysCascadeAllowEmptyHistory = true;
```

---

## Cloud Sync — YandexAPI

**Единый модуль**: `heys_yandex_api_v1.js`

```javascript
// ✅ ПРАВИЛЬНО — использовать YandexAPI
const result = await HEYS.YandexAPI.rpc('get_shared_products', {});
const data = await HEYS.YandexAPI.rest('clients', { method: 'GET' });

// ❌ ЗАПРЕЩЕНО — Supabase SDK удалён!
// cloud.client.from('table')  — НЕ работает
// cloud.client.rpc('fn')      — НЕ работает
```

---

## PIN-авторизация vs Curator auth

| Режим        | Кто использует        | Cloud auth    | Sync метод            | Флаг                 |
| ------------ | --------------------- | ------------- | --------------------- | -------------------- |
| **Curator**  | Нутрициолог (куратор) | JWT           | `bootstrapClientSync` | `_rpcOnlyMode=false` |
| **PIN auth** | Клиент (телефон+PIN)  | session_token | `syncClientViaRPC`    | `_rpcOnlyMode=true`  |

### Универсальный sync

```javascript
// ✅ ПРАВИЛЬНО — универсальный sync (автовыбор стратегии)
await HEYS.cloud.syncClient(clientId);

// ❌ НЕПРАВИЛЬНО — только для curator auth
await HEYS.cloud.bootstrapClientSync(clientId);
```

---

## Orphan продукты — Критический паттерн

### Симптомы

- Продукт добавлен в приём пищи, данные есть в штампе (MealItem)
- При следующей загрузке: `[HEYS] Orphan product: "Название"`
- Продукт **не найден** в `heys_products` базе

### Диагностика в консоли

```javascript
// Проверить orphan продукты
HEYS.orphanProducts.list();

// Восстановить из штампов
HEYS.orphanProducts.restore();

// Проверить базу продуктов
HEYS.products.getAll().length;

// Найти продукт по имени
HEYS.products.getAll().find((p) => p.name.includes('Гранола'));
```

---

## Pending Queue (Cloud Upload)

Все изменения через `Store.set()` → `saveClientKey()` попадают в очередь:

```javascript
// Цепочка: Store.set → saveClientKey → clientUpsertQueue.push → savePendingQueue
// savePendingQueue сохраняет в localStorage['heys_pending_client_queue']
// Debounce 500ms → doClientUpload → batch_upsert_client_kv_by_session RPC
```

| Параметр            | Значение                                         |
| ------------------- | ------------------------------------------------ |
| Debounce            | 500ms                                            |
| Persistence         | `heys_pending_client_queue` в localStorage       |
| Pre-logout flush    | `cloud.flushPendingQueue(5000)` — до 5с ожидания |
| Backoff при ошибках | `[15s, 20s, 30s]` (escalation)                   |

---

## Delta Sync (Products Fingerprint)

`heys_products` (~404KB) использует djb2 fingerprint:
`length:hash(name+updatedAt)`.

```javascript
// Если fingerprint совпадает с cloud._productsFingerprint → upload пропускается
// Grace period: 10с после syncCompleted → uploadheys_products блокируется
// Предотвращает паразитный re-upload только что скачанных данных
```
