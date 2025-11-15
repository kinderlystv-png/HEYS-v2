#!/usr/bin/env node

/**
 * HEYS API Server
 * Simple API server for development
 */

const cors = require('cors');
const express = require('express');

const { serverRouter } = require('../dist/server/router.js');

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
const EFFECTIVE_ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(serverRouter);

// 404 handler
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
