import crypto from 'node:crypto';

import { log } from '@heys/logger';
import express from 'express';

import type { ClientDayRecord, CuratorClientRecord } from './curatorData';
import { CURATOR_CLIENTS, findClientRecord, getAllowedClients, getClientDayRecord } from './curatorData';
import type { SupabaseCuratorClientSnapshot } from './supabaseCuratorService';
import { getSupabaseCuratorService } from './supabaseCuratorService';
import { ensureUserAllowed, verifyTelegramInitData } from './telegramAuth';

interface CuratorSessionPayload {
  curatorId: string;
  name: string;
  username?: string;
  telegramUserId: number;
  token: string;
  expiresAt: string;
  dataSource: 'supabase' | 'mock';
  supabaseCuratorId?: string;
}

interface ActiveSession {
  session: CuratorSessionPayload;
  allowedClientIds: string[];
  supabase?: {
    curatorId: string;
  };
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const TELEGRAM_ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => Number(id.trim()))
  .filter((id) => Number.isFinite(id));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

const activeSessions = new Map<string, ActiveSession>();
const supabaseCuratorService = getSupabaseCuratorService();
const TELEGRAM_CURATOR_MAP = parseTelegramCuratorMap(process.env.TELEGRAM_CURATOR_MAP ?? '');

export const serverRouter = express.Router();

serverRouter.post('/api/telegram/auth/verify', express.json(), async (req, res) => {
  const { initData } = req.body ?? {};
  const requestMeta = {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    hasInitData: typeof initData === 'string',
    allowedListConfigured: TELEGRAM_ALLOWED_IDS.length > 0
  };

  if (!initData || typeof initData !== 'string') {
    log.warn('Telegram auth rejected: initData missing', requestMeta);
    return res.status(400).json({ error: 'initData обязателен' });
  }

  const verification = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN);
  if (!verification.ok) {
    log.warn('Telegram auth rejected: verification failed', {
      ...requestMeta,
      reason: verification.error
    });
    return res.status(401).json({ error: verification.error });
  }

  const userPayload = verification.user;
  if (!userPayload) {
    log.warn('Telegram auth rejected: no user payload', requestMeta);
    return res.status(403).json({ error: 'initData не содержит данных пользователя' });
  }

  const allowedCheck = ensureUserAllowed(userPayload.id, TELEGRAM_ALLOWED_IDS, {
    allowEmptyList: NODE_ENV !== 'production'
  });
  if (!allowedCheck.ok) {
    log.warn('Telegram auth rejected: user not allowed', {
      ...requestMeta,
      userId: userPayload.id
    });
    return res.status(403).json({ error: allowedCheck.error });
  }

  const sessionSource = await resolveSupabaseSessionSource(userPayload.id);
  const supabaseCuratorId = sessionSource?.curatorId;
  const allowedClientIds = supabaseCuratorId
    ? sessionSource?.clientIds ?? []
    : CURATOR_CLIENTS.map((client) => client.id);

  const sessionPayload = createSessionPayload(userPayload, supabaseCuratorId);
  activeSessions.set(sessionPayload.token, {
    session: sessionPayload,
    allowedClientIds,
    supabase: supabaseCuratorId ? { curatorId: supabaseCuratorId } : undefined
  });

  log.info('Telegram auth verified successfully', {
    ...requestMeta,
    userId: userPayload.id,
    sessionExpiresAt: sessionPayload.expiresAt
  });

  return res.json(sessionPayload);
});

serverRouter.get('/api/curator/clients', async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  if (await tryHandleSupabaseClientList(req, res, auth)) {
    return;
  }

  const clientsSource = getAllowedClients(auth.allowedClientIds);
  return res.json(buildClientListResponse(clientsSource, req.query));
});

serverRouter.get('/api/curator/clients/:clientId', async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  const { clientId } = req.params;
  if (await tryHandleSupabaseClientDetails(req, res, auth)) {
    return;
  }
  if (!auth.allowedClientIds.length || auth.allowedClientIds.includes(clientId)) {
    const record = findClientRecord(clientId);
    if (!record) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    return res.json(mapClientToDetailsPayload(record));
  }

  return res.status(403).json({ error: 'Нет доступа к клиенту' });
});

