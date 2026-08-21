/**
 * HEYS Cron Security Alerts — детект подозрительных событий и алерт в Telegram.
 *
 * Юр. контекст: 152-ФЗ ст. 22.3 — оператор обязан уведомить РКН об инциденте
 * с ПДн в течение 24 часов (о факте) и 72 часов (о результатах). Эта функция
 * автоматизирует первичный детект, чтобы автор мог быстро принять решение.
 *
 * Запуск: timer trigger в Yandex Cloud (рекомендация — каждые 15 минут).
 * Cooldown: каждое правило не отправляет алерт повторно в течение 30 минут
 * (хранится в таблице security_alerts_log).
 *
 * Env vars (загружаются deploy-all.sh):
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (обязательны для healthy heartbeat)
 */

const http = require('http');
const https = require('https');

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

const COOLDOWN_MINUTES = 30;
const WINDOW_MINUTES = 60;

async function recordWorkerHeartbeat(client) {
  await client.query(
    `INSERT INTO public.maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
     VALUES ('cron_security_alerts', now(), NULL, interval '45 minutes')
     ON CONFLICT (task) DO UPDATE
       SET last_ok_at = now(), stale_alerted_at = NULL, max_silence = EXCLUDED.max_silence`,
  );
}

// Telegram-токены подтягиваются initSecrets() из Lockbox в process.env —
// читаем напрямую в sendAlert ниже.

// ── Concurrency watch (rolled out 2026-05-22) ─────────────────────────────
// 5 API-функций работают с instanceConcurrency из serverless-capacity-policy.cjs
// (на 2026-08-03 — 4). Этот блок проверяет память экземпляра через YC Monitoring
// API. Если приближается к лимиту → Telegram-алерт: OOM = верный признак, что
// текущий concurrency не вытягивает и его надо снижать.
//
// ⚠️ Изначально пытался читать логи через Cloud Logging Reader API, но он
// gRPC-only без HTTP/JSON gateway → "socket hang up". Перевёл на Monitoring
// API metric (HTTP) с порогом по памяти.
//
// ⚠️ Инвариант (2026-08-03): serverless.functions.used_memory_bytes — ГИСТОГРАММА,
// а не gauge. Живая проверка API: ответ 200, 128 рядов, у каждого метка `bin`
// (верхняя граница корзины в БАЙТАХ), а значение ряда — счётчик попаданий за
// интервал. Старый код читал эти счётчики как байты, из-за чего максимум по всем
// точкам выходил 0.75 → peak 0.0MB по всем пяти функциям в прод-логах, и порог
// не мог быть превышен ни при какой нагрузке. Как читать правильно — см.
// histogramPeak() и meanMemoryPeak() ниже.
const API_FUNCTIONS = [
  { name: 'heys-api-rpc', memory_mb: 512 },
  { name: 'heys-api-rest', memory_mb: 512 },
  { name: 'heys-api-auth', memory_mb: 256 },
  { name: 'heys-api-leads', memory_mb: 256 },
  { name: 'heys-api-push', memory_mb: 256 },
];
// Порог пересмотрен 2026-08-03 по живым замерам (окно 24ч, per-invocation память):
//   heys-api-rpc   512МиБ: p50 121.7 / p95 132.1 / max 139.2 МиБ → 27.2% лимита
//   heys-api-rest  512МиБ: p50 119.7 / p95 129.8 / max 136.4 МиБ → 26.6%
//   heys-api-auth  256МиБ: p50 110.6 / p95 116.4 / max 116.5 МиБ → 45.5%
//   heys-api-leads 256МиБ: p50 105.7 / p95 113.9 / max 113.9 МиБ → 44.5%
//   heys-api-push  256МиБ: вызовов за сутки не было → no_data
// 0.75 оставляет ≥1.65x запаса над худшим наблюдённым значением (45.5%), то есть
// сегодня не шумит, и при этом предупреждает, пока до OOM ещё ~64 МиБ на 256-МиБ
// функции. Прежние 0.9 давали бы всего ~26 МиБ форы — для Node это уже GC-трэшинг.
// Ступень гистограммы (см. histogramPeak) для обоих размеров лимита срабатывает
// на 93.1%, то есть ловится и коротким всплеском, и порогом.
const MEMORY_WARN_THRESHOLD_RATIO = 0.75;
const MONITORING_API_HOST = 'monitoring.api.cloud.yandex.net';
const FOLDER_ID = 'b1gnv1a4q8i6de6atl6n';

