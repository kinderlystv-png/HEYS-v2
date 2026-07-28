'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('rpc and rest wrap non-OPTIONS handlers with the shared capacity guard', () => {
  for (const functionName of ['heys-api-rpc', 'heys-api-rest']) {
    const source = read(`${functionName}/index.js`);
    assert.match(source, /createServerlessCapacityGuard/);
    assert.match(source, /event\?\.httpMethod === 'OPTIONS'/);
    assert.match(source, /requestCapacityGuard\.tryEnter\(\)/);
    assert.match(source, /requestCapacityGuard\.withCorsHeaders/);
    assert.match(source, /finally\s*{\s*permit\.release\(\);\s*}/);
  }
});

test('capacity guard mirrors are byte-identical to the deploy source of truth', () => {
  const canonical = read('shared/serverless-capacity-guard.js');
  assert.equal(read('heys-api-rpc/shared/serverless-capacity-guard.js'), canonical);
  assert.equal(read('heys-api-rest/shared/serverless-capacity-guard.js'), canonical);
});

test('deploy gate syncs the guard and refuses rpc/rest deploy below capacity policy', () => {
  const source = read('deploy-all.sh');
  assert.match(source, /serverless-capacity-policy\.cjs/);
  assert.match(source, /HEYS_INSTANCE_ADMISSION_LIMIT/);
  assert.match(source, /HEYS_OVERLOAD_RETRY_AFTER_SECONDS/);
  assert.match(source, /serverless-capacity-guard\.js/);
  assert.match(source, /check-serverless-capacity\.cjs/);
  assert.match(source, /node "\$CAPACITY_CHECK" --strict --quota-only/);
  assert.match(source, /set-scaling-policy/);
  assert.match(source, /--zone-instances-limit/);
  assert.match(source, /--zone-requests-limit/);
});

