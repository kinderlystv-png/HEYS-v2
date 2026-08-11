-- HEYS: обязательный хэш текста документа в согласиях
--
-- Зачем. Запись согласия доказывает, что человек согласился с КОНКРЕТНЫМ
-- текстом. Без хэша документа она доказывает только факт нажатия: текст
-- задним числом не восстановить, а версия — всего лишь ярлык, который можно
-- переписать. Сейчас `document_sha256` допускает NULL, и таких строк 117 из 158.
--
-- Что выяснено до правки (2026-08-11, прод):
--   * Дыра НЕ живая. `log_consents` пишет хэш из `legal_consent_registry`, и с
--     2026-07-28 пропусков нет ни одного: 28.07 — 15 записей, 30.07 — 15,
--     31.07 — 2, 09.08 — 8, везде хэш проставлен. Все 117 пустых — 27 июля и
--     раньше, то есть до фикса.
--   * Из них 13 восстановимы: их версия есть в реестре вместе с хэшем.
--   * Остальные 104 ссылаются на версии, которых в реестре нет (personal_data
--     1.5 и 1.6, marketing 1.2, health_data 1.3 и другие). Их тексты не
--     сохранены — хэш не восстановить ничем.
--   * Клиентов нет: все записи принадлежат восьми тестовым client_id.
--
-- Порядок здесь именно такой и обратному не подлежит: сначала восстановить
-- что можно, потом убрать в архив то, что доказательством не является, и
-- только третьим шагом закрыть дверь ограничением. NOT NULL на живой таблице
-- со 117 нарушителями просто упадёт.

BEGIN;

-- 0) Контрольные цифры входа. Транзакция проверяет себя сама: если состояние
--    базы отличается от того, на котором миграция писалась, дальше идти нельзя
--    — значит между диагностикой и применением что-то изменилось.
DO $$
DECLARE
  v_total INT; v_no_hash INT; v_recoverable INT;
BEGIN
  SELECT count(*) INTO v_total FROM public.consents;
  SELECT count(*) INTO v_no_hash FROM public.consents WHERE document_sha256 IS NULL;
  SELECT count(*) INTO v_recoverable
    FROM public.consents c
    JOIN public.legal_consent_registry r
      ON r.consent_type = c.consent_type AND r.document_version = c.document_version
   WHERE c.document_sha256 IS NULL AND r.document_sha256 IS NOT NULL;

  IF v_total <> 158 OR v_no_hash <> 117 OR v_recoverable <> 13 THEN
    RAISE EXCEPTION 'Состояние не совпадает с диагностикой 2026-08-11: всего %, без хэша %, восстановимых % (ожидалось 158/117/13)',
      v_total, v_no_hash, v_recoverable;
  END IF;
END $$;

-- 1) Восстановимое — восстановить. Хэш берётся из реестра по паре
--    (тип, версия): это тот же источник, из которого его пишет `log_consents`,
--    поэтому значение получается идентичным тому, что было бы записано тогда.
UPDATE public.consents c
   SET document_sha256 = r.document_sha256
  FROM public.legal_consent_registry r
 WHERE c.document_sha256 IS NULL
   AND r.consent_type = c.consent_type
   AND r.document_version = c.document_version
   AND r.document_sha256 IS NOT NULL;

-- 2) Невосстановимое — в архив, не в мусор. Строки уезжают целиком, вместе с
--    метаданными: они бесполезны как доказательство согласия, но остаются
--    свидетельством того, что и когда происходило в тестовый период.
--    Архив содержит client_id, IP и user-agent — это персональные данные, и
--    жить по своим правилам он не должен. `LIKE ... INCLUDING ALL` копирует
--    умолчания, CHECK'и и индексы, но НЕ внешние ключи: без явного FK удаление
--    клиента вычистило бы `consents` каскадом и оставило архив нетронутым, то
--    есть создало бы теневое хранилище мимо процедуры удаления по запросу
--    субъекта. Поэтому FK добавляется руками, с тем же ON DELETE CASCADE.
CREATE TABLE IF NOT EXISTS public.consents_archive_prehash (
  LIKE public.consents INCLUDING ALL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_reason TEXT NOT NULL DEFAULT 'no_document_hash_pre_2026_07_28'
);

ALTER TABLE public.consents_archive_prehash
  DROP CONSTRAINT IF EXISTS consents_archive_prehash_client_id_fkey;

ALTER TABLE public.consents_archive_prehash
  ADD CONSTRAINT consents_archive_prehash_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

COMMENT ON TABLE public.consents_archive_prehash IS
  'Согласия тестового периода без хэша документа (до 2026-07-28). Доказательством согласия не являются: текст версии не сохранён. Персональные данные — включать в выгрузку по запросу субъекта и в срок хранения наравне с consents; удаление клиента каскадит сюда.';

INSERT INTO public.consents_archive_prehash
SELECT c.*, now(), 'no_document_hash_pre_2026_07_28'
  FROM public.consents c
 WHERE c.document_sha256 IS NULL;

DELETE FROM public.consents WHERE document_sha256 IS NULL;

-- 3) Дверь. CHECK, а не NOT NULL: формат хэша проверяется тем же выражением,
--    что и раньше, — теперь без ветки «IS NULL разрешён».
ALTER TABLE public.consents
  DROP CONSTRAINT IF EXISTS consents_document_sha256_format;

ALTER TABLE public.consents
  ADD CONSTRAINT consents_document_sha256_format
  CHECK (document_sha256 ~ '^[0-9a-f]{64}$');

-- 4) Контрольные цифры выхода. 158 − 104 = 54 строки, из них ни одной без
--    хэша; в архиве ровно 104.
DO $$
DECLARE
  v_left INT; v_no_hash INT; v_archived INT;
BEGIN
  SELECT count(*) INTO v_left FROM public.consents;
  SELECT count(*) INTO v_no_hash FROM public.consents WHERE document_sha256 IS NULL;
  SELECT count(*) INTO v_archived FROM public.consents_archive_prehash;

  IF v_left <> 54 OR v_no_hash <> 0 OR v_archived <> 104 THEN
    RAISE EXCEPTION 'Результат не совпадает с ожидаемым: осталось %, без хэша %, в архиве % (ожидалось 54/0/104)',
      v_left, v_no_hash, v_archived;
  END IF;
END $$;

COMMIT;

-- Проверка после применения: обе цифры должны быть нулевыми.
--   SELECT count(*) FILTER (WHERE document_sha256 IS NULL) AS no_hash,
--          count(*) FILTER (WHERE document_sha256 !~ '^[0-9a-f]{64}$') AS bad
--     FROM public.consents;
