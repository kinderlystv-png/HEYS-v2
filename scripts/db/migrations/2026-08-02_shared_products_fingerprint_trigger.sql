-- 2026-08-02 — отпечаток общего каталога считается сервером, а не вызывающим.
--
-- ПРОБЛЕМА
-- fingerprint и brand_fingerprint — ключи дедупликации: по ним публикация
-- решает, есть ли уже такой продукт. Считались они на клиенте и приезжали
-- вместе со строкой. Любой путь записи, который менял состав, но не пересчитал
-- отпечаток, оставлял его от прежних значений — а таких путей несколько
-- (кураторский REST-апсерт порций и штрихкодов, правки через RPC, ручные
-- миграции). Отпечаток тихо переставал соответствовать строке.
--
-- Насколько это накопилось: на 2026-08-02 из 399 карточек каталога разошлись
-- 263. То есть в двух третях случаев дедуп сравнивал продукт с отпечатком от
-- старого состава и не узнавал его — и при следующей публикации того же товара
-- каталог заводил второй экземпляр. Отсюда же и одноимённые пары, из-за
-- которых личные записи клиентов привязывались к битым карточкам.
--
-- РЕШЕНИЕ
-- Перенести вычисление на сервер: BEFORE INSERT OR UPDATE пересчитывает оба
-- отпечатка из самой строки. Тогда они не могут разойтись ни при каком пути
-- записи — включая те, которые появятся позже.
--
-- Это не новый механизм: ровно так уже работает соседняя очередь модерации
-- (триггер shared_products_pending_set_fingerprint), и обе функции
-- compute_product_fingerprint / compute_product_brand_fingerprint уже есть в
-- базе. Здесь они лишь применяются к таблице, где их не хватало.
--
-- Эквивалентность серверных функций фронтовому алгоритму
-- (apps/web/heys_models_v1.js) проверена на всём каталоге до применения:
-- 399/399 совпадений по fingerprint и 399/399 по brand_fingerprint.
-- Поэтому триггер не переписывает данные, а фиксирует уже достигнутое
-- состояние и не даёт ему разъехаться снова.
--
-- Побочный эффект, который является целью: попытка вставить продукт, дублирующий
-- существующий по составу, теперь надёжно упирается в UNIQUE(fingerprint) и
-- возвращает ошибку вместо тихого дубля.
-- ЗАВИСИМОСТЬ, КОТОРУЮ НАДО ВИДЕТЬ
-- Триггер вызывает compute_product_fingerprint / compute_product_brand_fingerprint.
-- Они создаются миграцией 2026-05-30_compute_product_fingerprint.sql, которая в
-- манифесте НЕ зарегистрирована и живёт в legacy baseline. На базе, собранной
-- строго по манифесту, этих функций может не быть — а plpgsql не проверяет тело
-- при создании, поэтому триггер встал бы молча и упал при первой же записи.
-- Проверяем явно, чтобы миграция падала здесь и с понятной причиной.
DO $$
BEGIN
  IF to_regprocedure('public.compute_product_fingerprint(jsonb)') IS NULL
     OR to_regprocedure('public.compute_product_brand_fingerprint(jsonb)') IS NULL
  THEN
    RAISE EXCEPTION
      'Нет compute_product_fingerprint/compute_product_brand_fingerprint. Сначала примените 2026-05-30_compute_product_fingerprint.sql (сейчас она в legacy baseline).';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_products_set_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
  v_brand text;
BEGIN
  -- Ключи собираются в том же написании, что использует фронт (camelCase для
  -- жиров): compute_product_fingerprint читает именно их.
  v_payload := jsonb_build_object(
    'name',       NEW.name,
    'simple100',  NEW.simple100,
    'complex100', NEW.complex100,
    'protein100', NEW.protein100,
    'badFat100',  NEW.badfat100,
    'goodFat100', NEW.goodfat100,
    'trans100',   NEW.trans100,
    'fiber100',   NEW.fiber100,
    'gi',         NEW.gi,
    'harm',       NEW.harm
  );

  NEW.fingerprint := public.compute_product_fingerprint(v_payload);

  v_brand := btrim(COALESCE(NEW.brand, ''));
  IF v_brand = '' THEN
    NEW.brand_fingerprint := NULL;
  ELSE
    NEW.brand_fingerprint := public.compute_product_brand_fingerprint(
      v_payload || jsonb_build_object('brand', NEW.brand)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_products_set_fingerprint ON public.shared_products;

CREATE TRIGGER trg_shared_products_set_fingerprint
  BEFORE INSERT OR UPDATE ON public.shared_products
  FOR EACH ROW
  EXECUTE FUNCTION public.shared_products_set_fingerprint();
-- ПРОВЕРКА ПОСЛЕ:
--   -- триггер на месте:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.shared_products'::regclass AND NOT tgisinternal;
--
--   -- отпечатки по-прежнему сходятся с серверной функцией (ничего не поехало):
--   SELECT count(*) FILTER (WHERE fingerprint <> public.compute_product_fingerprint(
--     jsonb_build_object('name',name,'simple100',simple100,'complex100',complex100,
--       'protein100',protein100,'badFat100',badfat100,'goodFat100',goodfat100,
--       'trans100',trans100,'fiber100',fiber100,'gi',gi,'harm',harm))) AS drifted
--     FROM shared_products;                                        -- ожидаем 0
--
--   -- живая проверка: правка состава пересчитывает отпечаток сама
--   -- (выполнять в транзакции с ROLLBACK, чтобы не менять каталог).
--
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_shared_products_set_fingerprint ON public.shared_products;
--   DROP FUNCTION IF EXISTS public.shared_products_set_fingerprint();
-- Данные при откате не страдают: триггер только поддерживает согласованность.
