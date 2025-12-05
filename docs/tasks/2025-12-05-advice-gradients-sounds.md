# 🎨🔊 Gradient Borders + Sound Effects для советов

**Дата**: 2025-12-05  
**Время**: ~40 мин  
**Статус**: Готов к реализации

---

## Phase 0 — Подготовка (обязательно перед реализацией)

### Проверено ✅
- [x] Существующие стили `.advice-list-item-*` в `400-water-and-hydration.css` (строки 947-970)
- [x] Dark mode стили есть (строки 1062-1076)
- [x] Стили тоста `.macro-toast-*` в `100-metrics-and-graphs.css` (строки 4400-4430)
- [x] Звуковой модуль `playAdviceSound` уже есть в `heys_day_v12.js` (строка 2050)
- [x] Настройка `soundEnabled: true` в `heys_advice_v1.js` (строка 435)

### Решения зафиксированы
- **Gradient**: Border (не background) — более элегантно
- **Звуки**: Включены по умолчанию, отключаются в профиле
- **Типы**: 5 ключевых (achievement, warning, tip, success, streak)
- **Scope**: Toast + List (оба)

---

## Задача 1: Gradient Borders для карточек советов (20 мин)

### 1.1 Список советов (400-water-and-hydration.css)

**Файл**: `apps/web/styles/modules/400-water-and-hydration.css`

Заменить текущие стили `.advice-list-item-*` (строки ~947-970) на gradient border:

```css
/* === Gradient Borders для типов советов === */
.advice-list-item {
  /* ... существующие стили ... */
  border: 2px solid transparent;
  background: 
    linear-gradient(var(--surface, white), var(--surface, white)) padding-box,
    var(--advice-gradient) border-box;
  --advice-gradient: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); /* default: slate */
}

.advice-list-item-tip {
  --advice-gradient: linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%); /* blue */
}

.advice-list-item-warning {
  --advice-gradient: linear-gradient(135deg, #fca5a5 0%, #ef4444 100%); /* red */
}

.advice-list-item-achievement {
  --advice-gradient: linear-gradient(135deg, #fde047 0%, #f59e0b 100%); /* gold */
}

.advice-list-item-success {
  --advice-gradient: linear-gradient(135deg, #6ee7b7 0%, #10b981 100%); /* emerald */
}

.advice-list-item-streak {
  --advice-gradient: linear-gradient(135deg, #fdba74 0%, #f97316 100%); /* orange-fire */
}

.advice-list-item-emotional {
  --advice-gradient: linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 100%); /* purple */
}

.advice-list-item-hydration {
  --advice-gradient: linear-gradient(135deg, #67e8f9 0%, #06b6d4 100%); /* cyan */
}
```

**Dark mode** (строки ~1062+):
```css
[data-theme="dark"] .advice-list-item {
  background: 
    linear-gradient(var(--surface, #1f2937), var(--surface, #1f2937)) padding-box,
    var(--advice-gradient) border-box;
}
```

### 1.2 Toast (100-metrics-and-graphs.css)

**Файл**: `apps/web/styles/modules/100-metrics-and-graphs.css`

Обновить стили `.macro-toast-*` (строки ~4400-4430):

```css
.macro-toast {
  /* ... существующие стили ... */
  border: 2px solid transparent;
  background: 
    linear-gradient(var(--color-white), var(--color-white)) padding-box,
    var(--toast-gradient, linear-gradient(135deg, #94a3b8, #64748b)) border-box;
}

.macro-toast-tip {
  --toast-gradient: linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%);
}

.macro-toast-warning {
  --toast-gradient: linear-gradient(135deg, #fca5a5 0%, #ef4444 100%);
}

.macro-toast-achievement {
  --toast-gradient: linear-gradient(135deg, #fde047 0%, #f59e0b 100%);
}

.macro-toast-success {
  --toast-gradient: linear-gradient(135deg, #6ee7b7 0%, #10b981 100%);
}

.macro-toast-streak {
  --toast-gradient: linear-gradient(135deg, #fdba74 0%, #f97316 100%);
}
```

**Dark mode**:
```css
[data-theme="dark"] .macro-toast {
  background: 
    linear-gradient(var(--surface, #1f2937), var(--surface, #1f2937)) padding-box,
    var(--toast-gradient, linear-gradient(135deg, #94a3b8, #64748b)) border-box;
}
```

---

## Задача 2: Улучшенные Sound Effects (15 мин)

### 2.1 Создать звуковой модуль

**Файл**: `apps/web/heys_sounds_v1.js` (новый)

