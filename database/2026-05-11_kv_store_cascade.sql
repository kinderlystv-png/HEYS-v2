-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔒 client_kv_store: добавить FK + защита триггера от orphan client_id
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-11
--
-- Проблема: client_kv_store была единственной таблицей со ссылкой на clients(id)
-- БЕЗ внешнего ключа. При удалении клиента через UI его данные оставались
-- orphan'ами; за месяцы накопилось ~3.2 MB мусора на 48 неактивных client_id.
--
-- Триггер fn_bump_change_marker при попытке DELETE из client_kv_store для orphan
-- client_id падал с FK violation (client_change_markers требует существующий
-- clients.id) — самоблокирующаяся ошибка, без admin-прав не удалить.
--
-- Этот файл закрывает обе проблемы:
--   1. fn_bump_change_marker получает defensive guard: skip orphan client_id.
--   2. client_kv_store получает FK constraint с ON DELETE CASCADE.
--
-- Контекст: на момент применения kv_store содержит только данные двух валидных
-- клиентов (ccfe6ea3, 4545ee50) — orphan'ов нет, FK создастся без data-миграции.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Шаг 1: добавить EXISTS-guard в fn_bump_change_marker
-- ═══════════════════════════════════════════════════════════════════════════════
-- Логика scope-derivation скопирована 1:1 из database/2026-03-30_change_markers.sql.
-- Единственное изменение — early return для orphan client_id.

CREATE OR REPLACE FUNCTION public.fn_bump_change_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_scope text;
  v_key text;
  v_cid uuid;
begin
  v_key := coalesce(NEW.k, OLD.k);
  v_cid := coalesce(NEW.client_id, OLD.client_id);

  -- Guard: skip orphan client_id (защита на случай если FK будет временно
  -- отключён, либо данные пишутся обходным путём).
  if not exists (select 1 from clients where id = v_cid) then
    return coalesce(NEW, OLD);
  end if;

  -- Derive scope from key naming convention
  if v_key ~ '^heys_dayv2_\d{4}-\d{2}-\d{2}$' then
    v_scope := 'day:' || substring(v_key from '\d{4}-\d{2}-\d{2}$');
  elsif v_key like '%widget_layout%' then
    v_scope := 'widgets';
  elsif v_key = 'heys_profile' then
    v_scope := 'profile';
  elsif v_key = 'heys_norms' then
    v_scope := 'norms';
  elsif v_key = 'heys_hr_zones' then
    v_scope := 'hr_zones';
  elsif v_key like '%products%' then
    v_scope := 'products';
  else
    v_scope := 'other';
  end if;

  insert into client_change_markers (client_id, scope, changed_at)
  values (v_cid, v_scope, now())
  on conflict (client_id, scope)
  do update set changed_at = now();

  return coalesce(NEW, OLD);
end$function$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Шаг 2: добавить FK constraint с ON DELETE CASCADE
-- ═══════════════════════════════════════════════════════════════════════════════
-- После этого DELETE из clients автоматически удалит соответствующие строки в
-- client_kv_store. INSERT с несуществующим client_id будет отклонён FK validation.

ALTER TABLE client_kv_store
  ADD CONSTRAINT client_kv_store_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification (запускаются в той же транзакции; падают → ROLLBACK)
-- ═══════════════════════════════════════════════════════════════════════════════

-- FK должен быть создан
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_kv_store_client_id_fkey'
      AND conrelid = 'client_kv_store'::regclass
  ) THEN
    RAISE EXCEPTION 'FK client_kv_store_client_id_fkey not created';
  END IF;
END $$;

-- Функция должна содержать guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_bump_change_marker'
      AND prosrc LIKE '%not exists%select 1 from clients%'
  ) THEN
    RAISE EXCEPTION 'fn_bump_change_marker guard not applied';
  END IF;
END $$;
