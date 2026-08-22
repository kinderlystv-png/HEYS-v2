#!/usr/bin/env node

/**
 * Восстановление личного каталога продуктов одного клиента из бэкапа.
 *
 * Зачем отдельный инструмент, если есть restore-client-backup.js. Каталог живёт
 * в двух ключах: строки в heys_products_overlay_v2 и сторож целостности в
 * heys_products_overlay_v2_rpc_manifest. Общий restore честно кладёт обратно то,
 * что лежало в снимке, и этого достаточно, только если пара внутри снимка
 * согласована. На практике она расходится: приложение обновляет строки чаще, чем
 * манифест, и бэкап это расхождение добросовестно копирует. Клиент такую пару
 * отвергает целиком (codec.assemble → generation_mismatch), причём молча —
 * каталог просто не приезжает из облака.
 *
 * Поэтому здесь манифест не переносится из снимка, а пересчитывается по
 * восстановленным строкам ТЕМ ЖЕ кодеком, что и в приложении
 * (apps/web/heys_overlay_shard_codec_v1.js). Один источник правды — строки.
 *
 * Порядок безопасности:
 *   1. прежнее состояние сохраняется рядом под ключами __before_restore_<стамп>;
 *   2. оба ключа пишутся одной транзакцией — рассогласованного состояния
 *      не возникает даже при обрыве;
 *   3. после записи пара перечитывается из БД и проверяется assemble().
 *      Не сошлось — транзакция откатывается.
 *
 * Usage:
 *   node restore-products-catalog.js --client-id <UUID> --date <YYYY-MM-DD> [--apply]
 *   node restore-products-catalog.js --client-id <UUID> --snapshot-file <path> [--apply]
 *
 * Без --apply идёт разбор без записи (по умолчанию): показывает, сколько строк
 * в снимке, что говорит его манифест и каким будет пересчитанный.
 *
 * --snapshot-file берёт уже скачанный .json.gz вместо похода в Object Storage.
 * Нужен в двух случаях: объект уже на руках (или S3 недоступен), и — главное —
 * им проверяется сама процедура на тестовом клиенте, у которого своего снимка
 * с каталогом нет. Процедуру, которую нельзя прогнать, нельзя и считать рабочей.
 *
 * Env: PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD,
 *      S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET (default heys-backups),
 *      S3_PREFIX (default client-daily)
 */

'use strict';

const { execFileSync } = require('child_process');
const { existsSync, readFileSync, unlinkSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { gunzipSync } = require('zlib');

const OVERLAY_KEY = 'heys_products_overlay_v2';
const MANIFEST_KEY = 'heys_products_overlay_v2_rpc_manifest';
const TAIL_KEY_PREFIX = 'heys_products_overlay_v2_rpc_tail_';

// Кодек приложения — единственный источник правды по формату манифеста.
// Модуль вешает себя на globalThis.HEYS, а не в module.exports.
require('../../apps/web/heys_overlay_shard_codec_v1.js');
const codec = globalThis.HEYS?.OverlayShardCodec;
if (!codec || typeof codec.createSingle !== 'function') {
  throw new Error('OverlayShardCodec не загрузился — проверь путь к apps/web/heys_overlay_shard_codec_v1.js');
}

function parseArgs(argv) {
  const parsed = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--client-id': parsed.clientId = argv[++i]; break;
      case '--date': parsed.date = argv[++i]; break;
      case '--snapshot-file': parsed.snapshotFile = argv[++i]; break;
      case '--apply': parsed.apply = true; break;
      case '--from-live': parsed.fromLive = true; break;
      default:
        throw new Error(`Неизвестный аргумент: ${argv[i]}`);
    }
  }
  if (!parsed.clientId || (!parsed.date && !parsed.snapshotFile && !parsed.fromLive)) {
    throw new Error('Usage: node restore-products-catalog.js --client-id <UUID> (--date <YYYY-MM-DD> | --snapshot-file <path> | --from-live) [--apply]');
  }
  return parsed;
}

