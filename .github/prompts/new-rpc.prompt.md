---
description: Создание новой RPC-функции для Yandex Cloud
---

# Новая RPC-функция

## Входные данные

- Название функции: `{{functionName}}`
- Описание: `{{description}}`

## Шаги

### 1. SQL миграция (`database/YYYY-MM-DD_{{functionName}}.sql`)

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.{{functionName}}_by_session(
  p_session_token TEXT
  -- добавить параметры
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  -- логика функции
END;
$$;

COMMENT ON FUNCTION public.{{functionName}}_by_session IS '{{description}}';
REVOKE ALL ON FUNCTION public.{{functionName}}_by_session FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.{{functionName}}_by_session TO heys_rpc;

COMMIT;
```

### 2. Allowlist (`yandex-cloud-functions/heys-api-rpc/index.js`)

Добавить `'{{functionName}}_by_session'` в `ALLOWED_FUNCTIONS`.

### 3. Клиентский вызов (`apps/web/`)

```javascript
const result = await HEYS.YandexAPI.rpc('{{functionName}}_by_session', {
  /* params */
});
```

### 4. Применить миграцию

```bash
node yandex-cloud-functions/heys-api-rpc/apply_migrations.js
```

## Чеклист

- [ ] Функция использует `*_by_session` паттерн
- [ ] `SECURITY DEFINER` + `SET search_path = public`
- [ ] `REVOKE FROM PUBLIC` + `GRANT TO heys_rpc`
- [ ] Добавлена в allowlist
- [ ] Миграция идемпотентна (`CREATE OR REPLACE`)
- [ ] Тест через `HEYS.YandexAPI.rpc()` в dev-консоли
