# HEYS Curator vs Client (PIN) — Sync & Functional Differences

> **Version:** v2.0.0 | **Updated:** 27.02.2026
>
> Единый справочник различий между режимами **Curator** и **Client (PIN auth)**.

---

## 1. Быстрый summary

| Aspect                      | Curator                                           | Client (PIN auth)                         |
| --------------------------- | ------------------------------------------------- | ----------------------------------------- |
| Auth credential             | JWT (`heys_supabase_auth_token`)                  | `session_token` (`heys_session_token`)    |
| HTML gate форма             | Email + Password (`hlg-screen-curator`)           | Phone + 4-digit PIN (`hlg-screen-client`) |
| Primary sync path           | `bootstrapClientSync`                             | `syncClientViaRPC`                        |
| Phase A/B                   | ✅ Есть (2 фазы)                                  | ❌ Нет (single full sync)                 |
| `heysSyncCompleted` payload | `phaseA: true` + `phase: 'full', viaYandex: true` | `phase: 'full'`                           |
| `switchClient`              | ✅ Да (multi-client)                              | ⚠️ Логика ограничена own profile          |
| Gamification cloud sync     | Через storage sync layer                          | Прямые `*_by_session` RPC                 |
| Client management RPC       | ✅ `*_by_session` curator endpoints               | ❌ Недоступно                             |
| Token refresh               | `YandexAPI.verifyCuratorToken()`                  | Пропускается (`_rpcOnlyMode` → valid)     |
| Anti-timing delay           | ❌ Нет                                            | ✅ 350-600ms random delay при login       |
| Consent gate                | ❌ Не показывается                                | ✅ Показывается (`needsConsent`)          |
| Desktop gate                | ❌ Не показывается                                | ✅ Показывается (`!desktopAllowed`)       |

---

## 2. Ключевой нюанс про `_rpcOnlyMode`

После миграции на Yandex API флаг `_rpcOnlyMode` используется для обоих режимов.

- Исторически: curator мог работать с `_rpcOnlyMode=false`
- Актуально: `_rpcOnlyMode=true` для curator и для PIN auth
- Реальный роутинг делается по
  `isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId`

```javascript
const isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId;
if (isPinAuth) {
  return syncClientViaRPC(clientId);
}
return bootstrapClientSync(clientId, options);
```

**Итог:** различие потоков определяется не самим `_rpcOnlyMode`, а наличием
`_pinAuthClientId` + типом сессии.

---

## 3. HTML Login Gate — двухуровневая система входа

> **Файлы:** `apps/web/index.html`, `apps/web/heys_app_gate_flow_v1.js`,
> `apps/web/heys_login_screen_v1.js`

HTML login gate работает **ДО загрузки React** — это статичный HTML с формами
входа. После загрузки React выполняется handover.

### 3.1 Первоначальная детекция сессии (index.html)

При загрузке страницы мгновенно проверяются ключи localStorage:

```javascript
hasPinAuth = !!localStorage.getItem('heys_pin_auth_client');
hasCuratorSession = !!localStorage.getItem('heys_curator_session');
hasSupabaseToken = /* проверка heys_supabase_auth_token + expires_at */;
window.__heysHasSession = hasPinAuth || hasCuratorSession || hasSupabaseToken;
```

**Если сессия есть (returning user):**

- HTML gate скрывается (`display: none`)
- Показывается skeleton из `<div id="root">` (PERF v7.1)
- Флаг `window.__heysReturningUser = true`

**Если сессии нет (new/logged out user):**

- HTML gate виден — показывается форма входа

### 3.2 Curator login через HTML gate

1. Показывается форма `hlg-screen-curator` с email + password
2. `hlgCuratorLogin()` → `fetch(API + '/auth/login')`
3. При успехе:
   - Удаляет `heys_pin_auth_client` и `heys_session_token`
   - Сохраняет `heys_supabase_auth_token` (JSON: `access_token`, `expires_at`,
     `user`)
   - Сохраняет `heys_curator_session` (raw access_token)
   - Ставит
     `window.__heysPreAuth = { mode: 'curator', accessToken, user, timestamp }`
   - `hlgHideOverlay()` → fadeout анимация → диспатчит `heys-auth-ready`

