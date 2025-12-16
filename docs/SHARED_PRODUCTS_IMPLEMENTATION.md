# Shared Products — Implementation Guide

> **Status**: Database schema complete, UI implementation in progress  
> **Created**: 2025-12-16  
> **Reference**: `docs/tasks/2025-12-16-shared-products-prompt.md`

---

## ✅ Completed

### 1. Database Schema (Supabase)

Все SQL миграции созданы и готовы к выполнению:

#### `database/2025-12-16_shared_products.sql`
- ✅ Таблица `shared_products` с полным набором полей
- ✅ VIEW `shared_products_public` для безопасного SELECT
- ✅ RLS политики (SELECT для всех, INSERT/UPDATE для authenticated)
- ✅ Индексы для быстрого поиска (включая pg_trgm)
- ✅ Триггер для `updated_at`

**Выполнить в Supabase Dashboard → SQL Editor:**
```sql
-- Скопировать весь файл database/2025-12-16_shared_products.sql
```

#### `database/2025-12-16_shared_products_blocklist.sql`
- ✅ Таблица `shared_products_blocklist` для локальной модерации
- ✅ RPC функция `get_client_blocklist(uuid)` для PIN-клиентов
- ✅ RLS политика (curator управляет только своим blocklist)

**Выполнить в Supabase Dashboard → SQL Editor:**
```sql
-- Скопировать весь файл database/2025-12-16_shared_products_blocklist.sql
```

#### `database/2025-12-16_shared_products_pending.sql`
- ✅ Таблица `shared_products_pending` для заявок PIN-клиентов
- ✅ RPC функция `create_pending_product()` для создания заявок
- ✅ RLS политики для доступа куратора к заявкам своих клиентов

**Выполнить в Supabase Dashboard → SQL Editor:**
```sql
-- Скопировать весь файл database/2025-12-16_shared_products_pending.sql
```

### 2. Data Model

#### Product Model (`heys_models_v1.js`)
- ✅ Добавлено поле `shared_origin_id` в typedef Product
- ✅ Функция `computeProductFingerprint(product)` — SHA-256 fingerprint для дедупликации
- ✅ Функция `normalizeProductName(name)` — нормализация имени для поиска

### 3. Storage Layer

#### Cloud Methods (`heys_storage_supabase_v1.js`)
- ✅ `cloud.searchSharedProducts(query, options)` — поиск в общей базе
- ✅ `cloud.publishToShared(product)` — публикация продукта (curator)
- ✅ `cloud.createPendingProduct(clientId, product)` — создание заявки (PIN)
- ✅ `cloud.getPendingProducts()` — получить pending-заявки куратора
- ✅ `cloud.approvePendingProduct(pendingId, productData)` — подтвердить заявку
- ✅ `cloud.rejectPendingProduct(pendingId, reason)` — отклонить заявку
- ✅ `cloud.getBlocklist()` — получить blocklist куратора
- ✅ `cloud.blockProduct(productId)` — добавить в blocklist
- ✅ `cloud.unblockProduct(productId)` — убрать из blocklist

---

## 🚧 Remaining Work

### 4. UI — ProductsManager Enhancement

**Файл**: `apps/web/heys_core_v12.js`

Необходимо обновить `ProductsManager` для поддержки двух источников:

```javascript
// 1. Добавить state для переключателя источника
const [productSource, setProductSource] = React.useState('both'); // 'personal' | 'shared' | 'both'

// 2. Обновить поиск с учётом источника
async function searchProducts(query) {
  let results = [];
  
  if (productSource === 'personal' || productSource === 'both') {
    // Текущий поиск по личной базе
    const personal = searchPersonalProducts(query);
    results = results.concat(personal.map(p => ({ ...p, source: 'personal' })));
  }
  
  if (productSource === 'shared' || productSource === 'both') {
    // Поиск в shared (если online)
    if (HEYS.cloud.getStatus() === 'online') {
      const { data: shared } = await HEYS.cloud.searchSharedProducts(query);
      if (shared) {
        results = results.concat(shared.map(p => ({ ...p, source: 'shared' })));
      }
    }
  }
  
  // Дедуп: если есть локальный клон shared — показываем только personal
  return deduplicateResults(results);
}

// 3. Клонирование shared в personal при выборе
async function selectProduct(product) {
  if (product.source === 'shared') {
    // Проверяем: есть ли уже клон?
    const existing = personalProducts.find(p => p.shared_origin_id === product.id);
    if (existing) {
      return existing;
    }
    
    // Клонируем в личную базу
    const clone = {
      ...product,
      id: HEYS.models.uuid(),
      shared_origin_id: product.id
    };
    
    const updated = [...personalProducts, clone];
    HEYS.products.setAll(updated);
    return clone;
  }
  
  return product;
}
```

### 5. UI — RationTab Split

**Файл**: `apps/web/heys_app_v12.js` или `heys_core_v12.js` (где RationTab)

Разделить вкладку «Рацион» на две подвкладки:

```jsx
function RationTab() {
  const [activeSubTab, setActiveSubTab] = React.useState('personal');
  const isCurator = HEYS.cloud.getUser() && !HEYS.cloud._rpcOnlyMode;
  
  return (
    <div className="ration-tab">
      {/* Tabs Navigation */}
      <div className="flex gap-2 mb-4">
        <button
          className={`flex-1 min-h-11 ${activeSubTab === 'personal' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setActiveSubTab('personal')}
        >
          👤 Продукты клиента
        </button>
        {isCurator && (
          <button
            className={`flex-1 min-h-11 ${activeSubTab === 'shared' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveSubTab('shared')}
          >
            🌐 Общая база
          </button>
        )}
      </div>
      
      {/* Tab Content */}
      {activeSubTab === 'personal' && <PersonalProductsView />}
      {activeSubTab === 'shared' && isCurator && <SharedProductsView />}
    </div>
  );
}
```

### 6. UI — PersonalProductsView

```jsx
function PersonalProductsView() {
  const [source, setSource] = React.useState(
    U.lsGet('heys_product_source_preference', 'both')
  );
  
  // Сохранение настройки per-client
  React.useEffect(() => {
    U.lsSet('heys_product_source_preference', source);
  }, [source]);
  
  return (
    <div>
      {/* Переключатель источника */}
      <div className="flex gap-2 mb-4">
        <button 
          className={`flex-1 min-h-11 ${source === 'personal' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSource('personal')}
        >
          👤 Мои
        </button>
        <button 
          className={`flex-1 min-h-11 ${source === 'shared' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSource('shared')}
        >
          🌐 Общие
        </button>
        <button 
          className={`flex-1 min-h-11 ${source === 'both' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setSource('both')}
        >
          👤+🌐 Оба
        </button>
      </div>
      
      {/* ProductsManager с обновлённым поиском */}
      <ProductsManager source={source} />
    </div>
  );
}
```

### 7. UI — SharedProductsView (Curator-only)

```jsx
function SharedProductsView() {
  const [pending, setPending] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  
  // Загрузка pending при монтировании
  React.useEffect(() => {
    loadPending();
  }, []);
  
  async function loadPending() {
    const { data } = await HEYS.cloud.getPendingProducts();
    setPending(data || []);
  }
  
  async function handleApprove(pendingId, productData) {
    const { status } = await HEYS.cloud.approvePendingProduct(pendingId, productData);
    if (status === 'approved') {
      loadPending(); // Обновить список
    }
  }
  
  async function handleReject(pendingId, reason) {
    await HEYS.cloud.rejectPendingProduct(pendingId, reason);
    loadPending();
  }
  
  async function searchShared(query) {
    if (!query) return;
    setLoading(true);
    const { data } = await HEYS.cloud.searchSharedProducts(query);
    setSearchResults(data || []);
    setLoading(false);
  }
  
  return (
    <div>
      {/* Pending Block */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold mb-2">
            🆕 Ожидают подтверждения ({pending.length})
          </h3>
          {pending.map(p => (
            <PendingProductCard
              key={p.id}
              pending={p}
              onApprove={() => handleApprove(p.id, p.product_data)}
              onReject={(reason) => handleReject(p.id, reason)}
            />
          ))}
        </div>
      )}
      
      {/* Search */}
      <input
        type="text"
        placeholder="Поиск в общей базе..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && searchShared(searchQuery)}
        className="w-full min-h-11 px-4 border rounded mb-4"
      />
      
      {/* Results */}
      {loading && <div>Загрузка...</div>}
      {!loading && searchResults.map(product => (
        <SharedProductCard
          key={product.id}
          product={product}
          onBlock={() => handleBlock(product.id)}
        />
      ))}
    </div>
  );
}
```

### 8. UI — Product Creation Flow

**Файл**: `apps/web/heys_add_product_step_v1.js` или где создаётся продукт

При сохранении нового продукта:

```javascript
async function saveNewProduct(productData) {
  // 1. Сохраняем в личную базу (обязательно)
  const localProduct = {
    ...productData,
    id: HEYS.models.uuid()
  };
  
  const updated = [...existingProducts, localProduct];
  HEYS.products.setAll(updated);
  
  // 2. Публикация в shared (если включена галочка)
  const shouldPublish = getPublishToSharedCheckbox(); // из UI state
  
  if (shouldPublish) {
    const isCurator = HEYS.cloud.getUser() && !HEYS.cloud._rpcOnlyMode;
    const isPinClient = HEYS.cloud._rpcOnlyMode;
    
    if (isCurator) {
      // Куратор — публикуем сразу
      const result = await HEYS.cloud.publishToShared(localProduct);
      
      if (result.status === 'exists') {
        // Показать модалку: "Похожий продукт уже есть"
        showDuplicateModal(result.data);
      } else if (result.status === 'published') {
        showNotification('Продукт опубликован в общую базу');
      }
    } else if (isPinClient) {
      // PIN-клиент — создаём pending-заявку
      const clientId = HEYS.cloud.getPinAuthClient();
      const result = await HEYS.cloud.createPendingProduct(clientId, localProduct);
      
      if (result.status === 'pending') {
        showNotification('Заявка отправлена куратору');
      } else if (result.status === 'exists') {
        showNotification('Продукт уже существует в общей базе');
      }
    }
  }
  
  return localProduct;
}
```

### 9. Offline Queue

**Файл**: `apps/web/heys_storage_layer_v1.js` или отдельный файл

Для публикации offline:

```javascript
// localStorage key: heys_shared_pending_queue
const PENDING_QUEUE_KEY = 'heys_shared_pending_queue';

function addToOfflineQueue(product) {
  const queue = U.lsGet(PENDING_QUEUE_KEY, []);
  queue.push({
    product,
    fingerprint: '', // вычислим при online
    retryCount: 0,
    createdAt: Date.now()
  });
  U.lsSet(PENDING_QUEUE_KEY, queue);
}

async function processPendingQueue() {
  if (HEYS.cloud.getStatus() !== 'online') return;
  
  const queue = U.lsGet(PENDING_QUEUE_KEY, []);
  const remaining = [];
  
  for (const item of queue) {
    if (item.retryCount >= 3) {
      // Max retries exceeded
      showNotification(`Не удалось опубликовать "${item.product.name}"`);
      continue;
    }
    
    const result = await HEYS.cloud.publishToShared(item.product);
    
    if (result.error) {
      item.retryCount++;
      remaining.push(item);
    }
    // Успешно — не добавляем в remaining
  }
  
  U.lsSet(PENDING_QUEUE_KEY, remaining);
}

// Подписка на online event
window.addEventListener('online', () => {
  setTimeout(processPendingQueue, 2000);
});
```

### 10. Migration Script

**Файл**: `apps/web/heys_migration_shared_v1.js` (новый)

Миграция существующих личных продуктов в shared:

```javascript
async function migratePersonalProductsToShared() {
  const user = HEYS.cloud.getUser();
  if (!user) return;
  
  // Проверяем флаг миграции
  const profile = U.lsGet('heys_profile', {});
  if (profile.migrated_to_shared) {
    console.log('Migration already completed');
    return;
  }
  
  const products = HEYS.products.getAll();
  const batchSize = 50;
  let migrated = 0;
  let skipped = 0;
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    
    for (const product of batch) {
      const result = await HEYS.cloud.publishToShared(product);
      
      if (result.status === 'published') {
        migrated++;
      } else {
        skipped++;
      }
    }
    
    // Показываем прогресс
    const progress = Math.round(((i + batch.length) / products.length) * 100);
    updateProgressBar(progress);
  }
  
  // Сохраняем флаг
  profile.migrated_to_shared = true;
  U.lsSet('heys_profile', profile);
  
  showNotification(`Миграция завершена: ${migrated} добавлено, ${skipped} пропущено`);
}

