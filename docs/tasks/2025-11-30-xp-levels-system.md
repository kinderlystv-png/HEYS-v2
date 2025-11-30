# Task: XP, Уровни и Достижения — Полная система геймификации

> **Gamification 2.0**: XP, уровни, достижения, бейджи, статус-бар в шапке  
> **Audit Version**: 6.0 | **Last Review**: 2025-11-30 (финальный аудит перед реализацией)

## 🎯 WHY (Бизнес-контекст)

**Problem**: Пользователи теряют мотивацию после первых дней трекинга, нет ощущения прогресса

**Impact**: Retention падает — users бросают приложение через 1-2 недели

**Value**: Полноценная система геймификации создаёт петлю вовлечения: действие → награда → визуальный feedback → прогресс → желание продолжить

---

## 📋 ПРИНЯТЫЕ РЕШЕНИЯ (v6.0)

| Вопрос | Решение | Обоснование |
|--------|---------|-------------|
| **Flying animation** | C+D: `data-game-source` атрибуты + fallback на `document.activeElement` | Максимум покрытия, минимум рефакторинга |
| **Развёрнутая панель** | ✅ Полная: статистика + ВСЕ достижения + прогресс + бейджи | Production-ready, не MVP |
| **day_completed** | D1: При первом входе утром — проверить вчерашний день | Ретроспективно, честно |
| **Coins** | ❌ Нет | Только XP + уровни в этой версии |
| **Haptic при XP** | ✅ Отдельный `HEYS.haptic('light')` за +XP | Как лучше, не как быстрее |

---

## 🔬 ГЛУБОКИЙ АУДИТ v6.0 (на основе реального кода)

### ✅ Что уже работает (Phase 0 выполнена):

| Аспект | Статус | Где в коде |
|--------|--------|------------|
| hdr-top = gamification placeholder | ✅ | `heys_app_v12.js:1762` |
| Theme FAB (fixed, z-index: 1000) | ✅ | `heys_app_v12.js:1773` |
| Long-press на аватар | ✅ | `heys_app_v12.js:1796` |
| CSS `.game-*` классы | ✅ | `styles/main.css:930+` |
| `HEYS.haptic()` экспортирован | ✅ | `heys_day_utils.js:35` |
| `U.lsSet` с clientId prefix | ✅ | `heys_core_v12.js:823` |

### 🔴 КРИТИЧЕСКИЕ БЛОКЕРЫ (найдено в коде):

| # | Проблема | Где | Риск | Решение в Phase 0.5 |
|---|----------|-----|------|---------------------|
| **B1** | **4 функции добавления продукта** | `addProductToMeal` (2543), `addProductAndFocusGrams` (621), `addProductWithGrams` (652) | 🔴 XP начислится не везде | Добавить XP триггер в каждую |
| **B2** | **Функции не получают event** | `addWater(ml)`, все `addProduct*` | 🔴 Flying animation невозможна | Fallback: `document.activeElement` + `data-game-source` |
| **B3** | **Placeholder статичный** | `heys_app_v12.js:1762` | 🔴 UI не обновляется | React state + `heysGameUpdate` event |
| **B4** | **Нет dispatch в addProductAndFocusGrams** | Строка 621 | 🟡 advice не триггерится | Добавить `heysProductAdded` |
| **B5** | **`HEYS.Day.getStreak()` не экспортирован** | Нигде | 🔴 Gamification не знает streak | Экспортировать в useEffect |
| **B6** | **day_completed логика отсутствует** | — | 🔴 +50 XP не начисляется | Проверка при входе утром |

### 🟡 ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ:

| # | Проблема | Риск | Решение |
|---|----------|------|---------|
| **P1** | Double XP при быстрых кликах | Высокий | Debounce 300ms в `addXP()` |
| **P2** | Achievement popup + advice одновременно | Визуальный хаос | Achievement > advice (блокировка) |
| **P3** | Confetti дублирование | 3+ места | Централизовать в `HEYS.game.celebrate()` |
| **P4** | getStreak() зависит от pIndex | Если продукты не загружены | Fallback: день с meals = streak |
| **P5** | Развёрнутая панель блокирует контент | Mobile UX | Backdrop + tap outside to close |

### 🔵 WOW-ЭФФЕКТЫ (обязательно реализовать):

| # | Эффект | Где | Сложность | Статус |
|---|--------|-----|-----------|--------|
| **W1** | Flying star ⭐ при +XP | Из source в header | M | TODO |
| **W2** | Progress bar glow | При >90% | S | TODO |
| **W3** | Number morph animation | XP counter | M | TODO |
| **W4** | Level up shake + pulse | Header bar | S | TODO |
| **W5** | Achievement unlock popup | Modal с confetti | M | TODO |
| **W6** | 🔥 bounce при +streak | Streak icon | S | TODO |
| **W7** | Gradient shift по уровням | Progress bar цвет | S | TODO |
| **W8** | Haptic patterns | light/success/celebration | S | TODO |

### 🎮 СОВРЕМЕННЫЕ ИГРОВЫЕ ПАТТЕРНЫ:

| Паттерн | Реализация | Приоритет |
|---------|------------|-----------|
| **Daily login bonus** | +10→50 XP (прогрессивно 1-7 дней) | ✅ Must |
| **Combo system** | 3 действия за 60 сек = x1.5 XP | 🟡 Nice |
| **Near-miss** | "Ещё 50 XP до уровня!" | ✅ Must |
| **Loss aversion** | "Не потеряй streak!" в advice | ✅ Must |
| **Progress illusion** | Bar начинается с 5% | ✅ Must |
| **Endowed progress** | Начинаем с Ур.1, не Ур.0 | ✅ Must |

---

## 🎨 НОВАЯ АРХИТЕКТУРА UI

### Главный принцип: ВСЯ шапка = геймификация

