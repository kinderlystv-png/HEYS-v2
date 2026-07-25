# 🔄 Исправление бесконечного цикла обновления PWA

**Дата**: 2025-12-08  
**Приоритет**: 🔥 Критический  
**Время**: ~30 мин (после аудита промпт упрощён)

---

## 🎯 Executive Summary (после глубокого аудита)

**Проблема**: Бесконечный цикл "Найдено обновление → Перезагрузка → Готово → (повторить)".

**Причина**: `forceUpdateAndReload()` делает `setTimeout(() => reload(), 800ms)` **до того как** новый SW активируется. Старый закэшированный JS загружается снова, видит новый version.json, и цикл повторяется.

**Решение (проще чем казалось!)**:
1. **Убрать** setTimeout reload из `forceUpdateAndReload()`
2. **Полагаться** на уже существующий глобальный `controllerchange` listener (строка 257)
3. **Добавить** fallback 5 сек с cache-bust URL (на случай если controllerchange не сработает)

**Важно**: Глобальный `controllerchange` listener **УЖЕ ЕСТЬ** — не нужно добавлять новый!

**Задачи (порядок выполнения)**:
| № | Задача | Время | Критичность |
|---|--------|-------|-------------|
| 0 | Cache-Control в конфиге хостинга | 2 мин | Страховка |
| 0.5 | **Фикс forceUpdateAndReload()** | 5 мин | **ГЛАВНЫЙ ФИКС** |
| 1 | Счётчик попыток + cooldown | 10 мин | Защита |
| 2 | UI для ручного обновления | 10 мин | UX |
| 3 | Сброс счётчика при успехе | 3 мин | Cleanup |
| 4 | Убрать ?_v= параметр | 2 мин | Косметика |

---

## Контекст проекта

| Параметр | Значение | Влияние на решение |
|----------|----------|-------------------|
| **Частота деплоев** | Часто (активная разработка) | Нужен агрессивный cache-busting |
| **iOS пользователи** | Много | iOS-specific логика критична |
| **Баннер обновления** | Нужен (UX спокойствие) | Сохраняем UI, но защищаем от цикла |
| **Analytics** | Нет | Не добавляем трекинг |

---

## Phase 0 — Подготовка (обязательно перед реализацией)

### Проверки до начала:

- [x] `git status` — ✅ Закоммичено (commit eaf586d)
- [x] Бэкап: ✅ `apps/web/heys_app_v12.js.backup` создан
- [ ] Открыть DevTools → Application → Service Workers — записать текущее состояние

### Анализ текущего кода:

- [x] **SW кэш-стратегия**: ✅ JS использует `staleWhileRevalidate()` (строка 138) — ЭТО КОРЕНЬ ПРОБЛЕМЫ!
- [x] **version.json**: ✅ SW уже имеет bypass (строка 107), НЕ кэшируется
- [x] **Существующие listeners**: ✅ НАЙДЕНЫ:
  - `updatefound` (строка 213) — показывает модалку, вызывает `forceUpdateAndReload()`
  - **`controllerchange` (строка 257)** — УЖЕ ЕСТЬ И РАБОТАЕТ! Делает reload если `heys_pending_update` установлен
  - **⚠️ ПРОБЛЕМА**: `forceUpdateAndReload()` делает reload через 800ms НЕЗАВИСИМО от `controllerchange`!
- [x] **forceUpdateAndReload**: ✅ Устанавливает флаг `heys_pending_update` (строка 279), отправляет `skipWaiting` (строка 286), но потом setTimeout reload (строка 290) — **ЭТО ЛИШНЕЕ!**

### 🚨 Критический инсайт после глубокого аудита:

**Глобальный `controllerchange` listener УЖЕ СУЩЕСТВУЕТ (строка 257-267)!**

Промпт изначально предлагал добавить ещё один listener — это **ошибка**! Создаст дублирование reload.

**Правильное решение ПРОЩЕ:**
1. ~~Добавить новый listener~~ → **Убрать setTimeout из forceUpdateAndReload()**
2. Глобальный `controllerchange` сам сделает reload когда SW активируется
3. Добавить fallback timeout внутри `forceUpdateAndReload()` на случай если `controllerchange` не сработает

### Сетевые/кэш проверки:

- [x] **HTTP кеш version.json**: SW уже не кэширует, добавим `Cache-Control` в конфиге хостинга для страховки
- [x] **SW scope**: ✅ Регистрируется как `/sw.js` (строка 191), scope = `/`
- [x] **Мульти-вкладки**: Пока игнорируем (редкий кейс)

### Альтернативные решения (если основное не сработает):

| Вариант | Сложность | Риск | Описание |
|---------|-----------|------|----------|
| **A. Убрать setTimeout reload, доверить controllerchange** | Низкая | Низкий | ✅ Основной план |
| **B. Network-First для JS** | Средняя | Средний | Изменить `staleWhileRevalidate` → `networkFirst` для `/heys_*.js` |
| **C. Hard reload с cache-bust** | Низкая | Низкий | `?_v=` параметр |

### Baseline тестирование:

- [ ] Записать текущее поведение при обновлении (скриншот/видео)
- [ ] Console должна быть чистой от ошибок

---

## Проблема

При выходе новой версии приложения, баннер обновления показывается **бесконечно**:
1. "Найдено обновление" → "Перезагрузка" → "Установка" → "Готово"
2. Страница перезагружается
3. Снова "Найдено обновление" → цикл повторяется

## Корневая причина (уточнённая после аудита кода)

**Stale-While-Revalidate стратегия SW для JS файлов:**

1. `version.json` уже НЕ кэшируется SW (есть bypass в `sw.js:107`)
2. Но `heys_app_v12.js` использует **Stale-While-Revalidate** (`sw.js:138`)
3. При reload SW возвращает **старый JS из кэша** (stale) мгновенно
4. Параллельно обновляет кэш с сервера (revalidate), но пользователь уже загрузил старый!
5. `version.json` свежий ≠ `APP_VERSION` старый → цикл

**Дополнительные факторы:**
- `forceUpdateAndReload()` уже отправляет `skipWaiting`, но SW не ждёт активации
- `PRECACHE_URLS` содержит все JS файлы — даже после очистки кэша SW снова закэширует их при install

## Ключевые файлы

| Файл | Что смотреть |
|------|--------------|
| `apps/web/heys_app_v12.js` | `checkServerVersion()`, `runVersionGuard()`, `isUpdateLocked()`, `forceUpdateAndReload()` |
| `apps/web/public/sw.js` | `staleWhileRevalidate()` (строка 215), message handler (строка 89), `PRECACHE_URLS` |
| Конфиг статического хостинга | Headers для статики — влияют на HTTP-кэш браузера |

---

## Задачи

### 0. Cache-Control для version.json (страховка)

**Файл**: конфиг статического хостинга

**Примечание**: SW уже не кэширует version.json, но добавим header для страховки от HTTP-кэша браузера.

**Добавить в секцию `headers`**:
```json
{
  "source": "/version.json",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "no-cache, no-store, must-revalidate"
    }
  ]
}
```

---

### 0.5. 🚨 ГЛАВНЫЙ ФИКС: Убрать setTimeout reload, доверить controllerchange

**Файл**: `apps/web/heys_app_v12.js`

**Проблема**: `forceUpdateAndReload()` делает:
1. `sessionStorage.setItem('heys_pending_update', 'true')` ✅
2. `skipWaiting` ✅  
3. `setTimeout(() => reload(), 800)` ❌ — ЭТО ЛИШНЕЕ!

Глобальный `controllerchange` listener (строка 257) **уже делает reload** когда SW активируется! Но setTimeout опережает его.

**Решение**: Убрать setTimeout reload, добавить fallback timeout с cache-bust.

**Было (строки 270-294)**:
```javascript
function forceUpdateAndReload(showModal = true) {
  console.log('[HEYS] 🔄 Forcing update and reload...');
  
  if (showModal) {
    showUpdateModal('reloading');
  }
  
  sessionStorage.setItem('heys_pending_update', 'true');
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('skipWaiting');
  }
  
  // ❌ ПРОБЛЕМА: reload ДО активации SW!
  setTimeout(() => {
    window.location.reload();
  }, 800);
}
```