### 3.3 PIN login через HTML gate

1. Показывается форма `hlg-screen-client` с phone (маска `+7 (XXX) XXX-XX-XX`) +
   4 PIN-поля
2. **Anti-timing delay:** 350-600ms random delay перед fetch (защита от timing
   attack)
3. `hlgClientLogin()` → `fetch(API + '/rpc?fn=verify_client_pin_v3')` с
   `{ p_phone, p_pin }`
4. Автовход: PIN отправляется автоматически после ввода 4-й цифры
5. При успехе:
   - Удаляет `heys_supabase_auth_token`
   - Сохраняет `heys_session_token`, `heys_pin_auth_client`,
     `heys_pending_client_name`
   - Сохраняет `heys_client_phone` (для ПЭП/SMS-верификации согласий)
   - `window.__heysPreAuth = { mode: 'client', clientId, sessionToken, timestamp }`
   - `hlgHideOverlay()` → `heys-auth-ready`

### 3.4 HTML → React Handover (v9.11 fix)

> **Файл:** `heys_app_gate_flow_v1.js` ~L768

При монтировании React `LoginScreen`:

1. **Сохраняет email куратора** из HTML input `hlg-curator-email` →
   `window.__hlgCuratorEmail`
2. **Наследует выбранный экран:** `window.__hlgCurrentScreen` → `initialMode`
   (`'curator'` или `'client'`)
3. **Удаляет HTML gate** из DOM →
   `'[HEYS.gate] ✅ HTML login gate removed — React LoginScreen takes over'`

### 3.5 `__heysPreAuth` guard

Если HTML gate уже выполнил вход (фреш < 30s), React `LoginScreen` возвращает
`null` — предотвращает flash повторной формы. Это критично для устранения бага
сброса формы куратора на PIN-ввод.

### 3.6 Event chain

```
HTML gate submit
  → hlgHideOverlay() (fadeout)
  → dispatch 'heys-auth-ready' { mode, accessToken/sessionToken }
  → heys_storage_supabase_v1.js: restoreSessionFromStorage()
    → устанавливает user, status = ONLINE, _rpcOnlyMode = true
    → dispatch 'heys-session-restored'
  → heys_app_auth_init_v1.js: staticLoginHandler
    → setCloudUser / setPinAuthClient
    → initLocalData()
    → syncClient()
    → __heysDismissGate()
```

---

## 4. Auth и boot restore (returning user)

### 4.1 Curator restore

1. `index.html`: `heys_supabase_auth_token` детектируется →
   `__heysHasSession = true` → gate hidden, skeleton виден
2. `heys_storage_supabase_v1.js`: `restoreSessionFromStorage()` — парсит JWT,
   проверяет `expires_at` (с 1-час буфером). Если валиден: `user = storedUser`,
   `_rpcOnlyMode = true`, через `setTimeout(100)` → `cloud.syncClient(clientId)`
3. `heys_app_auth_init_v1.js`: `storedUser && !hasPinSession` → `setCloudUser`,
   `initLocalData`, `YandexAPI.getClients()` для валидации →
   `__heysDismissGate()`
4. **Token refresh:** `ensureValidToken()` → проверяет через
   `YandexAPI.verifyCuratorToken()`

### 4.2 PIN restore

1. `index.html`: `heys_pin_auth_client` детектируется →
   `__heysHasSession = true` → gate hidden, skeleton виден
2. `heys_storage_supabase_v1.js`: `_pinAuthClientId = pinAuthClient`,
   `_rpcOnlyMode = true` → `cloud.syncClient(pinAuthClient)` (async)
3. `heys_app_auth_init_v1.js`: `hasPinSession` → `setPinAuthClient`,
   `initLocalData`, `syncClient` → `__heysDismissGate()`
