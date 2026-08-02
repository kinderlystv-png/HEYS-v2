-- 2026-08-02 — удаление задвоенной позиции «Торт Наполеон222».
--
-- В дне 2026-04-26 у клиента Полтавский в ночном приёме 24:40 стояли две
-- позиции одного торта: «Торт Наполеон» 100 г и «Торт Наполеон222» 100 г, то
-- есть 200 г вместо 100 — двойной учёт из-за опечатки при создании карточки.
-- Сама кривая карточка из личного списка уже удалена ранее, в дневнике
-- осталась осиротевшая запись (единственная во всей истории).
BEGIN;

UPDATE public.client_kv_store k
SET v = jsonb_set(
      k.v, '{meals}',
      (
        SELECT COALESCE(jsonb_agg(
                 jsonb_set(tm.meal, '{items}', (
                   SELECT COALESCE(jsonb_agg(ti.item ORDER BY ti.ord), '[]'::jsonb)
                   FROM jsonb_array_elements(tm.meal->'items') WITH ORDINALITY AS ti(item, ord)
                   WHERE ti.item->>'product_id' IS DISTINCT FROM 'p_1777242382841_6o2xov'
                 )) ORDER BY tm.ord
               ), '[]'::jsonb)
        FROM jsonb_array_elements(k.v->'meals') WITH ORDINALITY AS tm(meal, ord)
      )
    ),
    updated_at = now()
WHERE k.k LIKE 'heys_dayv2_%'
  AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(k.v->'meals') m, jsonb_array_elements(m->'items') it
        WHERE it->>'product_id' = 'p_1777242382841_6o2xov'
      );

COMMIT;