test('deploy passes managed runtime secrets through Lockbox only', () => {
  const source = read('deploy-all.sh');
  assert.match(source, /PG_PASSWORD=__IN_LOCKBOX__heys-database__/);
  assert.match(source, /JWT_SECRET=__IN_LOCKBOX__heys-app-secrets__/);
  assert.match(source, /SESSION_SECRET=__IN_LOCKBOX__heys-app-secrets__/);
  assert.match(source, /VAPID_PRIVATE_KEY=__IN_LOCKBOX__heys-app-secrets__/);
  assert.doesNotMatch(source, /for k in PG_HOST PG_PORT PG_DATABASE PG_USER PG_PASSWORD PG_SSL/);
  assert.doesNotMatch(source, /_add_required JWT_SECRET/);
  assert.doesNotMatch(source, /_add_required SESSION_SECRET/);
  assert.doesNotMatch(source, /for k in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT/);
  assert.doesNotMatch(source, /for k in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(source, /for k in S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(source, /for k in YUKASSA_SHOP_ID YUKASSA_SECRET_KEY/);
  assert.doesNotMatch(source, /_add SMS_API_KEY/);
});

test('payments deploy uses a dedicated Lockbox and validates readiness without leaking values', () => {
  const source = read('deploy-all.sh');
  const validator = path.join(ROOT, 'check-payments-secret-payload.cjs');
  const fixture = JSON.stringify({
    entries: [
      { key: 'YUKASSA_SHOP_ID', text_value: 'shop-secret-value' },
      { key: 'YUKASSA_SECRET_KEY', text_value: 'api-secret-value' },
    ],
  });
  const result = spawnSync(process.execPath, [validator], { input: fixture, encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Payments Lockbox readiness verified/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /shop-secret-value|api-secret-value/);
  assert.match(source, /payments_lockbox_ready/);
  assert.match(source, /LOCKBOX_PAYMENTS_SECRET_ID/);
  assert.match(source, /yc lockbox payload get/);
  assert.doesNotMatch(source, /YUKASSA_WEBHOOK_SECRET are required/);
});

test('payments Lockbox readiness reports key names only when credentials are missing', () => {
  const validator = path.join(ROOT, 'check-payments-secret-payload.cjs');
  const fixture = JSON.stringify({
    entries: [{ key: 'YUKASSA_SHOP_ID', text_value: 'shop-secret-value' }],
  });
  const result = spawnSync(process.execPath, [validator], { input: fixture, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /YUKASSA_SECRET_KEY/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /shop-secret-value/);
});

test('payments Lockbox readiness rejects empty credential values', () => {
  const validator = path.join(ROOT, 'check-payments-secret-payload.cjs');
  const fixture = JSON.stringify({
    entries: [
      { key: 'YUKASSA_SHOP_ID', text_value: '   ' },
      { key: 'YUKASSA_SECRET_KEY', text_value: '' },
    ],
  });
  const result = spawnSync(process.execPath, [validator], { input: fixture, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /YUKASSA_SHOP_ID/);
  assert.match(result.stderr, /YUKASSA_SECRET_KEY/);
});

test('payments runtime loads dedicated credentials and accepts standard webhook without HMAC', () => {
  const source = read('heys-api-payments/index.js');

  assert.match(source, /require\('\.\/shared\/lockbox-client'\)/);
  assert.match(source, /async function initPaymentSecrets\(\)/);
  assert.match(source, /await initPaymentSecrets\(\)/);
  assert.match(source, /LOCKBOX_PAYMENTS_SECRET_ID/);
  assert.match(source, /paymentCredentials = Object\.freeze/);
  assert.doesNotMatch(source, /process\.env\[key\] = secrets\[key\]/);
  assert.doesNotMatch(source, /process\.env\.YUKASSA_(?:SHOP_ID|SECRET_KEY)/);
  assert.doesNotMatch(source, /YUKASSA_WEBHOOK_SECRET/);
  assert.doesNotMatch(source, /verifyWebhookSignature/);
  assert.doesNotMatch(source, /x-webhook-signature/i);
});

test('deploy preflights every selected target before the first cloud mutation', () => {
  const source = read('deploy-all.sh');
  const preflightLoop = source.indexOf('preflight_function "$func_name"');
  const deployLoop = source.indexOf('deploy_function "$func_name"');
  const deployFunction = source.slice(
    source.indexOf('# Deploy a single prevalidated function'),
    source.indexOf('update_api_gateway()'),
  );

  assert.notEqual(preflightLoop, -1);
  assert.notEqual(deployLoop, -1);
  assert.ok(preflightLoop < deployLoop);
  assert.ok(
    deployFunction.indexOf('validated_env_flags_for "$func_name"')
      < deployFunction.indexOf('yc serverless function version create'),
  );
  assert.ok(
    deployFunction.indexOf('write_deploy_status "deploying" "$func_name" "true"')
      < deployFunction.indexOf('yc serverless function version create'),
  );
  assert.match(source, /PREVALIDATED_ENV_FLAGS/);
  assert.match(source, /write_deploy_status "deploying" "\$CURRENT_DEPLOY_TARGET" "true"/);
  assert.match(source, /write_deploy_status "post-deploy" "\$CURRENT_DEPLOY_TARGET" "true"/);
  assert.match(source, /write_deploy_status "verification" "\$CURRENT_DEPLOY_TARGET" "true"/);
  assert.match(source, /deployed_functions=%s/);
  assert.match(source, /partial_rollout=%s/);
});

test('deploy workflow keeps Telegram plaintext out of function env', () => {
  const workflow = fs.readFileSync(
    path.resolve(ROOT, '..', '.github/workflows/cloud-functions-deploy.yml'),
    'utf8',
  );
  const createEnvStep = workflow.slice(
    workflow.indexOf('- name: Create .env file'),
    workflow.indexOf('- name: Verify production database migrations are current'),
  );
  const notificationSteps = workflow.slice(workflow.indexOf('- name: Notify Telegram on Success'));

  assert.match(workflow, /- "\.github\/workflows\/cloud-functions-deploy\.yml"/);
  assert.doesNotMatch(createEnvStep, /secrets\.TELEGRAM_(?:BOT_TOKEN|CHAT_ID)/);
  assert.doesNotMatch(createEnvStep, /secrets\.VAPID_PRIVATE_KEY/);
  assert.doesNotMatch(createEnvStep, /write_env_var VAPID_PRIVATE_KEY/);
  assert.match(
    createEnvStep,
    /write_env_var TELEGRAM_BOT_TOKEN "__IN_LOCKBOX__heys-app-secrets__"/,
  );
  assert.match(createEnvStep, /write_env_var TELEGRAM_CHAT_ID "__IN_LOCKBOX__heys-app-secrets__"/);
  assert.match(notificationSteps, /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
  assert.match(notificationSteps, /TELEGRAM_CHAT_ID: \$\{\{ secrets\.TELEGRAM_CHAT_ID \}\}/);
  assert.match(
    notificationSteps,
    /if: success\(\) && \(github\.event_name == 'workflow_dispatch' \|\| steps\.deployment-target\.outputs\.mode != 'none'\)/,
  );
});

test('scheduled monitoring runs no-retry canary and exact 429\/503 log scan', () => {
  const workflow = fs.readFileSync(
    path.resolve(ROOT, '..', '.github/workflows/api-health-monitor.yml'),
    'utf8',
  );
  assert.match(workflow, /serverless-ops-canary\.cjs --strict/);
  assert.match(workflow, /check-serverless-error-logs\.cjs --since 20m --strict/);
  assert.match(workflow, /Capacity canary/);
  assert.match(workflow, /429\/503 log scan/);
});

test('health monitor follows the flat production health contract', () => {
  const workflow = fs.readFileSync(
    path.resolve(ROOT, '..', '.github/workflows/api-health-monitor.yml'),
    'utf8',
  );
  assert.match(workflow, /jq -r '\.status \/\/ "unknown"'/);
  assert.match(workflow, /Health payload status:/);
  assert.doesNotMatch(workflow, /\.checks\.database\.status/);
  assert.doesNotMatch(workflow, /Database status: unknown/);
});