// Правила детектирования. Каждое — SQL-запрос, возвращающий 0 или 1+ строк.
// Если есть строки → правило сработало.
const RULES = [
  {
    key: 'brute_force_ip',
    label: '🔴 Brute force по PIN с одного IP',
    description:
      'Более 10 неудачных PIN-попыток с одного IP за последний час. ' +
      'Подозрение на перебор паролей.',
    sql: `
      SELECT
        host(ip_address) AS ip_address,
        COUNT(*)::int AS failed_count,
        COUNT(DISTINCT phone)::int AS distinct_phones
      FROM security_events
      WHERE event_type = 'pin_failed'
        AND ip_address IS NOT NULL
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      GROUP BY ip_address
      HAVING COUNT(*) > 10
      ORDER BY failed_count DESC
      LIMIT 5
    `,
  },
  {
    key: 'coordinated_locks',
    label: '🔴 Массовые блокировки PIN-аккаунтов',
    description:
      'Более 3 разных клиентов получили блокировку аккаунта за последний час. ' +
      'Возможна координированная атака.',
    sql: `
      SELECT
        COUNT(DISTINCT COALESCE(client_id::text, phone))::int AS locked_distinct
      FROM security_events
      WHERE event_type = 'pin_locked'
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      HAVING COUNT(DISTINCT COALESCE(client_id::text, phone)) > 3
    `,
  },
  {
    key: 'mass_account_deletion',
    label: '⚠️ Массовое удаление аккаунтов',
    description:
      'Более 2 аккаунтов удалено за последний час. Проверьте, легитимные ли действия.',
    sql: `
      SELECT COUNT(*)::int AS deleted_count
      FROM security_events
      WHERE event_type = 'account_deleted'
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      HAVING COUNT(*) > 2
    `,
  },
  // P1-L (2026-05-22): DSAR SLA-tracker — 152-ФЗ ст.21 ч.4, 10 рабочих дней.
  // Игнорируем $1 (WINDOW_MINUTES) — здесь окно не имеет смысла, проверяем
  // абсолютный дедлайн. Cooldown берёт на себя isOnCooldown по rule_key.
  {
    key: 'dsar_sla_warning',
    label: '🟡 DSAR-запрос: 2 дня до дедлайна',
    description:
      'Есть необработанные запросы субъектов ПДн с дедлайном через ≤2 дня. ' +
      '152-ФЗ ст.21 ч.4 — рассмотреть в 10 рабочих дней. Просрочка = риск штрафа.',
    sql: `
      SELECT $1::text AS _window_unused,
        id::text AS request_id,
        request_type,
        source,
        COALESCE(client_id::text, 'no-client') AS client_id,
        requested_at,
        sla_deadline,
        EXTRACT(EPOCH FROM (sla_deadline - now()))/86400 AS days_left
      FROM data_subject_requests
      WHERE processed_at IS NULL
        AND sla_deadline > now()
        AND sla_deadline <= now() + INTERVAL '2 days'
      ORDER BY sla_deadline
      LIMIT 10
    `,
  },
  {
    key: 'dsar_sla_breach',
    label: '🔴 DSAR-запрос: дедлайн ПРОСРОЧЕН',
    description:
      'Запрос субъекта ПДн НЕ обработан в срок 10 рабочих дней (152-ФЗ ст.21 ч.4). ' +
      'Срочно: обработать + быть готовым ответить РКН при жалобе.',
    sql: `
      SELECT $1::text AS _window_unused,
        id::text AS request_id,
        request_type,
        source,
        COALESCE(client_id::text, 'no-client') AS client_id,
        requested_at,
        sla_deadline,
        EXTRACT(EPOCH FROM (now() - sla_deadline))/86400 AS days_overdue
      FROM data_subject_requests
      WHERE processed_at IS NULL
        AND sla_deadline < now()
      ORDER BY sla_deadline
      LIMIT 10
    `,
  },
  // SEC-021 (2026-06-14): backup-chain watchdog. Существующее alerting в
  // heys-client-daily-backup срабатывает ТОЛЬКО когда функция запустилась
  // (partial failure). Если функция вообще не запускается (как в инциденте
  // 2026-04-14 → 2026-05-10, 27-дневная дыра, root-cause = accidentally
  // deleted version) — silence. Это правило ловит SILENT FAILURE.
  //
  // 2026-06-15 fix: было `count(ok) < 5 за 7 дней`. Это давало гарантированный
  // false-positive storm первые ~5 дней после деплоя инструментации
  // (backup_run_log создан 2026-06-14, копится по 1 успешному run'у в сутки →
  // порог в 5 недостижим до ~2026-06-19). Перешли на GAP-based: алертим, если
  // последний успешный (ok/partial) run старше 30ч — это прямой признак
  // «cron отработал, а бэкапа нет / функция молчит» и не зависит от истории.
  // Daily cron = 24h; 30h = терпим до 6ч джиттера/задержки, но ловим полностью
  // пропущенный суточный слот в течение ~6ч. Пустая таблица (run'ов вообще не
  // было) → COALESCE к 2000 → тоже алерт.
  {
    key: 'backup_chain_gap',
    label: '🔴 Backup-chain прерван',
    description:
      'За >30ч не зафиксировано ни одного успешного backup-run\'а в backup_run_log. ' +
      'Возможно heys-client-daily-backup функция не запускается (silent failure). Проверь: ' +
      '(1) yc serverless function version list --function-id <id> — есть ли версия с тегом $latest; ' +
      '(2) yc serverless trigger get heys-client-daily-backup-timer — ACTIVE; ' +
      '(3) s3://heys-backups/client-daily/<сегодня>/ — есть ли свежие снапшоты; ' +
      '(4) Cloud Functions web-console logs за последние сутки.',
    sql: `
      SELECT
        $1::text AS _window_unused,
        COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count_7d,
        COUNT(*) FILTER (WHERE status = 'partial')::int AS partial_count_7d,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count_7d,
        MAX(run_at) FILTER (WHERE status IN ('ok','partial')) AS last_ok_run_at,
        EXTRACT(EPOCH FROM (
          now() - COALESCE(MAX(run_at) FILTER (WHERE status IN ('ok','partial')), '2000-01-01'::timestamptz)
        ))/3600 AS hours_since_last_ok
      FROM backup_run_log
      WHERE run_at > NOW() - INTERVAL '14 days'
      HAVING COALESCE(MAX(run_at) FILTER (WHERE status IN ('ok','partial')), '2000-01-01'::timestamptz)
             < NOW() - INTERVAL '30 hours'
    `,
  },
  {
    key: 'cross_client_write_blocked',
    cooldownMinutes: 0,
    label: '🛡️ Cross-client запись заблокирована',
    description:
      'Защитный контур отклонил запись данных одного клиента в состояние другого. ' +
      'События доставляются из DB-backed audit с retry до подтверждённого Telegram success.',
    sql: `
      WITH delivered AS (
        SELECT $1::text AS _window_unused,
               COALESCE(MAX((payload->>'max_audit_id')::bigint), 0) AS max_audit_id
          FROM security_alerts_log
         WHERE rule_key = 'cross_client_write_blocked'
           AND telegram_sent_at IS NOT NULL
           AND payload ? 'max_audit_id'
      )
      SELECT audit.id::bigint AS audit_id,
             left(audit.client_id::text, 8) AS client,
             audit.key,
             audit.action,
             audit.reason,
             audit.created_at
        FROM data_loss_audit audit
        CROSS JOIN delivered
       WHERE audit.id > delivered.max_audit_id
         AND audit.allowed = FALSE
         AND audit.action IN (
           'cross_client_dayv2_content_dup',
           'cross_client_profile_blocked',
           'cross_client_blob_blocked'
         )
       ORDER BY audit.id
       LIMIT 50
    `,
  },
];

