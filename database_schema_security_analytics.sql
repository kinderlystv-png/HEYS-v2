-- Security and Analytics Database Schema Extension
-- Расширяет supabase_full_setup.sql для threat detection и analytics

--------------------------------------------------
-- 1. Таблица security_events - события безопасности
--------------------------------------------------
create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  event_type text not null, -- 'login', 'api_call', 'data_access', 'error', etc.
  source_ip inet,
  user_agent text,
  session_id text,
  request_frequency integer default 1,
  session_duration interval,
  error_rate float default 0.0,
  response_time interval,
  data_volume bigint default 0,
  geo_location jsonb, -- {lat, lng, country, city}
  device_fingerprint text,
  privilege_level text default 'user', -- 'user', 'admin', 'system'
  failed_attempts integer default 0,
  metadata jsonb, -- дополнительные данные события
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 2. Таблица security_incidents - инциденты безопасности
--------------------------------------------------
create table if not exists security_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'false_positive')),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  event_ids uuid[], -- массив связанных событий
  ioc_matches jsonb, -- совпадения индикаторов компрометации
  ml_confidence float, -- уверенность ML модели
  response_actions jsonb, -- выполненные действия реагирования
  timeline jsonb, -- временная шкала инцидента
  impact_assessment jsonb, -- оценка воздействия
  assigned_to uuid references auth.users(id),
  escalated_to uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 3. Таблица analytics_metrics - метрики аналитики
--------------------------------------------------
create table if not exists analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  metric_name text not null, -- 'user_activity', 'performance', 'security_score', etc.
  metric_value float not null,
  metric_unit text, -- 'count', 'percentage', 'milliseconds', etc.
  dimensions jsonb, -- дополнительные измерения метрики
  aggregation_period text not null, -- 'minute', 'hour', 'day', 'week', 'month'
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 4. Таблица threat_intelligence - данные threat intelligence
--------------------------------------------------
create table if not exists threat_intelligence (
  id uuid primary key default gen_random_uuid(),
  ioc_type text not null, -- 'ip', 'domain', 'hash', 'user_agent'
  ioc_value text not null,
  threat_actor text,
  threat_type text, -- 'malware', 'phishing', 'botnet', etc.
  confidence_score float default 0.0,
  first_seen timestamptz,
  last_seen timestamptz,
  source text, -- источник данных
  tags text[],
  metadata jsonb,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  unique (ioc_type, ioc_value)
);

--------------------------------------------------
-- 5. Таблица guest_sessions - гостевые сессии
--------------------------------------------------
create table if not exists guest_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text unique not null,
  ip_address inet,
  user_agent text,
  geo_location jsonb,
  device_fingerprint text,
  activity_log jsonb,
  security_score float default 1.0,
  is_suspicious boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 6. Индексы для производительности
--------------------------------------------------
create index if not exists idx_security_events_user_id on security_events(user_id);
create index if not exists idx_security_events_client_id on security_events(client_id);
create index if not exists idx_security_events_created_at on security_events(created_at);
create index if not exists idx_security_events_event_type on security_events(event_type);
create index if not exists idx_security_events_source_ip on security_events using gist(source_ip inet_ops);

create index if not exists idx_security_incidents_user_id on security_incidents(user_id);
create index if not exists idx_security_incidents_status on security_incidents(status);
create index if not exists idx_security_incidents_severity on security_incidents(severity);
create index if not exists idx_security_incidents_created_at on security_incidents(created_at);

create index if not exists idx_analytics_metrics_user_id on analytics_metrics(user_id);
create index if not exists idx_analytics_metrics_client_id on analytics_metrics(client_id);
create index if not exists idx_analytics_metrics_name on analytics_metrics(metric_name);
create index if not exists idx_analytics_metrics_period on analytics_metrics(period_start, period_end);

create index if not exists idx_threat_intelligence_type_value on threat_intelligence(ioc_type, ioc_value);
create index if not exists idx_threat_intelligence_active on threat_intelligence(is_active);

create index if not exists idx_guest_sessions_token on guest_sessions(session_token);
create index if not exists idx_guest_sessions_ip on guest_sessions using gist(ip_address inet_ops);
create index if not exists idx_guest_sessions_expires on guest_sessions(expires_at);

--------------------------------------------------
-- 7. Включение RLS для новых таблиц
--------------------------------------------------
alter table security_events enable row level security;
alter table security_incidents enable row level security;
alter table analytics_metrics enable row level security;
alter table threat_intelligence enable row level security;
alter table guest_sessions enable row level security;

