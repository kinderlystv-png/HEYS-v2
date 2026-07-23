#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const WATCHED_FUNCTIONS = Object.freeze(['heys-api-rpc', 'heys-api-rest']);
const OVERLOAD_CODE_RE = /\bCode:\s*(429|503)\b/i;
const OVERLOAD_LOG_FILTER = 'message: "Code: 429" OR message: "Code: 503"';
const YC_COMMAND_TIMEOUT_MS = 30_000;

function readYcJson(args) {
  const output = execFileSync('yc', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
    timeout: YC_COMMAND_TIMEOUT_MS,
  });
  return JSON.parse(output);
}

function buildLogReadArgs(functionId, since, logGroup = 'default') {
  return [
    'logging', 'read', logGroup,
    '--since', since,
    '--resource-ids', functionId,
    '--filter', OVERLOAD_LOG_FILTER,
    '--limit', '200',
    '--max-response-size', '4M',
    '--format', 'json',
  ];
}

function parseOverloadEntries(entries, functionName) {
  const incidents = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const message = String(entry?.message || '');
    const match = OVERLOAD_CODE_RE.exec(message);
    if (!match) continue;
    incidents.push({
      function: functionName,
      status: Number(match[1]),
      timestamp: entry?.timestamp || null,
      requestId: /RequestID:\s*([^\s]+)/i.exec(message)?.[1] || null,
      message: message.slice(0, 300),
    });
  }
  return incidents;
}

function readFunctionLogs(functionName, since) {
  const functionInfo = readYcJson([
    'serverless', 'function', 'get', functionName,
    '--format', 'json',
  ]);
  const logGroup = process.env.YC_LOG_GROUP_NAME || 'default';
  return readYcJson(buildLogReadArgs(functionInfo.id, since, logGroup));
}

function checkLogs({ since = '20m' } = {}) {
  const incidents = [];
  for (const functionName of WATCHED_FUNCTIONS) {
    incidents.push(...parseOverloadEntries(readFunctionLogs(functionName, since), functionName));
  }
  return {
    ok: incidents.length === 0,
    checkedAt: new Date().toISOString(),
    since,
    watchedFunctions: WATCHED_FUNCTIONS,
    counts: incidents.reduce((acc, item) => {
      const key = `${item.function}:${item.status}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    incidents: incidents.slice(0, 50),
  };
}

function valueAfter(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function main(argv = process.argv.slice(2)) {
  const report = checkLogs({ since: valueAfter(argv, '--since', '20m') });
  console.log(JSON.stringify(report, null, 2));
  if (argv.includes('--strict') && !report.ok) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Serverless log check failed: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = {
  OVERLOAD_LOG_FILTER,
  OVERLOAD_CODE_RE,
  WATCHED_FUNCTIONS,
  buildLogReadArgs,
  checkLogs,
  parseOverloadEntries,
};
