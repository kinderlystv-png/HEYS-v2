import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_storage_supabase_v1.js'),
  'utf8',
);
const yandexApiSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_yandex_api_v1.js'),
  'utf8',
);
const appAuthInitSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_app_auth_init_v1.js'),
  'utf8',
);
const storageRegistrySource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_storage_registry_v1.js'),
  'utf8',
);
const coreSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_core_v12.js'),
  'utf8',
);
const dayAdviceSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/day/_advice.js'),
  'utf8',
);
const appHooksSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_app_hooks_v1.js'),
  'utf8',
);
const appGateFlowSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_app_gate_flow_v1.js'),
  'utf8',
);
const authSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_auth_v1.js'),
  'utf8',
);
const indexHtmlSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/index.html'),
  'utf8',
);
const storageLayerSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_storage_layer_v1.js'),
  'utf8',
);
const rpcFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-rpc/index.js'),
  'utf8',
);
const authFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-auth/index.js'),
  'utf8',
);
const restFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-rest/index.js'),
  'utf8',
);
const subscriptionSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_subscription_v1.js'),
  'utf8',
);
const subscriptionsSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_subscriptions_v1.js'),
  'utf8',
);
const trialQueueSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_trial_queue_v1.js'),
  'utf8',
);
const addProductStepSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_add_product_step_v1.js'),
  'utf8',
);
const consentsSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_consents_v1.js'),
  'utf8',
);
const cloudSharedSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_cloud_shared_v1.js'),
  'utf8',
);
const eventLogSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_event_log_v1.js'),
  'utf8',
);
const gamificationSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_gamification_v1.js'),
  'utf8',
);
const curatorActionsBannerSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_curator_actions_banner_v1.js'),
  'utf8',
);
const leaderboardSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_leaderboard_v1.js'),
  'utf8',
);
const piEarlyWarningSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/insights/pi_early_warning.js'),
  'utf8',
);
const messengerApiSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_messenger_api_v1.js'),
  'utf8',
);
const messengerSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_messenger_v1.js'),
  'utf8',
);
const userTabSource = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_user_tab_impl_v1.js'),
  'utf8',
);
const paymentsFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-payments/index.js'),
  'utf8',
);
const photosFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-photos/index.js'),
  'utf8',
);
const messagesFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-messages/index.js'),
  'utf8',
);
const pushFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-push/index.js'),
  'utf8',
);
const curatorCookieIdentityContractSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/__tests__/curator-cookie-identity.contract.test.cjs'),
  'utf8',
);
const rpcCuratorCookieContractSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-rpc/tests/curator_cookie_rpc.contract.test.js'),
  'utf8',
);
const paymentsAuthHelpersSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/heys-api-payments/shared/auth-helpers.js'),
  'utf8',
);
const safeUpsertMigrationSource = fs.readFileSync(
  path.resolve(__dirname, '../../database/2026-06-16_harden_safe_upsert_non_client_auth_keys.sql'),
  'utf8',
);
const batchUpsertMigrationSource = fs.readFileSync(
  path.resolve(__dirname, '../../database/2026-06-16_harden_batch_upsert_non_client_reporting.sql'),
  'utf8',
);
const sessionUpsertMigrationSource = fs.readFileSync(
  path.resolve(__dirname, '../../database/2026-06-16_harden_session_upsert_non_client_reporting.sql'),
  'utf8',
);
const legacyRpcUpsertMigrationSource = fs.readFileSync(
  path.resolve(__dirname, '../../database/2026-06-16_harden_legacy_rpc_client_kv_reporting.sql'),
  'utf8',
);
const writeClientKvValueMigrationSource = fs.readFileSync(
  path.resolve(__dirname, '../../database/2026-06-16_harden_write_client_kv_value_non_client_keys.sql'),
  'utf8',
);
const apiGatewaySpecSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/api-gateway-spec.yaml'),
  'utf8',
);
const apiGatewaySpecV2Source = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/api-gateway-spec-v2.yaml'),
  'utf8',
);
const cloudFunctionsDeployWorkflowSource = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/cloud-functions-deploy.yml'),
  'utf8',
);
const deployAllSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/deploy-all.sh'),
  'utf8',
);
const functionInventorySource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/function-inventory.cjs'),
  'utf8',
);
const cloudFunctionsHealthCheckSource = fs.readFileSync(
  path.resolve(__dirname, '../../yandex-cloud-functions/health-check.sh'),
  'utf8',
);
const indexSessionDetectionScript = indexHtmlSource.match(
  /<!-- Шаг 1: Детекция сессии[\s\S]*?<script>([\s\S]*?)<\/script>/,
)?.[1] || '';

function createMockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key) || '' : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    _store: store,
  };
}

function getGatewayRouteBlock(spec: string, route: string): string {
  const marker = `  ${route}:`;
  const start = spec.indexOf(marker);
  expect(start, `${route} route is missing from gateway spec`).toBeGreaterThanOrEqual(0);
  const rest = spec.slice(start + marker.length);
  const nextRouteOffset = rest.search(/\n  \/[^\n]+:/);
  if (nextRouteOffset === -1) return spec.slice(start);
  return spec.slice(start, start + marker.length + nextRouteOffset);
}

function expectGatewayCloudRoute(spec: string, route: string, method: string, functionId: string): void {
  const block = getGatewayRouteBlock(spec, route);
  expect(block).toContain(`${method}:`);
  expect(block).toContain('options:');
  expect(block).toContain('type: cloud_functions');
  expect(block).toContain(`function_id: ${functionId}`);
}

