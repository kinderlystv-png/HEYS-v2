-- ═══════════════════════════════════════════════════════════════════════════
-- HEYS: удалённый рубильник экрана входа (heys/540784)
-- ═══════════════════════════════════════════════════════════════════════════
-- Фронт зовёт RPC get_public_app_status с экрана входа
-- (apps/web/heys_login_screen_v1.js, resolveLoginMaintenanceFlag), а такой
-- функции нет ни в базе, ни в белом списке шлюза. Прод отвечает 403 на каждый
-- вход; в heys_yandex_api_v1.js для этого случая заведён
-- isExpectedOptionalPublicRpcFailure с пометкой «fail-open when not deployed
-- yet» — то есть серверную часть собирались сделать и не сделали.
--
-- Смысл рубильника: во время инцидента с входом фронт быстро не выкатишь, а
-- строку в базе переключаешь сразу — экран входа честно говорит, что идут
-- работы, вместо непонятной ошибки. Такой инцидент уже был (PIN-вход, 12.08).
--
-- Что здесь заводится: таблица на одну строку и функция чтения. Функция
-- ПУБЛИЧНАЯ и вызывается ДО аутентификации, поэтому отдаёт ровно три поля и
-- ничего больше — никаких счётчиков, версий и внутренних имён.
--
-- Запись — только вручную из psql под heys_admin: UPDATE ниже в комментарии.
-- Права на запись роли heys_rpc не выдаются намеренно, чтобы рубильник нельзя
-- было переключить через API.
--
-- Идемпотентна. Безопасно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_status (
  id                    BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  login_closed          BOOLEAN NOT NULL DEFAULT false,
  login_closed_title    TEXT,
  login_closed_message  TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            TEXT
);

COMMENT ON TABLE public.app_status IS
  'Одна строка: удалённый рубильник экрана входа. Пишется вручную под heys_admin, читается публичной get_public_app_status.';
COMMENT ON COLUMN public.app_status.id IS
  'Всегда true: CHECK держит таблицу одностроч+ной, второй строке взяться неоткуда.';

INSERT INTO public.app_status (id, login_closed)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_app_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'login_closed', s.login_closed,
       'login_closed_title', s.login_closed_title,
       'login_closed_message', s.login_closed_message
     )
     FROM public.app_status s
     WHERE s.id),
    -- Строки нет — вход открыт. Отсутствие записи не должно закрывать сервис.
    jsonb_build_object('login_closed', false)
  );
$$;

COMMENT ON FUNCTION public.get_public_app_status IS
  'Публичный статус экрана входа. Зовётся до аутентификации, отдаёт только признак закрытия и тексты.';

GRANT EXECUTE ON FUNCTION public.get_public_app_status() TO heys_rpc;

-- Закрыть вход во время инцидента:
--   UPDATE public.app_status
--      SET login_closed = true,
--          login_closed_title = 'Идут технические работы',
--          login_closed_message = 'Вход временно недоступен, мы уже чиним.',
--          updated_at = now(), updated_by = 'имя'
--    WHERE id;
-- Открыть обратно:
--   UPDATE public.app_status
--      SET login_closed = false, updated_at = now(), updated_by = 'имя'
--    WHERE id;
