#!/usr/bin/env node
'use strict';

const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = __dirname;

const FUNCTIONS = Object.freeze([
  { name: 'heys-api-rpc', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-rest', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-auth', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-leads', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-health', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-payments', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-push', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-messages', group: 'api', kind: 'api', autoDeploy: true },
  { name: 'heys-api-photos', group: 'api', kind: 'api', autoDeploy: true },
  {
    name: 'heys-api-sms',
    group: 'api',
    kind: 'api',
    autoDeploy: false,
    reason: 'disabled in production; restore only through an explicit release decision',
  },
  { name: 'heys-bot-client', group: 'automations', kind: 'polling', autoDeploy: true },
  { name: 'heys-maintenance', group: 'automations', kind: 'maintenance', autoDeploy: true },
  { name: 'heys-client-daily-backup', group: 'automations', kind: 'backup', autoDeploy: true },
  { name: 'heys-cron-security-alerts', group: 'automations', kind: 'cron', autoDeploy: true },
  { name: 'heys-cron-reminders', group: 'automations', kind: 'cron', autoDeploy: true },
  { name: 'heys-cron-trial-drip', group: 'automations', kind: 'cron', autoDeploy: true },
  { name: 'heys-cron-photo-cleanup', group: 'automations', kind: 'cron', autoDeploy: true },
  { name: 'heys-cron-speechkit-transcribe', group: 'automations', kind: 'cron', autoDeploy: true },
  { name: 'heys-snapshot-demo', group: 'automations', kind: 'automation', autoDeploy: true },
]);

const FUNCTION_BY_NAME = new Map(FUNCTIONS.map((item) => [item.name, item]));
const COMMON_DEPLOY_FILES = new Set([
  'yandex-cloud-functions/deploy-all.sh',
  'yandex-cloud-functions/test-functions.sh',
  'yandex-cloud-functions/function-inventory.cjs',
  'yandex-cloud-functions/serverless-capacity-policy.cjs',
  'yandex-cloud-functions/check-serverless-capacity.cjs',
  'yandex-cloud-functions/check-serverless-error-logs.cjs',
  'yandex-cloud-functions/serverless-ops-canary.cjs',
  'yandex-cloud-functions/serverless-sync-load-test.cjs',
]);

function listFunctions({ group = null, autoOnly = false } = {}) {
  return FUNCTIONS
    .filter((item) => !group || item.group === group)
    .filter((item) => !autoOnly || item.autoDeploy)
    .map((item) => item.name);
}

function verifyInventory(root = ROOT) {
  const names = FUNCTIONS.map((item) => item.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const sourceFunctions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('heys-'))
    .filter((entry) => existsSync(resolve(root, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
  const inventoryNames = [...names].sort();
  const missingFromInventory = sourceFunctions.filter((name) => !FUNCTION_BY_NAME.has(name));
  const missingSource = inventoryNames.filter((name) => !sourceFunctions.includes(name));
  const invalidGroups = FUNCTIONS
    .filter((item) => !['api', 'automations'].includes(item.group))
    .map((item) => item.name);
  const invalidKinds = FUNCTIONS
    .filter((item) => !['api', 'cron', 'polling', 'maintenance', 'backup', 'automation'].includes(item.kind))
    .map((item) => item.name);
  const missingReasons = FUNCTIONS
    .filter((item) => !item.autoDeploy && !item.reason)
    .map((item) => item.name);

  return {
    ok: duplicates.length === 0
      && missingFromInventory.length === 0
      && missingSource.length === 0
      && invalidGroups.length === 0
      && invalidKinds.length === 0
      && missingReasons.length === 0,
    sourceFunctions,
    inventoryNames,
    duplicates,
    missingFromInventory,
    missingSource,
    invalidGroups,
    invalidKinds,
    missingReasons,
  };
}

function resolveChangedFiles(files = []) {
  const normalized = [...new Set(files.map((file) => String(file).trim()).filter(Boolean))];
  const gatewaySpecChanged = normalized.includes('yandex-cloud-functions/api-gateway-spec.yaml');
  const nonGatewayFiles = normalized.filter(
    (file) => file !== 'yandex-cloud-functions/api-gateway-spec.yaml',
  );
  const commonChanged = nonGatewayFiles.some(
    (file) => file.startsWith('yandex-cloud-functions/shared/') || COMMON_DEPLOY_FILES.has(file),
  );

  if (commonChanged) {
    return {
      mode: 'all',
      functions: listFunctions({ autoOnly: true }),
      gatewaySpecChanged,
      reason: 'shared-inventory-or-deploy-script-changed',
    };
  }

  const selected = new Set();
  for (const file of nonGatewayFiles) {
    const match = /^yandex-cloud-functions\/(heys-[^/]+)\//.exec(file);
    if (!match) continue;
    const item = FUNCTION_BY_NAME.get(match[1]);
    if (!item) throw new Error(`Unknown cloud function directory: ${match[1]}`);
    if (!item.autoDeploy) {
      throw new Error(`Auto-deploy disabled for ${item.name}: ${item.reason}`);
    }
    selected.add(item.name);
  }

  if (selected.size > 0) {
    return {
      mode: 'selective',
      functions: [...selected].sort(),
      gatewaySpecChanged,
      reason: 'changed-function-directories',
    };
  }
  if (gatewaySpecChanged && nonGatewayFiles.length === 0) {
    return {
      mode: 'gateway-only',
      functions: [],
      gatewaySpecChanged: true,
      reason: 'gateway-spec-only',
    };
  }
  return {
    mode: 'none',
    functions: [],
    gatewaySpecChanged,
    reason: 'no-deployable-function-changes',
  };
}

function assertDeployable(name) {
  const item = FUNCTION_BY_NAME.get(name);
  if (!item) throw new Error(`Unknown cloud function: ${name}`);
  return item;
}

function readStdin() {
  return readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const argSet = new Set(args);
  if (argSet.has('--verify')) {
    const result = verifyInventory();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (argSet.has('--assert-deployable')) {
    const name = args[args.indexOf('--assert-deployable') + 1];
    assertDeployable(name);
    console.log(name);
    return;
  }
  if (argSet.has('--resolve')) {
    const result = resolveChangedFiles(readStdin());
    if (argSet.has('--github-output')) {
      console.log(`mode=${result.mode}`);
      console.log(`functions=${result.functions.join(',')}`);
      console.log(`gateway_spec_changed=${result.gatewaySpecChanged}`);
      console.log(`reason=${result.reason}`);
    } else {
      console.log(JSON.stringify(result));
    }
    return;
  }
  if (argSet.has('--list')) {
    const groupIndex = args.indexOf('--group');
    const group = groupIndex >= 0 ? args[groupIndex + 1] : null;
    for (const name of listFunctions({ group, autoOnly: argSet.has('--auto-only') })) {
      console.log(name);
    }
    return;
  }
  throw new Error('Usage: --verify | --list [--group api|automations] [--auto-only] | --resolve [--github-output] | --assert-deployable <name>');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { FUNCTIONS, assertDeployable, listFunctions, resolveChangedFiles, verifyInventory };
