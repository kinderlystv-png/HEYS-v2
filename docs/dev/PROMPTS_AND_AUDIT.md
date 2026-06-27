# 📝 HEYS Prompts & Audit Guide

---

## Создание промптов

**При запросе "сделай промпт" / "создай промпт":**

### Расположение

- **Шаблон**: `docs/TASK_PROMPT_TEMPLATE.md`
- **Файл**: `docs/tasks/YYYY-MM-DD-slug.md`

### Обязательные секции

```markdown
## 📌 TL;DR

- **Цель** — 1 предложение
- **Что делаем** — нумерованный список
- **Зачем** — список выгод
- **Время** — оценка в часах
```

### Правила

- Конкретные файлы и пути
- **НЕ писать примеры кода** — AI сам сгенерирует
- Русский язык для описаний

### При создании промпта

1. Создать файл в `docs/tasks/YYYY-MM-DD-slug.md`
2. Заполнить TL;DR секцию
3. Добавить задачу в `todo.md`

### При выполнении промпта

- Отмечать `[x]` задачи по мере выполнения
- После всех задач → `pnpm type-check && pnpm build`
- Перенести в `docs/tasks/archive/`
- Перенести задачу в `done.md`

---

## Глубокий аудит промпта

**При запросе "сделай аудит промпта" / "проверь промпт":**

### Обязательный чеклист (ДО правок)

1. **Прочитать ВСЕ файлы** из таблицы "Ключевые файлы" (параллельно!)
2. **Найти существующие паттерны** — `semantic_search`
3. **Посмотреть шире** — связанные компоненты
4. **Проверить на оверкилл** — убрать лишнее

### Вопросы для каждого шага

- ❓ Это **production-ready** или заглушка?
- ❓ Есть ли **готовый паттерн** в проекте?
- ❓ Продуман ли **UX**: loading, errors, empty states?
- ❓ Не **дублирует** ли существующий функционал?

### Признаки недоделки

- Нет loading/error состояний
- Жёсткие значения вместо адаптивных
- Нет анимации где она ожидается
- Нет feedback при действии пользователя

### Формат аудита

```markdown
## 🔴 Критические (ломают функционал)

- [ ] Проблема 1 → Решение

## 🟡 Важные (могут вызвать баги)

- [ ] Проблема 2 → Решение

## 🟢 Улучшения (nice to have)

- [ ] Проблема 3 → Решение

## ✅ Проверено и ОК

- Пункт 1
```

---

## Ручное тестирование UI

### Mobile (Chrome DevTools → iPhone SE)

- [ ] Основной функционал работает
- [ ] Touch targets ≥44px (`min-h-11`)
- [ ] Интерактивные элементы не конфликтуют
- [ ] Анимации плавные

### Desktop (>768px)

- [ ] Hover-эффекты работают
- [ ] Keyboard навигация (Enter, Escape)

### Общее

- [ ] `pnpm type-check` проходит
- [ ] `pnpm build` проходит
- [ ] Нет ошибок в console

---

## AI Workflow Rules

1. **HMR работает** — Vite автоматически применяет изменения
2. **Коммиты только по запросу** — жди команды "коммит" или "пуш"
3. **Минимум шагов** — используй HMR, не делай лишних действий
4. **todo.md = только задачи** — выполненное сразу в `done.md`
5. **НИКОГДА НЕ ОТКАТЫВАЙ ФАЙЛЫ** без явного согласия!

---

## 🎯 Контекст-ориентированные триггеры

### При работе с API/RPC:

- ✅ Никогда не доверяй browser-supplied `client_id`: резолвь canonical client
  server-side через `*_by_session`, curator ownership или server-issued
  `context_id`
- ✅ Проверяй allowlist в `SECURITY_RUNBOOK.md`
- ✅ Добавляй rate-limiting для новых endpoints
- ❌ НЕ используй deprecated функции (`verify_client_pin`, `get_client_data`)

### При работе с БД:

