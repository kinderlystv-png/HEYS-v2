# Оптимизация производительности (Mid-Tier Throttling)

**Дата создания:** 23 февраля 2026 г.
**Дата внедрения:** 23 февраля 2026 г.
**Статус:** ✅ ВНЕДРЕНО (v6.0 Performance Sprint)
**Исходная проблема:** Время загрузки приложения (warm start) при mid-tier CPU throttling (4x slowdown, Fast 3G) составляло **65.4 секунды** до события `appReady`.

---

## 🎯 Целевые показатели (Target Metrics)

Объективно достижимые показатели при **Mid-Tier Throttling** (мобильное устройство среднего класса):

| Метрика | До оптимизации | Целевое | Ожидаемый результат |
| :--- | :--- | :--- | :--- |
| **FCP (First Contentful Paint)** | ~10-15 сек | **< 5 сек** | MEALREC больше не блокирует React — скелетоны видны сразу |
| **TTI (Time to Interactive)** | ~65.4 сек | **15 - 20 сек** | Тройная загрузка геймификации и ложный XP DRIFT исключены |
| **Full App Ready** | 65.4 сек | **~20 сек** | Каскад не пересчитывается дважды до стабилизации профиля |
| **Desktop/Wi-Fi** | ~5-8 сек | **< 2 сек** | 1061 лишних событий RPC устранены |

---

## ✅ Внедрённые изменения (v6.0 Performance Sprint)

### 1. ✅ Gamification: Исправление `_getXPCacheKey` — правильный clientId с первого обращения
**Файл:** `apps/web/heys_gamification_v1.js`

**Проблема:** При старте `HEYS.utils.getCurrentClientId()` ещё не установлен → ключ `heys_xp_cache_default` → XP = 0 → ложный XP DRIFT → полный rebuild 1061 событий (3 RPC-запроса).

**Исправление:**
```javascript
// БЫЛО:
const cid = HEYS.utils?.getCurrentClientId?.() ||
  localStorage.getItem('heys_client_current') || ...

// СТАЛО:
const cid = HEYS.currentClientId ||               // ← надёжный источник
  HEYS.utils?.getCurrentClientId?.() ||
  localStorage.getItem('heys_client_current') || ...
```

---

### 2. ✅ Gamification: Удалён boot-time `loadFromCloud` из `setTimeout(2000)`
**Файл:** `apps/web/heys_gamification_v1.js`

**Проблема:** `loadFromCloud()` вызывался через 2 секунды после старта, до получения корректного `clientId`. Это запускало полный rebuild аудит-трейла.

**Исправление:** `loadFromCloud()` удалён из boot-блока. `_isLoadingPhase = false` теперь устанавливается в `.finally()` от `recalculateAchievements`. Единственный триггер для `loadFromCloud` — событие `heysSyncCompleted`.

```javascript
// Комментарий в коде:
// 🚀 PERF v6.0: Убрали loadFromCloud — heysSyncCompleted вызовет его сам
```

---

### 3. ✅ Gamification: Удалён дублирующий `loadFromCloud` из `heys:client-changed`
**Файл:** `apps/web/heys_gamification_v1.js`

**Проблема:** Один старт триггерил `loadFromCloud` трижды — boot, `heysSyncCompleted`, `heys:client-changed`. Promise dedup не защищал от последовательных вызовов с разными clientId.

**Исправление:** Из обработчика `heys:client-changed` удалён блок с `HEYS.game.loadFromCloud()`. Геймификация полагается на `heysSyncCompleted`, который и так срабатывает сразу после смены клиента.

---

### 4. ✅ MEALREC: `useMemo` → `useEffect` + `useState` (async)
**Файл:** `apps/web/insights/pi_ui_meal_rec_card.js`

**Проблема:** 154 вызова `calculateProductScore()` + 30 синхронных `lsGet` в `useMemo` блокировали React render thread на 10-20 секунд при CPU throttling.

**Исправление:** Всё вычисление перенесено в `useEffect + setTimeout(0)`. React сначала рендерит скелетон, затем асинхронно запускает тяжелый расчёт.

