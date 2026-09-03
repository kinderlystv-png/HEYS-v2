'use strict';

/**
 * heys/dee059: целиковая запись файла задачника не ложится поверх чужой правки.
 *
 * Дельта-путь (`append_heys_tasks_file_by_curator`) сверяет ревизию на сервере
 * и отвечает 409. Целиковая шла через `batch_upsert_client_kv_by_curator` без
 * единой проверки: `rev` считал клиент между своим чтением и записью. 02.09
 * мост задачника отправил наверх файлы, только что приехавшие из GitHub, и
 * унёс задачу, заведённую через MCP получасом раньше — ревизия 789 → 790,
 * следа нет нигде: истории у KV нет, аудита не было тоже.
 *
 * Проверяем правило (модуль) и то, что путь записи его действительно зовёт:
 * 02.09 та же история уже случилась с режимом chrono — починка приехала в
 * библиотеку, а index.js отсекал запрос раньше, и тесты были зелёные.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tasks = require('../lib/tasks.js');

const RPC_LIB = path.resolve(__dirname, '..', '..', 'heys-api-rpc', 'lib', 'heys_tasks_kv.cjs');
const RPC_INDEX = path.resolve(__dirname, '..', '..', 'heys-api-rpc', 'index.js');
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ── Признак файла ────────────────────────────────────────────────────────

test('файлом считается только файл: индекс и память прохода — нет', () => {
  const file = { path: 'projects/heys.md', text: '# heys', rev: 3, updatedAt: 1 };
  assert.equal(tasks.isTasksFileKey('heys_tasks_projects_heys', file), true);
  assert.equal(tasks.isTasksFileKey(tasks.INDEX_KEY, { files: {}, updatedAt: 1 }), false);
  assert.equal(tasks.isTasksFileKey(tasks.STATE_KEY, { seen: {} }), false);
  assert.equal(tasks.isTasksFileKey('heys_dayv2_2026-09-03', file), false);
  // Значение без текста — не файл: следующий служебный ключ с этим префиксом
  // не должен попасть под проверку молча.
  assert.equal(tasks.isTasksFileKey('heys_tasks_projects_heys', { rev: 3 }), false);
});

// ── Сверка ревизии ───────────────────────────────────────────────────────

test('воспроизводит потерю 02.09: правка из чата ушла вперёд — целиковая запись отбита', () => {
  const cloud = { path: 'projects/heys.md', text: 'с задачей из чата', rev: 790, updatedAt: 2 };
  // Мост читал файл, когда в облаке было 789, и посчитал следующую ревизию сам.
  const fromMirror = { path: 'projects/heys.md', text: 'без задачи из чата', rev: 790, updatedAt: 3 };
  const conflict = tasks.tasksWriteConflict(fromMirror, cloud);
  assert.ok(conflict, 'запись поверх более новой ревизии обязана быть отбита');
  assert.equal(conflict.reason, 'tasks_stale_rev');
  assert.equal(conflict.currentRev, 790);
  assert.equal(conflict.incomingRev, 790);
});

test('запись на свежей ревизии проходит', () => {
  const cloud = { path: 'projects/heys.md', text: 'старое', rev: 790, updatedAt: 2 };
  const next = { path: 'projects/heys.md', text: 'новое', rev: 791, updatedAt: 3 };
  assert.equal(tasks.tasksWriteConflict(next, cloud), null);
});

test('файла в облаке ещё нет — писать поверх нечего', () => {
  const next = { path: 'days/2026-09-03.md', text: 'день', rev: 1, updatedAt: 3 };
  assert.equal(tasks.tasksWriteConflict(next, null), null);
  assert.equal(tasks.tasksWriteConflict(next, { rev: 0 }), null);
});

test('ревизия не пришла вовсе — отбиваем, а не считаем нулём', () => {
  const cloud = { path: 'NOW.md', text: 'сейчас', rev: 12, updatedAt: 2 };
  const conflict = tasks.tasksWriteConflict({ path: 'NOW.md', text: 'мимо' }, cloud);
  assert.ok(conflict);
  assert.equal(conflict.incomingRev, 0);
});

test('перепрыгнуть через ревизию тоже нельзя', () => {
  const cloud = { path: 'NOW.md', text: 'сейчас', rev: 12, updatedAt: 2 };
  assert.ok(tasks.tasksWriteConflict({ path: 'NOW.md', text: 'мимо', rev: 20 }, cloud));
});

// ── Слияние индекса ──────────────────────────────────────────────────────

test('индекс сливается: чужой след и файлы, заведённые облаком, остаются', () => {
  const cloud = {
    files: {
      'projects/heys.md': { rev: 790, updatedAt: 20 },
      // ротация завела архив уже после того, как мост прочитал индекс
      'archive/transcript_2026-09-02_part31.md': { rev: 1, updatedAt: 21 },
    },
    updatedAt: 21,
  };
  const fromMirror = {
    files: {
      'projects/heys.md': { rev: 789, updatedAt: 10 },
      'days/2026-09-03.md': { rev: 4, updatedAt: 11 },
    },
    updatedAt: 11,
  };
  const merged = tasks.mergeIndexValues(fromMirror, cloud);
  assert.equal(merged.files['projects/heys.md'].rev, 790, 'старшая ревизия права');
  assert.ok(merged.files['archive/transcript_2026-09-02_part31.md'], 'запись облака не должна пропасть');
  assert.equal(merged.files['days/2026-09-03.md'].rev, 4, 'новый файл моста должен появиться');
  assert.equal(merged.updatedAt, 21);
});

test('слияние индекса не портит присланное значение', () => {
  const incoming = { files: { 'NOW.md': { rev: 2, updatedAt: 5 } }, updatedAt: 5 };
  const cloud = { files: { 'NOW.md': { rev: 9, updatedAt: 9 } }, updatedAt: 9 };
  tasks.mergeIndexValues(incoming, cloud);
  assert.equal(incoming.files['NOW.md'].rev, 2);
  assert.equal(cloud.files['NOW.md'].rev, 9);
});

// ── Переводы строк ───────────────────────────────────────────────────────

test('CRLF приводится к LF — тем же правилом, что на дельта-пути', () => {
  assert.equal(tasks.normalizeNewlines('- [ ] раз\r\n- [ ] два\r\n'), '- [ ] раз\n- [ ] два\n');
  assert.equal(tasks.normalizeNewlines('- [ ] раз\n'), '- [ ] раз\n');
});

// ── Путь записи действительно зовёт правило ──────────────────────────────

test('копия модуля в heys-api-rpc знает те же функции', () => {
  const kv = require(RPC_LIB);
  for (const name of ['isTasksFileKey', 'tasksWriteConflict', 'mergeIndexValues', 'normalizeNewlines']) {
    assert.equal(typeof kv[name], 'function', `${name} не доехал до копии, которая пишет файл`);
  }
  assert.equal(lf(RPC_LIB), lf(path.resolve(__dirname, '..', 'lib', 'tasks.js')));
});

test('целиковый путь записи зовёт проверку и берёт строку под блокировку', () => {
  const index = lf(RPC_INDEX);
  assert.match(index, /mergeBatchTasksExistingRows\(\s*\n?\s*items,/,
    'batch_upsert_client_kv_by_curator не зовёт проверку задачника — правило недостижимо');
  assert.match(index, /const hasTasksBatchKey = keysList\.some/,
    'признак задачника в батче не считается');
  // Условий с FOR UPDATE в файле несколько (есть ещё путь по сессии клиента);
  // нужна ровно та строка, что читает старые значения для кураторского батча.
  const lockLines = index.split('\n').filter((l) => l.includes('hasDayv2BatchKey') && l.includes('FOR UPDATE'));
  assert.equal(lockLines.length, 1, 'строка чтения старых значений изменилась — тест надо переписать');
  assert.match(lockLines[0], /hasTasksBatchKey/,
    'ключи задачника читаются без FOR UPDATE — сверка ревизии ничего не гарантирует');
  const beginLines = index.split('\n').filter((l) => /^\s*if \(hasDayv2BatchKey/.test(l));
  assert.ok(beginLines.some((l) => l.includes('hasTasksBatchKey')),
    'батч с задачником не открывает транзакцию — блокировка строки не доживёт до UPSERT');
  assert.match(index, /tasks_blocked: tasksBlockedKeys/,
    'отбитые файлы не возвращаются вызывающему — он решит, что правка сохранена');
});

/**
 * Сам обработчик целиком не поднять — он тянет пул Postgres и окружение. Но
 * решающая функция чистая: вынимаем её текст из index.js и гоняем как есть,
 * а не копию. Проверяется то, что поедет на прод, вместе с его же `require`.
 */
