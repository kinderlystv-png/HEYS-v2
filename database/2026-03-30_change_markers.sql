-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔄 Phase 1b: Scoped change markers for curator → client near-real-time sync
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-03-30
-- Цель: клиент может за один запрос узнать, менялось ли что-то, и в каком scope.
--        Если ничего не менялось — 0 data transfer, экономия ~6 запросов в тик.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Таблица маркеров (per client × scope)
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists client_change_markers (
  client_id uuid not null references clients(id) on delete cascade,
  scope     text not null,  -- 'day:2026-03-30', 'products', 'profile', 'norms', 'widgets', 'hr_zones'
  changed_at timestamptz not null default now(),
  primary key (client_id, scope)
);

create index if not exists idx_change_markers_client
  on client_change_markers(client_id);

comment on table client_change_markers is
  'Per-client scoped change timestamps. Hot-sync checks these before pulling data.';

-- 2. Trigger: автоматически bump маркера при любом write в client_kv_store
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function fn_bump_change_marker()
returns trigger as $$
declare
  v_scope text;
  v_key text;
begin
  -- Determine which row to use (NEW for INSERT/UPDATE, OLD for DELETE)
  v_key := coalesce(NEW.k, OLD.k);

  -- Derive scope from key naming convention
  if v_key ~ '^heys_dayv2_\d{4}-\d{2}-\d{2}$' then
    -- day key: extract date → scope = 'day:YYYY-MM-DD'
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
  values (coalesce(NEW.client_id, OLD.client_id), v_scope, now())
  on conflict (client_id, scope)
  do update set changed_at = now();

  return coalesce(NEW, OLD);
end$$ language plpgsql security definer;

-- Attach trigger to client_kv_store
drop trigger if exists trg_bump_change_marker on client_kv_store;
create trigger trg_bump_change_marker
  after insert or update or delete on client_kv_store
  for each row execute function fn_bump_change_marker();

-- 3. RPC: get_change_markers_by_session — клиент запрашивает свои маркеры
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function get_change_markers_by_session(
  p_session_token text,
  p_since timestamptz default null
)
returns jsonb as $$
declare
  v_client_id uuid;
  v_markers jsonb;
begin
  -- Validate session (same pattern as other session-safe functions)
  select client_id into v_client_id
  from client_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now()
    and revoked_at is null;

  if v_client_id is null then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  if p_since is not null then
    -- Delta: only scopes changed after the given timestamp
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb)
    into v_markers
    from client_change_markers
    where client_id = v_client_id
      and changed_at > p_since;
  else
    -- Full: all scopes
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb)
    into v_markers
    from client_change_markers
    where client_id = v_client_id;
  end if;

  return jsonb_build_object('success', true, 'markers', v_markers);

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end$$ language plpgsql security definer;

comment on function get_change_markers_by_session(text, timestamptz) is
  '🔐 P1: Session-safe change marker read. Returns {scope: changed_at} map for selective hot-sync.';

-- 4. Права доступа
-- ═══════════════════════════════════════════════════════════════════════════════
grant select, insert, update on client_change_markers to heys_rpc;
grant execute on function get_change_markers_by_session(text, timestamptz) to heys_rpc;

-- 5. Проверка
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'client_change_markers') then
    raise notice '✅ client_change_markers table created';
  else
    raise notice '❌ client_change_markers table NOT found';
  end if;

  if exists (select 1 from pg_proc where proname = 'fn_bump_change_marker') then
    raise notice '✅ fn_bump_change_marker() trigger function created';
  else
    raise notice '❌ fn_bump_change_marker() NOT found';
  end if;

  if exists (select 1 from pg_proc where proname = 'get_change_markers_by_session') then
    raise notice '✅ get_change_markers_by_session() created';
  else
    raise notice '❌ get_change_markers_by_session() NOT found';
  end if;

  if exists (select 1 from pg_trigger where tgname = 'trg_bump_change_marker') then
    raise notice '✅ trg_bump_change_marker trigger attached';
  else
    raise notice '❌ trg_bump_change_marker trigger NOT found';
  end if;
end $$;
