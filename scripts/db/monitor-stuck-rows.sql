-- monitor-stuck-rows.sql
-- Health-check: ловит зависшие строки которые могут указывать на bug
--   (precision-mismatch ack, dead writers, накопление мусора и т.д.)
-- Запуск: bash scripts/db/psql.sh -f scripts/db/monitor-stuck-rows.sql
-- Рекомендуемая периодичность: ежедневно (cron). Любая ненулевая аномалия —
--   сигнал на расследование, см. apps/web/BUGS_HISTORY.md и план в этом же
--   репозитории.

\echo === 1. Unacked curator changelog (precision-mismatch indicator) ===
\echo Если >5 unacked, и oldest старше 24h — возможно ack RPC сломался или
\echo precision-mismatch снова появился (см. 2026-05-23 fix).
SELECT count(*) AS unacked,
       coalesce(min(now() - created_at)::text, 'N/A') AS oldest_age,
       coalesce(max(now() - created_at)::text, 'N/A') AS newest_age
FROM client_data_changelog
WHERE acked_at IS NULL;

\echo
\echo === 2. Zombie heys_xp_cache_* в БД (должно быть 0) ===
\echo Если >0 — LOCAL_ONLY_STORAGE_PREFIXES не работает или старый bundle ещё пишет.
SELECT count(*) AS rows,
       coalesce(string_agg(DISTINCT substring(client_id::text, 1, 8), ', '), '—') AS clients
FROM client_kv_store
WHERE k LIKE 'heys_xp_cache_%';

\echo
\echo === 3. Inline-cid suffix outliers (legacy normalize bug indicators) ===
\echo Список ожидаемых ОК-паттернов: heys_last_grams_<productId>, heys_combo_<comboId>,
\echo heys_dismiss_<adviceId>, heys_chain_<adviceId>, heys_milestone_<id>.
\echo Появление нового suffix-pattern → новый архитектурный outlier.
SELECT regexp_replace(k, '_[a-z0-9-]{8,}', '_<id>') AS k_pattern,
       count(*) AS rows
FROM client_kv_store
WHERE k ~ 'heys_[a-z_]+_[0-9a-f]{8}-'
GROUP BY k_pattern
ORDER BY count(*) DESC;

\echo
\echo === 4. Top-10 ключей по объёму ===
\echo Подсказывает где растёт мусор (например _advice_trace_day_v1).
SELECT k,
       count(*) AS rows,
       pg_size_pretty(sum(length(v::text))::bigint) AS total_sz,
       (max(length(v::text)) / 1024)::int AS max_kb
FROM client_kv_store
GROUP BY k
ORDER BY sum(length(v::text)) DESC
LIMIT 10;

\echo
\echo === 5. Profile health-check ===
\echo subscription-only профиль (4 поля без personal) у активного клиента —
\echo индикатор race в refreshProfileSubscription (fix 2026-05-23).
SELECT substring(client_id::text, 1, 8) AS cid,
       length(v::text) AS sz,
       (v ? 'firstName') AS fn,
       (v ? 'weight') AS w,
       (v ? 'profileCompleted') AS done,
       updated_at
FROM client_kv_store
WHERE k = 'heys_profile'
ORDER BY length(v::text) ASC
LIMIT 5;

\echo
\echo === 6. Микросекундные timestamps в активных таблицах (precision-mismatch) ===
\echo Если в client_data_changelog у unacked rows µs != 0 — server-side ack
\echo tolerance справится (1ms intervat), но это индикатор.
SELECT 'unacked with µs' AS metric, count(*)
FROM client_data_changelog
WHERE acked_at IS NULL
  AND extract(microseconds FROM created_at)::int % 1000 != 0;

\echo
\echo === 7. Активность клиентов ===
\echo Если week_active = 0 — это test/dev окружение, фиксы можно тестировать смело.
SELECT count(*) FILTER (WHERE deletion_scheduled_at IS NULL) AS total_active,
       count(*) FILTER (WHERE last_activity_at > now() - interval '7 days') AS week_active,
       count(*) FILTER (WHERE last_activity_at > now() - interval '24 hours') AS day_active
FROM clients;
