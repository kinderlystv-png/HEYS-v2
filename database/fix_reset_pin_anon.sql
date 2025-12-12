-- Исправление: reset_client_pin для anon (без авторизации куратора)
-- Применить в Supabase SQL Editor

drop function if exists public.reset_client_pin(uuid, text, text);

create or replace function public.reset_client_pin(
  p_client_id uuid,
  p_pin_salt text,
  p_pin_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Проверяем что клиент существует
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'client_not_found';
  end if;

  update public.clients
     set pin_salt = p_pin_salt,
         pin_hash = p_pin_hash,
         pin_failed_attempts = 0,
         pin_locked_until = null,
         updated_at = now()
   where id = p_client_id;
end;
$$;

-- Разрешить для anon (без авторизации)
revoke all on function public.reset_client_pin(uuid, text, text) from public;
grant execute on function public.reset_client_pin(uuid, text, text) to anon, authenticated;
