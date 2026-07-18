# 🔧 HEYS App Systems Reference

> **Справочник инфраструктурных модулей приложения** Версия: 1.0.0 | Обновлено:
> 2026-02-26

> **Статус 2026-07-17:** документ сохранён как обзор нескольких подсистем, но
> его точные структуры, размеры, списки миграций и раздел Product Search не
> считаются текущими контрактами без проверки source. Актуальная граница
> продуктов/overlay/поиска описана в
> [`reference/systems/PRODUCTS_AND_SEARCH.md`](reference/systems/PRODUCTS_AND_SEARCH.md),
> storage/sync — в [`SYNC_REFERENCE.md`](SYNC_REFERENCE.md).

**📌 Основной справочник данных**:
[DATA_MODEL_REFERENCE.md](./DATA_MODEL_REFERENCE.md) — структуры данных, ключи,
базовые расчёты

**📚 Связанные документы**:

- [SCORING_REFERENCE.md](./SCORING_REFERENCE.md) — Status Score, Day Score, CRS
- [SYNC_REFERENCE.md](./SYNC_REFERENCE.md) — Архитектура синхронизации

---

## 📱 Widget Dashboard

**Файл**: `heys_widgets_core_v1.js`

### Grid система

| Параметр       | Значение | Описание                   |
| -------------- | -------- | -------------------------- |
| Columns        | 4        | Количество колонок         |
| CELL_HEIGHT_PX | 76       | Высота ячейки (px)         |
| CELL_GAP_PX    | 12       | Отступ между ячейками (px) |
| Max rows       | ∞        | Бесконечная прокрутка      |

### Размеры виджетов

| Размер | Колонки × Строки | Пример               |
| ------ | ---------------- | -------------------- |
| `2x2`  | 2 × 2            | Калории, Вода        |
| `4x2`  | 4 × 2            | Вес, Crash Risk      |
| `4x1`  | 4 × 1            | Heatmap (компактный) |

### Widget Data Structure

```javascript
{
  id: 'widget_calories_1',     // Уникальный ID
  type: 'calories',             // Тип виджета
  size: '2x2',                  // Размер
  position: { col: 0, row: 0 }, // Позиция в grid
  settings: {},                 // Настройки виджета
  createdAt: 1732886400000      // Timestamp создания
}
```

### Default Layout

```
Row 0: [calories 2x2] [water 2x2]
Row 2: [weight 4x2]
Row 4: [crashRisk 4x2]
Row 6: [heatmap 4x1]
```

### Undo/Redo

- `_history` stack: max 20 шагов назад
- `_future` stack: для redo
- Каждое действие (D&D, добавление, удаление) сохраняет snapshot

### localStorage

| Ключ                         | Описание                       |
| ---------------------------- | ------------------------------ |
| `heys_widget_layout_v1`      | Массив виджетов с позициями    |
| `heys_widget_layout_meta_v1` | Метаданные grid (версия, дата) |

---

## 🔄 Cascade System (Product Cascading)

**Файл**: `heys_add_product_step_v1.js`

Когда пользователь редактирует продукт (меняет БЖУ, ГИ и т.д.), все MealItems,
использующие этот продукт, пересчитываются автоматически.

### Events

| Event                     | Source          | Описание                    |
| ------------------------- | --------------- | --------------------------- |
| `heys:day-updated`        | `cascade-batch` | День обновлён после каскада |
| `heys:mealitems-cascaded` | cascade system  | MealItems пересчитаны       |

### Функция

```javascript
cascadeBatchProductUpdates(productId, newProductData);
// Обновляет ВСЕ MealItems во ВСЕХ днях, использующих productId
// Пересчитывает: kcal, prot, carbs, fat, gi, harm, микронутриенты
```

### v5.0 Enrichment

Каскад включает расширенные нутриенты (витамины, минералы, omega, sodium) — не
только базовые БЖУ.

---

## 🔍 Product Search (SmartSearch)

> Этот раздел описывает раннюю упрощённую модель. Текущий web-runtime —
> `heys_smart_search_v2.js`, вызываемый из `heys_add_product_step_v1.js` и
> `heys_core_v12.js`; workspace-пакет `@heys/search` не является фактическим
> движком основного legacy web flow.

### Алгоритм поиска

1. **Нормализация**: `normalizeText()` — lowercase, trim, ё→е
2. **Exact match**: название начинается с запроса
3. **Contains match**: название содержит запрос
4. **Typo tolerance**: Levenshtein distance ≤ 2 (для запросов ≥4 символов)
5. **Usage ranking**: часто используемые продукты выше

### usageStats

```javascript
// Map: productId → { count: число_использований, lastUsed: timestamp }
// Хранится в памяти, загружается из MealItems при старте
```

### Кандидаты поиска (в порядке приоритета)

1. Локальные продукты пользователя
2. Shared products из DB
3. History — недавно использованные

---

## 📦 Export/Import (Backup)

**Файл**: `heys_app_backup_export_v1.js`

### Формат бэкапа

```javascript
{
  exportedAt: '2026-02-26T12:00:00Z',  // ISO timestamp
  clientId: 'uuid-...',                 // ID клиента
  appVersion: '2026.02.26.1124',        // Версия приложения
  products: [...],                       // Локальные продукты
  sharedProducts: [...],                 // Shared products (кэш)
  profile: {...},                        // heys_profile
  norms: {...},                          // heys_norms
  hrZones: {...},                        // Пульсовые зоны
  days: { 'heys_dayv2_2026-02-26': {...}, ... },  // Все дни
  water: {...},                          // История воды
  scheduledAdvices: [...]                // Запланированные советы
}
```

### API

