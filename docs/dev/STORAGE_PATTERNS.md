# 🗄️ HEYS Storage Patterns

> Правила работы с localStorage и cloud sync

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

| Ключ                  | Описание             | Namespace     |
| --------------------- | -------------------- | ------------- |
| `heys_dayv2_{date}`   | Данные дня           | ✅ clientId   |
| `heys_products`       | База продуктов       | ✅ clientId   |
| `heys_profile`        | Профиль пользователя | ✅ clientId   |
| `heys_norms`          | Нормы питания        | ✅ clientId   |
| `heys_hr_zones`       | Пульсовые зоны       | ✅ clientId   |
| `heys_client_current` | Текущий клиент       | ❌ глобальный |

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

| Режим        | Кто использует        | Supabase user | Sync метод            | Флаг                 |
| ------------ | --------------------- | ------------- | --------------------- | -------------------- |
| **Curator**  | Нутрициолог (куратор) | ✅ Есть       | `bootstrapClientSync` | `_rpcOnlyMode=false` |
| **PIN auth** | Клиент (телефон+PIN)  | ❌ Нет        | `syncClientViaRPC`    | `_rpcOnlyMode=true`  |

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