```
КОМПАКТНЫЙ ВИД (всегда видно):
┌──────────────────────────────────────────────────────┐
│  🌱 Ур.7  ████████░░  450/600    🔥5    [▼]         │ ← hdr-top = gamification bar
│  Новичок              75%                            │   [▼] = кнопка раскрытия
└──────────────────────────────────────────────────────┘

РАЗВЁРНУТЫЙ ВИД (по клику на [▼]):
┌──────────────────────────────────────────────────────┐
│  🌱 Ур.7  ████████░░  450/600    🔥5    [▲]         │
│  Новичок              75%                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│   📊 СТАТИСТИКА                                      │
│   ┌────────────┬────────────┬────────────┐          │
│   │ Всего XP   │ Streak     │ Дней       │          │
│   │   1,250    │  🔥 5      │   23       │          │
│   └────────────┴────────────┴────────────┘          │
│                                                      │
│   🏆 ДОСТИЖЕНИЯ (3/13)                              │
│   [🎯 ✓] [🔥 ✓] [🏆 ✓] [⭐ ○] [👑 ○] ...           │
│                                                      │
│   📈 ДО СЛЕДУЮЩЕГО УРОВНЯ                           │
│   Ещё 150 XP (~30 действий)                         │
│   ████████████████░░░░░░░░ 75%                      │
│                                                      │
│   🎁 Ежедневный бонус: День 3 (+20 XP)              │
│                                                      │
└──────────────────────────────────────────────────────┘
│ [АП] Антон Поплавский  [📅 30] [< Ноябрь 2025 >]    │ ← hdr-bottom
└──────────────────────────────────────────────────────┘
```

### Компоненты hdr-top (компактный):

```
┌─────────────────────────────────────────────────────────────┐
│ [Титул+Ур] [═══Progress═══] [XP/Max] [Streak] [Expand]     │
│  🌱 Ур.7    ████████░░░░░░   450/600   🔥5      [▼]        │
└─────────────────────────────────────────────────────────────┘
```

| Элемент | Ширина | Описание |
|---------|--------|----------|
| Титул+Уровень | auto | `🌱 Ур.7` или `👑 Ур.23` |
| Progress bar | flex-grow | Визуальный прогресс до след. уровня |
| XP counter | auto | `450/600` (текущий/до след. уровня) |
| Streak | auto | `🔥5` (дней подряд) |
| Expand btn | 32px | `▼` / `▲` toggle |

### Развёрнутая панель (GamePanel):

```javascript
// Содержимое развёрнутой панели
const GamePanel = {
  stats: {
    totalXP: 1250,
    currentStreak: 5,
    bestStreak: 12,
    totalDays: 23,
    perfectDays: 8
  },
  achievements: {
    unlocked: ['first_meal', 'streak_3', 'streak_7'],
    total: 13,
    progress: { streak_14: '7/14', water_master: '3/7' }
  },
  nextLevel: {
    current: 7,
    xpNeeded: 150,
    estimatedActions: 30
  },
  dailyBonus: {
    day: 3,
    xp: 20,
    claimed: false
  }
};
```

### Разделение зон уведомлений:

| Тип уведомления | Позиция | Z-index | Триггер |
|-----------------|---------|---------|---------|
| **Советы (advice)** | Низ экрана | 900 | tab_open, product_added |
| **XP gain (+5)** | Flying animation → header | 1150 | Каждое действие |
| **Level up popup** | Под hdr-top, поверх hdr-bottom | 1100 | При повышении уровня |
| **Achievement popup** | Под hdr-top, поверх hdr-bottom | 1100 | При достижении |
| **Confetti** | Весь экран | 1200 | Level % 5, streak 7+ |

### Удаляемые элементы:

| Элемент | Было | Стало |
|---------|------|-------|
| "🥗 HEYS" логотип | hdr-top | ❌ Убрать |
| "Панель куратора" | hdr-top | ❌ Убрать |
| "Онлайн/Офлайн" статус | hdr-top | ❌ Убрать |
| "↻ Сменить" кнопка | hdr-top | → Long-press на аватар |
| Theme toggle ☀️/🌙 | hdr-top | → FAB в углу (fixed) |
| Analytics button | hdr-top | → В Профиль |

---

## ✨ Flying Coins / XP Animation

**Концепция**: При достижении XP — монетка/звезда вылетает из места действия и летит в статус-бар

```
[Продукт добавлен]
       ↓
      ⭐ ←── появляется здесь
       \
        \   ←── летит по дуге
         \
          → [████ 455XP] ←── приземляется сюда, бар пульсирует
```

### Техническая реализация:
```javascript
// 1. Получаем координаты источника (кнопка добавления)
const sourceEl = event.target.getBoundingClientRect();

// 2. Получаем координаты цели (XP bar в header)
const targetEl = document.querySelector('.xp-bar').getBoundingClientRect();

// 3. Создаём flying element
const coin = document.createElement('div');
coin.className = 'flying-xp';
coin.textContent = '+5';
coin.style.cssText = `
  position: fixed;
  left: ${sourceEl.x}px;
  top: ${sourceEl.y}px;
  z-index: 9999;
  font-size: 16px;
  font-weight: bold;
  color: #eab308;
`;
document.body.appendChild(coin);

// 4. Анимация полёта (CSS transition или FLIP)
requestAnimationFrame(() => {
  coin.style.transform = `translate(${targetEl.x - sourceEl.x}px, ${targetEl.y - sourceEl.y}px)`;
  coin.style.opacity = '0';
  coin.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
});

// 5. Удаление после анимации
setTimeout(() => coin.remove(), 700);
```

---

## 🔴 АУДИТ: Потенциальные проблемы

### 🚫 Блокеры (исправить ДО реализации — Phase 0)

