# Dark Mode — Полноценная реализация

> **Приоритет**: Средний  
> **Время**: ~30-40 минут  
> **Зависимости**: Нет

---

## 🎯 Цель

Добавить полноценный dark mode с:
- Тремя режимами: `light` / `dark` / `auto`
- Современным переключателем (cycle button)
- Полным покрытием tone-карточек
- Предотвращением FOUC (flash of unstyled content)

---

## 📋 Ключевые файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `apps/web/heys_day_v12.js` | EDIT | Обновить theme hook (добавить auto режим) |
| `apps/web/styles/main.css` | EDIT | Дополнить dark стили для tone-карточек |
| `apps/web/index.html` | EDIT | Добавить inline-скрипт для предотвращения FOUC |

**НЕ ТРОГАТЬ:**
- `styles/_variables.css` — НЕ используется в production
- `styles/dark_tokens.css` — НЕ подключён
- Inline стили в JS (hardcoded цвета delta-индикаторов)

---

## 🔴 Критические замечания (выявлено при аудите)

### 1. FOUC (Flash of Unstyled Content) — КРИТИЧНО

Сейчас тема применяется **после загрузки React** (~100-300ms). Пользователь увидит "вспышку" светлой темы.

**Решение**: Добавить **inline-скрипт в `<head>`** для мгновенного применения темы:
```html
<script>
  (function() {
    var t = localStorage.getItem('heys_theme');
    if (t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
```

### 2. Theme Toggle только на вкладке "День"

Сейчас toggle находится **только в `heys_day_v12.js`** (строка ~2885). На других вкладках (Рацион, Отчёты, Профиль) пользователь не может переключить тему.

**Решение**: Оставляем toggle на странице "День" — это основная страница. На других вкладках тема уже применена глобально через `data-theme` на `<html>`.

**Альтернатива (НЕ делаем — оверкилл)**:  
- ~~Выносить toggle в header~~ — требует рефакторинг `heys_app_v12.js`
- ~~Создавать глобальный ThemeProvider~~ — избыточно для legacy app

### 3. Конфликт @media (prefers-color-scheme) и [data-theme]

В `main.css:1416` есть media query для `.tabs`:
```css
@media (prefers-color-scheme: dark) {
  .tabs { ... }
}
```

При `theme='light'` + системная тема dark → конфликт стилей!

**Решение**: Заменить media query на `[data-theme="dark"]`.

### 4. PWA theme-color в index.html

```html
<meta name="theme-color" content="#6A5ACD" />
```

Это hardcoded светлый цвет. В dark mode адресная строка iOS/Android будет диссонировать.

**Решение (опционально)**: Добавить media query:
```html
<meta name="theme-color" content="#6A5ACD" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
```

---

## ✅ Задачи

### 1. Добавить inline-скрипт в `index.html` (предотвращение FOUC)

**Локация**: В `<head>`, перед загрузкой CSS

```html
<!-- Prevent FOUC: Apply theme before CSS loads -->
<script>
  (function() {
    var t = localStorage.getItem('heys_theme');
    var isDark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  })();
</script>
```

---

### 2. Обновить Theme Hook в `heys_day_v12.js`

**Локация**: строки ~616-627

**Изменения**:
1. Заменить `isDarkTheme: boolean` → `theme: 'light' | 'dark' | 'auto'`
2. Добавить `resolvedTheme` — вычисляемое значение
3. Добавить listener на `matchMedia` для auto режима
4. Cycle: light → dark → auto → light

```javascript
// === Theme ===
const [theme, setTheme] = useState(() => {
  return localStorage.getItem('heys_theme') || 'light';
});

// Вычисляем реальную тему
const resolvedTheme = useMemo(() => {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}, [theme]);

// Применяем тему + слушаем системные изменения
React.useEffect(() => {
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  localStorage.setItem('heys_theme', theme);
  
  if (theme !== 'auto') return;
  
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, [theme, resolvedTheme]);

const cycleTheme = () => {
  setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
};
```

---

### 3. Обновить Theme Toggle UI

**Локация**: строка ~2885

**Новый код**:
```javascript
React.createElement('button', {
  className: 'theme-toggle',
  onClick: cycleTheme,
  'data-theme-mode': theme,
  title: theme === 'light' ? 'Светлая тема' : theme === 'dark' ? 'Тёмная тема' : 'Авто (системная)'
}, theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'),
```

---

### 4. CSS: Удалить @media query + Добавить dark стили

