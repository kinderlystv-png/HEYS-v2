#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const WATCHED_RESOURCES = Object.freeze({
  'heys-api-rpc': 'd4e9e90es31bgjp87j8i',
  'heys-api-rest': 'd4ea4j7eh05rtkjubipt',
});
const WATCHED_FUNCTIONS = Object.freeze(Object.keys(WATCHED_RESOURCES));
const DEFAULT_LOG_GROUP_ID = 'e23ndggvq798r3v3eepq';
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

function buildLogReadArgs(functionId, since, until, logGroupId = DEFAULT_LOG_GROUP_ID) {
  return [
    'logging', 'read',
    '--group-id', logGroupId,
    '--since', since,
    '--until', until,
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
  const functionId = WATCHED_RESOURCES[functionName];
  if (!functionId) throw new Error(`Unknown watched function: ${functionName}`);
  const logGroupId = process.env.YC_LOG_GROUP_ID || DEFAULT_LOG_GROUP_ID;
  return readYcJson(buildLogReadArgs(functionId, since, new Date().toISOString(), logGroupId));
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
  DEFAULT_LOG_GROUP_ID,
  OVERLOAD_LOG_FILTER,
  OVERLOAD_CODE_RE,
  WATCHED_FUNCTIONS,
  WATCHED_RESOURCES,
  buildLogReadArgs,
  checkLogs,
  parseOverloadEntries,
};