serverRouter.get('/api/curator/clients/:clientId/day/:date', async (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  const { clientId, date } = req.params;
  if (auth.allowedClientIds.length && !auth.allowedClientIds.includes(clientId)) {
    return res.status(403).json({ error: 'Нет доступа к клиенту' });
  }

  if (await tryHandleSupabaseClientDay(req, res, auth)) {
    return;
  }

  const record = findClientRecord(clientId);
  if (!record) {
    return res.status(404).json({ error: 'Клиент не найден' });
  }

  const dayData = getClientDayRecord(clientId, date) ?? createEmptyDayPayload(clientId, date);
  return res.json(dayData);
});

function createSessionPayload(
  user: NonNullable<ReturnType<typeof verifyTelegramInitData>['user']>,
  supabaseCuratorId?: string | null
): CuratorSessionPayload {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const payload: CuratorSessionPayload = {
    curatorId: supabaseCuratorId ?? `telegram-${user.id}`,
    name: `${user.first_name ?? 'Куратор'} ${user.last_name ?? ''}`.trim(),
    telegramUserId: user.id,
    token: crypto.randomUUID(),
    expiresAt,
    dataSource: supabaseCuratorId ? 'supabase' : 'mock'
  };

  if (supabaseCuratorId) {
    payload.supabaseCuratorId = supabaseCuratorId;
  }

  if (user.username) {
    payload.username = user.username;
  }

  return payload;
}

function requireSession(req: express.Request, res: express.Response): ActiveSession | null {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }

  const stored = activeSessions.get(token);
  if (!stored) {
    res.status(401).json({ error: 'Сессия не найдена или истекла' });
    return null;
  }

  if (new Date(stored.session.expiresAt).getTime() < Date.now()) {
    activeSessions.delete(token);
    res.status(401).json({ error: 'Сессия истекла' });
    return null;
  }

  return stored;
}

function extractToken(req: express.Request) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  const direct = req.get('x-curator-token');
  return direct?.trim() ?? null;
}

function mapClientToListPayload(client: CuratorClientRecord) {
  const { dayData, ...rest } = client;
  void dayData;
  return rest;
}

function mapClientToDetailsPayload(client: CuratorClientRecord) {
  const { dayData, ...rest } = client;
  void dayData;
  return rest;
}

function sortClients(clientA: CuratorClientRecord, clientB: CuratorClientRecord, sortBy?: string, sortOrder?: string) {
  const order = sortOrder === 'asc' ? 1 : -1;

  switch (sortBy) {
    case 'name':
      return clientA.name.localeCompare(clientB.name) * order;
    case 'createdAt':
      return compareDates(clientA.createdAt, clientB.createdAt, order);
    case 'lastActivity':
    default:
      return compareDates(clientA.lastActivityAt, clientB.lastActivityAt, order);
  }
}

function compareDates(a?: string, b?: string, order = -1) {
  const aTime = a ? Date.parse(a) : 0;
  const bTime = b ? Date.parse(b) : 0;
  return (aTime - bTime) * order;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(max, Math.max(min, parsed));
  }
  return fallback;
}

function createEmptyDayPayload(clientId: string, date: string) {
  return {
    clientId,
    date,
    meals: [],
    totals: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    }
  };
}

function buildClientListResponse(clients: CuratorClientRecord[], query: express.Request['query']) {
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const status = typeof query.status === 'string' ? query.status : undefined;
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'lastActivity';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const perPage = clampNumber(query.perPage, 20, 1, 50);
  const page = clampNumber(query.page, 1, 1, 999);

  let filtered = clients;

  if (search) {
    filtered = filtered.filter((client) => {
      const matchesName = client.name.toLowerCase().includes(search);
      const matchesEmail = client.email ? client.email.toLowerCase().includes(search) : false;
      return matchesName || matchesEmail;
    });
  }

  if (status && status !== 'all') {
    filtered = filtered.filter((client) => client.status === status);
  }

  filtered = filtered.sort((a, b) => sortClients(a, b, sortBy, sortOrder));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const paginated = filtered.slice(startIndex, startIndex + perPage).map(mapClientToListPayload);

  return {
    clients: paginated,
    pagination: {
      page: currentPage,
      perPage,
      total,
      totalPages
    }
  };
}

function parseTelegramCuratorMap(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) {
    return map;
  }

  raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [telegramRaw, curatorRaw] = pair.split('=').map((part) => part?.trim() ?? '');
      const telegramId = Number(telegramRaw);
      if (Number.isFinite(telegramId) && curatorRaw) {
        map.set(telegramId, curatorRaw);
      }
    });

  return map;
}

