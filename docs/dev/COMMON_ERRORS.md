# 🐛 HEYS Common Errors

> Частые ошибки и их решения

---

## Ошибки данных

| Код  | Ошибка                | Причина                 | Решение                                          |
| ---- | --------------------- | ----------------------- | ------------------------------------------------ |
| E001 | Данные не сохраняются | Неверный clientId       | Проверь `U.lsSet()` вместо `localStorage`        |
| E002 | Поиск не работает     | searchIndex не обновлён | Вызови `buildSearchIndex()` после добавления     |
| E003 | Supabase RLS denied   | Нет политики            | Добавь RLS в `database_clients_rls_policies.sql` |
| E004 | React не обновляет UI | Мутация объекта         | Создай новый объект `{...old, newProp}`          |
| E005 | Analytics не трекает  | Неверный метод          | Используй `trackSearch/trackApiCall/trackError`  |
| E006 | Продукт не в базе     | Sync blocked / дубли    | См. секцию Orphan продукты                       |
| E007 | 400 refresh_token     | RTR одноразовый токен   | См. секцию Supabase RTR                          |

---

## Ошибки модели данных

| Ошибка                   | Правильно                                   |
| ------------------------ | ------------------------------------------- |
| `dayTot.protein`         | `dayTot.prot` ⚠️                            |
| `normAbs.protein`        | `normAbs.prot` ⚠️                           |
| `item.category`          | `getProductFromItem(item, pIndex).category` |
| `heys_day_`              | `heys_dayv2_` (v2!)                         |
| `localStorage.setItem()` | `U.lsSet()`                                 |

---

## Supabase RTR (Refresh Token Rotation) — 400 Bad Request

### Симптомы

- Консоль: `POST .../auth/v1/token?grant_type=refresh_token 400 (Bad Request)`
- Network: `X-Sb-Error-Code: refresh_token_already_used`
- Пользователь выбрасывается из сессии

### Решение (в heys_storage_supabase_v1.js)

1. **Отключить автоматический refresh**: `autoRefreshToken: false`
2. **Очищать истёкшие токены ПЕРЕД созданием клиента**
3. **Защитный период после signIn** — игнорировать ложные SIGNED_OUT

---

## Проблемы с версиями

### Сравнение версий

**Проблема**: Версии `2025.12.12.2113.xxx` vs `2025.12.12.2057.yyy` сравнивались как строки

**Решение**: Функция `isNewerVersion()`:

```javascript
function isNewerVersion(serverVersion, currentVersion) {
  const getNumeric = (v) => {
    const parts = v.split('.');
    const numeric = parts.slice(0, 4).join('');
    return parseInt(numeric, 10) || 0;
  };
  return getNumeric(serverVersion) > getNumeric(currentVersion);
}
```

---

## Debugging Patterns

```javascript
// В browser console:
heysStats(); // Shows session statistics
window.HEYS.cloud.getStatus(); // 'online' | 'offline'

// Inspect localStorage
Object.keys(localStorage).filter((k) => k.startsWith('heys_'));

// Проверить режим auth
console.log('RPC only mode:', HEYS.cloud._rpcOnlyMode);
console.log('PIN client ID:', HEYS.cloud._pinAuthClientId);
```
