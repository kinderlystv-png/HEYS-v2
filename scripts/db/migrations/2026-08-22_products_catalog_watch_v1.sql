-- 2026-08-22: снимок размера личного каталога продуктов для детекта схлопывания.
--
-- Контекст: 21.08 личный каталог клиента ccfe6ea3 в облаке заменился одной
-- позицией вместо 146 (см. apps/web/BUGS_HISTORY.md). Дефект закрыт, но узнали
-- о нём через несколько часов и только потому, что владелец заметил вручную.
-- Схлопывание должно кричать само.
--
-- Почему нужна таблица: размер каталога живёт в client_kv_store под ключом
-- heys_products_overlay_v2_rpc_manifest (поле rowCount), но история туда не
-- пишется — каждая публикация перетирает предыдущее значение. Сравнивать
-- «стало» не с чем. Здесь и хранится «было»: одна строка на клиента, которую
-- обновляет сторож heys-cron-security-alerts после каждой проверки.
--
-- Rollback внизу файла.

CREATE TABLE IF NOT EXISTS public.products_catalog_watch (
  client_id   uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  -- rowCount из манифеста на момент последней проверки
  row_count   integer NOT NULL,
  -- максимум, который сторож когда-либо видел: попадает в текст алерта, чтобы
  -- по одному сообщению было видно масштаб потери, а не только последний шаг
  peak_count  integer NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.products_catalog_watch IS
  'Снимок размера личного каталога продуктов на клиента. Источник «было» для детекта схлопывания в heys-cron-security-alerts.';

-- Засев текущим состоянием: без него первый прогон сторожа после выкатки
-- увидел бы «предыдущего значения нет» у всех клиентов сразу и промолчал бы —
-- а с засевом он с первой же минуты сравнивает с реальным «было».
INSERT INTO public.products_catalog_watch (client_id, row_count, peak_count, observed_at)
SELECT
  kv.client_id,
  (kv.v->>'rowCount')::int,
  (kv.v->>'rowCount')::int,
  now()
FROM public.client_kv_store AS kv
WHERE kv.k = 'heys_products_overlay_v2_rpc_manifest'
  AND kv.v ? 'rowCount'
  AND jsonb_typeof(kv.v->'rowCount') = 'number'
ON CONFLICT (client_id) DO NOTHING;

-- ===== ROLLBACK =====
-- DROP TABLE IF EXISTS public.products_catalog_watch;
