#!/usr/bin/env node

/**
 * HEYS API Server
 * Simple API server for development
 */

const cors = require('cors');
const express = require('express');

const app = express();

// Configuration from environment
const PORT = process.env.API_PORT || process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_NAME = process.env.DATABASE_NAME || 'projectB';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003'
];
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
const PROD_API = 'https://api.heyslab.ru';
async function proxyToProd(req, res) {
  try {
    const url = `${PROD_API}${req.originalUrl}`;
    const proxyRes = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['authorization'] ? { authorization: req.headers['authorization'] } : {}),
        ...(req.headers['x-session-token'] ? { 'x-session-token': req.headers['x-session-token'] } : {}),
        ...(req.headers['x-forwarded-for'] ? {} : { 'x-forwarded-for': req.ip }),
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });
    const data = await proxyRes.json().catch(() => ({}));
    res.status(proxyRes.status).json(data);
  } catch (err) {
    console.error('[Dev Proxy] Error:', err.message);
    res.status(502).json({ error: 'Dev proxy error', details: err.message });
  }
}
app.all('/rpc', proxyToProd);
app.all('/rpc/*', proxyToProd);
app.all('/rest', proxyToProd);
app.all('/rest/*', proxyToProd);
app.all('/auth/*', proxyToProd);
console.log(`🔀 Dev proxy: /rpc, /rest, /auth → ${PROD_API}`);

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HEYS API Server started successfully!`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🗄️  Database: ${DATABASE_NAME}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

module.exports = app;