| # | Проблема | Риск | Решение |
|---|----------|------|---------|
| B1 | **Layout shift**: Добавление XP bar в header может сломать responsive | 🔴 Высокий | Использовать flex с `flex-shrink`, тестировать на 320px |
| B2 | **Popup vs hdr-bottom**: Popup должен красиво накладываться | 🟡 Средний | CSS: popup `position: absolute; top: 100%`, slideDown animation |
| B3 | **Advice vs Game notifications**: Конфликт внимания | 🟢 Решено | Advice = низ, Game = верх (под hdr-top) |
| B4 | **Confetti дублирование** | 🟡 | Централизовать: `HEYS.game.celebrate()` → вызывает `setShowConfetti` |
| B5 | **Client namespace** | 🔴 | XP данные через `U.lsSet('heys_game', ...)` — автоматически с clientId |
| B6 | **currentStreak недоступен вне React** | 🔴 | Экспортировать `HEYS.Day.getStreak()` для использования в gamification |
| B7 | **event.target отсутствует** | 🟡 | Fallback: `document.querySelector('.xp-bar')` для анимации |
| B8 | **z-index конфликты** | 🟡 | Advice=900, Game popup=1100, Flying XP=1150, Confetti=1200 |

### ⚠️ Замечания

| # | Проблема | Решение |
|---|----------|---------|
| W1 | **FAB theme toggle** может мешать контенту | z-index: 1000, position: fixed, top: 8px right: 8px. **НЕ перекрывать** XP bar |
| W2 | **"Сменить клиента"** | Long-press на аватар клиента в hdr-bottom |
| W3 | **XP bar на узких экранах** | Mobile: только `⭐7 ░░░░` (без текста "XP"), desktop: полный |
| W4 | **day_completed timing** | Проверять в 23:00 или при первом входе на следующий день |
| W5 | **Game popup auto-hide** | Автоматически скрывать через 4 сек или по tap |

### 🆕 Превентивные проверки (добавить в Phase 0)

| # | Что проверить | Как | Ожидаемый результат |
|---|---------------|-----|---------------------|
| P1 | 5 табов влезают на 320px? | DevTools → iPhone SE | Все табы видны без скролла |
| P2 | `HEYS.utils.haptic` работает? | Console: `HEYS.utils.haptic('success')` | Вибрация на телефоне |
| P3 | `U.lsSet` с clientId? | Console: `U.lsSet('test', {a:1}); localStorage` | Ключ `heys_test_clientXXX` |
| P4 | confetti работает? | Триггер: достичь 100% калорий | Конфетти появляется |
| P5 | currentStreak доступен? | Console: посмотреть `HEYS.Day` | Нужно экспортировать |

---

## 🤖 Output Preferences

**Workflow**: Implement directly — код уже спроектирован в этом промпте

**Code style**: Follow copilot-instructions.md, минимальные комментарии, Legacy JS паттерны

---

## 🏗️ Phase 0: Подготовка фундамента ✅ ВЫПОЛНЕНО

> **Цель**: Полностью перестроить hdr-top под геймификацию

### 0.1 Удалить старые элементы из hdr-top

- [x] **Удалить логотип "🥗 HEYS"** ✅
- [x] **Удалить "Панель куратора"** ✅
- [x] **Удалить статус "Онлайн/Офлайн"** ✅
- [x] **Удалить кнопку "↻ Сменить"** → Long-press на аватар ✅
- [x] **Theme toggle → FAB** (fixed, top: 12px, right: 12px, z-index: 1000) ✅

---

## 🏗️ Phase 0.5: Исправление блокеров (КРИТИЧНО!)

> **Цель**: Подготовить код к интеграции XP триггеров

### 0.5.1 Добавить `data-game-source` атрибуты

**Файл**: `apps/web/heys_day_v12.js`

```javascript
// Кнопки воды (water presets + FAB):
React.createElement('button', {
  'data-game-source': 'water',
  onClick: (e) => addWater(preset.ml, e)
}, ...)

// Кнопки добавления продукта:
React.createElement('button', {
  'data-game-source': 'product',
  ...
})
```

### 0.5.2 Добавить XP триггеры во ВСЕ функции добавления

| Функция | Строка | Что добавить |
|---------|--------|--------------|
| `addWater(ml)` | 1878 | `if (HEYS.game) HEYS.game.addXP(2, 'water_added', event?.target \|\| document.activeElement);` |
| `addProductToMeal(mi, p)` | 2543 | `if (HEYS.game) HEYS.game.addXP(5, 'product_added', ...);` |
| `addProductAndFocusGrams(product)` | 621 | `if (HEYS.game) HEYS.game.addXP(5, 'product_added', ...);` + `haptic('light')` + dispatch |
| `addProductWithGrams(product, grams)` | 652 | `if (HEYS.game) HEYS.game.addXP(5, 'product_added', ...);` + dispatch |

### 0.5.3 Экспортировать `HEYS.Day.getStreak()`

**Файл**: `apps/web/heys_day_v12.js` (в useEffect после currentStreak вычисления)

```javascript
useEffect(() => {
  HEYS.Day = HEYS.Day || {};
  HEYS.Day.getStreak = () => currentStreak;
}, [currentStreak]);
```

### 0.5.4 Добавить day_completed проверку

**Файл**: `apps/web/heys_gamification_v1.js` (новый)

```javascript
// При загрузке — проверить вчерашний день
function checkYesterdayCompletion() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastChecked = U.lsGet('heys_game_lastDayCheck', '');
  
  // Если уже проверяли сегодня — пропускаем
  if (lastChecked === todayStr) return;
  
  // Загружаем данные вчерашнего дня
  const dayData = U.lsGet('heys_dayv2_' + yesterdayISO, null);
  if (!dayData) return;
  
  // Вычисляем ratio
  const ratio = calcDayRatio(dayData);
  
  // Проверяем успешность через ratioZones
  if (HEYS.ratioZones && HEYS.ratioZones.isSuccess(ratio)) {
    // Ещё не начисляли XP за этот день?
    const awardedDays = U.lsGet('heys_game_awardedDays', []);
    if (!awardedDays.includes(yesterdayISO)) {
      HEYS.game.addXP(50, 'day_completed', null); // +50 XP
      awardedDays.push(yesterdayISO);
      U.lsSet('heys_game_awardedDays', awardedDays);
      
      // Показать popup
      HEYS.game.showPopup({
        type: 'day_bonus',
        title: '🎉 Вчера в норме!',
        subtitle: `${r0(ratio * 100)}% от цели`,
        xp: '+50 XP'
      });
    }
  }
  
  U.lsSet('heys_game_lastDayCheck', todayStr);
}
```
- [x] **Analytics button → Профиль** ✅

