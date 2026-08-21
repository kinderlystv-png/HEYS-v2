// Шлюз с 2026-08-22 сам закрывает CORS: на его собственных ошибках (502 при
// отказе функции, 503 при сбросе нагрузки) заголовки теперь те же, что на
// успешном ответе. До этого шлюз отдавал Access-Control-Allow-Origin: '*' без
// allow-credentials, браузер блокировал ответ целиком, и серверная ошибка
// доходила до клиента как «Failed to fetch» — так инцидент 21.08 с каталогом
// продуктов несколько часов выглядел обрывом связи (см. apps/web/BUGS_HISTORY.md).
//
// Цена решения: шлюз перехватывает preflight САМ, OPTIONS-интеграции функций
// больше не вызываются. Значит списки origin и headers в спеке — единственное,
// что видит браузер, и разъехаться с функциями они не имеют права. Этот тест и
// держит их вместе: добавили origin в функцию, забыли в спеку — тест красный.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const spec = fs.readFileSync(path.join(root, 'api-gateway-spec.yaml'), 'utf8').replace(/\r\n/g, '\n');

// Функции, которые этот шлюз маршрутизирует и которые отвечают браузеру.
const ROUTED_FUNCTIONS = [
  'heys-api-rest',
  'heys-api-rpc',
  'heys-api-photos',
  'kinderly-api-auth',
];

function corsBlock() {
  const match = spec.match(/^x-yc-apigateway:\n((?:[ \t].*\n|\n)*)/m);
  return match?.[1] || '';
}

function corsField(field) {
  const match = corsBlock().match(new RegExp(`^\\s{4}${field}:\\s*(.*)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function specOrigins() {
  const block = corsBlock();
  const start = block.indexOf('origin:');
  if (start < 0) return [];
  const rest = block.slice(start);
  const list = [];
  for (const line of rest.split('\n').slice(1)) {
    const item = line.match(/^\s{6}- (\S+)$/);
    if (!item) break;
    list.push(item[1]);
  }
  return list;
}

// ALLOWED_ORIGINS в функции — литерал массива; localhost-хвост живёт под флагом
// ALLOW_LOCALHOST_ORIGINS и в прод-список шлюза намеренно не входит.
function functionOrigins(name) {
  const file = path.join(root, name, 'index.js');
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/ALLOWED_ORIGINS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!match) return null;
  const body = match[1];
  const localhostAt = body.indexOf('ALLOW_LOCALHOST_ORIGINS');
  const prodPart = localhostAt >= 0 ? body.slice(0, localhostAt) : body;
  return [...prodPart.matchAll(/'(https?:\/\/[^']+)'/g)].map((m) => m[1]);
}

function functionAllowedHeaders(name) {
  const file = path.join(root, name, 'index.js');
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/'Access-Control-Allow-Headers':\s*'([^']+)'/g)]
    .flatMap((m) => m[1].split(',').map((h) => h.trim().toLowerCase()))
    .filter(Boolean);
}

test('CORS-блок присутствует в канонической спеке и включает credentials', () => {
  assert.notEqual(corsBlock(), '', 'x-yc-apigateway.cors пропал из api-gateway-spec.yaml');
  assert.equal(
    corsField('credentials'),
    'true',
    'без credentials: true браузер отбросит ответ на запрос с cookie — ровно та маскировка, ради которой блок и заводили',
  );
});

test('origin шлюза не уже, чем ALLOWED_ORIGINS каждой маршрутизируемой функции', () => {
  const fromSpec = specOrigins();
  assert.ok(fromSpec.length > 0, 'список origin в спеке пуст');

  for (const name of ROUTED_FUNCTIONS) {
    const fromFunction = functionOrigins(name);
    if (fromFunction === null) continue; // функция не объявляет свой список
    const missing = fromFunction.filter((origin) => !fromSpec.includes(origin));
    assert.deepEqual(
      missing,
      [],
      `${name}: origin разрешён функцией, но не шлюзом — на ошибке шлюза этот клиент снова увидит «Failed to fetch»: ${missing.join(', ')}`,
    );
  }
});

test('origin шлюза не шире, чем объединение функций, и не содержит звёздочки', () => {
  const fromSpec = specOrigins();
  const union = new Set(ROUTED_FUNCTIONS.flatMap((name) => functionOrigins(name) || []));
  const extra = fromSpec.filter((origin) => !union.has(origin));
  assert.deepEqual(
    extra,
    [],
    `шлюз пускает origin, который не разрешает ни одна функция: ${extra.join(', ')}`,
  );
  assert.ok(!fromSpec.includes('*'), 'звёздочка вместе с credentials запрещена спецификацией CORS');
});

test('allowedHeaders шлюза покрывает заголовки, которые разрешают функции', () => {
  const allowed = (corsField('allowedHeaders') || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  assert.ok(allowed.length > 0, 'allowedHeaders пуст — preflight закрывает шлюз, функции его больше не видят');

  for (const name of ROUTED_FUNCTIONS) {
    const missing = functionAllowedHeaders(name).filter((header) => !allowed.includes(header));
    assert.deepEqual(
      missing,
      [],
      `${name}: заголовок разрешён функцией, но не пройдёт preflight шлюза: ${missing.join(', ')}`,
    );
  }
});

test('methods шлюза покрывают методы, объявленные в путях спеки', () => {
  const declared = new Set(
    [...spec.matchAll(/^ {4}(get|post|patch|delete|put|options):/gm)].map((m) => m[1].toUpperCase()),
  );
  const allowed = (corsField('methods') || '').split(',').map((m) => m.trim().toUpperCase());
  const missing = [...declared].filter((method) => !allowed.includes(method));
  assert.deepEqual(missing, [], `методы есть в путях, но не в CORS: ${missing.join(', ')}`);
});
