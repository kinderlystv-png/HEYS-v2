# UX & Gamification Sprint

**Дата**: 2025-12-03  
**Время**: ~2-3 часа (можно делить на части)  
**Цель**: Добавить визуальные улучшения + базовую gamification систему  
**Приоритет**: 🔥 Высокий — пользовательская ценность

---

## 📋 Обзор задач

| # | Фича | Время | Impact |
|---|------|-------|--------|
| 1 | Mini-heatmap недели | 20 мин | UX ⭐⭐⭐ |
| 2 | Прогресс к цели веса | 30 мин | Motivation ⭐⭐⭐ |
| 3 | PWA Badge + Shortcuts | 20 мин | Engagement ⭐⭐ |
| 4 | XP система (базовая) | 45 мин | Retention ⭐⭐⭐⭐ |

**Итого**: ~2 часа активной работы

---

## 1️⃣ Mini-heatmap недели (20 мин)

### Что делаем
7 цветных квадратиков (пн-вс) с индикацией калорий по `ratioZones`:
- 🟢 good/perfect (0.75-1.1)
- 🟡 low/over (0.5-0.75, 1.1-1.3)
- 🔴 crash/binge (<0.5, >1.3)
- ⚪ empty (нет данных)

### Где размещаем
**DayTab** → под датой, перед MealCards

### Ключевые файлы
| Файл | Что делать |
|------|-----------|
| `apps/web/heys_day_v12.js` | Добавить WeekHeatmap компонент |
| `apps/web/heys_ratio_zones_v1.js` | Использовать `HEYS.ratioZones.getColor(ratio)` |

### Реализация

```javascript
// Внутри DayTab, перед MealCards
function WeekHeatmap({ currentDate, onDayClick }) {
  const [weekData, setWeekData] = React.useState([]);
  
  React.useEffect(() => {
    const days = [];
    const current = new Date(currentDate);
    const monday = new Date(current);
    monday.setDate(current.getDate() - current.getDay() + 1);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayData = U.lsGet(`heys_dayv2_${dateStr}`, null);
      
      let ratio = 0;
      if (dayData && dayData.meals?.length) {
        const kcal = HEYS.models.calcDayTotals(dayData, pIndex).kcal;
        const optimum = HEYS.models.calcOptimum(prof);
        ratio = kcal / optimum;
      }
      
      days.push({
        date: dateStr,
        dayName: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i],
        ratio,
        isToday: dateStr === currentDate
      });
    }
    setWeekData(days);
  }, [currentDate]);
  
  return (
    <div className="flex gap-1 justify-center my-2">
      {weekData.map(d => (
        <button
          key={d.date}
          onClick={() => onDayClick(d.date)}
          className={`w-8 h-8 rounded text-xs font-medium transition-transform active:scale-95 ${d.isToday ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
          style={{ 
            backgroundColor: d.ratio > 0 
              ? HEYS.ratioZones.getColor(d.ratio) 
              : '#e5e7eb',
            color: d.ratio > 0 ? '#fff' : '#9ca3af'
          }}
        >
          {d.dayName}
        </button>
      ))}
    </div>
  );
}
```

### Чеклист
- [ ] Компонент WeekHeatmap создан
- [ ] Использует ratioZones для цветов
- [ ] Клик переходит на день (`onDayClick` → `setDate`)
- [ ] Текущий день подсвечен ring
- [ ] Haptic feedback на клик

---

## 2️⃣ Прогресс к цели веса (30 мин)

### Что делаем
- Добавить `weightGoal` в профиль пользователя
- Показать прогресс-бар в correlation-block (где тренд веса)

### Ключевые файлы
| Файл | Что делать |
|------|-----------|
| `apps/web/heys_user_v12.js` | Добавить поле `weightGoal` в профиль |
| `apps/web/heys_day_v12.js` | Показать прогресс-бар рядом с weight trend |

### Формула прогресса
```javascript
const startWeight = prof.weight; // начальный вес из профиля
const goalWeight = prof.weightGoal; // целевой вес
const currentWeight = day.weightMorning || startWeight;

// Процент выполнения
const totalDiff = startWeight - goalWeight; // например 80 - 75 = 5 кг
const currentDiff = startWeight - currentWeight; // 80 - 78 = 2 кг сброшено
const progressPct = totalDiff > 0 
  ? Math.min(100, Math.round((currentDiff / totalDiff) * 100))
  : 0;