4. **Token refresh:** `ensureValidToken()` пропускается (`_rpcOnlyMode` →
   `return { valid: true }`)

### 4.3 Приоритет: PIN > Curator (v52 FIX)

В `runAuthInit`: если есть `heys_pin_auth_client`, curator restore
**пропускается**, даже если `heys_supabase_auth_token` тоже существует.

> ⚠️ Обратная ситуация в storage layer: если
> `pinAuthClient && hasCuratorSession`, PIN auth пропускается и
> `heys_pin_auth_client` удаляется. Эти два поведения разнонаправленны
> (AuthInit: PIN > curator, storage: curator > PIN). Координация через
> `_signInInProgress` flag.

### 4.4 Dual restore coordination

`heys_storage_supabase_v1.js` и `heys_app_auth_init_v1.js` **оба** выполняют
restore: storage при `init()` (sync scope), AuthInit в `useEffect` (React
scope). Координация через `_signInInProgress` flag — предотвращает race
condition.

### 4.5 Failsafe timer

Если sync не завершился за **45s** (production) / **30s** (localhost) —
`initialSyncCompleted = true` (разрешает сохранения в offline). Отменяется при
`signIn()`.

---

## 5. Skeleton/Loading различия

| Аспект                        | Curator                                         | PIN                                    |
| ----------------------------- | ----------------------------------------------- | -------------------------------------- |
| HTML skeleton                 | Одинаковый `div.heys-skeleton` (~0.2s)          | Одинаковый `div.heys-skeleton` (~0.2s) |
| Gate скрытие (returning user) | `__heysHasSession` → `display: none`            | `__heysHasSession` → `display: none`   |
| Gate skeleton delay           | `GATE_SKELETON_DELAY_MS = 280ms`                | `GATE_SKELETON_DELAY_MS = 280ms`       |
| Tab skeleton delay            | `TAB_SKELETON_DELAY_MS = 240ms`                 | `TAB_SKELETON_DELAY_MS = 240ms`        |
| После auth                    | Показывает client picker overlay                | Прямой переход к app (single client)   |
| AppLoader (initializing)      | Если `isInitializing && !clientId`, delay 280ms | Аналогично                             |

**Вывод:** Skeleton поведение визуально **идентично**. Различие — в gate UI
(client picker для curator vs прямой переход для PIN).

---

## 6. Download sync flow (главные различия)

### 6.1 Curator: `bootstrapClientSync` (двухфазный)

### Phase A (blocking)

- Загружает 5 критичных ключей
- Диспатчит `heysSyncCompleted { clientId, phaseA: true }`
- Позволяет ранний рендер DayTab

### Phase B (full)

- Загружает все CLIENT*SPECIFIC_KEYS (включая исторические `heys_dayv2*\*`)
- Диспатчит `heysSyncCompleted { clientId, phase: 'full', viaYandex: true }`
- Используется для аналитики, CRS и всех full-data зависимых подсистем

Дополнительно в curator-пути:

- `ensureClient()` проверка контекста клиента
- meta-check/оптимизации и pre-load shared products
- cloud cleanup ветки (в т.ч. продукты)

### 6.2 Client (PIN): `syncClientViaRPC` (single full)

- Без Phase A/Phase B разделения
- Full sync одним пайплайном
- Диспатчит `heysSyncCompleted { clientId, phase: 'full' }`
- Использует session-token RPC path и delta по `last_sync_ts`

---

## 7. Upload sync flow

В `batchSaveKV` используется dual-path:

1. Если есть `session_token` → `batch_upsert_client_kv_by_session`
2. Иначе (curator session) → REST/JWT ветка

Это важно для диагностики: одинаковый UI-слой, но разный транспорт в cloud.

---

## 8. `heysSyncCompleted` и downstream эффекты

