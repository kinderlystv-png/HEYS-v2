-- Keep SECURITY DEFINER lead conversion on the same hardened search_path
-- pattern as the Telegram/PIN recovery functions.

ALTER FUNCTION public.admin_convert_lead(UUID, UUID)
  SET search_path = public, pg_temp;
