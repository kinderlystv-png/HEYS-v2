#!/usr/bin/env node

/**
 * HEYS API Server
 * Simple API server for development
 */

const cors = require('cors');
const express = require('express');
const { buildDefaultAllowedOrigins } = require('./corsOrigins');

const app = express();

// Configuration from environment
const PORT = process.env.API_PORT || process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_NAME = process.env.DATABASE_NAME || 'projectB';
const DEFAULT_ALLOWED_ORIGINS = buildDefaultAllowedOrigins();
const ALLOWED_ORIGINS = (process.env.API_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => Boolean(origin));
// In development always include localhost origins regardless of API_ALLOWED_ORIGINS
const EFFECTIVE_ORIGINS = NODE_ENV === 'development'
  ? [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ALLOWED_ORIGINS])]
  : (ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS);

// Basic middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (EFFECTIVE_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
// Dev proxy must accept large RPC bodies (e.g. batch_upsert_client_kv_by_session).
const JSON_BODY_LIMIT = process.env.API_JSON_BODY_LIMIT || '20mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: DATABASE_NAME,
    port: PORT,
    uptime: process.uptime(),
  });
});

// API routes
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.0.0',
    name: 'HEYS API Server',
    database: DATABASE_NAME,
    port: PORT,
  });
});

app.get('/api/nutrition', (req, res) => {
  res.json({ message: 'Nutrition API endpoint', database: DATABASE_NAME });
});

app.get('/api/training', (req, res) => {
  res.json({ message: 'Training API endpoint', database: DATABASE_NAME });
});

app.get('/api/analytics', (req, res) => {
  res.json({ message: 'Analytics API endpoint', database: DATABASE_NAME });
});

// Dev proxy: forward /rpc and /rest to production API (server-to-server, no CORS issues)
const PROD_API = (process.env.HEYS_DEV_PROXY_TARGET || 'https://api.heyslab.ru').replace(/\/$/, '');
const devTranscriptionConsentByAuth = new Map();

function getDevTranscriptionConsentKey(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const cookie = req.headers.cookie || '';
  return String(auth || cookie || 'anonymous').slice(0, 240);
}

function buildDevTranscriptionConsentResponse(stamp) {
  return {
    success: true,
    consent_type: 'speech_transcription',
    version: stamp?.version || '1.0',
    granted: !!(stamp?.granted && !stamp?.revoked_at),
    decided: !!stamp,
    created_at: stamp?.created_at || null,
    revoked_at: stamp?.revoked_at || null,
    dev_local_only: true,
  };
}

app.all('/messages/transcription-consent', (req, res) => {
  const key = getDevTranscriptionConsentKey(req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.json(buildDevTranscriptionConsentResponse(devTranscriptionConsentByAuth.get(key) || null));
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  }

  const granted = req.body?.granted !== false;
  const now = new Date().toISOString();
  const previous = devTranscriptionConsentByAuth.get(key) || null;
  const stamp = {
    version: '1.0',
    granted,
    created_at: now,
    revoked_at: granted ? null : now,
    previous_created_at: previous?.created_at || null,
  };
  devTranscriptionConsentByAuth.set(key, stamp);
  return res.json(buildDevTranscriptionConsentResponse(stamp));
});

function buildUpstreamHeaders(req) {
  const h = {};
  const copy = (name) => {
    const v = req.headers[name];
    if (v === undefined || v === '') return;
    h[name] = Array.isArray(v) ? v.join(', ') : String(v);
  };
  copy('authorization');
  copy('apikey');
  copy('prefer');
  copy('accept');
  copy('accept-profile');
  copy('content-profile');
  copy('content-type');
  copy('range');
  copy('x-client-info');
  copy('x-session-token');
  copy('cookie');
  copy('if-none-match');
  copy('if-modified-since');
  if (!req.headers['x-forwarded-for'] && req.ip) {
    h['x-forwarded-for'] = req.ip;
  }
  return h;
}