| Mode           | Dispatch pattern                                       | Что учитывать слушателям        |
| -------------- | ------------------------------------------------------ | ------------------------------- |
| Curator phaseA | `{ clientId, phaseA: true }`                           | Фильтровать, если нужна история |
| Curator full   | `{ clientId, loaded, viaYandex: true, phase: 'full' }` | Сигнал что full-data доступен   |
| PIN full       | `{ clientId, phase: 'full' }`                          | Нет `viaYandex`, нет `loaded`   |

Рекомендация для full-data фич:

```javascript
window.addEventListener('heysSyncCompleted', (e) => {
  const d = e?.detail;
  if (!d?.clientId) return;
  if (d.phaseA) return; // reject partial sync
  // full-data safe path
});
```

---

## 9. visibilitychange auto-sync

При возвращении на вкладку (debounce 30s):

| Mode    | Метод                             | Нюанс                                         |
| ------- | --------------------------------- | --------------------------------------------- |
| Curator | `bootstrapClientSync` напрямую    | ⚠️ Вызывается напрямую, не через `syncClient` |
| PIN     | `syncClient` → `syncClientViaRPC` | Корректный путь через роутер                  |

> ⚠️ `syncOnFocus` для curator вызывает `bootstrapClientSync` напрямую — это
> потенциальный edge case при PIN-сессии с `user !== null`.

---

## 10. Gamification: отдельный branching

### Curator

- `loadFromCloud`/`syncToCloud` используют storage sync layer
- Прямой gamification RPC path может быть пропущен
  (`curator_mode:skip_direct_rpc`)

### Client (PIN)

- Прямые `*_by_session` RPC для `heys_game` и audit событий
- Fallback логика отличается от curator flow

---

## 11. Switch client и scope

### Curator

- `switchClient()` переводит контекст между клиентами
- Триггерит sync новой client-сферы
- Использует curator management APIs
- **При смене клиента:** явно удаляет `heys_pin_auth_client` и сбрасывает
  `_pinAuthClientId = null`

### PIN

- `switchClient()` технически обрабатывает PIN-путь (меняет `_pinAuthClientId`,
  вызывает `syncClientViaRPC`)
- Multi-client **UI** отсутствует — client picker не показывается (определяется
  через `cloud.isPinAuthClient()`)
- Контекст клиента сохраняется в `heys_pin_auth_client` localStorage
- **При PIN-switch:** `heys_pin_auth_client` обновляется в localStorage

---

## 12. UI Gates (только для PIN-клиентов)

### 12.1 Consent gate

Показывается **ТОЛЬКО** для PIN-клиентов:
`!cloudUser && clientId && needsConsent`. Куратор НЕ проходит consent flow.
Кнопка отмены → полный logout PIN-сессии.

### 12.2 Desktop gate

Показывается для не-кураторов: `!isCurator && !desktopAllowed`. Logout в desktop
gate очищает `heys_pin_auth_client`, flush memory, reload.

---

## 13. Функциональные различия (не только sync)

| Feature                     | Curator                                      | Client (PIN)                                                      |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Client list / selection     | ✅                                           | ❌                                                                |
| Curator management RPCs     | ✅                                           | ❌                                                                |
| Consent gate                | ❌                                           | ✅ (обязательный)                                                 |
| Desktop gate                | ❌                                           | ✅                                                                |
| Onboarding tour (auto)      | Обычно нет                                   | Обычно да                                                         |
| Display name source         | Из списка клиентов                           | Из профиля / `heys_pending_client_name`                           |
| Token refresh               | `verifyCuratorToken()`                       | Пропускается (always valid)                                       |
| Anti-timing delay при входе | ❌                                           | ✅ 350-600ms                                                      |
| `heys_client_phone`         | ❌                                           | ✅ (сохраняется для ПЭП)                                          |
| Режим определяется через    | `user !== null` + `heys_supabase_auth_token` | `isPinAuthClient()` = `_pinAuthClientId != null && user === null` |

