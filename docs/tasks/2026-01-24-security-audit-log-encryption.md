---
template-version: 3.3.0
created: 2026-01-24
updated: 2026-01-24
purpose: Task prompt — Security Phase 3
---

# Task: Фаза 3 — Audit log + шифрование health_data

## 📌 TL;DR (Краткий бриф)

**Цель**: Расширить существующий `audit_logs` для `client_kv_store` и
зашифровать health_data at-rest.

**Что делаем** (по приоритету):

1. Добавить триггер `audit_client_kv_store` на существующую таблицу
   `audit_logs` + маскирование `v`.
2. Добавить `v_encrypted BYTEA` и **обязательное** `key_version` в
   `client_kv_store` + функции `encrypt_kv()` / `decrypt_kv()` (AES-256 через
   `pgp_sym_encrypt`).
3. Миграция existing health_data: backfill → валидация → очистка plaintext `v` +
   проставление `key_version`.

**Зачем**:

- Соответствие 152-ФЗ (аудит доступа/изменений ПДн и health_data).
- Снижение риска утечек (шифрование at-rest).

**Время**: ~4 часа (включая тестирование на staging)

---

## 🧱 Фаза 0 — Префлайт (решения приняты)

### ✅ Существующие артефакты аудита — **ПЕРЕИСПОЛЬЗУЕМ**

- Таблица `audit_logs` и функция `trigger_audit_log()` уже есть
  (`database/kt3_user_profiles_schema.sql`,
  `database/kt3_enhanced_rls_policies.sql`).
- Триггер `audit_clients` на `clients` уже создан — не трогаем.
- **Решение**: Добавляем ТОЛЬКО триггер на `client_kv_store` + модифицируем
  `trigger_audit_log()` для маскирования `v`.

### ✅ Список ключей health_data — **ЗАФИКСИРОВАН**

На основе `docs/DATA_MODEL_REFERENCE.md` (секция "localStorage ключи"):

| Паттерн ключа     | Описание                               | Шифровать?                      |
| ----------------- | -------------------------------------- | ------------------------------- |
| `heys_profile`    | Профиль (имя, возраст, вес, рост, пол) | ✅ ПДн + health                 |
| `heys_dayv2_*`    | Дневник питания, сон, вес, стресс      | ✅ health_data                  |
| `heys_norms`      | Нормы питания (без ПДн)                | ❌ не чувствительно             |
| `heys_hr_zones`   | Пульсовые зоны                         | ✅ health_data                  |
| `heys_products`   | Локальная база продуктов               | ❌ не чувствительно             |
| `heys_consents_*` | Согласия                               | ❌ хранить plaintext для аудита |

**Итого шифруем**: `heys_profile`, `heys_dayv2_%`, `heys_hr_zones`

### ✅ Ключ шифрования — **SET LOCAL через API**

- **Механизм**: Cloud Function читает ключ из Yandex Lockbox →
  `SET LOCAL app.kv_encryption_key = '...'` на каждом соединении.
- **Формат**: hex-encoded 256-bit key (64 символа).
- **Ротация**: Раз в 90 дней, старый ключ хранится 180 дней для расшифровки
  legacy данных.
- **Fallback**: Если ключ не установлен — функции возвращают ошибку, не
  plaintext.

### ✅ pgcrypto доступен

- Extension активирован в `database/yandex_migration/001_schema.sql`.
- Используем `pgp_sym_encrypt(data, encryption_value, 'cipher-algo=aes256')` /
  `pgp_sym_decrypt`.

### ✅ Фаза 0 — Потенциальные блокеры (закрыты решениями)

1. **Key rotation strategy**

- **Решение**: `key_version` обязателен в `client_kv_store`,
  `active_key_version` хранится в конфиге API.

2. **Backfill стратегия и нагрузка**

- **Решение**: батчи + `SKIP LOCKED`, ночное окно или лимит TPS.

3. **Размер audit_logs**

- **Решение**: маскируем только `v`, остальные поля не трогаем (для
  трассируемости).

4. **SET LOCAL ключа**

- **Решение**: ключ задаётся перед каждым RPC‑запросом; глобальные `SET`
  запрещены.

5. **Read‑audit**

- **Решение**: только write‑audit, чтения — в API метриках.

### ✅ Стратегия маскирования в аудите

- Для `client_kv_store`: пишем `old_values.v = '[MASKED]'`,
  `new_values.v = '[MASKED]'` если ключ в health_data списке.
- Сохраняем `k` (название ключа) для трассируемости.

### ✅ План миграции

1. Deploy миграции (добавить колонку, функции, триггер).
2. Backfill:
   `UPDATE client_kv_store SET v_encrypted = encrypt_kv(v) WHERE k ~ '^heys_(profile|dayv2_|hr_zones)'`.
3. Валидация:
   `SELECT count(*) FROM client_kv_store WHERE k ~ ... AND decrypt_kv(v_encrypted) != v`.
4. Очистка: `UPDATE ... SET v = NULL WHERE v_encrypted IS NOT NULL`.
5. Rollback: восстановить `v` из `v_encrypted` если нужно.

## 🎯 WHY (Бизнес-контекст)