async function isOnCooldown(client, ruleKey, cooldownMinutes = COOLDOWN_MINUTES) {
  if (cooldownMinutes <= 0) return false;
  const res = await client.query(
    `SELECT 1
       FROM security_alerts_log
      WHERE rule_key = $1
        AND telegram_sent_at IS NOT NULL
        AND telegram_sent_at > NOW() - ($2 || ' minutes')::INTERVAL
      LIMIT 1`,
    [ruleKey, cooldownMinutes],
  );
  return res.rows.length > 0;
}

async function recordAlert(client, ruleKey, payload, sent, messageId) {
  await client.query(
    `INSERT INTO security_alerts_log
       (rule_key, triggered_count, payload, telegram_sent_at, telegram_message_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      ruleKey,
      Number(payload.count || 0),
      payload,
      sent ? new Date() : null,
      messageId || null,
    ],
  );
}

function buildAlertPayload(rows, telegramReason) {
  const payload = {
    count: rows.length,
    sample: rows.slice(0, 5),
    telegram_reason: telegramReason,
  };
  const auditIds = rows.map((row) => Number(row.audit_id)).filter(Number.isSafeInteger);
  if (auditIds.length > 0) payload.max_audit_id = Math.max(...auditIds);
  return payload;
}

function evaluateMonitorResults(results) {
  const errorStatuses = new Set(['query_error', 'check_error', 'logged_only']);
  const errors = results.filter((result) => errorStatuses.has(result.status));
  return { healthy: errors.length === 0, errors };
}

async function syncTelegramDeliveryIncident(client, results) {
  const failures = results.filter((result) => result.status === 'logged_only');
  if (failures.length === 0) {
    await client.query(
      `SELECT public.resolve_ops_incident('heys-cron-security-alerts', 'telegram_delivery_failed')`,
    );
    return;
  }
  await client.query(
    `SELECT public.record_ops_incident(
       'heys-cron-security-alerts',
       'telegram_delivery_failed',
       'critical',
       'Security alert Telegram delivery failed',
       $1::jsonb
     )`,
    [JSON.stringify({ rules: failures.map((item) => item.rule), count: failures.length })],
  );
}

// ── YC Cloud Logging helpers (для concurrency-watch) ──────────────────────

function fetchJson(transport, options, body) {
  return new Promise((resolve, reject) => {
    // Precompute body + set Content-Length, иначе YC API закрывает соединение
    // ("socket hang up") при chunked-encoded POST'ах от Node.js.
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = transport.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error(`Invalid JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Request timeout')));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getIamTokenForLogging() {
  // YC metadata server — HTTP port 80, header Metadata-Flavor: Google
  const meta = await new Promise((resolve, reject) => {
    const req = http.get({
      host: '169.254.169.254',
      port: 80,
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Metadata timeout')));
  });
  if (!meta || !meta.access_token) throw new Error('No access_token from metadata');
  return meta.access_token;
}

function parseBinEdge(bin) {
  if (bin === undefined || bin === null) return null;
  if (bin === 'inf' || bin === '+inf') return Infinity;
  const edge = Number(bin);
  return Number.isFinite(edge) ? edge : null;
}

// Гистограмма serverless.functions.used_memory_bytes → доказанные границы пика
// памяти на один вызов. Метка `bin` — ВЕРХНЯЯ граница корзины в байтах, значение
// ряда — счётчик попаданий, а не байты.
//
// Что `bin` именно верхняя граница, проверено на живом API 2026-08-03: средняя
// память на вызов у heys-api-rpc ~120 МБ, и весь счёт лежит в корзине
// bin=250000000 (238.4 МиБ). При нижней границе то же наблюдение означало бы
// «все вызовы ≥238 МиБ», что противоречит средней.
//
// Отсюда: непустая корзина доказывает, что хотя бы один вызов взял БОЛЬШЕ, чем
// нижняя граница этой корзины (= предыдущая ступень лестницы). Её и отдаём как
// floorBytes — консервативная, но настоящая оценка пика в байтах. Разрешение
// лестницы в рабочей зоне: 95.4 → 238.4 → 476.8 → 953.7 МиБ, поэтому для 256-МиБ
// функции переход в корзину 5e8 даёт floor 238.4 МиБ (93.1% лимита), а для
// 512-МиБ функции переход в корзину 1e9 даёт floor 476.8 МиБ (те же 93.1%).
function histogramPeak(resp) {
  const counts = new Map();
  for (const metric of (resp && resp.metrics) || []) {
    const edge = parseBinEdge(metric.labels && metric.labels.bin);
    if (edge === null) continue;
    let total = counts.get(edge) || 0;
    for (const raw of (metric.timeseries && metric.timeseries.doubleValues) || []) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) total += value;
    }
    counts.set(edge, total);
  }

  const edges = [...counts.keys()].sort((a, b) => a - b);
  let topIndex = -1;
  let observations = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const count = counts.get(edges[i]) || 0;
    observations += count;
    if (count > 0) topIndex = i;
  }
  if (topIndex < 0) return { floorBytes: 0, ceilBytes: 0, observations: 0, bins: edges.length };
  return {
    floorBytes: topIndex > 0 ? edges[topIndex - 1] : 0,
    ceilBytes: edges[topIndex],
    observations,
    bins: edges.length,
  };
}