// Вызов при первом входе куратора
HEYS.migrateShared = migratePersonalProductsToShared;
```

---

## 🔧 Integration Points

### 1. Поиск продуктов

**Где**: `heys_core_v12.js` — ProductsManager

**Изменения**:
- Добавить state `productSource`
- Обновить `search()` для поддержки двух источников
- Дедупликация результатов по `shared_origin_id`

### 2. Создание продукта

**Где**: `heys_add_product_step_v1.js`

**Изменения**:
- Добавить checkbox "Опубликовать в общую базу" (default: checked)
- После сохранения в personal — публикация/pending в зависимости от режима
- Модалка при конфликте fingerprint

### 3. Выбор продукта

**Где**: Meal создание (в MealItem)

**Изменения**:
- Если `product.source === 'shared'` — клонировать в personal
- Сохранять `shared_origin_id` для предотвращения дублей
- В `MealItem.product_id` всегда использовать локальный ID

---

## 📝 Testing Checklist

### Curator Mode
- [ ] Создание продукта → публикация в shared
- [ ] Поиск в shared → результаты возвращаются
- [ ] Выбор shared продукта → клонируется в personal
- [ ] Pending-заявки отображаются
- [ ] Approve pending → продукт появляется в shared
- [ ] Reject pending → заявка помечается rejected
- [ ] Blocklist → продукт скрывается из поиска

### PIN Mode
- [ ] Создание продукта → pending-заявка создаётся
- [ ] Поиск работает (если есть доступ к shared)
- [ ] Подвкладка "🌐 Общая база" НЕ отображается

### Offline
- [ ] Создание продукта offline → добавляется в queue
- [ ] При восстановлении online → queue обрабатывается
- [ ] Max retries (3) → уведомление об ошибке

### Edge Cases
- [ ] Дубликат fingerprint → модалка "Использовать существующий / Создать свой"
- [ ] Повторный выбор shared → не создаётся новый клон
- [ ] Orphan protection → MealItem всегда ссылается на personal product

---

## 🎯 Next Steps

1. **Выполнить SQL миграции** в Supabase Dashboard
2. **Реализовать UI компоненты** (RationTab split, PersonalProductsView, SharedProductsView)
3. **Обновить ProductsManager** для поддержки двух источников
4. **Интегрировать публикацию** при создании продукта
5. **Тестировать** на mobile и desktop
6. **Запустить миграцию** существующих продуктов

---

## 📚 Resources

- **Prompt**: `docs/tasks/2025-12-16-shared-products-prompt.md`
- **Data Model**: `docs/DATA_MODEL_REFERENCE.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
- **SQL Files**: `database/2025-12-16_shared_products*.sql`