describe('TASK-005: write-context upload resilience', () => {
  it('preserves captured _ctx when grouping RPC upload batches by client', () => {
    expect(source).toMatch(/byClientId\[cid\]\.push\(\{[^}]*_ctx:\s*item\._ctx[^}]*\}\)/s);
  });

  it('bounds issue_write_context RPC calls with an explicit timeout', () => {
    expect(source).toContain('const WRITE_CONTEXT_ISSUE_TIMEOUT_MS = 15000');
    expect(source).toMatch(/raceWithTimeout\(\s*api\.rpc\('issue_write_context_by_curator'/s);
    expect(source).toMatch(/raceWithTimeout\(\s*api\.rpc\('issue_write_context_by_session'/s);
    expect(source).toContain('write_context_issue_timeout');
  });

  it('does not let required-context uploads silently proceed without context', () => {
    expect(source).toContain('ensureWriteContextForUpload');
    expect(source).toContain('contextState.required && !contextState.contextId');
    expect(source).toContain("recordWriteContextUnavailable('upload_blocked_no_context'");
    expect(source).toContain("return { success: false, error: 'write_context_unavailable' }");
  });

  it('expires the UI session when write-context issue reports an invalid PIN session', () => {
    expect(source).toMatch(/function isAuthFailure\(err\)[\s\S]*err\.raw\?\.reason[\s\S]*invalid_session/);
    expect(source).toMatch(/const issueError = res\?\.error \|\| res\?\.data \|\| \{\};[\s\S]*isAuthFailure\(issueError\)[\s\S]*isSessionTokenMissing\(res\)[\s\S]*dispatchSessionExpiredOnce\('write_context_issue'/);
  });

  // Regression 2026-06-15: PIN-сессии всегда били в curator-RPC → 401.
  // Причина — решение isCurator читало флаги lastIsCuratorAuth/lastIsPinAuth,
  // которые НИКОГДА не выставлялись (мертвы с a08ca222) → всегда true.
  it('routes the write-context RPC by real auth mode, not dead flags', () => {
    // Мёртвые флаги больше не читаются в коде (упоминание в комментарии ок).
    expect(source).not.toContain('global.HEYS?.lastIsCuratorAuth');
    expect(source).not.toContain('global.HEYS?.lastIsPinAuth');
    // Решение опирается на авторитетный module-state isPinAuthClient().
    expect(source).toMatch(/const isCurator = !cloud\.isPinAuthClient\?\.\(\)/);
  });

  it('allows HttpOnly curator-cookie sessions to enqueue client KV saves', () => {
    expect(source).toMatch(/const hasCuratorHint = \(\(\) => \{[\s\S]*heys_curator_cookie_session_hint/);
    expect(source).toMatch(/if \(!user && !hasCuratorHint && !devToken\) \{/);
    expect(source).toMatch(/api\.verifyCuratorToken\(devToken \|\| undefined\)/);
  });

  it('routes curator write-context through the cookie-compatible curator RPC', () => {
    expect(yandexApiSource).toMatch(/CURATOR_ONLY_FUNCTIONS[\s\S]*'issue_write_context_by_curator'/);
    expect(yandexApiSource).toMatch(/function buildCuratorRequestHeaders\(baseHeaders = \{\}\)[\s\S]*shouldTryCookieCuratorRequest\(\)/);
  });

  it('preserves auth verify expiry for curator JWT session restore', () => {
    expect(yandexApiSource).toContain('expires_at: data.expires_at');
  });

  it('purges legacy curator JWT markers and keeps only a cookie probe hint', () => {
    expect(appAuthInitSource).toMatch(/const hadLegacyCuratorMarker =[\s\S]*heys_curator_session[\s\S]*heys_supabase_auth_token/);
    expect(appAuthInitSource).toMatch(/removeGlobalValue\('heys_curator_session'\);[\s\S]*removeGlobalValue\('heys_supabase_auth_token'\);/);
    expect(appAuthInitSource).toContain("localStorage.setItem('heys_curator_cookie_session_hint', '1')");
    expect(indexSessionDetectionScript).toContain('var hadLegacyCuratorMarker');
    expect(indexSessionDetectionScript).not.toContain('restoreCompatCuratorAuth');
  });

  it('keeps restored curator sessions visible to the sync auth runtime', () => {
    expect(source).toContain('cloud.setAuthUser = function (nextUser)');
    expect(source).toMatch(/cloud\.setAuthUser = function \(nextUser\)[\s\S]*user = nextUser;[\s\S]*_rpcOnlyMode = true;[\s\S]*_pinAuthClientId = null;/);
    expect(appAuthInitSource).toMatch(/const setRestoredCuratorUser = \(restoredUser\) => \{[\s\S]*setCloudUser\(restoredUser\);[\s\S]*cloudRef\?\.setAuthUser\?\.\(restoredUser\);/);
    expect(appAuthInitSource).toContain('setRestoredCuratorUser(user)');
  });

  it('does not let PIN recovery override a cookie-only curator session', () => {
    expect(appAuthInitSource).toContain("const shouldProbeCookieCuratorSession = !hasPinSession");
    expect(source).toMatch(/const hasCuratorSession = !!global\.localStorage\.getItem\('heys_curator_cookie_session_hint'\)[\s\S]*if \(pinAuthClient && !hasCuratorSession\)/);
  });

  it('recovers a cookie-only PIN session when local PIN markers are missing', () => {
    expect(yandexApiSource).toContain('async function getCurrentClientBySession()');
    expect(yandexApiSource).toMatch(/rpc\('get_client_data_by_session', \{\}\)/);
    expect(yandexApiSource).toContain('getCurrentClientBySession,');
    expect(appAuthInitSource).toContain('shouldProbeCookiePinSession');
    expect(appAuthInitSource).toContain('shouldProbeCookieCuratorSession');
    expect(appAuthInitSource).toContain('HEYS.YandexAPI.getCurrentClientBySession()');
    expect(appAuthInitSource).toMatch(/localStorage\.setItem\('heys_pin_auth_client', cid\)/);
    expect(appAuthInitSource).toMatch(/cloudRef\.syncClient\(cid\)/);
  });

  it('falls back to HttpOnly curator cookie restore when local curator markers are missing', () => {
    expect(yandexApiSource).toMatch(/async function verifyCuratorToken\(token\)[\s\S]*credentials: 'include'[\s\S]*body: JSON\.stringify\(token \? \{ token \} : \{\}\)/);
    expect(appAuthInitSource).toMatch(/const shouldProbeCookieCuratorSession = !hasPinSession[\s\S]*hasCookieSessionHint\('curator'\)[\s\S]*typeof HEYS\.YandexAPI\?\.verifyCuratorToken === 'function'/);
    expect(appAuthInitSource).toMatch(/const clearInvalidCookiePinSession = \(\) => \{[\s\S]*removeGlobalValue\('heys_pin_auth_client'\);[\s\S]*clientLogout/);
    expect(appAuthInitSource).toMatch(/restoreCookiePinSession\(\)[\s\S]*const cleanup = isPinRestoreAuthError\(err\)[\s\S]*clearInvalidCookiePinSession\(\)[\s\S]*return cleanup\.then\(\(\) => restoreCookieCuratorSession\(\)\)/);
    expect(appAuthInitSource).toMatch(/const restoreCookieCuratorSession = \(\) => \{[\s\S]*HEYS\.YandexAPI\.verifyCuratorToken\(\)[\s\S]*const user = data\.user[\s\S]*setRestoredCuratorUser\(user\)[\s\S]*initLocalData\(\{ skipClientRestore: false, skipPinAuthRestore: true \}\)/);
  });

  it('lets ensureValidToken rebuild runtime auth from the HttpOnly curator cookie', () => {
    expect(source).toMatch(/const hasCuratorHint = \(\(\) => \{[\s\S]*heys_curator_cookie_session_hint/);
    expect(source).toMatch(/api\.verifyCuratorToken\(devToken \|\| undefined\)[\s\S]*user = data\.user;[\s\S]*status = CONNECTION_STATUS\.ONLINE;/);
  });

  it('clears both curator auth keys on confirmed auth failure', () => {
    expect(source).toMatch(/localStorage\.removeItem\('heys_supabase_auth_token'\);[\s\S]*localStorage\.removeItem\('heys_curator_session'\);/);
  });

  it('keeps switchClient and early restore on the curator path with a cookie hint', () => {
    expect(source).toMatch(/const hasCuratorSession = !!global\.localStorage\.getItem\('heys_curator_cookie_session_hint'\)[\s\S]*if \(pinAuthClient && !hasCuratorSession\)/);
    expect(source).toMatch(/cloud\.setAuthUser = function \(nextUser\)[\s\S]*_pinAuthClientId = null;/);
  });

  it('protects curator JWT from storage cleanup and legacy namespacing', () => {
    expect(source).toMatch(/NON_CLIENT_DATA_BLACKLIST[\s\S]*'heys_supabase_auth_token'[\s\S]*'heys_pin_auth_client'[\s\S]*'heys_session_token'/);
    expect(storageRegistrySource).toMatch(/NEVER_TOUCH[\s\S]*\/\^heys_curator_session\$\/,/);
    expect(storageRegistrySource).toMatch(/register\('auth_curator_jwt'[\s\S]*pattern: \/\^heys_curator_session\$\//);
    expect(coreSource).toContain('supabase_auth_token|curator_session|pin_auth_client');
    expect(storageLayerSource).toContain('supabase_auth_token|curator_session|pin_auth_client');
    expect(storageLayerSource).toContain("'heys_supabase_auth_token', 'heys_pin_auth_client', 'heys_session_token'");
    expect(storageLayerSource).toContain("const CLEANUP_MARKER = 'heys_cleanup_scoped_uikeys_v2'");
  });

  it('keeps server-side non-client-data blacklist in sync for auth/session keys', () => {
    expect(rpcFunctionSource).toContain("'heys_curator_session'");
    expect(rpcFunctionSource).toContain("'heys_supabase_auth_token'");
    expect(rpcFunctionSource).toContain("'heys_pin_auth_client'");
    expect(rpcFunctionSource).toContain("'heys_session_token'");
    expect(rpcFunctionSource).toMatch(/function isNonClientDataKey\(k\)[\s\S]*stripClientScopeFromKey\(k\)/);
  });

  it('keeps cookie-only PIN logout able to revoke and clear the HttpOnly session cookie', () => {
    expect(rpcFunctionSource).toContain("'revoke_session'");
    expect(rpcFunctionSource).toMatch(/if \(cookieSessionToken && !hasAnySessionTokenParam\(params\) && acceptsCookieSessionToken\(fnName\)\) \{[\s\S]*params\.p_session_token = cookieSessionToken;/);
    expect(rpcFunctionSource).toMatch(/else if \(fnName === 'revoke_session'\) \{[\s\S]*heys_session_token=; Domain=\.heyslab\.ru; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=0/);
    expect(rpcFunctionSource).not.toMatch(/fnName === 'revoke_session'[\s\S]{0,120}typeof inner === 'object'[\s\S]{0,120}inner\.success/);
    expect(authSource).toMatch(/shouldTryCookieLogout = !!host && host !== 'localhost' && host !== '127\.0\.0\.1';/);
    expect(authSource).toMatch(/api && \(token \|\| shouldTryCookieLogout\)/);
    expect(authSource).toMatch(/api\.rpc\('revoke_session', token \? \{ p_session_token: token \} : \{\}\)/);
  });

  it('keeps /auth/client-logout cookie-only compatible and clearing HttpOnly session cookie', () => {
    expect(yandexApiSource).toMatch(/shouldTryCookieLogout = !!host && host !== 'localhost' && host !== '127\.0\.0\.1';/);
    expect(yandexApiSource).toMatch(/if \(!sessionToken && !shouldTryCookieLogout\) \{/);
    expect(yandexApiSource).toMatch(/credentials: 'include'[\s\S]*body: JSON\.stringify\(sessionToken \? \{ session_token: sessionToken \} : \{\}\)/);
    expect(authFunctionSource).toContain("part.slice(0, eqIdx).trim() !== 'heys_session_token'");
    expect(authFunctionSource).toContain("'heys_session_token=; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'");
    expect(authFunctionSource).toContain("'heys_session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'");
    expect(authFunctionSource).toMatch(/const CLEAR_CLIENT_SESSION_COOKIES = \[[\s\S]*Domain=\.heyslab\.ru[\s\S]*heys_session_token=; HttpOnly/);
    expect(authFunctionSource).toMatch(/return withClearCookies\(\{[\s\S]*statusCode: 200,[\s\S]*revoked: false[\s\S]*\}, CLEAR_CLIENT_SESSION_COOKIES\)/);
    expect(authFunctionSource).toMatch(/__cookie_header: event\.headers\?\.cookie \|\| event\.headers\?\.Cookie \|\| ''/);
  });

  it('keeps static login gate able to persist HttpOnly auth cookies', () => {
    expect(indexHtmlSource).toMatch(/fetch\(API \+ '\/rpc\?fn=verify_client_pin_v3', \{[\s\S]*credentials: 'include'/);
    expect(indexHtmlSource).toMatch(/fetch\(API \+ '\/auth\/login', \{[\s\S]*credentials: 'include'/);
    expect(indexHtmlSource).toMatch(/fetch\(API \+ '\/auth\/curator-logout', \{[\s\S]*credentials: 'include'/);
    expect(indexHtmlSource).toMatch(/fetch\(API \+ '\/auth\/client-logout', \{[\s\S]*credentials: 'include'/);
  });

  it('keeps auth logout endpoints reachable through API Gateway specs', () => {
    for (const spec of [apiGatewaySpecSource, apiGatewaySpecV2Source]) {
      for (const route of ['/auth/client-logout', '/auth/curator-logout']) {
        expectGatewayCloudRoute(spec, route, 'post', 'd4ef3c4o67vdg7o4c4d3');
      }
    }
  });

  it('keeps API Gateway spec changes wired into deployment verification', () => {
    expect(cloudFunctionsDeployWorkflowSource).toContain('yandex-cloud-functions/api-gateway-spec.yaml');
    expect(cloudFunctionsDeployWorkflowSource).not.toContain('yandex-cloud-functions/api-gateway-spec-v2.yaml');
    expect(functionInventorySource).toContain("mode: 'gateway-only'");
    expect(cloudFunctionsDeployWorkflowSource).toContain('Gateway spec only — skipping function deploy');
    expect(cloudFunctionsDeployWorkflowSource).toMatch(/yc serverless api-gateway update[\s\S]*--id=d5d7939njvjp27ofsok0[\s\S]*--spec=api-gateway-spec\.yaml/);
    expect(cloudFunctionsDeployWorkflowSource).toContain('function-inventory.cjs --resolve --github-output');
    expect(cloudFunctionsDeployWorkflowSource).toContain('yandex-cloud-functions/test-functions.sh');
  });

  it('keeps manual auth deploy path updating API Gateway routes', () => {
    expect(deployAllSource).toContain('API_GATEWAY_ID="${API_GATEWAY_ID:-d5d7939njvjp27ofsok0}"');
    expect(deployAllSource).toContain('API_GATEWAY_SPEC="${API_GATEWAY_SPEC:-$SCRIPT_DIR/api-gateway-spec.yaml}"');
    expect(deployAllSource).toMatch(/update_api_gateway\(\)[\s\S]*yc serverless api-gateway update[\s\S]*--id "\$API_GATEWAY_ID"[\s\S]*--spec "\$API_GATEWAY_SPEC"/);
    // Переменная цикла деплоя называется `func_name` (раньше `TARGET_FUNC`).
    // Контракт прежний: после выката heys-api-auth шлюз обязан обновиться.
    expect(deployAllSource).toMatch(/if \[ "\$func_name" = "heys-api-auth" \]; then[\s\S]*SHOULD_UPDATE_GATEWAY=true/);
    // Групповой деплой api/all тоже обновляет шлюз — иначе роуты разъедутся с функциями.
    expect(deployAllSource).toMatch(/"\$DEPLOY_GROUP" == "api" \|\| "\$DEPLOY_GROUP" == "all"[\s\S]*SHOULD_UPDATE_GATEWAY=true/);
  });

  it('keeps cookie-auth cloud functions covered by CI/manual all deploys', () => {
    for (const functionName of ['heys-api-push', 'heys-api-messages', 'heys-api-photos']) {
      expect(functionInventorySource).toContain(`name: '${functionName}'`);
      expect(functionInventorySource).toMatch(new RegExp(`name: '${functionName}'[^\n]+autoDeploy: true`));
    }
    // Публичные VAPID-параметры прокидываются через CI-секреты.
    for (const envName of ['VAPID_PUBLIC_KEY', 'VAPID_SUBJECT']) {
      expect(cloudFunctionsDeployWorkflowSource).toContain(`${envName}: \${{ secrets.${envName} }}`);
      expect(cloudFunctionsDeployWorkflowSource).toContain(`write_env_var ${envName} "$${envName}"`);
    }
    // Приватный ключ намеренно НЕ ходит через GitHub Actions env: он выдаётся
    // функции ссылкой на Lockbox. Тест удерживает именно этот контракт, иначе
    // возврат секрета в CI-переменные пройдёт незамеченным.
    expect(cloudFunctionsDeployWorkflowSource).not.toContain('VAPID_PRIVATE_KEY');
    expect(deployAllSource).toContain('VAPID_PRIVATE_KEY=__IN_LOCKBOX__');
    // S3-доступы, как и приватный VAPID, живут в Lockbox: функция получает
    // ссылку на секрет, а не сами ключи через CI-переменные.
    for (const envName of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      expect(cloudFunctionsDeployWorkflowSource).not.toContain(envName);
    }
    expect(deployAllSource).toContain('LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID');
    expect(deployAllSource).toContain('done < <(selected_functions)');
    expect(deployAllSource).toContain('"$TEST_SCRIPT" "${PREDEPLOY_TARGETS[@]}"');

    const pushFunctionId = 'd4e2d7p20llki46ctf2b';
    const messageFunctionId = 'd4ep21a89307vs93b0ns';
    const photoFunctionId = 'd4e93t0lrfu4ng62pqa1';
    const gatewayRoutes: Array<[string, string, string]> = [
      ['/push/vapid-key', 'get', pushFunctionId],
      ['/push/subscribe', 'post', pushFunctionId],
      ['/push/unsubscribe', 'post', pushFunctionId],
      ['/push/prefs', 'post', pushFunctionId],
      ['/push/test', 'post', pushFunctionId],
      ['/messages/send', 'post', messageFunctionId],
      ['/messages/thread', 'get', messageFunctionId],
      ['/messages/inbox', 'get', messageFunctionId],
      ['/messages/mark-read', 'post', messageFunctionId],
      ['/messages/toggle-done', 'post', messageFunctionId],
      ['/messages/toggle-acked', 'post', messageFunctionId],
      ['/messages/delete', 'post', messageFunctionId],
      ['/messages/edit', 'post', messageFunctionId],
      ['/messages/unread-count', 'get', messageFunctionId],
      ['/photos/upload', 'post', photoFunctionId],
      ['/photos/delete', 'post', photoFunctionId],
    ];
    for (const [route, method, functionId] of gatewayRoutes) {
      expectGatewayCloudRoute(apiGatewaySpecSource, route, method, functionId);
    }
  });

  it('keeps manual health checks covering auth logout gateway routes', () => {
    expect(cloudFunctionsHealthCheckSource).toMatch(/if \[ "\$method" == "POST" \]; then[\s\S]*elif \[ "\$method" == "OPTIONS" \]; then/);
    expect(cloudFunctionsHealthCheckSource).toContain('Access-Control-Request-Method: POST');
    expect(cloudFunctionsHealthCheckSource).toContain('Client Logout CORS');
    expect(cloudFunctionsHealthCheckSource).toContain('$API_URL/auth/client-logout');
    expect(cloudFunctionsHealthCheckSource).toContain('Curator Logout CORS');
    expect(cloudFunctionsHealthCheckSource).toContain('$API_URL/auth/curator-logout');
  });

  it('keeps curator HttpOnly cookie usable when localStorage JWT is absent', () => {
    expect(yandexApiSource).toContain('function shouldTryCookieCuratorRequest()');
    expect(yandexApiSource).toContain('function buildCuratorRequestHeaders(baseHeaders = {})');
    expect(yandexApiSource).toContain('function hasCuratorRuntimeContext()');
    expect(yandexApiSource).toContain('function shouldUseCuratorAuthPath()');
    expect(yandexApiSource).toMatch(/async function verifyCuratorToken\(token\)[\s\S]*if \(token\) headers\.Authorization = `Bearer \$\{token\}`;[\s\S]*credentials: 'include'[\s\S]*body: JSON\.stringify\(token \? \{ token \} : \{\}\)/);
    expect(yandexApiSource).toMatch(/if \(!curatorToken && !shouldTryCookieCurator\) \{[\s\S]*requires curator token/);
    expect(yandexApiSource).toMatch(/log\(`RPC: \$\{fnName\} — using HttpOnly curator cookie`\)/);
    expect(yandexApiSource).toMatch(/async function saveKV[\s\S]*const useCuratorPath = shouldUseCuratorAuthPath\(\);[\s\S]*rpc\('batch_upsert_client_kv_by_curator'/);
    expect(yandexApiSource).toMatch(/async function curatorLogout\(\)[\s\S]*localStorage\.removeItem\('heys_curator_session'\)[\s\S]*\/auth\/curator-logout[\s\S]*credentials: 'include'[\s\S]*clearLocalCuratorAuth\(\)/);
    expect(authSource).toMatch(/typeof api\.curatorLogout !== 'function' \|\| typeof api\.clientLogout !== 'function'[\s\S]*role_switch_cleanup_api/);
    expect(authSource).toMatch(/const cleanup = await api\.curatorLogout\?\.\(\);[\s\S]*if \(cleanup && cleanup\.ok === false\)[\s\S]*await api\.clientLogout\?\.\(\);[\s\S]*role_switch_cleanup_failed/);
    expect(yandexApiSource).toMatch(/async function curatorLogin[\s\S]*const cleanup = await clientLogout\(\);[\s\S]*if \(cleanup && cleanup\.ok === false\)[\s\S]*await curatorLogout\(\);[\s\S]*ROLE_SWITCH_CLEANUP_FAILED/);
    expect(yandexApiSource).toMatch(/const url = `\$\{CONFIG\.API_URL\}\/auth\/clients`;[\s\S]*headers: curatorAuth\.headers,[\s\S]*credentials: 'include'/);
    expect(yandexApiSource).toMatch(/payments\/refund[\s\S]*headers: curatorAuth\.headers,[\s\S]*credentials: 'include'/);
    expect(rpcFunctionSource).toContain("part.slice(0, eqIdx).trim() === 'heys_curator_jwt'");
    expect(rpcCuratorCookieContractSource).toContain('heys_curator_jwt=');
    expect(rpcCuratorCookieContractSource).toContain('admin_get_trial_queue_list SQL should run after curator cookie auth');
    expect(authFunctionSource).toContain("getCookieValue(event.headers?.cookie || event.headers?.Cookie || '', 'heys_curator_jwt')");
    expect(authFunctionSource).toContain("case 'curator-logout':");
    expect(authFunctionSource).toContain("'heys_curator_jwt=; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'");
    expect(authFunctionSource).toContain('const curatorAuthHeader = curatorToken ? `Bearer ${curatorToken}` :');
    expect(restFunctionSource).toContain("token = getCookieValue(h.cookie || h.Cookie || '', 'heys_curator_jwt')");
    expect(paymentsAuthHelpersSource).toContain('function extractCuratorJwt(event)');
    expect(paymentsAuthHelpersSource).toContain("return extractCookieToken(event, 'heys_curator_jwt')");
    expect(paymentsFunctionSource).toContain('const token = extractCuratorJwt(event)');
    expect(photosFunctionSource).toContain('function parseCuratorCookie(cookieHeader)');
    expect(photosFunctionSource).toContain("return parseCookieToken(cookieHeader, 'heys_curator_jwt')");
    expect(photosFunctionSource).toMatch(/const bearerLooksLikeJwt = bearer\.split\('\.'\)\.length === 3 && bearer\.includes\('\.'\);[\s\S]*const curatorJwt = \(bearerLooksLikeJwt \? bearer : ''\) \|\| cookieCuratorJwt;/);
    expect(messengerApiSource).toMatch(/function looksLikeCuratorToken\(\) \{[\s\S]*HEYS\.auth\?\.isCuratorSession\?\.\(\) === true[\s\S]*HEYS\.cloud\?\.getUser\?\.\(\)[\s\S]*token\.split\('\.'\)\.length === 3/);
    expect(messengerSource).toMatch(/function isCuratorMode\(\) \{[\s\S]*HEYS\.auth\?\.isCuratorSession\?\.\(\) === true[\s\S]*HEYS\.cloud\?\.getUser\?\.\(\)/);
    expect(userTabSource).toMatch(/function HEYS_PushSettingsCard\(\) \{[\s\S]*HEYS\.auth\?\.isCuratorSession\?\.\(\) === true[\s\S]*HEYS\.cloud\?\.getUser\?\.\(\)[\s\S]*heys_curator_cookie_session_hint/);
    expect(messagesFunctionSource).toContain('function parseCuratorCookie(cookieHeader)');
    expect(messagesFunctionSource).toContain("return parseCookieToken(cookieHeader, 'heys_curator_jwt')");
    expect(messagesFunctionSource).toMatch(/const bearerLooksLikeJwt = bearer\.split\('\.'\)\.length === 3 && bearer\.includes\('\.'\);[\s\S]*const curatorJwt = \(bearerLooksLikeJwt \? bearer : ''\) \|\| cookieCuratorJwt;/);
    expect(pushFunctionSource).toContain('function parseCuratorCookie(cookieHeader)');
    expect(pushFunctionSource).toContain("return parseCookieToken(cookieHeader, 'heys_curator_jwt')");
    expect(pushFunctionSource).toMatch(/const bearerLooksLikeJwt = bearer\.split\('\.'\)\.length === 3 && bearer\.includes\('\.'\);[\s\S]*const curatorJwt = \(bearerLooksLikeJwt \? bearer : ''\) \|\| cookieCuratorJwt;/);
    expect(curatorCookieIdentityContractSource).toContain('accepts HttpOnly curator cookie before route dispatch');
    expect(curatorCookieIdentityContractSource).toContain('heys_curator_jwt=');
  });

  it('keeps payments create/status compatible with HttpOnly cookie-only PIN sessions', () => {
    expect(yandexApiSource).toContain('function shouldTryCookieSessionRequest()');
    expect(yandexApiSource).toMatch(/const shouldTryCookieSession = shouldTryCookieSessionRequest\(\);[\s\S]*if \(!sessionToken && !shouldTryCookieSession\) \{[\s\S]*createPayment: no session token/);
    expect(yandexApiSource).toMatch(/const response = await fetch\(`\$\{CONFIG\.API_URL\}\/payments\/create`, \{[\s\S]*credentials: 'include'/);
    expect(yandexApiSource).toMatch(/getPaymentStatus[\s\S]*const shouldTryCookieSession = shouldTryCookieSessionRequest\(\);[\s\S]*if \(!sessionToken && !shouldTryCookieSession\) \{[\s\S]*getPaymentStatus: no session token/);
    expect(yandexApiSource).toMatch(/payments\/status\?paymentId=[\s\S]*credentials: 'include'/);
    expect(paymentsFunctionSource).toContain("'Access-Control-Allow-Credentials': 'true'");
    expect(paymentsAuthHelpersSource).toContain("headers.cookie || headers.Cookie || ''");
    expect(paymentsAuthHelpersSource).toContain("part.slice(0, eqIdx).trim() !== 'heys_session_token'");
    expect(paymentsAuthHelpersSource).toContain('decodeURIComponent(encoded)');
  });

  it('keeps legacy session-token RPCs covered by HttpOnly cookie injection', () => {
    expect(rpcFunctionSource).toContain('const COOKIE_SESSION_TOKEN_FUNCTIONS = new Set([');
    expect(rpcFunctionSource).toContain("'request_trial'");
    expect(rpcFunctionSource).toContain("'get_trial_queue_status'");
    expect(rpcFunctionSource).toContain("'cancel_trial_queue'");
    expect(rpcFunctionSource).toContain("'update_shared_product_portions'");
    expect(rpcFunctionSource).toContain("'get_my_curator_changelog_since'");
    expect(rpcFunctionSource).toContain("'ack_curator_changelog'");
    expect(rpcFunctionSource).toContain("'delete_my_account'");
    expect(rpcFunctionSource).toMatch(/if \(cookieSessionToken && !hasAnySessionTokenParam\(params\) && acceptsCookieSessionToken\(fnName\)\) \{[\s\S]*params\.p_session_token = cookieSessionToken;/);
    expect(rpcFunctionSource).toMatch(/if \(acceptsCookieSessionToken\(fnName\) && !hasAnySessionTokenParam\(params\)\) \{[\s\S]*reason: 'missing_session_token'/);
    expect(rpcFunctionSource).toMatch(/'request_trial': \{[\s\S]*'p_session_token': '::text'[\s\S]*'p_source': '::text'/);
    expect(rpcFunctionSource).toMatch(/'delete_my_account': \{[\s\S]*'p_session_token': '::text'/);
  });

  it('keeps old frontend session-token consumers from pre-blocking cookie-only PIN sessions', () => {
    expect(subscriptionSource).toMatch(/const rpcParams = \{\};[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*api\.rpc\('get_subscription_status_by_session', rpcParams\)/);
    expect(subscriptionsSource).toMatch(/const rpcParams = \{\};[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*HEYS\.YandexAPI\.rpc\('get_subscription_status_by_session', rpcParams\)/);
    expect(trialQueueSource).toMatch(/const rpcParams = \{[\s\S]*p_source: source[\s\S]*\};[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*api\.rpc\('request_trial', rpcParams\)/);
    expect(trialQueueSource).toMatch(/api\.rpc\('get_trial_queue_status', rpcParams\)/);
    expect(trialQueueSource).toMatch(/api\.rpc\('cancel_trial_queue', rpcParams\)/);
    expect(trialQueueSource).toMatch(/const hasCuratorAuthContext = \(\) => \{[\s\S]*HEYS\.auth\?\.isCuratorSession\?\.\(\) === true[\s\S]*HEYS\.cloud\?\.getUser\?\.\(\)[\s\S]*localStorage\.getItem\('heys_curator_cookie_session_hint'\)/);
    expect(trialQueueSource).not.toMatch(/const curatorSession = localStorage\.getItem\('heys_curator_session'\);[\s\S]{0,80}if \(!curatorSession\)/);
    expect(addProductStepSource).not.toContain('Нет авторизации для обновления порций');
    expect(addProductStepSource).toMatch(/if \(!isCuratorMode && sessionToken\) \{[\s\S]*rpcParams\.p_session_token = sessionToken;/);
    expect(consentsSource).toMatch(/deleteMyAccount\(sessionToken \|\| null\)/);
    expect(cloudSharedSource).toMatch(/const rpcParams = \{[\s\S]*p_name: product\.name,[\s\S]*p_product_data: \{[\s\S]*\.\.\.product[\s\S]*\};[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*YandexAPI\.rpc\('create_pending_product_by_session', rpcParams\)/);
    expect(source).toMatch(/const host = global\.location && global\.location\.hostname \|\| '';[\s\S]*const hasCookieSession = !!cloud\.isPinAuthClient\?\.\(\) \|\|[\s\S]*host !== 'localhost' && host !== '127\.0\.0\.1'[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*YandexAPI\.rpc\('create_pending_product_by_session', rpcParams\)/);
    expect(eventLogSource).toMatch(/const rpcParams = \{[\s\S]*p_events: batch[\s\S]*\};[\s\S]*if \(sessionToken\) rpcParams\.p_session_token = sessionToken;[\s\S]*YandexAPI\.rpc\('log_client_event_by_session', rpcParams\)/);
    expect(gamificationSource).toContain('function hasCookieSessionCarrier()');
    expect(gamificationSource).toContain('function withOptionalSessionToken(params, sessionToken)');
    expect(gamificationSource).toMatch(/const canUseCurator = isCuratorSession && clientId;/);
    expect(gamificationSource).toMatch(/if \(isCuratorSession && clientId && \(result\.error\?\.code === 401 \|\| result\.error\?\.code === 403\)\)/);
    expect(gamificationSource).toMatch(/const hasSession = Boolean\([\s\S]*HEYS\.auth\?\.getSessionToken\?\.\(\)[\s\S]*localStorage\.getItem\('heys_session_token'\)[\s\S]*hasCookieSessionCarrier\(\)/);
    expect(gamificationSource).not.toContain('const canUseCurator = isCuratorSession && curatorToken && clientId');
    expect(leaderboardSource).toContain('function _withSessionToken(params)');
    expect(curatorActionsBannerSource).toMatch(/function getPinSessionContextKey\(\) \{[\s\S]*HEYS\.cloud\?\.isPinAuthClient\?\.\(\) === true[\s\S]*HEYS\.auth\?\.getSessionToken\?\.\(\)[\s\S]*readLocalStorageValue\('heys_session_token'\)[\s\S]*readLocalStorageValue\('heys_pin_auth_client'\)/);
    expect(curatorActionsBannerSource).toContain('if (!contextKey)');
    expect(curatorActionsBannerSource).not.toContain("_hasPinSession = !!localStorage.getItem('heys_session_token')");
    expect(piEarlyWarningSource).toContain('function hasWeeklyCookieSessionCarrier()');
    expect(piEarlyWarningSource).toMatch(/function hasWeeklyCookieSessionCarrier\(\) \{[\s\S]*HEYS\.cloud\?\.isPinAuthClient\?\.\(\)[\s\S]*HEYS\.auth\?\.isCuratorSession\?\.\(\) === true[\s\S]*return false;[\s\S]*HEYS\.cloud\?\.getUser\?\.\(\)[\s\S]*return false;/);
    expect(piEarlyWarningSource).not.toContain('PIN auth clients have no user session');
  });

  it('keeps DB safe_upsert REST fallback guarded for auth/session keys', () => {
    expect(safeUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.is_client_kv_non_client_key');
    expect(safeUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.reject_client_kv_non_client_key');
    expect(safeUpsertMigrationSource).toContain('CREATE TRIGGER client_kv_reject_non_client_key');
    expect(safeUpsertMigrationSource).toContain('BEFORE INSERT OR UPDATE ON public.client_kv_store');
    expect(safeUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.safe_upsert_client_kv');
    expect(safeUpsertMigrationSource).toContain("regexp_replace(coalesce(p_key, ''), '^heys_[0-9a-f-]{36}_', 'heys_', 'i')");
    expect(safeUpsertMigrationSource).toContain("'heys_curator_session'");
    expect(safeUpsertMigrationSource).toContain("'heys_supabase_auth_token'");
    expect(safeUpsertMigrationSource).toContain("'heys_pin_auth_client'");
    expect(safeUpsertMigrationSource).toContain("'heys_session_token'");
    expect(safeUpsertMigrationSource).toContain("'non_client_data'");
  });

  it('surfaces DB non-client-data rejects through REST blockedItems', () => {
    expect(restFunctionSource).toContain("res?.error === 'data_loss_protection' || res?.error === 'non_client_data'");
    expect(restFunctionSource).toContain('blockedItems.push({ k: row.k, reason: res.error })');
  });

  it('keeps DB curator batch upsert from reporting rejected auth/session keys as saved', () => {
    expect(batchUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_curator');
    expect(batchUpsertMigrationSource).toContain('public.is_client_kv_non_client_key(v_key)');
    expect(batchUpsertMigrationSource).toContain("'reason', 'non_client_data'");
    expect(batchUpsertMigrationSource).toContain('IF v_new_revision IS NULL THEN');
    expect(batchUpsertMigrationSource).toContain("'reason', 'write_skipped'");
    expect(batchUpsertMigrationSource).toContain("'error', CASE WHEN v_saved = 0 AND v_rejected_count > 0 THEN 'not_client_data'");
  });

  it('keeps DB PIN/session upserts from reporting rejected auth/session keys as saved', () => {
    expect(sessionUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.upsert_client_kv_by_session');
    expect(sessionUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_session');
    expect(sessionUpsertMigrationSource).toContain('public.is_client_kv_non_client_key(p_key)');
    expect(sessionUpsertMigrationSource).toContain('public.is_client_kv_non_client_key(v_key)');
    expect(sessionUpsertMigrationSource).toContain("'error', 'non_client_data'");
    expect(sessionUpsertMigrationSource).toContain('RETURNING revision INTO v_new_revision');
    expect(sessionUpsertMigrationSource).toContain('IF v_new_revision IS NULL THEN');
    expect(sessionUpsertMigrationSource).toContain("'error', CASE WHEN v_saved = 0 AND v_rejected_count > 0 THEN 'not_client_data'");
  });

  it('keeps legacy heys_rpc client-id KV upserts guarded despite live grant drift', () => {
    expect(legacyRpcUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.save_client_kv');
    expect(legacyRpcUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.upsert_client_kv');
    expect(legacyRpcUpsertMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv');
    expect(legacyRpcUpsertMigrationSource).toContain('public.is_client_kv_non_client_key(p_key)');
    expect(legacyRpcUpsertMigrationSource).toContain('public.is_client_kv_non_client_key(v_key)');
    expect(legacyRpcUpsertMigrationSource).toContain('user_id = EXCLUDED.user_id');
    expect(legacyRpcUpsertMigrationSource).toContain('RETURNING revision INTO v_new_revision');
    expect(legacyRpcUpsertMigrationSource).toContain('IF v_new_revision IS NULL THEN');
    expect(legacyRpcUpsertMigrationSource).toContain('GRANT EXECUTE ON FUNCTION public.save_client_kv(uuid, text, jsonb) TO heys_rpc');
    expect(legacyRpcUpsertMigrationSource).toContain('GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) TO heys_rpc');
  });

  it('keeps lower-level write_client_kv_value guarded for direct heys_rpc execution drift', () => {
    expect(writeClientKvValueMigrationSource).toContain('CREATE OR REPLACE FUNCTION public.write_client_kv_value');
    expect(writeClientKvValueMigrationSource).toContain('public.is_client_kv_non_client_key(p_key)');
    expect(writeClientKvValueMigrationSource).toContain("'write_client_kv_value_blacklist'");
    expect(writeClientKvValueMigrationSource).toContain('RETURN;');
    expect(writeClientKvValueMigrationSource).toContain('GRANT EXECUTE ON FUNCTION public.write_client_kv_value(uuid, text, jsonb) TO heys_rpc');
  });

  it('detects returning users from the non-secret curator cookie hint', () => {
    expect(dayAdviceSource).toContain("localStorage.getItem('heys_curator_cookie_session_hint')");
  });

  it('keeps destructive curator KV deletes on verified curator runtime auth', () => {
    expect(yandexApiSource).toContain('function decodeJwtPayload(token)');
    expect(yandexApiSource).toMatch(/function getCuratorUserId\(\) \{[\s\S]*global\.HEYS\?\.cloud\?\.getUser\?\.\(\)[\s\S]*decodeJwtPayload\(getCuratorToken\(\)\)/);
    expect(yandexApiSource).toMatch(/async function deleteKV\(clientId, key\)[\s\S]*const curatorUserId = getCuratorUserId\(\);[\s\S]*deleteKVviaREST\(curatorUserId, clientId, key\)/);
  });

  it('clears bare curator JWT during full app logout and static PIN login', () => {
    expect(appHooksSource).toMatch(/removeGlobalValue\('heys_supabase_auth_token'\);[\s\S]*removeGlobalValue\('heys_curator_session'\);/);
    expect(indexHtmlSource).toMatch(/lsDel\('heys_supabase_auth_token'\);[\s\S]*lsDel\('heys_curator_session'\);[\s\S]*hlgStoreClientSessionToken\(sessionToken\)/);
    expect(appAuthInitSource).toMatch(/if \(mode === 'client'\) \{[\s\S]*removeGlobalValue\('heys_supabase_auth_token'\);[\s\S]*removeGlobalValue\('heys_curator_session'\);/);
  });

  it('keeps static PIN gate from writing JS-readable session tokens in production', () => {
    expect(indexHtmlSource).toMatch(/function hlgIsLocalBrowserDev\(\)[\s\S]*host === 'localhost' \|\| host === '127\.0\.0\.1'/);
    expect(indexHtmlSource).toMatch(/function hlgStoreClientSessionToken\(token\)[\s\S]*if \(token && hlgIsLocalBrowserDev\(\)\) \{[\s\S]*lsRaw\('heys_session_token', token\);[\s\S]*\} else \{[\s\S]*lsDel\('heys_session_token'\);/);
    expect(indexHtmlSource).not.toContain("lsRaw('heys_session_token', sessionToken)");
  });

  it('keeps static login handoff free of raw auth tokens', () => {
    expect(indexHtmlSource).not.toContain('sessionToken: sessionToken');
    expect(indexHtmlSource).not.toContain('accessToken: d.access_token');
    expect(indexHtmlSource).toMatch(/hlgHideOverlay[\s\S]*hasUser: !!preAuth\.user[\s\S]*window\.__heysPreAuth = null;/);
  });

  it('purges browser-readable curator auth in index.html before legacy bundles run', () => {
    expect(indexHtmlSource).toContain('var hadLegacyCuratorMarker');
    expect(indexHtmlSource).toContain("localStorage.removeItem('heys_curator_session')");
    expect(indexHtmlSource).toContain("localStorage.removeItem('heys_supabase_auth_token')");
    expect(indexHtmlSource).toContain("localStorage.setItem('heys_curator_cookie_session_hint', '1')");
    expect(indexHtmlSource).not.toContain('function restoreCompatCuratorAuth(token)');
  });

  it('executes index.html curator credential purge before legacy bundles run', () => {
    expect(indexSessionDetectionScript).toContain('hadLegacyCuratorMarker');
    const storage = createMockLocalStorage({
      heys_curator_session: 'legacy.jwt.token',
      heys_supabase_auth_token: '{"access_token":"legacy"}',
    });
    const win: Record<string, any> = {};
    new Function('window', 'localStorage', indexSessionDetectionScript)(win, storage);

    expect(storage.getItem('heys_curator_session')).toBeNull();
    expect(storage.getItem('heys_supabase_auth_token')).toBeNull();
    expect(storage.getItem('heys_curator_cookie_session_hint')).toBe('1');
    expect(win.__heysHasSession).toBe(true);
  });

  it('clears stale PIN context during runtime curator sign-in', () => {
    expect(source).toMatch(/localStorage\.removeItem\('heys_pin_auth_client'\);[\s\S]*localStorage\.removeItem\('heys_session_token'\);[\s\S]*_pinAuthClientId = null;[\s\S]*user = data\.user;/);
  });

  it('clears full PIN recovery context from gate exit flows', () => {
    expect(appGateFlowSource).toMatch(/removeGlobalValue\('heys_pin_auth_client'\);[\s\S]*removeGlobalValue\('heys_session_token'\);[\s\S]*removeGlobalValue\('heys_last_client_id'\);[\s\S]*removeGlobalValue\('heys_client_current'\);/);
  });

  it('clears full local PIN auth context from API clientLogout', () => {
    expect(yandexApiSource).toMatch(/const clearLocalClientAuth = \(\) => \{[\s\S]*localStorage\.removeItem\('heys_session_token'\);[\s\S]*localStorage\.removeItem\('heys_pin_auth_client'\);[\s\S]*localStorage\.removeItem\('heys_client_current'\);[\s\S]*localStorage\.removeItem\('heys_last_client_id'\);/);
  });
});