**Стало**:
```javascript
function forceUpdateAndReload(showModal = true) {
  console.log('[HEYS] 🔄 Forcing update and reload...');
  
  if (showModal) {
    showUpdateModal('reloading');
  }
  
  sessionStorage.setItem('heys_pending_update', 'true');
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  
  // Отправляем skipWaiting — новый SW должен активироваться
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('skipWaiting');
  }
  
  // ✅ НЕ делаем reload здесь!
  // Глобальный controllerchange listener (строка 257) сделает reload
  // когда новый SW реально активируется.
  
  // Fallback: если controllerchange не сработал за 5 секунд
  setTimeout(() => {
    // Проверяем, не сделал ли уже controllerchange reload
    if (sessionStorage.getItem('heys_pending_update') === 'true') {
      console.warn('[HEYS] controllerchange timeout, forcing reload with cache-bust');
      sessionStorage.removeItem('heys_pending_update');
      // Hard reload с cache-bust параметром
      const url = new URL(window.location.href);
      url.searchParams.set('_v', Date.now().toString());
      window.location.href = url.toString();
    }
  }, 5000);
}
```

**Почему это работает**:
1. `skipWaiting` → SW активируется → `controllerchange` срабатывает → reload (правильный путь)
2. Если `controllerchange` не сработал за 5 сек → fallback с cache-bust (страховка)

**Почему это работает**: `controllerchange` срабатывает когда новый SW взял контроль. После этого reload получит **новые файлы из нового кэша**.

---

### 1. Добавить защиту от повторных попыток обновления

**Файл**: `apps/web/heys_app_v12.js`

**Логика**:
- При обнаружении обновления сохранять `heys_update_attempt` = { version, count, timestamp }
- Если та же версия и count >= 2 → показать ручной промпт вместо reload
- Добавить cooldown 60 секунд между попытками (защита от быстрого цикла)

**Ключевые изменения**:
```javascript
const UPDATE_ATTEMPT_KEY = 'heys_update_attempt';
const MAX_UPDATE_ATTEMPTS = 2;
const UPDATE_COOLDOWN_MS = 60000; // 1 минута

async function checkServerVersion(silent = true) {
  // ... fetch version.json ...
  
  if (data.version !== APP_VERSION) {
    const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
    const now = Date.now();
    
    // Cooldown — не пытаться чаще чем раз в минуту
    if (attempt.timestamp && (now - attempt.timestamp) < UPDATE_COOLDOWN_MS) {
      console.log('[HEYS] Update cooldown active, skipping');
      return false;
    }
    
    // Счётчик попыток для этой версии
    if (attempt.targetVersion === data.version) {
      attempt.count = (attempt.count || 0) + 1;
    } else {
      attempt.targetVersion = data.version;
      attempt.count = 1;
    }
    attempt.timestamp = now;
    localStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify(attempt));
    
    if (attempt.count > MAX_UPDATE_ATTEMPTS) {
      console.warn('[HEYS] Update stuck after', attempt.count, 'attempts');
      showManualRefreshPrompt(data.version);
      return true;
    }
    
    // Продолжаем обновление...
  }
}
```

### 2. Добавить UI для ручного обновления

**Файл**: `apps/web/heys_app_v12.js`

