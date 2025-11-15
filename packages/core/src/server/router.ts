import crypto from 'node:crypto';

import { log } from '@heys/logger';
import express from 'express';

import type { CuratorClientRecord } from './curatorData';
import { CURATOR_CLIENTS, findClientRecord, getAllowedClients, getClientDayRecord } from './curatorData';
import { ensureUserAllowed, verifyTelegramInitData } from './telegramAuth';

interface CuratorSessionPayload {
  curatorId: string;
  name: string;
  username?: string;
  telegramUserId: number;
  token: string;
  expiresAt: string;
}

interface ActiveSession {
  session: CuratorSessionPayload;
  allowedClientIds: string[];
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const TELEGRAM_ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => Number(id.trim()))
  .filter((id) => Number.isFinite(id));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

const activeSessions = new Map<string, ActiveSession>();

export const serverRouter = express.Router();

serverRouter.post('/api/telegram/auth/verify', express.json(), (req, res) => {
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

  const sessionPayload = createSessionPayload(userPayload);
  const allowedClientIds = CURATOR_CLIENTS.map((client) => client.id);
  activeSessions.set(sessionPayload.token, {
    session: sessionPayload,
    allowedClientIds
  });

  log.info('Telegram auth verified successfully', {
    ...requestMeta,
    userId: userPayload.id,
    sessionExpiresAt: sessionPayload.expiresAt
  });

  return res.json(sessionPayload);
});

serverRouter.get('/api/curator/clients', (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  const clientsSource = getAllowedClients(auth.allowedClientIds);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'lastActivity';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  const perPage = clampNumber(req.query.perPage, 20, 1, 50);
  const page = clampNumber(req.query.page, 1, 1, 999);

  let filtered = clientsSource;

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

  return res.json({
    clients: paginated,
    pagination: {
      page: currentPage,
      perPage,
      total,
      totalPages
    }
  });
});

serverRouter.get('/api/curator/clients/:clientId', (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  const { clientId } = req.params;
  if (!auth.allowedClientIds.length || auth.allowedClientIds.includes(clientId)) {
    const record = findClientRecord(clientId);
    if (!record) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    return res.json(mapClientToDetailsPayload(record));
  }

  return res.status(403).json({ error: 'Нет доступа к клиенту' });
});

serverRouter.get('/api/curator/clients/:clientId/day/:date', (req, res) => {
  const auth = requireSession(req, res);
  if (!auth) {
    return;
  }

  const { clientId, date } = req.params;
  if (auth.allowedClientIds.length && !auth.allowedClientIds.includes(clientId)) {
    return res.status(403).json({ error: 'Нет доступа к клиенту' });
  }

  const record = findClientRecord(clientId);
  if (!record) {
    return res.status(404).json({ error: 'Клиент не найден' });
  }

  const dayData = getClientDayRecord(clientId, date) ?? createEmptyDayPayload(clientId, date);
  return res.json(dayData);
});

function createSessionPayload(user: NonNullable<ReturnType<typeof verifyTelegramInitData>['user']>): CuratorSessionPayload {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const payload: CuratorSessionPayload = {
    curatorId: `telegram-${user.id}`,
    name: `${user.first_name ?? 'Куратор'} ${user.last_name ?? ''}`.trim(),
    telegramUserId: user.id,
    token: crypto.randomUUID(),
    expiresAt
  };

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
