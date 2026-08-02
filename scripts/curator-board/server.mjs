#!/usr/bin/env node
/**
 * Локальная доска куратора: сводка сегодняшнего дня по активным клиентам.
 *
 * Читает тем же путём, что PWA и heys-mcp: curator JWT → REST client_kv_store.
 * Ничего не пишет — только чтение.
 *
 * Запуск:  node scripts/curator-board/server.mjs   →  http://localhost:4777
 * Креды берутся из .env.local (HEYS_CURATOR_EMAIL/PASSWORD, по умолчанию —
 * HEYS_TEST_CURATOR_EMAIL/PASSWORD).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API = process.env.HEYS_BOARD_API || 'https://api.heyslab.ru';
const PORT = Number(process.env.HEYS_BOARD_PORT || 4777);
const DAYS = 7;
// Технические клиенты, которых не показываем на доске.
const TEST_NAME = /^(E2E-|HEYS production smoke|тестовый)/i;

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const EMAIL = process.env.HEYS_CURATOR_EMAIL || process.env.HEYS_TEST_CURATOR_EMAIL;
const PASSWORD = process.env.HEYS_CURATOR_PASSWORD || process.env.HEYS_TEST_CURATOR_PASSWORD;

let tokenCache = { jwt: null, expiresAt: 0 };

async function getJwt() {
  if (tokenCache.jwt && Date.now() < tokenCache.expiresAt) return tokenCache.jwt;
  if (!EMAIL || !PASSWORD) throw new Error('нет кураторских кред в .env.local');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  const jwt = data.access_token || data.token;
  if (!jwt) throw new Error(`login_failed_${res.status}`);
  const ttl = Number(data.expires_in) || 3600;
  tokenCache = { jwt, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return jwt;
}

/** Дата в московском поясе: доска смотрит на тот же «сегодня», что и клиент. */
function mskDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
}

async function rest(jwt, query) {
  const res = await fetch(`${API}/rest/client_kv_store?${query}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`rest_http_${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function mealTotals(meals) {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  for (const meal of meals || []) {
    for (const it of meal.items || []) {
      const k = (Number(it.grams) || 0) / 100;
      kcal += (Number(it.kcal100) || 0) * k;
      protein += (Number(it.protein100) || 0) * k;
      fat += ((Number(it.fat100) || 0) || (Number(it.goodFat100) || 0) + (Number(it.badFat100) || 0)) * k;
      carbs += ((Number(it.carbs100) || 0) || (Number(it.simple100) || 0) + (Number(it.complex100) || 0)) * k;
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/** Минуты одной тренировки — сумма пульсовых зон `z`. */
function trainingMinutes(training) {
  let min = 0;
  for (const zone of training?.z || []) min += Number(zone) || 0;
  return min;
}

/**
 * День всегда содержит три слота-заготовки вида {"z":[0,0,0,0]}, поэтому
 * считать по длине массива нельзя: получится «3 тренировки» у того, кто не
 * тренировался. Канон приложения — слот с ненулевой зоной.
 */
function realTrainings(trainings) {
  return (trainings || []).filter((t) => trainingMinutes(t) > 0);
}

function summarizeDay(day) {
  if (!day) return null;
  const meals = (day.meals || []).filter((m) => (m.items || []).length > 0);
  const totals = mealTotals(meals);
  const trainings = realTrainings(day.trainings);
  return {
    meals: meals.length,
    mealNames: meals.map((m) => `${m.time || '--:--'} ${m.name || 'приём'}`),
    ...totals,
    water: Number(day.waterMl) || 0,
    lastWaterTime: day.lastWaterTime || null,
    steps: Number(day.steps) || 0,
    householdMin: Number(day.householdMin) || 0,
    trainings: trainings.length,
    trainingMin: Math.round(trainings.reduce((sum, t) => sum + trainingMinutes(t), 0)),
    weight: Number(day.weightMorning) || null,
    sleepHours: Number(day.sleepHours) || null,
    sleepQuality: Number(day.sleepQuality) || null,
    mood: Number(day.moodAvg ?? day.moodMorning) || null,
    updatedAt: day.updatedAt || null,
  };
}

async function buildSummary() {
  const jwt = await getJwt();
  const res = await fetch(`${API}/rpc?fn=get_curator_clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: '{}',
  });
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : raw.get_curator_clients || raw.data || [];

  const only = (process.env.HEYS_BOARD_CLIENTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const clients = list.filter((c) => (only.length
    ? only.some((n) => c.name?.toLowerCase().includes(n.toLowerCase()))
    : (c.subscription_status || c.status) === 'active' && !TEST_NAME.test(c.name || '')));

  const dates = Array.from({ length: DAYS }, (_, i) => mskDate(-i));
  const dayKeys = dates.map((d) => `heys_dayv2_${d}`);

  const cards = await Promise.all(clients.map(async (c) => {
    const rows = await rest(jwt, new URLSearchParams({
      select: 'k,v,updated_at',
      client_id: `eq.${c.id}`,
      k: `in.(${[...dayKeys, 'heys_profile'].join(',')})`,
    }).toString());
    const byKey = new Map(rows.map((r) => [r.k, r]));
    const profile = byKey.get('heys_profile')?.v || {};
    const today = summarizeDay(byKey.get(dayKeys[0])?.v);
    const week = dates.map((d, i) => {
      const s = summarizeDay(byKey.get(dayKeys[i])?.v);
      return { date: d, filled: !!s && (s.meals > 0 || s.water > 0 || s.steps > 0) };
    }).reverse();
    return {
      id: c.id,
      name: c.name,
      stepsGoal: Number(profile.stepsGoal) || null,
      sleepGoal: Number(profile.sleepHours) || null,
      weightGoal: Number(profile.weightGoal) || null,
      rowUpdatedAt: byKey.get(dayKeys[0])?.updated_at || null,
      today,
      week,
    };
  }));

  return { date: dates[0], generatedAt: new Date().toISOString(), clients: cards };
}

const PAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'board.html');

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/summary')) {
    try {
      const data = await buildSummary();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(PAGE_PATH, 'utf8'));
});

// Только loopback: на /api/summary нет авторизации, а отдаёт он данные о
// здоровье реальных людей. Без явного хоста Node слушает все интерфейсы, и
// сводку забирает любой в той же сети.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Доска куратора: http://localhost:${PORT}`);
  if (!EMAIL || !PASSWORD) console.log('⚠️  нет HEYS_CURATOR_EMAIL/PASSWORD в .env.local — страница покажет ошибку входа');
});