```

### UI компонент
```javascript
function WeightProgress({ startWeight, goalWeight, currentWeight }) {
  const totalDiff = startWeight - goalWeight;
  const currentDiff = startWeight - currentWeight;
  const pct = totalDiff > 0 ? Math.min(100, Math.round((currentDiff / totalDiff) * 100)) : 0;
  
  const remaining = (goalWeight - currentWeight).toFixed(1);
  const isGaining = goalWeight > startWeight; // набор веса
  
  return (
    <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3 mt-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">Цель: {goalWeight} кг</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {remaining > 0 
          ? `Осталось ${isGaining ? 'набрать' : 'сбросить'}: ${Math.abs(remaining)} кг`
          : '🎉 Цель достигнута!'}
      </div>
    </div>
  );
}
```

### Чеклист
- [ ] Поле `weightGoal` добавлено в ProfileForm
- [ ] Сохраняется в `heys_profile`
- [ ] WeightProgress компонент создан
- [ ] Отображается в correlation-block (если есть weightGoal)
- [ ] Анимация прогресс-бара

---

## 3️⃣ PWA Badge + Shortcuts (20 мин)

### Что делаем
1. **Badge API** — показывать streak на иконке приложения
2. **Дополнительные shortcuts** — add-water, training

### Ключевые файлы
| Файл | Что делать |
|------|-----------|
| `apps/web/sw.js` или `heys_app_v12.js` | Badge API |
| `manifest.webmanifest` | Shortcuts |

### Badge API
```javascript
// При обновлении streak
async function updateBadge(streak) {
  if ('setAppBadge' in navigator) {
    try {
      if (streak > 0) {
        await navigator.setAppBadge(streak);
      } else {
        await navigator.clearAppBadge();
      }
    } catch (e) {
      console.warn('Badge API not supported');
    }
  }
}

// Вызывать при:
// 1. Открытии приложения
// 2. После добавления приёма (если ratio достиг good/perfect)
```

### Shortcuts в manifest
```json
{
  "shortcuts": [
    {
      "name": "+ Приём",
      "short_name": "Приём",
      "url": "/?action=add-meal",
      "icons": [{ "src": "/icons/meal-96.png", "sizes": "96x96" }]
    },
    {
      "name": "+ Вода",
      "short_name": "Вода",
      "url": "/?action=add-water",
      "icons": [{ "src": "/icons/water-96.png", "sizes": "96x96" }]
    },
    {
      "name": "Тренировка",
      "short_name": "Трен",
      "url": "/?action=training",
      "icons": [{ "src": "/icons/training-96.png", "sizes": "96x96" }]
    }
  ]
}
```

### Обработка action в DayTab
```javascript
React.useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  
  if (action === 'add-meal') {
    // Уже реализовано ✅
  } else if (action === 'add-water') {
    // Добавить 250мл воды
    setDay(prev => ({
      ...prev,
      waterMl: (prev.waterMl || 0) + 250,
      lastWaterTime: new Date().toISOString()
    }));
    if (window.triggerHaptic) window.triggerHaptic('success');
  } else if (action === 'training') {
    // Открыть training picker
    setTrainingPickerOpen(true);
  }
  
  // Очистить URL
  if (action) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}, []);
