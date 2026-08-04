'use strict';

const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');

const sourceIndex = require('../lib/source-index');
const { createRepoTools } = require('../lib/repo-tools');

class ToolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Минимальный tar: заголовок 512 байт на файл, содержимое с выравниванием. */
function makeTar(files) {
  const blocks = [];
  for (const [name, body] of Object.entries(files)) {
    const content = Buffer.from(body, 'utf8');
    const header = Buffer.alloc(512);
    header.write(name, 0, 'utf8');
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
    header.write('0', 156, 'utf8');
    // Контрольная сумма нашим разбором не проверяется, но пусть будет валидной.
    header.write('        ', 148, 'utf8');
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'utf8');
    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function makeArchive(files) {
  return zlib.gzipSync(makeTar(files));
}

const SAMPLE = {
  'apps/web/heys_day_calculations.js': [
    'const protPct = +normPerc.proteinPct || 0;',
    'const prot = K ? (K * protPct / 100) / (HEYS.TEF?.ATWATER?.protein || 3) : 0;',
  ].join('\n'),
  '.github/skills/heys-data-model/examples/day-calculations.js': 'prot: optimum * proteinPct / 100 / 4,',
  'TESTS/heys_advice_engine.test.js': 'proteinPct: 0.3,',
  'docs/heys-daily-norm.md': 'Белок задаётся процентом proteinPct.',
};

test('вид файла различает боевой код, тест, пример и документацию', () => {
  assert.strictEqual(sourceIndex.classifyPath('apps/web/heys_day_calculations.js').kind, 'код');
  assert.strictEqual(sourceIndex.classifyPath('TESTS/heys_advice_engine.test.js').kind, 'тест');
  assert.strictEqual(sourceIndex.classifyPath('apps/web/__tests__/day.test.js').kind, 'тест');
  assert.strictEqual(sourceIndex.classifyPath('.github/skills/x/examples/day.js').kind, 'пример');
  assert.strictEqual(sourceIndex.classifyPath('docs/heys-daily-norm.md').kind, 'документация');
});

test('боевой код идёт раньше фикстуры — иначе ответ соберётся по примеру с другой формулой', () => {
  const result = sourceIndex.searchArchive(makeArchive(SAMPLE), { pattern: /proteinPct/i });
  assert.ok(result.hits.length >= 4);
  assert.strictEqual(result.hits[0].path, 'apps/web/heys_day_calculations.js');
  assert.strictEqual(result.hits[0].kind, 'код');
  const kinds = result.hits.map((h) => h.kind);
  assert.ok(kinds.indexOf('код') < kinds.indexOf('пример'));
});

test('поиск сужается папкой', () => {
  const result = sourceIndex.searchArchive(makeArchive(SAMPLE), {
    pattern: /proteinPct/i,
    pathPrefix: 'apps/web/',
  });
  assert.strictEqual(result.hits.length, 1);
  assert.strictEqual(result.hits[0].line, 1);
});

test('потолок находок обрезает выдачу и говорит об этом', () => {
  const many = { 'apps/web/big.js': Array.from({ length: 50 }, (_, i) => `line ${i} proteinPct`).join('\n') };
  const result = sourceIndex.searchArchive(makeArchive(many), { pattern: /proteinPct/i, maxHits: 5 });
  assert.strictEqual(result.hits.length, 5);
  assert.strictEqual(result.truncated, true);
  assert.ok(result.total > 5);
});

test('чтение отдаёт окно строк с нумерацией, а не файл целиком', () => {
  const file = { 'apps/web/a.js': Array.from({ length: 200 }, (_, i) => `строка ${i + 1}`).join('\n') };
  const read = sourceIndex.readFromArchive(makeArchive(file), { path: 'apps/web/a.js', fromLine: 10, lines: 3 });
  assert.strictEqual(read.from_line, 10);
  assert.strictEqual(read.to_line, 12);
  assert.strictEqual(read.total_lines, 200);
  assert.strictEqual(read.truncated, true);
  assert.match(read.text, /^10\tстрока 10/);
});

test('чтение несуществующего файла возвращает null, а не выдумывает содержимое', () => {
  assert.strictEqual(sourceIndex.readFromArchive(makeArchive(SAMPLE), { path: 'apps/web/нет.js' }), null);
});

test('подпись хранилища собирается по AWS4 и не тащит в заголовки секрет', () => {
  const headers = sourceIndex.signedHeaders({
    host: 'storage.yandexcloud.net',
    path: '/heys-backups/source-index/latest.json',
    accessKeyId: 'KEYID',
    secretAccessKey: 'SECRET',
    nowMs: Date.UTC(2026, 7, 4, 12, 0, 0),
  });
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=KEYID\/20260804\/ru-central1\/s3\/aws4_request/);
  assert.match(headers.Authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
  assert.strictEqual(headers['x-amz-date'], '20260804T120000Z');
  assert.ok(!JSON.stringify(headers).includes('SECRET'));
});

test('архив не качается второй раз, пока коммит тот же', async () => {
  const archive = makeArchive(SAMPLE);
  const calls = [];
  const client = sourceIndex.createSourceIndexClient({
    accessKeyId: 'K', secretAccessKey: 'S',
    cacheTtlMs: 0,
    request: async ({ url }) => {
      calls.push(url);
      if (url.endsWith('latest.json')) {
        return { status: 200, body: Buffer.from(JSON.stringify({ commit: 'abc123', built_at: '2026-08-04T10:00:00Z' })) };
      }
      return { status: 200, body: archive };
    },
  });

  await client.search({ pattern: /proteinPct/i });
  await client.search({ pattern: /proteinPct/i });
  const archiveCalls = calls.filter((u) => u.endsWith('latest.tar.gz'));
  assert.strictEqual(archiveCalls.length, 1, 'при том же коммите архив тянется один раз');
  assert.strictEqual(calls.filter((u) => u.endsWith('latest.json')).length, 2);
});

test('новый коммит подтягивает новый архив', async () => {
  let commit = 'aaa';
  let body = makeArchive({ 'apps/web/a.js': 'первая версия proteinPct' });
  const client = sourceIndex.createSourceIndexClient({
    accessKeyId: 'K', secretAccessKey: 'S',
    cacheTtlMs: 0,
    request: async ({ url }) => (url.endsWith('latest.json')
      ? { status: 200, body: Buffer.from(JSON.stringify({ commit })) }
      : { status: 200, body }),
  });

  const first = await client.search({ pattern: /proteinPct/i });
  assert.match(first.hits[0].text, /первая версия/);

  commit = 'bbb';
  body = makeArchive({ 'apps/web/a.js': 'вторая версия proteinPct' });
  const second = await client.search({ pattern: /proteinPct/i });
  assert.match(second.hits[0].text, /вторая версия/);
});

test('без ключей хранилища инструмент честно отказывается, а не отвечает по памяти', async () => {
  const { tools } = createRepoTools({ ToolError, env: {} });
  await assert.rejects(
    () => tools.heys_code_search({ query: 'proteinPct' }),
    (e) => e.code === 'source_index_not_configured',
  );
});

test('ответ поиска несёт вид файла, строку и отметку среза', async () => {
  const archive = makeArchive(SAMPLE);
  const client = {
    search: async (opts) => ({
      ok: true,
      manifest: { commit: 'abcdef1234', built_at: '2026-08-04T10:00:00Z' },
      ...sourceIndex.searchArchive(archive, opts),
    }),
  };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  const res = await tools.heys_code_search({ query: 'proteinPct' });
  assert.match(res.text, /heys_day_calculations\.js:1 \[код\]/);
  assert.match(res.text, /срез abcdef12/);
  assert.strictEqual(res.structured.hits[0].kind, 'код');
});

test('устаревший срез не выдаётся за свежий: об этом сказано и в тексте, и в структуре', async () => {
  const archive = makeArchive(SAMPLE);
  const manifest = { commit: 'abcdef1234', built_at: '2026-08-04T10:00:00Z' };
  // Так отвечает source-index, когда хранилище не ответило, а архив уже был в памяти.
  const client = {
    search: async (opts) => ({ ok: true, stale: true, manifest, ...sourceIndex.searchArchive(archive, opts) }),
    read: async (opts) => ({ ok: true, stale: true, manifest, ...sourceIndex.readFromArchive(archive, opts) }),
  };
  const { tools } = createRepoTools({ ToolError, env: {}, client });

  const found = await tools.heys_code_search({ query: 'proteinPct' });
  assert.match(found.text, /недоступно/i, 'модель должна увидеть предупреждение раньше находок');
  assert.ok(found.text.indexOf('недоступно') < found.text.indexOf('heys_day_calculations'));
  assert.match(found.text, /срез abcdef12/);
  assert.strictEqual(found.structured.stale, true);

  const read = await tools.heys_code_read({ path: 'apps/web/heys_day_calculations.js' });
  assert.match(read.text, /недоступно/i);
  assert.strictEqual(read.structured.stale, true);
});

test('свежий срез не помечается устаревшим', async () => {
  const archive = makeArchive(SAMPLE);
  const client = {
    search: async (opts) => ({ ok: true, manifest: { commit: 'abcdef1234' }, ...sourceIndex.searchArchive(archive, opts) }),
  };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  const res = await tools.heys_code_search({ query: 'proteinPct' });
  assert.ok(!/недоступно/i.test(res.text));
  assert.strictEqual(res.structured.stale, false);
});

test('регулярка с повтором внутри повтора не запускается: она заняла бы весь коннектор', async () => {
  let called = 0;
  const client = { search: async () => { called += 1; return { ok: true, manifest: {}, hits: [], scanned: 0 }; } };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  await assert.rejects(
    () => tools.heys_code_search({ query: '(\\w+)+$', regex: true }),
    (e) => e.code === 'invalid_query' && /повтор внутри повтора/.test(e.message),
  );
  assert.strictEqual(called, 0, 'отказ должен случиться до похода в срез');
});

test('повтор внутри повтора отклоняется по форме, даже если это выражение отработало бы быстро', async () => {
  // «(a+b)+» на самом деле не опасно: буква b не даёт перебирать разбиения.
  // Разбор по скобкам этого не различает и отказывает — размен осознанный:
  // пользователю есть что переписать, а зависший коннектор чинить некому.
  const client = { search: async () => ({ ok: true, manifest: {}, hits: [], scanned: 0 }) };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  await assert.rejects(
    () => tools.heys_code_search({ query: '(a+b)+', regex: true }),
    (e) => e.code === 'invalid_query',
  );
});

test('медленное выражение отклоняется даже без вложенных скобок — по замеру на приманке', async () => {
  const client = { search: async () => ({ ok: true, manifest: {}, hits: [], scanned: 0 }) };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  const started = Date.now();
  await assert.rejects(
    () => tools.heys_code_search({ query: '(a|a)*b', regex: true }),
    (e) => e.code === 'invalid_query',
  );
  assert.ok(Date.now() - started < 5000, 'сама проверка обязана быть дешёвой');
});

test('нормальные регулярки и обычный поиск проверка не задевает', async () => {
  const archive = makeArchive({ 'apps/web/a.js': 'const protPct = normPerc.proteinPct;' });
  const client = {
    search: async (opts) => ({ ok: true, manifest: {}, ...sourceIndex.searchArchive(archive, opts) }),
  };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  const byRegex = await tools.heys_code_search({ query: 'prot(Pct|einPct)\\s*=?', regex: true });
  assert.match(byRegex.text, /a\.js:1/);
  const plain = await tools.heys_code_search({ query: 'normPerc.proteinPct' });
  assert.match(plain.text, /a\.js:1/);
});

test('правила про код приезжают только вместе с инструментами', () => {
  const { curatorInstructions } = require('../lib/curator');
  const without = curatorInstructions('Антон', true, Date.UTC(2026, 7, 4), false);
  const withRepo = curatorInstructions('Антон', true, Date.UTC(2026, 7, 4), true);
  assert.ok(!/^К1\./m.test(without), 'без инструментов правила про код не нужны');
  assert.match(withRepo, /^К1\..*внутреннем устройстве/m);
  assert.match(withRepo, /^К3\..*фикстур|^К3\..*пример/m);
  assert.match(withRepo, /heys_day_calculations/, 'названа конкретная цена ошибки: формула белка');
});

test('инструменты по коду только читают', () => {
  const { REPO_TOOL_SCHEMAS } = require('../lib/repo-tools');
  assert.deepStrictEqual(
    REPO_TOOL_SCHEMAS.map((s) => s.name),
    ['heys_code_search', 'heys_code_read', 'heys_code_tree'],
  );
  const text = JSON.stringify(REPO_TOOL_SCHEMAS);
  assert.ok(!/запис|измен|удал/i.test(text), 'в срезе исходников нечего менять — только чтение');
});

test('пустой запрос по коду не выполняется', async () => {
  const { tools } = createRepoTools({ ToolError, env: {}, client: {} });
  await assert.rejects(() => tools.heys_code_search({ query: '  ' }), (e) => e.code === 'invalid_query');
});

test('запрос ищется как текст, а не как регулярка, пока не попросили обратное', async () => {
  const archive = makeArchive({ 'apps/web/a.js': 'const x = arr[0]; // proteinPct' });
  const seen = [];
  const client = {
    search: async (opts) => { seen.push(opts.pattern.source); return { ok: true, manifest: {}, ...sourceIndex.searchArchive(archive, opts) }; },
  };
  const { tools } = createRepoTools({ ToolError, env: {}, client });
  const res = await tools.heys_code_search({ query: 'arr[0]' });
  assert.match(seen[0], /arr\\\[0\\\]/);
  assert.match(res.text, /a\.js:1/);
});
