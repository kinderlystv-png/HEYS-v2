> **Status: CLOSED** (26.02.2026). Phase 0-1 реализованы (SW precache, offline,
> background sync infra, shortcuts). Phases 2-6 деприоритизированы.

# PWA Features — Расширение возможностей

**Дата**: 2025-11-30 **Приоритет**: Высокий **Время**: ~30 мин (осталось после
частичной реализации) **Статус**: CLOSED

---

## ✅ Уже реализовано

| Фича                       | Файл                                | Статус                                          |
| -------------------------- | ----------------------------------- | ----------------------------------------------- |
| **Install Prompt**         | `heys_app_v12.js:964-1007`          | ✅ Баннер, 7-дневный cooldown, standalone check |
| **Service Worker**         | `sw.js`                             | ✅ Cache-First, Background Sync инфраструктура  |
| **Streak расчёт**          | `heys_day_v12.js:2785`              | ✅ `HEYS.Day.getStreak()` готов                 |
| **Иконки 192/512**         | `public/`                           | ✅ Есть PNG и SVG                               |
| **Shortcut add-meal**      | `manifest.json` + `heys_app_v12.js` | ✅ **ГОТОВО 2025-12-01**                        |
| **HEYS.Day.addMeal()**     | `heys_day_v12.js`                   | ✅ Экспортирован глобально                      |
| **URL ?action= обработка** | `heys_app_v12.js`                   | ✅ С очисткой URL и skipTabSwitch               |

---

## ⚠️ Открытые вопросы (решить перед продолжением)

### Критичные

1. ~~**Push Notifications**~~ → **УБРАНО** — локальные бесполезны, backend нет
2. **Background Sync** — нужен?
   - ✅ Плюс: работает при закрытом приложении когда сеть появляется
   - ⚠️ Минус: дублирует Supabase sync (который работает при открытом)
   - **Рекомендация**: Оставить — это единственный способ синкать при закрытом
     приложении
3. **Какой streak на badge?** → Использовать `HEYS.Day.getStreak()` (дни в
   норме)

### Решённые

4. ~~**Shortcuts: `add-meal`**~~ → ✅ **РЕШЕНО**: Открывает модалку создания
   нового приёма
5. **Wake Lock** — когда активировать?
   - A) При открытии Training Picker modal ✅ рекомендую
   - B) Только при активном таймере (таймера нет)

---

## 🔴 Блокеры (Фаза 0 — обязательно ДО начала)

### Критичные

| #   | Проблема                                                       | Решение                               | Статус    |
| --- | -------------------------------------------------------------- | ------------------------------------- | --------- |
| 0.1 | ❌ **Нет иконок 96x96** для shortcuts                          | Используем 192x192 (работает!)        | ✅ Решено |
| 0.2 | ❌ **iOS Safari не поддерживает** Badging API, Background Sync | Добавить graceful degradation checks  | 🔲 TODO   |
| 0.3 | ❌ **`?action=` не очищается** из URL                          | `history.replaceState` после действия | ✅ Решено |

### Важные проверки

| #   | Что проверить                           | Где                       | Статус |
| --- | --------------------------------------- | ------------------------- | ------ |
| 0.4 | Регистрация SW в production             | `index.html`              | ✅     |
| 0.5 | `HEYS.Day.getStreak()` возвращает число | `heys_day_v12.js:2785`    | ✅     |
| 0.6 | Supabase sync queue                     | `heys_pending_sync_queue` | ✅     |
| 0.7 | `HEYS.Day.addMeal()` экспортирован      | `heys_day_v12.js:2795`    | ✅     |

### Потенциальные конфликты

| #   | Риск                             | Митигация                                              |
| --- | -------------------------------- | ------------------------------------------------------ |
| 0.7 | Wake Lock + Supabase fetch       | Wake Lock не блокирует fetch ✅                        |
| 0.8 | Badge + Notifications permission | Badging API НЕ требует permission ✅                   |
| 0.9 | SW update во время sync          | `skipWaiting` уже есть, добавить проверку pending sync |

---

## 💡 WOW-фичи (современные PWA возможности)