- ✅ Проверяй RLS политики **перед** изменениями
- ✅ Используй транзакции для связанных операций
- ✅ Логируй критичные данные (consents, payments)
- ✅ PK для `client_kv_store` = `(client_id, k)`, не `(user_id, client_id, k)`

### При добавлении новых фич:

1. Проверь `HEYS_BRIEF.md` — возможно уже запланировано
2. Проверь технический долг (секция 5 в BRIEF)
3. Убедись что не нарушает **152-ФЗ compliance**
4. Проверь влияние на **SLA куратора** (≤30 мин реакция)

---

## ⚠️ Чеклисты безопасности

### Перед ЛЮБЫМ коммитом:

- [ ] Нет хардкода credentials/tokens
- [ ] Нет `console.log` с sensitive data
- [ ] Нет прямых SQL запросов (используй RPC)
- [ ] Нет загрузки внешних CDN (152-ФЗ!)
- [ ] Используется `YandexAPI`, не `Supabase SDK`

### При изменении схемы БД:

- [ ] Миграция **обратно совместима**
- [ ] RLS политики обновлены
- [ ] Env vars используют `PG_*` (не `DB_*`)

### При работе с платежами:

- [ ] Идемпотентность операций (dedupe_key)
- [ ] Логирование в `yookassa_webhook_events`
- [ ] Проверка `subscription_status` перед действием

### При работе с auth:

- [ ] Используй `verify_client_pin_v3` (не v1/v2)
- [ ] Проверяй `locked_until` в `pin_login_attempts`
- [ ] Session token хэшируется (`token_hash` BYTEA)

---

## 💼 Бизнес-контекст для решений

### Приоритеты (от высшего к низшему):

1. **152-ФЗ Compliance** — non-negotiable
2. **Безопасность** — никаких компромиссов
3. **SLA куратора** — ≤30 мин реакция
4. **Конверсия триала** — 7 дней на "вау-эффект"
5. **UX клиента** — < 30 сек на добавление еды
6. **Новые фичи** — только после стабильности

### Trade-offs:

| Выбирай              | Вместо              | Почему                    |
| -------------------- | ------------------- | ------------------------- |
| Надёжность           | Скорость разработки | Платежи/данные критичны   |
| Простота             | Элегантность        | Куратор должен понимать   |
| Безопасный вариант   | Оптимальный         | Сомневаешься = безопасный |
| Существующий паттерн | Новое решение       | Консистентность кода      |

### Критичные метрики:

- **Конверсия**: `trial_start` → `payment_success`
- **Активация**: ≥4 активных дня за триал
- **Производительность**: главный экран < 1 сек

---

## 📝 Стиль ответов

### Структура (всегда):

1. **Суть** — ответ в 1-2 предложения
2. **Код/детали** — если нужно
3. **Риски** — что может пойти не так
4. **Альтернативы** — другие подходы (если есть)

### Хорошие ответы:

```
✅ "Это нарушит 152-ФЗ. Используй Yandex Metrica вместо GA4"
✅ "Функция deprecated. Замени verify_client_pin на verify_client_pin_v3"
✅ "Добавь в технический долг — сейчас не критично, но нужно к v2"
✅ "Уже есть паттерн в heys_widgets_v1.js:245 — используй его"
```

### Плохие ответы:

```
❌ Длинные объяснения без кода
❌ Код без проверки на безопасность
❌ Изменения игнорирующие существующие паттерны
❌ "Это сложно" без альтернатив
```

---

## 🔄 Паттерн рефакторинга/миграции

### Приоритеты рефакторинга:

1. Безопасность (SECURITY_RUNBOOK)
2. Критичные пути производительности
3. Dead code removal
4. Консолидация дублирования

### Паттерн версионирования:

```
1. Создай новую версию (fn_v2, fn_v3)
2. Добавь deprecation warning в старую
3. Мигрируй вызовы постепенно
4. Удали старую через 2 релиза
```

