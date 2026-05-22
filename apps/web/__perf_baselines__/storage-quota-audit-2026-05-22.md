# LocalStorage Quota Audit — baseline 2026-05-22

> **Status:** audit-only. Никаких code changes — это документ для будущего
> sprint'а по compression / TTL / partial-load. P0-D-stretch-2 Commit 4/4.

## Observed problem

Из браузерных логов одного active клиента
(`4545ee50-4f5f-4fc0-b862-7ca45fa1bafc`):

```
[HEYS.sinhron] ⚠️ dayv2 оставлены только в cloud из-за quota (28):
heys_4545ee50-..._dayv2_2026-02-01, _2026-01-31, ..., _2025-12-15
```

**28 dayv2 ключей** (3 месяца истории) не помещаются в localStorage и каждый раз
дочитываются из cloud. Импакт:

- Открытие старого дня (out of last 2-3 in LS) → 300-1200ms cloud read на 3G
- Cascade window 30 дней → если 27/30 cloud-only, нужен batch fetch (есть
  `fetchDays` в `heys_storage_supabase_v1.js:8829` — он deduplicates)
- На subsequent ре-открытия — `dayv2_cache` LRU 90 entries (memory-only)
  закрывает gap до следующей перезагрузки browser-таба

## Code path

`apps/web/heys_storage_supabase_v1.js`:

- **`HEYS_BUDGET_BYTES`** — soft budget (line ~2555)
- **`writeDayKeyWithQuotaGuard`** — `dayv2_*` writes защищены через
  `safeSetItem` → on `QuotaExceededError`:
  1. `cleanupRecoverableStorage()` — recoverable caches
  2. `cleanupOldData()` — files >90 days old
  3. Remove pending queues if still full
  4. `aggressiveCleanup()` on 3rd failure
  5. Returns false → key cloud-only
- **`SKIP_LOCAL_QUOTA`** warning fires в этом fail-path
- **`_measureLsBytes()`** scans all keys per write (O(N×K), known inefficient но
  safe-by-design)

## Hypotheses about who eats quota (not verified — needs HEYS.diagnostics.storageAudit от user)

| Suspect                                                                 | Typical size                    | Verify command                                         |
| ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| Shared products cache (`heys_shared_products_*`)                        | 500 KB - 1.2 MB                 | `HEYS.diagnostics.storageAudit({redact:true,topN:20})` |
| dayv2 keys (per-date `meals + trainings + cascade cache + supplements`) | 5-30 KB × 30+ days = 150-900 KB | Same                                                   |
| Cascade event history per-day metadata                                  | 100-200 KB total                | Same                                                   |
| Pending sync queue (`heys_[client]_pending_queue`)                      | 10-200 KB (spike offline)       | Same                                                   |
| Cloud snapshot duplicate caching                                        | Unknown                         | Same                                                   |
| Diary/widgets state (`heys_widget_layout_*`, `heys_diary_*`)            | < 100 KB                        | Same                                                   |

**Action item для будущего sprint'а:** запросить у user полный отчёт
`HEYS.diagnostics.storageAudit({ redact: true, topN: 20 })` — это даст точную
таблицу top-20 prefixes по размеру с redacted значениями.

## Existing infrastructure (NOT to be re-invented)

- ✅ `safeSetItem` с quota guard — `heys_storage_supabase_v1.js:~2555-2625`
- ✅ Compression `_compress`/`_decompress` уже применяется к pending queues
  (line 2744-2745) и dayv2 v2 schema
- ✅ LRU 90-entry in-memory cache `heys_dayv2_cache_v1.js:15` — закрывает gap
- ✅ `fetchDays` batch RPC с in-flight dedup
  (`heys_storage_supabase_v1.js:8829-8836`)
- ✅ `aggressiveCleanup` cascade — на крайнем случае выгружает старые ключи в
  cloud-only

## Recommendations for future sprint (NOT now)

### Option A — Compression shared products cache (estimated +6-8h)

Shared products cache потенциально 500 KB - 1.2 MB. Применить ту же `_compress`
обертку что и для pending queues. Ожидаемая экономия 30-40% размера → ~150-400
KB освобождается → достаточно чтобы все 28 dayv2 dates влезли локально.

**Risk:** compress/decompress на every read/write добавляет 1-2ms latency. Для
products это OK (читается на mount), но требует verify под нагрузкой.

### Option B — TTL eviction old `dayv2_*` (estimated +4-6h)

Сейчас `cleanupOldData` чистит файлы > 90 дней. Сократить до 60 дней (если user
активно отслеживает только last 2 months). Reduce dayv2 footprint by ~30%.

**Risk:** user открывает старый день за 70 дней → cloud read latency. Acceptable
trade-off, но требует UX confirmation.

### Option C — Split-read model (estimated +12-16h, complex)

Хранить ТОЛЬКО today's dayv2 + 3 recent dates локально (~40 KB). Старые → fetch
on-demand с in-memory cache (90 entries уже есть). Reduces LS footprint by 70%.

**Risk:** offline mode для старых дней не работает. Architectural change,
требует full QA cycle.

### Option D — Drop redundant cascade cache из dayv2 (estimated +4h)

Сейчас dayv2.cascadeState кешируется внутри dayv2 для быстрого ре-открытия. Эта
же информация available из `_lastCrs` + `_cascadeCache` (memory). Удалить
cascadeState из dayv2 schema v3 → saved ~20-30% per day.

**Risk:** First-open day требует full cascade compute (200ms+). `_cascadeCache`
handle'нет.

## Decision deferred

Все 4 options требуют значительной work + QA cycles. Текущий impact на real
users — **частичный**: 28 dayv2 cloud-only означает что:

- Browsing recent days (last 3) — instant (LS hit)
- Browsing old days (>3 days ago) — 300-1200ms cloud read each
- Browsing 30+ day cascade window — handled by `fetchDays` batch + LRU memory
  cache

Это **degraded but functional**. Не аварийная ситуация.

**Когда вернуться к этому:** когда:

1. Пожалуются на медленное открытие старых дней (это significant UX impact)
2. Появятся клиенты с offline-mobile use case (тогда split-read блокирует)
3. Появится time для full compression refactor (4-12 hours)

## Sources

- `apps/web/heys_storage_supabase_v1.js:2555-2625` — quota guard pipeline
- `apps/web/heys_storage_supabase_v1.js:8829-8851` — batch fetchDays
- `apps/web/heys_dayv2_cache_v1.js` — in-memory LRU
- Browser logs от user 2026-05-22 (clientId `4545ee50-...`)