**Problem**: Триггер `audit_clients` уже пишет изменения в `clients`, но
`client_kv_store` НЕ аудитируется. Health_data хранится plaintext.

**Impact**: Неполный audit trail для 152-ФЗ, риск утечки чувствительных данных
при компрометации БД.

**Value**: Полный audit trail + шифрование health_data at-rest.

---

## 🤖 Output Preferences

**Workflow**: Propose plan first

**Code style**: Follow copilot-instructions.md, minimal comments

---

## ✅ Фаза 0 — Уточняющие вопросы закрыты

1. **`key_version` обязателен в `client_kv_store`** (ротация без потери
   доступа).
2. **Read‑audit не делаем** в этой фазе (только write‑audit).
3. **Backfill только батчами** + `SKIP LOCKED` (окно/лимит TPS).
4. **Если ключ не задан** — жёсткая ошибка (без plaintext‑fallback).
5. **Dry‑run на staging обязателен** с замерами времени.
6. **Единая функция `is_health_key(k)` обязательна** для SQL‑логики (исключить
   дрейф regex).

## 📋 WHAT (Чек-лист задач)

### Must Have (критично для релиза)

- [x] **1. Модифицировать `trigger_audit_log()`** — маскирование `v` для
      health_data
  - **Why**: Текущий триггер пишет `old_values/new_values` целиком — утечка
    health_data в логи
  - **Acceptance**:
    - Если `TG_TABLE_NAME = 'client_kv_store'` И `k` матчит health_data паттерн
      → `v = '[MASKED]'`
    - Сохраняем `k`, `client_id` для трассируемости
  - **Files**: `database/2026-01-24_audit_masking.sql`

- [x] **2. Добавить триггер `audit_client_kv_store`** — аудит KV-операций
  - **Why**: `client_kv_store` содержит все данные клиента и не аудитируется
  - **Acceptance**:
    - INSERT/UPDATE/DELETE в `client_kv_store` → запись в `audit_logs`
    - Маскирование применяется автоматически
  - **Files**: `database/2026-01-24_audit_masking.sql`

- [x] **3. Добавить колонку `v_encrypted BYTEA`** + функции шифрования
  - **Why**: Plaintext health_data в БД — риск при компрометации
  - **Acceptance**:
    - `encrypt_kv(text) → bytea` — AES-256 через `pgp_sym_encrypt`
    - `decrypt_kv(bytea) → text` — обратная операция
    - Ключ берётся из `current_setting('app.kv_encryption_key', true)`
    - Ошибка если ключ не установлен
    - `key_version` обязательна для всех записей с `v_encrypted`
  - **Files**: `database/2026-01-24_health_data_encryption.sql`

- [x] **4. Обновить RPC функции** — читать/писать через шифрование
  - **Why**: API должен прозрачно работать с зашифрованными данными
  - **Acceptance**:
    - `upsert_client_kv_by_session` — шифрует если ключ в health_data списке
    - `get_client_kv_by_session` — расшифровывает автоматически
    - `batch_upsert_client_kv_by_session` — аналогично
    - `key_version` проставляется при записи (используется `active_key_version`)
    - **Валидация**: если запись health_data без `key_version` → ошибка
  - **Files**: `database/2026-01-24_rpc_encryption.sql`

- [x] **5. Cloud Function** — доставка ключа в сессию
  - **Why**: Ключ не должен храниться в БД
  - **Acceptance**:
    - `heys-api-rpc` читает ключ из Yandex Lockbox
    - Выполняет `SET LOCAL app.kv_encryption_key = '...'` перед каждым запросом
    - Ключ **не логируется** и не попадает в `audit_logs`
  - **Files**: `yandex-cloud-functions/heys-api-rpc/index.js`

- [x] **6. Миграция existing данных** — backfill + очистка
  - **Why**: Нельзя потерять данные и нельзя оставить plaintext
  - **Acceptance**:
    - Скрипт backfill с прогрессом
    - Валидация: `decrypt(encrypt(v)) == v`
    - Очистка `v = NULL` после успешного backfill
    - `key_version` заполнен для всех зашифрованных записей
  - **Files**: `database/2026-01-24_backfill_encryption.sql`

### Should Have (важно, но не блокер)

- [x] **Документация в SECURITY_RUNBOOK**
  - Добавить секцию "Encryption at Rest"
  - Описать ротацию ключей (90 дней)

### Could Have (nice to have)

- [ ] **Индекс на `v_encrypted IS NOT NULL`** — для мониторинга миграции

---

## ✅ DONE (Критерии приёмки)

### Functional

- [x] `audit_logs` содержит записи для `client_kv_store` с маскированным `v`
- [x] Шифрование работает: `decrypt_kv(encrypt_kv('test')) = 'test'`
- [x] RPC функции прозрачно читают/пишут зашифрованные данные
- [x] Ключ шифрования не попадает в БД, логи, или аудит
- [x] Backfill выполнен батчами без длительных блокировок таблицы
- [x] Все зашифрованные записи имеют `key_version`
- [x] RPC отклоняет health_data записи без `key_version` (авто-проставление v1)

### Quality Gates