```javascript
// Новые state variables:
const [recommendation, setRecommendation] = useState(null);
const [isCalculating, setIsCalculating] = useState(true);

// useEffect вместо useMemo:
useEffect(() => {
    setIsCalculating(true);
    const timerId = setTimeout(() => {
        // ... 154 scoring + 30-day loop ...
        setRecommendation(result);
        setIsCalculating(false);
    }, 0);
    return () => clearTimeout(timerId);
}, [меняющиеся зависимости...]);
```

---

### 5. ✅ MEALREC: Skeleton UI во время async расчёта
**Файл:** `apps/web/insights/pi_ui_meal_rec_card.js`
**CSS:** `apps/web/styles/heys-components.css`

**Решение:** Добавлен skeleton с shimmer-анимацией пока `isCalculating === true`. Поддерживает dark theme.

```javascript
if (isCalculating) {
    return h('div', { className: 'meal-rec-card meal-rec-card--skeleton', 'aria-busy': true },
        h('div', { className: 'meal-rec-card__skeleton-pulse' })
    );
}
```

---

### 6. ✅ Cascade Card: Pre-sync guard против двойного compute
**Файл:** `apps/web/heys_cascade_card_v1.js`

**Проблема:** `buildInputSignature` включает `prof.plannedSupplements`. До завершения sync профиль нестабилен → сигнатура меняется → cache MISS → `computeCascadeState` запускается дважды (~1-2 сек каждый).

**Исправление:** Перед проверкой кэша добавлена проверка состояния синхронизации. Если sync не завершён, но кэш есть — использовать кэш:

```javascript
var _cascadeSyncDone = !!(window.HEYS && (window.HEYS.initialSyncDone || window.HEYS.syncCompletedAt));
if (!_cascadeSyncDone && _cascadeCache.result) {
  // pre-sync: профиль нестабилен, держим кэш
  cascadeState = _cascadeCache.result;
  console.info('[HEYS.cascade] ⏳ Pre-sync guard: held on cached compute (profile unstable)');
} else if (_cascadeCache.signature === signature && _cascadeCache.result) {
  // cache hit
} else {
  // cache miss — полный compute
}
```

---

## 🔍 Что изменится в логах

| Модуль | До | После |
| :--- | :--- | :--- |
| `[🎮 GAME SYNC]` | `XP DRIFT detected: 0 vs 8926` при каждом старте | Только при реальном изменении XP |
| `[🎮 Gamification] loadFromCloud` | Вызывается 3× за старт | Вызывается 1× (из `heysSyncCompleted`) |
| `[MEALREC]` | `useMemo triggered` (блокирует UI) | `useEffect triggered (async)` → skeleton → card |
| `[HEYS.cascade]` | Запускает compute дважды до стабилизации профиля | `⏳ Pre-sync guard: held on cached compute` |

---

## ⚠️ Дополнительные зоны (не реализовано в v6.0)

### 6. EWS — Синхронные проверки (низкий приоритет)
*   **Проблема:** EWS v4.2 выполняет 25 сложных проверок; уже async, но старт можно отложить до `appReady`.
*   **Решение (будущее):** `requestIdleCallback` для первичного запуска EWS.

### 7. Network Waterfall
*   **Проблема:** Убедиться, что независимые RPC-запросы запускаются через `Promise.all()`.
*   **Решение (будущее):** Аудит порядка вызовов на init.

---

## 📋 Checklist внедрения

- [x] `_getXPCacheKey` — `HEYS.currentClientId` как первый приоритет
- [x] boot `setTimeout(2000)` — `loadFromCloud()` удалён
- [x] `heys:client-changed` — `loadFromCloud()` удалён
- [x] MEALREC — `useMemo` → `useEffect` + `useState`
- [x] MEALREC — Skeleton UI + CSS shimmer animation
- [x] Cascade — Pre-sync guard в `renderCard()`
- [ ] EWS — Дополнительный `requestIdleCallback` (будущий спринт)
- [ ] Network Waterfall — Аудит `Promise.all` (будущий спринт)
    *   Перенос EWS и сбора 30-дневной истории в `requestIdleCallback` или асинхронные таски.