### 0.2 Проверки

- [x] **hdr-top = gamification placeholder** — `🌱 Ур.1 | ████░░ | 0/100 | 🔥0`
- [x] **FAB работает** — theme toggle в углу
- [x] **Long-press на аватар** — 600ms → confirm → смена клиента
- [x] **HEYS.Day.getStreak()** — экспортирован для gamification модуля
- [x] **CSS добавлен** — `.theme-fab`, `.game-bar-placeholder`, `.game-*`

### 0.3 z-index иерархия (добавлено в CSS)

```css
.theme-fab { z-index: 1000; }
.game-panel-expanded { z-index: 1050; }
.game-popup { z-index: 1100; }
.flying-xp { z-index: 1150; }
.confetti-container { z-index: 1200; }
/* Advice toasts уже z-index: 900 — ниже всего */
```

---

## 🏗️ Phase 1: Core XP Module

### Must Have (критично для релиза)

- [ ] **Создать heys_gamification_v1.js** — Ядро XP/уровней/coins
  - **Файл**: `apps/web/heys_gamification_v1.js`
  - **Why**: Централизованная логика геймификации — один источник правды
  - **Acceptance**: `HEYS.game.addXP(amount, reason, sourceEl)` работает
  - **Содержимое**:
    ```javascript
    HEYS.game = {
      // XP
      addXP(amount, reason, sourceEl) { ... },
      getLevel() { ... },
      getProgress() { ... },
      
      // Coins (опционально, Phase 2)
      addCoins(amount) { ... },
      getCoins() { ... },
      
      // Achievements
      checkAchievement(id) { ... },
      getAchievements() { ... },
      
      // Stats
      getStats() { ... },
      
      // Flying animation
      flyToBar(sourceEl, type) { ... }
    };
    ```
  - **localStorage ключ**: `heys_game` (через `U.lsSet`)

- [ ] **GamificationBar компонент** — Отображение в header
  - **Файл**: `apps/web/heys_app_v12.js` (новый компонент)
  - **Where**: hdr-top справа
  - **Acceptance**: Показывает уровень, прогресс, streak, coins
  - **Mobile UI**: `⭐7 ░░░ 🔥5` (компактно)
  - **Desktop UI**: `⭐ Ур.7 ████░░ 450XP | 🔥5 дней | 💰230`

- [ ] **Flying XP Animation** — Визуальный feedback
  - **Файл**: `apps/web/heys_gamification_v1.js`
  - **Trigger**: При любом addXP() с sourceEl
  - **Анимация**: Звезда/монета летит из sourceEl в GamificationBar
  - **CSS**: `@keyframes flyToBar { ... }`

- [ ] **Подключить в index.html**
  - **Файл**: `apps/web/index.html`
  - **After**: `heys_ratio_zones_v1.js`
  - **Acceptance**: `HEYS.game` доступен в консоли

- [ ] **Интеграция с действиями** — Вызовы addXP в нужных местах
  - **Файл**: `apps/web/heys_day_v12.js`
  - **Why**: XP начисляется автоматически при действиях пользователя
  - **Точки интеграции** (с передачей sourceEl для flying animation):
    ```javascript
    // addProductToMeal():2500
    function addProductToMeal(mi, p) {
      // ... existing code ...
      if (HEYS.game) HEYS.game.addXP(5, 'product_added', event?.target);
    }
    
    // addWater():1873
    function addWater(ml) {
      // ... existing code ...
      if (HEYS.game) HEYS.game.addXP(2, 'water_added', event?.target);
    }
    
    // confirmTrainingPicker():~2085
    function confirmTrainingPicker() {
      // ... existing code ...
      if (HEYS.game) HEYS.game.addXP(15, 'training_added');
    }
    ```
  - **Acceptance**: Каждое действие → звезда летит в XP bar

---

## 🏗️ Phase 2: Система достижений (Achievements)

### Achievements Library (Полный список бейджей)

> **Всего**: 25 достижений в 5 категориях

#### 🔥 Streak (серии)

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `streak_3` | Три дня подряд | Streak ≥ 3 | +30 | 🔥 | Common |
| `streak_7` | Неделя успеха | Streak ≥ 7 | +100 | 🏆 | Rare |
| `streak_14` | Две недели | Streak ≥ 14 | +200 | ⭐ | Epic |
| `streak_30` | Месяц силы | Streak ≥ 30 | +500 | 👑 | Legendary |
| `streak_100` | Железная воля | Streak ≥ 100 | +1000 | 💎 | Mythic |

#### 🎯 Первые шаги (onboarding)

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `first_meal` | Первый шаг | Добавить первый продукт | +50 | 🎯 | Common |
| `first_water` | Водный старт | Первый раз добавить воду | +20 | 💧 | Common |
| `first_training` | Активный старт | Первая тренировка | +30 | 🏃 | Common |
| `first_weight` | Точка отсчёта | Первый раз ввести вес | +20 | ⚖️ | Common |
| `profile_complete` | Профиль готов | Заполнить профиль на 100% | +50 | 📋 | Common |