**Новая функция**:
```javascript
function showManualRefreshPrompt(targetVersion) {
  document.getElementById('heys-update-modal')?.remove();
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  const modal = document.createElement('div');
  modal.id = 'heys-update-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:999999;">
      <div style="background:#1a1a2e;border-radius:20px;padding:32px;text-align:center;max-width:320px;margin:20px;">
        <div style="font-size:48px;margin-bottom:16px;">🔄</div>
        <h2 style="color:white;margin:0 0 8px;">Требуется обновление</h2>
        <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0 0 20px;">
          ${isIOS 
            ? 'Закройте приложение и откройте заново для обновления до v' + targetVersion
            : 'Нажмите кнопку для обновления до v' + targetVersion}
        </p>
        ${isIOS ? '' : `
          <button onclick="localStorage.removeItem('${UPDATE_ATTEMPT_KEY}');location.reload();" style="
            background:linear-gradient(135deg,#667eea,#764ba2);
            color:white;border:none;padding:12px 24px;border-radius:12px;
            font-size:16px;cursor:pointer;width:100%;
          ">Обновить сейчас</button>
        `}
        <button onclick="this.closest('#heys-update-modal').remove();" style="
          background:transparent;color:rgba(255,255,255,0.5);border:none;
          padding:12px;font-size:14px;cursor:pointer;margin-top:12px;
        ">Позже</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
```

### 3. Сбросить счётчик попыток при успешном обновлении

**Файл**: `apps/web/heys_app_v12.js`

**В `runVersionGuard()`**:
```javascript
function runVersionGuard() {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
  
  // Если версия изменилась — обновление успешно!
  if (storedVersion && storedVersion !== APP_VERSION) {
    console.log(`[HEYS] ✅ Updated: ${storedVersion} → ${APP_VERSION}`);
    // Очищаем счётчик попыток
    localStorage.removeItem(UPDATE_ATTEMPT_KEY);
  }
  
  // Также очищаем если APP_VERSION совпал с target
  if (attempt.targetVersion === APP_VERSION) {
    console.log('[HEYS] ✅ Update target reached, clearing attempts');
    localStorage.removeItem(UPDATE_ATTEMPT_KEY);
  }
  
  // ... rest of the function ...
}
```

### 4. Убрать cache-bust параметр после загрузки

**Файл**: `apps/web/heys_app_v12.js`

**В начале `runVersionGuard()` или `bootstrapGlobals()`**:
```javascript
// Убираем ?_v= параметр из URL (косметика)
if (window.location.search.includes('_v=')) {
  const url = new URL(window.location.href);
  url.searchParams.delete('_v');
  window.history.replaceState({}, '', url.toString());
}
```

---

## Тестирование

### Сценарий 1: Нормальное обновление
1. Деплой новой версии
2. Открыть приложение
3. Ожидание: обновление за 1-2 попытки, без бесконечного цикла

### Сценарий 2: Застрявший кэш
1. В DevTools → Application → Cache Storage → Удалить всё
2. Но оставить старый SW активным
3. Перезагрузить
4. Ожидание: после 2 попыток — ручной промпт

### Сценарий 3: iOS симуляция
1. User-Agent switcher → iOS Safari
2. Проверить что показывается текст "Закройте приложение"

### Сценарий 4: Offline
1. Отключить сеть
2. Перезагрузить
3. Ожидание: нет модалки обновления, приложение работает

---

## Критерии готовности

- [x] `forceUpdateAndReload()` НЕ делает setTimeout reload — полагается на существующий глобальный `controllerchange` listener
- [x] Fallback 5 сек с cache-bust для редких случаев когда `controllerchange` не срабатывает
- [x] Конфиг хостинга содержит `Cache-Control: no-cache` для `/version.json`
- [ ] Нет бесконечного цикла обновлений (требует тест после деплоя)
- [x] После 2 неудачных попыток — ручной промпт
- [x] Успешное обновление сбрасывает счётчик
- [x] iOS показывает специальный текст
- [x] Cooldown 60 сек между попытками
- [x] `?_v=` параметр убирается после загрузки
- [x] `pnpm build` проходит
- [ ] Логи показывают `[HEYS] ♻️ Controller changed` при успешной активации (требует тест после деплоя)

### Риски и митигации

| Риск | Вероятность | Импакт | Митигация |
|------|-------------|--------|-----------|
| `controllerchange` не срабатывает | Низкая | Высокий | Fallback с timeout 3 сек + cache-bust параметр |
| CDN/браузер кешит `version.json` | Низкая (SW bypass есть) | Средний | `Cache-Control` в конфиге хостинга для страховки |
| Мульти-вкладки троггерят reload | Низкая | Низкий | Пока игнорируем — `controllerchange` срабатывает один раз |
| SW не очищает старые кеши | ~~Средняя~~ **Не проблема** | — | Новый SW при install создаёт новый кэш, старый удаляется при activate |

### WOW-рекомендации

- Прогресс-статус в баннере: «Готовим обновление…», «Кэш очищен», «Готово» — без лишних перезагрузок.
- Toast после обновления: «vX.Y загружена — что нового?» с ссылкой на changelog.
- Грейс-период offline: если сеть нет — не спамить баннером, предложить повтор позже.
- iOS: подсказка «Потяните вниз для обновления»/короткий step-by-step.

---

## Rollback план

Если что-то пошло не так:
```bash
cp apps/web/heys_app_v12.js.backup apps/web/heys_app_v12.js
git checkout apps/web/public/sw.js
pnpm build
```

Или через git:
```bash
git checkout HEAD -- apps/web/heys_app_v12.js apps/web/public/sw.js
```

---

## Связанные файлы

- `apps/web/heys_app_v12.js` — основная логика обновления
- `apps/web/public/sw.js` — Service Worker
- `apps/web/public/version.json` — файл версии (генерируется при билде)
- Конфиг статического хостинга — HTTP headers (Cache-Control для version.json)