function sumSeriesByTimestamp(resp) {
  const acc = new Map();
  for (const metric of (resp && resp.metrics) || []) {
    const timestamps = (metric.timeseries && metric.timeseries.timestamps) || [];
    const values = (metric.timeseries && metric.timeseries.doubleValues) || [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const value = Number(values[i]);
      if (!Number.isFinite(value)) continue;
      acc.set(timestamps[i], (acc.get(timestamps[i]) || 0) + value);
    }
  }
  return acc;
}

// _sum / _count той же гистограммы — это те же наблюдения в виде rate-рядов.
// Их отношение В ОДНОЙ ТОЧКЕ = средняя память на вызов в байтах (точное число,
// в отличие от корзин). Делим поточечно и берём максимум по окну: MAX по каждому
// ряду отдельно дал бы несогласованную пару «максимум суммы / максимум счётчика».
// Ряды разных версий функции складываем — получается взвешенное среднее.
function meanMemoryPeak(sumResp, countResp) {
  const sums = sumSeriesByTimestamp(sumResp);
  const counts = sumSeriesByTimestamp(countResp);
  let peakBytes = 0;
  let points = 0;
  for (const [timestamp, sum] of sums) {
    const count = counts.get(timestamp);
    if (!count || count <= 0) continue;
    points += 1;
    const mean = sum / count;
    if (mean > peakBytes) peakBytes = mean;
  }
  return { peakBytes, points };
}