**Шаг 4.1: Удалить** блок `@media (prefers-color-scheme: dark)` (строки ~1416-1431):

```css
/* УДАЛИТЬ ЭТОТ БЛОК ПОЛНОСТЬЮ */
@media (prefers-color-scheme: dark) {
  .tabs {
    background: #1c1c1e;
    border-top-color: #2c2c2e;
    box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.2);
  }
  .tab {
    color: #6c6c70;
  }
  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .tab.active {
    color: #818cf8;
  }
}
```

**Шаг 4.2: Добавить** новые стили перед `.theme-toggle` (после строки ~4398):

```css
/* === TONE CARDS - DARK === */
[data-theme="dark"] .tone-violet,
[data-theme="dark"] .card.tone-violet {
  background: #2d2640;
  border-color: #4c3d6e;
}

[data-theme="dark"] .tone-green {
  background: #1a2e1a;
  border-color: #2d4a2d;
}

[data-theme="dark"] .tone-green label {
  color: #86efac;
}

[data-theme="dark"] .tone-amber {
  background: #2e2a1a;
  border-color: #4a4020;
}

[data-theme="dark"] .tone-blue {
  background: #1a2535;
  border-color: #2d4055;
}

[data-theme="dark"] .tone-slate {
  background: #1e2530;
  border-color: #3a4555;
}

/* Violet main-violet card */
[data-theme="dark"] .card.tone-violet.main-violet {
  background: #1e1a2e;
  border-color: #3d3560;
}

[data-theme="dark"] .card.tone-violet.main-violet .violet-table th {
  background: #2a2445;
  color: #c4b5fd;
}

[data-theme="dark"] .card.tone-violet.main-violet .violet-table td {
  border-color: #4c3d6e;
  color: #e2e8f0;
}

[data-theme="dark"] .card.tone-violet.main-violet .stat {
  background: rgba(45, 38, 64, 0.5);
  border-color: #4c3d6e;
}

[data-theme="dark"] .card.tone-violet.main-violet .stat > label {
  color: #e2e8f0;
}

/* Header bottom */
[data-theme="dark"] .hdr-bottom {
  background: var(--card);
  border-color: var(--border);
}

/* Bottom nav tabs */
[data-theme="dark"] .tabs {
  background: #1c1c1e;
  border-top-color: #2c2c2e;
  box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .tab {
  color: #6c6c70;
}

[data-theme="dark"] .tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .tab.active {
  color: #818cf8;
}

/* Auto mode indicator */
.theme-toggle[data-theme-mode="auto"] {
  position: relative;
}

.theme-toggle[data-theme-mode="auto"]::after {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: var(--acc);
  border-radius: 50%;
  border: 1px solid var(--card);
}
```

**Важно**: Стили `.tabs` добавляются здесь ВМЕСТО удалённого `@media (prefers-color-scheme: dark)` блока.

---

## ❌ УБРАНО из плана (оверкилл)

1. ~~CSS Transitions на *~~ — может сломать анимации picker'ов
2. ~~Выносить toggle в глобальный header~~ — требует рефакторинг App
3. ~~ThemeProvider/Context~~ — избыточно для legacy app
4. ~~Редактирование `styles/_variables.css`~~ — не используется
5. ~~Динамическое обновление `<meta theme-color>`~~ — nice-to-have, не критично

---

## 🧪 Тестирование

1. **FOUC**: Обновить страницу в dark mode → НЕ должно быть белой вспышки
2. **Light mode**: Переключить → все карточки светлые
3. **Dark mode**: Переключить → все карточки тёмные, текст читаемый  
4. **Auto mode**: Иконка 💻, следует системе
5. **System change**: В auto режиме изменить системную тему → UI обновляется
6. **Persistence**: Перезагрузка → тема сохраняется
7. **Bottom nav**: Корректные цвета в dark mode
8. **Другие вкладки**: Рацион, Отчёты, Профиль — тема применяется

---

## 📱 Mobile проверка

- [ ] Toggle 40x40px (уже есть в CSS)
- [ ] Нет FOUC при загрузке
- [ ] Контраст текста достаточный
- [ ] Input fields читаемые

---

## ⚠️ Важно

- Inline-скрипт в `<head>` — синхронный, блокирующий (~1ms) — это ОК
- НЕ добавлять CSS transitions на всё
- НЕ трогать inline стили в JS
- НЕ редактировать файлы в `styles/` — только `apps/web/styles/main.css`