> **Два чека для определения режима:**
>
> - Sync routing: `isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId`
> - UI check: `cloud.isPinAuthClient()` =
>   `_pinAuthClientId != null && user === null`
>
> Они согласованы, но different по семантике: routing проверяет конкретный
> clientId, UI проверяет наличие PIN-сессии как таковой.

---

## 14. localStorage — полная карта ключей по режимам

| Ключ                       | Curator      | PIN          | Описание                                   |
| -------------------------- | ------------ | ------------ | ------------------------------------------ |
| `heys_supabase_auth_token` | ✅ Primary   | ❌ Удаляется | JWT (JSON: access_token, expires_at, user) |
| `heys_curator_session`     | ✅           | ❌ Удаляется | Raw access_token для admin API             |
| `heys_pin_auth_client`     | ❌ Удаляется | ✅           | client_id (restore flag)                   |
| `heys_session_token`       | ❌ Удаляется | ✅           | Session token для `*_by_session` RPC       |
| `heys_client_current`      | ✅           | ✅           | Текущий выбранный clientId                 |
| `heys_last_client_id`      | ✅           | ✅           | Последний clientId (подсветка в списке)    |
| `heys_pending_client_name` | ❌           | ✅           | Имя клиента после PIN-входа                |
| `heys_client_phone`        | ❌           | ✅           | Телефон для ПЭП/SMS-верификации            |
| `heys_connection_mode`     | ✅           | ❌           | Режим соединения (direct/gateway)          |
| `heys_remember_email`      | ✅           | ❌           | Запомненный email куратора                 |
| `heys_auth_rate_limit_v1`  | ✅           | ✅           | Rate limiting state                        |

---

## 15. Практические правила для агентов

1. Всегда использовать `await HEYS.cloud.syncClient(clientId)` как входную точку
2. Не предполагать, что `_rpcOnlyMode=false` означает curator
3. Для full-data логики фильтровать `phaseA` (curator flow)
4. Для security: использовать `*_by_session`, не передавать `client_id` напрямую
5. При анализе багов всегда фиксировать mode: curator vs PIN auth
6. Помнить о PIN > curator приоритете при restore (v52 FIX)
7. HTML gate и React `LoginScreen` — две разные системы, координируемые через
   `__heysPreAuth`
8. `ensureValidToken()` пропускается для PIN auth — не отлаживать token refresh
   для PIN-клиентов

---

## 16. Where to read deeper

- `docs/SYNC_REFERENCE.md` — ядро sync pipeline и события
- `docs/dev/STORAGE_PATTERNS.md` — storage/use patterns
- `docs/API_DOCUMENTATION.md` — auth/RPC surface
- `docs/SECURITY_RUNBOOK.md` — security constraints

---

## Change Log

- **v2.0.0 (27.02.2026):** Полная переработка документа:
  - Добавлен раздел 3: HTML Login Gate (двухуровневая система, curator/PIN
    формы, event chain, v9.11 handover fix, `__heysPreAuth` guard)
  - Добавлен раздел 4: Полный boot restore flow (curator/PIN, приоритет PIN >
    curator v52 FIX, dual restore coordination, failsafe timer)
  - Добавлен раздел 5: Skeleton/Loading различия
  - Добавлен раздел 9: visibilitychange auto-sync
  - Добавлен раздел 12: UI Gates (consent gate, desktop gate — только PIN)
  - Добавлен раздел 14: Полная карта localStorage ключей по режимам
  - Расширена таблица функциональных различий (token refresh, anti-timing delay,
    consent/desktop gates, `heys_client_phone`)
  - Описан `switchClient` cleanup (`heys_pin_auth_client` удаление при curator
    switch)
- **v1.0.2 (27.02.2026):** UI Handover описание (skeleton + auth handover)
- **v1.0.1 (26.02.2026):** Исправлены 4 неточности: auth credential key,
  `isPinAuthClient()` vs routing distinction, payload, switchClient PIN-path
- **v1.0.0 (26.02.2026):** Первый единый документ по различиям Curator vs Client
  (PIN)