function downloadSnapshot(clientId, date) {
  const bucket = process.env.S3_BUCKET || 'heys-backups';
  const prefix = process.env.S3_PREFIX || 'client-daily';
  const key = `${prefix}/${date}/${clientId}.json.gz`;
  const outFile = join(tmpdir(), `heys-restore-${clientId}-${date}.json.gz`);

  execFileSync('yc', ['storage', 's3api', 'get-object', '--bucket', bucket, '--key', key, outFile], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (!existsSync(outFile)) throw new Error(`Снимок не скачался: ${key}`);

  try {
    return JSON.parse(gunzipSync(readFileSync(outFile)).toString('utf8'));
  } finally {
    try { unlinkSync(outFile); } catch { /* временный файл, не критично */ }
  }
}

function extractRows(snapshot) {
  const entry = snapshot?.kvSnapshot?.[OVERLAY_KEY];
  if (!entry) throw new Error(`В снимке нет ключа ${OVERLAY_KEY}`);
  if (entry.v_encrypted_b64) {
    throw new Error(`${OVERLAY_KEY} в снимке зашифрован — этот инструмент работает только с открытыми значениями`);
  }
  if (!Array.isArray(entry.v)) throw new Error(`${OVERLAY_KEY} в снимке не массив`);
  return entry.v;
}

// Соединение нужно и до разбора (--from-live читает строки из базы), и после
// него, поэтому клиент создаётся один раз, а connect() зовётся по месту.
function makeClient() {
  const { Client } = require('pg');
  return new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 6432),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function main() {
  const args = parseArgs(process.argv);

  // --from-live: строки в облаке целы, отстал только сторож. Так выглядит запись
  // не-атомарным писателем (инцидент 2026-08-22: MCP писал строки без манифеста).
  // Восстанавливать из снимка тут НЕЛЬЗЯ — потеряются позиции, добавленные после
  // снимка; источник правды здесь — живые строки.
  const db = makeClient();
  let rows;
  let snapshot = null;
  let snapshotManifest = null;
  if (args.fromLive) {
    await db.connect();
    const live = await db.query(
      `SELECT k, v FROM client_kv_store
        WHERE client_id = $1
          AND (k = ANY($2) OR k LIKE $3)`,
      [args.clientId, [OVERLAY_KEY, MANIFEST_KEY], `${TAIL_KEY_PREFIX}%`],
    );
    const byKey = Object.fromEntries(live.rows.map((r) => [r.k, r.v]));
    const tailKeys = live.rows.map((r) => r.k).filter((k) => k.startsWith(TAIL_KEY_PREFIX));
    if (tailKeys.length > 0) {
      throw new Error(
        `${args.clientId}: в базе есть tail-шарды overlay (${tailKeys.join(', ')}). `
        + '--from-live читает только main+manifest и потеряет хвосты. '
        + 'Сначала собери каталог через codec.assemble() и пиши полный массив строк, '
        + 'либо восстанови из snapshot-file, а не из живой main-only пары.',
      );
    }
    rows = byKey[OVERLAY_KEY];
    if (!Array.isArray(rows)) throw new Error(`${OVERLAY_KEY} в базе не массив или отсутствует`);
    snapshotManifest = byKey[MANIFEST_KEY] ?? null;
  } else {
    snapshot = args.snapshotFile
      ? JSON.parse(gunzipSync(readFileSync(args.snapshotFile)).toString('utf8'))
      : downloadSnapshot(args.clientId, args.date);
    rows = extractRows(snapshot);
    snapshotManifest = snapshot?.kvSnapshot?.[MANIFEST_KEY]?.v ?? null;
  }

  const built = codec.createSingle(rows);
  if (!built.ok) throw new Error(`Манифест не построился: ${built.reason}`);

  console.log(`Клиент:            ${args.clientId}`);
  console.log(`Источник строк:    ${args.fromLive ? 'живая база' : `${args.snapshotFile || args.date} (exportedAt ${snapshot.exportedAt})`}`);
  console.log(`Строк:             ${rows.length}`);
  console.log(`Манифест сейчас:   rowCount=${snapshotManifest?.rowCount ?? '—'}`);
  console.log(`Манифест новый:    rowCount=${built.manifest.rowCount}, generation=${built.generation}`);
  if (snapshotManifest && snapshotManifest.rowCount !== rows.length) {
    console.log('⚠️  Пара рассогласована — именно поэтому манифест пересчитывается, а не переносится.');
  }

  if (!args.apply) {
    console.log('\nРазбор без записи. Для записи повторить с --apply.');
    return;
  }

  if (!args.fromLive) await db.connect();

  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  try {
    await db.query('BEGIN');

    // Прежнее состояние остаётся рядом: откат руками возможен без бэкапа.
    for (const key of [OVERLAY_KEY, MANIFEST_KEY]) {
      await db.query(
        `INSERT INTO client_kv_store (client_id, k, v, updated_at)
         SELECT client_id, $2, v, now() FROM client_kv_store
          WHERE client_id = $1 AND k = $3
         ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
        [args.clientId, `${key}__before_restore_${stamp}`, key],
      );
    }

    // Строки и манифест — одной транзакцией, иначе между записями существует
    // окно, в котором клиент видит рассогласованную пару и молча теряет каталог.
    await db.query(
      `INSERT INTO client_kv_store (client_id, k, v, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
      [args.clientId, OVERLAY_KEY, JSON.stringify(built.shards[0])],
    );
    await db.query(
      `INSERT INTO client_kv_store (client_id, k, v, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
      [args.clientId, MANIFEST_KEY, JSON.stringify(built.manifest)],
    );

    // Проверяем не то, что собирались записать, а то, что реально лежит в БД.
    const check = await db.query(
      `SELECT k, v FROM client_kv_store WHERE client_id = $1 AND k = ANY($2)`,
      [args.clientId, [OVERLAY_KEY, MANIFEST_KEY]],
    );
    const stored = Object.fromEntries(check.rows.map((row) => [row.k, row.v]));
    const verdict = codec.assemble(stored[OVERLAY_KEY], [], stored[MANIFEST_KEY]);
    if (!verdict.ok) {
      await db.query('ROLLBACK');
      throw new Error(`Записанное состояние клиент не примет: ${verdict.status}. Транзакция откачена.`);
    }

    await db.query('COMMIT');
    console.log(`\n✅ Восстановлено ${verdict.rows.length} позиций, assemble → ${verdict.status}.`);
    console.log(`Прежнее состояние: ключи *__before_restore_${stamp}`);
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* соединение уже могло упасть */ }
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