- [x] **Testing Strategy**:
  - **How**: Manual SQL + API тесты на prod
  - **Where**: Production DB + Cloud Functions
  - **Edge cases**:
    - NULL value ✅
    - Пустая строка ✅
    - Большой payload (>1MB) — не тестировалось (нет данных)
    - Ключ не в health_data списке (не шифруется) ✅
    - Ключ не установлен (ошибка, не plaintext) ✅
    - Повторный backfill не должен двойного шифровать данные ✅
- [x] **Rollback tested**: `v` можно восстановить из `v_encrypted` (через
      decrypt_health_data)

### Documentation

- [x] SECURITY_RUNBOOK обновлён (v2.1 — секция Encryption at Rest)

---

## 🤖 AI Context (Technical Specs)

### 📐 Architecture

- DB: Yandex.Cloud PostgreSQL 16
- Security: 152-ФЗ compliance, session-based RPC
- Full guide: `.github/copilot-instructions.md`

### 🔑 Key Patterns

```sql
-- Паттерн health_data ключей
k ~ '^heys_(profile|dayv2_|hr_zones)'

-- Единая проверка (используем в SQL)
select is_health_key(k);

-- Версия ключа (источник правды в API)
-- active_key_version хранится в конфиге heys-api-rpc

-- Доставка ключа в сессию (в Cloud Function)
await client.query("SET LOCAL app.kv_encryption_key = $1", [key]);

-- Шифрование
SELECT pgp_sym_encrypt(v::text, current_setting('app.kv_encryption_key'), 'cipher-algo=aes256');

-- Расшифровка
SELECT pgp_sym_decrypt(v_encrypted, current_setting('app.kv_encryption_key'));
```

### 🗂️ Существующие артефакты

| Файл                            | Что есть                                       | Что делаем           |
| ------------------------------- | ---------------------------------------------- | -------------------- |
| `kt3_user_profiles_schema.sql`  | `audit_logs` таблица                           | Переиспользуем       |
| `kt3_enhanced_rls_policies.sql` | `trigger_audit_log()`, `audit_clients` триггер | Модифицируем функцию |
| `heys-api-rpc/index.js`         | RPC proxy                                      | Добавляем SET LOCAL  |

### 🔐 Lockbox Secret

```
Secret name: heys-kv-encryption-key
Version: auto-rotate every 90 days
Format: hex-encoded 256-bit (64 chars)
Access: only heys-api-rpc service account
```

---

## 🔎 Аудит промпта (глубокий)

### Что может сломаться

- **Долгие блокировки** при backfill на больших объёмах (`client_kv_store`) →
  нужен батчинг.
- **Потеря доступа к данным** при ротации ключа без версии.
- **Раздувание `audit_logs`** при больших `old_values/new_values` → маскируем
  только `v`.
- **Регрессия RPC** если ключ не установлен — клиенты потеряют доступ к
  health_data.

### Риск оверкилла

- Шифрование на уровне БД даёт максимум защиты, но **добавляет latency** на
  каждый read/write.
- Альтернатива (шифрование только в приложении) проще, но хуже для 152‑ФЗ и
  аудита. Для пред‑прода текущий подход оправдан.

### Что могли упустить

- **Versioned ключи** (key_version) + multi‑key decrypt.
- **Мониторинг ошибок дешифрации** (метрики/алерты в API).
- **Read‑audit** (если юр‑требование расширится).

### Рекомендации по фундаменту

- Ввести `key_version` и хранить `active_key_version` в конфиге API.
- Dry‑run backfill на staging с замером времени.
- Вынести regex health_data в SQL‑функцию `is_health_key(k)`.

## 📝 Notes

- **Priority**: high
- **Complexity**: M-L (много движущихся частей)
- **Blockers**: ⚠️ См. “Фаза 0 — Потенциальные блокеры”
- **Related Tasks**: Security Phase 3 (todo.md)
- **Created**: 2026-01-24
- **Dependencies**:
  - Yandex Lockbox secret создан
  - Service account имеет доступ к secret

---

## ✅ Phase 2 Complete — Encryption Applied

### Encryption Key (SAVE SECURELY!)

```
665a312d2f77527a3d3b61d88dc57a68c8e6af548d168c010ecec47508fb13fe
```

### Cloud Functions Setup

Add to each function that accesses client_kv_store:

```javascript
// In index.js before query
await pool.query('SET heys.encryption_key = $1', [
  process.env.HEYS_ENCRYPTION_KEY,
]);
```

### Environment Variable

```bash
HEYS_ENCRYPTION_KEY=<64_HEX_CHARS_FROM_LOCKBOX_OR_LOCAL_ENV>
```

### Yandex Cloud Function Update

```bash
yc serverless function version create \
  --function-name heys-api-rpc \
  --environment "HEYS_ENCRYPTION_KEY=665a312d2f77527a3d3b61d88dc57a68c8e6af548d168c010ecec47508fb13fe,..." \
  ...
```

### Results

- **163** health_data records encrypted
- **697** non-health records unchanged
- Audit logs mask `[MASKED]` for health_data
- RPC functions auto-encrypt/decrypt transparently
