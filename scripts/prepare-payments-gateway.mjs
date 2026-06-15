#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_SPEC = path.join(ROOT, 'yandex-cloud-functions/api-gateway-spec.yaml');
const DEFAULT_SERVICE_ACCOUNT_ID = 'aje85rjgpj4nk9m384ek';

const PAYMENT_ROUTES = [
  { path: '/payments', method: 'get', summary: 'Payments healthcheck' },
  { path: '/payments/create', method: 'post', summary: 'Create YuKassa payment' },
  { path: '/payments/webhook', method: 'post', summary: 'YuKassa webhook' },
  { path: '/payments/status', method: 'get', summary: 'Get payment status' },
  { path: '/payments/refund', method: 'post', summary: 'Create YuKassa refund' },
];

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node scripts/prepare-payments-gateway.mjs --function-id <id> [--write]

Options:
  --function-id <id>          Yandex Cloud function id for heys-api-payments
  --spec <path>               API Gateway spec path (default: yandex-cloud-functions/api-gateway-spec.yaml)
  --service-account-id <id>   Service account id for gateway integration
  --write                     Update the spec in place. Default is dry-run.
  --check                     Fail if routes are missing or point to another function id.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    specPath: DEFAULT_SPEC,
    serviceAccountId: DEFAULT_SERVICE_ACCOUNT_ID,
    write: false,
    check: false,
    functionId: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--write') {
      args.write = true;
      continue;
    }
    if (arg === '--check') {
      args.check = true;
      continue;
    }
    if (arg === '--function-id') {
      args.functionId = argv[++i] || '';
      continue;
    }
    if (arg === '--spec') {
      args.specPath = path.resolve(ROOT, argv[++i] || '');
      continue;
    }
    if (arg === '--service-account-id') {
      args.serviceAccountId = argv[++i] || '';
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage(1);
  }

  if (!/^[a-z0-9]{10,64}$/.test(args.functionId)) {
    console.error('--function-id is required and must look like a Yandex Cloud function id');
    usage(1);
  }
  if (!/^[a-z0-9]{10,64}$/.test(args.serviceAccountId)) {
    console.error('--service-account-id must look like a Yandex Cloud service account id');
    usage(1);
  }
  return args;
}

function integration(functionId, serviceAccountId) {
  return {
    type: 'cloud_functions',
    service_account_id: serviceAccountId,
    function_id: functionId,
  };
}

function routeNode(route, functionId, serviceAccountId) {
  return {
    [route.method]: {
      summary: route.summary,
      'x-yc-apigateway-integration': integration(functionId, serviceAccountId),
    },
    options: {
      summary: `CORS preflight for ${route.path}`,
      'x-yc-apigateway-integration': integration(functionId, serviceAccountId),
    },
  };
}

function getIn(obj, keys) {
  return keys.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function inspect(spec, args) {
  return PAYMENT_ROUTES.map((route) => {
    const current = spec.paths?.[route.path];
    const methodFunctionId = getIn(current, [
      route.method,
      'x-yc-apigateway-integration',
      'function_id',
    ]);
    const optionsFunctionId = getIn(current, [
      'options',
      'x-yc-apigateway-integration',
      'function_id',
    ]);
    const ok = methodFunctionId === args.functionId && optionsFunctionId === args.functionId;
    return {
      path: route.path,
      method: route.method.toUpperCase(),
      status: ok ? 'ok' : current ? 'update' : 'add',
      methodFunctionId: methodFunctionId || null,
      optionsFunctionId: optionsFunctionId || null,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = fs.readFileSync(args.specPath, 'utf8');
  const doc = YAML.parseDocument(source, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join('\n'));
  }

  const spec = doc.toJS();
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    throw new Error(`${args.specPath}: missing OpenAPI paths object`);
  }

  const before = inspect(spec, args);
  const pending = before.filter((item) => item.status !== 'ok');

  if (args.check) {
    if (pending.length > 0) {
      console.error('payments gateway routes are not ready:');
      for (const item of pending) {
        console.error(
          `  ${item.status.toUpperCase()} ${item.method} ${item.path}` +
            ` method=${item.methodFunctionId || '-'} options=${item.optionsFunctionId || '-'}`,
        );
      }
      process.exit(1);
    }
    console.log('payments gateway routes are ready');
    return;
  }

  if (pending.length === 0) {
    console.log('payments gateway routes already point to the requested function id');
    return;
  }

  for (const route of PAYMENT_ROUTES) {
    doc.setIn(
      ['paths', route.path],
      routeNode(route, args.functionId, args.serviceAccountId),
    );
  }

  const output = String(doc);
  if (!args.write) {
    console.log(
      `Dry-run: would ${pending.map((item) => `${item.status}:${item.path}`).join(', ')}`,
    );
    console.log('Run again with --write to update api-gateway-spec.yaml.');
    return;
  }

  fs.writeFileSync(args.specPath, output, 'utf8');
  console.log(`Updated ${path.relative(ROOT, args.specPath)} with payments routes.`);
}

try {
  main();
} catch (err) {
  console.error(`prepare-payments-gateway failed: ${err.message}`);
  process.exit(1);
}
