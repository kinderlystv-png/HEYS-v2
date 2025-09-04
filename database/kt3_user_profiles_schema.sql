-- КТ3: Enhanced User Profiles Schema
-- Расширяет основную схему для детального профиля пользователей
-- Добавляет таблицы: user_profiles, user_preferences, user_sessions

--------------------------------------------------
-- 1. Таблица user_profiles - детальные профили пользователей
--------------------------------------------------
create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  
  -- Базовая информация
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  bio text,
  
  -- Контактная информация (зашифрованная)
  phone text, -- будет зашифрована
  address jsonb, -- будет зашифрована: {street, city, country, postal_code}
  
  -- Настройки профиля
  language text default 'ru',
  timezone text default 'UTC',
  theme text default 'light' check (theme in ('light', 'dark', 'auto')),
  
  -- Уровни доступа и роли
  role text default 'user' check (role in ('user', 'curator', 'admin', 'super_admin')),
  permissions jsonb default '[]'::jsonb, -- массив разрешений
  access_level integer default 1 check (access_level between 1 and 10),
  
  -- Безопасность
  two_factor_enabled boolean default false,
  two_factor_secret text, -- зашифрованный
  backup_codes text[], -- зашифрованные
  security_questions jsonb, -- зашифрованные
  
  -- Активность
  last_login_at timestamptz,
  last_activity_at timestamptz,
  login_count integer default 0,
  
  -- Статус
  is_active boolean default true,
  is_verified boolean default false,
  is_suspended boolean default false,
  suspension_reason text,
  suspension_until timestamptz,
  
  -- Метаданные
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 2. Таблица user_preferences - пользовательские настройки
--------------------------------------------------
create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  
  -- Категории настроек
  category text not null, -- 'notifications', 'privacy', 'display', 'data'
  key text not null,
  value jsonb,
  
  -- Метаданные настройки
  description text,
  is_encrypted boolean default false,
  is_sensitive boolean default false,
  
  -- Временные метки
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  
  unique (user_id, category, key)
);

--------------------------------------------------
-- 3. Таблица user_sessions - активные сессии пользователей
--------------------------------------------------
create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  
  -- Информация о сессии
  session_token text not null unique,
  refresh_token text,
  device_id text,
  
  -- Технические детали
  ip_address inet,
  user_agent text,
  device_type text, -- 'desktop', 'mobile', 'tablet'
  browser text,
  os text,
  
  -- Геолокация
  country text,
  city text,
  coordinates point, -- PostGIS coordinate (lat, lng)
  
  -- Статус и безопасность
  is_active boolean default true,
  is_suspicious boolean default false,
  security_flags jsonb default '[]'::jsonb,
  
  -- Временные метки
  created_at timestamptz default timezone('utc', now()),
  last_activity_at timestamptz default timezone('utc', now()),
  expires_at timestamptz,
  
  -- Индексы для быстрого поиска
  constraint valid_expiry check (expires_at > created_at)
);

--------------------------------------------------
-- 4. Таблица audit_logs - логи аудита всех действий
--------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  
  -- Кто совершил действие
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid references user_sessions(id) on delete set null,
  
  -- Что произошло
  action text not null, -- 'create', 'read', 'update', 'delete', 'login', 'logout'
  resource_type text not null, -- 'user_profile', 'client', 'kv_store', etc.
  resource_id uuid,
  
  -- Детали действия
  old_values jsonb, -- старые значения (для update/delete)
  new_values jsonb, -- новые значения (для create/update)
  metadata jsonb default '{}'::jsonb,
  
  -- Контекст
  ip_address inet,
  user_agent text,
  request_id text, -- для связывания с логами приложения
  
  -- Результат
  success boolean default true,
  error_message text,
  response_time_ms integer,
  
  -- Временная метка
  created_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 5. Индексы для производительности
--------------------------------------------------
-- user_profiles
create index if not exists idx_user_profiles_user_id on user_profiles(user_id);
create index if not exists idx_user_profiles_role on user_profiles(role);
create index if not exists idx_user_profiles_active on user_profiles(is_active);
create index if not exists idx_user_profiles_last_activity on user_profiles(last_activity_at);

-- user_preferences
create index if not exists idx_user_preferences_user_id on user_preferences(user_id);
create index if not exists idx_user_preferences_category on user_preferences(category);
create index if not exists idx_user_preferences_sensitive on user_preferences(is_sensitive);

-- user_sessions
create index if not exists idx_user_sessions_user_id on user_sessions(user_id);
create index if not exists idx_user_sessions_active on user_sessions(is_active);
create index if not exists idx_user_sessions_token on user_sessions(session_token);
create index if not exists idx_user_sessions_device on user_sessions(device_id);
create index if not exists idx_user_sessions_suspicious on user_sessions(is_suspicious);

-- audit_logs
create index if not exists idx_audit_logs_user_id on audit_logs(user_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_resource on audit_logs(resource_type, resource_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at);
create index if not exists idx_audit_logs_success on audit_logs(success);

--------------------------------------------------
-- 6. Функции автообновления updated_at
--------------------------------------------------
do $$
begin
  -- Добавляем триггеры updated_at для новых таблиц
  if not exists (select 1 from pg_trigger where tgname='trg_user_profiles_updated_at') then
    execute 'create trigger trg_user_profiles_updated_at before update on user_profiles for each row execute function set_updated_at()';
  end if;
  
  if not exists (select 1 from pg_trigger where tgname='trg_user_preferences_updated_at') then
    execute 'create trigger trg_user_preferences_updated_at before update on user_preferences for each row execute function set_updated_at()';
  end if;
  
  if not exists (select 1 from pg_trigger where tgname='trg_user_sessions_last_activity') then
    execute 'create trigger trg_user_sessions_last_activity before update on user_sessions for each row execute function set_updated_at()';
  end if;
end$$;

-- Конец схемы профилей пользователей
