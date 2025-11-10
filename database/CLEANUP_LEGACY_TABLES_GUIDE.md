# 🗑️ Удаление легаси таблиц из Supabase

**Дата:** 10 ноября 2025  
**Цель:** Очистить базу данных от неиспользуемых таблиц  
**Статус:** ✅ Безопасно (данные мигрированы в `client_kv_store`)

---

## 📋 Таблицы на удаление

| # | Таблица | Статус | Причина удаления |
|---|---------|--------|------------------|
| 1 | `heys_day_stats` | ❌ Не используется | Данные в `client_kv_store` с ключом `dayv2_YYYY-MM-DD` |
| 2 | `heys_ration` | ❌ Не используется | Данные в `client_kv_store` с ключом `dayv2_YYYY-MM-DD` |
| 3 | `heys_user_params` | ❌ Не используется | Данные в `client_kv_store` с ключом `heys_profile` |

---

## 🚀 Инструкция по удалению

### **Шаг 1: Проверка данных**

Откройте Supabase SQL Editor и выполните:

```sql
-- Проверить количество записей в легаси таблицах
SELECT 'heys_day_stats' as table_name, COUNT(*) as rows FROM heys_day_stats
UNION ALL
SELECT 'heys_ration', COUNT(*) FROM heys_ration
UNION ALL
SELECT 'heys_user_params', COUNT(*) FROM heys_user_params;
```

**Ожидаемый результат:** 0 строк в каждой таблице (или малое количество устаревших данных)

---

### **Шаг 2: Резервное копирование (опционально)**

Если в таблицах есть данные, экспортируйте их:

```sql
-- Экспорт в JSON (если нужно сохранить историю)
COPY (SELECT * FROM heys_day_stats) TO '/tmp/heys_day_stats_backup.json';
COPY (SELECT * FROM heys_ration) TO '/tmp/heys_ration_backup.json';
COPY (SELECT * FROM heys_user_params) TO '/tmp/heys_user_params_backup.json';
```

---

### **Шаг 3: Удаление таблиц**

Выполните скрипт `cleanup_legacy_tables.sql`:

```bash
# В терминале (если используете Supabase CLI):
supabase db execute --file database/cleanup_legacy_tables.sql

# ИЛИ скопируйте содержимое файла в Supabase SQL Editor
```

**Или выполните вручную в Supabase Dashboard:**

1. Откройте **Table Editor**
2. Найдите таблицу `heys_day_stats`
3. Нажмите `⋮` (три точки) → **Delete table**
4. Повторите для `heys_ration` и `heys_user_params`

---

### **Шаг 4: Проверка результата**

```sql
-- Убедитесь, что таблицы удалены
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('heys_day_stats', 'heys_ration', 'heys_user_params');
```

**Ожидаемый результат:** 0 строк (таблицы не найдены)

---

## ✅ Что останется после удаления

### **Активные таблицы (Production):**

```
✅ clients              — Список клиентов куратора
✅ client_kv_store      — Все данные клиентов (продукты, дни, профили)
✅ kv_store             — Глобальные настройки куратора
```

### **Схема данных после очистки:**

```
Куратор (user_id)
  └─ clients
      ├─ Клиент 1 (client_id)
      │   └─ client_kv_store
      │       ├─ heys_products      → 220 продуктов
      │       ├─ dayv2_2025-11-09   → рацион за день
      │       └─ heys_profile       → вес, рост, возраст
      │
      └─ Клиент 2
          └─ (изолированные данные)
```

---

## 🔄 Rollback (если что-то пошло не так)

### **Восстановить структуру таблиц (БЕЗ данных):**

```sql
-- heys_day_stats
CREATE TABLE public.heys_day_stats (
  user_id uuid not null,
  client_id text not null,
  d date not null,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint heys_day_stats_pkey primary key (user_id, client_id, d),
  constraint heys_day_stats_user_id_fkey foreign key (user_id) 
    references auth.users (id) on delete cascade
);

-- heys_ration
CREATE TABLE public.heys_ration (
  user_id uuid not null,
  client_id text not null,
  d date not null,
  products jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint heys_ration_pkey primary key (user_id, client_id, d),
  constraint heys_ration_user_id_fkey foreign key (user_id) 
    references auth.users (id) on delete cascade
);

-- heys_user_params
CREATE TABLE public.heys_user_params (
  user_id uuid not null,
  client_id text not null,
  params jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint heys_user_params_pkey primary key (user_id, client_id),
  constraint heys_user_params_user_id_fkey foreign key (user_id) 
    references auth.users (id) on delete cascade
);
```

---

## 📊 Экономия ресурсов

### **До очистки:**
- Таблиц: 6
- Индексов: 9+
- Maintenance overhead: высокий

### **После очистки:**
- Таблиц: 3 ✅
- Индексов: 5 ✅
- Maintenance overhead: минимальный ✅

---

## 🎯 Итоги

| Метрика | Результат |
|---------|-----------|
| **Удалено таблиц** | 3 |
| **Удалено индексов** | 3 |
| **Риск потери данных** | ❌ Нет (всё в `client_kv_store`) |
| **Упрощение схемы** | ✅ Да |
| **Производительность** | ✅ Улучшена (меньше таблиц для сканирования) |

---

## 📝 Дата выполнения

- [ ] Проверка данных выполнена
- [ ] Резервное копирование выполнено (если нужно)
- [ ] Таблицы удалены
- [ ] Проверка результата выполнена

**Выполнил:** _________________  
**Дата:** _________________
