# Delete Gamification Events RPC

**Версия**: 1.0.0  
**Дата**: 2026-02-08  
**Автор**: Anton Poplavskij

## Описание

RPC функция для удаления дубликатов из audit log gamification_events.

### Проблема

В процессе работы системы геймификации были обнаружены дубликаты событий
достижений (achievement_unlocked) из-за race condition при rebuild. Система
корректно обрабатывает дубликаты (через Set в rebuildXPFromAudit), но
исторические записи остаются в БД.

### Решение

Создана SQL функция
`delete_gamification_events_by_curator(curator_id, event_ids[])` с проверкой
прав доступа:

- ✅ Принимает массив UUID событий для удаления
- 🔒 Проверяет, что все события принадлежат клиентам данного куратора
- 🔐 SECURITY DEFINER + curator_id check = защита от несанкционированного
  доступа
- ✅ Возвращает количество удалённых событий и их UUID

---

## Применение миграции

### 1. Через apply_migrations.js (рекомендуется)

```bash
cd yandex-cloud-functions/heys-api-rpc

# Установить PG_PASSWORD в env
export PG_PASSWORD="your_password_here"

# Применить миграцию
node apply_migrations.js
```

### 2. Вручную через psql

```bash
psql -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
     -p 6432 \
     -U heys_admin \
     -d heys_production \
     -f ../database/2026-02-08_delete_gamification_events.sql
```

---

## Использование

### Frontend (Browser Console)

**Требования**: Curator auth (Supabase JWT token)

```javascript
// 1. Показать дубликаты (не удаляет)
await HEYS.game.cleanupDuplicateAchievements();
// -> { localStorageDupes: 0, auditDupes: 9, drift: 0, xpRebuilt: false }

// 2. Удалить дубликаты из БД (curator only)
await HEYS.game.deleteDuplicateAuditEvents();
// -> { deleted: 9, eventIds: ['uuid1', 'uuid2', ...] }

// 3. Проверить результат
await HEYS.game.verifyXP();
// -> { drift: 0, dupes: [] }
```

### Backend (Node.js)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
  port: 6432,
  database: 'heys_production',
  user: 'heys_admin',
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const curatorId = '...';
const eventIds = ['uuid1', 'uuid2', 'uuid3'];

const result = await pool.query(
  'SELECT * FROM delete_gamification_events_by_curator($1, $2)',
  [curatorId, eventIds],
);

console.log('Deleted:', result.rows[0].deleted_count);
console.log('Event IDs:', result.rows[0].event_ids);
```

---

## Деплой RPC endpoint

После применения миграции нужно **передеплоить** `heys-api-rpc` Cloud Function:

```bash
cd yandex-cloud-functions/heys-api-rpc

# Запаковать
zip -r function.zip . -x "*.git*" -x "node_modules/*" -x "*.md"

# Деплой через YC CLI
yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 30s \
  --source-path . \
  --environment PG_HOST="rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net" \
  --environment PG_PORT="6432" \
  --environment PG_DATABASE="heys_production" \
  --environment PG_USER="heys_admin" \
  --secret environment-variable=PG_PASSWORD,id=<secret-id>,key=<key>
```

**Важно**: `PG_PASSWORD` должен быть передан через Yandex Lockbox, не в CLI!

---

## Тестирование

### Pre-deployment Test (локально)

```bash
# Подключиться к БД
psql -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net -p 6432 -U heys_admin -d heys_production

# Проверить дубликаты
SELECT reason, COUNT(*) as count
FROM gamification_events
WHERE action = 'achievement_unlocked'
GROUP BY reason
HAVING COUNT(*) > 1;

# Тестовое удаление (dry-run - смотрим что будет удалено)
SELECT *
FROM gamification_events ge
WHERE ge.id IN ('uuid1', 'uuid2', 'uuid3')
AND ge.client_id IN (
  SELECT c.id FROM clients c WHERE c.curator_id = 'your-curator-id'
);
```

### Post-deployment Test (production)

```javascript
// В браузере на app.heyslab.ru
await HEYS.game.verifyXP();
// Проверяем drift и dupes

await HEYS.game.deleteDuplicateAuditEvents();
// Должно вернуть: { deleted: N, eventIds: ['...'] }

await HEYS.game.verifyXP();
// dupes должно стать пустым массивом
```

---

## Безопасность

### Проверки в функции

1. **Curator ownership check**:

   ```sql
   WHERE ge.client_id IN (
     SELECT c.id FROM clients c WHERE c.curator_id = p_curator_id
   )
   ```

   Куратор может удалять ТОЛЬКО события своих клиентов.

2. **SECURITY DEFINER**: Функция выполняется с правами владельца (postgres), но
   с проверкой curator_id.

3. **GRANT для heys_rpc_only**: Только RPC роль может вызывать функцию.

### Что НЕ может сделать злоумышленник

❌ Удалить события чужих клиентов (проверка curator_id)  
❌ Вызвать функцию без curator auth (RPC endpoint требует JWT)  
❌ SQL injection (параметры через prepared statements)

---

## Rollback

Если что-то пошло не так:

```sql
-- Удалить функцию
DROP FUNCTION IF EXISTS delete_gamification_events_by_curator(UUID, UUID[]);

-- Восстановить события из бэкапа (если есть)
-- Yandex Cloud делает автоматические бэкапы каждые 3 часа
```

---

## Changelog

**v1.0.0** (2026-02-08):

- ✅ SQL функция с SECURITY DEFINER
- ✅ RPC endpoint (curator-only)
- ✅ Frontend метод deleteDuplicateAuditEvents()
- ✅ Curator ownership check
- ✅ Pre-push тесты прошли (224/224)

---

## Команды для быстрого старта

```bash
# 1. Применить миграцию
cd yandex-cloud-functions/heys-api-rpc
export PG_PASSWORD="***"
node apply_migrations.js

# 2. Деплой RPC
./deploy-with-lockbox.sh

# 3. Тест в браузере
# Открыть app.heyslab.ru → Console:
await HEYS.game.deleteDuplicateAuditEvents()
```

---

**Вопросы?** Связаться с @poplavskijanton