#### 💎 Качество дня

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `perfect_day` | Идеальный день | ratio 0.95-1.05 | +25 | 💎 | Rare |
| `perfect_week` | Идеальная неделя | 7 perfect days | +200 | 🌟 | Epic |
| `balanced_macros` | Баланс БЖУ | Все макросы 90-110% | +30 | ⚖️ | Rare |
| `fiber_champion` | Клетчатка-чемпион | Клетчатка ≥100% 7 дней | +100 | 🥗 | Rare |

#### 💧 Вода и активность

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `water_day` | Водный день | 100% нормы воды | +15 | 💧 | Common |
| `water_master` | Водный мастер | 100% воды 7 дней подряд | +100 | 🌊 | Rare |
| `training_week` | Спортсмен | 5 тренировок за неделю | +150 | 💪 | Epic |
| `steps_champion` | Шаговой марафон | 10000+ шагов 7 дней | +150 | 👟 | Epic |

#### ⭐ Уровни и прогресс

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `level_5` | Ученик | Достичь 5 уровня | +50 | 📚 | Common |
| `level_10` | Практик | Достичь 10 уровня | +100 | 💪 | Rare |
| `level_15` | Эксперт | Достичь 15 уровня | +150 | ⭐ | Epic |
| `level_20` | Мастер | Достичь 20 уровня | +200 | 👑 | Legendary |
| `level_25` | Гуру | Достичь 25 уровня | +300 | 🏆 | Mythic |

#### 🌅 Привычки и режим

| ID | Название | Условие | XP | Иконка | Редкость |
|----|----------|---------|---:|--------|----------|
| `early_bird` | Ранняя пташка | Завтрак до 9:00 7 дней | +100 | 🌅 | Rare |
| `night_owl_safe` | Без ночных перекусов | Нет еды после 22:00 7 дней | +100 | 🌙 | Rare |

### Achievement Popup (дизайн)

```
┌─────────────────────────────────┐
│  🏆 ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО! │
│                                 │
│       ⭐ Неделя успеха ⭐       │
│     7 дней подряд в норме!     │
│                                 │
│         +100 XP 💫              │
│      ────────────────          │
│      Редкость: RARE 🔷          │
│                                 │
│        [🎉 Отлично!]            │
└─────────────────────────────────┘
```

### Развёрнутая панель достижений

```
┌─────────────────────────────────────────────────────┐
│  🏆 ДОСТИЖЕНИЯ  (8/25)                    [Закрыть]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  🔥 STREAK                                          │
│  [🔥✓] [🏆✓] [⭐○] [👑○] [💎○]                      │
│   3d     7d    14d   30d   100d                    │
│                                                     │
│  🎯 ПЕРВЫЕ ШАГИ                                    │
│  [🎯✓] [💧✓] [🏃✓] [⚖️✓] [📋✓]                     │
│                                                     │
│  💎 КАЧЕСТВО ДНЯ                                   │
│  [💎✓] [🌟○] [⚖️○] [🥗○]                           │
│                                                     │
│  💧 ВОДА И АКТИВНОСТЬ                              │
│  [💧✓] [🌊○] [💪○] [👟○]                           │
│                                                     │
│  ⭐ УРОВНИ                                         │
│  [📚✓] [💪○] [⭐○] [👑○] [🏆○]                      │
│    5     10    15    20    25                      │
│                                                     │
│  🌅 ПРИВЫЧКИ                                       │
│  [🌅○] [🌙○]                                       │
│                                                     │
└─────────────────────────────────────────────────────┘

Легенда: ✓ = разблокировано, ○ = заблокировано
```

- **Показ**: Modal с анимацией появления (scale + fade)
- **Confetti**: Да, при Rare+ достижениях
- **Haptic**: `HEYS.haptic('success')` при unlock
- **Sound**: Опционально (Web Audio API)
- **Dismiss**: Tap anywhere или кнопка

---

## 🏗️ Phase 3: Notifications & Polish

### Must Have

- [ ] **Level Up notification** — Popup под hdr-top
  - **Where**: Разворачивается под gamification bar, поверх hdr-bottom
  - **Animation**: slideDown + scale, auto-hide через 4 сек
  - **Acceptance**: При level up показывается "🎉 Уровень 8! Ты теперь Практик"
  - **Bonus**: Confetti при уровнях кратных 5

- [ ] **Achievement popup** — Popup под hdr-top
  - **UI**: Аналогично level up, но с иконкой достижения
  - **Animation**: slideDown + confetti при milestone достижениях
  - **Auto-hide**: 5 сек или tap anywhere

- [ ] **Game Popup компонент**
  - **Файл**: `apps/web/heys_gamification_v1.js`
  - **Позиция**: `position: absolute; top: 100%; left: 0; right: 0`
  - **CSS**: Rounded bottom corners, gradient background, shadow
  - **States**: hidden → visible (slideDown) → hidden (slideUp)

```javascript
// Game Popup API
HEYS.game.showPopup({
  type: 'level_up', // 'level_up' | 'achievement' | 'daily_bonus'
  title: '🎉 Уровень 8!',
  subtitle: 'Ты теперь Практик 💪',
  xp: '+100 XP',
  confetti: true,
  duration: 4000 // auto-hide
});
```

### Could Have (nice to have)

- [ ] **Achievements gallery** — Просмотр всех достижений
  - **Where**: В профиле, новая секция "🏆 Достижения"
  - **UI**: Grid карточек (locked/unlocked)
  - **Статистика**: "Получено 12/25 достижений"

- [ ] **Weekly XP Report** — В advice модуле
  - **Trigger**: Воскресенье вечер
  - **Text**: "На этой неделе: 450 XP, 2 достижения! 🚀"

- [ ] **Level-up celebration** — При переходе на новый уровень
  - **Confetti**: Обязательно при ур. 5, 10, 15, 20
  - **Sound**: Опционально (Web Audio API)
  - **Popup**: Поздравление + новый титул

---

## 📊 XP Таблица (конфигурация)

