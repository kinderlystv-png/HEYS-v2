# HEYS Curator vs Client (PIN) — Sync & Functional Differences

> **Version:** v1.0.2 | **Updated:** 27.02.2026
>
> Единый справочник различий между режимами **Curator** и **Client (PIN auth)**.

---

## 1. Быстрый summary

| Aspect | Curator | Client (PIN auth) |
| --- | --- | --- |
| Auth credential | JWT (`heys_supabase_auth_token`) | `session_token` (`heys_session_token`) |
| Primary sync path | `bootstrapClientSync` | `syncClientViaRPC` |
| Phase A/B | ✅ Есть (2 фазы) | ❌ Нет (single full sync) |
| `heysSyncCompleted` payload | `phaseA: true` + `phase: 'full', viaYandex: true` | `phase: 'full'` |
| `switchClient` | ✅ Да (multi-client) | ⚠️ Логика ограничена own profile |
| Gamification cloud sync | Через storage sync layer | Прямые `*_by_session` RPC |
| Client management RPC | ✅ `*_by_session` curator endpoints | ❌ Недоступно |

---

## 2. Ключевой нюанс про `_rpcOnlyMode`

После миграции на Yandex API флаг `_rpcOnlyMode` используется для обоих режимов.

- Исторически: curator мог работать с `_rpcOnlyMode=false`
- Актуально: `_rpcOnlyMode=true` для curator и для PIN auth
- Реальный роутинг делается по `isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId`

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

## 3. Auth и boot restore

### Curator

1. Email/password auth → JWT
2. Основная сессия хранится в `heys_supabase_auth_token` (legacy name)
3. `heys_curator_session` — вторичный ключ (access_token отдельно, для TrialQueue/admin API)
4. На restore проверяется валидность через cloud/API
5. Доступно управление списком клиентов
6. **UI Handover:** При загрузке HTML login gate корректно удаляется при гидратации React `LoginScreen`, предотвращая сброс формы на ввод PIN-кода. Сессия и `clientId` восстанавливаются бесшовно.

### Client (PIN)

1. Phone + PIN → `session_token`
2. Сессия хранится в `heys_session_token`
3. Вход привязан к одному клиентскому контексту
4. Все данные через `*_by_session` RPC (без передачи `client_id`)
5. **UI Handover:** HTML login gate отображает форму ввода PIN-кода.

---

## 4. Download sync flow (главные различия)

### 4.1 Curator: `bootstrapClientSync` (двухфазный)

### Phase A (blocking)

- Загружает 5 критичных ключей
- Диспатчит `heysSyncCompleted { clientId, phaseA: true }`
- Позволяет ранний рендер DayTab

### Phase B (full)

- Загружает все CLIENT_SPECIFIC_KEYS (включая исторические `heys_dayv2_*`)
- Диспатчит `heysSyncCompleted { clientId, phase: 'full', viaYandex: true }`
- Используется для аналитики, CRS и всех full-data зависимых подсистем

Дополнительно в curator-пути:

- `ensureClient()` проверка контекста клиента
- meta-check/оптимизации и pre-load shared products
- cloud cleanup ветки (в т.ч. продукты)

### 4.2 Client (PIN): `syncClientViaRPC` (single full)

- Без Phase A/Phase B разделения
- Full sync одним пайплайном
- Диспатчит `heysSyncCompleted { clientId, phase: 'full' }`
- Использует session-token RPC path и delta по `last_sync_ts`

---

## 5. Upload sync flow

В `batchSaveKV` используется dual-path:

1. Если есть `session_token` → `batch_upsert_client_kv_by_session`
2. Иначе (curator session) → REST/JWT ветка

Это важно для диагностики: одинаковый UI-слой, но разный транспорт в cloud.

---

## 6. `heysSyncCompleted` и downstream эффекты

| Mode | Dispatch pattern | Что учитывать слушателям |
| --- | --- | --- |
| Curator phaseA | `{ clientId, phaseA: true }` | Фильтровать, если нужна история |
| Curator full | `{ clientId, loaded, viaYandex: true, phase: 'full' }` | Сигнал что full-data доступен |
| PIN full | `{ clientId, phase: 'full' }` | Нет `viaYandex`, нет `loaded` |

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

## 7. Gamification: отдельный branching

### Curator

- `loadFromCloud`/`syncToCloud` используют storage sync layer
- Прямой gamification RPC path может быть пропущен (`curator_mode:skip_direct_rpc`)

### Client (PIN)

- Прямые `*_by_session` RPC для `heys_game` и audit событий
- Fallback логика отличается от curator flow

---

## 8. Switch client и scope

### Curator

- `switchClient()` переводит контекст между клиентами
- Триггерит sync новой client-сферы
- Использует curator management APIs

### PIN

- `switchClient()` технически обрабатывает PIN-путь (меняет `_pinAuthClientId`, вызывает `syncClientViaRPC`)
- Multi-client **UI** отсутствует — client picker не показывается (определяется через `cloud.isPinAuthClient()`).
- Контекст клиента сохраняется в `heys_pin_auth_client` localStorage

---

## 9. Функциональные различия (не только sync)

| Feature | Curator | Client (PIN) |
| --- | --- | --- |
| Client list / selection | ✅ | ❌ |
| Curator management RPCs | ✅ | ❌ |
| Onboarding tour (auto) | Обычно нет | Обычно да |
| Display name source | Из списка клиентов | Из профиля/локального pending |
| Режим определяется через | `user !== null` + `heys_supabase_auth_token` | `isPinAuthClient()` = `_pinAuthClientId != null && user === null` |

> **Два чека для определения режима:**
> - Sync routing: `isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId`
> - UI check: `cloud.isPinAuthClient()` = `_pinAuthClientId != null && user === null`
>
> Они согласованы, но different по семантике: routing проверяет конкретный clientId, UI проверяет наличие PIN-сессии как таковой.

---

## 10. Практические правила для агентов

1. Всегда использовать `await HEYS.cloud.syncClient(clientId)` как входную точку.
2. Не предполагать, что `_rpcOnlyMode=false` означает curator.
3. Для full-data логики фильтровать `phaseA` (curator flow).
4. Для security: использовать `*_by_session`, не передавать `client_id` напрямую.
5. При анализе багов всегда фиксировать mode: curator vs PIN auth.

---

## 11. Where to read deeper

- `docs/SYNC_REFERENCE.md` — ядро sync pipeline и события
- `docs/dev/STORAGE_PATTERNS.md` — storage/use patterns
- `docs/API_DOCUMENTATION.md` — auth/RPC surface
- `docs/SECURITY_RUNBOOK.md` — security constraints

---

## Change Log

- **v1.0.1 (26.02.2026):** Исправлены 4 неточности: auth credential key (`heys_supabase_auth_token` = primary), `isPinAuthClient()` vs routing `isPinAuth` distinction, payload `loaded`+`viaYandex` в full curator sync, `switchClient` PIN-path техническое описание
- **v1.0.0 (26.02.2026):** первый единый документ по различиям Curator vs Client (PIN)