### При рефакторинге ВСЕГДА:

- [ ] Сохраняй обратную совместимость
- [ ] Документируй breaking changes
- [ ] Тестируй оба пути (старый и новый)
- [ ] Добавляй в CHANGELOG

---

## 🏠 HEYS-specific паттерны

### Curator flow:

```javascript
// ВСЕГДА проверяй curator_id в RLS
// ВСЕГДА логируй действия куратора
// Поддерживай bulk операции (batch_upsert_client_kv_by_session)
```

### Trial механика:

```javascript
// start_trial_by_session — единая точка входа
// Проверяй trial_ends_at во ВСЕХ платных функциях
// Queue system: request_trial → assign_trials_from_queue
```

### Widget система:

```javascript
// S/M/L размеры = уровень детализации
// Popup для полной информации (по клику)
// Персистентность в client_kv_store
// Шаблон: см. heys_widgets_v1.js
```

### Insulin Wave расчёт:

```javascript
// 37 факторов — КЭШИРУЙ результат
// Пересчитывай только при изменении данных
// Используй debounce при частых обновлениях
```

### Storage паттерны:

```javascript
// U.lsSet/lsGet — с clientId namespace
// HEYS.store — с кэшем и watchers
// HEYS.YandexAPI.rpc() — для cloud sync
// НИКОГДА напрямую localStorage.setItem()
```

### Добавление продукта:

```javascript
// 1. Локально: HEYS.products.setAll(newProducts)
// 2. Cloud: create_pending_product_by_session → publish
// 3. Shared: publish_shared_product_by_session
// ВРЕМЯ: < 30 сек от фото до записи в дневник
```

---

## 🚨 Проактивные предупреждения (Always Check)

**При любом изменении кода автоматически проверяй:**

| Если видишь                        | ⚠️ Предупреди                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `supabase.from()` / `cloud.client` | Используй `HEYS.YandexAPI.rpc()`                                               |
| `localStorage.setItem()`           | Используй `U.lsSet()` с namespace                                              |
| `console.log()` с данными          | Замени на `HEYS.analytics.track*()`                                            |
| UUID/client_id в параметрах RPC    | Резолвь client server-side: `*_by_session`, curator ownership или `context_id` |
| `fetch()` к внешним API            | Проверь 152-ФЗ compliance                                                      |
| `style={{}}` в JSX                 | Используй Tailwind классы                                                      |
| Новая таблица/колонка              | Нужны RLS политики                                                             |
| `verify_client_pin`                | Используй `verify_client_pin_v3`                                               |

---

## 🔗 Quick Reference (частые файлы)

| Задача            | Файл      | Путь                                           |
| ----------------- | --------- | ---------------------------------------------- |
| Добавить RPC      | allowlist | `yandex-cloud-functions/heys-api-rpc/index.js` |
| Новая SQL функция | миграция  | `database/YYYY-MM-DD_*.sql`                    |
| UI компонент      | DayTab    | `apps/web/public/js/heys_day_v12.js`           |
| Аналитика         | модули    | `apps/web/public/js/heys_*_v1.js`              |
| Профиль/настройки | UserTab   | `apps/web/public/js/heys_user_v12.js`          |
| Продукты/поиск    | Core      | `apps/web/public/js/heys_core_v12.js`          |
| Советы            | Advice    | `apps/web/public/js/heys_advice_v1.js`         |
| Инсулиновая волна | Wave      | `apps/web/public/js/heys_insulin_wave_v1.js`   |
| Подписки          | Subs      | `apps/web/public/js/heys_subscriptions_v1.js`  |
| Стили             | CSS       | `apps/web/styles/heys-components.css`          |
| Безопасность      | runbook   | `docs/SECURITY_RUNBOOK.md`                     |
| Модель данных     | reference | `docs/DATA_MODEL_REFERENCE.md`                 |

---

## 🐛 Debug Helpers

### Быстрая диагностика в консоли браузера:

```javascript
// Статус сессии
heysStats();

// Cloud статус
HEYS.cloud.getStatus(); // 'online' | 'offline'

// Текущий клиент
U.lsGet('heys_profile');

// Все ключи localStorage
Object.keys(localStorage).filter((k) => k.startsWith('heys_'));

// Проверить orphan продукты
HEYS.orphanProducts?.list();

// Режим auth
console.log('RPC only:', HEYS.cloud._rpcOnlyMode);
```

### Проверка API:

```bash
# Health check
curl -s https://api.heyslab.ru/health

# RPC тест
curl -s -X POST 'https://api.heyslab.ru/rpc?fn=get_shared_products' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://app.heyslab.ru' \
  -d '{}' | head -c 200
```

### Частые причины багов:

| Симптом               | Вероятная причина      | Проверь                         |
| --------------------- | ---------------------- | ------------------------------- |
| Данные не сохраняются | Неверный clientId      | `U.lsSet()` vs `localStorage`   |
| 403 на RPC            | Функция не в allowlist | `heys-api-rpc/index.js`         |
| UI не обновляется     | Мутация объекта        | Создай новый `{...old}`         |
| Продукт не найден     | Orphan после sync      | `HEYS.orphanProducts.restore()` |
| 400 refresh_token     | RTR одноразовый        | Очистить localStorage           |

---

## ✅ Код-паттерны (копируй как шаблон)

### RPC вызов (правильно):

```javascript
// ✅ ПРАВИЛЬНО — session-based
const result = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
  session_token: HEYS.cloud.getSessionToken(),
  k: 'heys_profile',
});

// ❌ НЕПРАВИЛЬНО — UUID напрямую (IDOR!)
const result = await HEYS.YandexAPI.rpc('get_client_kv', {
  client_id: clientId, // НЕ ДЕЛАЙ ТАК!
  k: 'heys_profile',
});
```

### Сохранение в localStorage:

```javascript
// ✅ ПРАВИЛЬНО — с namespace
U.lsSet('heys_products', products);
U.lsGet('heys_products', []);

// ❌ НЕПРАВИЛЬНО — без namespace
localStorage.setItem('products', JSON.stringify(products));
```

### React state update:

```javascript
// ✅ ПРАВИЛЬНО — новый объект
setDay((prev) => ({ ...prev, waterMl: prev.waterMl + 250 }));

// ❌ НЕПРАВИЛЬНО — мутация
day.waterMl += 250;
setDay(day); // React не увидит изменение!
```

### Добавление совета:

```javascript
// В heys_advice_v1.js, массив ADVICE_RULES
{
  id: 'my_new_advice',
  condition: (ctx) => ctx.proteinPct < 0.5 && ctx.hour >= 14,
  priority: 3,
  category: 'nutrition',
  triggers: ['tab_open', 'product_added'],
  message: (ctx) => `Маловато белка: ${Math.round(ctx.proteinPct * 100)}%`,
  icon: '🥩'
}
```

---

## 🎯 Impact Radius (что сломается)

**При изменении файла — ВСЕГДА думай о зависимостях:**

| Изменяемый файл            | Проверь эти файлы                        | Почему                     |
| -------------------------- | ---------------------------------------- | -------------------------- |
| `heys_models_v1.js`        | ВСЕ `heys_*.js`                          | Модели используются везде  |
| `heys_core_v12.js`         | `heys_day_v12.js`, `heys_reports_v12.js` | Продукты, поиск, утилиты   |
| `heys_storage_layer_v1.js` | `heys_cloud.sync()`, `U.lsSet/Get`       | Storage везде              |
| `heys_yandex_api_v1.js`    | Все RPC вызовы                           | API клиент единый          |
| `heys_subscriptions_v1.js` | Paywall, триал, read-only гейтинг        | Влияет на доступ           |
| SQL функция                | `heys-api-rpc/index.js` allowlist        | Нужно добавить в allowlist |
| CSS классы                 | Все компоненты с этим классом            | Grep перед удалением!      |