| Действие | XP | Reason ID | Условие |
|----------|---:|-----------|---------|
| Добавить продукт | +5 | `product_added` | Каждый раз |
| Добавить воду | +2 | `water_added` | Макс 10 раз/день |
| Добавить тренировку | +15 | `training_added` | До 3 в день |
| Заполнить сон | +5 | `sleep_logged` | Один раз/день |
| Заполнить вес | +5 | `weight_logged` | Один раз/день |
| Выполнить норму калорий | +50 | `day_completed` | ratio 0.75-1.1, один раз/день |
| Streak 3 дня | +30 | `streak_3` | При достижении |
| Streak 7 дней | +100 | `streak_7` | При достижении |
| Streak 14 дней | +200 | `streak_14` | При достижении |
| Streak 30 дней | +500 | `streak_30` | При достижении |
| Perfect day (ratio 0.95-1.05) | +25 | `perfect_day` | Бонус к day_completed |

**Защита от спама**: Использовать `sessionStorage` или `heys_xp_daily_{date}` для отслеживания уже начисленных "разовых" бонусов.

---

## 📈 Уровни и пороги

```javascript
const LEVEL_THRESHOLDS = [
  0,      // Уровень 1: 0 XP
  100,    // Уровень 2: 100 XP
  300,    // Уровень 3: 300 XP
  600,    // Уровень 4: 600 XP
  1000,   // Уровень 5: 1000 XP
  1500,   // Уровень 6: 1500 XP
  2200,   // Уровень 7: 2200 XP
  3000,   // Уровень 8: 3000 XP
  4000,   // Уровень 9: 4000 XP
  5200,   // Уровень 10: 5200 XP
  6500,   // ...и т.д. с увеличением шага
  8000,
  10000,
  12500,
  15500,
  19000,
  23000,
  27500,
  32500,
  38000,  // Уровень 20
];
```

**Расчёт**: 
- Ур. 1→2: ~20 действий (2-3 дня активного трекинга)
- Ур. 10: ~2-3 недели активного использования
- Ур. 20: ~2-3 месяца

---

## 🔗 Ключевые файлы (аудит)

| Файл | Что смотреть | Строки |
|------|--------------|--------|
| `heys_day_v12.js` | `addProductToMeal()` — точка интеграции | ~2483-2500 |
| `heys_day_v12.js` | `addWater()` — вода | ~1873-1890 |
| `heys_day_v12.js` | Training save — тренировки | ~2080-2120 |
| `heys_day_v12.js` | `currentStreak` — расчёт streak | ~2545-2580 |
| `heys_ratio_zones_v1.js` | `isSuccess()` — определение успешного дня | ~120-125 |
| `heys_storage_layer_v1.js` | `Store.set/get` — паттерн хранения | ~1-100 |
| `archive/legacy-v12/gaming/heys_gaming_system_v1.js` | Legacy XP система (референс) | вся |

---

## ✅ DONE (Критерии приёмки)

### Functional

- [ ] XP начисляется при добавлении продукта, воды, тренировки
- [ ] XP показывается в UI (уровень + прогресс-бар)
- [ ] Level up notification работает
- [ ] Данные сохраняются между сессиями (localStorage)
- [ ] Защита от повторных начислений работает

### Quality Gates

- [ ] `pnpm type-check` PASS
- [ ] `pnpm lint` PASS
- [ ] `pnpm build` PASS
- [ ] Manual test: добавить продукт → видеть +5 XP

### UI Testing

**Mobile (Chrome DevTools → iPhone SE):**
- [ ] XP bar виден и не перекрывает контент
- [ ] Toast "+5 XP" появляется и исчезает
- [ ] Анимация прогресс-бара плавная

**Desktop:**
- [ ] XP bar адаптируется к ширине

---

## 🤖 AI Context

### Паттерны для использования

```javascript
// Storage (Legacy) — используй этот паттерн
const U = HEYS.utils || {};
U.lsSet('heys_game', { totalXP: 100, level: 1, lastUpdate: Date.now() });
const gameData = U.lsGet('heys_game', { totalXP: 0, level: 1 });

// ⚠️ ВАЖНО: U.lsSet автоматически добавляет clientId prefix!
// Это значит XP data отдельная для каждого клиента

// Events — для оповещения UI
window.dispatchEvent(new CustomEvent('heysXPGained', { 
  detail: { amount: 5, reason: 'product_added', newTotal: 105 } 
}));
window.dispatchEvent(new CustomEvent('heysLevelUp', { 
  detail: { newLevel: 8, title: 'Практик' } 
}));

// Haptic feedback — УЖЕ ЕСТЬ в проекте!
if (HEYS.utils && HEYS.utils.haptic) {
  HEYS.utils.haptic('light');   // +5 XP
  HEYS.utils.haptic('success'); // level up
}

// Confetti — УЖЕ ЕСТЬ, но нужно централизовать
// Вместо прямого setShowConfetti — использовать HEYS.game.celebrate()
```

### Референс из legacy gaming

Файл `archive/legacy-v12/gaming/heys_gaming_system_v1.js` содержит:
- `GAME_CONFIG.XP_MULTIPLIER = 1.2` — множитель опыта
- `ExperienceSystem.calculateLevel(totalXP)` — расчёт уровня
- `addExperience(amount, reason)` — добавление опыта

**Упростить**: Не нужны валюты (coins, energy), challenges. Только XP + уровни + achievements.

### Существующие зависимости

| Что | Где | Как использовать |
|-----|-----|------------------|
| `currentStreak` | `heys_day_v12.js:2574` | Нужно экспортировать в `HEYS.Day.getStreak()` |
| `setShowConfetti` | `heys_day_v12.js:1554` | Вызывать через event или prop |
| `haptic()` | `heys_day_utils.js:19` | `HEYS.utils.haptic(type)` |
| `ratioZones.isSuccess()` | `heys_ratio_zones_v1.js:120` | Проверка успешного дня |
| `U.lsSet/lsGet` | `heys_core_v12.js` | Storage с clientId |