async function proxyToProd(req, res) {
  const PROXY_RETRIES = 2;
  const PROXY_RETRY_DELAY_MS = 250;

  for (let attempt = 0; attempt <= PROXY_RETRIES; attempt++) {
  try {
    const url = `${PROD_API}${req.originalUrl}`;
    const method = req.method;
    const headers = buildUpstreamHeaders(req);
    // heys-api-rest / heys-api-auth: без ALLOW_LOCALHOST_ORIGINS=1 на CF Origin «http://localhost:3001»
    // даёт 403 {error:'cors_denied'}. Это server→server hop — подставляем разрешённый prod-origin (BFF).
    headers.origin = 'https://app.heyslab.ru';
    // Иначе undici запрашивает gzip, декодирует body, но может оставить Content-Encoding — браузер ломается (ERR_CONTENT_DECODING_FAILED).
    headers['accept-encoding'] = 'identity';
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      delete headers['content-type'];
    } else if (['POST', 'PUT', 'PATCH'].includes(method) && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const init = { method, headers, referrerPolicy: 'no-referrer' };
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      init.body = JSON.stringify(req.body ?? {});
    }

    const proxyRes = await fetch(url, init);
    const status = proxyRes.status;

    if (res.writableEnded) return;

    res.status(status);
    const hopByHop = new Set(['transfer-encoding', 'connection', 'keep-alive']);
    const skipUpstreamCors = new Set([
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-expose-headers',
      'access-control-max-age',
    ]);
    // Node fetch декодирует gzip/br/deflate в response.body, но часто оставляет исходные
    // Content-Encoding / Content-Length. Браузер тогда «декодирует» второй раз → ERR_CONTENT_DECODING_FAILED.
    const skipAfterDecode = new Set(['content-encoding', 'content-length']);
    proxyRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (hopByHop.has(lower)) return;
      if (skipUpstreamCors.has(lower)) return;
      if (skipAfterDecode.has(lower)) return;
      // Set-Cookie handled separately below: upstream sets Domain=.heyslab.ru +
      // Secure, which the browser rejects on http://localhost. Strip those
      // attributes so cookies (heys_session_token / heys_curator_jwt) actually
      // persist when developing against the dev proxy.
      if (lower === 'set-cookie') return;
      try {
        res.setHeader(key, value);
      } catch (_) { /* ignore duplicate / invalid */ }
    });

    const upstreamCookies = typeof proxyRes.headers.getSetCookie === 'function'
      ? proxyRes.headers.getSetCookie()
      : [];
    if (upstreamCookies.length > 0) {
      const rewritten = upstreamCookies.map((cookie) => cookie
        .replace(/;\s*Domain=[^;]+/gi, '')
        .replace(/;\s*Secure(?=;|$)/gi, ''));
      res.setHeader('Set-Cookie', rewritten);
    }

    // 🛡️ 2026-05-31: buffered response вместо streaming pipeline.
    // Pipeline streaming падал с "Cannot pipe to a closed or destroyed stream"
    // на КАЖДОМ proxy request (batch_get_client_kv, weekly_snapshots, kv_store
    // REST, messages/inbox, ...). Симптом для пользователя: курaтор видит UI,
    // dayv2 keys уже накоплены в scoped LS, но при смене даты bootstrapClientSync
    // (delta sync) fails → .then() не вызывается → doLocal не вызывается →
    // setDay не вызывается → dayRaw залип на today. UI показывает 174 ккал
    // на всех днях даже хотя LS содержит правильные данные за каждый день.
    // Buffered: читаем upstream полностью через arrayBuffer(), потом одной
    // операцией отдаём клиенту. Никаких stream race conditions.
    if (proxyRes.body) {
      const buf = Buffer.from(await proxyRes.arrayBuffer());
      if (res.writableEnded) return;
      res.end(buf);
    } else {
      res.end();
    }
    return; // success
  } catch (err) {
    const isNetworkError = err.name === 'TypeError' && err.message === 'fetch failed';
    if (isNetworkError && attempt < PROXY_RETRIES) {
      console.warn(`[Dev Proxy] fetch failed (attempt ${attempt + 1}/${PROXY_RETRIES + 1}), retrying in ${PROXY_RETRY_DELAY_MS}ms...`);
      await new Promise(r => setTimeout(r, PROXY_RETRY_DELAY_MS));
      continue;
    }
    console.error('[Dev Proxy]', req.method, req.originalUrl, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Dev proxy error', details: err.message });
    } else if (!res.writableEnded) {
      res.destroy(err);
    }
    return;
  }
  } // end retry loop
}
app.all('/rpc', proxyToProd);
app.all('/rpc/*', proxyToProd);
app.all('/rest', proxyToProd);
app.all('/rest/*', proxyToProd);
app.all('/auth/*', proxyToProd);
app.all('/messages/*', proxyToProd);
app.all('/photos/*', proxyToProd);
app.all('/media/*', proxyToProd);
console.log(`🔀 Dev proxy: /rpc, /rest, /auth, /messages, /photos, /media → ${PROD_API}`);

