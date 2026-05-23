# ⚠️ DANGEROUS — Manual ops scripts

Скрипты в этой папке **прямо удаляют/перезаписывают `heys_products`** в
`client_kv_store` **без проставления tombstone** в `heys_deleted_ids`.

## Когда это плохо

Если на день, использующий удалённый продукт, потом откроется UI — он покажет
[orphan-баннер](../../apps/web/heys_day_orphan_alert.js) «продукт не найден в
базе», потому что:

- `getById('<id>')` → null (продукта нет в overlay/legacy)
- Tombstone не проставлен → `_isProductTombstoned` тоже null →
  `autoRecoverOnLoad` будет пытаться восстановить из stamp/shared в каждом boot
- При наличии shared-аналога по имени — может быть авто-clone с **новым** id, но
  cтарый id в meal-item останется dangling → race с auto-clone'ом.

См. `apps/web/BUGS_HISTORY.md` запись «Orphan-баннер + cleanup hardening
(2026-05-24)» — это реальный кейс что бывает.

## Когда можно использовать

Только когда **гарантировано**, что данные клиента больше не будут читаться:

- Тестовый/dev клиент, который будет полностью удалён.
- Reset перед массовой повторной заливкой.
- Recovery после corrupted state, когда все dayv2-записи тоже зачищены.

## Что использовать ВМЕСТО

Для штатного удаления продукта — `HEYS.deletedProducts.add(name, id, fp)` +
`HEYS.products.setAll(filtered, { source: 'delete-product', allowShrink: true })`
(см. UI `delete-product` handler в
[heys_add_product_step_v1.js:3118-3131](../../apps/web/heys_add_product_step_v1.js#L3118)).

Для massive ops cleanup'а — план предусматривает `safe-wipe-products.sh` (см.
`plans/rustling-dazzling-bentley.md` F16): обёртка SELECT-IDs → INSERT
tombstones → UPDATE products = `[]`.

## Что в файлах

- `delete_client_products.sql` — `UPDATE ... SET v='[]'` для конкретного
  client_id. Идёт с inline-checkpoint'ом (SELECT до и после).
- `delete_client_products_quick.sql` — то же, но без checkpoint'ов.
- `fix_products_final.sql` —
  `DELETE FROM client_kv_store WHERE k LIKE '%<cid>%'` (очистка glitch-keys с
  double-cid). Менее опасный, но содержит hardcoded UUID.

Hardcoded `client_id` заменены на placeholder `<CLIENT_ID>` (раньше были
конкретные uuid'ы из истории — privacy/ops hygiene).

## Pull request checklist

При добавлении нового скрипта сюда:

- [ ] Подтверждено что safe-альтернатива не применима
- [ ] Используется `<CLIENT_ID>` placeholder, не реальный UUID
- [ ] Документировано **почему** без tombstone (если нельзя — переделать через
      safe-wipe-products.sh)
