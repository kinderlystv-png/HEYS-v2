'use strict';

/**
 * Задачник в KV: контракт ключей и читающий слой.
 *
 * Главное, что здесь проверяется, — путь из внешнего мира не может увести за
 * пределы задачника, а контекст темы поднимается вместе с открытыми вопросами
 * и обязательствами: без них разбор вводной начинается с уже заданного вопроса.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../lib/tasks');
const { createTasksTools } = require('../lib/tasks-tools');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const JWT = 'curator-jwt';
const NOW = Date.UTC(2026, 7, 2, 12, 0);

class ToolError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const HEYS_PROJECT = `# HEYS

## Задачи

- [ ] P1 Собрать оптимальную версию лендинга due:2026-08-04 #next #ноут ^2026-08-01
  - зум демо-ролика почти готов
  - открыто: версия D закрывает эту задачу или нужен ещё вариант?
- [ ] P2 Прогнать месячный аудит ПДн due:2026-09-01 #ноут ^2026-08-01
- [x] P2 Починить пересчёт hours due:2026-08-01 #ноут ^2026-08-01
`;

const FAMILY_PROJECT = `# Семья

## Задачи

- [>] P2 Забрать зеркало ^2026-07-20
  - ждём: Даня — привезёт зеркало, с 2026-07-25
- [ ] P1 Покрасить потолок баллончиком due:2026-08-03 #next ^2026-08-01
`;

const JOURNAL = `# Журнал 2026-08

## 2026-08-01

Обсуждали лендинг: решили собрать версию D за закрытым роутом.
Он сказал: «сравним с B и C, потом выберем».
Открыто: какая версия идёт в релиз.
`;

function fakeApi({ index = null, files = {} } = {}) {
  const kv = { ...files };
  kv[tasks.INDEX_KEY] = index || {
    files: {
      'projects/heys.md': { rev: 3, updatedAt: 1 },
      'projects/family.md': { rev: 2, updatedAt: 1 },
      'journal/2026-08.md': { rev: 5, updatedAt: 1 },
    },
    updatedAt: 1,
  };
  const reads = [];
  return {
    reads,
    async getKVByCurator(bearer, clientId, key) {
      assert.equal(bearer, JWT);
      assert.equal(clientId, CLIENT);
      reads.push(key);
      return { data: kv[key] ?? null, error: null };
    },
    async getKVManyByCurator(bearer, clientId, keys) {
      assert.equal(clientId, CLIENT);
      const out = {};
      for (const key of keys) if (kv[key] !== undefined) out[key] = kv[key];
      return { data: out, error: null };
    },
  };
}

function build(api, { clientId = CLIENT } = {}) {
  return createTasksTools({ api, curatorJwt: JWT, clientId, nowMs: NOW, ToolError }).tools;
}

function withFiles() {
  return fakeApi({
    files: {
      [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
      [tasks.keyForPath('projects/family.md')]: { path: 'projects/family.md', text: FAMILY_PROJECT, rev: 2, updatedAt: 1 },
      [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: JOURNAL, rev: 5, updatedAt: 1 },
    },
  });
}

// ── Контракт ключей ──────────────────────────────────────────────────────

test('путь превращается в ключ и обратно', () => {
  assert.equal(tasks.keyForPath('projects/heys.md'), 'heys_tasks_projects_heys');
  assert.equal(tasks.keyForPath('days/2026-08-02.md'), 'heys_tasks_days_2026-08-02');
  assert.equal(tasks.keyForPath('NOW.md'), 'heys_tasks_now');
  assert.equal(tasks.pathForKey('heys_tasks_projects_heys'), 'projects/heys.md');
  assert.equal(tasks.pathForKey('heys_tasks_journal_2026-08'), 'journal/2026-08.md');
  assert.equal(tasks.pathForKey('heys_tasks_now'), 'NOW.md');
});

test('регистр и расширение не создают файл-двойник', () => {
  assert.equal(tasks.keyForPath('Projects/HEYS.MD'), tasks.keyForPath('projects/heys.md'));
  assert.equal(tasks.keyForPath('projects/heys'), tasks.keyForPath('projects/heys.md'));
});

test('путь наружу задачника отклоняется', () => {
  for (const bad of ['../secrets.md', '/etc/passwd', 'projects/../../x.md', '', '   ']) {
    assert.equal(tasks.normalizePath(bad), null, `путь «${bad}» должен быть отклонён`);
  }
});

test('строковое значение ключа принимается как текст файла', () => {
  const file = tasks.ensureFile('# Просто текст', 'NOW.md');
  assert.equal(file.text, '# Просто текст');
  assert.equal(file.path, 'NOW.md');
});

test('bumpFile двигает ревизию — на ней держится защита от гонки', () => {
  const file = tasks.ensureFile({ path: 'NOW.md', text: 'a', rev: 4 }, 'NOW.md');
  const next = tasks.bumpFile(file, 'b', 777);
  assert.equal(next.rev, 5);
  assert.equal(next.updatedAt, 777);
});

// ── Разбор задач ─────────────────────────────────────────────────────────

test('строка задачи разбирается на приоритет, срок и теги', () => {
  const parsed = tasks.parseTaskLine('- [ ] P1 Собрать лендинг due:2026-08-04 #next #ноут ^2026-08-01');
  assert.equal(parsed.priority, 'P1');
  assert.equal(parsed.due, '2026-08-04');
  assert.equal(parsed.created, '2026-08-01');
  assert.deepEqual(parsed.tags, ['next', 'ноут']);
  assert.equal(parsed.title, 'Собрать лендинг');
  assert.equal(parsed.done, false);
});

test('вложенные строки остаются при задаче — в них половина смысла', () => {
  const parsed = tasks.parseTasks({ path: 'projects/heys.md', text: HEYS_PROJECT });
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].children.length, 2);
  assert.ok(parsed[0].children.some((c) => c.startsWith('открыто:')));
  assert.equal(parsed[2].done, true);
});

// ── Инструменты ──────────────────────────────────────────────────────────

test('tasks_read отдаёт файл целиком с ревизией', async () => {
  const tools = build(withFiles());
  const res = await tools.tasks_read({ path: 'projects/heys.md' });
  assert.equal(res.structured.rev, 3);
  assert.match(res.structured.text, /Собрать оптимальную версию лендинга/);
});

test('tasks_read на неизвестный путь не падает, а говорит что пусто', async () => {
  const tools = build(withFiles());
  const res = await tools.tasks_read({ path: 'projects/mine2d.md' });
  assert.equal(res.structured.text, '');
});

test('tasks_search ищет по всем файлам и отдаёт окружение строки', async () => {
  const tools = build(withFiles());
  const res = await tools.tasks_search({ query: 'лендинг версия' });
  assert.ok(res.structured.matches.length > 0);
  const journalHit = res.structured.matches.find((m) => m.path.startsWith('journal/'));
  assert.ok(journalHit, 'журнал должен попасть в поиск');
  assert.ok(journalHit.context.includes('\n'), 'у совпадения есть соседние строки');
});

test('tasks_context поднимает открытые вопросы и обязательства перед людьми', async () => {
  const tools = build(withFiles());

  const landing = await tools.tasks_context({ topic: 'версия' });
  assert.ok(landing.structured.open_questions.length >= 1, 'открытый вопрос про версию найден');
  assert.ok(landing.structured.journal.length >= 1, 'запись журнала найдена');

  const mirror = await tools.tasks_context({ topic: 'зеркало' });
  assert.equal(mirror.structured.people.length, 1);
  assert.equal(mirror.structured.people[0].kind, 'ждём');
  assert.match(mirror.structured.people[0].text, /Даня/);
});

test('tasks_list разводит просроченное, сегодняшнее и #next', async () => {
  const tools = build(withFiles());
  const res = await tools.tasks_list({});
  // Сегодня 2026-08-02: аудит ПДн (09-01) в будущем, закрытая задача не считается.
  assert.equal(res.structured.overdue.length, 0);
  assert.equal(res.structured.total_active, 4);
  assert.equal(res.structured.next.length, 2);
});

test('tasks_list фильтрует по проекту и по тегу', async () => {
  const tools = build(withFiles());
  const byProject = await tools.tasks_list({ project: 'family' });
  assert.equal(byProject.structured.total_active, 2);

  const byTag = await tools.tasks_list({ tag: '#ноут' });
  assert.ok(byTag.structured.total_active >= 1);
  assert.ok(byTag.structured.next.every((t) => t.tags.includes('ноут')));
});

test('без настроенного клиента инструменты отказывают понятной ошибкой', async () => {
  const tools = build(withFiles(), { clientId: null });
  await assert.rejects(() => tools.tasks_read({ path: 'NOW.md' }), (e) => {
    assert.equal(e.code, 'tasks_not_configured');
    return true;
  });
});

// ── Контракт с доской ────────────────────────────────────────────────────

test('заголовок и хэш совпадают с build_board.py — эталон снят с самой доски', () => {
  const golden = [
    ['P1 Собрать оптимальную версию лендинга due:2026-08-04 #next #ноут ^2026-08-01', 'Собрать оптимальную версию лендинга', '0765d3'],
    ['P2 Прогнать месячный аудит ПДн: pnpm pdn:monthly-audit due:2026-09-01 #ноут ^2026-08-01', 'Прогнать месячный аудит ПДн: pnpm pdn:monthly-audit', '8e3572'],
    ['Купить леску #15min #город', 'Купить леску', '8c6b61'],
  ];
  for (const [raw, title, hash] of golden) {
    assert.equal(tasks.taskTitle(raw), title);
    assert.equal(tasks.taskHash('heys', title), hash, `хэш для «${title}» разошёлся с доской`);
  }
});

// ── Операции записи ──────────────────────────────────────────────────────

test('задача встаёт в конец своего раздела, а не в конец файла', () => {
  const text = '# HEYS\n\n## Задачи\n\n- [ ] P2 Первая ^2026-08-01\n\n## Идеи\n\n- мысль\n';
  const next = tasks.appendToSection(text, '- [ ] P2 Вторая ^2026-08-02');
  const lines = next.split('\n');
  assert.ok(lines.indexOf('- [ ] P2 Вторая ^2026-08-02') < lines.indexOf('## Идеи'), 'задача не должна попадать в Идеи');
});

test('правка задачи меняет поле и не трогает заголовок', () => {
  const line = '- [ ] P2 Купить леску #город ^2026-08-01';
  const patched = tasks.applyTaskPatch(line, { priority: 'P1', due: '2026-08-09', addTags: ['next'] });
  assert.match(patched, /P1/);
  assert.match(patched, /due:2026-08-09/);
  assert.match(patched, /#next/);
  assert.equal(tasks.taskTitle(patched), 'Купить леску', 'заголовок обязан остаться прежним — на нём хэш');
  assert.equal(tasks.taskHash('family', tasks.taskTitle(patched)), tasks.taskHash('family', tasks.taskTitle(line)));
});

test('снятие срока и закрытие задачи', () => {
  const line = '- [ ] P1 Покрасить потолок due:2026-08-03 #next ^2026-08-01';
  assert.ok(!/due:/.test(tasks.applyTaskPatch(line, { due: '' })));
  assert.match(tasks.applyTaskPatch(line, { state: 'done' }), /^- \[x\]/);
  assert.match(tasks.applyTaskPatch(line, { state: 'wait' }), /^- \[>\]/);
});

test('вложенная строка встаёт под своей задачей, а не под соседней', () => {
  const text = '## Задачи\n\n- [ ] P2 Первая ^2026-08-01\n  - контекст\n- [ ] P2 Вторая ^2026-08-01\n';
  const next = tasks.appendChild(text, 2, 'ждём: Даня — зеркало, с 2026-08-05');
  const lines = next.split('\n');
  assert.equal(lines[4], '  - ждём: Даня — зеркало, с 2026-08-05');
  assert.match(lines[5], /Вторая/);
});

test('patchBlock заменяет блок между якорями и падает на ненайденном якоре', () => {
  const text = '# П\n\n## Задачи\n\n- [ ] стар\n\n## Идеи\n\n- мысль\n';
  const next = tasks.patchBlock(text, { from: '## Задачи', to: '## Идеи', replacement: '## Задачи\n\n- [ ] нов\n' });
  assert.match(next, /- \[ \] нов/);
  assert.ok(!/стар/.test(next));
  assert.match(next, /## Идеи/);
  assert.throws(() => tasks.patchBlock(text, { from: '## Нет такого', replacement: 'x' }), /anchor_not_found/);
});

// ── Пишущие инструменты ──────────────────────────────────────────────────

function withWrites() {
  const api = withFiles();
  api.writes = [];
  api.upsertKVManyByCurator = async (bearer, clientId, items, contextId) => {
    assert.equal(clientId, CLIENT);
    api.writes.push({ items, contextId });
    return { ok: true };
  };
  return api;
}

test('tasks_capture кладёт задачу в проект и возвращает ссылку с хэшем', async () => {
  const api = withWrites();
  const tools = build(api);
  const res = await tools.tasks_capture({ text: 'Купить леску', project: 'family', tags: ['15min'] });

  assert.equal(res.structured.path, 'projects/family.md');
  assert.equal(res.structured.title, 'Купить леску');
  assert.equal(res.structured.hash, tasks.taskHash('family', 'Купить леску'));
  // Пишутся оба ключа сразу: файл и индекс.
  assert.equal(api.writes.length, 1);
  assert.deepEqual(api.writes[0].items.map((i) => i.k).sort(),
    [tasks.INDEX_KEY, tasks.keyForPath('projects/family.md')].sort());
  assert.match(api.writes[0].items[0].v.text, /- \[ \] P2 Купить леску #15min \^/);
});

test('tasks_capture без проекта уходит в INBOX', async () => {
  const api = withWrites();
  const res = await build(api).tasks_capture({ text: 'Странная мысль' });
  assert.equal(res.structured.path, 'INBOX.md');
});

test('tasks_update находит задачу по хэшу доски', async () => {
  const api = withWrites();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const res = await build(api).tasks_update({ project: 'family', hash, due: '2026-08-09', note: 'открыто: какой цвет?' });

  assert.match(res.structured.changed.join(' '), /срок → 2026-08-09/);
  const saved = api.writes[0].items.find((i) => i.k === tasks.keyForPath('projects/family.md')).v.text;
  assert.match(saved, /Покрасить потолок баллончиком due:2026-08-09/);
  assert.match(saved, /^ {2}- открыто: какой цвет\?$/m);
});

test('tasks_update на несуществующий хэш не пишет ничего', async () => {
  const api = withWrites();
  await assert.rejects(() => build(api).tasks_update({ project: 'family', hash: 'ffffff', due: '2026-08-09' }),
    (e) => e.code === 'task_not_found');
  assert.equal(api.writes.length, 0);
});

test('tasks_patch отклоняет правку по устаревшей ревизии вместо затирания', async () => {
  const api = withWrites();
  const tools = build(api);
  await assert.rejects(
    () => tools.tasks_patch({ path: 'projects/heys.md', rev: 2, from: '## Задачи', replacement: 'x' }),
    (e) => {
      assert.equal(e.code, 'stale_rev');
      assert.equal(e.details.current_rev, 3);
      return true;
    },
  );
  assert.equal(api.writes.length, 0, 'при устаревшей ревизии запись не уходит');

  const ok = await tools.tasks_patch({ path: 'projects/heys.md', rev: 3, from: '## Задачи', to: '- [x] P2 Починить пересчёт hours due:2026-08-01 #ноут ^2026-08-01', replacement: '## Задачи\n' });
  assert.equal(ok.structured.rev, 4);
});

test('запись двигает ревизию и обновляет индекс одним вызовом', async () => {
  const api = withWrites();
  await build(api).tasks_capture({ text: 'Ещё одна', project: 'heys' });
  const write = api.writes[0];
  const file = write.items.find((i) => i.k === tasks.keyForPath('projects/heys.md')).v;
  const index = write.items.find((i) => i.k === tasks.INDEX_KEY).v;
  assert.equal(file.rev, 4, 'ревизия выросла с 3 до 4');
  assert.equal(index.files['projects/heys.md'].rev, 4, 'индекс знает новую ревизию');
});