async function resolveSupabaseSessionSource(telegramUserId: number) {
  if (!supabaseCuratorService) {
    return null;
  }

  const curatorId = TELEGRAM_CURATOR_MAP.get(telegramUserId);
  if (!curatorId) {
    return null;
  }

  try {
    const snapshots = await supabaseCuratorService.fetchClients(curatorId);
    const clientIds = snapshots.map((snapshot) => snapshot.client.id).filter(Boolean);
    return { curatorId, clientIds };
  } catch (error) {
    log.error('Failed to load Supabase clients for curator', {
      telegramUserId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function tryHandleSupabaseClientList(
  req: express.Request,
  res: express.Response,
  auth: ActiveSession
): Promise<boolean> {
  if (!supabaseCuratorService || !auth.supabase?.curatorId) {
    return false;
  }

  try {
    const snapshots = await supabaseCuratorService.fetchClients(auth.supabase.curatorId);
    const records = snapshots.map(mapSupabaseSnapshotToClientRecord);
    res.json(buildClientListResponse(records, req.query));
    return true;
  } catch (error) {
    log.error('Supabase client list request failed, falling back to mocks', {
      curatorId: auth.supabase.curatorId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function tryHandleSupabaseClientDetails(
  req: express.Request,
  res: express.Response,
  auth: ActiveSession
): Promise<boolean> {
  if (!supabaseCuratorService || !auth.supabase?.curatorId) {
    return false;
  }

  try {
    const snapshot = await supabaseCuratorService.fetchClientById(auth.supabase.curatorId, req.params.clientId);
    if (!snapshot) {
      res.status(404).json({ error: 'Клиент не найден' });
      return true;
    }

    const record = mapSupabaseSnapshotToClientRecord(snapshot);
    res.json(mapClientToDetailsPayload(record));
    return true;
  } catch (error) {
    log.error('Supabase client details request failed, falling back to mocks', {
      curatorId: auth.supabase.curatorId,
      clientId: req.params.clientId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function tryHandleSupabaseClientDay(
  req: express.Request,
  res: express.Response,
  auth: ActiveSession
): Promise<boolean> {
  if (!supabaseCuratorService || !auth.supabase?.curatorId) {
    return false;
  }

  const { clientId, date } = req.params;
  try {
    const raw = await supabaseCuratorService.fetchClientDayRaw(auth.supabase.curatorId, clientId, date);
    if (!raw) {
      res.status(404).json({ error: 'Данные за выбранный день не найдены' });
      return true;
    }

    const dayRecord = mapSupabaseDayValueToClientDayRecord(clientId, date, raw.value);
    res.json(dayRecord);
    return true;
  } catch (error) {
    log.error('Supabase client day request failed, falling back to mocks', {
      curatorId: auth.supabase.curatorId,
      clientId,
      date,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function mapSupabaseSnapshotToClientRecord(snapshot: SupabaseCuratorClientSnapshot): CuratorClientRecord {
  const createdAt = snapshot.client.createdAt ?? new Date().toISOString();
  const updatedAt = snapshot.client.updatedAt ?? createdAt;

  const record: CuratorClientRecord = {
    id: snapshot.client.id,
    name: snapshot.client.name,
    email: snapshot.client.email ?? undefined,
    status: snapshot.client.status ?? 'active',
    lastActivityAt: snapshot.client.lastActivityAt ?? updatedAt,
    todaySummary: undefined,
    profile: mapSupabaseProfile(snapshot.kv['heys_profile']?.value),
    weekStats: undefined,
    targetCalories: undefined,
    curatorNotes: undefined,
    createdAt,
    updatedAt,
    dayData: undefined
  };

  return record;
}

function mapSupabaseProfile(raw: unknown): CuratorClientRecord['profile'] | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const profile = raw as Record<string, unknown>;
  const genderRaw = profile.gender ?? profile.sex;
  let gender: 'male' | 'female' | undefined;
  if (typeof genderRaw === 'string') {
    const lower = genderRaw.toLowerCase();
    if (lower.startsWith('m') || lower.startsWith('м')) {
      gender = 'male';
    } else if (lower.startsWith('f') || lower.startsWith('ж')) {
      gender = 'female';
    }
  }

  return {
    age: toNumber(profile.age) || undefined,
    gender,
    weight: toNumber(profile.weight) || undefined,
    height: toNumber(profile.height) || undefined,
    deficitPctTarget: toNumber(profile.deficitPctTarget) || undefined
  };
}

function mapSupabaseDayValueToClientDayRecord(
  clientId: string,
  date: string,
  rawValue: unknown
): ClientDayRecord {
  if (!isPlainObject(rawValue)) {
    return createEmptyDayPayload(clientId, date);
  }

  const rawDay = rawValue as Record<string, unknown>;
  const mealsSource = Array.isArray(rawDay.meals) ? rawDay.meals : [];
  const meals = mealsSource.map((meal, index) => mapRawMealToClientMeal(meal, index));
  const totals = normalizeDayTotals(rawDay.totals, meals);

  return {
    clientId,
    date: typeof rawDay.date === 'string' ? rawDay.date : date,
    meals,
    totals
  };
}

function mapRawMealToClientMeal(rawMeal: unknown, index: number): ClientDayRecord['meals'][number] {
  const meal = isPlainObject(rawMeal) ? (rawMeal as Record<string, unknown>) : {};
  const products = mapRawMealProducts(meal);

  return {
    id: String(meal.id ?? `meal-${index}`),
    type: normalizeMealType(meal.type),
    time: typeof meal.time === 'string' ? meal.time : '',
    products
  };
}

function mapRawMealProducts(meal: Record<string, unknown>): ClientDayRecord['meals'][number]['products'] {
  const rawProducts = Array.isArray(meal.products)
    ? meal.products
    : Array.isArray(meal.items)
      ? meal.items
      : [];

  if (!Array.isArray(rawProducts)) {
    return [];
  }

  return rawProducts.map((rawProduct, index) => {
    const product = isPlainObject(rawProduct) ? (rawProduct as Record<string, unknown>) : {};
    const nestedProduct = isPlainObject(product.product) ? (product.product as Record<string, unknown>) : undefined;
    const nutrition = isPlainObject(product.nutrition)
      ? (product.nutrition as Record<string, unknown>)
      : nestedProduct;

    const weight = toNumber(product.weight ?? product.grams ?? product.amount ?? product.value ?? 0);
    const per100 = {
      calories: toNumber(nutrition?.kcal100 ?? nutrition?.calories100 ?? nutrition?.caloriesPer100 ?? 0),
      protein: toNumber(nutrition?.protein100 ?? nutrition?.protein ?? 0),
      carbs: toNumber(nutrition?.carbs100 ?? nutrition?.carbohydrates100 ?? nutrition?.carbs ?? 0),
      fat: toNumber(nutrition?.fat100 ?? nutrition?.fat ?? 0)
    };

    const calories = toNumber(product.calories ?? product.kcal ?? calcFromPer100(per100.calories, weight));
    const protein = toNumber(product.protein ?? calcFromPer100(per100.protein, weight));
    const carbs = toNumber(product.carbs ?? calcFromPer100(per100.carbs, weight));
    const fat = toNumber(product.fat ?? calcFromPer100(per100.fat, weight));

    return {
      productId:
        typeof product.productId === 'string'
          ? product.productId
          : typeof product.product_id === 'string'
            ? product.product_id
            : typeof nestedProduct?.id === 'string'
              ? nestedProduct.id
              : `product-${index}`,
      name:
        typeof product.name === 'string'
          ? product.name
          : typeof nestedProduct?.name === 'string'
            ? nestedProduct.name
            : 'Продукт',
      weight,
      calories,
      protein,
      carbs,
      fat
    };
  });
}

function normalizeDayTotals(rawTotals: unknown, meals: ClientDayRecord['meals']): ClientDayRecord['totals'] {
  if (isPlainObject(rawTotals)) {
    const totals = rawTotals as Record<string, unknown>;
    return {
      calories: toNumber(totals.calories),
      protein: toNumber(totals.protein),
      carbs: toNumber(totals.carbs),
      fat: toNumber(totals.fat)
    };
  }

  return meals.reduce(
    (acc, meal) => {
      meal.products.forEach((product) => {
        acc.calories += product.calories;
        acc.protein += product.protein;
        acc.carbs += product.carbs;
        acc.fat += product.fat;
      });
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function calcFromPer100(per100Value: number, weight: number) {
  if (!per100Value || !weight) {
    return 0;
  }
  return Number(((per100Value * weight) / 100).toFixed(1));
}

function normalizeMealType(value: unknown): ClientDayRecord['meals'][number]['type'] {
  if (typeof value !== 'string') {
    return 'snack';
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('завт') || normalized.includes('break')) {
    return 'breakfast';
  }
  if (normalized.includes('обед') || normalized.includes('lunch')) {
    return 'lunch';
  }
  if (normalized.includes('ужин') || normalized.includes('dinner')) {
    return 'dinner';
  }
  return 'snack';
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