// SMS Proxy endpoint (обход CORS для SMS.ru)
app.post('/api/sms', async (req, res) => {
  try {
    // api_id MUST come from server env, never from client request
    const apiKey = process.env.SMS_API_KEY;
    if (!apiKey) {
      console.error('[SMS] SMS_API_KEY not configured');
      return res.status(503).json({ error: 'SMS service not configured' });
    }

    const { to, msg } = req.body;

    if (!to || !msg) {
      return res.status(400).json({ error: 'Missing required fields: to, msg' });
    }

    // Validate E.164-compatible Russian phone number
    const phoneClean = String(to).replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[78]\d{10}$/.test(phoneClean)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Cap message length to prevent abuse
    if (String(msg).length > 480) {
      return res.status(400).json({ error: 'Message too long (max 480 chars)' });
    }

    // Формируем URL для SMS.ru
    const params = new URLSearchParams({
      api_id: apiKey,
      to: phoneClean,
      msg: String(msg),
      json: '1',
      from: 'HEYS',
    });

    const smsResponse = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    const result = await smsResponse.json();

    console.info(`[HEYS.sms] SMS to ${phoneClean.slice(0, -4)}****: status ${result.status_code}`);
    return res.json(result);

  } catch (error) {
    console.error('[SMS Proxy] Error:', error);
    return res.status(500).json({ error: 'SMS proxy error' });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    method: req.method,
    path: req.originalUrl,
  });
});

// Dev-server safety net: network errors from the upstream proxy (ETIMEDOUT, terminated, etc.)
// occasionally escape to the process level. Log and continue — don't crash the dev server.
process.on('uncaughtException', (err) => {
  const msg = err?.message ?? String(err);
  const isProxyNoise = /terminated|ETIMEDOUT|ECONNRESET|Premature close/i.test(msg);
  if (isProxyNoise) {
    console.warn('[Dev Proxy] uncaught network error (ignored):', msg);
  } else {
    console.error('[Server] uncaughtException — re-throwing:', err);
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] unhandledRejection:', reason);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HEYS API Server started successfully!`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🗄️  Database: ${DATABASE_NAME}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);

  // Pre-warm upstream TLS connection so first real requests don't fail
  fetch(`${PROD_API}/health`, {
    headers: { origin: 'https://app.heyslab.ru', 'accept-encoding': 'identity' },
    referrerPolicy: 'no-referrer',
  }).then(() => {
    console.log(`🔥 Upstream pre-warmed: ${PROD_API}`);
  }).catch((e) => {
    console.warn(`⚠️ Upstream pre-warm failed: ${e.message}`);
  });
});

module.exports = app;