| Фича                        | Описание                                          | Поддержка   | Сложность | WOW    |
| --------------------------- | ------------------------------------------------- | ----------- | --------- | ------ |
| **Share Target**            | Делиться едой ИЗ других приложений в HEYS         | Chrome 71+  | M         | 🔥🔥🔥 |
| **Window Controls Overlay** | Контент под title bar (как Spotify)               | Chrome 105+ | S         | 🔥🔥   |
| **Vibration Patterns**      | Разная вибрация: streak up, level up, achievement | All mobile  | XS        | 🔥     |
| **Launch Handler**          | Контроль поведения при запуске                    | Chrome 102+ | S         | 🔥     |
| **File Handling**           | Открывать `.heys` файлы (экспорт/импорт)          | Chrome 102+ | M         | 🔥🔥   |

### Share Target (рекомендую добавить!)

```json
// В manifest.json
"share_target": {
  "action": "/?share=true",
  "method": "GET",
  "params": {
    "title": "name",
    "text": "description"
  }
}
```

**Use case**: Нашёл рецепт в браузере → Share → HEYS → автоматически ищет
продукты

---

## 🚫 Убрать из промпта (оверкилл / уже есть)

| Фаза                           | Причина убрать                          |
| ------------------------------ | --------------------------------------- |
| ~~Фаза 4: Push Notifications~~ | Локальные бесполезны, backend нет       |
| ~~Фаза 7: Periodic Sync~~      | Ограниченная поддержка, мало пользы     |
| ~~Фаза 8: Install Prompt~~     | **УЖЕ РЕАЛИЗОВАНО** в `heys_app_v12.js` |

---

## 🔧 Platform Compatibility Matrix

| API                | Chrome | Safari iOS | Firefox | Samsung |
| ------------------ | ------ | ---------- | ------- | ------- |
| Shortcuts          | ✅ 96+ | ❌         | ❌      | ✅      |
| Badging            | ✅ 81+ | ❌         | ❌      | ✅      |
| Persistent Storage | ✅     | ✅         | ✅      | ✅      |
| Background Sync    | ✅     | ❌         | ❌      | ✅      |
| Wake Lock          | ✅ 84+ | ❌         | ❌      | ✅      |
| Share Target       | ✅ 71+ | ❌         | ❌      | ✅      |

**→ Всё кроме Persistent Storage — только Android/Chrome. iOS fallback
обязателен!**

---

## 📋 Описание

Добавить недостающие PWA возможности для улучшения UX:

- **Shortcuts** (быстрые действия с иконки) — Android/Chrome
- **Badge API** (бейдж streak на иконке) — Android/Chrome
- **Persistent Storage** (защита данных от очистки) — все браузеры
- **Background Sync** (офлайн-синхронизация при закрытом приложении)
- **Screen Wake Lock** (экран не гаснет при тренировке)
- **Share Target** (WOW: делиться едой из других приложений)

**Убрано после аудита**:

- ~~Push Notifications~~ — требует backend
- ~~Periodic Sync~~ — ограниченная поддержка
- ~~Install Prompt~~ — уже реализовано

---

## 📁 Ключевые файлы

| Файл                            | Назначение                                           | Статус      |
| ------------------------------- | ---------------------------------------------------- | ----------- |
| `apps/web/public/manifest.json` | PWA манифест — shortcuts, share_target               | 📝 Изменить |
| `apps/web/public/sw.js`         | Service Worker — sync events                         | ✅ Готов    |
| `apps/web/index.html`           | Регистрация SW                                       | ✅ Готов    |
| `apps/web/heys_app_v12.js`      | Badge API, Wake Lock, Persistent Storage, URL params | 📝 Изменить |
| `apps/web/heys_day_v12.js`      | `HEYS.Day.getStreak()`                               | ✅ Готов    |

---

## ✅ Задачи

### Фаза 0: Подготовка и проверки (10 мин) ⚡ КРИТИЧНО

> Выполнить ДО начала реализации!

- [ ] **0.1** Создать иконки 96x96 для shortcuts:

  ```bash
  # Вариант A: Resize из 192x192
  sips -z 96 96 icon-192.png --out icon-96.png

  # Вариант B: Использовать emoji в manifest (без иконок)
  # Shortcuts будут работать, просто без кастомных иконок
  ```

- [ ] **0.2** Добавить Platform Detection utility в `heys_app_v12.js`:

  ```javascript
  const PWA = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches,
    supportsBadging: 'setAppBadge' in navigator,
    supportsWakeLock: 'wakeLock' in navigator,
    supportsBackgroundSync:
      'serviceWorker' in navigator &&
      'sync' in window.ServiceWorkerRegistration.prototype,
    supportsPersistentStorage: navigator.storage && navigator.storage.persist,
  };
  HEYS.pwa = PWA;
  ```