```javascript
HEYS.Backup.exportAll(); // → JSON blob
HEYS.Backup.importBackup(json); // Валидация + импорт
```

---

## 🎟️ Trial Queue

**Файл**: `heys_trial_queue_v1.js`

### Статусы очереди

| Статус                 | Описание                              |
| ---------------------- | ------------------------------------- |
| `NOT_IN_QUEUE`         | Не в очереди (новый или отвалившийся) |
| `PENDING`              | В очереди, ожидает слот               |
| `ASSIGNED`             | Слот назначен, триал активен          |
| `REJECTED`             | Отклонён (нет слотов)                 |
| `CANCELED`             | Отменён пользователем                 |
| `CANCELED_BY_PURCHASE` | Отменён из-за покупки подписки        |

### Trial Capacity (от сервера)

```javascript
{
  available_slots: 5,          // Свободные слоты
  total_slots: 50,             // Всего слотов
  queue_size: 12,              // Размер очереди
  is_accepting: true,          // Принимаются ли заявки
  offer_window_minutes: 30,    // Окно для активации (мин)
  trial_days: 7                // Длительность триала (дней)
}
```

### Cache

| Ключ                      | TTL | Описание                 |
| ------------------------- | --- | ------------------------ |
| `heys_trial_queue_status` | 60s | Текущий статус в очереди |
| `heys_trial_capacity`     | 30s | Ёмкость триал-системы    |

### RPC-функции

```javascript
HEYS.YandexAPI.rpc('trial_queue_join_by_session', { session_token });
HEYS.YandexAPI.rpc('trial_queue_status_by_session', { session_token });
HEYS.YandexAPI.rpc('trial_queue_cancel_by_session', { session_token });
HEYS.YandexAPI.rpc('get_trial_capacity', {});
```

---

## ⏰ Scheduled Advice / Notifications

**Файл**: `heys_advice_bundle_v1.js`

### localStorage

| Ключ                     | Тип   | Описание                                   |
| ------------------------ | ----- | ------------------------------------------ |
| `heys_scheduled_advices` | array | Массив запланированных советов/напоминаний |

### Scheduled Advice Structure

```javascript
{
  id: 'water_reminder',       // ID совета
  scheduledAt: '14:00',       // Время показа (HH:MM)
  repeatType: 'daily',        // daily / once / weekdays
  enabled: true,              // Активен ли
  lastShownAt: 1732886400000  // Когда показан последний раз
}
```

---

## 🔀 Migration System

**Файлы**: `heys_app_hooks_v1.js`, `heys_cascade_card_v1.js`, `heys_core_v12.js`

Автоматические миграции данных при обновлении приложения.

### Список миграций

| #   | Название                    | Файл                      | Описание                                   |
| --- | --------------------------- | ------------------------- | ------------------------------------------ |
| 1   | NET Atwater kcal            | `heys_core_v12.js`        | Пересчёт kcal100: 3×prot + 4×carbs + 9×fat |
| 2   | Product ID                  | `heys_core_v12.js`        | Присвоение UUID продуктам без ID           |
| 3   | Training data normalization | `heys_app_hooks_v1.js`    | quality/feelAfter → mood/wellbeing/stress  |
| 4   | CRS v6 → v7                 | `heys_cascade_card_v1.js` | Chronotype-adaptive meals, MT=8.5          |
| 5   | Deleted products tombstones | `heys_app_hooks_v1.js`    | Создание tombstone IDs для синхронизации   |
| 6   | Day schema version          | `heys_day_hooks.js`       | Установка `schemaVersion` в DayRecord      |

### Порядок выполнения

Миграции запускаются в `useEffect` при `appReady` hook. Каждая миграция
идемпотентна (безопасно запускать повторно). Версия схемы отслеживается через
`schemaVersion` в DayRecord.

---

## ☁️ Cloud Merge Logic

**Файл**: `heys_cloud_merge_v1.js`

### Стратегия: Last-Write-Wins

```javascript
// При конфликте выигрывает запись с большим updatedAt
// При равных updatedAt — tiebreaker по _sourceId (лексикографически)
```

### Игнорируемые поля при сравнении

Следующие поля исключаются при определении «изменилась ли запись»:

```javascript
['updatedAt', '_sourceId', '_syncCompletedAt', '_syncInProgress'];
```

### Sync-поля в DayRecord

| Поле               | Тип     | Описание                                     |
| ------------------ | ------- | -------------------------------------------- |
| `_syncCompletedAt` | number  | Timestamp успешного завершения синхронизации |
| `_syncInProgress`  | boolean | Mutex: true во время активной синхронизации  |

### dayScore Merge Logic

При конфликте `dayScore`:

- Если одна из сторон имеет `dayScoreManual=true` — ручное значение выигрывает
- Если обе ручные — стандартный last-write-wins

---

## Связанные файлы

| Файл                           | Описание                                       |
| ------------------------------ | ---------------------------------------------- |
| `heys_widgets_core_v1.js`      | Widget Dashboard грид, D&D, layout             |
| `heys_add_product_step_v1.js`  | Cascade System, SmartSearch                    |
| `heys_app_backup_export_v1.js` | Export/Import backup                           |
| `heys_trial_queue_v1.js`       | Trial Queue (6 statuses, capacity)             |
| `heys_advice_bundle_v1.js`     | Scheduled Advice, notifications                |
| `heys_app_hooks_v1.js`         | Migration System (NET Atwater, training, etc.) |
| `heys_cloud_merge_v1.js`       | Cloud merge (last-write-wins, dayScore merge)  |
| `heys_core_v12.js`             | Product migrations, SmartSearch utilities      |

---

**Версия документа**: 1.0.0 **Последнее обновление**: 2026-02-26
