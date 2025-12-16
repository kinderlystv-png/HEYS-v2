# ✅ DONE: Shared Products + модерация

**Completed**: 2025-12-17 | **Time**: ~8 hours | **Status**: Fully Implemented

---

## 📌 Что было сделано

### Database (Supabase)
- ✅ Таблица `shared_products` — глобальная база продуктов всех пользователей HEYS
- ✅ VIEW `shared_products_public` — безопасный SELECT с `is_mine` флагом
- ✅ Таблица `shared_products_blocklist` — локальная модерация (скрытие для себя)
- ✅ Таблица `shared_products_pending` — очередь заявок от PIN-клиентов
- ✅ RLS политики: SELECT всем, INSERT authenticated, UPDATE автору
- ✅ pg_trgm индекс для быстрого поиска
- ✅ Fingerprint (SHA-256) для глобальной дедупликации
- ✅ RPC функции: `create_pending_product()`, `get_client_blocklist()`

**SQL файлы**:
- `database/2025-12-16_shared_products.sql`
- `database/2025-12-16_shared_products_blocklist.sql`
- `database/2025-12-16_shared_products_pending.sql`

### Data Model (`heys_models_v1.js`)
- ✅ Поле `shared_origin_id` — защита от дублей клонов
- ✅ `computeProductFingerprint(product)` — SHA-256 fingerprint
- ✅ `normalizeProductName(name)` — нормализация (lowercase, ё→е)

### Storage Layer (`heys_storage_supabase_v1.js`)
- ✅ `cloud.searchSharedProducts(query, options)` — поиск с blocklist фильтрацией
- ✅ `cloud.getAllSharedProducts(options)` — загрузка всей базы
- ✅ `cloud.publishToShared(product)` — публикация с дедупом
- ✅ `cloud.deleteSharedProduct(productId)` — удаление (куратор/автор)
- ✅ `cloud.createPendingProduct(clientId, product)` — заявка от PIN
- ✅ `cloud.getPendingProducts()` — список заявок
- ✅ `cloud.approvePendingProduct(pendingId, productData)` — подтверждение
- ✅ `cloud.rejectPendingProduct(pendingId, reason)` — отклонение
- ✅ `cloud.getBlocklist()` / `blockProduct()` / `unblockProduct()` — blocklist

### UI (`heys_core_v12.js` — ProductsManager)
- ✅ **Две подвкладки**: «👤 Продукты клиента» и «🌐 Общая база»
- ✅ **Переключатель источника поиска**: 👤 Мои / 🌐 Общие / 👤+🌐 Оба
- ✅ **Pending-заявки**: бейдж с количеством, Approve/Reject кнопки
- ✅ **Таблица shared**: поиск, фильтрация, пагинация
- ✅ **Кнопки действий**:
  - ➕ Клонировать в личную базу
  - 🚫 Скрыть для меня (blocklist)
  - 🗑️ Удалить (только для куратора или автора)

### Модалка добавления продукта (`heys_add_product_step_v1.js`)
- ✅ Поиск в shared базе при вводе
- ✅ Автоклонирование при выборе shared продукта
- ✅ Публикация нового продукта в shared (curator) или pending (PIN)
- ✅ Вычисление `kcal100` при нормализации результатов

### Автоклонирование (`heys_day_v12.js`)
- ✅ `HEYS.products.addFromShared(sharedProduct)` — глобальная функция
- ✅ При добавлении shared продукта в приём пищи — автоматический клон в личную базу

---

## 📊 Архитектура

```
Личная база (heys_products)          Общая база (shared_products)
        ↓                                     ↓
    MealItem.product_id              Глобальный пул всех пользователей
        ↓                                     ↓
  Всегда локальная ссылка              Fingerprint дедупликация
        ↓                                     ↓
  Защита от orphan products            Модерация через blocklist
```

**Ключевой принцип**: MealItem всегда ссылается на продукт из личной базы. Shared — это каталог для поиска, клоны автоматически создаются при использовании.

---

## 📁 Связанные файлы

| Файл | Назначение |
|------|------------|
| `apps/web/heys_core_v12.js` | ProductsManager UI, подвкладки, pending |
| `apps/web/heys_storage_supabase_v1.js` | Cloud API для shared |
| `apps/web/heys_models_v1.js` | Fingerprint, normalizeProductName |
| `apps/web/heys_add_product_step_v1.js` | Поиск shared при создании |
| `apps/web/heys_day_v12.js` | Автоклонирование при добавлении в приём |
| `docs/SHARED_PRODUCTS_STATUS.md` | Полный статус реализации |
| `docs/SHARED_PRODUCTS_SQL_READY.md` | Готовые SQL запросы |

---

## ✅ Quality Gates

- [x] `pnpm type-check` — PASS
- [x] `pnpm lint` — PASS  
- [x] `pnpm build` — PASS
- [x] Ручное тестирование в браузере — работает