- [ ] **0.3** Проверить что `HEYS.Day.getStreak()` доступен глобально:

  ```javascript
  // В консоли браузера:
  HEYS.Day.getStreak(); // Должно вернуть число
  ```

- [ ] **0.4** Решить: `add-meal` shortcut открывает модалку добавления к
      последнему приёму? (Да/Нет)

- [ ] **0.5** Решить: Wake Lock активируется при открытии Training Picker?
      (Да/Нет)

---

### Фаза 1: Manifest Shortcuts (8 мин) ✅ ГОТОВО

- [x] **1.1** Добавить `shortcuts` в `manifest.json` — shortcut `add-meal`
- [x] **1.2** Обработать `?action=add-meal` в `heys_app_v12.js`
- [x] **1.3** Экспортировать `HEYS.Day.addMeal()` для внешних вызовов
- [x] **1.4** Добавить `skipTabSwitchRef` чтобы не переключать вкладку после
      action

**Результат**: Долгое нажатие на иконку PWA → "+ Приём" → открывается модалка
создания приёма

---

### Фаза 2: Badge API (10 мин)

- [ ] **2.1** Создать `HEYS.badge` модуль в `heys_app_v12.js`:

  ```javascript
  HEYS.badge = {
    update(count) {
      if (!('setAppBadge' in navigator)) return;

      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    },

    updateFromStreak() {
      const streak = HEYS.Day?.getStreak?.() || 0;
      this.update(streak);
    },
  };
  ```

- [ ] **2.2** Вызывать `HEYS.badge.updateFromStreak()`:
  - При загрузке приложения (после инициализации DayTab)
  - При событии `heysDataSaved` (когда streak мог измениться)

- [ ] **2.3** Добавить в `GamificationBar` компонент вызов badge update при
      изменении streak

---

### Фаза 3: Persistent Storage (5 мин)

- [ ] **3.1** Добавить запрос при первом запуске в `heys_app_v12.js`:

  ```javascript
  useEffect(() => {
    async function requestPersistentStorage() {
      if (!navigator.storage?.persist) return;

      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) return; // Уже granted

      const granted = await navigator.storage.persist();
      console.log('[HEYS] Persistent storage:', granted ? 'granted' : 'denied');

      // Опционально: показать toast если denied
      if (!granted && HEYS.pwa?.isStandalone) {
        // Показать предупреждение только в PWA режиме
      }
    }
    requestPersistentStorage();
  }, []);
  ```

- [ ] **3.2** Добавить проверку storage quota:
  ```javascript
  async function checkStorageQuota() {
    if (!navigator.storage?.estimate) return;
    const { quota, usage } = await navigator.storage.estimate();
    const percentUsed = ((usage / quota) * 100).toFixed(2);
    console.log(`[HEYS] Storage: ${percentUsed}% used`);
  }
  ```

---

### Фаза 4: Background Sync (10 мин)

> Дополняет Supabase sync — работает при закрытом приложении

- [ ] **4.1** Модифицировать `heys_storage_supabase_v1.js` — при офлайн
      сохранении регистрировать sync:

  ```javascript
  // После добавления в pending queue
  if (
    'serviceWorker' in navigator &&
    'sync' in window.ServiceWorkerRegistration?.prototype
  ) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.sync.register('heys-sync').catch(() => {});
    });
  }
  ```

- [ ] **4.2** SW уже обрабатывает `sync` event — добавить `postMessage` для
      триггера Supabase sync:

  ```javascript
  // В sw.js processSyncQueue()
  for (const client of clients) {
    client.postMessage({ type: 'TRIGGER_HEYS_SYNC' });
  }
  ```

- [ ] **4.3** В `heys_app_v12.js` слушать сообщение:
  ```javascript
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_HEYS_SYNC') {
      HEYS.cloud?.retrySync?.();
    }
  });
  ```

---

### Фаза 5: Screen Wake Lock (10 мин)