async function readPeakMemory(functionName, sinceMinutes, iamToken) {
  // Возвращает { peakBytes, points, meanPeakBytes, floorBytes, ceilBytes }.
  // points === 0 значит «ответ пришёл, но точек в окне нет» — это НЕ
  // доказательство здоровья (функция могла просто не вызываться), поэтому
  // счётчик отдаём наверх для отчёта.
  //
  // peakBytes = max(точное среднее на вызов, доказанный низ верхней корзины):
  // первое ловит ползучую утечку, второе — короткий всплеск, который среднее
  // размывает. Обе величины — настоящие байты.
  const now = new Date();
  const since = new Date(now.getTime() - sinceMinutes * 60 * 1000);
  const selector = `{service="serverless-functions", function="${functionName}"}`;
  const readMetric = (metric) => fetchJson(https, {
    method: 'POST',
    hostname: MONITORING_API_HOST,
    path: `/monitoring/v2/data/read?folderId=${FOLDER_ID}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${iamToken}`,
    },
  }, {
    query: `"${metric}"${selector}`,
    fromTime: since.toISOString(),
    toTime: now.toISOString(),
    downsampling: { maxPoints: 100, aggregation: 'AVG' },
  });

  // Параллельно: три последовательных запроса на функцию упёрлись бы в 60s
  // таймаут самой cron-функции при пяти целях и 5s таймауте на запрос.
  const [histResp, sumResp, countResp] = await Promise.all([
    readMetric('serverless.functions.used_memory_bytes'),
    readMetric('serverless.functions.used_memory_bytes_sum'),
    readMetric('serverless.functions.used_memory_bytes_count'),
  ]);

  const histogram = histogramPeak(histResp);
  const mean = meanMemoryPeak(sumResp, countResp);
  return {
    peakBytes: Math.max(mean.peakBytes, histogram.floorBytes),
    points: mean.points + (histogram.observations > 0 ? 1 : 0),
    meanPeakBytes: mean.peakBytes,
    floorBytes: histogram.floorBytes,
    ceilBytes: histogram.ceilBytes,
  };
}

// Возвращает { issues, unreadable, noData, error }.
//
// ⚠️ Инвариант (2026-08-03): «не смог посмотреть» ≠ «посмотрел, чисто».
// Раньше потеря IAM-токена или 403 от Monitoring API просто логировались, а
// наружу уходил пустой список → правило concurrency_watch рапортовало `clean`,
// функция отдавала 200 и штамповала heartbeat. Слепой мониторинг выглядел
// зелёным сколько угодно долго. Теперь каждая непрочитанная функция попадает в
// `unreadable`, и вызывающий обязан отчитаться об этом как об ошибке проверки.
//
// Зависимости инжектируемы, чтобы слепоту можно было проверить тестом без сети.
async function checkConcurrencyIssues({
  getToken = getIamTokenForLogging,
  readMemory = readPeakMemory,
} = {}) {
  let iamToken;
  try { iamToken = await getToken(); }
  catch (err) {
    console.error('[concurrency-watch] failed to get IAM token:', err.message);
    // Без токена не прочитана НИ одна функция — весь список слепой.
    return {
      issues: [],
      unreadable: API_FUNCTIONS.map((fn) => fn.name),
      noData: [],
      error: `IAM token unavailable: ${err.message}`,
    };
  }

  const issues = [];
  const unreadable = [];
  const noData = [];
  let lastError = null;
  for (const fn of API_FUNCTIONS) {
    try {
      const {
        peakBytes,
        points,
        meanPeakBytes = 0,
        floorBytes = 0,
        ceilBytes = 0,
      } = await readMemory(fn.name, WINDOW_MINUTES, iamToken);
      const limitMB = fn.memory_mb;
      const toMB = (bytes) => bytes / 1024 / 1024;
      const peakMB = toMB(peakBytes);
      const ratio = peakMB / limitMB;
      // Верх корзины показываем обрезанным по лимиту: больше выделенной памяти
      // экземпляр физически не возьмёт, а лестница корзин грубее лимита.
      const ceilMB = ceilBytes ? Math.min(toMB(ceilBytes), limitMB) : 0;
      console.log(
        `[concurrency-watch] ${fn.name}: peak ${peakMB.toFixed(1)}MB / ${limitMB}MB (${(ratio * 100).toFixed(1)}%), ` +
        `mean ${toMB(meanPeakBytes).toFixed(1)}MB, histogram ${toMB(floorBytes).toFixed(1)}..${ceilMB.toFixed(1)}MB, points=${points}`,
      );
      if (!points) noData.push(fn.name);
      if (ratio >= MEMORY_WARN_THRESHOLD_RATIO) {
        issues.push({
          function: fn.name,
          peak_mb: Math.round(peakMB),
          limit_mb: limitMB,
          ratio_pct: Math.round(ratio * 100),
          mean_mb: Math.round(toMB(meanPeakBytes)),
          hist_floor_mb: Math.round(toMB(floorBytes)),
          hist_ceil_mb: Math.round(ceilMB),
        });
      }
    } catch (err) {
      console.error(`[concurrency-watch] metric read failed for ${fn.name}:`, err.message);
      unreadable.push(fn.name);
      lastError = err.message;
    }
  }
  return {
    issues,
    unreadable,
    noData,
    error: lastError ? `metric read failed: ${lastError}` : null,
  };
}