```

### Чеклист
- [ ] Badge API — streak на иконке
- [ ] Shortcut add-water в manifest
- [ ] Shortcut training в manifest
- [ ] Обработчик action=add-water
- [ ] Обработчик action=training

---

## 4️⃣ XP система — базовая версия (45 мин)

### Что делаем
Система очков за действия → прогресс-бар → уровни.

### Начисление XP

| Действие | XP | Когда |
|----------|-----|-------|
| Добавил продукт | +5 | `addProductToMeal` |
| Создал приём | +10 | `addMeal` |
| Указал вес | +15 | `setDay({weightMorning})` |
| Выполнил норму (ratio 0.9-1.1) | +50 | Конец дня |
| Streak +1 день | +20 × streak | `calculateStreak` |
| Идеальный день (все метрики) | +100 | Конец дня |

### Уровни

| Уровень | XP | Название |
|---------|-----|----------|
| 1 | 0 | Новичок |
| 2 | 100 | Начинающий |
| 3 | 300 | Практикант |
| 4 | 600 | Опытный |
| 5 | 1000 | Эксперт |
| 6 | 1500 | Мастер |
| 7 | 2500 | Гуру |
| 8 | 4000 | Легенда |

### Storage
```javascript
// heys_xp
{
  total: 1250,           // Всего XP
  level: 5,              // Текущий уровень
  todayXP: 85,           // XP за сегодня
  history: [             // Последние 7 дней
    { date: '2025-12-03', xp: 85 },
    { date: '2025-12-02', xp: 120 }
  ]
}
```

### Ключевой файл
Создать `apps/web/heys_xp_v1.js`:

```javascript
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  const LEVELS = [
    { level: 1, xp: 0, name: 'Новичок' },
    { level: 2, xp: 100, name: 'Начинающий' },
    { level: 3, xp: 300, name: 'Практикант' },
    { level: 4, xp: 600, name: 'Опытный' },
    { level: 5, xp: 1000, name: 'Эксперт' },
    { level: 6, xp: 1500, name: 'Мастер' },
    { level: 7, xp: 2500, name: 'Гуру' },
    { level: 8, xp: 4000, name: 'Легенда' }
  ];
  
  const XP = {
    LEVELS,
    
    getData() {
      return U.lsGet('heys_xp', { total: 0, level: 1, todayXP: 0, history: [] });
    },
    
    saveData(data) {
      U.lsSet('heys_xp', data);
    },
    
    addXP(amount, reason) {
      const data = this.getData();
      const today = new Date().toISOString().slice(0, 10);
      
      data.total += amount;
      data.todayXP += amount;
      
      // Обновить history
      const todayEntry = data.history.find(h => h.date === today);
      if (todayEntry) {
        todayEntry.xp += amount;
      } else {
        data.history.unshift({ date: today, xp: amount });
        data.history = data.history.slice(0, 7); // Только 7 дней
      }
      
      // Проверить level up
      const oldLevel = data.level;
      data.level = this.calcLevel(data.total);
      
      this.saveData(data);
      
      // Показать toast
      if (window.HEYS?.showToast) {
        HEYS.showToast(`+${amount} XP`, 'success');
      }
      
      // Level up celebration!
      if (data.level > oldLevel) {
        this.onLevelUp(data.level);
      }
      
      return data;
    },
    
    calcLevel(totalXP) {
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (totalXP >= LEVELS[i].xp) return LEVELS[i].level;
      }
      return 1;
    },
    
    getLevelInfo(level) {
      return LEVELS.find(l => l.level === level) || LEVELS[0];
    },
    
    getNextLevel(level) {
      return LEVELS.find(l => l.level === level + 1);
    },
    
    getProgress() {
      const data = this.getData();
      const current = this.getLevelInfo(data.level);
      const next = this.getNextLevel(data.level);
      
      if (!next) return { pct: 100, remaining: 0 }; // Max level
      
      const inLevel = data.total - current.xp;
      const levelSize = next.xp - current.xp;
      
      return {
        pct: Math.round((inLevel / levelSize) * 100),
        remaining: next.xp - data.total
      };
    },
    
    onLevelUp(newLevel) {
      const info = this.getLevelInfo(newLevel);
      
      // Confetti!
      if (window.triggerConfetti) {
        window.triggerConfetti();
      }
      
      // Big toast
      if (window.HEYS?.showToast) {
        HEYS.showToast(`🎉 Уровень ${newLevel}: ${info.name}!`, 'success');
      }
      
      // Haptic
      if (window.triggerHaptic) {
        window.triggerHaptic('success');
      }
    }
  };
  
  HEYS.xp = XP;
})(typeof window !== 'undefined' ? window : global);
```

### UI компонент (в DayTab или header)
```javascript
function XPBar() {
  const [xpData, setXpData] = React.useState(HEYS.xp.getData());
  const progress = HEYS.xp.getProgress();
  const levelInfo = HEYS.xp.getLevelInfo(xpData.level);
  const nextLevel = HEYS.xp.getNextLevel(xpData.level);
  
  return (
    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium">
          Ур. {xpData.level} · {levelInfo.name}
        </span>
        <span className="text-xs text-gray-500">
          {xpData.total} XP
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      {nextLevel && (
        <div className="text-xs text-gray-500 mt-1">
          До уровня {nextLevel.level}: {progress.remaining} XP
        </div>
      )}
    </div>
  );
}
```

### Интеграция в хендлеры
```javascript
// В addProductToMeal:
HEYS.xp.addXP(5, 'product_added');

// В addMeal:
HEYS.xp.addXP(10, 'meal_created');

// При сохранении веса:
HEYS.xp.addXP(15, 'weight_logged');
```

### Чеклист
- [ ] Создать `heys_xp_v1.js`
- [ ] Подключить в index.html
- [ ] XPBar компонент
- [ ] Интегрировать в addProductToMeal (+5)
- [ ] Интегрировать в addMeal (+10)
- [ ] Интегрировать в weight save (+15)
- [ ] Level up → confetti + toast

---

## ✅ Финальный чеклист

### После каждой фичи:
- [ ] `node -c apps/web/heys_day_v12.js`
- [ ] Проверить в браузере

### После всех фич:
- [ ] `pnpm build`
- [ ] `pnpm lint`
- [ ] Ручные тесты: heatmap клик, weight progress, PWA shortcuts, XP начисление

---

## ⚠️ Ограничения

- НЕ трогать графики (строки 3400-6600)
- НЕ менять UMD формат
- Использовать `U.lsSet/lsGet` для storage
- Haptic feedback для всех интерактивных элементов

---

## 📊 Ожидаемый результат

| Фича | Impact |
|------|--------|
| Week heatmap | Быстрый обзор недели за 1 сек |
| Weight progress | Мотивация видеть цель |
| PWA shortcuts | Быстрый доступ к действиям |
| XP система | Retention через gamification |

---

## 🔙 Rollback

```bash
# Если что-то сломалось
git checkout apps/web/heys_day_v12.js
git checkout apps/web/heys_user_v12.js
```

---

## Следующие шаги (после спринта)

1. **Weekly Digest** — сводка недели по воскресеньям
2. **Badges/Achievements** — расширение XP системы
3. **Sparkline v2** — улучшения графика
