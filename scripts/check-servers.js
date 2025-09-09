#!/usr/bin/env node

/**
 * Server Status Checker
 * Проверяет статус всех серверов HEYS
 */

import http from 'http';
import { URL } from 'url';

const SERVERS = [
  { name: 'Web Server (Vite)', url: 'http://localhost:3001', expected: 200 },
  { name: 'API Server', url: 'http://localhost:4001/health', expected: 200 },
  { name: 'API Endpoint', url: 'http://localhost:4001/api', expected: 200 }
];

function checkServer(server) {
  return new Promise((resolve) => {
    const url = new URL(server.url);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      resolve({
        ...server,
        status: res.statusCode,
        success: res.statusCode === server.expected,
        message: `HTTP ${res.statusCode}`
      });
    });

    req.on('error', (error) => {
      resolve({
        ...server,
        status: 0,
        success: false,
        message: error.code === 'ECONNREFUSED' ? 'Connection refused' : error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ...server,
        status: 0,
        success: false,
        message: 'Timeout'
      });
    });

    req.end();
  });
}

async function checkAllServers() {
  console.log('🔍 Проверка статуса серверов HEYS...\n');

  const results = await Promise.all(SERVERS.map(checkServer));
  
  let allGood = true;
  
  results.forEach(result => {
    const emoji = result.success ? '✅' : '❌';
    const status = result.success ? 'OK' : 'FAIL';
    
    console.log(`${emoji} ${result.name}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Status: ${status} (${result.message})\n`);
    
    if (!result.success) allGood = false;
  });

  if (allGood) {
    console.log('🎉 Все серверы работают корректно!');
  } else {
    console.log('⚠️  Некоторые серверы недоступны. Проверьте логи.');
  }
  
  process.exit(allGood ? 0 : 1);
}

checkAllServers().catch(console.error);