--------------------------------------------------
-- 8. Политики доступа
--------------------------------------------------

-- security_events: пользователь видит только свои события и события своих клиентов
create policy security_events_sel on security_events for select using (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = security_events.client_id and c.curator_id = auth.uid())
);
create policy security_events_ins on security_events for insert with check (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = security_events.client_id and c.curator_id = auth.uid())
);

-- security_incidents: аналогично событиям
create policy security_incidents_sel on security_incidents for select using (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = security_incidents.client_id and c.curator_id = auth.uid())
);
create policy security_incidents_ins on security_incidents for insert with check (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = security_incidents.client_id and c.curator_id = auth.uid())
);
create policy security_incidents_upd on security_incidents for update using (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = security_incidents.client_id and c.curator_id = auth.uid())
);

-- analytics_metrics: пользователь видит только свои метрики и метрики своих клиентов
create policy analytics_metrics_sel on analytics_metrics for select using (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = analytics_metrics.client_id and c.curator_id = auth.uid())
);
create policy analytics_metrics_ins on analytics_metrics for insert with check (
  auth.uid() = user_id OR 
  exists (select 1 from clients c where c.id = analytics_metrics.client_id and c.curator_id = auth.uid())
);

-- threat_intelligence: только админы могут управлять
create policy threat_intelligence_sel on threat_intelligence for select using (true); -- все могут читать
create policy threat_intelligence_ins on threat_intelligence for insert with check (
  exists (select 1 from auth.users where id = auth.uid() and raw_user_meta_data->>'role' = 'admin')
);
create policy threat_intelligence_upd on threat_intelligence for update using (
  exists (select 1 from auth.users where id = auth.uid() and raw_user_meta_data->>'role' = 'admin')
);

-- guest_sessions: публичный доступ для гостевых сессий
create policy guest_sessions_sel on guest_sessions for select using (true);
create policy guest_sessions_ins on guest_sessions for insert with check (true);
create policy guest_sessions_upd on guest_sessions for update using (true);

--------------------------------------------------
-- 9. Триггеры обновления updated_at
--------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_security_events_updated_at') then
    execute 'create trigger trg_security_events_updated_at before update on security_events for each row execute function set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_security_incidents_updated_at') then
    execute 'create trigger trg_security_incidents_updated_at before update on security_incidents for each row execute function set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_threat_intelligence_updated_at') then
    execute 'create trigger trg_threat_intelligence_updated_at before update on threat_intelligence for each row execute function set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_guest_sessions_updated_at') then
    execute 'create trigger trg_guest_sessions_updated_at before update on guest_sessions for each row execute function set_updated_at()';
  end if;
end$$;

--------------------------------------------------
-- 10. Функции для аналитики
--------------------------------------------------

-- Функция получения метрик безопасности за период
create or replace function get_security_metrics(
  p_user_id uuid,
  p_client_id uuid default null,
  p_start_date timestamptz default now() - interval '24 hours',
  p_end_date timestamptz default now()
) returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_events', count(*),
    'unique_ips', count(distinct source_ip),
    'error_rate', avg(error_rate),
    'avg_response_time', extract(epoch from avg(response_time)),
    'failed_attempts', sum(failed_attempts),
    'event_types', jsonb_agg(distinct event_type)
  ) into result
  from security_events
  where created_at between p_start_date and p_end_date
    and (user_id = p_user_id or (p_client_id is not null and client_id = p_client_id));
  
  return coalesce(result, '{}'::jsonb);
end$$ language plpgsql security definer;

-- Функция получения топ угроз
create or replace function get_top_threats(
  p_limit integer default 10
) returns table(
  ioc_value text,
  ioc_type text,
  threat_actor text,
  matches_count bigint,
  last_seen timestamptz
) as $$
begin
  return query
  select 
    ti.ioc_value,
    ti.ioc_type,
    ti.threat_actor,
    count(se.id) as matches_count,
    max(se.created_at) as last_seen
  from threat_intelligence ti
  left join security_events se on (
    (ti.ioc_type = 'ip' and se.source_ip::text = ti.ioc_value) or
    (ti.ioc_type = 'user_agent' and se.user_agent = ti.ioc_value)
  )
  where ti.is_active = true
  group by ti.ioc_value, ti.ioc_type, ti.threat_actor
  order by matches_count desc, last_seen desc nulls last
  limit p_limit;
end$$ language plpgsql security definer;