---

## 📝 Notes

- **Priority**: high (retention критичен)
- **Complexity**: M (~2.5-3 часа)
- **Created**: 2025-11-30
- **Audit Version**: 6.0 (финальный, все решения приняты)

---

## ✨ WOW-эффекты и современные практики

> **Цель**: Сделать систему не просто функциональной, а ПРИЯТНОЙ и современной

### 🎨 Micro-animations (обязательно)

| Элемент | Анимация | Реализация |
|---------|----------|------------|
| **XP gain** | Число вылетает вверх и исчезает | CSS `@keyframes flyUp { 0% { opacity:1; transform:translateY(0) } 100% { opacity:0; transform:translateY(-20px) } }` |
| **Progress bar** | Плавное заполнение с glow | `transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` + `box-shadow: 0 0 10px currentColor` |
| **Level up** | Число пульсирует 3 раза | `@keyframes pulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.2) } }` |
| **Milestone confetti** | Уже есть в проекте | Переиспользовать `setShowConfetti(true)` |
| **Flying star** | Бeзье-дуга от source к target | `cubic-bezier(0.25, 0.1, 0.25, 1)` + scale down |

### 🔊 Sound Effects (опционально, но вау)

```javascript
// Простые звуки через Web Audio API (без файлов!)
const audioCtx = new AudioContext();
function playXPSound() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain).connect(audioCtx.destination);
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
  osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // A6
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}
// Использование: playXPSound() при level up
// Настройка: localStorage 'heys_sounds' = 'on'|'off'
```

### 🏆 Визуальные уровни (титулы)

| Уровни | Титул | Иконка | Цвет | CSS Variable |
|--------|-------|--------|------|--------------|
| 1-4 | Новичок | 🌱 | #94a3b8 (серый) | `--level-color` |
| 5-9 | Ученик | 📚 | #3b82f6 (синий) | `--level-color` |
| 10-14 | Практик | 💪 | #22c55e (зелёный) | `--level-color` |
| 15-19 | Эксперт | ⭐ | #eab308 (золотой) | `--level-color` |
| 20+ | Мастер | 👑 | #a855f7 (фиолетовый) | `--level-color` |

**UI**: `👑 Мастер · Ур. 23` — титул показывается в профиле
**Bonus**: XP bar меняет цвет в зависимости от уровня!

### 📊 Streak визуализация (уже есть данные!)

```
Текущий streak: 🔥🔥🔥🔥🔥 5 дней
                ▲
          сегодня в норме — огонь горит!
```

**Идея**: В XP bar добавить мини-индикатор streak рядом с уровнем:
`⭐ Ур.7 | 🔥5 | ████████░░ 450/600`

### 🎁 Daily Login Bonus (РЕКОМЕНДУЮ!)

```
┌──────────────────────────────┐
│  🎁 Ежедневный бонус!        │
│                              │
│  День 1: +10 XP  ✓           │
│  День 2: +15 XP  ✓           │
│  День 3: +20 XP  ← сегодня   │
│  День 4: +25 XP              │
│  День 5: +30 XP              │
│  День 6: +40 XP              │
│  День 7: +50 XP 🎉           │
│                              │
│      [Забрать +20 XP]        │
└──────────────────────────────┘
```

**Механика**: 
- При первом входе за день — показать popup
- Прогрессивный бонус: 10→15→20→25→30→40→50 XP
- Сброс при пропуске дня (но не streak!)
- **Storage**: `heys_login_streak` (отдельно от основного streak)

### ⚡ Combo System (WOW!)

```javascript
// 3+ действия за 60 секунд = COMBO!
let comboCount = 0;
let comboTimer = null;

function triggerCombo() {
  comboCount++;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { comboCount = 0; }, 60000);
  
  if (comboCount >= 3) {
    const multiplier = Math.min(2, 1 + comboCount * 0.1); // x1.3, x1.4, x1.5... max x2
    showComboPopup(`COMBO x${multiplier.toFixed(1)}! 🔥`);
    return multiplier;
  }
  return 1;
}
```

**UI**: При combo показать `⚡ COMBO x1.5` над XP bar

### 💡 Психологические триггеры

1. **Loss aversion**: "Не потеряй streak! Осталось 3 часа до полуночи" (в advice)
2. **Progress illusion**: XP bar начинается с 5% заполненности (а не с 0)
3. **Random rewards**: 5% шанс x2 XP за случайное действие ("🎲 Бонус! +10 XP вместо +5")
4. **Near-miss**: "Ещё 50 XP до уровня 8!" (показывать когда <10% осталось)
5. **Endowed progress**: Первый уровень даётся бесплатно (начинаем с Ур.1, не Ур.0)

### 🌟 Modern UI Touches

| Эффект | Где | Как |
|--------|-----|-----|
| **Glassmorphism** | XP bar background | `backdrop-filter: blur(10px); background: rgba(255,255,255,0.1)` |
| **Gradient shimmer** | Progress bar при level up | `background: linear-gradient(90deg, ...)` + animation |
| **Particle burst** | При achievement | 5-10 звёздочек разлетаются из центра |
| **Haptic feedback** | При XP gain | `HEYS.utils.haptic('light')` — уже есть! |
| **Reduced motion** | Все анимации | `@media (prefers-reduced-motion: reduce)` — отключить |

---

## 🔄 Future Ideas (после MVP)

| Идея | Сложность | Вау-фактор |
|------|-----------|------------|
| **Combo system** | M | ⭐⭐⭐⭐ — 3 действия за минуту = x1.5 XP |
| **Sound effects** | S | ⭐⭐ — приятные звуки level up |
| **Random x2 rewards** | S | ⭐⭐⭐ — 5% шанс удвоения |
| **Weekly challenges** | L | ⭐⭐⭐ — персональные цели |
| **Сезонные события** | M | ⭐⭐⭐ — Новый год: x2 XP неделя |