function loadHandlerFn(name) {
  const src = lf(RPC_INDEX);
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} исчез из index.js — путь записи переписан`);
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.notEqual(end, -1, `не удалось вырезать ${name}`);
  // eslint-disable-next-line no-new-func
  return new Function('require', `${src.slice(start, end)}; return ${name};`)(
    (id) => require(id.replace('./lib/heys_tasks_kv.cjs', RPC_LIB)),
  );
}

test('обработчик: устаревший файл отброшен, свежий записан, индекс слит', () => {
  const mergeBatchTasks = loadHandlerFn('mergeBatchTasksExistingRows');
  const items = [
    // мост посчитал 790, пока в облаке уже 790 (правка из чата)
    { k: 'heys_tasks_projects_heys', v: { path: 'projects/heys.md', text: 'без задачи', rev: 790 } },
    { k: 'heys_tasks_now', v: { path: 'NOW.md', text: 'свежее\r\nс CRLF\r\n', rev: 4 } },
    { k: 'heys_tasks_index', v: { files: { 'NOW.md': { rev: 4, updatedAt: 9 } }, updatedAt: 9 } },
    { k: 'heys_dayv2_2026-09-03', v: { meals: [] } },
  ];
  const current = new Map([
    ['heys_tasks_projects_heys', { v: { path: 'projects/heys.md', text: 'с задачей', rev: 790 } }],
    ['heys_tasks_now', { v: { path: 'NOW.md', text: 'старое', rev: 3 } }],
    ['heys_tasks_index', { v: { files: { 'projects/heys.md': { rev: 790, updatedAt: 20 } }, updatedAt: 20 } }],
  ]);

  const res = mergeBatchTasks(items, current);
  assert.deepEqual(res.blocked.map((b) => b.k), ['heys_tasks_projects_heys']);
  assert.equal(res.blocked[0].reason, 'tasks_stale_rev');
  const keptKeys = res.kept.map((it) => it.k);
  assert.deepEqual(keptKeys, ['heys_tasks_now', 'heys_tasks_index', 'heys_dayv2_2026-09-03']);
  assert.equal(res.kept[0].v.text, 'свежее\nс CRLF\n', 'CRLF обязан приводиться к LF на этом входе тоже');
  assert.equal(res.normalized, 1);
  const mergedIndex = res.kept[1].v;
  assert.equal(mergedIndex.files['projects/heys.md'].rev, 790, 'след отбитого файла остаётся облачным');
  assert.equal(mergedIndex.files['NOW.md'].rev, 4);
  assert.equal(res.indexMerged, 1);
});

test('обработчик: не смогли прочитать текущие значения — файлы не пишем вовсе', () => {
  const blockTasks = loadHandlerFn('blockTasksFileWrites');
  const items = [
    { k: 'heys_tasks_now', v: { path: 'NOW.md', text: 'мимо', rev: 4 } },
    { k: 'heys_tasks_index', v: { files: {}, updatedAt: 1 } },
  ];
  items.push({ k: 'heys_dayv2_2026-09-03', v: { meals: [] } });
  const res = blockTasks(items);
  // Индекс блокируется наравне с файлом: он один на весь задачник, и целиковая
  // замена без облачной копии стирает следы всех файлов разом.
  assert.deepEqual(res.blocked.map((b) => b.k), ['heys_tasks_now', 'heys_tasks_index']);
  assert.equal(res.blocked[0].reason, 'current_value_unavailable');
  assert.deepEqual(res.kept.map((it) => it.k), ['heys_dayv2_2026-09-03']);
});

test('MCP считает отбитую запись неудачей, а не успехом', () => {
  const api = lf(path.resolve(__dirname, '..', 'lib', 'heys-api.js'));
  assert.match(api, /data\.tasks_blocked[\s\S]{0,200}ok: false, error: 'tasks_stale_rev'/,
    'upsertKVManyByCurator игнорирует tasks_blocked — инструмент отчитается о сохранении, которого не было');
  const tools = lf(path.resolve(__dirname, '..', 'lib', 'tasks-tools.js'));
  assert.match(tools, /res\.error === 'tasks_stale_rev'/,
    'writeFile не разбирает отказ по ревизии — правка потеряется вместо повторной попытки');
});