- [ ] **5.1** Создать `HEYS.wakeLock` модуль:

  ```javascript
  HEYS.wakeLock = {
    lock: null,
    timeout: null,

    async acquire() {
      if (!('wakeLock' in navigator)) return false;

      try {
        this.lock = await navigator.wakeLock.request('screen');
        console.log('[HEYS] Wake Lock acquired');

        // Авто-освобождение через 30 мин
        this.timeout = setTimeout(() => this.release(), 30 * 60 * 1000);

        // Переполучение при возврате на вкладку
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        return true;
      } catch (err) {
        console.warn('[HEYS] Wake Lock failed:', err);
        return false;
      }
    },

    release() {
      if (this.lock) {
        this.lock.release();
        this.lock = null;
      }
      clearTimeout(this.timeout);
      document.removeEventListener(
        'visibilitychange',
        this._onVisibilityChange,
      );
      console.log('[HEYS] Wake Lock released');
    },

    _onVisibilityChange: async function () {
      if (
        document.visibilityState === 'visible' &&
        HEYS.wakeLock.lock === null
      ) {
        // Переполучаем lock при возврате
        await HEYS.wakeLock.acquire();
      }
    },
  };
  ```

- [ ] **5.2** Вызывать в `openTrainingPicker()` в `heys_day_v12.js`:

  ```javascript
  function openTrainingPicker(trainingIndex) {
    // ... existing code ...
    HEYS.wakeLock?.acquire();
    setShowTrainingPicker(true);
  }
  ```

- [ ] **5.3** Освобождать в `confirmTrainingPicker()` и
      `cancelTrainingPicker()`:

  ```javascript
  function confirmTrainingPicker() {
    // ... existing code ...
    HEYS.wakeLock?.release();
  }
  ```

- [ ] **5.4** Добавить визуальный индикатор в Training Picker modal:
  ```jsx
  // В заголовке модалки
  {
    HEYS.wakeLock?.lock && <span title="Экран не погаснет">🔒</span>;
  }
  ```

---

### Фаза 6: Share Target (WOW!) (15 мин) — Опционально

> Пользователь нашёл рецепт → Share → HEYS → поиск продуктов

- [ ] **6.1** Добавить в `manifest.json`:

  ```json
  "share_target": {
    "action": "/?share=true",
    "method": "GET",
    "params": {
      "title": "name",
      "text": "description"
    }
  }
  ```

- [ ] **6.2** Обработать `?share=true` в `heys_app_v12.js`:

  ```javascript
  if (params.get('share')) {
    const name = params.get('name') || '';
    const description = params.get('description') || '';
    const text = name + ' ' + description;

    // Открыть поиск продуктов с этим текстом
    setTab('ration');
    // TODO: передать text в Ration для автопоиска
  }
  ```

- [ ] **6.3** Добавить автопоиск в `Ration` компонент при получении share text

---

## 🧪 Тестирование

### Desktop (Chrome DevTools)

- [ ] Application → Manifest → проверить shortcuts, share_target
- [ ] Application → Service Workers → проверить sync events
- [ ] Console → `HEYS.Day.getStreak()` возвращает число

### Android (реальное устройство или эмулятор)

- [ ] Установить PWA → long press на иконке → shortcuts видны
- [ ] Проверить badge появляется при streak > 0
- [ ] Share из Chrome → HEYS появляется в списке
- [ ] Открыть тренировку → экран не гаснет 2 минуты

### iOS Safari (ограниченная функциональность)

- [ ] Приложение работает без ошибок
- [ ] Graceful degradation — нет JS ошибок от неподдерживаемых API

### Offline сценарии

- [ ] Включить Airplane mode → добавить еду → включить сеть → синхронизация
      произошла
- [ ] Закрыть приложение в offline → включить сеть → открыть → данные
      синхронизированы

---

## ⚡ Quick Wins (если останется время)

| Фича                        | Время | Код                                            |
| --------------------------- | ----- | ---------------------------------------------- |
| Vibration при streak up     | 2 мин | `navigator.vibrate([100, 50, 100])`            |
| Vibration при level up      | 2 мин | `navigator.vibrate([200, 100, 200, 100, 300])` |
| Display override в manifest | 1 мин | `"display_override": ["standalone"]`           |

---

## 📝 Примечания

- **iOS Safari**: Badging, Background Sync, Wake Lock, Share Target — НЕ
  поддерживаются
- **Badge API**: Работает только в установленном PWA (не в браузере)
- **Wake Lock**: Автоматически отпускается при сворачивании — нужен
  `visibilitychange`
- **Install Prompt**: ✅ Уже реализован в `heys_app_v12.js`

---

## 🔗 Документация

- [Shortcuts](https://developer.mozilla.org/en-US/docs/Web/Manifest/shortcuts)
- [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)
- [Persistent Storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- [Web Share Target API](https://web.dev/web-share-target/)
