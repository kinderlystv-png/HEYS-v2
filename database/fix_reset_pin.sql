-- Быстрое исправление: только функция reset_client_pin
-- Применить в Supabase SQL Editor

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
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.clients
     set pin_salt = p_pin_salt,
         pin_hash = p_pin_hash,
         pin_failed_attempts = 0,
         pin_locked_until = null,
         updated_at = now()
   where id = p_client_id
     and curator_id = uid;

  if not found then
    raise exception 'not_found_or_forbidden';
  end if;
end;
$$;

grant execute on function public.reset_client_pin(uuid, text, text) to authenticated;