---

## 🚀 Порядок выполнения

### Phase 0.5: Блокеры фундамента (15 мин) ⚠️ ВЫПОЛНИТЬ ПЕРВЫМ!

> **Без этого Phase 1 будет сломан!**

```javascript
// B1-B2: Добавить data-game-source атрибуты к кнопкам добавления
// B3: Placeholder уже есть — нужно добавить React state
// B4: Добавить dispatch в addProductAndFocusGrams
// B5: Экспортировать HEYS.Day.getStreak()
// B6: Добавить логику day_completed (D1: проверяем вчера утром)
```

1. **B1-B2**: Добавить `data-game-source="product-btn-{id}"` к кнопкам продуктов
2. **B4**: В `addProductAndFocusGrams()` добавить `window.dispatchEvent(new CustomEvent('heysProductAdded', {...}))`
3. **B5**: В конце DayTab добавить `HEYS.Day = { getStreak: () => currentStreak }`
4. **B6**: В `useEffect` при монтировании проверять вчерашний день:
   ```javascript
   if (hour < 12) {
     const yesterday = HEYS.ratioZones.isSuccess(yesterdayRatio);
     if (yesterday && !claimed('day_completed_' + yesterdayDate)) {
       HEYS.game.addXP(50, 'day_completed');
     }
   }
   ```

### Phase 0: Подготовка фундамента (25 мин) ✅ ВЫПОЛНЕНО!
- ✅ Экспортировать `HEYS.Day.getStreak()` из useMemo
- ✅ Убрать "Панель куратора" из hdr-top
- ✅ Theme toggle → FAB (fixed, top-right)
- ✅ "Сменить клиента" → long-press на аватар
- ✅ Analytics button → в Профиль
- ✅ Placeholder для XP bar

### Phase 1: Core Module (45 мин)
10. Создать `heys_gamification_v1.js`:
    - `HEYS.game.addXP(amount, reason, sourceEl)`
    - `HEYS.game.getLevel()`, `getProgress()`, `getStats()`
    - `HEYS.game.flyToBar(sourceEl)` — flying animation
    - `HEYS.game.celebrate()` — centralized confetti
11. GamificationBar компонент (React, в hdr-top):
    - Progress bar с glow
    - Level + streak indicator
    - Tap → expanded panel (stats + ALL achievements)
12. Daily login bonus popup (onboarding XP)
13. Подключить в `index.html`
14. Тест в консоли: `HEYS.game.addXP(50, 'test')`

### Phase 2: Интеграция (30 мин)
15. addXP в `addProductToMeal()` + flying star
16. addXP в `addProductAndFocusGrams()` + flying star
17. addXP в `addProductWithGrams()` + flying star
18. addXP в `addWater()` + flying star
19. addXP в `confirmTrainingPicker()`
20. addXP при заполнении сна/веса (в user tab)
21. day_completed check (D1: утром проверяем вчера)

### Phase 3: Achievements (45 мин)
22. Achievements library (25 штук в 5 категориях)
23. Achievement popup (modal с confetti)
24. Streak achievements (автопроверка при каждом addXP)
25. Level achievements (при level up)
26. Expanded panel с grid всех 25 ачивок (locked/unlocked)

### Phase 4: Polish & Notifications (25 мин)
27. Level up notification + confetti (levels % 5)
28. Micro-animations (pulse, glow, flying star bezier)
29. Haptic feedback (использовать `HEYS.haptic()`)
30. `prefers-reduced-motion` support

### Phase 5: Testing & QA (15 мин)
31. `pnpm type-check && pnpm lint && pnpm build`
32. Mobile test (iPhone SE в DevTools)
33. Edge cases: 0 XP, level up boundary, multi-client switch
34. Performance: no layout shifts, smooth animations

**Общее время**: ~2.5-3 часа

---

## ⚠️ Оверкилл-чеклист (НЕ делать)

> Решено в v6.0: фокус на XP + уровни + 25 ачивок

### ❌ Точно НЕТ:
- **Coins/валюты** — пользователь сказал "нет" ✅ решено
- **Shop** с покупками — не нужен
- **Leaderboard** — требует бэкенда
- **Avatar customization** — сложно, низкий ROI
- **Prestige/Rebirth** — только если дойдём до max level
- **Weekly challenges** — требует много логики

### ⏳ Отложить на будущее (после стабилизации):
- **Sound effects** — приятно, но не критично
- **Combo system** — WOW, но можно позже
- **Random rewards (x2 XP)** — можно позже
- **Сезонные события** — после product-market fit

### ✅ Включить сейчас:
- Daily login bonus (+10-50 XP) — retention hook
- Flying XP animation — визуальный WOW
- Level up confetti — переиспользуем существующий
- Титулы уровней — lookup table, бесплатный wow
- **25 ачивок в 5 категориях** — полноценная система
- **Expanded panel с прогрессом** — смотреть приятно

---

## 🎯 Критерии успеха

| Метрика | Цель | Как проверить |
|---------|------|---------------|
| **XP работает** | 100% | Добавить продукт → XP увеличился |
| **Flying animation** | 80% | Звезда летит к bar (fallback на центр) |
| **Level up** | Popup | Набрать 100 XP → Уровень 2 + confetti |
| **Streak в bar** | 🔥N | Показывает currentStreak |
| **25 ачивок** | Grid | Expanded panel → все 25 видны |
| **Locked/Unlocked** | Визуально | Серые locked, цветные unlocked |
| **Mobile OK** | 320px | Все элементы видны, touch работает |
| **Performance** | <100ms | Нет лагов при addXP |
| **Persistence** | ✅ | Обновить страницу → XP на месте |
| **Multi-client** | ✅ | Смена клиента → свои XP у каждого |