// Отдельная чистая функция: превращает слепоту в явный check_error-результат.
function concurrencyWatchBlindResult(watch) {
  const unreadable = (watch && watch.unreadable) || [];
  if (!unreadable.length) return null;
  return {
    rule: 'concurrency_watch',
    status: 'check_error',
    unreadable,
    error: `memory metrics unavailable for ${unreadable.join(', ')}: ${watch.error || 'unknown reason'}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 Схлопывание личного каталога продуктов
// ═══════════════════════════════════════════════════════════════════════════
// 21.08.2026 каталог клиента в облаке заменился одной позицией вместо 146, и
// узнали об этом через часы — вручную (apps/web/BUGS_HISTORY.md). Сам дефект
// закрыт инвариантом 11, но публикация каталога — это всегда перезапись целиком,
// поэтому любая будущая ошибка того же класса снова сотрёт всё молча.
//
// Что считаем сигналом. Каждое удаление продукта человеком — отдельная
// публикация, и она уменьшает каталог на единицу. Поломка же приходит одним
// шагом и забирает почти всё сразу. Поэтому сторож смотрит не на «стало
// меньше», а на РЕЗКОСТЬ одного шага, и требует совпадения двух условий:
//   • каталог упал не меньше чем вдвое (доля от предыдущего значения);
//   • и потеряно не меньше 10 позиций (абсолютный порог).
// Второе условие снимает шум на маленьких каталогах: 7 → 3 это доля 0,43, но
// потеря всего четырёх позиций, и будить владельца тут не за чем.
// Каталоги меньше MIN_WATCHED_ROWS не сторожим вовсе: у нового человека
// каталог законно скачет с нуля.
//
// Инцидент этими порогами ловится с запасом: 146 → 1 это доля 0,007 при потере
// 145. Разовая чистка на десяток позиций (146 → 136) молчит, и даже заметная
// уборка на четверть каталога (146 → 110) молчит тоже.
const CATALOG_MANIFEST_KEY = 'heys_products_overlay_v2_rpc_manifest';
const CATALOG_MIN_WATCHED_ROWS = 20;
const CATALOG_MAX_SHRINK_RATIO = 0.5;
const CATALOG_MIN_ABSOLUTE_DROP = 10;
const CATALOG_COOLDOWN_MINUTES = 180;

// Чистое решение по одной строке: никаких обращений к БД, чтобы пороги
// проверялись симуляцией, а не «посмотри в проде».
function evaluateCatalogShrink(entry) {
  // Через Number() нельзя: Number(null) это 0, и «снимка ещё нет» неотличимо от
  // «каталог пуст» — отсутствие базы проскочило бы дальше как настоящее число.
  const toCount = (value) => (value === null || value === undefined ? NaN : Number(value));
  const current = toCount(entry?.current_rows);
  const previous = toCount(entry?.previous_rows);

  // Клиента видим впервые — сравнивать не с чем, это не сигнал.
  if (!Number.isFinite(previous)) return { alert: false, reason: 'no_baseline' };
  if (!Number.isFinite(current)) return { alert: false, reason: 'no_current' };
  if (previous < CATALOG_MIN_WATCHED_ROWS) return { alert: false, reason: 'catalog_too_small' };
  if (current >= previous) return { alert: false, reason: 'not_shrunk' };

  const dropped = previous - current;
  const ratio = current / previous;
  if (dropped < CATALOG_MIN_ABSOLUTE_DROP) return { alert: false, reason: 'drop_too_small' };
  if (ratio > CATALOG_MAX_SHRINK_RATIO) return { alert: false, reason: 'drop_too_gradual' };

  return { alert: true, reason: 'sharp_shrink', dropped, ratio };
}

async function checkCatalogShrink(client) {
  const res = await client.query(
    `SELECT
       kv.client_id,
       (kv.v->>'rowCount')::int AS current_rows,
       watch.row_count           AS previous_rows,
       watch.peak_count          AS peak_rows,
       kv.updated_at             AS catalog_updated_at
     FROM client_kv_store AS kv
     LEFT JOIN products_catalog_watch AS watch ON watch.client_id = kv.client_id
     WHERE kv.k = $1
       AND kv.v ? 'rowCount'
       AND jsonb_typeof(kv.v->'rowCount') = 'number'`,
    [CATALOG_MANIFEST_KEY],
  );

  const incidents = [];
  for (const row of res.rows || []) {
    const verdict = evaluateCatalogShrink(row);
    if (verdict.alert) {
      incidents.push({
        client_id: row.client_id,
        was: Number(row.previous_rows),
        now: Number(row.current_rows),
        peak: Number(row.peak_rows ?? row.previous_rows),
        lost: verdict.dropped,
        catalog_updated_at: row.catalog_updated_at,
      });
    }

    // Снимок двигаем всегда, в том числе после алерта: иначе один инцидент
    // повторялся бы в каждом прогоне, пока человек не восстановит каталог.
    await client.query(
      `INSERT INTO products_catalog_watch (client_id, row_count, peak_count, observed_at)
       VALUES ($1, $2, $2, now())
       ON CONFLICT (client_id) DO UPDATE
         SET row_count  = EXCLUDED.row_count,
             peak_count = GREATEST(products_catalog_watch.peak_count, EXCLUDED.row_count),
             observed_at = now()`,
      [row.client_id, Number(row.current_rows)],
    );
  }

  return incidents;
}

async function sendTelegram(rule, rows) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { sent: false, messageId: null, reason: 'telegram not configured' };
  }

  const linesPreview = rows
    .slice(0, 5)
    .map((row) => '`' + JSON.stringify(row).slice(0, 180) + '`')
    .join('\n');

  const text =
    `${rule.label}\n\n` +
    `${rule.description}\n\n` +
    `Окно анализа: ${WINDOW_MINUTES} мин\n` +
    `Триггер-строк: ${rows.length}\n\n` +
    linesPreview +
    `\n\n_Правило: ${rule.key}_\n` +
    `_152-ФЗ ст. 22.3 — при подтверждении уведомить РКН в 24ч._`;

  const sendOnce = async (parseMode) => {
    const body = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  try {
    let attempt = await sendOnce('Markdown');
    if (!attempt.data.ok && attempt.resp.status === 400) {
      console.warn('[security-alerts] Telegram Markdown rejected; retrying plain text');
      attempt = await sendOnce(null);
    }
    if (!attempt.resp.ok || !attempt.data.ok) {
      console.error('[security-alerts] Telegram API error:', attempt.data);
      return { sent: false, messageId: null, reason: attempt.data.description || `HTTP ${attempt.resp.status}` };
    }
    return {
      sent: true,
      messageId: attempt.data.result?.message_id ? String(attempt.data.result.message_id) : null,
      reason: null,
    };
  } catch (error) {
    console.error('[security-alerts] Telegram fetch failed:', error.message);
    return { sent: false, messageId: null, reason: error.message };
  }
}

module.exports.handler = async function () {
  await initSecrets();

  const pool = getPool();
  const client = await pool.connect();
  const results = [];

  try {
    for (const rule of RULES) {
      let rows = [];
      try {
        const queryRes = await client.query(rule.sql, [WINDOW_MINUTES]);
        rows = queryRes.rows || [];
      } catch (err) {
        console.error(`[security-alerts] Rule ${rule.key} query failed:`, err.message);
        results.push({ rule: rule.key, status: 'query_error', error: err.message });
        continue;
      }

      if (!rows.length) {
        results.push({ rule: rule.key, status: 'clean' });
        continue;
      }

      if (await isOnCooldown(client, rule.key, rule.cooldownMinutes)) {
        results.push({ rule: rule.key, status: 'cooldown', triggered: rows.length });
        continue;
      }

      const telegram = await sendTelegram(rule, rows);
      const payload = buildAlertPayload(rows, telegram.reason);
      await recordAlert(client, rule.key, payload, telegram.sent, telegram.messageId);

      results.push({
        rule: rule.key,
        status: telegram.sent ? 'alert_sent' : 'logged_only',
        triggered: rows.length,
      });
    }

    // ── Concurrency watch ─────────────────────────────────────────────
    try {
      const watch = await checkConcurrencyIssues();
      const blind = concurrencyWatchBlindResult(watch);
      // Слепота репортится всегда и отдельно: даже если по прочитанным функциям
      // проблем нет, `clean` в этом прогоне выставлять нельзя.
      if (blind) results.push(blind);

      const issues = watch.issues;
      if (!issues.length) {
        if (!blind) {
          const cleanResult = { rule: 'concurrency_watch', status: 'clean' };
          if (watch.noData.length) cleanResult.no_data = watch.noData;
          results.push(cleanResult);
        }
      } else if (await isOnCooldown(client, 'concurrency_watch')) {
        results.push({ rule: 'concurrency_watch', status: 'cooldown', triggered: issues.length });
      } else {
        const concurrencyRule = {
          key: 'concurrency_watch',
          label: '⚠️ Память API-функции близка к лимиту',
          description:
            `Память экземпляра одной из 5 API-функций дошла до ${Math.round(MEMORY_WARN_THRESHOLD_RATIO * 100)}% ` +
            'выделенного лимита — это предвестник OOM. peak_mb — большая из двух оценок: ' +
            'точное среднее на вызов (mean_mb) и доказанный низ верхней корзины гистограммы ' +
            '(hist_floor_mb..hist_ceil_mb). Что делать: снизить instanceConcurrency в ' +
            'serverless-capacity-policy.cjs либо поднять лимит памяти в deploy-all.sh.',
        };
        const telegram = await sendTelegram(concurrencyRule, issues);
        await recordAlert(
          client,
          'concurrency_watch',
          { count: issues.length, sample: issues, telegram_reason: telegram.reason },
          telegram.sent,
          telegram.messageId,
        );
        results.push({
          rule: 'concurrency_watch',
          status: telegram.sent ? 'alert_sent' : 'logged_only',
          triggered: issues.length,
        });
      }
    } catch (err) {
      console.error('[security-alerts] concurrency_watch error:', err.message);
      results.push({ rule: 'concurrency_watch', status: 'check_error', error: err.message });
    }

    // ── Схлопывание каталога продуктов ────────────────────────────────
    try {
      const incidents = await checkCatalogShrink(client);
      if (!incidents.length) {
        results.push({ rule: 'products_catalog_shrink', status: 'clean' });
      } else {
        // Cooldown отдельный на каждого клиента: инцидент у одного не должен
        // затыкать алерт по другому.
        for (const incident of incidents) {
          const ruleKey = `products_catalog_shrink:${incident.client_id}`;
          if (await isOnCooldown(client, ruleKey, CATALOG_COOLDOWN_MINUTES)) {
            results.push({ rule: ruleKey, status: 'cooldown', triggered: 1 });
            continue;
          }
          const catalogRule = {
            key: ruleKey,
            label: '🔴 Личный каталог продуктов схлопнулся',
            description:
              `У клиента каталог упал с ${incident.was} до ${incident.now} позиций ` +
              `(потеряно ${incident.lost}, исторический максимум ${incident.peak}). ` +
              'Публикация каталога — перезапись целиком, поэтому это либо намеренная ' +
              'массовая чистка, либо повтор инцидента 21.08. Что делать: спросить ' +
              'человека; если чистки не было — восстанавливать из легаси-зеркала ' +
              'heys_products или из бэкапа по DISASTER_RECOVERY_RUNBOOK.md, ' +
              'манифест целостности пересчитывать тем же кодеком, что и приложение.',
          };
          const telegram = await sendTelegram(catalogRule, [incident]);
          await recordAlert(
            client,
            ruleKey,
            { count: 1, sample: [incident], telegram_reason: telegram.reason },
            telegram.sent,
            telegram.messageId,
          );
          results.push({
            rule: ruleKey,
            status: telegram.sent ? 'alert_sent' : 'logged_only',
            triggered: 1,
          });
        }
      }
    } catch (err) {
      console.error('[security-alerts] products_catalog_shrink error:', err.message);
      results.push({ rule: 'products_catalog_shrink', status: 'check_error', error: err.message });
    }

    try {
      await syncTelegramDeliveryIncident(client, results);
    } catch (error) {
      console.error('[security-alerts] delivery incident sync failed:', error.message);
      results.push({ rule: 'telegram_delivery', status: 'check_error', error: error.message });
    }

    const monitorState = evaluateMonitorResults(results);
    if (monitorState.healthy) await recordWorkerHeartbeat(client);

    return {
      statusCode: monitorState.healthy ? 200 : 500,
      body: JSON.stringify({
        success: monitorState.healthy,
        checked_rules: RULES.length + 1,
        results,
        window_minutes: WINDOW_MINUTES,
      }),
    };
  } catch (error) {
    console.error('[security-alerts] Fatal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  } finally {
    client.release();
  }
};

module.exports.__test = {
  API_FUNCTIONS,
  CATALOG_MAX_SHRINK_RATIO,
  CATALOG_MIN_ABSOLUTE_DROP,
  CATALOG_MIN_WATCHED_ROWS,
  MEMORY_WARN_THRESHOLD_RATIO,
  buildAlertPayload,
  checkCatalogShrink,
  evaluateCatalogShrink,
  checkConcurrencyIssues,
  concurrencyWatchBlindResult,
  evaluateMonitorResults,
  histogramPeak,
  meanMemoryPeak,
  readPeakMemory,
  crossClientRule: RULES.find((rule) => rule.key === 'cross_client_write_blocked'),
  sendTelegram,
  syncTelegramDeliveryIncident,
};
