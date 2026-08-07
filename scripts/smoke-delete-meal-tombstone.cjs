#!/usr/bin/env node
'use strict';

/**
 * Production smoke: heys/727a4b tombstone guard.
 * delete meal → wait → stale client merge_save must NOT resurrect meal.
 * Usage: node scripts/smoke-delete-meal-tombstone.mjs [--wait-ms=65000] [--date=YYYY-MM-DD]
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const day = require('../yandex-cloud-functions/heys-mcp/lib/day');
const { createApiClient } = require('../yandex-cloud-functions/heys-mcp/lib/heys-api');

const API_URL = 'https://api.heyslab.ru';
const DEFAULT_CLIENT = '22222222-2222-2222-2222-222222222222';

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const out = { waitMs: 65000, date: day.nowParts().date, skipDelete: false, snapshotIn: null };
  for (const arg of argv) {
    if (arg.startsWith('--wait-ms=')) out.waitMs = Number(arg.slice('--wait-ms='.length));
    if (arg.startsWith('--date=')) out.date = arg.slice('--date='.length);
    if (arg === '--skip-delete') out.skipDelete = true;
    if (arg.startsWith('--snapshot-in=')) out.snapshotIn = arg.slice('--snapshot-in='.length);
  }
  return out;
}

function fail(msg, extra) {
  console.error(`FAIL: ${msg}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

async function main() {
  const { waitMs, date, skipDelete, snapshotIn } = parseArgs(process.argv.slice(2));
  const env = { ...loadEnv(path.join(ROOT, '.env.local')), ...process.env };
  const phone = env.HEYS_TEST_PHONE_E2E_POPL || '70000000002';
  const pin = process.env.SMOKE_E2E_PIN || env.HEYS_TEST_PIN_E2E_POPL || '2468';
  const clientId = env.HEYS_TEST_E2E_CLIENT_POPL_ID || DEFAULT_CLIENT;

  const api = createApiClient({ apiUrl: API_URL });
  const pinAuth = await api.verifyPin(phone, pin);
  if (!pinAuth.ok) fail('pin login', { error: pinAuth.error });
  if (String(pinAuth.clientId).toLowerCase() !== String(clientId).toLowerCase()) {
    fail('pin client mismatch', { expected: clientId, got: pinAuth.clientId });
  }
  const sessionToken = pinAuth.sessionToken;
  const key = day.dayKey(date);
  const { data: rawDay, error: readErr } = await api.getKV(sessionToken, key);
  if (readErr) fail('get day', { error: readErr });

  const currentDay = day.ensureDay(rawDay, date, clientId);
  if (!skipDelete && !currentDay.meals.length) fail(`day ${date} has no meals — log one first`);

  let mealId = currentDay.meals[0] && currentDay.meals[0].id;
  let staleSnapshot;
  if (snapshotIn) {
    staleSnapshot = JSON.parse(fs.readFileSync(snapshotIn, 'utf8'));
    mealId = mealId || (staleSnapshot.meals && staleSnapshot.meals[0] && staleSnapshot.meals[0].id);
  } else {
    staleSnapshot = JSON.parse(JSON.stringify(currentDay));
    delete staleSnapshot.deletedMealIds;
    delete staleSnapshot.deletedItemIds;
    const preDeleteUpdatedAt = Number(currentDay.updatedAt) || Date.now();
    // PWA re-stamps day.updatedAt on save; meals often keep older per-meal ts.
    staleSnapshot.updatedAt = Date.now() + 10_000;
    for (const meal of staleSnapshot.meals || []) {
      if (meal && typeof meal === 'object') meal.updatedAt = preDeleteUpdatedAt - 1;
    }
  }
  if (!mealId) fail('meal_id missing');

  if (!skipDelete) {
    console.log(`[1/4] delete meal ${mealId} on ${date} (client ${clientId})`);
    const lastSeenBeforeDelete = Number(currentDay.updatedAt) || 0;
    const { day: deletedDay } = day.deleteMeal(currentDay, mealId, { nowMs: Date.now(), clientId });
    const delRes = await api.mergeSaveKV(sessionToken, key, deletedDay, lastSeenBeforeDelete);
    if (!delRes.ok) fail('delete merge_save', delRes);
    const mealsAfterDelete = (delRes.value && delRes.value.meals) ? delRes.value.meals.length : 0;
    console.log(`      outcome=${delRes.outcome} meals=${mealsAfterDelete} (session path — use MCP delete + --skip-delete for curator path)`);
    if (mealsAfterDelete !== 0) fail('meal still present after delete', delRes);
  } else {
    console.log(`[1/4] skip delete (expect curator/MCP delete + tombstone already on cloud)`);
    if (!currentDay.deletedMealIds || !currentDay.deletedMealIds[mealId]) {
      fail('cloud has no tombstone for meal — delete via MCP first', { deletedMealIds: currentDay.deletedMealIds });
    }
    if ((currentDay.meals || []).length !== 0) fail('cloud still has meals before stale push', currentDay);
  }

  const { data: cloudDayRaw } = await api.getKV(sessionToken, key);
  const cloudDay = day.ensureDay(cloudDayRaw, date, clientId);
  const cloudUpdatedAt = Number(cloudDay.updatedAt) || 0;

  if (waitMs > 0) {
    console.log(`[2/4] wait ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  } else {
    console.log('[2/4] skip wait');
  }

  console.log('[3/4] stale client push (pre-delete snapshot, bumped updatedAt)');
  const staleRes = await api.mergeSaveKV(sessionToken, key, staleSnapshot, cloudUpdatedAt);
  if (!staleRes.ok) fail('stale merge_save', staleRes);
  const mealsAfterStale = (staleRes.value && staleRes.value.meals) ? staleRes.value.meals.length : 0;
  console.log(`      outcome=${staleRes.outcome} meals=${mealsAfterStale}`);

  console.log('[4/4] verify');
  if (mealsAfterStale !== 0) fail('meal resurrected after stale push', staleRes);
  if (staleRes.outcome !== 'day_tombstone_guard_merged') {
    fail(`expected outcome day_tombstone_guard_merged, got ${staleRes.outcome}`, staleRes);
  }

  const { data: finalRaw } = await api.getKV(sessionToken, key);
  const finalDay = day.ensureDay(finalRaw, date, clientId);
  if ((finalDay.meals || []).length !== 0) fail('get_day still shows meals', { meals: finalDay.meals.map((m) => m.id) });
  if (!finalDay.deletedMealIds || !finalDay.deletedMealIds[mealId]) {
    fail('tombstone missing on final day', { deletedMealIds: finalDay.deletedMealIds });
  }

  console.log('PASS: delete-meal tombstone smoke ok');
  console.log(JSON.stringify({
    date,
    meal_id: mealId,
    delete_outcome: skipDelete ? 'curator_mcp' : delRes.outcome,
    stale_outcome: staleRes.outcome,
    wait_ms: waitMs,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