```javascript
/**
 * HEYS Sounds Module v1
 * Синтезированные звуки через Web Audio API
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Lazy AudioContext (создаётся при первом звуке)
  let audioCtx = null;
  
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioCtx = new AudioContext();
    }
    // Resume если suspended (iOS requirement)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }
  
  // Проверка настроек
  function isSoundEnabled() {
    try {
      const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
      return settings.soundEnabled !== false; // true по умолчанию
    } catch { return true; }
  }
  
  // Проверка тихих часов
  function isQuietHours() {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 7;
  }
  
  // Проверка prefers-reduced-motion
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  
  /**
   * Воспроизвести звук
   * @param {string} type - 'pop' | 'ding' | 'success' | 'warning' | 'whoosh'
   */
  function play(type) {
    if (!isSoundEnabled() || isQuietHours() || prefersReducedMotion()) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    
    try {
      switch (type) {
        case 'pop':
          playPop(ctx);
          break;
        case 'ding':
          playDing(ctx);
          break;
        case 'success':
        case 'achievement':
          playSuccess(ctx);
          break;
        case 'warning':
          playWarning(ctx);
          break;
        case 'whoosh':
          playWhoosh(ctx);
          break;
        default:
          playPop(ctx);
      }
    } catch (e) {
      console.warn('[HEYS Sounds] Error:', e);
    }
  }
  
  // === Звуки ===
  
  // Pop - мягкий появление
  function playPop(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }
  
  // Ding - прочитано
  function playDing(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08); // G5
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
  
  // Success/Achievement - мажорный аккорд
  function playSuccess(ctx) {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (C major)
    const duration = 0.35;
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = 'sine';
      
      const startTime = ctx.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.07, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }
  
  // Warning - низкий тон
  function playWarning(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
    osc.frequency.setValueAtTime(196, ctx.currentTime + 0.1); // G3
    osc.type = 'triangle';
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }
  
  // Whoosh - свайп
  function playWhoosh(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
  
  // Экспорт
  HEYS.sounds = {
    play,
    isEnabled: isSoundEnabled,
    // Алиасы для удобства
    pop: () => play('pop'),
    ding: () => play('ding'),
    success: () => play('success'),
    warning: () => play('warning'),
    whoosh: () => play('whoosh')
  };
  
})(typeof window !== 'undefined' ? window : global);
```

### 2.2 Подключить в index.html

После `heys_advice_v1.js`:
```html
<script src="heys_sounds_v1.js"></script>
```

### 2.3 Интеграция в heys_day_v12.js

Заменить `playAdviceSound` (строка ~2050):
```javascript
const playAdviceSound = React.useCallback((type = 'ding') => {
  if (window.HEYS?.sounds?.play) {
    window.HEYS.sounds.play(type);
  }
}, []);
```

Добавить звуки в нужных местах:
- Toast появился: `HEYS.sounds.pop()`
- Свайп прочитано: `HEYS.sounds.ding()`
- Свайп скрыто: `HEYS.sounds.whoosh()`
- Achievement: `HEYS.sounds.success()`

---

## Задача 3: Toggle в профиле (5 мин)

**Файл**: `apps/web/heys_user_v12.js`

Найти секцию настроек и добавить toggle:
```javascript
// Звуки советов
React.createElement('div', { className: 'setting-row' },
  React.createElement('span', null, '🔊 Звуки советов'),
  React.createElement('input', {
    type: 'checkbox',
    checked: adviceSettings.soundEnabled !== false,
    onChange: (e) => {
      const settings = { ...adviceSettings, soundEnabled: e.target.checked };
      localStorage.setItem('heys_advice_settings', JSON.stringify(settings));
      setAdviceSettings(settings);
    }
  })
)
```

---

## Чеклист после реализации

- [ ] Light mode: градиенты видны, не слишком яркие
- [ ] Dark mode: градиенты видны на тёмном фоне
- [ ] Toast: градиентный border появляется
- [ ] Список: градиентные borders у всех типов
- [ ] Звук pop при появлении toast
- [ ] Звук ding при свайпе влево
- [ ] Звук whoosh при свайпе вправо
- [ ] Звук success при achievement
- [ ] Тихие часы (23-07) — без звуков
- [ ] Toggle в профиле работает
- [ ] `pnpm type-check && pnpm build` проходит

---

## Rollback

```bash
# CSS:
git checkout apps/web/styles/modules/400-water-and-hydration.css
git checkout apps/web/styles/modules/100-metrics-and-graphs.css

# Sounds (просто удалить файл):
rm apps/web/heys_sounds_v1.js
# И убрать <script> из index.html
```