### Паттерн проверки:

```bash
# Найти все использования функции/переменной
grep -r "functionName" apps/web/public/js/

# Найти все импорты модуля
grep -r "HEYS.ModuleName" apps/web/
```

---

## ❓ Когда спросить (а не угадывать)

**Лучше уточнить, чем откатывать! Спрашивай если:**

| Ситуация                      | Пример вопроса                                          |
| ----------------------------- | ------------------------------------------------------- |
| Неясен scope изменения        | "Это только для текущего клиента или для всех?"         |
| Несколько вариантов решения   | "Вариант A быстрее, B надёжнее — что важнее?"           |
| Изменение затрагивает БД      | "Создать новую миграцию или изменить существующую?"     |
| Неясны бизнес-правила         | "Показывать ошибку или fallback на дефолт?"             |
| Breaking change               | "Это сломает старые данные — делаем миграцию?"          |
| Конфликт с существующим кодом | "Нашёл похожую логику в X — использовать её или новую?" |

### НЕ спрашивай если:

- ❌ Очевидная опечатка/баг — просто фикси
- ❌ Стандартный паттерн проекта — используй его
- ❌ Документация говорит однозначно — следуй ей

---

## ⚡ Performance Hints (когда оптимизировать)

**HEYS-специфичные узкие места:**

| Модуль            | Проблема                       | Решение                                         |
| ----------------- | ------------------------------ | ----------------------------------------------- |
| Инсулиновая волна | 37 факторов на каждый приём    | `useMemo` + пересчёт только при изменении meals |
| Поиск продуктов   | Фильтрация 1000+ продуктов     | `debounce(300ms)` на input                      |
| Week heatmap      | Загрузка 7 дней данных         | `Promise.all` параллельно                       |
| Sparkline графики | Много точек = медленный рендер | Ограничить до 30 точек                          |
| Advice rules      | 182 правила проверяются        | Ранний `return` в условиях                      |

### Когда НЕ оптимизировать:

- ❌ Код выполняется редко (настройки, профиль)
- ❌ Данных мало (<100 элементов)
- ❌ Уже достаточно быстро (<100ms)
- ❌ Premature optimization — сначала измерь!

### Шаблон для тяжёлых вычислений:

```javascript
// ✅ ПРАВИЛЬНО — мемоизация с зависимостями
const heavyResult = useMemo(() => {
  return calculateSomethingHeavy(data);
}, [data.id, data.updatedAt]); // НЕ весь объект!

// ❌ НЕПРАВИЛЬНО — пересчёт на каждый рендер
const heavyResult = calculateSomethingHeavy(data);
```

---

## 🔄 Offline/Fallback паттерны (PWA)

**HEYS работает offline! При работе с данными:**

### Стратегия "Local First":

```javascript
// 1. Сначала читай локально
const localData = U.lsGet('heys_products', []);

// 2. Показывай сразу (не жди сеть)
setProducts(localData);

// 3. Потом синхронизируй в фоне
HEYS.cloud
  .syncProducts()
  .then((updated) => {
    if (updated) setProducts(updated);
  })
  .catch(() => {
    // Офлайн — локальные данные уже показаны
  });
```

### Fallback для RPC:

```javascript
// ✅ ПРАВИЛЬНО — graceful degradation
try {
  const result = await HEYS.YandexAPI.rpc('get_shared_products', {});
  return result;
} catch (e) {
  console.warn('[HEYS] Offline, using cached products');
  return U.lsGet('heys_shared_products_cache', []);
}
```

### Индикация состояния:

```javascript
// Показывай пользователю статус синхронизации
const status = HEYS.cloud.getStatus(); // 'online' | 'offline' | 'syncing'
// UI: показать бейдж если offline
```

### Когда НЕ делать offline:

- ❌ Платежи — только онлайн
- ❌ SMS верификация — требует сеть
- ❌ Создание клиента — curator-only операция
