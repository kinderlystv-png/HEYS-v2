'use strict';

/**
 * Задачник: две правки в разные места одного файла сливаются, а не выбирают
 * победителя.
 *
 * До этого сервер умел одно — отбить запись, чья ревизия разошлась с облачной
 * (heys/dee059). Правило спасало от потери, но платило за это второй потерей:
 * мост задачника, дописавший строку в конец, отбивался целиком из-за правки,
 * сделанной из чата в середине того же файла. Спорить этим двум правкам не о
 * чем, и общего предка теперь достаточно, чтобы это увидеть: сервер хранит
 * предыдущую версию текста рядом с текущей.
 *
 * Границу проверяем отдельно и придирчиво: слияние допустимо ровно там, где
 * сохранённая база и есть предок присланного. Отставание на две записи и
 * больше по-прежнему отбивается — база тогда новее предка клиента, и его
 * ранняя правка прочиталась бы как удаление.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tasks = require('../lib/tasks.js');

const RPC_LIB = path.resolve(__dirname, '..', '..', 'heys-api-rpc', 'lib', 'heys_tasks_kv.cjs');
const RPC_INDEX = path.resolve(__dirname, '..', '..', 'heys-api-rpc', 'index.js');
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ── Построчная разница ───────────────────────────────────────────────────

test('разница считается только по расхождению: общее начало и конец отрезаны', () => {
  const base = ['# Проект', '- [ ] раз', '- [ ] два', ''];
  const side = ['# Проект', '- [x] раз', '- [ ] два', ''];
  assert.deepEqual(tasks.diffLineOps(base, side), [{ start: 1, end: 2, lines: ['- [x] раз'] }]);
});

test('дописанное в конец — вставка нулевой длины, а не переписывание хвоста', () => {
  const base = ['- [ ] раз', ''];
  const side = ['- [ ] раз', '- [ ] два', ''];
  assert.deepEqual(tasks.diffLineOps(base, side), [{ start: 1, end: 1, lines: ['- [ ] два'] }]);
});

test('одинаковые стороны разницы не дают', () => {
  assert.deepEqual(tasks.diffLineOps(['a', 'b'], ['a', 'b']), []);
});

// ── Слияние текста ───────────────────────────────────────────────────────

test('правки в разные строки сливаются молча', () => {
  const base = '# Проект\n- [ ] раз\n- [ ] два\n';
  const cloud = '# Проект\n- [x] раз\n- [ ] два\n';      // отметили из чата
  const mirror = '# Проект\n- [ ] раз\n- [x] два\n';     // отметили на маке
  const merged = tasks.mergeTasksText(base, cloud, mirror);
  assert.equal(merged.ok, true);
  assert.equal(merged.text, '# Проект\n- [x] раз\n- [x] два\n');
});

test('вставка в середину и вставка в конец не спорят', () => {
  const base = '# NOW\n- [ ] раз\n- [ ] три\n';
  const cloud = '# NOW\n- [ ] раз\n- [ ] два\n- [ ] три\n';
  const mirror = '# NOW\n- [ ] раз\n- [ ] три\n- [ ] четыре\n';
  const merged = tasks.mergeTasksText(base, cloud, mirror);
  assert.equal(merged.ok, true);
  assert.equal(merged.text, '# NOW\n- [ ] раз\n- [ ] два\n- [ ] три\n- [ ] четыре\n');
});

test('одна и та же правка с обеих сторон — согласие, а не конфликт', () => {
  const base = '- [ ] раз\n';
  const same = '- [x] раз\n';
  assert.deepEqual(tasks.mergeTasksText(base, same, same), { ok: true, text: same });
});

test('обе стороны переписали одну строку — отказ, а не выбор за куратора', () => {
  const base = '- [ ] раз\n';
  const merged = tasks.mergeTasksText(base, '- [x] раз\n', '- [~] раз\n');
  assert.equal(merged.ok, false);
  assert.equal(merged.reason, 'merge_conflict');
});

test('обе стороны дописали своё в один и тот же конец — тоже отказ', () => {
  const base = '- [ ] раз\n';
  const merged = tasks.mergeTasksText(base, '- [ ] раз\n- [ ] два\n', '- [ ] раз\n- [ ] три\n');
  assert.equal(merged.ok, false, 'порядок двух дописанных строк выбирает автор, а не сервер');
});

test('одна сторона удалила строку, другая правила соседнюю — сливается', () => {
  const base = 'a\nb\nc\nd\n';
  const merged = tasks.mergeTasksText(base, 'a\nc\nd\n', 'a\nb\nc\nD\n');
  assert.equal(merged.ok, true);
  assert.equal(merged.text, 'a\nc\nD\n');
});

test('одна сторона удалила строку, другая её же правила — отказ', () => {
  const base = 'a\nb\nc\n';
  const merged = tasks.mergeTasksText(base, 'a\nc\n', 'a\nB\nc\n');
  assert.equal(merged.ok, false);
  assert.equal(merged.reason, 'merge_conflict');
});

test('сторона не менялась — берётся вторая целиком', () => {
  const base = 'a\nb\n';
  assert.deepEqual(tasks.mergeTasksText(base, base, 'a\nb\nc\n'), { ok: true, text: 'a\nb\nc\n' });
  assert.deepEqual(tasks.mergeTasksText(base, 'a\nb\nc\n', base), { ok: true, text: 'a\nb\nc\n' });
});

// ── Общий предок ─────────────────────────────────────────────────────────

const withBase = (rev, text, baseText) => ({
  path: 'projects/heys.md', text, rev, updatedAt: 10, base: { text: baseText, rev: rev - 1 },
});

test('слияние идёт только когда сохранённая база и есть предок присланного', () => {
  const cloud = withBase(790, '# П\n- [x] раз\n- [ ] два\n', '# П\n- [ ] раз\n- [ ] два\n');
  const mirror = { path: 'projects/heys.md', text: '# П\n- [ ] раз\n- [x] два\n', rev: 790 };
  const res = tasks.mergeTasksFileValue(mirror, cloud, 5000);
  assert.equal(res.ok, true);
  assert.equal(res.value.text, '# П\n- [x] раз\n- [x] два\n');
  assert.equal(res.value.rev, 791, 'слитое значение идёт следующей ревизией за облачной');
  assert.equal(res.baseRev, 789);
});

test('отставание на две записи не сливается: база новее предка клиента', () => {
  const cloud = withBase(791, 'a\nb2\n', 'a\nb1\n');
  const mirror = { path: 'projects/heys.md', text: 'a\nb0\nc\n', rev: 790 };
  const res = tasks.mergeTasksFileValue(mirror, cloud, 5000);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_common_base');
});

test('базы нет вовсе — ведём себя как до её появления', () => {
  const cloud = { path: 'NOW.md', text: 'облако', rev: 12, updatedAt: 1 };
  const res = tasks.mergeTasksFileValue({ path: 'NOW.md', text: 'мост', rev: 12 }, cloud, 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_common_base');
});

test('база от чужой ревизии не годится', () => {
  const cloud = { path: 'NOW.md', text: 'облако', rev: 12, base: { text: 'старьё', rev: 7 } };
  const res = tasks.mergeTasksFileValue({ path: 'NOW.md', text: 'мост', rev: 12 }, cloud, 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_common_base');
});

test('прыжок вперёд через ревизию не сливается', () => {
  const cloud = withBase(790, 'a\nb\n', 'a\n');
  const res = tasks.mergeTasksFileValue({ path: 'projects/heys.md', text: 'z\n', rev: 795 }, cloud, 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_common_base');
});

test('спорное слияние остаётся отказом и на этом уровне', () => {
  const cloud = withBase(790, '- [x] раз\n', '- [ ] раз\n');
  const res = tasks.mergeTasksFileValue({ path: 'projects/heys.md', text: '- [~] раз\n', rev: 790 }, cloud, 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'merge_conflict');
});

test('CRLF присланного не превращается в расхождение с базой', () => {
  const cloud = withBase(2, 'раз\nдва\n', 'раз\nдва\n');
  const mirror = { path: 'projects/heys.md', text: 'раз\r\nдва\r\nтри\r\n', rev: 2 };
  const res = tasks.mergeTasksFileValue(mirror, cloud, 5000);
  assert.equal(res.ok, true);
  assert.equal(res.value.text, 'раз\nдва\nтри\n');
});

// ── Хранение предыдущей версии ───────────────────────────────────────────

test('базу пишет сервер: присланная клиентом снимается', () => {
  const incoming = { path: 'NOW.md', text: 'новое', rev: 5, base: { text: 'выдумка', rev: 4 } };
  const stored = tasks.withTasksBase(incoming, { text: 'облачное', rev: 4 });
  assert.deepEqual(stored.base, { text: 'облачное', rev: 4 });
  assert.equal(incoming.base.text, 'выдумка', 'исходное значение портить нельзя');
});

test('файла в облаке не было — базы нет, и выдумывать её нечем', () => {
  const stored = tasks.withTasksBase({ path: 'NOW.md', text: 'первое', rev: 1 }, null);
  assert.equal('base' in stored, false);
  const overNothing = tasks.withTasksBase({ path: 'NOW.md', text: 'первое', rev: 1, base: { text: 'x', rev: 1 } }, { rev: 0 });
  assert.equal('base' in overNothing, false, 'база из ниоткуда опаснее её отсутствия');
});

test('хранится ровно одна предыдущая версия, истории не копится', () => {
  const rev1 = tasks.withTasksBase({ path: 'NOW.md', text: 'два', rev: 2 }, { text: 'раз', rev: 1 });
  const rev2 = tasks.withTasksBase({ path: 'NOW.md', text: 'три', rev: 3 }, rev1);
  assert.equal(rev2.base.text, 'два');
  assert.equal(rev2.base.rev, 2);
  assert.equal('base' in rev2.base, false, 'база базы означала бы историю, а места под неё нет');
});

test('слишком большой предыдущий текст не хранится — слияние честно недоступно', () => {
  const huge = 'x'.repeat(tasks.TASKS_BASE_MAX_BYTES + 1);
  const stored = tasks.withTasksBase({ path: 'NOW.md', text: 'новое', rev: 3 }, { text: huge, rev: 2 });
  assert.equal('base' in stored, false);
});

test('расхождение больше потолка сравнения — отказ, а не гигабайт памяти', () => {
  const lines = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join('\n');
  const base = lines('b', 2400);
  const merged = tasks.mergeTasksText(base, lines('o', 2400), lines('t', 2400));
  assert.equal(merged.ok, false);
  assert.equal(merged.reason, 'merge_too_large');
});

// ── Путь записи ──────────────────────────────────────────────────────────

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

test('обработчик: расходящиеся правки в разные места сливаются, индекс догоняет', () => {
  const mergeBatchTasks = loadHandlerFn('mergeBatchTasksExistingRows');
  const items = [
    { k: 'heys_tasks_projects_heys', v: { path: 'projects/heys.md', text: '# П\n- [ ] раз\n- [x] два\n', rev: 790 } },
    { k: 'heys_tasks_index', v: { files: { 'projects/heys.md': { rev: 790, updatedAt: 9 } }, updatedAt: 9 } },
  ];
  const current = new Map([
    ['heys_tasks_projects_heys', {
      v: {
        path: 'projects/heys.md',
        text: '# П\n- [x] раз\n- [ ] два\n',
        rev: 790,
        base: { text: '# П\n- [ ] раз\n- [ ] два\n', rev: 789 },
      },
    }],
    ['heys_tasks_index', { v: { files: { 'projects/heys.md': { rev: 790, updatedAt: 20 } }, updatedAt: 20 } }],
  ]);

  const res = mergeBatchTasks(items, current, 5000);
  assert.deepEqual(res.blocked, [], 'непересекающиеся правки не повод терять одну из них');
  assert.equal(res.merged.length, 1);
  assert.equal(res.merged[0].k, 'heys_tasks_projects_heys');
  assert.equal(res.merged[0].rev, 791);
  assert.equal(res.merged[0].base_rev, 789);
  assert.equal('value' in res.merged[0], false, 'текст файла в ответе вызывающему не нужен');
  const file = res.kept[0].v;
  assert.equal(file.text, '# П\n- [x] раз\n- [x] два\n');
  assert.equal(file.rev, 791);
  assert.deepEqual(file.base, { text: '# П\n- [x] раз\n- [ ] два\n', rev: 790 },
    'база обязана переехать на облачный текст, иначе следующее слияние пойдёт от чужого предка');
  assert.equal(res.kept[1].v.files['projects/heys.md'].rev, 791,
    'индекс с ревизией ниже фактической — файл, о котором пуллер не узнает');
});

test('обработчик: спорная правка по-прежнему отбивается', () => {
  const mergeBatchTasks = loadHandlerFn('mergeBatchTasksExistingRows');
  const items = [
    { k: 'heys_tasks_now', v: { path: 'NOW.md', text: '- [~] раз\n', rev: 12 } },
  ];
  const current = new Map([
    ['heys_tasks_now', { v: { path: 'NOW.md', text: '- [x] раз\n', rev: 12, base: { text: '- [ ] раз\n', rev: 11 } } }],
  ]);
  const res = mergeBatchTasks(items, current, 5000);
  assert.deepEqual(res.merged, []);
  assert.equal(res.blocked.length, 1);
  assert.equal(res.blocked[0].reason, 'tasks_stale_rev');
  assert.equal(res.blocked[0].merge, 'merge_conflict', 'причина отказа должна называть, почему не слилось');
  assert.deepEqual(res.kept, []);
});

test('обработчик: обычная запись кладёт предыдущий текст рядом — иначе сливать будет нечем', () => {
  const mergeBatchTasks = loadHandlerFn('mergeBatchTasksExistingRows');
  const items = [
    { k: 'heys_tasks_now', v: { path: 'NOW.md', text: 'новое\r\n', rev: 4, base: { text: 'выдумка', rev: 3 } } },
    { k: 'heys_tasks_days_2026-09-03', v: { path: 'days/2026-09-03.md', text: 'первый день\n', rev: 1 } },
  ];
  const current = new Map([
    ['heys_tasks_now', { v: { path: 'NOW.md', text: 'старое\n', rev: 3 } }],
  ]);
  const res = mergeBatchTasks(items, current, 5000);
  assert.deepEqual(res.blocked, []);
  assert.equal(res.normalized, 1);
  assert.equal(res.kept[0].v.text, 'новое\n');
  assert.deepEqual(res.kept[0].v.base, { text: 'старое\n', rev: 3 });
  assert.equal('base' in res.kept[1].v, false, 'нового файла в облаке не было — базе взяться неоткуда');
});

test('целиковый путь записи зовёт слияние, а дельта-путь обновляет базу', () => {
  const index = lf(RPC_INDEX);
  assert.match(index, /tasksKv\.mergeTasksFileValue\(it\.v, currentValue/,
    'batch_upsert_client_kv_by_curator не зовёт трёхстороннее слияние — правило недостижимо');
  assert.match(index, /it\.v = tasksKv\.withTasksBase\(it\.v, currentValue\)/,
    'обычная запись не сохраняет предыдущий текст — сливать в следующий раз будет нечем');
  assert.match(index, /mergedFile = tasksKv\.withTasksBase\(applied\.file, byKey\[fileKey\]\)/,
    'дельта-путь не обновляет базу — она отстанет там, где задачник пишут чаще всего');
  assert.match(index, /tasks_merged: tasksMergedKeys/,
    'слияние молчит вызывающему — его следующая запись пойдёт от текста, которого в облаке нет');
  assert.match(index, /'tasks_three_way_merge', TRUE/,
    'слияние не оставляет следа в data_loss_audit — проверить потом будет нечем');
});

test('копия модуля в heys-api-rpc знает те же функции', () => {
  const kv = require(RPC_LIB);
  for (const name of ['withTasksBase', 'diffLineOps', 'mergeTasksText', 'mergeTasksFileValue']) {
    assert.equal(typeof kv[name], 'function', `${name} не доехал до копии, которая пишет файл`);
  }
  assert.equal(lf(RPC_LIB), lf(path.resolve(__dirname, '..', 'lib', 'tasks.js')));
});
