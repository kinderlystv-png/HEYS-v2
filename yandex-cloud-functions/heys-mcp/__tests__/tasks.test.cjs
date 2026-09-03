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
const callContext = require('../lib/call-context');

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
    kv,
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

test('файл с CRLF читается как обычный — иначе проект молча пустеет', () => {
  const crlf = HEYS_PROJECT.replace(/\n/g, '\r\n');
  const file = tasks.ensureFile({ path: 'projects/heys.md', text: crlf, rev: 3 }, 'projects/heys.md');
  assert.ok(!file.text.includes('\r'), 'перевод строки нормализуется на входе');
  // Инцидент 18.08: projects/heys.md приехал с CRLF, parseTaskLine не совпал
  // ни разу — планёрка потеряла все задачи проекта и объявила живые слоты
  // ссылками на задачи, которых нет.
  const parsed = tasks.parseTasks(file);
  const plain = tasks.parseTasks({ path: 'projects/heys.md', text: HEYS_PROJECT });
  assert.equal(parsed.length, plain.length);
  assert.ok(parsed.length > 0);
  assert.equal(parsed[0].children.length, 2);
});

test('строковое значение с CRLF нормализуется той же дорогой', () => {
  const file = tasks.ensureFile('# Заголовок\r\n\r\n- [ ] P2 Дело\r\n', 'NOW.md');
  assert.ok(!file.text.includes('\r'));
  assert.equal(tasks.parseTasks(file).length, 1);
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

test('patchBlock без to меняет одну строку, а не хвост файла', () => {
  // Инцидент 05.08 / heys/e4ce9e: без to патч жрал всё до EOF — казалось,
  // что «одиночный якорь сломан». Контракт: from alone = одна строка.
  const text = '## Замечено\n\n- [ ] первый\n- [ ] второй\n\n## Итог\n';
  const next = tasks.patchBlock(text, {
    from: '- [ ] первый',
    replacement: '- [x] первый — сделано',
  });
  assert.match(next, /- \[x\] первый — сделано/);
  assert.match(next, /- \[ \] второй/);
  assert.match(next, /## Итог/);
});

test('patchBlock принимает уникальную подстроку якоря (кейс Codex)', () => {
  const text = [
    '- [ ] 2026-08-03 · Режим Codex: запустить схему — инструкция в docs/codex-mode.md',
    '- [ ] 2026-08-03 · Другое дело',
    '## Замечено',
  ].join('\n');
  const next = tasks.patchBlock(text, {
    from: 'Codex',
    replacement: '- [x] 2026-08-03 · [разработка] Режим Codex: запустить схему — инструкция в docs/codex-mode.md',
  });
  assert.match(next, /\[разработка\] Режим Codex/);
  assert.match(next, /Другое дело/);
  assert.match(next, /## Замечено/);
});

test('patchBlock отказывает при неоднозначной подстроке', () => {
  const text = '- [ ] Codex один\n- [ ] Codex два\n';
  assert.throws(
    () => tasks.patchBlock(text, { from: 'Codex', replacement: 'x' }),
    /anchor_ambiguous/,
  );
});

// ── Пишущие инструменты ──────────────────────────────────────────────────

function withWrites() {
  const api = withFiles();
  api.writes = [];
  api.appendTasksFileByCurator = async (bearer, clientId, spec) => {
    assert.equal(clientId, CLIENT);
    const key = tasks.keyForPath(spec.path);
    const file = tasks.ensureFile(api.kv[key], spec.path);
    if (Number(spec.base_rev) > 0 && Number(file.rev) !== Number(spec.base_rev)) {
      return { ok: false, error: 'stale_rev', current_rev: file.rev };
    }
    const applied = tasks.applyDeltaToFile(file, spec.mode, spec.block, Date.now());
    api.kv[key] = applied.file;
    for (const arch of applied.archives) {
      api.kv[tasks.keyForPath(arch.path)] = arch;
    }
    const index = tasks.ensureIndex(api.kv[tasks.INDEX_KEY]);
    let nextIndex = index;
    for (const arch of applied.archives) nextIndex = tasks.withIndexEntry(nextIndex, arch, Date.now());
    nextIndex = tasks.withIndexEntry(nextIndex, applied.file, Date.now());
    api.kv[tasks.INDEX_KEY] = nextIndex;
    api.writes.push({ append: spec, file: applied.file });
    return {
      ok: true,
      data: { path: applied.file.path, rev: applied.file.rev, rotated: applied.archives.map((a) => a.path) },
    };
  };
  api.upsertKVManyByCurator = async (bearer, clientId, items, contextId) => {
    assert.equal(clientId, CLIENT);
    api.writes.push({ items, contextId });
    // Записанное должно быть видно следующему чтению: запись перечитывает
    // себя, чтобы поймать чужую параллельную. Фейк, который «пишет в никуда»,
    // изображал бы ровно ту потерю, от которой защита и стоит.
    for (const item of items) api.kv[item.k] = item.v;
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
  // Файл+индекс одним upsert; следом — agent_state с transcript_pending.
  assert.equal(api.writes.length, 2);
  assert.deepEqual(api.writes[0].items.map((i) => i.k).sort(),
    [tasks.INDEX_KEY, tasks.keyForPath('projects/family.md')].sort());
  assert.equal(api.writes[1].items.map((i) => i.k).join(), tasks.STATE_KEY);
  assert.match(api.writes[0].items.find((i) => i.k === tasks.keyForPath('projects/family.md')).v.text,
    /- \[ \] P2 Купить леску #15min \^/);
  assert.equal(res.structured.transcript_pending, true);
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

test('tasks_update батчем правит несколько задач одной записью файла', async () => {
  const api = withWrites();
  const ceiling = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const mirror = tasks.taskHash('family', 'Забрать зеркало');
  const res = await build(api).tasks_update({
    project: 'family',
    updates: [
      { hash: ceiling, state: 'done' },
      { hash: mirror, due: '2026-08-11', note: 'открыто: кто везёт' },
    ],
  });

  const familyKey = tasks.keyForPath('projects/family.md');
  const fileWrites = api.writes.filter((w) => (w.items || []).some((i) => i.k === familyKey));
  assert.equal(fileWrites.length, 1, 'файл проекта сохранён один раз, а не по разу на задачу');
  assert.equal(res.structured.updated.length, 2);
  const saved = fileWrites[0].items.find((i) => i.k === familyKey).v.text;
  assert.match(saved, /\[x\] P1 Покрасить потолок баллончиком/);
  assert.match(saved, /Забрать зеркало .*due:2026-08-11/);
  assert.match(saved, /^ {2}- открыто: кто везёт$/m);
});

test('батч по двум проектам сохраняет каждый файл своей записью', async () => {
  const api = withWrites();
  const res = await build(api).tasks_update({
    updates: [
      { project: 'family', hash: tasks.taskHash('family', 'Покрасить потолок баллончиком'), state: 'done' },
      { project: 'heys', hash: tasks.taskHash('heys', 'Прогнать месячный аудит ПДн'), priority: 'P1' },
    ],
  });
  assert.equal(res.structured.updated.length, 2);
  assert.equal(res.structured.files.length, 2);
  const projectWrites = api.writes.filter((w) => (w.items || [])
    .some((i) => i.k === tasks.keyForPath('projects/family.md') || i.k === tasks.keyForPath('projects/heys.md')));
  assert.equal(projectWrites.length, 2);
});

test('непринятая правка в батче отменяет весь вызов, файл остаётся прежним', async () => {
  const api = withWrites();
  await assert.rejects(() => build(api).tasks_update({
    project: 'family',
    updates: [
      { hash: tasks.taskHash('family', 'Покрасить потолок баллончиком'), state: 'done' },
      { hash: 'ffffff', state: 'done' },
    ],
  }), (e) => e.code === 'task_not_found');
  assert.equal(api.writes.length, 0);
});

test('пустой updates отклоняется, а не проходит молча', async () => {
  const api = withWrites();
  await assert.rejects(() => build(api).tasks_update({ project: 'family', updates: [] }),
    (e) => e.code === 'invalid_updates');
  assert.equal(api.writes.length, 0);
});

test('одиночная правка отвечает в прежнем формате', async () => {
  const api = withWrites();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const res = await build(api).tasks_update({ project: 'family', hash, state: 'done' });
  assert.equal(res.structured.hash, hash);
  assert.equal(res.structured.title, 'Покрасить потолок баллончиком');
  assert.match(res.structured.changed.join(' '), /состояние → done/);
  assert.match(res.text, /^family\/[0-9a-f]{6} · Покрасить потолок баллончиком:/);
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

// ── Второй слой: управление доской ───────────────────────────────────────

// Формат — как в реальном habits.md и как его читает build_board.py:
// «- Название | дата, дата». Разделитель именно `|`, даты через запятую.
const HABITS = `# Привычки

- Зарядка | 2026-07-30, 2026-08-01
- Чтение |
`;

const DAY = `# 2026-08-02

- 17:00–22:00 Дом у родителей
- 19:00–23:00 Дома у родителей
`;

test('привычка отмечается один раз, повтор не портит строку', () => {
  const first = tasks.markHabit(HABITS, 'зарядка', '2026-08-02');
  assert.equal(first.already, false);
  assert.match(first.text, /- Зарядка \| 2026-07-30, 2026-08-01, 2026-08-02/);
  const again = tasks.markHabit(first.text, 'зарядка', '2026-08-02');
  assert.equal(again.already, true);
  assert.equal(again.text, first.text, 'повтор не должен менять файл');
});

test('привычка без единой отметки тоже находится', () => {
  const res = tasks.markHabit(HABITS, 'чтение', '2026-08-02');
  assert.equal(res.already, false);
  assert.match(res.text, /- Чтение \| 2026-08-02/);
});

test('несуществующая привычка не заводится молча', () => {
  assert.throws(() => tasks.markHabit(HABITS, 'медитация', '2026-08-02'), /habit_not_found/);
});

test('пересечения слотов считаются до записи', () => {
  assert.equal(tasks.slotConflicts(DAY, '10:00', '11:00').length, 0);
  const busy = tasks.slotConflicts(DAY, '18:00', '20:00');
  assert.equal(busy.length, 2, 'слот 18–20 пересекает оба вечерних блока');
  assert.match(busy.map((c) => c.title).join(' '), /Дом у родителей/);
});

test('слот через полночь не считается пустым интервалом', () => {
  const night = tasks.slotConflicts('- 23:00–01:00 Лендинг\n', '00:00', '02:00');
  assert.equal(night.length, 1, 'ночной слот обязан пересечься');
});

test('галочка подпункта ставится по тексту, а не по номеру', () => {
  const text = '- [ ] P1 Мероприятие ^2026-08-01\n  - [ ] согласовать сценарий\n  - [ ] купить реквизит\n';
  const res = tasks.toggleSubtask(text, 0, 'реквизит');
  assert.match(res.text, /- \[x\] купить реквизит/);
  assert.match(res.text, /- \[ \] согласовать сценарий/, 'соседний подпункт не тронут');
  assert.throws(() => tasks.toggleSubtask(text, 0, 'торт'), /subtask_not_found/);
});

test('снятая строка «открыто» исчезает, соседние остаются', () => {
  const text = '- [ ] P1 Лендинг ^2026-08-01\n  - открыто: какая версия в релиз?\n  - зум почти готов\n';
  const res = tasks.removeChild(text, 0, 'какая версия');
  assert.ok(!/открыто:/.test(res.text));
  assert.match(res.text, /зум почти готов/);
  assert.match(res.removed, /^открыто:/);
});

test('перенос задачи забирает её вложенные строки целиком', () => {
  const text = '## Задачи\n\n- [ ] P2 Первая ^2026-08-01\n  - контекст первой\n- [ ] P2 Вторая ^2026-08-01\n';
  const res = tasks.cutTask(text, 2);
  assert.match(res.block, /Первая/);
  assert.match(res.block, /контекст первой/);
  assert.ok(!/Первая/.test(res.text), 'из источника задача убрана');
  assert.match(res.text, /Вторая/, 'соседняя задача осталась');
});

// ── Инструменты второго слоя ─────────────────────────────────────────────

function withBoard() {
  const api = withWrites();
  // Кладём в само хранилище, а не поверх одного читателя: запись перечитывает
  // файл пакетом, и фикстура, видимая только через getKVByCurator, изображала
  // бы «файл исчез» ровно в момент записи.
  Object.assign(api.kv, {
    [tasks.keyForPath('habits.md')]: { path: 'habits.md', text: HABITS, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('days/2026-08-02.md')]: { path: 'days/2026-08-02.md', text: DAY, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('money/2026-08.md')]: { path: 'money/2026-08.md', text: '# Август\n', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('archive/2026-08.md')]: { path: 'archive/2026-08.md', text: '# Архив\n', rev: 1, updatedAt: 1 },
  });
  return api;
}

test('tasks_slot называет конфликт вместо молчания', async () => {
  // Оба соседних слота в DAY без тега — доска и инструмент одинаково
  // подставляют «фокус», значит это настоящий конфликт, не мягкий «вопрос».
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '18:00', to: '20:00', title: 'Забрать торт' });
  assert.equal(res.structured.conflicts.length, 2);
  assert.ok(res.structured.conflicts.every((c) => c.level === 'конфликт'));
  assert.match(res.text, /Конфликт с/);
});

test('tasks_slot пишет тег вида в строку — не оставляет доске угадывать', async () => {
  const api = withBoard();
  await build(api).tasks_slot({ date: '2026-08-02', from: '09:00', to: '09:10', title: 'Позвонить', kind: 'дело' });
  const saved = api.writes[0].items[0].v.text;
  assert.match(saved, /- 09:00–09:10 Позвонить #дело/);
});

test('короткая врезка не считается конфликтом со слотом «фокус» рядом', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '23:00', to: '23:15', title: 'Пробить чеки', kind: 'дело' });
  assert.equal(res.structured.conflicts.length, 0, 'дело живёт внутри чего угодно, доска не должна обвести оба слота красным');
});

test('presence ставит вид «фон» и не конфликтует со слотом внутри него', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '19:30', to: '20:00', title: 'Ужин', presence: true });
  assert.equal(res.structured.kind, 'фон');
  const withWork = await build(api).tasks_slot({ date: '2026-08-02', from: '19:00', to: '19:30', title: 'Поработать', kind: 'фокус' });
  const clashesWithPresence = withWork.structured.conflicts.filter((c) => c.title === 'Ужин');
  assert.equal(clashesWithPresence.length, 0, 'работа внутри присутствия — норма, а не конфликт');
});

test('привычка в занятое время — «вопрос», а не «конфликт»', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '18:30', to: '19:00', title: 'Зарядка', kind: 'привычка' });
  const habit = res.structured.conflicts.find((c) => c.title === 'Дом у родителей');
  assert.equal(habit.level, 'вопрос');
  assert.match(res.text, /Стоит уточнить/);
  assert.ok(!/Конфликт с/.test(res.text));
});

test('неизвестный вид слота отклоняется до записи', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_slot({ date: '2026-08-02', from: '10:00', to: '10:10', title: 'x', kind: 'важное' }),
    (e) => e.code === 'invalid_kind');
  assert.equal(api.writes.length, 0);
});

// ── Неточный срок окном ──────────────────────────────────────────────────
//
// «В начале недели» — это не уклончивость, а честное состояние дела. Раньше
// такое приходилось округлять до одной выдуманной даты или переспрашивать.

test('окно читается строкой контекста, перевёрнутое и кривое — игнорируются', () => {
  assert.deepEqual(tasks.taskWindow(['окно: 2026-08-10..2026-08-12']), { from: '2026-08-10', to: '2026-08-12' });
  assert.deepEqual(tasks.taskWindow(['окно: 2026-08-10 .. 2026-08-12']), { from: '2026-08-10', to: '2026-08-12' });
  assert.equal(tasks.taskWindow(['окно: 2026-08-12..2026-08-10']), null, 'перевёрнутое окно — опечатка, а не срок');
  assert.equal(tasks.taskWindow(['окно: начало недели']), null);
  assert.equal(tasks.taskWindow(['окно: 10.08..12.08']), null);
  assert.equal(tasks.taskWindow(['обычный подпункт']), null);
});

test('окно не трогает хэш задачи — иначе все ссылки на неё отвалятся', () => {
  const withWindow = tasks.parseTasks({
    path: 'projects/kinderly.md',
    text: '# k\n\n- [ ] P1 Согласовать сценарий due:2026-08-12 ^2026-08-01\n  - окно: 2026-08-10..2026-08-12\n',
  })[0];
  assert.equal(withWindow.title, 'Согласовать сценарий', 'строка окна не должна попасть в заголовок');
  assert.equal(tasks.taskHash('kinderly', withWindow.title), tasks.taskHash('kinderly', 'Согласовать сценарий'));
  assert.equal(withWindow.due, '2026-08-12', 'срок остаётся поздней границей');
  assert.deepEqual(tasks.taskWindow(withWindow.children), { from: '2026-08-10', to: '2026-08-12' });
});

test('задача с открывшимся окном становится горячей до крайнего срока', () => {
  const task = {
    children: ['окно: 2026-08-10..2026-08-31'],
    due: '2026-08-31',
  };
  assert.equal(tasks.taskSignalDate(task), '2026-08-10');
});

test('внутри открытого окна и задача, и её вопрос попадают в «Требует решения»', () => {
  // Ровно тот случай, ради которого окно и заводится: «вторая половина
  // августа» со сроком на 31-е раньше молчала две недели и всплывала в день,
  // когда делать уже поздно.
  const file = {
    path: 'projects/heys.md',
    text: '# heys\n\n- [ ] P1 Прогнать месячный аудит ПДн due:2026-08-31 #next #blocked ^2026-08-01\n'
      + '  - окно: 2026-08-16..2026-08-31\n'
      + '  - открыто: аудит целиком или только новые формы?\n',
  };
  const parsed = tasks.parseTasks(file).map((t) => ({ ...t, ref: `heys/${tasks.taskHash('heys', t.title)}` }));
  const questions = tasks.collectOpenQuestions([file], { today: '2026-08-20' });
  assert.equal(questions[0].signal, '2026-08-16', 'вопрос обязан наследовать окно задачи, а не только её срок');

  const grouped = tasks.buildDecideGroups({
    blockedTasks: parsed, openQuestions: questions, today: '2026-08-20', dayText: '',
  });
  assert.ok(grouped.hot.some((r) => r.source === 'blocked'), 'задача внутри окна — горячая, крайний срок ещё не наступил');
  assert.ok(grouped.hot.some((r) => r.source === 'open'), 'вопрос по ней — тоже, иначе его зададут в последний день окна');

  // До открытия окна она молчит: 10-го числа спрашивать ещё не о чем.
  const early = tasks.buildDecideGroups({
    blockedTasks: parsed, openQuestions: tasks.collectOpenQuestions([file], { today: '2026-08-10' }), today: '2026-08-10', dayText: '',
  });
  assert.ok(!early.hot.some((r) => r.source === 'blocked'), 'до начала окна задача не должна лезть в горячее');
});

test('срок на поздней границе окна не делает задачу просроченной раньше времени', () => {
  const file = {
    path: 'projects/heys.md',
    text: '# heys\n\n- [ ] P1 Прогнать месячный аудит ПДн due:2026-08-31 #next ^2026-08-01\n  - окно: 2026-08-16..2026-08-31\n',
  };
  const [task] = tasks.parseTasks(file);
  const focus = tasks.pickFocus([task], { today: '2026-08-20', limit: 3 });
  const reasons = (focus[0].reasons || []).join(', ');
  assert.match(reasons, /окно с 2026-08-16/, 'внутри окна задача поднимается, и причина названа окном');
  assert.ok(!/просрочено/.test(reasons), 'просрочка считается по крайнему сроку, а не по началу окна');
});

test('tasks_update окном ставит строку и подтягивает срок к поздней границе', async () => {
  const api = liveTasksApi();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const res = await session(api).tasks_update({ project: 'family', hash, window: '2026-08-10..2026-08-12' });
  assert.match(res.text, /окно → 2026-08-10\.\.2026-08-12, срок → 2026-08-12/);
  const saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.match(saved, /окно: 2026-08-10\.\.2026-08-12/);
  assert.match(saved, /Покрасить потолок баллончиком.*due:2026-08-12/);
});

test('повторное окно заменяет прежнее, а точный срок снимает его совсем', async () => {
  const api = liveTasksApi();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  await session(api).tasks_update({ project: 'family', hash, window: '2026-08-10..2026-08-12' });
  await session(api).tasks_update({ project: 'family', hash, window: '2026-08-17..2026-08-19' });
  let saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.equal((saved.match(/окно:/g) || []).length, 1, 'два окна под одной задачей — две разные правды');
  assert.match(saved, /окно: 2026-08-17\.\.2026-08-19/);
  const res = await session(api).tasks_update({ project: 'family', hash, due: '2026-08-18' });
  saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.ok(!/окно:/.test(saved), 'появилась точность — окну больше нечего уточнять');
  assert.match(res.text, /окно снято/);
});

test('новая задача заводится с окном сразу, а не остаётся без срока', async () => {
  // Тот самый провал на живом прогоне: «согласовать с Машей — где-то в начале
  // следующей недели» ушло в захват, у которого окна не было, и задача легла
  // вообще без срока — то есть не всплыла бы ни в планёрке, ни в решениях.
  const api = liveTasksApi();
  const res = await session(api).tasks_capture({
    project: 'kinderly', text: 'Согласовать с Машей сценарий', window: '2026-08-10..2026-08-12', tags: ['next'],
  });
  assert.match(res.text, /окно 2026-08-10\.\.2026-08-12, срок 2026-08-12/);
  const saved = api.kv[tasks.keyForPath('projects/kinderly.md')].text;
  assert.match(saved, /Согласовать с Машей сценарий due:2026-08-12 #next/);
  assert.match(saved, /\n {2}- окно: 2026-08-10\.\.2026-08-12/);

  const [task] = tasks.parseTasks({ path: 'projects/kinderly.md', text: saved })
    .filter((t) => t.title === 'Согласовать с Машей сценарий');
  assert.equal(tasks.taskSignalDate(task), '2026-08-10', 'ранняя граница обязана поднимать задачу с понедельника');
  assert.equal(res.structured.hash, tasks.taskHash('kinderly', 'Согласовать с Машей сценарий'),
    'строка окна не должна попасть в заголовок и увести хэш');
});

test('кривое окно в захвате отклоняется до записи', async () => {
  const api = liveTasksApi();
  await assert.rejects(() => session(api).tasks_capture({ project: 'kinderly', text: 'Что-то', window: 'начало недели' }),
    (e) => e.code === 'invalid_window');
});

test('окно словами не принимается — границы считает ассистент, а не он', async () => {
  const api = liveTasksApi();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  await assert.rejects(() => session(api).tasks_update({ project: 'family', hash, window: 'начало недели' }),
    (e) => e.code === 'invalid_window');
  await assert.rejects(() => session(api).tasks_update({ project: 'family', hash, window: '2026-08-12..2026-08-10' }),
    (e) => e.code === 'invalid_window');
});

// ── День целиком одним вызовом ───────────────────────────────────────────
//
// Он описывает день фразой, а не по событию за раз. Шесть слотов шестью
// вызовами — это шесть полных перезаписей файла дня и шесть окон, в которые
// параллельная сессия ловит stale_write_blocked.

test('пачка слотов пишет день одной записью', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({
    date: '2026-08-02',
    slots: [
      { from: '09:00', to: '09:30', title: 'Зарядка', kind: 'привычка' },
      { from: '10:00', to: '11:00', title: 'Лендинг', kind: 'фокус' },
      { from: '11:30', to: '11:45', title: 'Позвонить в банк', kind: 'дело' },
    ],
  });
  const dayWrites = api.writes.filter((w) => (w.items || []).some((it) => it.k === tasks.keyForPath('days/2026-08-02.md')));
  assert.equal(dayWrites.length, 1, 'день пишется один раз, а не по слоту за запись');
  assert.equal(res.structured.count, 3);
  const saved = api.writes[0].items[0].v.text;
  assert.match(saved, /- 09:00–09:30 Зарядка #привычка/);
  assert.match(saved, /- 10:00–11:00 Лендинг #фокус/);
  assert.match(saved, /- 11:30–11:45 Позвонить в банк #дело/);
});

test('пересечение внутри пачки видно и отличимо от пересечения с днём', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({
    date: '2026-08-02',
    slots: [
      { from: '09:00', to: '11:00', title: 'Лендинг', kind: 'фокус' },
      { from: '10:00', to: '12:00', title: 'Созвон', kind: 'фокус' },
    ],
  });
  const inner = res.structured.conflicts.find((c) => c.title === 'Лендинг');
  assert.ok(inner, 'второй слот обязан увидеть первый — иначе пачка ставит два фокуса встык молча');
  assert.equal(inner.level, 'конфликт');
  assert.equal(inner.with, 'пачка', 'двигать надо то, что он назвал сейчас, а не то, что стоит с утра');
});

test('presence в пачке встаёт выше остальных слотов и держит свой порядок', async () => {
  const api = withBoard();
  await build(api).tasks_slot({
    date: '2026-08-02',
    slots: [
      { from: '10:00', to: '11:00', title: 'Лендинг', kind: 'фокус' },
      { from: '08:00', to: '14:00', title: 'Дом у родителей', presence: true },
      { from: '15:00', to: '20:00', title: 'Студия', presence: true },
    ],
  });
  const lines = api.writes[0].items[0].v.text.split('\n').filter(Boolean);
  const home = lines.findIndex((l) => l.includes('Дом у родителей #фон'));
  const studio = lines.findIndex((l) => l.includes('Студия #фон'));
  const work = lines.findIndex((l) => l.includes('Лендинг'));
  assert.ok(home >= 0 && studio >= 0 && work >= 0);
  assert.ok(home < work && studio < work, 'фон ниже слота задачи закроет его собой на доске');
  assert.ok(home < studio, 'взаимный порядок присутствий не должен переворачиваться');
});

test('ошибка в третьем слоте отменяет всю пачку и называет его номер', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_slot({
    date: '2026-08-02',
    slots: [
      { from: '09:00', to: '09:30', title: 'Зарядка' },
      { from: '10:00', to: '11:00', title: 'Лендинг' },
      { from: '12:00', to: '13:00', title: 'Студия', kind: 'важное' },
    ],
  }), (e) => e.code === 'invalid_kind' && /Слот 3/.test(e.message));
  assert.equal(api.writes.length, 0, 'половина расставленного дня хуже нерасставленного: непонятно, поставлен он или нет');
});

test('вызов без времени и без списка говорит, чего не хватает, а не падает про формат ЧЧ:ММ', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_slot({ date: '2026-08-02', title: 'Что-то' }),
    (e) => e.code === 'slot_args_missing');
  assert.equal(api.writes.length, 0);
});

test('одиночный вызов после правки отдаёт тот же плоский ответ, что и раньше', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '09:00', to: '09:10', title: 'Позвонить', kind: 'дело' });
  assert.equal(res.structured.from, '09:00');
  assert.equal(res.structured.title, 'Позвонить');
  assert.equal(res.structured.kind, 'дело');
  assert.equal(res.structured.slots, undefined, 'у одиночного вызова контракт не меняется');
  assert.match(res.text, /Поставил на 2026-08-02: 09:00–09:10 Позвонить \(дело\)/);
});

test('пачка читает файл проекта один раз на все слоты с одной задачей', async () => {
  const api = withBoard();
  const hash = tasks.taskHash('heys', 'Собрать оптимальную версию лендинга');
  const projectKey = tasks.keyForPath('projects/heys.md');
  let projectReads = 0;
  const origGet = api.getKVByCurator;
  api.getKVByCurator = async (bearer, clientId, keys, ...rest) => {
    const asked = Array.isArray(keys) ? keys : [keys];
    if (asked.includes(projectKey)) projectReads += 1;
    return origGet(bearer, clientId, keys, ...rest);
  };
  await build(api).tasks_slot({
    date: '2026-08-02',
    slots: [
      { from: '10:00', to: '11:00', title: 'Лендинг: разбор', ref: `heys/${hash}` },
      { from: '14:00', to: '15:00', title: 'Лендинг: правки', ref: `heys/${hash}` },
      { from: '16:00', to: '17:00', title: 'Лендинг: сборка', ref: `heys/${hash}` },
    ],
  });
  assert.equal(projectReads, 1, `файл задачи читается один раз, а не на каждый слот (прочитан ${projectReads} раз)`);
});

// ── Чей слот и что он забирает ───────────────────────────────────────────
//
// «У жены тренировка завтра в обед» — событие не его, а зависит от него он:
// ребёнок на нём и машина уехала. Признака два, оба необязательные: в этом же
// задачнике теги времени стояли на трёх задачах из пятидесяти двух, пока их не
// расставили разом, — обязательное поле не заполняется.

test('слот без признаков разбирается ровно как раньше', () => {
  const slots = tasks.parseSlots(DAY);
  assert.ok(slots.length, 'старый день читается');
  for (const slot of slots) {
    assert.equal(slot.whose, null);
    assert.deepEqual(slot.takes, []);
  }
  // Обычная скобка в названии остаётся текстом: признаки узнаются по ключевым
  // словам, а не по самой скобке.
  const plain = tasks.parseSlots('- 12:00–14:00 Уборка (перенесена с 4 августа)\n')[0];
  assert.equal(plain.title, 'Уборка (перенесена с 4 августа)');
  assert.deepEqual(plain.takes, []);
});

test('доска читает слот с признаками так же, как без них', () => {
  // Зеркало parse_day() из build_board.py: те же выражения в том же порядке.
  // `\b` после кириллицы в JS не работает, поэтому граница написана руками —
  // в Python она есть сама, смысл тот же.
  const B_SLOT = /^- (?:\[([ x])\]\s*)?(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+?)\s*$/;
  const B_KIND = /\s*#(фон|дело|фокус)(?![\wа-яё])/i;
  const B_PLACE = /\s*@([\wа-яё-]+)/i;
  const B_REF = /^([\w\d-]+\/[0-9a-f]{6})$/;
  const boardParse = (line) => {
    const m = B_SLOT.exec(line.trim());
    if (!m) return null;
    let text = m[4];
    const km = B_KIND.exec(text);
    const kind = km ? km[1].toLowerCase() : 'фокус';
    text = text.replace(new RegExp(B_KIND.source, 'gi'), '').trim();
    const pm = B_PLACE.exec(text);
    const place = pm ? pm[1].toLowerCase() : null;
    text = text.replace(new RegExp(B_PLACE.source, 'gi'), '').trim();
    let ref = null;
    if (text.includes('·')) {
      const cut = text.lastIndexOf('·');
      const tail = text.slice(cut + 1).trim();
      if (B_REF.test(tail)) { ref = tail; text = text.slice(0, cut).trim(); }
    }
    return { start: m[2], end: m[3], kind, place, ref, title: text, done: m[1] === 'x' };
  };

  const line = '- 12:00–15:00 Тренировка Саши (чей: жена; занято: машина, ребёнок) @зал · family/ab12c3 #фон';
  const board = boardParse(line);
  assert.ok(board, 'строка со признаками остаётся слотом для доски');
  assert.equal(board.kind, 'фон');
  assert.equal(board.place, 'зал');
  assert.equal(board.ref, 'family/ab12c3', 'ссылка на задачу читается — слот остаётся кликабельным');
  assert.equal(board.start, '12:00');
  assert.equal(board.end, '15:00');
  assert.match(board.title, /Тренировка Саши/);

  // Та же строка нашими глазами: признаки сняты, название чистое.
  const mine = tasks.parseSlots(`${line}\n`)[0];
  assert.equal(mine.kind, 'фон');
  assert.equal(mine.whose, 'жена');
  assert.deepEqual(mine.takes, ['машина', 'ребёнок']);
  assert.equal(mine.title, 'Тренировка Саши @зал · family/ab12c3');
});

test('tasks_slot ставит признаки перед ссылкой, а не после неё', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({
    date: '2026-08-02', from: '12:00', to: '15:00', title: 'Тренировка Саши',
    kind: 'фон', whose: 'жена', takes: ['машина', 'ребёнок'],
  });
  const saved = api.writes[0].items[0].v.text;
  assert.match(saved, /- 12:00–15:00 Тренировка Саши \(чей: жена; занято: машина, ребёнок\) #фон/);
  assert.equal(res.structured.whose, 'жена');
  assert.deepEqual(res.structured.takes, ['машина', 'ребёнок']);
  assert.match(res.text, /занято: машина, ребёнок/);

  // Со ссылкой на задачу порядок обязателен: доска ищет адрес в хвосте строки
  // после последней «·», и признаки после него сделали бы слот некликабельным.
  const withRef = dayApi();
  const hash = tasks.taskHash('heys', 'Собрать оптимальную версию лендинга');
  await session(withRef).tasks_slot({
    date: '2026-08-02', from: '16:00', to: '17:00', title: 'Съёмка',
    ref: `heys/${hash}`, takes: ['машина'],
  });
  const line = withRef.kv[tasks.keyForPath('days/2026-08-02.md')].text
    .split('\n').find((l) => l.includes('Съёмка'));
  assert.ok(line.indexOf('(занято: машина)') < line.indexOf('·'), 'признаки стоят до ссылки');
  assert.equal(tasks.parseSlotRef(line).ref.hash, hash, 'ссылка всё ещё читается');
});

test('слот без признаков пишется прежней строкой — пары полей на нём не видно', async () => {
  const api = withBoard();
  await build(api).tasks_slot({ date: '2026-08-02', from: '09:00', to: '09:10', title: 'Позвонить', kind: 'дело' });
  const saved = api.writes[0].items[0].v.text;
  assert.match(saved, /- 09:00–09:10 Позвонить #дело/);
  assert.ok(!/чей:|занято:|\(\)/.test(saved), 'пустых скобок в строке не появляется');
});

test('слот с признаками снимается по названию — скобка не мешает поиску', async () => {
  const api = dayApi();
  await session(api).tasks_slot({
    date: '2026-08-02', from: '12:00', to: '15:00', title: 'Тренировка Саши',
    kind: 'фон', whose: 'жена', takes: ['ребёнок'],
  });
  const res = await session(api).tasks_unslot({ date: '2026-08-02', slot: 'тренировка саши' });
  assert.equal(res.structured.title, 'Тренировка Саши');
  assert.ok(!/Тренировка Саши/.test(api.kv[tasks.keyForPath('days/2026-08-02.md')].text), 'строка ушла из дня');
});

test('ресурс не из словаря отклоняется до записи', async () => {
  const api = withBoard();
  await assert.rejects(
    () => build(api).tasks_slot({ date: '2026-08-02', from: '10:00', to: '11:00', title: 'x', takes: ['самокат'] }),
    (e) => e.code === 'invalid_resource',
  );
  assert.equal(api.writes.length, 0);
});

test('tasks_money без контура не проходит', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_money({ amount: 500, title: 'кофе' }),
    (e) => e.code === 'contour_required');
  assert.equal(api.writes.length, 0);
});

test('описание контура обещает отказ, а не выдуманное «прочее»', async () => {
  // Описание обещало, что операция без контура «уедет в прочее». Никакого
  // «прочего» в деньгах нет, и запись просто не проходит: агент, поверивший
  // описанию, ждал бы кривой строки в файле вместо отказа.
  const api = withBoard();
  const contour = createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError })
    .schemas.find((s) => s.name === 'tasks_money').inputSchema.properties.contour.description;
  assert.ok(!/прочее/i.test(contour), 'несуществующее последствие из описания убрано');
  assert.match(contour, /откажет и ничего не запишет/);
  await assert.rejects(() => build(api).tasks_money({ amount: 500, category: 'продукты' }),
    (e) => e.code === 'contour_required', 'описание обещает ровно то, что делает код');
});

test('tasks_money пишет операцию в том формате, который читает доска', async () => {
  const api = withBoard();
  const res = await build(api).tasks_money({
    amount: 7500, category: 'зарплаты', contour: 'kinderly',
    title: 'Зарплата Маше', account: 'Киндерли-нал', date: '2026-08-02',
  });
  assert.equal(res.structured.path, 'money/2026-08.md');
  const saved = api.writes[0].items[0].v.text;
  // Формат из money/README.md: «- ДД -СУММА категория ~контур · счёт · комментарий».
  // Свой формат тут смертелен: доска разбирает строки одним выражением, и всё,
  // что в него не попало, молча выпадает из подсчётов.
  assert.match(saved, /^- 02 -7500 зарплаты ~kinderly · Киндерли-нал · Зарплата Маше$/m);
  assert.equal(BOARD_OP_RE.test(saved.split('\n').find((l) => l.startsWith('- 02'))), true);
});

// Ровно то выражение, которым board_money.py разбирает операции. Если оно
// разойдётся с тем, что мы пишем, операции из чата пропадут с доски молча.
const BOARD_OP_RE = /^-\s+(\d{1,2})\s+([+-]\d+(?:\.\d+)?)\s+([^\s~·]+)\s*(?:~(\S+))?\s*(?:·\s*(.*))?$/;

test('после записи траты возвращается картина месяца, а не «записал»', async () => {
  const api = withBoard();
  const month = `# Август\n\n## Операции\n\n- 01 -2000 связь ~family · Билайн\n- 01 -1000 продукты ~family · Самокат\n\n## Счета\n\n- 2026-08-01 · остаток 23467\n`;
  const key = tasks.keyForPath('money/2026-08.md');
  api.kv[key] = { path: 'money/2026-08.md', text: month, rev: 1, updatedAt: 1 };

  const res = await build(api).tasks_money({
    amount: 500, category: 'продукты', contour: 'family', title: 'Перекрёсток', date: '2026-08-02',
  });
  const after = res.structured.month_after;
  assert.equal(after.spent, 3500);
  assert.equal(after.contour.spent, 3500);
  assert.equal(after.today_spent, 500);
  assert.deepEqual(after.balance, { date: '2026-08-01', amount: 23467 });
  assert.match(res.text, /за месяц 3500 ₽/);
});

test('операция без категории не пишется — она выпала бы из разбивки', async () => {
  await assert.rejects(
    () => build(withBoard()).tasks_money({ amount: 100, contour: 'family', title: 'что-то' }),
    (e) => e.code === 'category_required',
  );
});

test('новая операция ложится первой — месяц читается свежим сверху', () => {
  const text = '# Август\n\n## Операции\n\n- 01 -2000 связь ~family · Билайн\n';
  const next = tasks.prependToSection(text, '- 02 -500 продукты ~family · Самокат', '## Операции');
  const ops = next.split('\n').filter((l) => l.startsWith('- '));
  assert.deepEqual(ops.map((l) => l.slice(2, 4)), ['02', '01']);
});

test('tasks_move переносит задачу и отдаёт новую ссылку', async () => {
  const api = withBoard();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const res = await build(api).tasks_move({ project: 'family', hash, to: 'heys' });
  assert.equal(res.structured.new_hash, tasks.taskHash('heys', 'Покрасить потолок баллончиком'));
  // Сначала приёмник, потом источник: иначе сбой между записями теряет задачу.
  assert.equal(api.writes[0].items[0].v.path, 'projects/heys.md');
  assert.equal(api.writes[1].items[0].v.path, 'projects/family.md');
});

test('tasks_resolve снимает строку и записывает ответ', async () => {
  const api = withBoard();
  const hash = tasks.taskHash('family', 'Забрать зеркало');
  const res = await build(api).tasks_resolve({ project: 'family', hash, needle: 'Даня', note: 'привёз 2 августа' });
  assert.match(res.structured.removed, /ждём: Даня/);
  const saved = api.writes[0].items[0].v.text;
  assert.ok(!/ждём: Даня/.test(saved));
  assert.match(saved, /привёз 2 августа/);
});

// ── Развилки: то, что может решить только куратор ────────────────────────

test('tasks_decision кладёт развилку в формате, который доска уже понимает', async () => {
  const api = withBoard();
  const res = await build(api).tasks_decision({
    project: 'family',
    title: 'Выбрать день второго дзюдо',
    questions: ['понедельник или четверг?', 'если понедельник — переносим уборку?'],
    context: ['пн 3.08 уборка 15:30–17:30 — полное совпадение'],
  });

  const saved = api.writes[0].items[0].v.text;
  // #blocked даёт блок «Требует решения», «открыто:» — панель «Открыто».
  // Приоритет P2: внешнего срока у развилки нет, а P1 поставил бы её в один
  // ряд с настоящей просрочкой.
  assert.match(saved, /- \[ \] P2 Выбрать день второго дзюдо #blocked/);
  assert.match(saved, /^ {2}- открыто: понедельник или четверг\?$/m);
  assert.match(saved, /^ {2}- открыто: если понедельник — переносим уборку\?$/m);
  assert.match(saved, /^ {2}- пн 3\.08 уборка/m);
  assert.equal(res.structured.hash, tasks.taskHash('family', 'Выбрать день второго дзюдо'));
});

test('развилка по существующей задаче вешается на неё, а не заводит вторую', async () => {
  const api = withBoard();
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const res = await build(api).tasks_decision({
    project: 'family', hash,
    title: 'не используется при hash',
    questions: ['какой цвет?'],
  });

  const saved = api.writes[0].items[0].v.text;
  assert.equal(res.structured.attached, true);
  assert.match(saved, /Покрасить потолок баллончиком.*#blocked/);
  assert.match(saved, /^ {2}- открыто: какой цвет\?$/m);
  const tasksInFile = tasks.parseTasks({ path: 'projects/family.md', text: saved });
  assert.equal(tasksInFile.length, 2, 'новая задача не заводится');
});

test('развилка без вопросов отклоняется — это не развилка', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_decision({ project: 'family', title: 'x', questions: [] }),
    (e) => e.code === 'questions_required');
  assert.equal(api.writes.length, 0);
});

test('снятие последнего вопроса убирает задачу из «Требует решения»', async () => {
  const api = withBoard();
  const tools = build(api);
  const hash = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  await tools.tasks_decision({ project: 'family', hash, title: '', questions: ['какой цвет?'] });

  // Второй инструмент читает исходный фейковый файл, поэтому проверяем
  // поведение на тексте, который вернула первая запись.
  const withDecision = api.writes[0].items[0].v.text;
  const line = withDecision.split('\n').findIndex((l) => /Покрасить потолок/.test(l));
  const afterAnswer = tasks.removeChild(withDecision, line, 'какой цвет');
  const stillOpen = tasks.parseTasks({ path: 'projects/family.md', text: afterAnswer.text })
    .find((t) => t.title === 'Покрасить потолок баллончиком')
    .children.some((c) => /^открыто:/i.test(c));
  assert.equal(stillOpen, false, 'вопросов не осталось — значит тег #blocked должен сниматься');
});

// ── Время: задачник живёт по Москве ──────────────────────────────────────

test('дата по умолчанию считается по Москве, а не по UTC', () => {
  // 22:30 UTC — это уже 01:30 следующего дня по Москве. По UTC метка `^`
  // уехала бы на вчера, причём молча, прямо в файл.
  assert.equal(tasks.moscowDate(Date.UTC(2026, 7, 2, 22, 30)), '2026-08-03');
  assert.equal(tasks.moscowDate(Date.UTC(2026, 7, 2, 12, 0)), '2026-08-02');
});

test('ночная мысль помечается днём, который человек ещё живёт', async () => {
  // 22:30 UTC — это 01:30 по Москве, но сутки задачника кончаются в 3 утра, как
  // в дневнике HEYS. Мысль, записанная в час ночи, относится к прошедшему дню:
  // человек его ещё не закрыл. Метка `^` идёт по рабочему дню, а не по числу.
  const api = withWrites();
  const night = createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs: Date.UTC(2026, 7, 2, 22, 30), ToolError }).tools;
  await night.tasks_capture({ text: 'Ночная мысль', project: 'family' });
  const saved = api.writes[0].items.find((i) => i.k === tasks.keyForPath('projects/family.md')).v.text;
  assert.match(saved, /Ночная мысль \^2026-08-02/, 'ночью метка идёт вчерашним рабочим днём');
});

test('граница рабочего дня — 3 утра по Москве, не полночь', () => {
  assert.equal(tasks.taskDay(Date.UTC(2026, 7, 2, 22, 30)), '2026-08-02', '01:30 МСК — ещё вчера');
  assert.equal(tasks.taskDay(Date.UTC(2026, 7, 3, 0, 30)), '2026-08-03', '03:30 МСК — уже сегодня');
  assert.equal(tasks.taskDay(Date.UTC(2026, 7, 2, 12, 0)), '2026-08-02', 'днём совпадает с числом');
});

// ── Агентский слой: дельта, связи, развитие контекстов ───────────────────

/**
 * Живой фейк: записи применяются к хранилищу, поэтому следующий вызов видит
 * то, что записал предыдущий. Отдельная сборка инструментов — это отдельная
 * сессия: так проверяется, что память прохода живёт на сервере, а не в
 * замыкании.
 */
function liveApi(files = {}, index = null) {
  const kv = { ...files };
  kv[tasks.INDEX_KEY] = index || {
    files: Object.fromEntries(Object.values(files).map((f) => [f.path, { rev: f.rev, updatedAt: f.updatedAt }])),
    updatedAt: 1,
  };
  return {
    kv,
    async getKVByCurator(bearer, clientId, key) {
      return { data: kv[key] ?? null, error: null };
    },
    async getKVManyByCurator(bearer, clientId, keys) {
      const out = {};
      for (const key of keys) if (kv[key] !== undefined) out[key] = kv[key];
      return { data: out, error: null };
    },
    async upsertKVManyByCurator(bearer, clientId, items) {
      for (const item of items) kv[item.k] = item.v;
      return { ok: true };
    },
  };
}

function session(api, nowMs = NOW) {
  return createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs, ToolError }).tools;
}

function liveTasksApi() {
  return liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    [tasks.keyForPath('projects/family.md')]: { path: 'projects/family.md', text: FAMILY_PROJECT, rev: 2, updatedAt: 1 },
    [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: JOURNAL, rev: 5, updatedAt: 1 },
  });
}

test('первый проход запоминает отпечаток, а не вываливает весь задачник', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_delta({});
  assert.equal(res.structured.first_pass, true);
  assert.equal(res.structured.changed.length, 0);
  assert.ok(api.kv[tasks.STATE_KEY], 'память прохода сохранена на сервере');
  assert.ok(!api.kv[tasks.INDEX_KEY].files['agent_state.md'], 'память прохода не притворяется файлом задачника');
});

test('дельта показывает новую задачу и не показывает её второй раз', async () => {
  const api = liveTasksApi();
  await session(api).tasks_delta({});                       // первый проход — базовый отпечаток
  await session(api).tasks_capture({ text: 'Купить леску', project: 'family', tags: ['15min'] });

  const delta = await session(api).tasks_delta({});
  assert.equal(delta.structured.first_pass, false);
  const family = delta.structured.changed.find((d) => d.path === 'projects/family.md');
  assert.ok(family, 'изменившийся файл назван');
  assert.equal(family.added_tasks.length, 1);
  assert.equal(family.added_tasks[0].title, 'Купить леску');
  assert.equal(delta.structured.changed.length, 1, 'нетронутые файлы в дельту не попадают');

  const again = await session(api).tasks_delta({});
  assert.equal(again.structured.changed.length, 0, 'прошлый проход запомнен — второй раз то же не показываем');
  assert.match(again.text, /ничего не изменилось/);
});

test('дельта видит закрытую задачу и дописанное в журнал', async () => {
  const api = liveTasksApi();
  await session(api).tasks_delta({});

  const hash = tasks.taskHash('heys', 'Собрать оптимальную версию лендинга');
  await session(api).tasks_update({ project: 'heys', hash, state: 'done' });
  await session(api).tasks_append({ path: 'journal/2026-08.md', block: '## 2026-08-02\n\nРешили: версия D уходит в релиз.' });

  const delta = await session(api).tasks_delta({});
  const heys = delta.structured.changed.find((d) => d.path === 'projects/heys.md');
  assert.equal(heys.closed_tasks.length, 1);
  assert.equal(heys.closed_tasks[0].title, 'Собрать оптимальную версию лендинга');
  const journal = delta.structured.changed.find((d) => d.path === 'journal/2026-08.md');
  assert.match(journal.appended.join('\n'), /версия D уходит в релиз/);
});

test('дельта с mark: false и с явным since не двигает метку прохода', async () => {
  const api = liveTasksApi();
  await session(api).tasks_delta({});
  await session(api).tasks_capture({ text: 'Ещё одна', project: 'heys' });

  const peek = await session(api).tasks_delta({ mark: false });
  assert.equal(peek.structured.changed.length, 1);
  assert.equal(peek.structured.marked, false);

  const back = await session(api).tasks_delta({ since: '2026-08-01' });
  assert.equal(back.structured.marked, false, 'взгляд назад — не проход');

  const real = await session(api).tasks_delta({});
  assert.equal(real.structured.changed.length, 1, 'ни один из них не съел изменение');
});

// ── Связи ────────────────────────────────────────────────────────────────

test('ссылка ставится вложенной строкой и не ломает разбор задачи', async () => {
  const api = liveTasksApi();
  const from = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const to = tasks.taskHash('heys', 'Прогнать месячный аудит ПДн');

  const res = await session(api).tasks_link({ project: 'family', hash: from, to: `heys/${to}`, note: 'один и тот же подрядчик' });
  assert.equal(res.structured.already, false);
  const saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.match(saved, new RegExp(`^ {2}- см: heys/${to} — один и тот же подрядчик$`, 'm'));

  const parsed = tasks.parseTasks({ path: 'projects/family.md', text: saved })
    .find((t) => t.title === 'Покрасить потолок баллончиком');
  assert.ok(parsed.children.some((c) => c.startsWith('см:')), 'ссылка осталась вложенной строкой задачи');

  const second = await session(api).tasks_link({ project: 'family', hash: from, to: `heys/${to}` });
  assert.equal(second.structured.already, true, 'вторую такую же строку не пишем');
});

test('ссылка в никуда не ставится', async () => {
  const api = liveTasksApi();
  const from = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  await assert.rejects(() => session(api).tasks_link({ project: 'family', hash: from, to: 'heys/ffffff' }),
    (e) => e.code === 'ref_not_found');
  await assert.rejects(() => session(api).tasks_link({ project: 'family', hash: from, to: 'просто слова' }),
    (e) => e.code === 'invalid_ref');
});

test('связь читается в обе стороны: ссылку писали один раз', async () => {
  const api = liveTasksApi();
  const from = tasks.taskHash('family', 'Покрасить потолок баллончиком');
  const to = tasks.taskHash('heys', 'Прогнать месячный аудит ПДн');
  await session(api).tasks_link({ project: 'family', hash: from, to: `heys/${to}`, note: 'общий подрядчик' });

  // Сторона, где ссылку писали.
  const forward = await session(api).tasks_context({ topic: `family/${from}` });
  const out = forward.structured.linked.find((l) => l.direction === 'ссылается на');
  assert.ok(out, 'исходящая связь видна');
  assert.equal(out.ref, `heys/${to}`);
  assert.equal(out.title, 'Прогнать месячный аудит ПДн');

  // Сторона, где её не писали, — связь всё равно обязана быть видна.
  const backward = await session(api).tasks_context({ topic: `heys/${to}` });
  const incoming = backward.structured.linked.find((l) => l.direction === 'ссылается сюда');
  assert.ok(incoming, 'входящая связь видна с другой стороны');
  assert.equal(incoming.title, 'Покрасить потолок баллончиком');
  assert.equal(incoming.note, 'общий подрядчик');
});

test('ссылка на исчезнувшую задачу помечается, а не пропадает молча', () => {
  const text = '## Задачи\n\n- [ ] P2 Оплатить смету ^2026-08-01\n  - см: kinderly/aaaaaa\n';
  const files = [{ path: 'projects/family.md', text, rev: 1, updatedAt: 1 }];
  const { outgoing } = tasks.linksFor(files, { project: 'family', hash: tasks.taskHash('family', 'Оплатить смету') });
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].missing, true);
});

// ── Развитие контекстов ──────────────────────────────────────────────────

const KINDERLY_PROJECT = `# Kinderly

## Задачи

- [ ] P2 Собрать смету на праздник ^2026-07-20
- [ ] P2 Согласовать сценарий праздника ^2026-07-21
- [ ] P2 Купить реквизит для праздника #город #15min ^2026-07-22
- [ ] P2 Найти аниматора на праздник ^2026-07-23
- [ ] P2 Разослать приглашения на праздник ^2026-07-24
- [ ] P1 Починить свет в студии due:2026-08-05 #студия ^2026-08-01
- [>] P2 Забрать зеркало ^2026-07-01
  - ждём: Даня — привезёт зеркало, с 2026-07-05
`;

const TRAVEL_PROJECT = `# Travel

## Задачи

- [ ] P2 Проверить загранпаспорт ^2026-06-01
- [ ] P3 Посмотреть билеты ^2026-06-02
`;

const JOURNAL_REPEATS = `# Журнал

## 2026-07-20

Опять думаю про отдельный контекст под праздники: праздники расползаются по проектам.

## 2026-07-28

Снова думаю про отдельный контекст под праздники, праздники расползаются по всем проектам.

## 2026-08-01

Всё ещё думаю про отдельный контекст под праздники — праздники расползаются по проектам.
`;

function liveReviewApi() {
  const api = liveApi({
    [tasks.keyForPath('projects/kinderly.md')]: { path: 'projects/kinderly.md', text: KINDERLY_PROJECT, rev: 2, updatedAt: NOW - 3 * 86400000 },
    [tasks.keyForPath('projects/travel.md')]: { path: 'projects/travel.md', text: TRAVEL_PROJECT, rev: 1, updatedAt: Date.UTC(2026, 5, 1) },
    [tasks.keyForPath('projects/personal.md')]: { path: 'projects/personal.md', text: '# Личное\n\n## Задачи\n\n', rev: 1, updatedAt: NOW },
    [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: JOURNAL_REPEATS, rev: 4, updatedAt: NOW },
  });
  return api;
}

test('обзор находит то, что видно только сверху', () => {
  const files = [
    { path: 'projects/kinderly.md', text: KINDERLY_PROJECT, rev: 2, updatedAt: NOW - 3 * 86400000 },
    { path: 'projects/travel.md', text: TRAVEL_PROJECT, rev: 1, updatedAt: Date.UTC(2026, 5, 1) },
    { path: 'journal/2026-08.md', text: JOURNAL_REPEATS, rev: 4, updatedAt: NOW },
  ];
  const index = { files: { 'projects/travel.md': { rev: 1, updatedAt: Date.UTC(2026, 5, 1) } }, updatedAt: NOW };
  const found = tasks.reviewFindings(files, { nowMs: NOW, index });
  const kinds = found.map((f) => f.kind);

  assert.ok(kinds.includes('split_context'), 'пять задач про праздник в одном проекте — повод предложить контекст');
  assert.ok(kinds.includes('stale_promise'), 'ждём: висит четвёртую неделю');
  assert.ok(kinds.includes('collapse_project'), 'travel стоит месяцами и в нём две задачи');
  assert.ok(kinds.includes('repeating_thought'), 'одна и та же мысль в трёх записях журнала');

  const split = found.find((f) => f.kind === 'split_context');
  assert.match(split.title, /праздник/);
  assert.ok(split.questions[0].endsWith('?'), 'находка без вопроса бесполезна');
});

test('обзор отдаёт не больше трёх находок за проход', async () => {
  const api = liveReviewApi();
  const res = await session(api).tasks_review({ post: false, limit: 10 });
  assert.equal(res.structured.findings.length, 3, 'потолок жёсткий — три, сколько бы ни нашлось');
  assert.ok(res.structured.held_back >= 1, 'придержанное названо, а не потеряно');
  // Первым идёт обещание человеку: оно про чужое ожидание, а не про порядок в файлах.
  assert.equal(res.structured.findings[0].kind, 'stale_promise');
  for (const finding of res.structured.findings) {
    assert.ok(finding.questions.length >= 1, 'у каждой находки есть вопрос');
  }
});

test('находки ложатся на доску развилкой, а не в переписку', async () => {
  const api = liveReviewApi();
  const res = await session(api).tasks_review({});
  assert.equal(res.structured.posted, true);
  const board = api.kv[tasks.keyForPath('projects/kinderly.md')].text;
  assert.match(board, /#blocked/);
  assert.match(board, /^ {2}- открыто: /m);
  assert.ok(res.structured.findings.every((f) => f.ref), 'у каждой находки есть ссылка с доски');
});

test('отклонённое предложение не поднимается снова', async () => {
  const api = liveReviewApi();
  const first = await session(api).tasks_review({ post: false, limit: 3 });
  const declined = first.structured.findings.find((f) => f.kind === 'split_context');
  assert.ok(declined, 'предложение про выделение контекста прозвучало');

  await session(api).tasks_proposal({ key: declined.key, answer: 'нет', note: 'праздники и есть kinderly' });

  const second = await session(api).tasks_review({ post: false, limit: 3 });
  assert.ok(!second.structured.findings.some((f) => f.key === declined.key), 'второй раз не предлагаем');
  const held = second.structured.skipped.find((f) => f.key === declined.key);
  assert.equal(held.status, 'declined');
  assert.ok(held.days_left >= 29 && held.days_left <= 30, `молчим месяц, а не ${held.days_left} дней`);

  // Через месяц можно снова: это предложение, а не запрет.
  const later = session(api, NOW + 31 * 86400000);
  const third = await later.tasks_review({ post: false, limit: 3 });
  assert.ok(third.structured.findings.some((f) => f.key === declined.key), 'через месяц тему можно поднять снова');
});

test('память предложений переживает сессию и показывается списком', async () => {
  const api = liveReviewApi();
  const first = await session(api).tasks_review({ post: false });
  const key = first.structured.findings[0].key;

  const list = await session(api).tasks_proposal({});
  assert.equal(list.structured.proposals.length, first.structured.findings.length);
  assert.ok(list.structured.proposals.every((p) => p.status === 'proposed'));

  await session(api).tasks_proposal({ key, answer: 'да' });
  const after = await session(api).tasks_proposal({});
  assert.equal(after.structured.proposals.find((p) => p.key === key).status, 'accepted');
});

test('«позже» — отдельный ответ, а не откат к «ещё не спрашивал»', async () => {
  // Раньше «позже» писалось статусом «proposed», и две недели молчания
  // получались случайно — падением на срок непрочитанного предложения. Сдвинь
  // тот срок, и молча уехал бы ответ, который он дал прямо.
  const api = liveReviewApi();
  const first = await session(api).tasks_review({ post: false });
  const key = first.structured.findings[0].key;

  const later = await session(api).tasks_proposal({ key, answer: 'позже' });
  assert.equal(later.structured.status, 'later', 'ответ записан своим статусом');
  assert.equal(later.structured.days_left, tasks.PROPOSAL_COOLDOWN_DAYS.later);
  assert.match(later.text, /позже/);

  const list = await session(api).tasks_proposal({});
  assert.equal(list.structured.proposals.find((p) => p.key === key).status, 'later');
  // Ответ по существу ещё не получен: снятие вопроса закроет и это предложение.
  assert.ok(tasks.PROPOSAL_OPEN_STATUSES.has('later') && tasks.PROPOSAL_OPEN_STATUSES.has('proposed'));
});

test('ответ на несуществующее предложение не выдумывается', async () => {
  const api = liveReviewApi();
  await assert.rejects(() => session(api).tasks_proposal({ key: 'split_context:нет:такого', answer: 'нет' }),
    (e) => e.code === 'proposal_not_found');
});

// ── Что делать прямо сейчас ──────────────────────────────────────────────

test('под место и время подбирается не больше трёх задач, и каждая — с причиной', async () => {
  const api = liveReviewApi();
  const res = await session(api).tasks_focus({ place: 'студия', minutes: 60 });
  assert.ok(res.structured.picked.length <= 3, 'не больше трёх');
  assert.equal(res.structured.picked[0].title, 'Починить свет в студии', 'первой идёт самая подходящая, а не самая старая');
  assert.ok(res.structured.picked[0].reasons.some((r) => /студия/.test(r)), 'причина названа');
  assert.ok(res.structured.picked.every((t) => !t.tags.some((tag) => ['дом', 'город', 'ноут'].includes(tag))),
    'задача с чужим местом не предлагается: её физически не сделать');
});

test('пятнадцать минут и «голова не варит» поднимают короткое, а не важное', async () => {
  const api = liveReviewApi();
  const short = await session(api).tasks_focus({ minutes: 15, place: 'город' });
  assert.equal(short.structured.picked[0].title, 'Купить реквизит для праздника');

  const tired = await session(api).tasks_focus({ mood: 'голова не варит' });
  assert.equal(tired.structured.picked[0].title, 'Купить реквизит для праздника',
    'в таком состоянии наверх идёт короткая задача, а не P1 со сроком');
});

test('незнакомое место отклоняется вместо тихой выдачи всего подряд', async () => {
  const api = liveReviewApi();
  await assert.rejects(() => session(api).tasks_focus({ place: 'дача' }), (e) => e.code === 'invalid_place');
});

/** Тот же набор проектов плюс день, в котором чужое событие забирает общее. */
function focusApiWithBusyDay() {
  const api = liveReviewApi();
  const key = tasks.keyForPath('days/2026-08-02.md');
  api.kv[key] = {
    path: 'days/2026-08-02.md',
    text: '- 12:00–15:00 Тренировка Саши (чей: жена; занято: машина, ребёнок) #фон\n',
    rev: 1,
    updatedAt: 1,
  };
  return api;
}

test('в занятый час фокус называет занятое, но подбор от этого не сужает', async () => {
  const api = focusApiWithBusyDay();
  const plain = await session(api).tasks_focus({ minutes: 60 });
  const withHour = await session(api).tasks_focus({ minutes: 60, at: '13:00' });

  assert.deepEqual(
    withHour.structured.picked.map((t) => t.ref),
    plain.structured.picked.map((t) => t.ref),
    'занятость — факт для него, а не фильтр: пары «ресурс → запрещённое место» в коде нет',
  );
  assert.deepEqual(
    [...new Set(withHour.structured.situation.busy.map((r) => r.resource))],
    ['машина', 'ребёнок'],
  );
  assert.match(withHour.text, /занято: машина, ребёнок/);
  assert.match(withHour.text, /Тренировка Саши \(жена\)/);
});

test('вне занятого часа фокус ничего про ресурсы не выдумывает', async () => {
  const res = await session(focusApiWithBusyDay()).tasks_focus({ minutes: 60, at: '17:00' });
  assert.deepEqual(res.structured.situation.busy, []);
  assert.ok(!/занято/.test(res.text));
});

// ── Фраза целиком вместо угаданной темы ──────────────────────────────────

test('значимые слова выделяются из живой фразы, а не выбираются моделью', () => {
  const { terms, dropped } = tasks.topicTerms('надо бы поставить Даню на зеркало в понедельник');
  const words = terms.map((t) => t.word);
  assert.deepEqual(words, ['даню', 'зеркало', 'понедельник']);
  assert.ok(dropped.includes('надо') && dropped.includes('поставить'), 'команды и предлоги отброшены');
  assert.equal(terms.find((t) => t.word === 'даню').kind, 'name', 'имя не теряется и весит больше');
});

test('дата, время и тег из фразы сохраняются', () => {
  const { terms } = tasks.topicTerms('перенести съёмку на 2026-08-05 в 15:30 #студия');
  const byKind = Object.fromEntries(terms.map((t) => [t.kind, t.word]));
  assert.equal(byKind.date, '2026-08-05');
  assert.equal(byKind.time, '15:30');
  assert.equal(byKind.tag, 'студия');
});

test('фраза целиком поднимает контекст, и видно, по каким словам искали', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_context({ topic: 'что там с зеркалом от Дани, он вообще привезёт?' });
  assert.ok(res.structured.terms.includes('зеркалом'), 'слово из фразы стало запросом');
  assert.ok(res.structured.ignored.includes('что'), 'мусорные слова названы отдельно');
  assert.equal(res.structured.people.length, 1, 'обязательство нашлось по словоформе «зеркалом»');
  assert.match(res.text, /Искал по словам/);
});

test('тема в одно слово работает как раньше', async () => {
  const tools = build(withFiles());
  const res = await tools.tasks_context({ topic: 'версия' });
  assert.ok(res.structured.open_questions.length >= 1);
  assert.ok(res.structured.journal.length >= 1);
});

// ── Правила: инструмент без повода звать бесполезен ──────────────────────

const { curatorInstructions, createCuratorContext } = require('../lib/curator');

test('у каждого инструмента задачника есть повод его звать', () => {
  // Повод живёт либо в правилах, либо в описании самого инструмента. Дубли
  // 2026-08-03 вырезаны из правил, поэтому смотрим в оба места сразу — важно,
  // что повод есть хоть где-то, а не что он записан дважды.
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  const rules = curatorInstructions('Антон', true);
  const where = (name) => {
    const schema = built.schemas.find((s) => s.name === name);
    assert.ok(schema, `${name} не объявлен в схемах — модель его не увидит`);
    const args = Object.values(schema.inputSchema.properties || {}).map((a) => a.description || '');
    return [rules, schema.description, ...args].join('\n');
  };
  for (const [tool, why] of [
    ['tasks_delta', /начале сессии|прошлого прохода/],
    ['tasks_link', /не по словам|общих слов|друг друга не находят/],
    ['tasks_review', /три находки|потолок в три|НЕ БОЛЬШЕ ТРЁХ/],
    ['tasks_proposal', /месяц/],
    ['tasks_focus', /максимум три|три задачи|не больше трёх задач/],
  ]) {
    assert.match(where(tool), why, `у ${tool} нигде не сказано, когда его звать`);
  }
});

test('правила закрывают дыры, из-за которых задачник переставал наполняться', () => {
  const rules = curatorInstructions('Антон', true);
  // Запись в журнал: без неё правило «подними прошлый разговор» не на чем держится.
  assert.match(rules, /journal\/ГГГГ-ММ\.md/);
  // Событие против задачи: «сегодня с 15 до 17 на киндерли» — это слот, а не задача.
  assert.match(rules, /tasks_slot.*tasks_capture|tasks_capture.*tasks_slot/s);
  // Привычка отмечается сама и не подпадает под запрет ставить галочки.
  assert.match(rules, /tasks_habit/);
  // Фразу передаём целиком — решение «что искать» больше не за моделью.
  assert.match(rules, /фразу ЦЕЛИКОМ/);
});

test('в правилах не осталось запрета, который противоречит виду слота по умолчанию', () => {
  const rules = curatorInstructions('Антон', true);
  assert.ok(!/у tasks_slot угадывать нельзя/.test(rules), 'правило 31 больше не спорит с правилом 32');
});

test('правила задачника подключаются только вместе с задачником', () => {
  assert.ok(!/tasks_review/.test(curatorInstructions('Антон', false)));
});

test('слот дня связывается с задачей форматом самой доски', async () => {
  const api = liveTasksApi();
  api.kv[tasks.keyForPath('days/2026-08-02.md')] = { path: 'days/2026-08-02.md', text: '# 2026-08-02\n', rev: 1, updatedAt: 1 };
  const hash = tasks.taskHash('heys', 'Прогнать месячный аудит ПДн');

  const slot = await session(api).tasks_slot({ date: '2026-08-02', from: '10:00', to: '12:00', title: 'Аудит', ref: `heys/${hash}` });
  assert.equal(slot.structured.ref, `heys/${hash}`);
  const saved = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  // Ровно тот вид, который build_board.py читает как ссылку: «текст · проект/хэш».
  assert.match(saved, new RegExp(`- 10:00–12:00 Аудит · heys/${hash} #фокус`));

  // С той стороны видно, что под задачу уже выделено время.
  const ctx = await session(api).tasks_context({ topic: `heys/${hash}` });
  const fromDay = ctx.structured.linked.find((l) => l.path === 'days/2026-08-02.md');
  assert.ok(fromDay, 'слот дня виден со стороны задачи');
  assert.match(fromDay.title, /10:00–12:00 Аудит/);
});

test('слот не привязывается к несуществующей задаче', async () => {
  const api = liveTasksApi();
  api.kv[tasks.keyForPath('days/2026-08-02.md')] = { path: 'days/2026-08-02.md', text: '# 2026-08-02\n', rev: 1, updatedAt: 1 };
  await assert.rejects(() => session(api).tasks_slot({ date: '2026-08-02', from: '10:00', to: '11:00', title: 'x', ref: 'heys/ffffff' }),
    (e) => e.code === 'ref_not_found');
});

test('кириллический тег добавляется один раз и снимается', () => {
  const line = '- [ ] P2 Купить леску #ноут ^2026-08-01';
  assert.equal(tasks.applyTaskPatch(line, { addTags: ['ноут'] }), line, 'тот же тег вторым не пишется');
  assert.ok(!/#ноут/.test(tasks.applyTaskPatch(line, { removeTags: ['ноут'] })), 'тег снимается');
  // Тег-приставка не должен цепляться за более длинный: #дом ≠ #домашка.
  const home = '- [ ] P2 Прибраться #домашка ^2026-08-01';
  assert.match(tasks.applyTaskPatch(home, { addTags: ['дом'] }), /#домашка .*#дом$/);
});

test('зависшее обещание вешается на свою задачу, а не заводит вторую', async () => {
  const api = liveReviewApi();
  const res = await session(api).tasks_review({});
  const promise = res.structured.findings.find((f) => f.kind === 'stale_promise');
  assert.ok(promise, 'находка про обещание есть');

  const saved = api.kv[tasks.keyForPath('projects/kinderly.md')].text;
  const mirror = tasks.parseTasks({ path: 'projects/kinderly.md', text: saved })
    .filter((t) => /зеркало/i.test(t.title));
  assert.equal(mirror.length, 1, 'вторая задача про зеркало не заводится');
  assert.ok(mirror[0].children.some((c) => /^открыто:/i.test(c)), 'вопрос лёг под существующую задачу');
});

// ── Адрес задачи: без него цикл «нашёл → ответил → снял» не замыкается ────

test('читающие инструменты отдают задачу вместе с её адресом на доске', async () => {
  const tools = build(withFiles());

  const read = await tools.tasks_read({ path: 'projects/heys.md' });
  const landing = read.structured.tasks.find((t) => t.title === 'Собрать оптимальную версию лендинга');
  assert.equal(landing.hash, tasks.taskHash('heys', 'Собрать оптимальную версию лендинга'));
  assert.equal(landing.ref, `heys/${landing.hash}`);

  const list = await tools.tasks_list({});
  assert.ok(list.structured.next.every((t) => t.ref), 'в списках у каждой задачи есть адрес');

  const ctx = await tools.tasks_context({ topic: 'версия' });
  assert.ok(ctx.structured.tasks.every((t) => t.ref), 'в контексте тоже');
  assert.ok(ctx.structured.open_questions.every((q) => q.ref), 'у открытого вопроса — адрес его задачи');

  const mirror = await tools.tasks_context({ topic: 'зеркало' });
  assert.equal(mirror.structured.people[0].ref, `family/${tasks.taskHash('family', 'Забрать зеркало')}`);
});

test('tasks_list показывает то, что требует решения, отдельным списком', async () => {
  const api = withFiles();
  // Задача с «открыто:» и без срока: ни в просроченное, ни в #next она не
  // попадает, а именно её куратор и ищет в «Требует решения».
  const res = await build(api).tasks_list({});
  const blocked = res.structured.blocked;
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].title, 'Собрать оптимальную версию лендинга');
  assert.equal(blocked[0].ref, `heys/${tasks.taskHash('heys', 'Собрать оптимальную версию лендинга')}`);
  assert.match(res.text, /требует решения: 1/);
});

// ── Потолок и дубли развилок ─────────────────────────────────────────────
//
// Потолок в три находки за проход стоял только на автоматическом обходе, а
// развилку можно положить и напрямую. Проверяем, что прямой путь закрыт теми
// же правилами: иначе потолок не значит ничего.

test('одна и та же развилка не ложится второй раз, даже другими словами', () => {
  const open = [{ ref: 'heys/aaa111', task: 'Лендинг', question: 'версия D закрывает эту задачу или нужен ещё вариант?' }];
  const guard = tasks.decisionGuard(open, ['нужен ли ещё вариант, или версия D закрывает задачу?']);
  assert.equal(guard.fresh.length, 0);
  assert.equal(guard.duplicates.length, 1);
  assert.equal(guard.duplicates[0].ref, 'heys/aaa111');
});

test('разные вопросы про один проект дублями не считаются', () => {
  const open = [{ ref: 'heys/aaa111', task: 'Лендинг', question: 'версия D закрывает задачу?' }];
  const guard = tasks.decisionGuard(open, ['во сколько запускать рекламу?']);
  assert.equal(guard.fresh.length, 1);
  assert.equal(guard.duplicates.length, 0);
});

test('tasks_decision не заводит вторую задачу про уже открытый вопрос', async () => {
  const api = liveTasksApi();
  const before = api.kv[tasks.keyForPath('projects/heys.md')].text;
  const res = await session(api).tasks_decision({
    project: 'heys',
    title: 'Решить по версии лендинга',
    questions: ['нужен ли ещё один вариант, или версия D закрывает задачу?'],
  });
  assert.equal(res.structured.created, false);
  assert.equal(res.structured.reason, 'duplicate');
  assert.equal(api.kv[tasks.keyForPath('projects/heys.md')].text, before, 'файл не тронут');
});

/** Проект, где уже висит нужное число нерешённых развилок. */
function crowdedApi(count) {
  const lines = [];
  for (let i = 1; i <= count; i += 1) {
    lines.push(`- [ ] P2 Развилка номер ${i} #blocked ^2026-08-01`);
    lines.push(`  - открыто: уникальный вопрос ${i} про совершенно отдельный предмет ${i}?`);
  }
  return liveApi({
    [tasks.keyForPath('projects/heys.md')]: {
      path: 'projects/heys.md', text: `# HEYS\n\n## Задачи\n\n${lines.join('\n')}\n`, rev: 3, updatedAt: 1,
    },
    [tasks.keyForPath('projects/family.md')]: { path: 'projects/family.md', text: FAMILY_PROJECT, rev: 2, updatedAt: 1 },
    [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: JOURNAL, rev: 5, updatedAt: 1 },
  });
}

test('развилка сверх потолка на доску не ложится', async () => {
  const api = crowdedApi(tasks.OPEN_DECISIONS_CAP);
  await assert.rejects(
    () => session(api).tasks_decision({ project: 'family', title: 'Ещё одна', questions: ['совсем другой предмет разговора?'] }),
    (e) => e.code === 'too_many_open_decisions',
  );
});

test('при полной доске вопрос всё ещё можно привязать к существующей задаче', async () => {
  const api = crowdedApi(tasks.OPEN_DECISIONS_CAP);
  const hash = tasks.taskHash('heys', 'Развилка номер 1');
  const res = await session(api).tasks_decision({
    project: 'heys', hash, title: 'не используется', questions: ['а если перенести это на сентябрь?'],
  });
  assert.equal(res.structured.attached, true);
  assert.match(api.kv[tasks.keyForPath('projects/heys.md')].text, /открыто: а если перенести это на сентябрь\?/);
});

test('снятый вопрос записывается как исход находки, а не исчезает', async () => {
  const api = liveTasksApi();
  const tools = session(api);
  const created = await tools.tasks_decision({
    project: 'family',
    title: 'Выбрать день второго дзюдо',
    questions: ['понедельник или четверг?'],
    key: 'scattered_theme:дзюдо',
  });
  assert.equal(api.kv[tasks.STATE_KEY].proposals['scattered_theme:дзюдо'].status, 'proposed');
  assert.equal(api.kv[tasks.STATE_KEY].proposals['scattered_theme:дзюдо'].ref, `family/${created.structured.hash}`);

  const resolved = await tools.tasks_resolve({
    project: 'family', hash: created.structured.hash, needle: 'понедельник', note: 'решили — четверг',
  });
  assert.equal(resolved.structured.unblocked, true);
  const entry = api.kv[tasks.STATE_KEY].proposals['scattered_theme:дзюдо'];
  assert.equal(entry.status, 'accepted');
  assert.equal(entry.note, 'решили — четверг');
});

test('нумерация правил задачника сплошная — по ним ссылаются друг на друга', () => {
  const numbers = curatorInstructions('Антон', true)
    .split('\n').map((l) => /^З(\d+)\./.exec(l)).filter(Boolean).map((m) => Number(m[1]));
  assert.ok(numbers.length >= 10);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), 'дыры и буквенные вставки ломают внутренние ссылки');
});

test('общий ход «спросил — записал — не спрашиваю» есть в правилах и не привязан к случаю', () => {
  // Правило ищется по смыслу, а не по номеру: нумерация сплошная и от вставки
  // новой строки все номера ниже уезжают.
  const rule = curatorInstructions('Антон', true).split('\n')
    .find((line) => /^З\d+\./.test(line) && /question/.test(line) && /спрос/i.test(line));
  assert.ok(rule, 'общего хода про незнание в правилах нет');
  assert.match(rule, /меняет|ДРУГИМ/, 'спрашивать велено только про то, что меняет ответ');
  assert.match(rule, /второй раз|не спрашивается/i);
});

test('правила различают его слово и вывод агента, и говорят про пересмотр памяти', () => {
  const lines = curatorInstructions('Антон', true).split('\n').filter((l) => /^З\d+\./.test(l));
  const kinds = lines.find((l) => /наблюдение/.test(l) && /tasks_learn/.test(l));
  assert.ok(kinds, 'про вид «наблюдение» в правилах ничего нет');
  assert.match(kinds, /не переписывается|откажет/i);

  const fact = lines.find((l) => /закрыт/i.test(l) && /длительност/i.test(l));
  assert.ok(fact, 'про план и факт в правилах ничего нет');
  assert.match(fact, /трижды|три/i, 'порог повторов в правиле не назван');

  // Про пересмотр памяти правило вырезано как дубль: это механика планёрки, и
  // она описана у самого инструмента.
  const standup = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError })
    .schemas.find((s) => s.name === 'tasks_standup').description;
  assert.match(standup, /старше месяца/i, 'про пересмотр памяти не сказано нигде');
  assert.match(standup, /вычёркивает он сам|удалять записанное с его слов система не умеет/i);
});

test('правила не обещают того, чего инструменты не умеют', () => {
  const rules = curatorInstructions('Антон', true);
  // Слот с задачей связывается через ref, а не через tasks_link: раньше правило
  // приводило именно такой невыполнимый пример.
  assert.match(rules, /ref у tasks_slot/);
  assert.match(rules, /tasks_link связывает только две задачи проектов/);
});

// ── Окружение находки ────────────────────────────────────────────────────
//
// Поиск по словам отдавал обрывки строк, и всё вокруг них модель домысливала.
// Задачник — проценты окна модели, экономить не на чем.

test('контекст отдаёт проект найденной задачи целиком, а не одну строку', async () => {
  const res = await build(withFiles()).tasks_context({ topic: 'что там по лендингу' });
  const heys = res.structured.projects.find((p) => p.project === 'heys');
  assert.ok(heys, 'проект найденной задачи поднят целиком');
  // В HEYS_PROJECT две открытые задачи и одна закрытая.
  assert.equal(heys.open_count, 2);
  assert.equal(heys.done_count, 1);
  assert.ok(heys.tasks.every((t) => t.ref), 'у соседей по проекту тоже есть адрес');
  const landing = heys.tasks.find((t) => t.title === 'Собрать оптимальную версию лендинга');
  assert.deepEqual(landing.waiting, ['открыто: версия D закрывает эту задачу или нужен ещё вариант?']);
});

test('контекст показывает, когда задача уже стоит в дне', async () => {
  const api = withFiles();
  const hash = tasks.taskHash('heys', 'Собрать оптимальную версию лендинга');
  api.kv = api.kv || {};
  const day = {
    path: 'days/2026-08-04.md',
    text: `# 2026-08-04\n\n- 10:00–14:00 Лендинг · heys/${hash} #фокус\n- 16:00–17:30 Дзюдо\n`,
    rev: 1, updatedAt: 1,
  };
  const orig = api.getKVManyByCurator;
  api.getKVManyByCurator = async (bearer, clientId, keys) => {
    const out = (await orig(bearer, clientId, keys)).data;
    if (keys.includes(tasks.keyForPath(day.path))) out[tasks.keyForPath(day.path)] = day;
    return { data: out, error: null };
  };
  const origIndex = api.getKVByCurator;
  api.getKVByCurator = async (bearer, clientId, key) => {
    const res = await origIndex(bearer, clientId, key);
    if (key === tasks.INDEX_KEY && res.data) {
      return { data: { ...res.data, files: { ...res.data.files, [day.path]: { rev: 1, updatedAt: 1 } } }, error: null };
    }
    return res;
  };

  const res = await build(api).tasks_context({ topic: 'лендинг' });
  const slot = res.structured.slots.find((s) => s.ref === `heys/${hash}`);
  assert.ok(slot, 'слот, поставленный под эту задачу, виден в контексте');
  assert.equal(slot.date, '2026-08-04');
  assert.equal(slot.why, 'под эту задачу');
  assert.match(res.text, /уже стоит в днях: 1/);
});

test('прошедшие дни в окружение не тянутся — они уже не про «когда это стоит»', () => {
  const files = [{ path: 'days/2026-07-01.md', text: '- 10:00–11:00 Лендинг\n' },
    { path: 'days/2026-08-05.md', text: '- 10:00–11:00 Лендинг\n' }];
  const { terms } = tasks.topicTerms('лендинг');
  const slots = tasks.slotsAround(files, [], terms, { from: '2026-08-02' });
  assert.deepEqual(slots.map((s) => s.date), ['2026-08-05']);
});

// ── Как он решает ────────────────────────────────────────────────────────

test('память предпочтений требует опору, а не догадку', async () => {
  await assert.rejects(
    () => session(liveTasksApi()).tasks_learn({ note: 'ему удобнее по вечерам' }),
    (e) => e.code === 'evidence_required',
  );
});

test('предпочтение записывается строкой, которую он может прочитать глазами', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_learn({
    note: 'Развилки по деньгам решает сам, не делегирует',
    evidence: 'его слова 2026-08-03',
    kind: 'предпочтение',
  });
  assert.equal(res.structured.created, true);
  const saved = api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text;
  assert.match(saved, /^- 2026-08-02 · предпочтение · Развилки по деньгам решает сам, не делегирует — его слова 2026-08-03$/m);
  assert.match(saved, /^## Как он решает$/m);
});

test('то же самое другими словами второй раз не записывается', async () => {
  const api = liveTasksApi();
  const tools = session(api);
  await tools.tasks_learn({ note: 'Развилки по деньгам решает сам, не делегирует', evidence: 'его слова' });
  const again = await tools.tasks_learn({ note: 'по деньгам развилки не делегирует, решает сам', evidence: 'снова сказал' });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'duplicate');
  assert.equal(tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text }).length, 1);
});

test('память «как он решает» приходит в контекст сама, без отдельного вызова', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({ note: 'Дела короче получаса в день не ставим', evidence: 'его слова' });
  const res = await session(api).tasks_context({ topic: 'лендинг' });
  assert.equal(res.structured.preferences.length, 1);
  assert.equal(res.structured.preferences[0].note, 'Дела короче получаса в день не ставим');
});

// ── Спросил — записал — больше не спрашиваю ──────────────────────────────
//
// Общий ход, а не правило под очередной случай. Держится он на том, что рядом
// с ответом лежит сам вопрос: ответы на один и тот же вопрос формулируются как
// угодно, а вопрос повторяется почти дословно.

test('вопрос ложится рядом с ответом и ловит повтор, заданный другими словами', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({
    note: 'Уборка студии — два часа',
    evidence: 'его слова 2026-08-02',
    kind: 'порог',
    question: 'сколько занимает уборка студии?',
  });
  const saved = api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text;
  assert.match(saved, /^ {2}- вопрос: сколько занимает уборка студии\?$/m);

  // Ответ переформулирован до неузнаваемости — по нему повтор не виден вовсе
  // (проверено рядом), а вопрос тот же, и запись не задваивается.
  assert.ok(tasks.questionSimilarity('Уборка студии — два часа', 'Закладываем 120 минут') < tasks.DECISION_SIMILARITY);
  const again = await session(api).tasks_learn({
    note: 'Закладываем 120 минут',
    evidence: 'снова сказал',
    question: 'сколько времени занимает уборка студии?',
  });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.same_as.matched_by, 'вопрос');
  assert.equal(tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text }).length, 1);
});

test('один question без ответа — это проверка «я уже спрашивал», а не запись', async () => {
  const api = liveTasksApi();
  const before = await session(api).tasks_learn({ question: 'сколько занимает уборка студии?' });
  assert.equal(before.structured.asked, false);
  assert.equal(api.kv[tasks.keyForPath(tasks.PREFS_PATH)], undefined, 'проверка ничего не пишет');

  await session(api).tasks_learn({
    note: 'Уборка студии — два часа', evidence: 'его слова', kind: 'порог',
    question: 'сколько занимает уборка студии?',
  });
  const after = await session(api).tasks_learn({ question: 'сколько времени занимает уборка студии?' });
  assert.equal(after.structured.asked, true);
  assert.match(after.text, /уже спрашивал/);
});

test('наблюдение не переписывает его решение — отказывает инструмент, а не правило', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({
    note: 'Развилки по деньгам решает сам, не делегирует',
    evidence: 'его слова', kind: 'решение',
  });
  const before = api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text;

  await assert.rejects(
    () => session(api).tasks_learn({
      note: 'Развилки по деньгам он не решает сам',
      evidence: 'вижу по журналу', kind: 'наблюдение',
    }),
    (e) => e.code === 'observation_over_decision' && /вынеси расхождение вопросом/.test(e.message),
  );
  assert.equal(api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text, before, 'файл памяти не тронут вовсе');
});

test('своё наблюдение уточняется само: второй раз не запись, а подтверждение', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({
    note: 'Уборка кухни утром не состоится',
    evidence: 'три закрытых дня', kind: 'наблюдение',
  });
  const again = await session(api).tasks_learn({
    note: 'Уборка кухни утром не состоится',
    evidence: 'ещё два дня', kind: 'наблюдение',
  });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'confirmed');
  assert.equal(again.structured.confirmed, 1);
  const parsed = tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text });
  assert.equal(parsed.length, 1, 'подтверждение не заводит вторую запись');
  assert.equal(parsed[0].confirmed.count, 1);
  assert.equal(parsed[0].confirmed.date, '2026-08-02');
});

test('его слово поверх наблюдения пишется, а наблюдение остаётся ему на вычёркивание', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({
    note: 'Уборка кухни утром не состоится',
    evidence: 'три закрытых дня', kind: 'наблюдение',
  });
  const said = await session(api).tasks_learn({
    note: 'Уборка кухни утром не состоится, переносим на вечер',
    evidence: 'его слова 2026-08-02', kind: 'решение',
  });
  assert.equal(said.structured.created, true);
  assert.equal(said.structured.over_observation.kind, 'наблюдение');
  const parsed = tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text });
  assert.deepEqual(parsed.map((p) => p.kind), ['наблюдение', 'решение'], 'старое наблюдение не стёрто');
});

test('в разбор попала запись памяти — она отмечается пригодившейся, посторонняя нет', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({ note: 'Лендинг собираем по вечерам', evidence: 'его слова' });
  await session(api).tasks_learn({ note: 'Смету по празднику считает жена', evidence: 'его слова' });

  // Падежная форма — обычный случай живой фразы, и промахнуться на ней нельзя:
  // непойманное попадание превращается в «ни разу не пригодилась».
  await session(api).tasks_context({ topic: 'что там по лендингу' });
  const parsed = tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text });
  const landing = parsed.find((p) => /Лендинг/.test(p.note));
  const other = parsed.find((p) => /Смету/.test(p.note));
  assert.equal(landing.used.count, 1);
  assert.equal(landing.used.date, '2026-08-02');
  assert.equal(other.used.count, 0, 'запись не по теме счётчик не набирает — иначе он мерил бы число вызовов');

  // Второй разбор по той же теме — второе попадание, а не переписанная единица.
  await session(api).tasks_context({ topic: 'лендинг' });
  const twice = tasks.parsePreferences({ text: api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text })
    .find((p) => /Лендинг/.test(p.note));
  assert.equal(twice.used.count, 2);
});

test('сбой отметки «пригодилось» не роняет разбор темы', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({ note: 'Лендинг собираем по вечерам', evidence: 'его слова' });
  api.upsertKVManyByCurator = async () => ({ ok: false, error: 'сервер отказал' });
  const res = await session(api).tasks_context({ topic: 'лендинг' });
  assert.ok(res.structured.preferences.length, 'память всё равно вернулась в разбор');
});

// ── Факты о его мире ─────────────────────────────────────────────────────
//
// Марку машины спросили четыре раза за один день, площадь склада — трижды за
// неделю. Место для такой записи было, а вида не было: предпочтение и порог
// про то, КАК он решает, а не про то, КАК УСТРОЕН его мир, и ответ оседал в
// лучшем случае в журнале — то есть нигде, потому что в память возвращается
// только preferences.md.

/** Память с записанным фактом: дальше её обновляют, гасят и сверяют с доской. */
async function apiWithFact(note = 'Машина — Hyundai Solaris', question = 'какая у него машина?') {
  const api = liveTasksApi();
  await session(api).tasks_learn({ note, evidence: 'его слова 2026-08-02', kind: 'факт', question });
  return api;
}

const prefsText = (api) => api.kv[tasks.keyForPath(tasks.PREFS_PATH)].text;

test('факт о мире пишется своим видом и приходит в разбор наравне с остальным', async () => {
  const api = await apiWithFact();
  assert.match(prefsText(api), /^- 2026-08-02 · факт · Машина — Hyundai Solaris — его слова 2026-08-02$/m);
  const res = await session(api).tasks_context({ topic: 'что там с машиной' });
  assert.equal(res.structured.preferences.length, 1);
  assert.equal(res.structured.preferences[0].kind, 'факт');
});

test('факт — его слово: наблюдением он не переписывается', async () => {
  const api = await apiWithFact();
  await assert.rejects(
    () => session(api).tasks_learn({
      note: 'Машина — Hyundai Solaris, судя по тратам', evidence: 'вижу по деньгам', kind: 'наблюдение',
    }),
    (e) => e.code === 'observation_over_decision',
  );
  await assert.rejects(
    () => session(api).tasks_learn({
      note: 'Машина другая', evidence: 'вижу по деньгам', kind: 'наблюдение',
      replaces: 'Машина — Hyundai Solaris',
    }),
    (e) => e.code === 'observation_over_decision',
    'через replaces тоже нельзя — иначе отказ обходится одним аргументом',
  );
});

test('продал машину — старая запись гаснет с датой, а не исчезает', async () => {
  const api = await apiWithFact();
  const res = await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова 2026-08-02', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });
  assert.equal(res.structured.updated, true);
  assert.equal(res.structured.replaced.note, 'Машина — Hyundai Solaris');

  const saved = prefsText(api);
  assert.match(saved, /Машина — Hyundai Solaris/, 'старое значение остаётся в файле — он читает историю глазами');
  assert.match(saved, /^ {2}- устарело: 2026-08-02, заменено на «Машина — Renault Duster»$/m);

  const parsed = tasks.parsePreferences({ text: saved });
  assert.equal(parsed.length, 2);
  const live = tasks.activePreferences(parsed);
  assert.deepEqual(live.map((p) => p.note), ['Машина — Renault Duster']);
  // Вопрос наследуется: по нему ловится повтор, и потерять его значит
  // получить третью запись про ту же машину.
  assert.equal(live[0].question, 'какая у него машина?');
});

test('обычная запись факт не отменяет — иначе опечатка перетирает верное', async () => {
  const api = await apiWithFact();
  const again = await session(api).tasks_learn({
    note: 'Машина — Hyundai Солярис', evidence: 'его слова', kind: 'факт',
    question: 'какая у него машина?',
  });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'duplicate');
  assert.match(again.text, /replaces/, 'путь обновления назван прямо в отказе');
  assert.deepEqual(
    tasks.activePreferences(tasks.parsePreferences({ text: prefsText(api) })).map((p) => p.note),
    ['Машина — Hyundai Solaris'],
    'ничего не погашено и ничего не добавлено',
  );
});

test('тот же факт вторым заходом — подтверждение, а не глухой отказ', async () => {
  // Планёрка спрашивает «это ещё так?», он отвечает «да» — и записать его «да»
  // было нечем: тот же текст уходил в отказ по дублю, дата касания не
  // двигалась, и на следующей планёрке тот же факт выносился снова.
  const api = await apiWithFact();
  const again = await session(api).tasks_learn({
    note: 'Машина — Hyundai Solaris', evidence: 'подтвердил на планёрке', kind: 'факт',
  });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'confirmed');
  assert.equal(again.structured.confirmed, 1);
  assert.match(prefsText(api), /подтверждено: 1/);
  assert.equal(
    tasks.activePreferences(tasks.parsePreferences({ text: prefsText(api) })).length, 1,
    'второй записи про ту же машину не завелось',
  );
});

test('подтверждение отодвигает проверку: полугодовой факт замолкает после «да, всё так»', async () => {
  const entries = tasks.parsePreferences({
    text: '## Как он решает\n\n- 2026-01-01 · факт · Машина — Hyundai Solaris — его слова\n  - подтверждено: 1, последний раз 2026-07-20\n',
  });
  assert.deepEqual(
    tasks.stalePreferences(entries, { today: '2026-08-04' }), [],
    'считается от подтверждения, иначе список повторял бы один и тот же факт',
  );
  const untouched = tasks.parsePreferences({
    text: '## Как он решает\n\n- 2026-01-01 · факт · Машина — Hyundai Solaris — его слова\n',
  });
  assert.equal(tasks.stalePreferences(untouched, { today: '2026-08-04' })[0].reason, 'проверить');
});

test('замена факта не теряет его синонимы — иначе новый уже не поднимется', async () => {
  const api = liveTasksApi();
  await session(api).tasks_learn({
    note: 'Машина — Hyundai Solaris', evidence: 'его слова', kind: 'факт',
    question: 'какая у него машина?', aliases: 'тачка, авто',
  });
  await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });
  const live = tasks.activePreferences(tasks.parsePreferences({ text: prefsText(api) }));
  assert.deepEqual(live.map((p) => p.note), ['Машина — Renault Duster']);
  assert.deepEqual(live[0].aliases, ['тачка', 'авто'], 'на «сколько ехать на тачке» новый факт обязан подниматься');
});

test('ответ-факт умеет исправлять записанное, а не только добавлять новое', async () => {
  // Без проброса replaces этот путь годился ровно на один раз: ответ, который
  // не добавляет факт, а исправляет прежний, память отвергала по дублю.
  const api = await apiWithFact();
  const created = await session(api).tasks_decision({
    project: 'family', title: 'Разобраться с машиной',
    questions: ['так какая всё-таки машина?'],
  });
  const res = await session(api).tasks_resolve({
    project: 'family', hash: created.structured.hash, needle: 'какая всё-таки машина',
    note: 'Duster', fact: 'Машина — Renault Duster', fact_replaces: 'Машина — Hyundai Solaris',
  });
  assert.equal(res.structured.learned.created, true);
  const live = tasks.activePreferences(tasks.parsePreferences({ text: prefsText(api) }));
  assert.equal(live.length, 1, 'старое погашено, а не осталось вторым живым ответом');
  assert.match(live[0].note, /^Машина — Renault Duster/);
});

test('длинный факт доезжает целиком, а не до середины мысли', async () => {
  // Прежний потолок в 160 знаков резал ровно то, ради чего запись заводилась:
  // у факта про районы за срезом оставались и «живут сейчас на юге», и сетка
  // тренировок по дням. Запись формально доезжала, а ответ — нет.
  const api = liveTasksApi();
  const note = 'Районов два: юг и центр. На юге студия, дом родителей и дзюдо. '
    + 'В центре квартира и футбол в центре. Футбол бывает в обоих районах, '
    + 'и район берётся по конкретной тренировке, а не по слову «футбол»: '
    + 'пн и ср — юг, пт и вс — центр. Живут они сейчас на доме на юге.';
  await session(api).tasks_learn({ note, evidence: 'его слова', kind: 'факт' });
  const res = await session(api).tasks_context({ topic: 'где мы сейчас живём' });
  assert.match(res.text, /Живут они сейчас на доме на юге/, 'хвост записи обязан доезжать');
  assert.match(res.text, /пн и ср/, 'сетка по дням тоже внутри записи');
});

test('запись длиннее потолка обрывается по границе мысли, и обрыв виден', async () => {
  const api = liveTasksApi();
  const note = `${'Правило про длинный разбор. '.repeat(40)}Хвост, который не влезет.`;
  await session(api).tasks_learn({ note, evidence: 'его слова', kind: 'решение' });
  const res = await session(api).tasks_context({ topic: 'правило про длинный разбор' });
  assert.match(res.text, /…/, 'обрезка обязана быть заметна — иначе кусок примут за всю запись');
  assert.doesNotMatch(res.text, /Хвост, который не влезет/);
  const line = res.text.split('\n').find((l) => l.startsWith('— решение:'));
  assert.ok(line.length < 900, `строка памяти не должна раздуваться: ${line.length}`);
});

test('деньги отвечают через основной разбор, а не только через поиск', async () => {
  // «Сколько отдал за новую батарею» лежит операцией в money/, а корпус
  // tasks_context держал только projects/ и journal/ — инструмент честно
  // отвечал «ничего не нашлось», хотя сумма записана.
  const api = liveTasksApi();
  await session(api).tasks_money({
    amount: 18700, category: 'транспорт', contour: 'personal',
    title: 'Аккумулятор Camel AGM вместо сгоревшей VARTA',
  });
  const res = await session(api).tasks_context({ topic: 'сколько отдал за аккумулятор' });
  const hits = res.structured.journal.filter((h) => h.path.startsWith('money/'));
  assert.ok(hits.length, 'операция обязана доезжать основным путём');
  assert.match(hits[0].text, /18\s?700|18700/);
});

test('синонимы дописываются к живому факту, не штампуя на нём ложное «устарело»', async () => {
  // Их рисовали только при создании и при замене через replaces. Значит
  // добавить «зовётся: тачка» к уже записанной машине было нечем: повтор
  // уходил в подтверждение и синонимы выбрасывал, а replaces записал бы в
  // память событие, которого не было.
  const api = await apiWithFact();
  const again = await session(api).tasks_learn({
    note: 'Машина — Hyundai Solaris', evidence: 'его слова', kind: 'факт',
    aliases: 'тачка, шкода',
  });
  assert.deepEqual(again.structured.aliases_added, ['тачка', 'шкода']);
  const live = tasks.activePreferences(tasks.parsePreferences({ text: prefsText(api) }));
  assert.equal(live.length, 1, 'второй записи не завелось');
  assert.deepEqual(live[0].aliases, ['тачка', 'шкода']);
  assert.doesNotMatch(prefsText(api), /устарело/, 'ложной отметки об устаревании быть не должно');

  // Повтор тех же синонимов ничего не меняет и не плодит строк.
  const twice = await session(api).tasks_learn({
    note: 'Машина — Hyundai Solaris', evidence: 'его слова', kind: 'факт', aliases: 'тачка',
  });
  assert.deepEqual(twice.structured.aliases_added, []);
  assert.equal((prefsText(api).match(/зовётся:/g) || []).length, 1);
});

test('синоним поднимает факт на обиходном слове', async () => {
  const api = await apiWithFact();
  const before = await session(api).tasks_context({ topic: 'на чём поедем, тачка на ходу?' });
  assert.equal(before.structured.preferences.filter((p) => p.relevant).length, 0);

  await session(api).tasks_learn({
    note: 'Машина — Hyundai Solaris', evidence: 'его слова', kind: 'факт', aliases: 'тачка, авто',
  });
  const after = await session(api).tasks_context({ topic: 'на чём поедем, тачка на ходу?' });
  assert.ok(
    after.structured.preferences.some((p) => p.relevant && /Solaris/.test(p.note)),
    'ради этого синонимы и заводились',
  );
  assert.match(after.text, /Из памяти/);
});

test('подошедшая память видна в тексте ответа, а не только в structured', async () => {
  // Ровно тот случай, ради которого факты и заводились: задач по слову нет,
  // и без этого блока инструмент отвечал «ничего не нашлось» — при том что
  // ответ лежал в том же ответе, этажом ниже. Клиенту уходит только text.
  const api = await apiWithFact();
  const res = await session(api).tasks_context({ topic: 'какая у меня машина' });
  assert.match(res.text, /Из памяти/);
  assert.match(res.text, /Hyundai Solaris/);
  assert.doesNotMatch(res.text, /ничего не нашлось/);
});

test('заменять надо действующую запись, а не уже погашенную', async () => {
  const api = await apiWithFact();
  await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });
  await assert.rejects(
    () => session(api).tasks_learn({
      note: 'Машина — Lada Vesta', evidence: 'его слова', kind: 'факт',
      replaces: 'Машина — Hyundai Solaris',
    }),
    (e) => e.code === 'already_replaced',
  );
  assert.equal(tasks.parsePreferences({ text: prefsText(api) }).length, 2, 'третья строка не появилась');
});

test('строка, которой в файле нет, не гасится молча — отметка сообщает о промахе', () => {
  const text = '## Как он решает\n\n- 2026-08-01 · факт · Склад — 200 м² — его слова\n';
  const entry = tasks.parsePreferences({ text })[0];
  assert.ok(tasks.markPreferenceStale(text, entry, { date: '2026-08-02', replacedBy: 'Склад — 320 м²' }));
  // Ту же запись правят руками или из другой сессии — заменяемого больше нет.
  const changed = text.replace('Склад — 200 м²', 'Склад — 210 м²');
  assert.equal(
    tasks.markPreferenceStale(changed, entry, { date: '2026-08-02', replacedBy: 'Склад — 320 м²' }),
    null,
    'молчаливый пропуск оставил бы в памяти два живых ответа',
  );
});

test('replaces без цели ничего не пишет: заменять нечего', async () => {
  const api = await apiWithFact();
  await assert.rejects(
    () => session(api).tasks_learn({
      note: 'Склад — 200 м²', evidence: 'его слова', kind: 'факт', replaces: 'площадь склада была другой',
    }),
    (e) => e.code === 'nothing_to_replace',
  );
  assert.equal(tasks.parsePreferences({ text: prefsText(api) }).length, 1);
});

test('погашенное значение вторым заходом не записывается заново', async () => {
  const api = await apiWithFact();
  await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });
  await assert.rejects(
    () => session(api).tasks_learn({ note: 'Машина — Hyundai Solaris', evidence: 'его слова', kind: 'факт' }),
    (e) => e.code === 'outdated_value',
    'две живые записи про одну машину — это хуже, чем ни одной',
  );
});

test('погашенное не приходит в разбор и не отвечает на проверку «я уже спрашивал»', async () => {
  const api = await apiWithFact();
  await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });
  const res = await session(api).tasks_context({ topic: 'машина' });
  assert.deepEqual(res.structured.preferences.map((p) => p.note), ['Машина — Renault Duster']);

  // Проверка «спрашивал ли я» по устаревшей записи обязана сказать, что она
  // устарела: иначе ею ответят, и это будет неправдой с уверенным видом.
  const stale = tasks.parsePreferences({ text: prefsText(api) }).find((p) => p.stale);
  const asked = tasks.knownPreference([stale], null, { question: 'какая у него машина?' });
  assert.ok(asked.stale, 'устаревшая запись найдена, но помечена');
});

test('после замены проверка вопроса отвечает действующим значением, а не первым похожим', async () => {
  const api = await apiWithFact();
  await session(api).tasks_learn({
    note: 'Машина — Renault Duster', evidence: 'его слова', kind: 'факт',
    replaces: 'Машина — Hyundai Solaris',
  });

  // Вопрос у обеих записей один и тот же — новая его унаследовала. Совпадение
  // по вопросу равное, и выбор между ними решает не порядок строк в файле.
  const check = await session(api).tasks_learn({ question: 'какая у него машина?' });
  assert.equal(check.structured.asked, true);
  assert.equal(check.structured.outdated, false);
  assert.match(check.text, /Renault Duster/);
  assert.doesNotMatch(check.text, /Solaris/, 'погашенным значением отвечать нельзя');

  // И список памяти показывает то, что действует сейчас.
  const list = await session(api).tasks_learn({});
  assert.deepEqual(list.structured.preferences.map((p) => p.note), ['Машина — Renault Duster']);
});

test('погашенное значение с ЖИВЫМ вопросом всё равно узнаётся устаревшим', async () => {
  // Запись без вопроса: связать её с новой нечем, кроме самой формулировки.
  const api = liveTasksApi();
  await session(api).tasks_learn({ note: 'Склад на Тверской', evidence: 'его слова', kind: 'факт' });
  await session(api).tasks_learn({
    note: 'Склад в Химках', evidence: 'его слова', kind: 'факт', replaces: 'Склад на Тверской',
  });
  const check = await session(api).tasks_learn({ question: 'склад на Тверской?' });
  assert.equal(check.structured.outdated, true);
  assert.match(check.text, /устарело|устарел/i);
  assert.match(check.text, /Химк/, 'сразу назвал, чем заменено — иначе спросят второй раз наугад');
});

test('на пересмотр факт и обычная запись выносятся по разным правилам', () => {
  const text = [
    '## Как он решает',
    '',
    '- 2026-06-01 · предпочтение · Старое и не пригодилось — его слова',
    '- 2026-01-01 · факт · Склад — 200 м² — его слова',
    '  - пригодилось: 5, последний раз 2026-01-20',
    '- 2026-06-20 · факт · Машина — Renault Duster — его слова',
    '- 2026-01-01 · факт · Машина — Hyundai Solaris — его слова',
    '  - устарело: 2026-06-20, заменено на «Машина — Renault Duster»',
    '',
  ].join('\n');
  const stale = tasks.stalePreferences(tasks.parsePreferences({ text }), { today: '2026-08-02' });

  const notes = stale.map((p) => p.note);
  assert.ok(notes.includes('Старое и не пригодилось'), 'обычная запись — прежний месячный срок');
  assert.ok(
    notes.includes('Склад — 200 м²'),
    'факт старше полугода спрашивается, даже когда он пригождался: им отвечают, и отвечают неправдой',
  );
  assert.ok(!notes.includes('Машина — Renault Duster'), 'факт моложе полугода — не мусор и не вопрос');
  assert.ok(!notes.includes('Машина — Hyundai Solaris'), 'погашенное на пересмотр не выносится вовсе');

  const fact = stale.find((p) => p.note === 'Склад — 200 м²');
  assert.equal(fact.reason, 'проверить');
  assert.equal(fact.age_days, 194, 'срок факта считается от последнего касания, а не от даты записи');
  assert.equal(stale.find((p) => p.kind === 'предпочтение').reason, 'вычеркнуть');
});

test('свежий факт молчит ровно до полугода, а не до месяца', () => {
  const text = '## Как он решает\n\n- 2026-07-01 · факт · Склад — 200 м² — его слова\n';
  const entries = tasks.parsePreferences({ text });
  assert.deepEqual(tasks.stalePreferences(entries, { today: '2026-08-02' }), [], 'месяц факту не срок');
  assert.equal(
    tasks.stalePreferences(entries, { today: '2027-02-01' }).length, 1,
    'через полгода без подтверждения — спрашиваем',
  );
});

// ── Захват в момент нехватки ─────────────────────────────────────────────
//
// Ответ на «открыто:» ложится ДОЧЕРНЕЙ строкой под задачу. Задачу закрывают —
// и «на складе 200 м²» уезжает в архив вместе с ней, в память не попав ни разу.
// Принудить модель кодом нельзя: вопрос звучит в чате, коннектор его не видит.
// Поэтому здесь три вещи, которые работают без принуждения: аргумент, приписка
// в ответе инструмента и отказ доски принимать уже отвеченное.

/** Задача с висящим вопросом про склад — то, на что отвечают фактом. */
async function apiWithOpenQuestion() {
  const api = liveTasksApi();
  const created = await session(api).tasks_decision({
    project: 'family',
    title: 'Разобрать склад',
    questions: ['какая площадь склада?'],
  });
  return { api, hash: created.structured.hash };
}

test('ответ-факт при снятии вопроса оседает в памяти, а не только под задачей', async () => {
  const { api, hash } = await apiWithOpenQuestion();
  const res = await session(api).tasks_resolve({
    project: 'family', hash, needle: 'площадь склада',
    note: 'на складе 200 м²', fact: 'Склад — 200 м²',
  });

  assert.equal(res.structured.learned.created, true);
  assert.equal(res.structured.learned.kind, 'факт');
  const saved = prefsText(api);
  assert.match(saved, /^- 2026-08-02 · факт · Склад — 200 м² — его ответ на «открыто: какая площадь склада\?» — family\//m);
  // Вопрос задачи переехал в память вместе с ответом: по нему ловится повтор.
  assert.match(saved, /^ {2}- вопрос: какая площадь склада\?$/m);
  // И сама задача при этом обработана как раньше.
  assert.equal(res.structured.unblocked, true);
});

test('ответ записан, фактом не назван — инструмент напоминает, что он уедет в архив', async () => {
  const { api, hash } = await apiWithOpenQuestion();
  const res = await session(api).tasks_resolve({
    project: 'family', hash, needle: 'площадь склада', note: 'на складе 200 м²',
  });
  assert.match(res.text, /уедет в архив вместе с задачей/);
  assert.match(res.text, /fact/);

  // На пустом снятии строки напоминать не о чем — приписка молчит.
  const { api: api2, hash: hash2 } = await apiWithOpenQuestion();
  const quiet = await session(api2).tasks_resolve({ project: 'family', hash: hash2, needle: 'площадь склада' });
  assert.doesNotMatch(quiet.text, /уедет в архив/);
});

test('доска не принимает вопрос, на который факт уже записан', async () => {
  const api = await apiWithFact('Склад — 200 м²', 'какая площадь склада?');
  const res = await session(api).tasks_decision({
    project: 'family', title: 'Разобрать склад', questions: ['какая площадь склада?'],
  });
  assert.equal(res.structured.created, false);
  assert.equal(res.structured.reason, 'known');
  assert.match(res.text, /Склад — 200 м²/, 'ответ показан прямо в отказе — иначе за ним пойдут второй раз');
  assert.match(api.kv[tasks.keyForPath('projects/family.md')].text, /^(?!.*Разобрать склад)/s, 'задача не заведена');
});

test('вопрос без записанного факта на доску проходит — глушить всё подряд нельзя', async () => {
  const api = await apiWithFact('Склад — 200 м²', 'какая площадь склада?');
  const res = await session(api).tasks_decision({
    project: 'family', title: 'Выбрать день переезда', questions: ['переезжаем в субботу или в воскресенье?'],
  });
  assert.equal(res.structured.created, true);
  assert.deepEqual(res.structured.answered, []);

  // Сверяются только факты. Предпочтение похоже на вопрос словами, но ответа
  // на него не содержит: заглушить им развилку значит потерять её насовсем.
  await session(api).tasks_learn({ note: 'Дела короче получаса в день не ставим', evidence: 'его слова', kind: 'порог' });
  assert.ok(
    tasks.questionSimilarity('Дела короче получаса в день не ставим', 'дела короче получаса ставим в день?') >= tasks.DECISION_SIMILARITY,
    'формулировки близки — значит защищает именно вид записи, а не непохожесть',
  );
  const second = await session(api).tasks_decision({
    project: 'heys', title: 'Решить про мелкие дела', questions: ['дела короче получаса ставим в день?'],
  });
  assert.equal(second.structured.created, true, 'порог развилку не глушит — она осталась бы без ответа');
});

test('отказ памяти не отменяет снятого вопроса — говорится вслух', async () => {
  const { api, hash } = await apiWithOpenQuestion();
  await session(api).tasks_learn({ note: 'Склад на Тверской', evidence: 'его слова', kind: 'факт' });
  await session(api).tasks_learn({
    note: 'Склад в Химках', evidence: 'его слова', kind: 'факт', replaces: 'Склад на Тверской',
  });

  // Модель отвечает старым, уже погашенным значением: память откажет.
  const res = await session(api).tasks_resolve({
    project: 'family', hash, needle: 'площадь склада',
    note: 'склад на Тверской', fact: 'Склад на Тверской',
  });
  assert.ok(res.structured.learn_failed, 'отказ памяти назван');
  assert.match(res.text, /В память НЕ легло/);
  // Но вопрос снят и файл записан: повторять tasks_resolve уже нечего.
  assert.ok(!/открыто: какая площадь склада/.test(api.kv[tasks.keyForPath('projects/family.md')].text));
});

// ── Загруженность вперёд ─────────────────────────────────────────────────
//
// «Когда можно уехать» считается арифметикой доски, а не своей. Расхождение
// здесь незаметно и потому опасно: инструмент назовёт вторник свободным, а на
// доске в нём стоит дзюдо, и человек узнает об этом уже после разговора.

const RECURRING_MD = `# Повторяющиеся слоты

Строка = слот, который сам появляется в нужные дни.

пн-пт 09:00-09:30 Зарядка
вт,чт 18:00-19:30 Дзюдо
`;

/** Задачник с повторами и одним дедлайном — вход обоих календарных тестов. */
function boardApi(extra = {}) {
  const files = {};
  const put = (path, text) => { files[tasks.keyForPath(path)] = { path, text, rev: 1, updatedAt: 1 }; };
  put('days/recurring.md', RECURRING_MD);
  put('projects/heys.md', `# HEYS

## Задачи

- [ ] P1 Собрать лендинг due:2026-08-06 ^2026-08-01
- [ ] P2 Отдать отчёт due:2026-08-09 ^2026-08-01
`);
  for (const [path, text] of Object.entries(extra)) put(path, text);
  return liveApi(files);
}

test('свободные окна считаются той же арифметикой, что рисует доска', () => {
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- 10:00-12:00 Kinderly\n- 15:00-17:00 Лендинг #фокус\n' });
  assert.deepEqual(day.free.map((g) => `${g.from}-${g.to}`), ['07:00-10:00', '12:00-15:00', '17:00-01:00']);
  assert.equal(day.busy_minutes, 240);
  assert.equal(day.focus_minutes, 240, 'оба слота требуют головы');
});

test('щель короче 45 минут окном не считается', () => {
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- 10:00-12:00 Kinderly\n- 12:30-14:00 Лендинг\n' });
  assert.deepEqual(day.free.map((g) => g.from), ['07:00', '14:00'], 'полчаса между делами — не свободное окно');
});

test('день начинается в семь утра, как на доске', () => {
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- 07:00-09:00 Kinderly\n' });
  assert.equal(day.free.length, 1, 'до семи утра свободного времени не существует');
  assert.equal(day.free[0].from, '09:00');
});

test('тег вида слота снимается с заголовка и меняет счёт «требует головы»', () => {
  // Кириллица и `\b` в JS не дружат: без явной границы тег не находился вовсе,
  // всё подряд считалось фокусом, а сам `#фон` оставался висеть в названии.
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- 10:00-12:00 Родители #фон\n- 15:00-15:15 Забрать торт #дело\n' });
  assert.deepEqual(day.slots.map((s) => [s.title, s.kind]), [['Родители', 'фон'], ['Забрать торт', 'дело']]);
  assert.equal(day.busy_minutes, 135, 'врезка короче четверти часа всё равно занимает четверть часа');
  assert.equal(day.focus_minutes, 0, 'присутствие и врезка головы не требуют');
});

test('закрытый слот занимает время, а не освобождает его', () => {
  // `- [x] 15:00-17:00 Kinderly` — обычная строка прошедшего дня. Разбор без
  // галочки выкидывал её целиком, и отработанный день выглядел бы пустым.
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- [x] 15:00-17:00 Kinderly\n' });
  assert.equal(day.busy_minutes, 120);
  assert.deepEqual(day.free.map((g) => `${g.from}-${g.to}`), ['07:00-15:00', '17:00-01:00']);
});

test('повтор из recurring.md подставляется в день и не считается работой головы', () => {
  const rec = tasks.parseRecurringSlots(RECURRING_MD);
  const monday = tasks.dayLoad({ date: '2026-08-03', text: '', recurring: rec });
  assert.equal(monday.has_file, false);
  assert.equal(monday.busy_minutes, 30, 'зарядка занимает время');
  assert.equal(monday.focus_minutes, 0, 'но головы не требует — на доске это привычка');
  assert.equal(monday.slots[0].kind, 'привычка');
  assert.equal(monday.slots[0].repeat, true);
});

test('повтор не задваивается, если тот же слот уже записан в дне', () => {
  const rec = tasks.parseRecurringSlots(RECURRING_MD);
  const day = tasks.dayLoad({ date: '2026-08-03', text: '- 09:00-09:30 Зарядка\n', recurring: rec });
  assert.equal(day.slots.length, 1);
  assert.equal(day.slots[0].repeat, false, 'своя строка дня главнее подстановки');
});

test('якорь опознаётся по повторению, а не по названию', () => {
  const days = [
    tasks.dayLoad({ date: '2026-08-04', text: '- 18:00-19:30 Пилатес у Иры @зал\n' }),
    tasks.dayLoad({ date: '2026-08-11', text: '- 18:00-19:30 Пилатес у Иры\n' }),
    tasks.dayLoad({ date: '2026-08-18', text: '- 18:00-19:30 Пилатес у Иры\n' }),
    tasks.dayLoad({ date: '2026-08-05', text: '- 12:00-13:00 Разовая встреча\n' }),
  ];
  const anchors = tasks.anchorSlots(days);
  assert.deepEqual(anchors.map((a) => a.title), ['Пилатес у Иры'],
    'разовая встреча якорем не становится, а незнакомое название — становится');
  assert.equal(anchors[0].times, 3);
  assert.equal(anchors[0].weeks, 3);
  assert.deepEqual(anchors[0].weekdays, ['вт']);
  assert.equal(anchors[0].usual_time, '18:00–19:30');
  assert.equal(anchors[0].source, 'повтор в днях');
});

test('занятость ресурсов идёт рядом со свободными окнами, а не вместо них', async () => {
  const day = '- 12:00–15:00 Тренировка Саши (чей: жена; занято: машина, ребёнок) #фон\n';
  const res = await session(boardApi({ 'days/2026-08-03.md': day })).tasks_calendar({ days: 2 });
  const monday = res.structured.days.find((d) => d.date === '2026-08-03');
  assert.deepEqual(monday.resources.map((r) => r.resource), ['машина', 'ребёнок']);
  assert.equal(monday.resources[0].from, '12:00');
  assert.equal(monday.resources[0].whose, 'жена');
  // Арифметику свободного времени это не трогает: она зеркалит доску.
  assert.ok(monday.free.length, 'свободные окна считаются как раньше');
  assert.ok(monday.busy_minutes >= 180, 'событие по-прежнему занимает время');
  assert.match(res.text, /машина/);
});

test('день без занятых ресурсов ничего лишнего в календарь не приносит', async () => {
  const res = await session(boardApi({ 'days/2026-08-03.md': '- 12:00–15:00 Лендинг #фокус\n' })).tasks_calendar({ days: 2 });
  const monday = res.structured.days.find((d) => d.date === '2026-08-03');
  assert.deepEqual(monday.resources, []);
  assert.ok(!/занято у него самого/.test(res.text));
});

test('день без файла не роняет разбор и приходит свободным', async () => {
  const res = await session(boardApi()).tasks_calendar({ days: 7 });
  assert.equal(res.structured.days.length, 7);
  const sunday = res.structured.days.find((d) => d.date === '2026-08-02');
  assert.equal(sunday.has_file, false);
  assert.equal(sunday.busy_minutes, 0);
  assert.deepEqual(sunday.free.map((g) => `${g.from}-${g.to}`), ['07:00-01:00']);
  assert.ok(res.structured.free_days.includes('2026-08-02'), 'свободный день назван свободным, а не «данных нет»');
});

test('день с дедлайном свободным не считается — именно он и уедет', async () => {
  const res = await session(boardApi()).tasks_calendar({ days: 10 });
  const sunday = res.structured.days.find((d) => d.date === '2026-08-09');
  assert.equal(sunday.busy_minutes, 0, 'слотов в дне нет');
  assert.equal(sunday.due[0].title, 'Отдать отчёт');
  assert.ok(!res.structured.free_days.includes('2026-08-09'));
  assert.deepEqual(res.structured.free_stretches, [],
    'суббота с воскресеньем не склеиваются в свободные выходные, пока на воскресенье висит дедлайн');
});

test('обрезанная неделя окна не выигрывает звание самой свободной', async () => {
  const res = await session(boardApi()).tasks_calendar({ days: 21 });
  const stub = res.structured.weeks.find((w) => w.start === '2026-07-27');
  assert.equal(stub.days_count, 1, 'в кадр попало одно воскресенье');
  assert.equal(stub.full, false);
  assert.notEqual(res.structured.quietest_week, '2026-07-27');
  assert.notEqual(res.structured.busiest_week, '2026-07-27');
  assert.match(res.text, /якоря: /, 'повторяющееся названо сразу');
});

test('календарь не принимает мусор вместо даты и не уходит за два месяца', async () => {
  await assert.rejects(() => session(boardApi()).tasks_calendar({ from: 'в сентябре' }), (e) => e.code === 'invalid_from');
  await assert.rejects(() => session(boardApi()).tasks_calendar({ days: 0 }), (e) => e.code === 'invalid_days');
  const res = await session(boardApi()).tasks_calendar({ days: 400 });
  assert.equal(res.structured.days.length, 60);
});

// ── Деньги месяца ────────────────────────────────────────────────────────
//
// Здесь честность важнее полноты: лимит «?» стоит в budget.md по его решению,
// и превратить его в число значит выдумать норму, которой он не задавал.

const AUG_MONEY = `# Август

- 01 -1200 еда ~family · тинькофф
- 02 -10000 подушка ~cushion
- 02 -3000 билеты ~travel
- 2026-08-02 · остаток 45000
`;
const JUL_MONEY = `# Июль

- 15 -10000 подушка ~cushion
- 20 -2000 еда ~family
`;
const BUDGET_MD = `# Бюджет

## Лимиты по контурам

- family | ?
- travel | 2000

## Подушка

- цель | 120000
- в месяц | 10000
- срок | 2027-08
`;

function moneyApi(extra = {}) {
  const files = {};
  const put = (path, text) => { files[tasks.keyForPath(path)] = { path, text, rev: 1, updatedAt: 1 }; };
  put('money/2026-08.md', AUG_MONEY);
  put('money/2026-07.md', JUL_MONEY);
  put('money/budget.md', BUDGET_MD);
  put('money/recurring.md', '# Регулярное\n\n- 20 -5000 интернет ~family\n');
  for (const [path, text] of Object.entries(extra)) put(path, text);
  return liveApi(files);
}

test('лимит «?» остаётся неизвестным, а не превращается в ноль', () => {
  const parsed = tasks.parseBudget(BUDGET_MD);
  assert.equal(parsed.limits.family, null);
  assert.equal(parsed.limits.travel, 2000);
  assert.equal(parsed.cushion.goal, 120000);
  assert.equal(parsed.cushion.monthly, 10000);
  assert.equal(parsed.cushion.deadline, '2027-08');
  assert.equal(tasks.parseBudget('## Подушка\n\n- срок | ?\n').cushion.deadline, null);
});

test('по контуру без лимита отклонение не считается вовсе', async () => {
  const res = await session(moneyApi()).tasks_budget({});
  const family = res.structured.limits.find((l) => l.contour === 'family');
  assert.equal(family.limit, null);
  assert.equal(family.over, null);
  assert.equal(family.measurable, false);
  assert.ok(res.structured.unmeasured.includes('family'));
  assert.match(res.text, /Лимит не задан \([^)]*family/);
  assert.ok(!/family на \d/.test(res.text), 'перекос по неизмеримому контуру не называется');

  const travel = res.structured.limits.find((l) => l.contour === 'travel');
  assert.equal(travel.over, 1000, 'там, где лимит есть, отклонение считается честно');
  assert.match(res.text, /Сверх лимита: travel на 1000 ₽/);
});

test('месяц без записанных доходов помечается односторонним', async () => {
  const res = await session(moneyApi()).tasks_budget({});
  assert.equal(res.structured.one_sided, true);
  assert.equal(res.structured.income_present, false);
  assert.match(res.text, /вывод односторонний/);

  const withIncome = await session(moneyApi({ 'money/2026-08.md': `${AUG_MONEY}- 05 +200000 зарплата ~family\n` }))
    .tasks_budget({});
  assert.equal(withIncome.structured.one_sided, false);
  assert.equal(withIncome.structured.income, 200000);
  assert.ok(!/вывод односторонний/.test(withIncome.text));
});

test('взнос в подушку не выдаётся за потребление и не тонет в расходах', async () => {
  const res = await session(moneyApi()).tasks_budget({});
  assert.deepEqual(res.structured.split, { consumption: 4200, debt: 0, cushion: 10000 });
  assert.equal(res.structured.cushion.month, 10000);
  assert.equal(res.structured.cushion.total, 20000, 'подушка копится по всем месяцам задачника');
  assert.match(res.text, /Подушка — сбережения, а не бюджет поездки/);
});

test('снятие из подушки не раздувает потребление', async () => {
  const api = moneyApi({ 'money/2026-08.md': `${AUG_MONEY}- 10 +4000 подушка ~cushion\n` });
  const res = await session(api).tasks_budget({});
  assert.equal(res.structured.split.consumption, 4200, 'снятые деньги никто не проел');
  assert.equal(res.structured.split.cushion, 10000, 'разбивка расходов сходится с суммой расходов');
  assert.equal(res.structured.cushion.month, 6000, 'а за месяц в подушке прибавилось меньше');
});

test('траты по ~travel видны отдельной строкой, в том числе по запросу контура', async () => {
  const res = await session(moneyApi()).tasks_budget({ contour: '~travel' });
  assert.equal(res.structured.contour_key, 'travel', '«~» перед именем контура не мешает');
  assert.equal(res.structured.contour.spent, 3000);
  assert.equal(res.structured.travel.month, 3000);
});

test('прогноз «спишется само» строится только по текущему месяцу', async () => {
  const now = await session(moneyApi()).tasks_budget({ month: '2026-08' });
  assert.equal(now.structured.recurring_ahead, 5000);
  const past = await session(moneyApi()).tasks_budget({ month: '2026-07' });
  assert.equal(past.structured.recurring_ahead, null, 'в прошедшем месяце всё уже списалось');
  assert.equal(past.structured.spent, 12000);
});

test('месяц просят форматом, а не словами', async () => {
  await assert.rejects(() => session(moneyApi()).tasks_budget({ month: 'август' }), (e) => e.code === 'invalid_month');
});

test('новые инструменты объявлены и в схемах, и обработчиком', () => {
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  for (const name of ['tasks_calendar', 'tasks_budget']) {
    const schema = built.schemas.find((s) => s.name === name);
    assert.ok(schema, `${name} объявлен в схемах — иначе модель его не увидит`);
    assert.equal(schema.inputSchema.type, 'object');
    assert.equal(typeof built.tools[name], 'function', `${name} имеет обработчик`);
  }
});

test('правила задачника ссылаются только на существующие инструменты', () => {
  const prevSecret = process.env.MCP_TELEMETRY_SECRET;
  process.env.MCP_TELEMETRY_SECRET = 'secret-test';
  try {
    const { schemas } = createCuratorContext({
      api: liveApi({}),
      curatorJwt: JWT,
      curatorName: 'Антон',
      nowMs: NOW,
      tasksClientId: CLIENT,
    });
    const known = new Set(schemas.map((s) => s.name));
    const named = new Set(curatorInstructions('Антон', true).match(/tasks_[a-zа-яё_]+/gi) || []);
    assert.ok(named.has('tasks_calendar') && named.has('tasks_budget'), 'новые правила названы своими именами');
    for (const name of named) assert.ok(known.has(name), `правило обещает несуществующий инструмент ${name}`);
  } finally {
    if (prevSecret === undefined) delete process.env.MCP_TELEMETRY_SECRET;
    else process.env.MCP_TELEMETRY_SECRET = prevSecret;
  }
});

test('инструкция куратора не включает остановленный эксперимент с двумя ответами', () => {
  const instructions = curatorInstructions('Антон', true, Date.UTC(2026, 7, 4));
  assert.doesNotMatch(instructions, /Эксперимент до 2026-08-05/);
  assert.doesNotMatch(instructions, /tasks_vote/);
  assert.match(instructions, /^З1\./m);
});

test('голос записывается как процедурный или свободный, а не как сырые номера', async () => {
  const api = liveTasksApi();
  const tools = session(api);
  const first = await tools.tasks_vote({ choice: '2', procedural: '1', question: 'отпуск в сентябре' });
  assert.equal(first.structured.winner, 'свободный');
  const second = await tools.tasks_vote({ choice: '2', procedural: '2', question: 'что с лендингом', note: 'короче и по делу' });
  assert.equal(second.structured.winner, 'процедурный');
  assert.deepEqual(second.structured.counts, { 'процедурный': 1, 'свободный': 1, 'ничья': 0 });
  const saved = api.kv[tasks.keyForPath(tasks.VOTES_PATH)].text;
  assert.match(saved, /^- 2026-08-02 · свободный · отпуск в сентябре$/m);
  assert.match(saved, /^- 2026-08-02 · процедурный · что с лендингом — короче и по делу$/m);
});

test('голос без номера процедурного не записывается — счёт без него бессмыслен', async () => {
  await assert.rejects(
    () => session(liveTasksApi()).tasks_vote({ choice: '1', question: 'x' }),
    (e) => e.code === 'invalid_procedural',
  );
});

// ── Порядок чтения ───────────────────────────────────────────────────────
//
// Потолок на чтение пачкой существовал всегда, а порядка не было: ключи шли по
// алфавиту, `days/` растёт на файл в день и стоит раньше `projects/`. Ещё
// пара недель — и под нож попали бы сами задачи, молча.

test('задачи читаются раньше дней, журнала и документации', () => {
  const paths = ['docs/rituals.md', 'days/2026-08-02.md', 'journal/2026-08.md',
    'projects/heys.md', 'archive/2026-07.md', 'NOW.md', 'money/2026-08.md'];
  const order = tasks.rankPaths(paths, { today: '2026-08-02' });
  assert.equal(order[0], 'projects/heys.md');
  assert.equal(order[1], 'NOW.md');
  assert.ok(order.indexOf('days/2026-08-02.md') < order.indexOf('journal/2026-08.md'));
  assert.equal(order[order.length - 1], 'docs/rituals.md', 'документация нужна в одном вопросе из ста');
});

test('из дней берутся ближайшие к сегодня, а не самые старые', () => {
  const days = ['days/2026-06-01.md', 'days/2026-08-05.md', 'days/2026-07-20.md', 'days/2026-08-01.md'];
  const order = tasks.rankPaths(days, { today: '2026-08-02' });
  assert.deepEqual(order.slice(0, 2), ['days/2026-08-01.md', 'days/2026-08-05.md']);
});

test('при потолке в 60 файлов задачи не вытесняются растущими днями', () => {
  const days = Array.from({ length: 120 }, (_, i) => `days/2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}.md`);
  const projects = ['projects/heys.md', 'projects/kinderly.md', 'projects/family.md'];
  const kept = tasks.rankPaths([...days, ...projects], { today: '2026-08-02' }).slice(0, 60);
  for (const p of projects) assert.ok(kept.includes(p), `${p} выпал из чтения`);
});

// ── Рабочая память против разовых отчётов ────────────────────────────────
//
// Всё, что не назвали явно, падало в конец, и туда же попала docs/ целиком —
// вместе с памятью «как он решает» и тем, что он сам вынес на планёрку. На
// живом задачнике preferences.md стоял 54-м при потолке 60, а standup.md не
// читался вовсе. Поднять потолок было нельзя: разовые отчёты агентов — 62%
// корпуса, и каждый разбор фразы тащил бы ≈97 тысяч токенов чужих аудитов.

/** Список путей того же состава, что живой задачник: 7 проектов, дни, отчёты. */
function corpusPaths({ reports = 14 } = {}) {
  return [
    'NOW.md', 'INBOX.md', 'GOALS.md', 'habits.md', 'README.md', 'CLAUDE.md',
    ...['heys', 'kinderly', 'family', 'personal', 'mine2d', 'travel', 'someday'].map((p) => `projects/${p}.md`),
    ...Array.from({ length: 18 }, (_, i) => `days/2026-08-${String(i + 1).padStart(2, '0')}.md`),
    'days/README.md', 'days/recurring.md',
    'journal/2026-08.md', 'journal/README.md',
    'money/2026-08.md', 'money/README.md', 'money/budget.md', 'money/recurring.md',
    'archive/2026-07.md', 'archive/2026-08.md',
    'transcript/2026-08-01.md', 'transcript/2026-08-02.md', 'transcript/README.md',
    tasks.PREFS_PATH, tasks.STANDUP_PATH, tasks.REMINDERS_PATH, tasks.VOTES_PATH,
    ...Array.from({ length: reports }, (_, i) => `docs/отчёт-агента-${i}.md`),
  ];
}

test('рабочая память читается вровень с задачами, а не на грани отсечения', () => {
  const order = tasks.rankPaths(corpusPaths(), { today: '2026-08-03' });
  for (const path of [tasks.PREFS_PATH, tasks.STANDUP_PATH, tasks.REMINDERS_PATH, tasks.VOTES_PATH]) {
    const at = order.indexOf(path) + 1;
    assert.ok(at > 0 && at <= 20, `${path} стоит ${at}-м, а должен быть в первой двадцатке`);
  }
  // Отчёты при этом ушли в самый хвост — они и вытесняли память.
  assert.ok(tasks.isOneOffReport(order[order.length - 1]), 'последним читается разовый отчёт');
});

test('разовый отчёт узнаётся признаком, а не списком имён', () => {
  // Имена отчётов растут — завтра появится ещё три, и список пришлось бы вести.
  assert.equal(tasks.isOneOffReport('docs/чего-ещё-никто-не-писал.md'), true);
  assert.equal(tasks.isOneOffReport('docs/dev-dashboard.md'), true);
  // Файлы состояния коннектора лежат там же, но документацией не являются.
  for (const path of [tasks.PREFS_PATH, tasks.STANDUP_PATH, tasks.REMINDERS_PATH, tasks.VOTES_PATH]) {
    assert.equal(tasks.isOneOffReport(path), false, `${path} — рабочая память, а не отчёт`);
    assert.equal(tasks.isStateFile(path), true);
  }
  assert.equal(tasks.isOneOffReport('projects/heys.md'), false);
});

test('вдвое больше отчётов не сдвигает рабочую память в чтении', () => {
  const order = tasks.rankPaths(corpusPaths({ reports: 28 }).filter((p) => !tasks.isOneOffReport(p)), { today: '2026-08-03' });
  const at = order.indexOf(tasks.STANDUP_PATH) + 1;
  assert.ok(at > 0 && at <= 20, `standup.md стоит ${at}-м при удвоенных отчётах`);
  assert.ok(order.length <= 60, 'сплошной проход помещается в потолок');
});

/** api с отчётом в docs/ и записью того, что реально ушло в батч. */
function apiWithReport() {
  const api = liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    [tasks.keyForPath(tasks.PREFS_PATH)]: { path: tasks.PREFS_PATH, text: '# Как он решает\n\n## Как он решает\n\n- 2026-08-01 · правило · развилки по деньгам решает сам\n', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('docs/night-2026-08-03.md')]: { path: 'docs/night-2026-08-03.md', text: '# Разбор ночи\n\nЗдесь разбирали кулинарный виджет.\n', rev: 1, updatedAt: 1 },
  });
  const batched = [];
  const inner = api.getKVManyByCurator;
  api.getKVManyByCurator = async (bearer, clientId, keys) => {
    batched.push(...keys);
    return inner(bearer, clientId, keys);
  };
  api.batched = batched;
  return api;
}

test('разбор фразы не тащит разовые отчёты, а рабочую память тащит', async () => {
  const api = apiWithReport();
  await session(api).tasks_context({ topic: 'кулинарный виджет' });
  assert.ok(!api.batched.includes(tasks.keyForPath('docs/night-2026-08-03.md')), 'отчёт в разбор фразы не пошёл');
  assert.ok(api.batched.includes(tasks.keyForPath(tasks.PREFS_PATH)), 'память «как он решает» прочитана');
});

test('прямой поиск словами читает и отчёты — иначе «не нашёл» было бы неправдой', async () => {
  const res = await session(apiWithReport()).tasks_search({ query: 'кулинарный виджет' });
  assert.ok(res.structured.matches.some((m) => m.path === 'docs/night-2026-08-03.md'), 'найдено в отчёте');
});

// ── Потолок чтения против растущих папок ─────────────────────────────────
//
// Симуляция роста по файлу в день: примерно к 19 августа CLAUDE.md и README.md
// (ранг 7) выпадали из сплошного прохода — молча, вместе с картой районов и
// временем в пути, которых больше нигде нет. Чинится не потолком: каждый файл
// прохода оплачивается в каждом разборе фразы.

/** Задачник через год такой же жизни: дни и стенограммы по файлу в день. */
function grownCorpus({ days = 300, transcripts = 300 } = {}) {
  const date = (i) => new Date(Date.UTC(2026, 7, 3) - i * 86400000).toISOString().slice(0, 10);
  return [
    'NOW.md', 'INBOX.md', 'GOALS.md', 'habits.md', 'README.md', 'CLAUDE.md',
    ...['heys', 'kinderly', 'family', 'personal'].map((p) => `projects/${p}.md`),
    'days/README.md', 'days/recurring.md', 'journal/README.md', 'money/README.md',
    ...Array.from({ length: days }, (_, i) => `days/${date(i)}.md`),
    ...Array.from({ length: transcripts }, (_, i) => `transcript/${date(i)}.md`),
    ...Array.from({ length: 12 }, (_, i) => `journal/2026-${String(i + 1).padStart(2, '0')}.md`),
    ...Array.from({ length: 12 }, (_, i) => `money/2026-${String(i + 1).padStart(2, '0')}.md`),
    ...Array.from({ length: 12 }, (_, i) => `archive/2026-${String(i + 1).padStart(2, '0')}.md`),
    tasks.PREFS_PATH, tasks.STANDUP_PATH, tasks.REMINDERS_PATH, tasks.VOTES_PATH,
  ];
}

test('справочники не вытесняются растущими днями — даже через год', () => {
  const kept = tasks.selectPaths(grownCorpus(), { today: '2026-08-03', max: 60 });
  for (const path of ['README.md', 'CLAUDE.md', 'days/README.md', 'money/README.md']) {
    assert.ok(kept.includes(path), `${path} выпал из чтения — карту районов больше взять негде`);
  }
});

test('одна растущая папка не съедает проход целиком', () => {
  const kept = tasks.selectPaths(grownCorpus(), { today: '2026-08-03', max: 60 });
  const from = (prefix) => kept.filter((p) => p.startsWith(prefix)).length;
  assert.equal(from('days/2026'), tasks.DATED_QUOTA, 'дней берётся ровно квота, а не весь потолок');
  assert.ok(from('journal/') >= 1, 'журнал не вытеснен днями');
  assert.ok(from('money/') >= 1, 'деньги не вытеснены днями');
  assert.ok(from('archive/') >= 1, 'архив не вытеснен днями');
  for (const path of ['projects/heys.md', tasks.PREFS_PATH]) assert.ok(kept.includes(path));
});

test('лишнее из датированной папки уходит в хвост, а не выбрасывается', () => {
  // Место осталось — тринадцатый день прочитается, просто после справочников.
  const all = tasks.selectPaths(grownCorpus({ days: 30, transcripts: 0 }), { today: '2026-08-03' });
  assert.equal(all.filter((p) => p.startsWith('days/2026')).length, 30, 'ни один файл не потерян');
  const quota = tasks.DATED_QUOTA;
  assert.ok(
    all.indexOf('README.md') < all.indexOf(`days/${'2026-07-05'}.md`),
    'справочник читается раньше дня, не попавшего в квоту',
  );
  assert.equal(all.slice(0, quota + 20).filter((p) => p.startsWith('days/2026')).length, quota);
});

/** Задачник, где отчётов больше, чем помещалось в прежний потолок прохода. */
function apiWithManyReports() {
  const files = {
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
  };
  const date = (i) => new Date(Date.UTC(2026, 7, 2) - i * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 60; i += 1) {
    const path = `days/${date(i)}.md`;
    files[tasks.keyForPath(path)] = { path, text: `# День ${date(i)}\n- 10:00–11:00 Работа\n`, rev: 1, updatedAt: 1 };
  }
  // Отчёты идут по алфавиту, и нужное лежит в самом хвосте: раньше проход
  // обрывался на восьмом, и «ничего нет» звучало по восемнадцати непрочитанным.
  for (let i = 0; i < 26; i += 1) {
    const path = `docs/аудит-${String.fromCharCode(97 + i)}.md`;
    const text = i === 25 ? '# Аудит\n\nЗдесь считали шпиндельный редуктор.\n' : '# Аудит\n\nОбычный разбор.\n';
    files[tasks.keyForPath(path)] = { path, text, rev: 1, updatedAt: 1 };
  }
  return liveApi(files);
}

test('поиск доходит до последнего отчёта, а не до восьмого по алфавиту', async () => {
  const res = await session(apiWithManyReports()).tasks_search({ query: 'шпиндельный редуктор' });
  assert.ok(
    res.structured.matches.some((m) => m.path === 'docs/аудит-z.md'),
    'найдено в отчёте, который прежний потолок отрезал',
  );
  assert.deepEqual(res.structured.skipped, [], 'на этом задачнике непрочитанного не осталось');
  assert.match(res.text, /прочитан весь задачник|Нашёл/);
});

test('непрочитанное поиск называет вслух — «ничего нет» по нему говорить нельзя', async () => {
  const files = {};
  const date = (i) => new Date(Date.UTC(2026, 7, 2) - i * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 260; i += 1) {
    const path = `days/${date(i)}.md`;
    files[tasks.keyForPath(path)] = { path, text: `# День ${date(i)}\n- 10:00–11:00 Работа\n`, rev: 1, updatedAt: 1 };
  }
  const res = await session(liveApi(files)).tasks_search({ query: 'шпиндельный редуктор' });
  assert.ok(res.structured.skipped.length > 0, 'часть файлов в проход не поместилась');
  assert.match(res.text, /в прочитанном ничего нет/, 'не «ничего нет», а «в прочитанном»');
  assert.match(res.text, /Не поместилось в проход \d+/);
  assert.match(res.text, /days\/\d{4}-\d{2}-\d{2}\.md/, 'непрочитанные названы поимённо');
});

test('названный поимённо список читается целиком, а не по квоте папки', async () => {
  const files = {};
  const date = (i) => new Date(Date.UTC(2026, 7, 2) + i * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 40; i += 1) {
    const path = `days/${date(i)}.md`;
    files[tasks.keyForPath(path)] = { path, text: `# День ${date(i)}\n- 10:00–11:00 Работа #дело\n`, rev: 1, updatedAt: 1 };
  }
  const api = liveApi(files);
  const res = await session(api).tasks_calendar({ days: 30 });
  assert.ok(
    res.structured.days.filter((d) => (d.slots || []).length).length > tasks.DATED_QUOTA,
    'календарь спрашивает дни поимённо — квота прохода его резать не должна',
  );
});

// ── Снять, перенести, закрыть день ───────────────────────────────────────
//
// Слот умели только ставить. «Отмени праздник 25-го» кончалось словами: агент
// говорил «снял», строка оставалась в дне, и загруженность дальше считала день
// занятым. Здесь проверяется ровно то, что расходилось: адресация слота,
// отказ вместо угадывания, и что закрытый день отличим от несмотренного.

const PLAN = `# План на 2026-08-02
- 09:00–09:30 Уборка кухни #дело
- 10:00–14:00 Лендинг: оптимальная версия · heys/7caa24 #фокус
- 14:00–19:00 Студия: уборка и встреча гостей · праздник Ксении
- 19:00–23:00 Дома у родителей #фон
- 15:00–15:15 Встретить торт #дело
`;

function dayApi(extra = {}) {
  const files = {
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    [tasks.keyForPath('days/2026-08-02.md')]: { path: 'days/2026-08-02.md', text: PLAN, rev: 1, updatedAt: 1 },
  };
  for (const [path, text] of Object.entries(extra)) files[tasks.keyForPath(path)] = { path, text, rev: 1, updatedAt: 1 };
  const api = liveApi(files);
  api.saved = [];
  const orig = api.upsertKVManyByCurator;
  api.upsertKVManyByCurator = async (bearer, clientId, items, contextId) => {
    api.saved.push(items.map((i) => i.k));
    return orig(bearer, clientId, items, contextId);
  };
  api.day = (date) => api.kv[tasks.keyForPath(`days/${date}.md`)].text;
  return api;
}

test('снятый слот исчезает из дня, а задача под ним остаётся', async () => {
  const api = dayApi();
  const res = await session(api).tasks_unslot({ date: '2026-08-02', at: '10:00' });

  assert.equal(res.structured.ref, 'heys/7caa24');
  assert.match(res.text, /Задача heys\/7caa24 осталась на месте/);
  const day = api.day('2026-08-02');
  assert.ok(!/Лендинг: оптимальная версия/.test(day), 'строка слота убрана из дня');
  assert.match(day, /Встретить торт/, 'остальные слоты не тронуты');
  // Задача живёт в проекте и снятием слота не закрывается и не двигается.
  assert.equal(api.kv[tasks.keyForPath('projects/heys.md')].text, HEYS_PROJECT);
});

test('слот снимается и по словам названия, без времени', async () => {
  const api = dayApi();
  const res = await session(api).tasks_unslot({ date: '2026-08-02', title: 'торт' });
  assert.equal(res.structured.from, '15:00');
  assert.ok(!/Встретить торт/.test(api.day('2026-08-02')));
});

test('«15:00 торт» одной строкой разбирается на время и слова', async () => {
  const api = dayApi();
  const res = await session(api).tasks_unslot({ date: '2026-08-02', slot: '15:00 торт' });
  assert.equal(res.structured.title, 'Встретить торт');
});

test('несуществующий слот не снимается молча, а перечисляет что в дне есть', async () => {
  const api = dayApi();
  await assert.rejects(
    () => session(api).tasks_unslot({ date: '2026-08-02', title: 'дзюдо' }),
    (e) => e.code === 'slot_not_found' && /Уборка кухни/.test(e.message),
  );
  assert.equal(api.saved.length, 0, 'ничего не записано');
});

test('под неоднозначное описание инструмент отказывается выбирать сам', async () => {
  const api = dayApi();
  await assert.rejects(
    () => session(api).tasks_unslot({ date: '2026-08-02', title: 'уборка' }),
    (e) => e.code === 'slot_ambiguous' && e.details.candidates.length === 2,
  );
  assert.equal(api.saved.length, 0, 'снятие «первого подходящего» — это молча снятый не тот слот');
});

test('слот без описания вовсе не снимается', async () => {
  const api = dayApi();
  await assert.rejects(
    () => session(api).tasks_unslot({ date: '2026-08-02' }),
    (e) => e.code === 'slot_query_required',
  );
  assert.equal(api.saved.length, 0);
});

test('перенос по времени сохраняет ссылку на задачу и вид слота', async () => {
  const api = dayApi();
  const res = await session(api).tasks_reslot({ date: '2026-08-02', at: '10:00', from: '11:00', to: '12:00' });
  assert.equal(res.structured.moved, true);
  assert.match(api.day('2026-08-02'), /- 11:00–12:00 Лендинг: оптимальная версия · heys\/7caa24 #фокус/);
  assert.ok(!/10:00–14:00 Лендинг/.test(api.day('2026-08-02')), 'старой строки не осталось');
});

test('названо только начало — длительность переезжает вместе со слотом', async () => {
  const api = dayApi();
  const res = await session(api).tasks_reslot({ date: '2026-08-02', at: '15:00', from: '16:30' });
  assert.equal(res.structured.to, '16:45', 'пятнадцать минут остались пятнадцатью');
  assert.match(api.day('2026-08-02'), /- 16:30–16:45 Встретить торт #дело/);
});

test('перенос сам с собой не конфликтует, а в занятое время — конфликтует', async () => {
  const clean = dayApi();
  const shifted = await session(clean).tasks_reslot({ date: '2026-08-02', at: '10:00', from: '09:00', to: '13:00' });
  assert.deepEqual(shifted.structured.conflicts, [], 'слот пересёкся со своим прежним местом — это не конфликт');

  const api = dayApi();
  const res = await session(api).tasks_reslot({ date: '2026-08-02', at: '10:00', from: '15:00', to: '18:00' });
  const hard = res.structured.conflicts.filter((c) => c.level === 'конфликт');
  assert.equal(hard.length, 1);
  assert.match(hard[0].title, /Студия/);
  assert.match(res.text, /Конфликт с/);
});

test('перенос на другую дату пишет сначала туда, потом убирает отсюда', async () => {
  const api = dayApi();
  const res = await session(api).tasks_reslot({ date: '2026-08-02', at: '15:00', to_date: '2026-08-03' });
  assert.equal(res.structured.to_date, '2026-08-03');
  assert.equal(res.structured.from, '15:00', 'без нового времени слот уезжает на ту же пору');
  assert.match(api.day('2026-08-03'), /- 15:00–15:15 Встретить торт #дело/);
  assert.ok(!/Встретить торт/.test(api.day('2026-08-02')));
  // Упади вторая запись — слот будет в двух днях, и это видно. При обратном
  // порядке он бы исчез молча, а это ровно то, что чинится этой задачей.
  assert.ok(api.saved[0].includes(tasks.keyForPath('days/2026-08-03.md')), 'первым пишется день-получатель');
  assert.ok(api.saved[1].includes(tasks.keyForPath('days/2026-08-02.md')), 'вторым — день, откуда сняли');
});

test('перенос на то же место ничего не переписывает', async () => {
  const api = dayApi();
  const res = await session(api).tasks_reslot({ date: '2026-08-02', at: '15:00', from: '15:00', to: '15:15' });
  assert.equal(res.structured.moved, false);
  assert.equal(api.saved.length, 0);
});

test('закрытие дня ставит галочки, пишет заметку и называет неотмеченное', async () => {
  const api = dayApi();
  const res = await session(api).tasks_close_day({
    date: '2026-08-02', done: ['10:00', 'торт'], note: 'весь день ушёл на лендинг',
  });

  const day = api.day('2026-08-02');
  assert.match(day, /- \[x\] 10:00–14:00 Лендинг: оптимальная версия · heys\/7caa24 #фокус/);
  assert.match(day, /- \[x\] 15:00–15:15 Встретить торт #дело/);
  assert.match(day, /^> весь день ушёл на лендинг$/m);
  assert.equal(res.structured.already_closed, false);
  assert.equal(res.structured.done.length, 2);
  assert.equal(res.structured.open.length, 3, 'остальное осталось без отметки');
  assert.match(res.text, /перенести \(tasks_reslot\), снять \(tasks_unslot\)/);
});

// ── Какой день закрывается по умолчанию ──────────────────────────────────
//
// Правило владельца от 2026-08-03: закрывается ВЧЕРАШНИЙ день, утром на
// планёрке — вечером день ещё не кончился. До этого дефолт стоял на «сегодня»,
// и правило спорило с инструментом: агент, прочитавший описание аргумента и не
// вспомнивший правило, закрывал не тот день.

test('без даты закрывается вчерашний день, а не сегодняшний', async () => {
  const api = dayApi({ 'days/2026-08-01.md': PLAN });
  const res = await session(api).tasks_close_day({ note: 'вчера всё срослось' });
  assert.equal(res.structured.date, '2026-08-01', 'сегодня по МСК — 2026-08-02');
  assert.match(api.day('2026-08-01'), /^> вчера всё срослось$/m);
  assert.ok(!/^> вчера всё срослось$/m.test(api.day('2026-08-02')), 'сегодняшний день не тронут');
});

test('вчерашний и сегодняшний день закрываются словом, а не только датой', async () => {
  const api = dayApi({ 'days/2026-08-01.md': PLAN });
  const yesterday = await session(api).tasks_close_day({ date: 'вчера', note: 'словом' });
  assert.equal(yesterday.structured.date, '2026-08-01');

  // Сегодняшний закрыть можно, но только явно: это исключение, а не умолчание.
  const today = await session(api).tasks_close_day({ date: 'сегодня', done: ['10:00'], note: 'день закончили раньше' });
  assert.equal(today.structured.date, '2026-08-02');
  assert.match(api.day('2026-08-02'), /- \[x\] 10:00–14:00 Лендинг/);
});

test('второе закрытие переписывает заметку, а не заводит вторую', async () => {
  const api = dayApi();
  await session(api).tasks_close_day({ date: '2026-08-02', done: ['10:00'], note: 'первая версия' });
  const again = await session(api).tasks_close_day({ date: '2026-08-02', done: ['10:00'], note: 'на самом деле съехало' });

  assert.equal(again.structured.already_closed, true);
  assert.equal(again.structured.previous_note, 'первая версия');
  assert.equal(again.structured.done[0].already, true, 'галочка уже стояла — повтор её не портит');
  const day = api.day('2026-08-02');
  assert.equal(day.split('\n').filter((l) => l.startsWith('> ')).length, 1);
  assert.match(day, /^> на самом деле съехало$/m);
});

test('день без фразы «как прошло» не считается закрытым', async () => {
  const api = dayApi();
  await assert.rejects(
    () => session(api).tasks_close_day({ date: '2026-08-02', done: ['10:00'] }),
    (e) => e.code === 'note_required',
  );
  assert.equal(api.saved.length, 0, 'без заметки слот без галочки не отличить от «ещё не смотрели»');
});

test('неоднозначное «что состоялось» не закрывает день наполовину', async () => {
  const api = dayApi();
  await assert.rejects(
    () => session(api).tasks_close_day({ date: '2026-08-02', done: ['10:00', 'уборка'], note: 'как-то так' }),
    (e) => e.code === 'slot_ambiguous',
  );
  assert.equal(api.saved.length, 0, 'ни галочки, ни заметки — иначе непонятно, закрыт день или нет');
});

// ── Деньги за вчера: напоминание на утренней планёрке ────────────────────
//
// Правка владельца от 2026-08-03: спрашивать не вечером, а утром, там же, где
// закрывают вчерашний день. Вечером день ещё идёт, трата случится после
// закрытия, и признак «внёс или нет» соврёт. За вчера всё уже случилось.

const MONEY_EMPTY_AUG = '# Август\n\n- 02 -3000 билеты ~travel\n';
const MONEY_WITH_YESTERDAY = '# Август\n\n- 01 -1200 еда ~family · тинькофф\n- 02 -3000 билеты ~travel\n';

function closeApi(money) {
  return dayApi({ 'days/2026-08-01.md': PLAN, 'money/2026-08.md': money });
}

test('пустой день в деньгах — это «не внесено», а не «трат не было»', () => {
  const empty = tasks.moneyDayStatus(MONEY_EMPTY_AUG, '2026-08-01');
  assert.equal(empty.empty, true);
  assert.equal(empty.operations, 0);
  assert.equal(empty.path, 'money/2026-08.md');

  const said = tasks.moneyDayReminder(empty);
  assert.match(said, /2026-08-01/);
  assert.match(said, /не внесено/, 'формулировка обязана отличать отсутствие записей от отсутствия трат');
  assert.match(said, /не утверждай/);
  assert.ok(!/трат не было[^»]/.test(said.replace(/«[^»]*»/g, '')), 'вывода «трат не было» инструмент делать не вправе');

  const filled = tasks.moneyDayStatus(MONEY_WITH_YESTERDAY, '2026-08-01');
  assert.equal(filled.operations, 1);
  assert.equal(tasks.moneyDayReminder(filled), null, 'внесённый день молчит');
});

test('закрытие вчерашнего дня напоминает свести деньги, если за вчера пусто', async () => {
  const api = closeApi(MONEY_EMPTY_AUG);
  const res = await session(api).tasks_close_day({ date: '2026-08-01', done: ['10:00'], note: 'ушёл на лендинг' });

  assert.match(res.text, /Деньги за 2026-08-01 не сведены/);
  assert.equal(res.structured.money_day.operations, 0);
  assert.match(res.structured.money_reminder, /tasks_money/);
});

test('за вчера операции есть — про деньги молчим', async () => {
  const api = closeApi(MONEY_WITH_YESTERDAY);
  const res = await session(api).tasks_close_day({ date: '2026-08-01', done: ['10:00'], note: 'ушёл на лендинг' });

  assert.equal(res.structured.money_reminder, null);
  assert.ok(!/Деньги за/.test(res.text), 'напоминание при сведённом дне — это ровно тот шум, из-за которого их перестают читать');
});

test('про один и тот же день спрашивают один раз за утро, а не при каждом обращении', async () => {
  const api = closeApi(MONEY_EMPTY_AUG);
  const tools = session(api);
  const first = await tools.tasks_close_day({ date: '2026-08-01', done: ['10:00'], note: 'первая версия' });
  assert.match(first.text, /Деньги за 2026-08-01/);

  // Второе закрытие того же дня и повестка после него — про деньги молчат:
  // спрошенное лежит в памяти прохода, а не в памяти этого чата.
  const again = await tools.tasks_close_day({ date: '2026-08-01', done: ['10:00'], note: 'на самом деле съехало' });
  assert.equal(again.structured.money_reminder, null);
  assert.equal(api.kv[tasks.STATE_KEY].money_nudge.date, '2026-08-01');

  const fresh = await session(api).tasks_close_day({ date: '2026-08-01', done: ['10:00'], note: 'третий заход' });
  assert.equal(fresh.structured.money_reminder, null, 'новая сессия того же утра — это не новый повод спросить');
});

test('закрытие сегодняшнего дня про деньги не спрашивает — день ещё идёт', async () => {
  const api = dayApi({ 'money/2026-08.md': '# Август\n\n- 01 -1200 еда ~family\n' });
  const res = await session(api).tasks_close_day({ date: '2026-08-02', done: ['10:00'], note: 'как-то так' });

  assert.equal(res.structured.money_reminder, null);
  const state = api.kv[tasks.STATE_KEY];
  assert.ok(!state?.money_nudge, 'по идущему дню money_nudge не ставим');
  assert.ok(state?.transcript_pending, 'close_day — write, pending стенограммы ожидаем');
});

test('правила говорят, когда спрашивать про деньги и чего не утверждать', () => {
  const rules = curatorInstructions('Антон', true);
  const rule = rules.split('\n').find((line) => /деньги за вчера сводятся|сводятся и деньги за вчера/i.test(line));
  assert.ok(rule, 'без правила приписку про несведённые деньги никто не прочитает как повод спросить');
  assert.match(rule, /планёрк/i, 'место названо: утро, рядом с закрытием вчерашнего дня');
  assert.match(rule, /tasks_money/);
  assert.match(rule, /не внесено/, 'разница «не внёс» и «трат не было» должна стоять в самом правиле');
});

test('снять и перенести названы в правилах — иначе инструмент никто не вызовет', () => {
  const rules = curatorInstructions('Антон', true);
  assert.match(rules, /tasks_unslot/);
  assert.match(rules, /tasks_reslot/);
  assert.match(rules, /tasks_close_day/);
});

// ── Размер ответа на чтение ──────────────────────────────────────────────
//
// Журнал — один файл на месяц и растёт на десятки килобайт в день. Целиковое
// чтение к концу месяца стоит сотни тысяч токенов на один вызов.

const BIG_JOURNAL = `# Журнал 2026-08\n\n${Array.from({ length: 900 },
  (_, i) => `## 2026-08-${String(1 + (i % 28)).padStart(2, '0')}\n\nЗапись номер ${i + 1}: разговор про лендинг и сроки.\n`).join('\n')}`;

test('большой файл отдаётся хвостом и честно говорит, что обрезан', async () => {
  const api = liveApi({ [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: BIG_JOURNAL, rev: 7, updatedAt: 1 } });
  const res = await session(api).tasks_read({ path: 'journal/2026-08.md' });

  assert.equal(res.structured.truncated, true);
  assert.ok(res.structured.text.length < BIG_JOURNAL.length / 2, 'обрезка должна реально резать');
  assert.ok(res.structured.text.includes('Запись номер 900'), 'хвост — свежая часть, она нужнее');
  assert.ok(!res.structured.text.includes('Запись номер 1:'), 'начало осталось за границей окна');
  assert.match(res.text, /Отдана только часть файла/);
  assert.match(res.text, /tasks_search|from_line/, 'сказано, чем достать остальное');
  assert.ok(res.structured.from_line > 1 && res.structured.to_line === res.structured.total_lines);
});

test('from_line достаёт нужный кусок, а не только хвост', async () => {
  const api = liveApi({ [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: BIG_JOURNAL, rev: 7, updatedAt: 1 } });
  const res = await session(api).tasks_read({ path: 'journal/2026-08.md', from_line: 5, max_chars: 2000 });
  assert.equal(res.structured.from_line, 5);
  assert.match(res.structured.text, /Запись номер 1:/);
});

test('маленький файл читается целиком и обрезанным не помечается', async () => {
  const res = await build(withFiles()).tasks_read({ path: 'projects/heys.md' });
  assert.equal(res.structured.truncated, false);
  assert.equal(res.structured.text, HEYS_PROJECT);
});

test('у обрезанного проекта список задач остаётся полным', async () => {
  const long = `# HEYS\n\n## Задачи\n\n${HEYS_PROJECT.split('\n').slice(4).join('\n')}${Array.from({ length: 400 },
    (_, i) => `- [ ] P3 Задача номер ${i} ^2026-08-01\n`).join('')}`;
  const api = liveApi({ [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: long, rev: 1, updatedAt: 1 } });
  const res = await session(api).tasks_read({ path: 'projects/heys.md', max_chars: 3000 });

  assert.equal(res.structured.truncated, true);
  assert.ok(!res.structured.text.includes('Собрать оптимальную версию лендинга'), 'начало файла в окно не попало');
  assert.ok(
    res.structured.tasks.some((t) => t.title === 'Собрать оптимальную версию лендинга'),
    'разбор идёт по полному тексту: иначе править нечем ровно те задачи, которые не влезли',
  );
});

// ── Порядок выдачи поиска ────────────────────────────────────────────────

test('строка с фразой целиком идёт выше, чем строка с теми же словами вразброс', async () => {
  const api = liveApi({
    [tasks.keyForPath('projects/heys.md')]: {
      path: 'projects/heys.md', rev: 1, updatedAt: 1,
      text: '# HEYS\n\n## Задачи\n\n- [ ] P2 Версия лендинга ещё не выбрана ^2026-08-01\n',
    },
    [tasks.keyForPath('journal/2026-08.md')]: {
      path: 'journal/2026-08.md', rev: 1, updatedAt: 1,
      text: '# Журнал 2026-08\n\n## 2026-08-01\n\nОбсуждали: лендинг версия D — на ней и остановились.\n',
    },
  });
  const res = await session(api).tasks_search({ query: 'лендинг версия' });
  assert.equal(res.structured.matches[0].path, 'journal/2026-08.md', 'точное совпадение фразы должно быть первым');

  // Потолок применяется ПОСЛЕ отбора: иначе самая точная строка вылетает
  // просто потому, что её файл читается вторым.
  const one = await session(api).tasks_search({ query: 'лендинг версия', limit: 1 });
  assert.equal(one.structured.matches.length, 1);
  assert.equal(one.structured.matches[0].path, 'journal/2026-08.md');
});

// ── Правила про деньги против money/README.md ────────────────────────────

test('правило про деньги не спорит с money/README.md', () => {
  const rules = curatorInstructions('Антон', true);
  const money = rules.split('\n').find((l) => /^З\d+\. Деньги/.test(l));
  assert.ok(money, 'правило про деньги на месте');
  // README требует вносить сводку самому и ставить контур самому; прежняя
  // формулировка «сумму и контур бери у него» ровно этому противоречила.
  assert.ok(!/контур бери у него/.test(money));
  // Разбор сводки без переспрашивания описан у самого tasks_money — в правиле
  // остался только запрет на его файлы и порядок исправления ошибок.
  const tool = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError })
    .schemas.find((s) => s.name === 'tasks_money');
  assert.match(tool.description, /не переспрашивая/);
  assert.match(tool.description, /контур ставь сам/);
  assert.match(money, /строку-поправку/, 'исправление ошибки задним числом запрещено правилом');
  // Запрет на budget.md жил только в данных, а инструкция агента о нём молчала.
  assert.match(money, /budget\.md/);
});

test('снятие, перенос и закрытие дня объявлены и в схемах, и обработчиком', () => {
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  for (const name of ['tasks_unslot', 'tasks_reslot', 'tasks_close_day']) {
    const schema = built.schemas.find((s) => s.name === name);
    assert.ok(schema, `${name} объявлен в схемах — иначе модель его не увидит`);
    assert.equal(typeof built.tools[name], 'function', `${name} имеет обработчик`);
  }
  // Окно чтения бесполезно, если про его границы нельзя сказать в вызове.
  const read = built.schemas.find((s) => s.name === 'tasks_read');
  assert.ok(read.inputSchema.properties.from_line && read.inputSchema.properties.max_chars);
});

test('один слот, названный дважды, состоявшимся считается один раз', async () => {
  const api = dayApi();
  const res = await session(api).tasks_close_day({
    date: '2026-08-02', done: ['10:00', 'лендинг'], note: 'нормально',
  });
  assert.equal(res.structured.done.length, 1);
  assert.equal(res.structured.open.length, 4);
});

// ── Файлы, которые правит только он ──────────────────────────────────────
//
// «Пишет только он» стояло в самих файлах и в правилах, но инструменты туда
// пускали. Правило без опоры в коде держится ровно до первой уверенной
// просьбы «поправь лимит», поэтому отказ проверяется на самих вызовах.

const GUARDED_FILES = {
  [tasks.keyForPath('money/budget.md')]: { path: 'money/budget.md', text: '# Бюджет\n\n- family | ?\n', rev: 4, updatedAt: 1 },
  [tasks.keyForPath('GOALS.md')]: { path: 'GOALS.md', text: '# Зачем\n\n- heys — запустить релиз\n', rev: 2, updatedAt: 1 },
};

test('список защищённых файлов лежит одним местом и совпадает с пометками в данных', () => {
  assert.deepEqual([...tasks.OWNER_ONLY_FILES].sort(), ['GOALS.md', 'money/budget.md']);
  assert.equal(tasks.ownerOnlyFile('money/budget.md'), 'money/budget.md');
  assert.equal(tasks.ownerOnlyFile('GOALS.md'), 'GOALS.md');
  // Обход другим написанием пути закрыт: ключ у файла всё равно один.
  assert.equal(tasks.ownerOnlyFile('Money/Budget'), 'money/budget.md');
  assert.equal(tasks.ownerOnlyFile('goals'), 'GOALS.md');
  // Соседние файлы той же папки под запрет не попадают.
  assert.equal(tasks.ownerOnlyFile('money/2026-08.md'), null);
  assert.equal(tasks.ownerOnlyFile('projects/goals.md'), null);
});

test('дописать в money/budget.md и GOALS.md нельзя ни одним пишущим инструментом', async () => {
  const cases = [
    { path: 'money/budget.md', rev: 4, anchor: '# Бюджет' },
    { path: 'GOALS.md', rev: 2, anchor: '# Зачем' },
  ];
  for (const { path, rev, anchor } of cases) {
    const api = liveApi({ ...GUARDED_FILES });
    const tools = session(api);
    const before = JSON.stringify(api.kv);

    await assert.rejects(
      () => tools.tasks_append({ path, block: '- family | 60000' }),
      (e) => e.code === 'owner_only_file' && /только он сам/.test(e.message),
      `tasks_append не должен писать в ${path}`,
    );
    await assert.rejects(
      () => tools.tasks_patch({ path, rev, from: anchor, replacement: '# Правлено' }),
      (e) => e.code === 'owner_only_file',
      `tasks_patch не должен писать в ${path}`,
    );

    assert.equal(JSON.stringify(api.kv), before, `${path} не изменился ни на байт`);
  }
});

test('отказ не обходится правильной ревизией и прямой просьбой', async () => {
  const api = liveApi({ ...GUARDED_FILES });
  const tools = session(api);
  // Ревизия свежая, якорь существует — то есть отказ не побочный эффект
  // проверки гонки, а именно запрет на файл.
  const read = await tools.tasks_read({ path: 'money/budget.md' });
  await assert.rejects(
    () => tools.tasks_patch({
      path: 'money/budget.md', rev: read.structured.rev,
      from: '- family | ?', replacement: '- family | 60000',
    }),
    (e) => e.code === 'owner_only_file' && /предложение/.test(e.message),
  );
  assert.match(api.kv[tasks.keyForPath('money/budget.md')].text, /family \| \?/);
});

test('читать защищённые файлы по-прежнему можно — запрет только на запись', async () => {
  const api = liveApi({ ...GUARDED_FILES });
  const res = await session(api).tasks_read({ path: 'money/budget.md' });
  assert.match(res.text, /family/);
});

test('tasks_update до защищённых файлов не дотягивается по устройству путей', async () => {
  const api = liveApi({ ...GUARDED_FILES });
  await assert.rejects(
    () => session(api).tasks_update({ project: '../GOALS', hash: 'abc123', state: 'done' }),
    (e) => e.code === 'invalid_path' || e.code === 'task_not_found',
  );
});

// ── Планёрка ─────────────────────────────────────────────────────────────
//
// Утренний обход собирали руками из пяти вызовов, и он держался ровно до
// первого раза, когда его собрали не в том порядке. Здесь проверяется то, что
// в такой сущности ломается: повестка обязана оставаться короткой, а список
// расхождений — не выдумывать нестыковок там, где данные в порядке. Ложное
// расхождение опаснее пропущенного: после него перепроверять придётся всё.

const STANDUP_HEYS = `# HEYS

## Задачи

- [ ] P1 Живая задача due:2026-08-20 #ноут ^2026-07-30
- [x] P2 Закрытая задача ^2026-07-01
`;

const STANDUP_DAY = `# План на 2026-08-03
- 10:00–11:00 Созвон · heys/${tasks.taskHash('heys', 'Живая задача')} #фокус
- 12:00–13:00 Обед #дело
`;

/** Задачник без единого расхождения — на нём проверяется отсутствие ложных. */
function standupApi(extra = {}) {
  const files = {
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: STANDUP_HEYS, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('days/2026-08-03.md')]: { path: 'days/2026-08-03.md', text: STANDUP_DAY, rev: 1, updatedAt: 1 },
    // Деньги за вчера (01.08) в этом наборе уже внесены — значит про них
    // молчим, и остальные проверки повестки не спотыкаются о напоминание.
    [tasks.keyForPath('money/2026-08.md')]: { path: 'money/2026-08.md', text: AUG_MONEY, rev: 1, updatedAt: 1 },
  };
  for (const [path, text] of Object.entries(extra)) files[tasks.keyForPath(path)] = { path, text, rev: 1, updatedAt: 1 };
  const api = liveApi(files);
  api.file = (path) => (api.kv[tasks.keyForPath(path)] || {}).text || '';
  return api;
}

test('на здоровом задачнике расхождений нет ни одного', async () => {
  const res = await session(standupApi()).tasks_standup({});
  assert.deepEqual(res.structured.divergences, [], 'выдуманное расхождение обесценивает весь список');
  assert.equal(res.structured.totals.divergences, 0);
});

test('пустая повестка не падает и честно говорит, что обсуждать нечего', async () => {
  const res = await session(standupApi()).tasks_standup({});
  assert.equal(res.structured.empty, true);
  assert.match(res.text, /Обсуждать нечего/);
  // Картина времени и денег остаётся даже на пустой повестке: это не находка,
  // а фон, ради которого утро и садятся разбирать.
  assert.match(res.text, /Картина: /);
  assert.ok(Array.isArray(res.structured.picture.free_days));
});

test('повестка спрашивает про вчерашние деньги, только когда их не вносили', async () => {
  // По умолчанию в наборе деньги за 01.08 внесены — и повестка про них молчит.
  const quiet = await session(standupApi()).tasks_standup({});
  assert.equal(quiet.structured.money_yesterday, null);
  assert.ok(!/Деньги за вчера/.test(quiet.text));

  const api = standupApi({ 'money/2026-08.md': '# Август\n\n- 02 -3000 билеты ~travel\n' });
  const res = await session(api).tasks_standup({});
  assert.match(res.text, /Деньги за вчера:/);
  assert.match(res.text, /Деньги за 2026-08-01 не сведены/);
  assert.equal(res.structured.money_yesterday.date, '2026-08-01');
  assert.equal(res.structured.empty, false, 'несведённые деньги — это не пустое утро');

  // Второй вызов повестки за то же утро вопрос не повторяет.
  const again = await session(api).tasks_standup({});
  assert.equal(again.structured.money_yesterday, null);
  assert.ok(!/Деньги за вчера/.test(again.text));
});

test('слот ведёт в несуществующую и в закрытую задачу — оба случая названы', async () => {
  const closed = tasks.taskHash('heys', 'Закрытая задача');
  const api = standupApi({
    'days/2026-08-04.md': `# План\n- 09:00–10:00 В никуда · heys/abcdef\n- 11:00–12:00 На закрытую · heys/${closed}\n`,
  });
  const res = await session(api).tasks_standup({});
  const kinds = res.structured.divergences.map((d) => d.kind);
  assert.ok(kinds.includes('слот без задачи'), 'ссылка в несуществующую задачу');
  assert.ok(kinds.includes('слот на закрытую задачу'), 'событие под уже закрытой задачей');
  assert.match(res.text, /heys\/abcdef/);
});

test('прошлые дни не проверяются: вчерашний слот на закрытую задачу — это «сделали»', () => {
  const closed = tasks.taskHash('heys', 'Закрытая задача');
  const files = [
    { path: 'projects/heys.md', text: STANDUP_HEYS },
    { path: 'days/2026-08-01.md', text: `# План\n- 09:00–10:00 Вчера · heys/${closed}\n- 09:30–10:30 И ещё #фокус\n` },
  ];
  assert.deepEqual(tasks.findDivergences(files, { today: '2026-08-02' }), [], 'прошлое расхождением не считается');
  // Тот же файл, если день ещё не наступил, разбирается полностью — иначе
  // проверка выше доказывала бы только то, что день не прочитали.
  const ahead = tasks.findDivergences(files, { today: '2026-07-01' }).map((d) => d.kind);
  assert.deepEqual(ahead.sort(), ['слот на закрытую задачу', 'слоты пересеклись']);
});

test('состоявшийся слот расхождением не считается, даже если задача закрыта', () => {
  const closed = tasks.taskHash('heys', 'Закрытая задача');
  const files = [
    { path: 'projects/heys.md', text: STANDUP_HEYS },
    { path: 'days/2026-08-05.md', text: `# План\n- [x] 09:00–10:00 Было · heys/${closed}\n` },
  ];
  assert.deepEqual(tasks.findDivergences(files, { today: '2026-08-02' }), []);
});

test('пересечение слотов берётся у движка конфликтов, а не считается заново', () => {
  const day = (text) => [{ path: 'projects/heys.md', text: STANDUP_HEYS }, { path: 'days/2026-08-05.md', text }];
  // Два «фокуса» внахлёст — конфликт: двум делам в одно время нужна голова.
  const clash = tasks.findDivergences(day('# П\n- 10:00–12:00 Раз #фокус\n- 11:00–13:00 Два #фокус\n'), { today: '2026-08-02' });
  assert.equal(clash.length, 1);
  assert.equal(clash[0].kind, 'слоты пересеклись');
  // «Дело» — врезка внутри чего угодно, и движок конфликтом это не зовёт.
  assert.deepEqual(tasks.findDivergences(day('# П\n- 10:00–12:00 Раз #фокус\n- 11:00–11:15 Врезка #дело\n'), { today: '2026-08-02' }), []);
  // «Вопрос» — не конфликт: два фоновых блока подряд движок различить не берётся,
  // и на планёрку такое выносить нечего. В расхождения идёт только «конфликт».
  assert.equal(tasks.slotClashLevel('фон', 'фон'), 'вопрос');
  assert.deepEqual(tasks.findDivergences(day('# П\n- 10:00–12:00 Раз #фон\n- 11:00–13:00 Два #фон\n'), { today: '2026-08-02' }), []);
  assert.deepEqual(tasks.findDivergences(day('# П\n- 10:00–12:00 Раз #фокус\n- 11:00–13:00 Зарядка #привычка\n'), { today: '2026-08-02' }), []);
  // Смежные по краю слоты не пересекаются вовсе.
  assert.deepEqual(tasks.findDivergences(day('# П\n- 10:00–11:00 Раз #фокус\n- 11:00–12:00 Два #фокус\n'), { today: '2026-08-02' }), []);
});

test('#blocked без единого «открыто:» — задача занимает место вопроса, которого нет', () => {
  const withOpen = `# HEYS\n\n## Задачи\n\n- [ ] P2 Развилка #blocked ^2026-08-01\n  - открыто: какой вариант берём?\n`;
  assert.deepEqual(tasks.findDivergences([{ path: 'projects/heys.md', text: withOpen }], { today: '2026-08-02' }), []);

  const без = `# HEYS\n\n## Задачи\n\n- [ ] P2 Развилка #blocked ^2026-08-01\n  - просто заметка\n`;
  const found = tasks.findDivergences([{ path: 'projects/heys.md', text: без }], { today: '2026-08-02' });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'висит без вопроса');
  assert.equal(found[0].ref, `heys/${tasks.taskHash('heys', 'Развилка')}`);

  // Закрытая задача с тем же тегом расхождением не считается.
  const done = `# HEYS\n\n## Задачи\n\n- [x] P2 Развилка #blocked ^2026-08-01\n`;
  assert.deepEqual(tasks.findDivergences([{ path: 'projects/heys.md', text: done }], { today: '2026-08-02' }), []);
});

test('ссылка «см:» в несуществующую задачу видна, а живая — нет', () => {
  const live = tasks.taskHash('heys', 'Живая задача');
  const ok = `${STANDUP_HEYS}  - см: heys/${live} — та же тема\n`;
  assert.deepEqual(tasks.findDivergences([{ path: 'projects/heys.md', text: ok }], { today: '2026-08-02' }), []);

  const broken = `${STANDUP_HEYS}  - см: heys/000000 — в никуда\n`;
  const found = tasks.findDivergences([{ path: 'projects/heys.md', text: broken }], { today: '2026-08-02' });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'ссылка в никуда');
  assert.equal(found[0].ref, 'heys/000000');
});

test('прошедший срок без отметки назван, а будущий — нет', () => {
  const found = tasks.findDivergences([{ path: 'projects/heys.md', text: STANDUP_HEYS }], { today: '2026-08-25' });
  assert.deepEqual(found.map((d) => d.kind), ['срок прошёл']);
  assert.equal(found[0].ref, `heys/${tasks.taskHash('heys', 'Живая задача')}`);
  // Тот же файл на дату до срока — расхождения нет.
  assert.deepEqual(tasks.findDivergences([{ path: 'projects/heys.md', text: STANDUP_HEYS }], { today: '2026-08-02' }), []);
});

test('спор данных показывается раньше просрочки — иначе она вытеснит его из-под потолка', () => {
  const text = `# HEYS\n\n## Задачи\n\n${
    Array.from({ length: 6 }, (_, i) => `- [ ] P2 Просрочка ${i} due:2026-07-01 ^2026-06-01`).join('\n')
  }\n- [ ] P2 Висит #blocked ^2026-07-01\n`;
  const found = tasks.findDivergences([{ path: 'projects/heys.md', text }], { today: '2026-08-02' });
  assert.equal(found[0].kind, 'висит без вопроса', 'спор данных стоит первым');
  assert.equal(found.filter((d) => d.kind === 'срок прошёл').length, 6);
});

test('потолок группы держится и скрытое считается вслух', async () => {
  const many = `# HEYS\n\n## Задачи\n\n${
    Array.from({ length: 8 }, (_, i) => `- [ ] P2 Развилка ${i} #blocked ^2026-07-01\n  - открыто: какой вариант ${i}?`).join('\n')
  }\n`;
  const api = standupApi({ 'projects/heys.md': many });
  const res = await session(api).tasks_standup({});
  // #blocked и каждый «открыто:» — отдельные строки, как на доске: 8 + 8 = 16.
  assert.equal(res.structured.totals.decide, 16);
  assert.equal(res.structured.decide.length, tasks.STANDUP_GROUP_CAP);
  assert.equal(res.structured.hidden.decide, 16 - tasks.STANDUP_GROUP_CAP);
  assert.match(res.text, /остальное/);
  assert.match(res.text, new RegExp(`и ещё ${16 - tasks.STANDUP_GROUP_CAP}`));
});

test('потолок держится и на том, что он принёс сам', async () => {
  const api = standupApi();
  const tools = session(api);
  // Темы намеренно разные: похожие отсеются как повтор, и потолок останется
  // непроверенным.
  const topics = [
    'Отпуск: какие даты в силе',
    'Реклама: бюджет на август',
    'Аренда студии: продлевать ли',
    'Второй тренер: искать сейчас',
    'Дзюдо: третья тренировка',
    'Лендинг: какую версию берём',
    'Налоги: патент на следующий год',
  ];
  assert.ok(topics.length > tasks.STANDUP_GROUP_CAP, 'принесённого должно быть больше потолка');
  for (const topic of topics) {
    const res = await tools.tasks_standup({ add: topic });
    assert.equal(res.structured.created, true, `«${topic}» должна была лечь в повестку`);
  }
  const res = await session(api).tasks_standup({});
  assert.equal(res.structured.totals.brought_general, topics.length);
  assert.equal(res.structured.brought_general.length, tasks.STANDUP_GROUP_CAP);
  assert.equal(res.structured.hidden.brought_general, topics.length - tasks.STANDUP_GROUP_CAP);
});

test('принесённое делится на разработку и общее — по его решению 05.08 два отдельных блока', async () => {
  const api = standupApi();
  const dev = await session(api).tasks_standup({
    add: 'Стенограмма теряет обычные диалоговые обмены', category: 'разработка',
  });
  assert.equal(dev.structured.category, 'разработка');
  const general = await session(api).tasks_standup({ add: 'Купить свисток на студию' });
  assert.equal(general.structured.category, 'общее', 'без category ложится в общее по умолчанию');

  // «разработка» пишется в файл маркером, «общее» — молча, без засорения строки.
  const saved = api.file(tasks.STANDUP_PATH);
  assert.match(saved, /^- \[ \] 2026-08-02 · \[разработка\] Стенограмма теряет/m);
  assert.match(saved, /^- \[ \] 2026-08-02 · Купить свисток на студию$/m);

  const agenda = await session(api).tasks_standup({});
  assert.equal(agenda.structured.brought_dev.length, 1);
  assert.equal(agenda.structured.brought_dev[0].topic, 'Стенограмма теряет обычные диалоговые обмены');
  assert.equal(agenda.structured.brought_general.length, 1);
  assert.equal(agenda.structured.brought_general[0].topic, 'Купить свисток на студию');
  assert.match(agenda.text, /Принесли на планёрку — разработка/);
  assert.match(agenda.text, /Принесли на планёрку — общее/);
});

test('recategorize переносит пункт тем же матчером что done, без потери note/priority', async () => {
  const api = standupApi();
  await session(api).tasks_standup({
    add: 'Стенограмма теряет обычные диалоговые обмены',
    category: 'разработка',
    note: 'см: heys/abc123',
    priority: 'P1',
    session: 'механика повестки',
  });
  await session(api).tasks_standup({ add: 'Купить свисток на студию' });

  const moved = await session(api).tasks_standup({
    recategorize: 'свисток',
    category: 'разработка',
  });
  assert.equal(moved.structured.changed, true);
  assert.equal(moved.structured.previous, 'общее');
  assert.equal(moved.structured.category, 'разработка');
  assert.match(api.file(tasks.STANDUP_PATH), /^- \[ \] 2026-08-02 · \[разработка\] Купить свисток на студию$/m);

  const back = await session(api).tasks_standup({
    recategorize: 'Стенограмма теряет',
    category: 'общее',
  });
  assert.equal(back.structured.changed, true);
  assert.equal(back.structured.previous, 'разработка');
  // Маркер снят, note/priority/session на месте.
  assert.match(
    api.file(tasks.STANDUP_PATH),
    /^- \[ \] 2026-08-02 · \[P1\] \[тема:механика повестки\] Стенограмма теряет обычные диалоговые обмены — см: heys\/abc123$/m,
  );

  const noop = await session(api).tasks_standup({
    recategorize: 'свисток',
    category: 'разработка',
  });
  assert.equal(noop.structured.changed, false);

  await assert.rejects(
    () => session(api).tasks_standup({ recategorize: 'свисток' }),
    (err) => err.code === 'invalid_category',
  );
  await assert.rejects(
    () => session(api).tasks_standup({ recategorize: 'нет такого пункта', category: 'общее' }),
    (err) => err.code === 'standup_item_not_found',
  );
});

test('recategorize при двух совпадениях требует уточнения', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Купить свисток на студию' });
  await session(api).tasks_standup({ add: 'Купить свисток запасной', category: 'разработка' });
  await assert.rejects(
    () => session(api).tasks_standup({ recategorize: 'свисток', category: 'общее' }),
    (err) => err.code === 'ambiguous_standup_item',
  );
});

test('старый пункт повестки без маркера категории читается как общее', () => {
  const file = { path: tasks.STANDUP_PATH, text: '## На планёрку\n\n- [ ] 2026-08-01 · Довоенный пункт без категории\n' };
  const items = tasks.parseStandupItems(file);
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'общее');
  assert.equal(items[0].topic, 'Довоенный пункт без категории');
});

test('приоритет пункта повестки тянется из задачи по ref, если не назван явно', async () => {
  const heysHash = tasks.taskHash('heys', 'Живая задача');
  const api = standupApi();
  await session(api).tasks_standup({
    add: 'Прогнать флоу перед релизом', category: 'разработка', note: `см: heys/${heysHash}`,
  });
  await session(api).tasks_standup({ add: 'Купить свисток на студию' });
  const agenda = await session(api).tasks_standup({});
  const linked = agenda.structured.brought_dev.find((i) => i.topic === 'Прогнать флоу перед релизом');
  assert.equal(linked.priority, null, 'явного маркера в строке нет');
  assert.equal(linked.ref, `heys/${heysHash}`);
  // «Живая задача» в STANDUP_HEYS — P1, значит эффективный приоритет от неё.
  assert.equal(linked.effective_priority, 'P1');
  const plain = agenda.structured.brought_general.find((i) => i.topic === 'Купить свисток на студию');
  assert.equal(plain.effective_priority, 'P2', 'без ref и без явного маркера — дефолт P2');
});

test('явный приоритет пункта повестки побеждает над приоритетом задачи по ref', async () => {
  const heysHash = tasks.taskHash('heys', 'Живая задача');
  const api = standupApi();
  await session(api).tasks_standup({
    add: 'Обсудить нюансы вместе с heys/' + heysHash, category: 'разработка', priority: 'P3',
  });
  const saved = api.file(tasks.STANDUP_PATH);
  assert.match(saved, /^- \[ \] 2026-08-02 · \[разработка\] \[P3\] Обсудить нюансы/m);
  const agenda = await session(api).tasks_standup({});
  const item = agenda.structured.brought_dev[0];
  assert.equal(item.priority, 'P3');
  assert.equal(item.effective_priority, 'P3', 'явный приоритет сильнее ref на P1-задачу');
});

test('пункты повестки сортируются по приоритету внутри категории, при равенстве — по порядку добавления', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Третий по счёту, без приоритета', category: 'общее' });
  await session(api).tasks_standup({ add: 'Первый по приоритету', category: 'общее', priority: 'P1' });
  await session(api).tasks_standup({ add: 'Четвёртый по счёту, тоже без приоритета', category: 'общее' });
  await session(api).tasks_standup({ add: 'Второй по приоритету', category: 'общее', priority: 'P1' });
  const agenda = await session(api).tasks_standup({});
  assert.deepEqual(agenda.structured.brought_general.map((i) => i.topic), [
    'Первый по приоритету',
    'Второй по приоритету',
    'Третий по счёту, без приоритета',
    'Четвёртый по счёту, тоже без приоритета',
  ]);
});

test('tasks_standup add отклоняет неверный приоритет', async () => {
  const api = standupApi();
  await assert.rejects(
    () => session(api).tasks_standup({ add: 'Пункт с плохим приоритетом', priority: 'P9' }),
    (e) => e.code === 'invalid_priority',
  );
});

test('тема пункта повестки пишется меткой в файл и парсится обратно', async () => {
  const api = standupApi();
  await session(api).tasks_standup({
    add: 'Промпт для Codex готов', category: 'разработка', session: 'PWA доски',
  });
  const saved = api.file(tasks.STANDUP_PATH);
  assert.match(saved, /^- \[ \] 2026-08-02 · \[разработка\] \[тема:PWA доски\] Промпт для Codex готов$/m);
  const agenda = await session(api).tasks_standup({});
  assert.equal(agenda.structured.brought_dev[0].session, 'PWA доски');
});

test('пункты одной темы в повестке рисуются одним блоком с подзаголовком', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Первый про PWA', category: 'разработка', session: 'PWA доски' });
  await session(api).tasks_standup({ add: 'Отдельный пункт без темы', category: 'разработка' });
  await session(api).tasks_standup({ add: 'Второй про PWA', category: 'разработка', session: 'PWA доски' });
  const agenda = await session(api).tasks_standup({});
  assert.match(agenda.text, /тема «PWA доски»:\n {2}- Первый про PWA[\s\S]*?\n {2}- Второй про PWA/);
  assert.match(agenda.text, /- Отдельный пункт без темы/);
});

test('пункт без темы читается как session: null', () => {
  const file = { path: tasks.STANDUP_PATH, text: '## На планёрку\n\n- [ ] 2026-08-01 · Пункт без темы\n' };
  const items = tasks.parseStandupItems(file);
  assert.equal(items[0].session, null);
});

test('посчитанные расхождения потолком не режутся — они доказуемы', async () => {
  const many = `# HEYS\n\n## Задачи\n\n${
    Array.from({ length: 8 }, (_, i) => `- [ ] P2 Висит ${i} #blocked ^2026-07-01`).join('\n')
  }\n`;
  // Без файла дня: здесь считается ровно восемь расхождений одного вида.
  const api = liveApi({ [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: many, rev: 1, updatedAt: 1 } });
  const res = await session(api).tasks_standup({});
  assert.equal(res.structured.totals.divergences, 8);
  assert.equal(res.structured.divergences.length, 8, 'доказанное не прячется ради длины');
  assert.equal(res.structured.hidden.divergences, 0);
});

test('зависшее обещание считается по дате, а свежее не считается вовсе', () => {
  const text = `# Семья\n\n## Задачи\n\n- [>] P2 Забрать зеркало ^2026-07-01\n  - ждём: Даня — привезёт, с 2026-07-01\n- [>] P2 Второе ^2026-08-01\n  - ждём: Маша — ответит, с 2026-08-01\n`;
  const found = tasks.stuckPromises([{ path: 'projects/family.md', text }], { today: '2026-08-02' });
  assert.equal(found.length, 1, 'вчерашнее обещание зависшим не считается');
  assert.equal(found[0].days, 32);
  assert.match(found[0].text, /Даня/);
});

test('обещание без даты возрастом не наделяется', () => {
  const text = '# Семья\n\n## Задачи\n\n- [>] P2 Без даты\n  - ждём: Даня — привезёт\n';
  assert.deepEqual(tasks.stuckPromises([{ path: 'projects/family.md', text }], { today: '2026-08-02' }), []);
});

test('вопрос кладётся на планёрку заранее и утром всплывает в повестке', async () => {
  const api = standupApi();
  const put = await session(api).tasks_standup({ add: 'Отпуск 16–19: даты снова открыли', note: 'сказал «обсудим на планёрке»' });
  assert.equal(put.structured.created, true);
  assert.match(api.file(tasks.STANDUP_PATH), /^- \[ \] 2026-08-02 · Отпуск 16–19: даты снова открыли — сказал/m);

  const agenda = await session(api).tasks_standup({});
  assert.equal(agenda.structured.empty, false);
  assert.equal(agenda.structured.brought_general.length, 1);
  assert.equal(agenda.structured.brought_general[0].topic, 'Отпуск 16–19: даты снова открыли');
  assert.match(agenda.text, /Принесли на планёрку/);
});

test('обсуждённый пункт снимается и в повестке больше не всплывает', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Отпуск 16–19: даты снова открыли' });
  await session(api).tasks_standup({ add: 'Кто ведёт вторую смену' });

  const off = await session(api).tasks_standup({ done: 'отпуск' });
  assert.equal(off.structured.left, 1);
  assert.match(api.file(tasks.STANDUP_PATH), /^- \[x\] 2026-08-02 · Отпуск/m, 'снятое видно в файле галочкой, а не стёрто');

  const agenda = await session(api).tasks_standup({});
  assert.deepEqual(agenda.structured.brought_general.map((i) => i.topic), ['Кто ведёт вторую смену']);
});

test('тот же вопрос на планёрку второй раз не кладётся', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Кто ведёт вторую смену в субботу' });
  const again = await session(api).tasks_standup({ add: 'Кто ведёт вторую смену в субботу' });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'duplicate');
  assert.equal(tasks.parseStandupItems({ text: api.file(tasks.STANDUP_PATH) }).length, 1);
});

test('снять пункт по неоднозначным словам инструмент отказывается', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Смена в субботу' });
  await session(api).tasks_standup({ add: 'Смена в воскресенье' });
  await assert.rejects(() => session(api).tasks_standup({ done: 'смена' }), (e) => e.code === 'ambiguous_standup_item');
  await assert.rejects(() => session(api).tasks_standup({ done: 'ремонт' }), (e) => e.code === 'standup_item_not_found');
});

test('повестка: «Требует решения» группируется как на доске', async () => {
  const withOpen = `# HEYS\n\n## Задачи\n\n- [ ] P2 Развилка #blocked ^2026-08-01\n  - открыто: А или Б?\n- [ ] P2 Долгое due:2026-08-01 ^2026-08-02\n  - открыто: когда начнём?\n`;
  const api = standupApi({ 'projects/heys.md': withOpen });
  const agenda = await session(api).tasks_standup({});
  assert.match(agenda.text, /важное:/);
  assert.match(agenda.text, /быстро решается:/);
  assert.match(agenda.text, /А или Б/);
  assert.equal(agenda.structured.decide_groups.totals.quick, 1);
  assert.equal(agenda.structured.decide_groups.totals.hot, 1);
  assert.ok(agenda.structured.decide.length >= 2, 'blocked и открытый вопрос — отдельные строки');
});

test('buildDecideGroups: stKind зеркалит доску', () => {
  const grouped = tasks.buildDecideGroups({
    blockedTasks: [{
      ref: 'heys/aaaaaa', title: 'Срочное', tags: ['blocked'], children: [],
      due: '2026-08-07', done: false,
    }],
    openQuestions: [{
      ref: 'heys/bbbbbb', task: 'Выбор', question: 'А или Б?', due: null, done: false,
    }],
    today: '2026-08-07',
    dayText: '',
  });
  assert.equal(grouped.hot.length, 1);
  assert.equal(grouped.quick.length, 1);
  assert.equal(grouped.rest.length, 0);
});

test('планёрка объявлена и в схемах, и обработчиком', () => {
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  const schema = built.schemas.find((s) => s.name === 'tasks_standup');
  assert.ok(schema, 'без схемы модель инструмента не увидит');
  assert.equal(schema.inputSchema.type, 'object');
  assert.equal(typeof built.tools.tasks_standup, 'function');
  for (const arg of ['add', 'done', 'sleep', 'sleep_days']) assert.ok(schema.inputSchema.properties[arg], `${arg} объявлен`);
});

// ── Ревизия стенограмм перед повесткой ───────────────────────────────────
//
// Повестка собрана только из того, что уже заведено. Всё, что за день обсудили
// и не завели, до неё не доходило вовсе и пропадало молча — а осталось оно
// ровно в одном месте, в стенограмме.
//
// Отметка о сверке лежит в самом файле стенограммы: она отвечает на «где
// кончилось прочитанное», а не на «сверяли ли сегодня». Разница видна на трёх
// случаях, и все три проверяются ниже: вторая планёрка за день, ночная работа
// во вчерашнем файле и пропущенная планёрка.
//
// Сравнивать код здесь не пытается и не будет: «это уже завели» — суждение о
// смысле. Он приносит материал и подсказывает кандидатов; проверяется, что
// материал верный, а шаг нельзя пропустить молча.

const DAY_TRANSCRIPT = `## 09:10

**Кин:** Давай сегодня разберём склад.

**Claude:** Записал.

## 11:40–12:05

**Кин:** И не забудь про глазок, сегодня последний день возврата.
`;

/** Сегодня в тестах — 2026-08-02: стенограмма дня лежит по этой дате. */
const DAY_TRANSCRIPT_PATH = 'transcript/2026-08-02.md';
const YESTERDAY_TRANSCRIPT_PATH = 'transcript/2026-08-01.md';

/** Отметка о сверке — той же функцией, которой её пишет инструмент. */
const MARK = (summary, time = '08:00', date = '2026-08-02') =>
  tasks.reviewMarkBlock({ date, time, summary });

test('ревизия идёт первым блоком и показывает несверенный хвост', async () => {
  const res = await session(standupApi({ [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT })).tasks_standup({});

  // Первый блок после шапки: заводить найденное надо ДО повестки, иначе
  // повестка соберётся без него.
  assert.match(res.text.split('\n\n')[1], /^Ревизия — до повестки/, 'ревизия стоит перед повесткой, а не в хвосте');
  assert.match(res.text, /transcript\/2026-08-02\.md/);
  assert.match(res.text, /tasks_read/, 'сказано, чем читать — иначе шаг остаётся пожеланием');
  assert.match(res.text, /отметок нет — файл целиком/, 'первая ревизия читает файл с начала');

  const review = res.structured.day_review;
  assert.equal(review.needed, true);
  assert.equal(review.today_missing, false);
  assert.equal(review.window_days, tasks.REVIEW_WINDOW_DAYS);
  assert.equal(review.days.length, 1, 'несверенный хвост ровно у одного дня');
  assert.equal(review.days[0].path, DAY_TRANSCRIPT_PATH);
  assert.equal(review.days[0].sections, 2, 'два обмена за день');
  assert.equal(review.days[0].last_entry, '11:40–12:05', 'время последней записи — из её заголовка');
  assert.equal(review.days[0].marks, 0);
});

test('хвост берётся после отметки посреди файла, а не с начала', async () => {
  const text = `## 09:10

**Кин:** Разберём склад.

${MARK('склад заведён задачей')}

## 15:20

**Кин:** И ещё про глазок.
`;
  const res = await session(standupApi({ [DAY_TRANSCRIPT_PATH]: text })).tasks_standup({});
  const day = res.structured.day_review.days[0];
  assert.equal(day.sections, 1, 'прочитанный до отметки обмен в хвост не входит');
  assert.equal(day.last_entry, '15:20');
  assert.equal(day.marks, 1);
  assert.deepEqual(day.last_mark, { date: '2026-08-02', time: '08:00', summary: 'склад заведён задачей' });

  // Прямо по разбору: выше отметки не осталось ничего.
  const tail = tasks.transcriptTail(text);
  assert.ok(!/склад/i.test(tail.text), 'сверенный текст в хвост не возвращается');
  assert.match(tail.text, /глазок/);
});

test('итог, перенесённый на несколько строк, не всплывает как несверенный текст', () => {
  // Живой формат: reviewMarkLine пишет одну строку, но ручная запись (как
  // сегодня ночью через tasks_append) переносит длинный итог на несколько.
  const text = `## 14:00

**Кин:** Договорились на подмену.

## 22:07

**Сверено с доской** · 2026-08-03 22:07 · Потерь не найдено — все решения дня
уже отражены в projects/ и GOALS.md, часть позже пересмотрена и
актуализирована аудитом.

## 23:00

**Кин:** Новый обмен уже после отметки.
`;
  const tail = tasks.transcriptTail(text);
  assert.equal(tail.marks, 1);
  assert.ok(!/отражены в projects/.test(tail.text), 'продолжение итога — не хвост');
  assert.match(tail.text, /Новый обмен уже после отметки/);
  assert.match(tail.last_mark.summary, /актуализирована аудитом/, 'продолжение попало в итог целиком');
});

test('отметок несколько — считается последняя, а не первая', () => {
  const text = `## 09:10

**Кин:** Первое.

${MARK('утро сверено', '09:30')}

## 12:00

**Кин:** Второе.

${MARK('день сверен', '13:00')}

## 18:00

**Кин:** Третье.
`;
  const tail = tasks.transcriptTail(text);
  assert.equal(tail.marks, 2);
  assert.equal(tail.last_mark.time, '13:00', 'граница прочитанного — последняя отметка');
  assert.ok(!/Второе/.test(tail.text), 'текст между отметками уже сверен');
  assert.match(tail.text, /Третье/);
});

test('отметка в последней строке — хвост пуст, и день в блок не идёт', async () => {
  const text = `${DAY_TRANSCRIPT}\n${MARK('ничего не потеряно')}\n`;
  const res = await session(standupApi({ [DAY_TRANSCRIPT_PATH]: text })).tasks_standup({});
  assert.equal(res.structured.day_review.days.length, 0, 'сверенный день второй раз не просят');
  assert.equal(res.structured.day_review.needed, false);
  assert.ok(!/Ревизия — до повестки/.test(res.text));
  assert.equal(tasks.dayReviewBlock(res.structured.day_review), null);
});

test('стенограммы за сегодня нет вовсе — это находка, а не тишина', async () => {
  // В базовом наборе стенограммы нет вовсе: разговор за день не записан, и
  // сверять ревизии не с чем. Промолчать здесь значит потерять день целиком.
  const res = await session(standupApi()).tasks_standup({});

  assert.match(res.text, /Ревизия — до повестки: стенограммы за сегодня нет вовсе/);
  assert.equal(res.structured.day_review.today_missing, true);
  assert.equal(res.structured.day_review.needed, true);
  assert.equal(res.structured.day_review.days.length, 0);
});

// ── Причины из «Закрыть день» — та же ревизия, отдельная категория ────────
//
// Решено 05.08: не гадание кандидатов (те про стенограмму), а прямая цитата
// его слов из «Закрыть день» — «причина словами» под слотом или у снятого
// слота. Разбирается КАЖДУЮ планёрку, вместе с хвостом стенограммы, а не раз
// в неделю — иначе теряет актуальность к моменту, когда до неё дойдут руки.

const TODAY_DAY_PATH = 'days/2026-08-02.md';

test('причина из «Закрыть день» попадает в ревизию отдельной категорией', async () => {
  // Слот снят («отменилось») — причина ложится самодостаточной строкой со
  // временем и названием, слота над ней уже нет. Формат «Закрыть день» пишет
  // именно так — dayFileReasons отдаёт строку как есть, не пытаясь её резать.
  const dayText = `# План на 2026-08-02
  - 16:00 Дзюдо — даня не захотел, возможно карате
`;
  const res = await session(standupApi({ [TODAY_DAY_PATH]: dayText })).tasks_standup({});
  assert.match(res.text, /Причины из закрытых дней \(1\)/);
  assert.match(res.text, /даня не захотел, возможно карате/);
  const reasons = res.structured.day_review.day_reasons;
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].date, '2026-08-02');
  assert.equal(reasons[0].path, TODAY_DAY_PATH);
  assert.equal(reasons[0].text, '16:00 Дзюдо — даня не захотел, возможно карате');
});

test('подзадачи и ждём:/при встрече:/открыто:/см: причинами не считаются', async () => {
  const dayText = `# План на 2026-08-02
- 16:00-17:30 Студия: замер · kinderly/3f4e12
  - [ ] Собрать каркас
  - ждём: Маша — реквизит к среде
  - при встрече: Кин — обсудить цвет
  - открыто: нужен ли второй заезд
  - см: heys/abc123
  - есть размеры и фото
`;
  const res = await session(standupApi({ [TODAY_DAY_PATH]: dayText })).tasks_standup({});
  const reasons = res.structured.day_review.day_reasons;
  assert.equal(reasons.length, 1, 'только настоящая причина, остальное — структурные строки');
  assert.equal(reasons[0].text, 'есть размеры и фото');
});

test('причина без стенограммы поднимает ревизию без ложного «стенограммы нет»', async () => {
  // Стенограмма за сегодня в базовом наборе отсутствует вовсе — обычно это
  // отдельная находка («стенограммы нет»), но если ревизию подняла причина
  // дня, а не хвост, ложного текста про пустую стенограмму быть не должно.
  const dayText = `# План на 2026-08-02
  - 09:00 Зарядка — не в форме, перенёс
`;
  const res = await session(standupApi({ [TODAY_DAY_PATH]: dayText })).tasks_standup({});
  assert.match(res.text, /Причины из закрытых дней \(1\)/);
});

test('reviewed ставит отметку и в день с причиной, вторая ревизия её не повторяет', async () => {
  const dayText = `# План на 2026-08-02
  - 16:00 Дзюдо — даня не захотел, возможно карате
`;
  const api = standupApi({ [TODAY_DAY_PATH]: dayText });
  const before = await session(api).tasks_standup({});
  assert.equal(before.structured.day_review.day_reasons.length, 1);

  const mark = await session(api).tasks_standup({ reviewed: 'причина по дзюдо — карате обсудим отдельно' });
  assert.equal(mark.structured.day_review.marked.length, 1);
  assert.equal(mark.structured.day_review.marked[0].path, TODAY_DAY_PATH);
  assert.equal(mark.structured.day_review.marked[0].kind, 'причины дня');
  assert.match(api.file(TODAY_DAY_PATH), /\*\*Сверено с доской\*\* · 2026-08-02/);
  assert.ok(!/^##\s/m.test(api.file(TODAY_DAY_PATH)), 'в дне нет постороннего заголовка «## ЧЧ:ММ»');

  const after = await session(api).tasks_standup({});
  assert.equal(after.structured.day_review.day_reasons.length, 0, 'сверенная причина второй раз не просится');
});

test('хвост вчерашнего файла приезжает вместе с сегодняшним', async () => {
  // Работа до двух ночи попадает во вчерашний файл, а планёрку могли
  // пропустить. Память прохода на это отвечала «сегодня уже сверено».
  const api = standupApi({
    [YESTERDAY_TRANSCRIPT_PATH]: '## 23:40\n\n**Кин:** Ночью решили про потолок.\n',
    [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT,
  });
  const res = await session(api).tasks_standup({});
  assert.deepEqual(
    res.structured.day_review.days.map((d) => d.date),
    ['2026-08-02', '2026-08-01'],
    'оба дня в блоке, свежий сверху',
  );
  assert.match(res.text, /transcript\/2026-08-01\.md/);
});

test('reviewed дописывает отметку в конец каждого несверенного файла', async () => {
  const api = standupApi({
    [YESTERDAY_TRANSCRIPT_PATH]: '## 23:40\n\n**Кин:** Ночью решили про потолок.\n',
    [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT,
  });
  const mark = await session(api).tasks_standup({ reviewed: 'глазок не был заведён — поставил напоминание' });

  assert.deepEqual(
    mark.structured.day_review.marked.map((m) => m.path).sort(),
    [YESTERDAY_TRANSCRIPT_PATH, DAY_TRANSCRIPT_PATH],
    'отмечены оба файла, чей хвост читали',
  );
  for (const path of [YESTERDAY_TRANSCRIPT_PATH, DAY_TRANSCRIPT_PATH]) {
    const saved = api.file(path);
    assert.match(saved, /\*\*Сверено с доской\*\* · 2026-08-02 15:00 · глазок не был заведён/, `${path}: отметка с временем и итогом`);
    assert.match(saved, /## 15:00\n\n\*\*Сверено с доской\*\*/, `${path}: у отметки свой заголовок-время`);
  }

  // Новая сборка инструментов — это новая сессия: отметка лежит в файле, а не
  // в замыкании, и второй чат за утро ревизии заново не требует.
  const after = await session(api).tasks_standup({});
  assert.ok(!/Ревизия — до повестки/.test(after.text));
  assert.equal(after.structured.day_review.needed, false);
  assert.equal(after.structured.day_review.days.length, 0);
});

test('после отметки сверяется только дописанное, а не день заново', async () => {
  const api = standupApi({ [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT });
  await session(api).tasks_standup({ reviewed: 'ничего не потеряно' });
  await session(api).tasks_append({
    path: DAY_TRANSCRIPT_PATH,
    block: '## 19:30\n\n**Кин:** Вечером договорились про потолок.',
  });

  const evening = await session(api).tasks_standup({});
  const day = evening.structured.day_review.days[0];
  assert.equal(day.sections, 1, 'вечерняя планёрка читает только вечерний обмен');
  assert.equal(day.last_entry, '19:30');
  assert.equal(day.last_mark.summary, 'ничего не потеряно');
});

test('отметка не ломает формат стенограммы: её заголовок — время', () => {
  const block = tasks.reviewMarkBlock({ date: '2026-08-02', time: '9:05', summary: 'пусто' });
  assert.equal(tasks.transcriptHeadingError(DAY_TRANSCRIPT_PATH, block), null, 'иначе tasks_append отклонит собственную отметку');
  assert.match(block, /^## 09:05$/m, 'время приведено к каноническому виду');
  assert.match(block.split('\n').pop(), tasks.REVIEW_MARK_RE, 'отметка находится тем же выражением, что её ищет разбор');
});

test('отмечать нечего, когда несверенного хвоста нет', async () => {
  const api = standupApi({ [DAY_TRANSCRIPT_PATH]: `${DAY_TRANSCRIPT}\n${MARK('уже сверено')}\n` });
  const before = api.file(DAY_TRANSCRIPT_PATH);
  const res = await session(api).tasks_standup({ reviewed: 'ещё раз посмотрел' });
  assert.deepEqual(res.structured.day_review.marked, []);
  assert.equal(api.file(DAY_TRANSCRIPT_PATH), before, 'вторая отметка подряд файл не трогает');
});

test('отметка без итога не принимается: галочку ставят не читая', async () => {
  const api = standupApi({ [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT });
  await assert.rejects(
    () => session(api).tasks_standup({ reviewed: '   ' }),
    (e) => e.code === 'invalid_reviewed',
  );
  assert.equal(api.file(DAY_TRANSCRIPT_PATH), DAY_TRANSCRIPT, 'пустая отметка в файл не попадает');
});

test('память прохода про ревизию не хранит ничего', () => {
  // Дата в памяти отвечала одинаково неверно на вторую планёрку за день, на
  // ночную работу во вчерашнем файле и на пропущенную планёрку.
  const state = tasks.ensureState({ day_review: { date: '2026-08-02', summary: 'старое' } });
  assert.ok(!('day_review' in state), 'мёртвое поле не переносится из старой памяти');
  assert.equal(typeof tasks.markDayReview, 'undefined', 'записывать в память больше нечем');
});

test('размер хвоста считается по обменам, а не по разметке', () => {
  const shape = tasks.transcriptShape(DAY_TRANSCRIPT);
  assert.equal(shape.sections, 2);
  assert.equal(shape.lines, 5, 'пустые строки между блоками — это разметка, а не разговор');
  assert.equal(shape.last_entry, '11:40–12:05');

  // Старые стенограммы писались темой, а не временем: время появилось позже
  // файлов. Выдумывать его вместо пропуска нельзя.
  const byTopic = tasks.transcriptShape('## Планерка · склад\n\nтекст\n');
  assert.equal(byTopic.sections, 1);
  assert.equal(byTopic.last_entry, null);
});

test('служебный вызов планёрки блок ревизии не приносит', async () => {
  // add / done / observe — это реплики посреди разговора, а не начало утра.
  // Блок, который приходит на каждый чих, перестают читать первым.
  const api = standupApi({ [DAY_TRANSCRIPT_PATH]: DAY_TRANSCRIPT });
  const added = await session(api).tasks_standup({ add: 'обсудить склад' });
  assert.ok(!/Ревизия — до повестки/.test(added.text));
  assert.equal(added.structured.day_review, undefined);

  const done = await session(api).tasks_standup({ done: 'склад' });
  assert.ok(!/Ревизия — до повестки/.test(done.text));

  const observed = await session(api).tasks_standup({
    observe: 'В днях стоит созвон, а в задаче срок другой?',
    sides: ['days/2026-08-03.md: 10:00 Созвон', 'projects/heys.md: due:2026-08-20'],
  });
  assert.ok(!/Ревизия — до повестки/.test(observed.text));
});

// ── Кандидаты на потерю ──────────────────────────────────────────────────
//
// Ревизия целиком держалась на внимании: код приносил текст, сравнивал человек.
// Кандидаты страхуют от невнимательности — и ровно поэтому названы кандидатами:
// код видит только, что похожего в задачнике нет, и не знает, завели это или
// нет. Ложное срабатывание тут дешевле пропуска, но врать нельзя в обе стороны.

const CANDIDATE_FILES = [
  {
    path: 'projects/heys.md',
    text: '# HEYS\n\n## Задачи\n\n- [ ] P1 Позвонить Ивану due:2026-08-10\n  - открыто: брать ли второй монитор?\n',
  },
  { path: 'days/2026-08-05.md', text: '# План\n\n- 10:00–11:00 Созвон #дело\n' },
  { path: 'docs/reminders.md', text: '# Напоминания\n\n## Напоминания\n\n- [ ] 2026-08-06 14:00 · забрать заказ\n' },
];
const CANDIDATE_MONEY = { '2026-08': '# Август\n\n- 01 -1200 еда ~family\n' };
const CANDIDATE_CTX = {
  files: CANDIDATE_FILES,
  money: CANDIDATE_MONEY,
  openQuestions: tasks.collectOpenQuestions([CANDIDATE_FILES[0]]),
  today: '2026-08-02',
};

const CANDIDATE_TAIL = [{
  date: '2026-08-02',
  text: `## 14:00

**Кин:** Договорились с Машей на подмену. Автомат стоит 340 тысяч, брать не будем. Встречаемся 09.09 в 07:30. Отдать ключи Маше не забудь. Ставим ли лимиты бюджета в конце августа?
`,
}];

test('кандидаты вытаскивают из хвоста имя, сумму, время и вопрос', () => {
  const found = tasks.reviewCandidates(CANDIDATE_TAIL, CANDIDATE_CTX);

  // «Машей» и «Маше» — один человек: дубль снимается по основе, иначе одно имя
  // в трёх падежах съедает весь потолок.
  assert.deepEqual(found.people.map((p) => p.quote), ['Машей'], 'имя без задачи, слота и напоминания — одной строкой');
  assert.equal(found.money.length, 1);
  assert.equal(found.money[0].amount, 340000, '«340 тысяч» — это 340000, а не 340');
  assert.match(found.money[0].what, /проверь/, 'сумма названа кандидатом, а не потерянной тратой');
  assert.deepEqual(found.time.map((t) => t.quote).sort(), ['07:30', '09.09']);
  assert.equal(found.questions.length, 1);
  assert.match(found.questions[0].quote, /лимиты бюджета/);
  assert.equal(found.total, 5);
});

test('кандидат замолкает, когда пара в задачнике нашлась', () => {
  const files = [
    { ...CANDIDATE_FILES[0], text: `${CANDIDATE_FILES[0].text}- [ ] P2 Подмена с Машей ^2026-08-02\n  - открыто: ставим ли лимиты бюджета в конце августа?\n` },
    // Слот на названный день есть, но не на названный час: дата замолкает,
    // час — нет. Иначе «встретимся 09.09 в 07:30» закрывалось бы чужим слотом.
    { path: 'days/2026-09-09.md', text: '# План\n\n- 09:00–10:00 Встреча #дело\n' },
    CANDIDATE_FILES[2],
  ];
  const found = tasks.reviewCandidates(CANDIDATE_TAIL, {
    files,
    money: { '2026-08': '# Август\n\n- 02 -340000 автомат ~studio\n' },
    openQuestions: tasks.collectOpenQuestions([files[0]]),
    today: '2026-08-02',
  });
  assert.deepEqual(found.people, [], 'имя нашлось в задаче — молчим');
  assert.deepEqual(found.money, [], 'сумма нашлась в деньгах — молчим');
  assert.deepEqual(found.questions, [], 'вопрос помечен «открыто:» — молчим');
  assert.deepEqual(found.time.map((t) => t.quote), ['07:30'], 'дата нашла слот, час — нет: молчит только дата');
});

test('подписи говорящего и заголовки в кандидаты не идут', () => {
  // «**Кин:**» стоит в каждом втором абзаце, а «## 14:00» — это разметка.
  // Без вычистки блок кандидатов состоял бы из них одних.
  const found = tasks.reviewCandidates(
    [{ date: '2026-08-02', text: '## 14:00\n\n**Кин:** Ничего особенного.\n\n**Claude:** Записал.\n' }],
    CANDIDATE_CTX,
  );
  assert.deepEqual(found.people, []);
  assert.deepEqual(found.time, []);
});

test('вопрос из цитаты вынимается целиком и без подписи', () => {
  // Разговор наполовину состоит из цитат. Без границы по кавычке два вопроса
  // подряд слипались в один, а подпись «Его слова:» уезжала внутрь цитаты —
  // и такой «вопрос» уже ни на что на доске не похож.
  const found = tasks.reviewCandidates(
    [{ date: '2026-08-02', text: 'Его слова: «А почему правила пришли обрезанными?» «Как этого избежать?»\n' }],
    CANDIDATE_CTX,
  );
  assert.deepEqual(
    found.questions.map((q) => q.quote),
    ['А почему правила пришли обрезанными?', 'Как этого избежать?'],
  );
});

test('мелкие суммы и заглавная в начале предложения кандидатами не становятся', () => {
  const found = tasks.reviewCandidates(
    [{ date: '2026-08-02', text: 'Кофе взяли за 90 руб. Потолок красить не будем.\n' }],
    CANDIDATE_CTX,
  );
  assert.deepEqual(found.money, [], 'девяносто рублей — это шум, а не потеря');
  assert.deepEqual(found.people, [], '«Потолок» после точки — грамматика, а не имя');
});

test('у кандидатов есть потолок, и отброшенные посчитаны', () => {
  const names = ['Марине', 'Олегу', 'Тимуру', 'Ларисе', 'Егору', 'Ксении', 'Руслану'];
  const found = tasks.reviewCandidates(
    [{ date: '2026-08-02', text: `Договорились с ${names.join(', с ')}.\n` }],
    CANDIDATE_CTX,
  );
  assert.equal(found.people.length, tasks.REVIEW_CANDIDATE_CAP);
  assert.equal(found.dropped.people, names.length - tasks.REVIEW_CANDIDATE_CAP);
});

test('кандидатов нет — раздела в блоке тоже нет', () => {
  const empty = tasks.emptyReviewCandidates();
  assert.equal(tasks.reviewCandidateLines(empty), null, 'пустой раздел учит пролистывать блок целиком');
  const status = tasks.dayReviewStatus(
    [{ date: '2026-08-02', file: { path: DAY_TRANSCRIPT_PATH, text: DAY_TRANSCRIPT } }],
    { date: '2026-08-02' },
  );
  assert.ok(!/Кандидаты/.test(tasks.dayReviewBlock(status)));
});

test('деньги и напоминания доезжают до кандидатов и гасят их', async () => {
  // Оба файла читаются только ради этого блока и в разбор задачника не идут:
  // строки напоминаний похожи на задачи. Если их не довезти, кандидат будет
  // спрашивать про то, что уже записано, — и его перестанут читать первым.
  const api = standupApi({
    'docs/reminders.md': '# Напоминания\n\n## Напоминания\n\n- [ ] 2026-08-06 14:00 · забрать заказ\n',
    [DAY_TRANSCRIPT_PATH]: '## 09:00\n\n**Кин:** Подушку положили 10000 руб, встречаемся в 14:00, а ещё нужен глазок за 3500 руб.\n',
  });
  const res = await session(api).tasks_standup({});
  const found = res.structured.day_review.candidates;
  assert.deepEqual(found.money.map((m) => m.amount), [3500], '10000 записано в деньгах — молчим, 3500 нет — спрашиваем');
  assert.deepEqual(found.time, [], '14:00 стоит напоминанием — молчим');
});

test('кандидаты приезжают вместе с блоком и названы подсказкой, а не находкой', async () => {
  const api = standupApi({
    [DAY_TRANSCRIPT_PATH]: '## 14:00\n\n**Кин:** Договорились с Машей на подмену, автомат за 340 тысяч не берём.\n',
  });
  const res = await session(api).tasks_standup({});
  assert.match(res.text, /Кандидаты на потерю — подсказка кода, а не результат сверки/);
  assert.match(res.text, /деньги: «340 тысяч»/);
  // Люди и время считаются, но в текст не идут: на живых стенограммах 1–3 августа
  // они дали 0 попаданий из 11 — имена продуктов и таймстампы логов. Подсказка,
  // где всё ложное, приучает пролистывать блок мимо глаз.
  assert.doesNotMatch(res.text, /люди: «Машей»/, 'шумный признак в текст не идёт');
  assert.ok(res.structured.day_review.candidates.people.length > 0, 'но считается и виден в structured');
  assert.ok(res.structured.day_review.candidates.total > 0);
});


// ── Пять простых вопросов ────────────────────────────────────────────────
//
// Открытых вопросов на доске к 2026-08-03 было 29, и разбирались они плохо не
// потому, что трудные: список, который нельзя закрыть за один заход, перестают
// открывать целиком. Планёрка вынимает из него пять таких, на которые владелец
// отвечает не вставая. Ломается в такой сущности три вещи, и все три здесь:
// планка «простого» ползёт вверх и блок пустеет, ротация зацикливается и
// вечерняя планёрка повторяет утреннюю, спячка превращается в удаление.
//
// Формулировки взяты из живого задачника, а не выдуманы: планка проверялась
// на них, и подменять их удобными — значит проверять не то.

const SIMPLE_HEYS = `# HEYS

## Задачи

- [ ] P1 Съёмка due:2026-08-04 ^2026-07-28
  - открыто: Снимаем 4-го постановкой или ждём реального разбора 7-го?
- [ ] P1 Норма белка due:2026-08-05 ^2026-07-20
  - открыто: Проценты heys_norms остаются настройкой или становятся производной?
  - открыто: Коэффициенты белка зашиваем в код или даём куратору настраивать на клиента?
- [ ] P2 Чек-ин due:2026-08-09 ^2026-07-25
  - открыто: Делаем heys_checkin до релиза 8-го или сразу после, отдельным заходом?
  - открыто: Какой полный список шагов чек-ина в приложении сейчас — нужен, чтобы понять объём
- [ ] P2 Анонс по базе due:2026-08-12 ^2026-07-26
  - открыто: ставить ли due под анонс по базе?
- [ ] P2 Ремонт склада ^2026-07-10
  - открыто: Перегородка капитальная с дверью или лёгкое зонирование?
  - открыто: Согласовать с собственником вывод воды или обойтись без него?
`;

/** Пул из шести простых: пятёрка помещается, а на второй заход остаётся хвост. */
function simpleApi(extra = {}) {
  return standupApi({ 'projects/heys.md': SIMPLE_HEYS, ...extra });
}

/** Синтетический пул: ровно то, что нужно ротации, — десять одинаково простых. */
function pool(n, { due = null } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    ref: `heys/00000${i}`,
    path: 'projects/heys.md',
    task: `Задача ${i}`,
    question: `Берём вариант А или Б в ${i}?`,
    due,
    created: '2026-07-01',
    line: i + 1,
    key: `k${i}`,
  }));
}

test('простым признаётся то, на что можно ответить не вставая', () => {
  for (const question of [
    'Перегородка капитальная с дверью или лёгкое зонирование?',
    'ставить ли due под анонс по базе (уходит 8-10 августа)',
    'Подключаем вторую подписку сегодня, чтобы со вторника работать без оглядки на остаток?',
    'возраст и формат — девичник для школьниц или семейный',
  ]) {
    assert.equal(tasks.isSimpleQuestion(question).simple, true, `«${question}» — это выбор из двух`);
  }
});

test('непростое отсеивается, и причина у каждого своя', () => {
  const cases = [
    // Вопрос без развилки: ответом будет не решение, а поход с рулеткой.
    ['Какая площадь у склада и куда переезжает то, что там лежит?', 'нет развилки'],
    ['Какое место в студии отдаём под конструкцию сейчас, пока комната не готова?', 'нет развилки'],
    // Развилка есть, но своим словом её не закрыть — нужен второй человек.
    ['Помещение своё или арендованное? Перепланировку согласовывать с собственником', 'нужен другой человек'],
    ['Кормление котов было разовым или брат ещё в отъезде — ставим слот на 23:00?', 'нужен другой человек'],
    ['Уборку двигаем на утро вторника или её делает кто-то другой, пока ты в Суперлэнде?', 'нужен другой человек'],
    // Развилка есть, но между её сторонами лежит замер или подсчёт.
    ['Уходит ли слив самотёком к кухне или нужен насос — замерить перепад высот', 'надо посчитать'],
    // Не вопрос, а сложенный в строку кусок разбора.
    [`03.08 вечером — на студию не поехали. ${'Всё студийное уехало на вторник одним заездом. '.repeat(4)}или двигаем?`, 'слишком длинный'],
  ];
  for (const [question, reason] of cases) {
    const verdict = tasks.isSimpleQuestion(question);
    assert.equal(verdict.simple, false, `«${question.slice(0, 40)}…» простым быть не должен`);
    assert.equal(verdict.reason, reason, `причина отвода у «${question.slice(0, 40)}…»`);
  }
});

test('границы слов в отсеве считаются буквами, а не \\b — иначе родня не ловится', () => {
  // В JS `\b` считает буквой только ASCII, поэтому `\bбрат\b` не совпадает НИ
  // С ЧЕМ: на этом отсев по родне однажды уже молча не работал.
  assert.equal(tasks.isSimpleQuestion('Брат привезёт сам или забираем?').reason, 'нужен другой человек');
  // Имя в середине — тот же признак: в деле есть кто-то ещё.
  assert.equal(tasks.isSimpleQuestion('Ставим фотозону сами или зовём Машу?').reason, 'нужен другой человек');
  // Заглавная в начале стоит по грамматике, а не по имени, и вопрос не топит.
  assert.equal(tasks.isSimpleQuestion('Ставим фотозону сами или заказываем под ключ?').simple, true);
});

test('ближе срок задачи — выше вопрос; без срока идёт после всех', () => {
  const dated = (due, key) => ({ ...pool(1)[0], due, key });
  const sorted = [dated(null, 'нет'), dated('2026-09-01', 'дальний'), dated('2026-08-04', 'ближний')]
    .sort(tasks.compareSimpleQuestions);
  assert.deepEqual(sorted.map((q) => q.key), ['ближний', 'дальний', 'нет']);
});

test('при равных сроках выше тот вопрос, что записан раньше', () => {
  // Своей даты у строки «открыто:» нет, поэтому старшинство берётся по месту в
  // файле: строки дописываются вниз, и верхняя действительно старше.
  const base = { due: '2026-08-05', created: '2026-07-01', question: 'Берём А или Б?', done: false };
  const sorted = [
    { ...base, path: 'projects/heys.md', line: 30, key: 'ниже' },
    { ...base, path: 'projects/family.md', line: 99, key: 'другой файл' },
    { ...base, path: 'projects/heys.md', line: 10, key: 'выше' },
  ].sort(tasks.compareSimpleQuestions);
  assert.deepEqual(sorted.map((q) => q.key), ['другой файл', 'выше', 'ниже']);
});

test('пятёрка на планёрке идёт по срокам и попадает в ответ отдельным блоком', async () => {
  const res = await session(simpleApi()).tasks_standup({});
  const asked = res.structured.simple_questions;
  assert.equal(asked.length, tasks.SIMPLE_QUESTION_LIMIT);
  assert.equal(res.structured.simple_questions_pool, 6, 'из десяти строк «открыто:» простыми признаны шесть');
  // «Норма белка» несёт два простых «открыто:» с одним и тем же сроком — за
  // круг отдаётся только первый по месту в файле (Проценты), а освободившееся
  // место занимает «Ремонт склада» (без due, но простой), а не второй вопрос
  // той же задачи. Это и есть «один вопрос на задачу за круг».
  assert.deepEqual(asked.map((q) => q.due), ['2026-08-04', '2026-08-05', '2026-08-09', '2026-08-12', null]);
  assert.equal(new Set(asked.map((q) => q.ref)).size, asked.length, 'пять вопросов — пять разных задач');
  assert.match(asked[1].question, /Проценты heys_norms/, 'из двух вопросов нормы белка берётся первый по файлу');
  // Непростое в пятёрку не попадает вовсе, сколько бы его ни было на доске.
  assert.ok(!asked.some((q) => /полный список|Согласовать/i.test(q.question)), 'то, на что не ответить не вставая');
  assert.match(res.text, /Простые вопросы/);
  assert.match(res.text, /tasks_resolve/, 'без этого ответы останутся в чате и пропадут');
  assert.match(res.text, /срок 2026-08-04/);
});

test('одна задача с несколькими «открыто:» не занимает больше одного места за круг', () => {
  const items = [
    { ref: 'heys/norma', path: 'projects/heys.md', line: 1, task: 'Норма белка', due: '2026-08-05', created: '2026-07-20', question: 'Проценты остаются настройкой или становятся производной?', key: 'norma1' },
    { ref: 'heys/norma', path: 'projects/heys.md', line: 2, task: 'Норма белка', due: '2026-08-05', created: '2026-07-20', question: 'Коэффициенты зашиваем в код или даём куратору настраивать?', key: 'norma2' },
    { ref: 'heys/norma', path: 'projects/heys.md', line: 3, task: 'Норма белка', due: '2026-08-05', created: '2026-07-20', question: 'Заводим поле «тип тренировки» или нет?', key: 'norma3' },
    ...pool(2).map((item, i) => ({ ...item, key: `other${i}` })), // две другие задачи, разные ref
  ];
  const state = tasks.ensureState(null);
  const round = tasks.pickSimpleQuestions(items, state, { today: '2026-08-02', limit: 5 });
  const norma = round.picked.filter((q) => q.ref === 'heys/norma');
  assert.equal(norma.length, 1, 'из трёх вопросов одной задачи в круге виден один');
  assert.equal(norma[0].key, 'norma1', 'первый по месту в файле, а не по алфавиту ключа');
  assert.equal(round.picked.length, 3, 'пять вопросов в пуле, но у ротации только 3 разных ref — забирать чужой ref второй раз нельзя');
});

test('вечерняя планёрка спрашивает не то же, что утренняя', async () => {
  const api = simpleApi();
  const morning = await session(api).tasks_standup({});
  const evening = await session(api).tasks_standup({});
  const asked = evening.structured.simple_questions.map((q) => q.key);
  assert.ok(
    !morning.structured.simple_questions.map((q) => q.key).every((key) => asked.includes(key)),
    'повтор утренней пятёрки вечером — это ровно тот шум, из-за которого блок перестанут читать',
  );
  assert.ok(asked.includes(evening.structured.simple_questions.find((q) => /Перегородка/.test(q.question)).key));
  assert.ok(api.kv[tasks.STATE_KEY].question_rota.shown, 'показанное лежит в памяти прохода, а не в памяти чата');
});

test('круг идёт по всему пулу, а кончившись — начинается заново', () => {
  const items = pool(10);
  let state = tasks.ensureState(null);
  const first = tasks.pickSimpleQuestions(items, state, { today: '2026-08-02' });
  state = tasks.rememberShownQuestions(state, { ...first, reset: first.round_reset, nowMs: 1 });
  const second = tasks.pickSimpleQuestions(items, state, { today: '2026-08-02' });
  assert.equal(second.round_reset, false, 'десять на пятёрки делятся ровно — круг ещё идёт');
  assert.deepEqual(
    first.picked.map((q) => q.key).filter((key) => second.picked.some((q) => q.key === key)),
    [],
    'второй заход не повторяет первый',
  );

  state = tasks.rememberShownQuestions(state, { ...second, reset: second.round_reset, nowMs: 2 });
  const third = tasks.pickSimpleQuestions(items, state, { today: '2026-08-02' });
  assert.equal(third.round_reset, true);
  assert.equal(third.picked.length, tasks.SIMPLE_QUESTION_LIMIT, 'молчать нельзя: круг начинается заново');
  assert.deepEqual(third.picked.map((q) => q.key), first.picked.map((q) => q.key), 'заново — значит с начала списка');
});

test('вопросов меньше пятёрки — спрашиваются все, а не тают до нуля', () => {
  const items = pool(3);
  let state = tasks.ensureState(null);
  for (let round = 0; round < 3; round += 1) {
    const picked = tasks.pickSimpleQuestions(items, state, { today: '2026-08-02' });
    assert.equal(picked.picked.length, 3, `круг ${round}: три вопроса — это три вопроса`);
    state = tasks.rememberShownQuestions(state, { ...picked, reset: picked.round_reset, nowMs: round });
  }
});

test('отвеченный вопрос уходит из ротации сам — отдельной записи о нём не заводят', () => {
  const items = pool(3);
  const state = tasks.rememberShownQuestions(tasks.ensureState(null), {
    picked: items, keys: items.map((q) => q.key), reset: false, nowMs: 1,
  });
  // Ответ снял строку «открыто:» — вопрос исчез из пула, и в памяти его быть не должно.
  const after = tasks.rememberShownQuestions(state, {
    picked: [], keys: ['k0', 'k1'], reset: false, nowMs: 2,
  });
  assert.deepEqual(Object.keys(after.question_rota.shown).sort(), ['k0', 'k1']);
});

test('«не трогать» — это спячка, а не удаление: строка «открыто:» остаётся', async () => {
  const api = simpleApi();
  const before = api.file('projects/heys.md');
  const off = await session(api).tasks_standup({ sleep: 'Перегородка' });

  assert.equal(off.structured.until, '2026-08-16', 'по умолчанию четырнадцать дней');
  assert.equal(off.structured.days, tasks.QUESTION_SLEEP_DAYS);
  assert.equal(api.file('projects/heys.md'), before, 'вопрос усыплён, а не снят — снимает его только ответ');
  assert.match(off.text, /tasks_resolve/);

  const agenda = await session(api).tasks_standup({});
  assert.ok(!agenda.structured.simple_questions.some((q) => /Перегородка/.test(q.question)), 'спящий не спрашивается');
  assert.equal(agenda.structured.simple_questions_sleeping.length, 1);
  assert.equal(agenda.structured.simple_questions_sleeping[0].until, '2026-08-16');
});

test('срок спячки задаётся явно, а проснувшийся вопрос возвращается в общий пул', () => {
  const items = pool(2);
  const asleep = tasks.sleepQuestion(tasks.ensureState(null), items[0], { until: '2026-08-09', nowMs: 1 });
  assert.equal(tasks.pickSimpleQuestions(items, asleep, { today: '2026-08-02' }).pool, 1);
  assert.equal(tasks.pickSimpleQuestions(items, asleep, { today: '2026-08-08' }).pool, 1, 'накануне ещё спит');
  assert.equal(tasks.pickSimpleQuestions(items, asleep, { today: '2026-08-09' }).pool, 2, 'в день срока уже проснулся');
});

test('усыпить можно только существующий вопрос и только однозначно названный', async () => {
  const api = simpleApi();
  await assert.rejects(() => session(api).tasks_standup({ sleep: 'вопроса такого нет' }), (e) => e.code === 'question_not_found');
  await assert.rejects(() => session(api).tasks_standup({ sleep: 'или' }), (e) => e.code === 'ambiguous_question');
  await assert.rejects(
    () => session(api).tasks_standup({ sleep: 'Перегородка', sleep_days: 0 }),
    (e) => e.code === 'invalid_sleep_days',
  );
});

test('пятёрка видна в шапке — иначе блок пролистают вместе с остальным', async () => {
  const res = await session(simpleApi()).tasks_standup({});
  assert.equal(res.structured.empty, false, 'пять неразобранных вопросов — это не пустое утро');
  assert.match(res.text, /Простых вопросов 5 из 6/);
});

test('под закрытой задачей спрашивать нечего, даже если строка «открыто:» осталась', async () => {
  const closed = `${SIMPLE_HEYS}- [x] P2 Уже решили ^2026-07-01\n  - открыто: Берём вариант А или Б?\n`;
  const res = await session(simpleApi({ 'projects/heys.md': closed })).tasks_standup({});
  assert.equal(res.structured.simple_questions_pool, 6, 'остаток под закрытой задачей в пул не идёт');
  assert.ok(!res.structured.simple_questions.some((q) => /вариант А или Б/.test(q.question)));
});

// ── Перенос задачи сворачивает её вопросы ────────────────────────────────
//
// Живой случай 2026-08-04: переделку склада отложили до сентября, а планёрка
// продолжала спрашивать «уходит слив самотёком или нужен насос». Строку
// «вернуться:» доска понимала и такую задачу сворачивала, а открытые вопросы
// под ней о переносе не знали и лезли и в пятёрку, и в «Требует решения».
//
// Собственная спячка вопроса при этом остаётся отдельной сущностью: там отложен
// один вопрос, здесь вся задача целиком.

/** Тот же набор, но переделка склада отложена до сентября. */
const DEFERRED_HEYS = SIMPLE_HEYS.replace(
  '- [ ] P2 Ремонт склада ^2026-07-10\n',
  '- [ ] P2 Ремонт склада ^2026-07-10\n  - вернуться: 2026-09-01 — до сентября к этому не возвращаемся\n',
);

test('вопросы отложенной задачи не спрашиваются и не считаются открытыми', async () => {
  const res = await session(simpleApi({ 'projects/heys.md': DEFERRED_HEYS })).tasks_standup({});

  assert.ok(!res.structured.simple_questions.some((q) => /Перегородка/.test(q.question)),
    'решено не возвращаться — значит и вопросы про это не задаём');
  // Из двух вопросов склада простым был один: второй («согласовать с
  // собственником») отсеивается раньше — там нужен другой человек.
  assert.equal(res.structured.simple_questions_pool, 5, 'счётчик открытых тоже не считает свёрнутые');
  const asleep = res.structured.simple_questions_sleeping;
  assert.equal(asleep.length, 1, 'вопрос не выкинут, а свёрнут — снимает его только ответ');
  assert.equal(asleep[0].until, '2026-09-01');
});

test('отложенная задача уходит из «Требует решения» — как и на доске', async () => {
  const api = simpleApi({ 'projects/heys.md': DEFERRED_HEYS });
  const list = await session(api).tasks_list({});
  assert.ok(!list.structured.blocked.some((t) => /Ремонт склада/.test(t.title)),
    '«вернуться: 2026-09-01» — это уже данный ответ «не сейчас», а не ожидание ответа');

  const agenda = await session(api).tasks_standup({});
  assert.ok(!agenda.structured.decide.some((t) => /Ремонт склада/.test(t.title)),
    'два разных ответа на «что требует решения» — то, ради чего планёрку и заводили');
});

test('день пришёл — вопросы и задача возвращаются сами, без отдельного действия', async () => {
  const api = simpleApi({ 'projects/heys.md': DEFERRED_HEYS });
  const september = Date.UTC(2026, 8, 1, 6, 0);          // 2026-09-01 по Москве

  const res = await session(api, september).tasks_standup({});
  assert.equal(res.structured.simple_questions_pool, 6, 'в день срока вопросы уже в пуле');
  assert.equal(res.structured.simple_questions_sleeping.length, 0);

  const list = await session(api, september).tasks_list({});
  assert.ok(list.structured.blocked.some((t) => /Ремонт склада/.test(t.title)));
});

test('перенос задачи и спячка вопроса не гасят друг друга: молчим до более поздней', () => {
  const items = pool(2).map((item, i) => (i === 0 ? { ...item, back: '2026-09-01' } : item));
  const asleep = tasks.sleepQuestion(tasks.ensureState(null), items[0], { until: '2026-08-09', nowMs: 1 });

  const round = tasks.pickSimpleQuestions(items, asleep, { today: '2026-08-10' });
  assert.equal(round.pool, 1, 'спячка кончилась, но задача всё ещё отложена');
  assert.equal(round.sleeping[0].until, '2026-09-01');
  assert.equal(round.sleeping[0].deferred, true, 'видно, что молчит из-за переноса задачи, а не своей спячки');

  // И наоборот: перенос прошёл, а своя спячка вопроса ещё нет.
  const later = tasks.pickSimpleQuestions(
    [{ ...items[0], back: '2026-08-05' }],
    tasks.sleepQuestion(tasks.ensureState(null), items[0], { until: '2026-09-20', nowMs: 1 }),
    { today: '2026-08-10' },
  );
  assert.equal(later.sleeping[0].until, '2026-09-20');
  assert.equal(later.sleeping[0].deferred, false);
});

test('«вернуться:» разбирается так же, как на доске, включая короткую дату', () => {
  const iso = ['вернуться: 2026-09-01 — до сентября не трогаем'];
  assert.equal(tasks.taskBackDate(iso, { today: '2026-08-02' }), '2026-09-01', 'причина после тире не мешает');

  // Короткая форма без года: ближайший год, в котором дата ещё не прошла.
  assert.equal(tasks.taskBackDate(['вернуться: 01.09'], { today: '2026-08-02' }), '2026-09-01');
  assert.equal(tasks.taskBackDate(['вернуться: 01.09'], { today: '2026-12-20' }), '2027-09-01', 'сентябрь впереди, а не позади');

  assert.equal(tasks.taskBackDate(['открыто: а как?', 'ждём: ответа'], { today: '2026-08-02' }), null);
  assert.equal(tasks.taskBackDate(['вернуться: как-нибудь'], { today: '2026-08-02' }), null, 'дата или ничего');
});

// ── Замеченное по смыслу ─────────────────────────────────────────────────
//
// Кодом такое не проверяется: сравнить запись журнала с содержимым дней может
// только модель, и она же может ошибиться. Владелец согласился платить за
// ошибку одним вопросом — но ровно при условии, что ответ запоминается и
// вопрос не повторяется. Условие механическое, поэтому и проверяется здесь, а
// не остаётся обещанием в правилах.

/** Живой случай: журнал говорит одно, дни показывают другое. */
const NOTICED = 'В журнале за 03.08 записано, что неделя 3–9 сходится (футбол ср 5, дзюдо сб 8), а в днях 5-го стоит дзюдо и 8-е без него — что верно?';
const NOTICED_SIDES = [
  'journal/2026-08.md: «слоты проставлены: футбол ср 5 и пт 7, дзюдо сб 8»',
  'days/2026-08-05.md: «16:00–17:30 Дзюдо @ЮЗР»',
  'days/2026-08-08.md: дзюдо нет вовсе',
];

test('замеченное выносится вопросом с обеими сторонами и встаёт отдельной группой', async () => {
  const api = standupApi();
  const put = await session(api).tasks_standup({ observe: NOTICED, sides: NOTICED_SIDES });
  assert.equal(put.structured.created, true);

  const saved = api.file(tasks.STANDUP_PATH);
  assert.match(saved, /^## Замечено$/m, 'замеченное лежит своим разделом, а не вперемешку с принесённым');
  assert.match(saved, /^ {2}- journal\/2026-08\.md: /m, 'сторона осталась цитатой с указанием файла');

  const agenda = await session(api).tasks_standup({});
  assert.equal(agenda.structured.noticed.length, 1);
  assert.equal(agenda.structured.noticed[0].sides.length, 3);
  // Посчитанное и замеченное названы по-разному: смешать их значит выдать
  // догадку за факт.
  assert.match(agenda.text, /Замечено — нужен твой ответ/);
  assert.match(agenda.text, /days\/2026-08-05\.md/);
  assert.deepEqual(agenda.structured.brought_general, [], 'в принесённое им замеченное не попало');
});

test('наблюдение без обеих сторон не принимается', async () => {
  const api = standupApi();
  for (const sides of [undefined, [], ['journal/2026-08.md: «дзюдо сб 8»']]) {
    await assert.rejects(
      () => session(api).tasks_standup({ observe: NOTICED, sides }),
      (e) => e.code === 'sides_required',
    );
  }
  assert.equal(api.file(tasks.STANDUP_PATH), '', 'ничего не записано');
});

test('про то же самое второй раз не спрашиваем, даже другими словами', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ observe: NOTICED, sides: NOTICED_SIDES });
  const again = await session(api).tasks_standup({
    observe: 'Неделя 3–9: в журнале дзюдо записано на субботу 8, а в днях дзюдо стоит 5-го — что верно?',
    sides: NOTICED_SIDES,
  });
  assert.equal(again.structured.created, false);
  assert.equal(again.structured.reason, 'duplicate');
  assert.equal(tasks.parseStandupObservations({ text: api.file(tasks.STANDUP_PATH) }).length, 1);
});

test('отвеченное наблюдение замолкает навсегда, а ответ остаётся в файле', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ observe: NOTICED, sides: NOTICED_SIDES });
  const closed = await session(api).tasks_standup({
    done: 'неделя 3–9', answer: 'дни верные, журнал не поправили — ориентируйся на дни',
  });
  assert.equal(closed.structured.kind, 'наблюдение');
  const saved = api.file(tasks.STANDUP_PATH);
  assert.match(saved, /^- \[x\] 2026-08-02 · В журнале за 03\.08/m);
  assert.match(saved, /^ {2}- ответ: дни верные, журнал не поправили/m);

  // Из повестки ушло.
  const agenda = await session(api).tasks_standup({});
  assert.deepEqual(agenda.structured.noticed, []);

  // И поднять его заново нельзя — ни теми же словами, ни другими.
  const retry = await session(api).tasks_standup({
    observe: 'Неделя 3–9: в журнале дзюдо на субботу 8, а в днях дзюдо 5-го — что верно?',
    sides: NOTICED_SIDES,
  });
  assert.equal(retry.structured.created, false);
  assert.equal(retry.structured.reason, 'answered');
  assert.match(retry.text, /он ответил/);
});

test('наблюдение без записанного ответа закрыть нельзя', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ observe: NOTICED, sides: NOTICED_SIDES });
  await assert.rejects(
    () => session(api).tasks_standup({ done: 'неделя 3–9' }),
    (e) => e.code === 'answer_required' && /завтра ты спросишь то же самое/.test(e.message),
  );
  assert.equal(tasks.parseStandupObservations({ text: api.file(tasks.STANDUP_PATH) })[0].done, false);
});

test('принесённый им пункт закрывается и без ответа — это не наблюдение', async () => {
  const api = standupApi();
  await session(api).tasks_standup({ add: 'Отпуск 16–19: даты снова открыли' });
  const off = await session(api).tasks_standup({ done: 'отпуск' });
  assert.equal(off.structured.kind, 'пункт');
  assert.equal(off.structured.answer, null);
});

test('больше трёх незакрытых наблюдений завести нельзя', async () => {
  const api = standupApi();
  const tools = session(api);
  // Наблюдения намеренно про разное: похожие отсеялись бы как повтор, и
  // потолок остался бы непроверенным.
  const distinct = [
    { observe: 'Дзюдо записано на субботу, а стоит во вторник — что верно?', sides: ['journal/2026-08.md: «дзюдо сб»', 'days/2026-08-04.md: «дзюдо»'] },
    { observe: 'Аренда студии оплачена дважды за один месяц?', sides: ['money/2026-08.md: «-30000 аренда»', 'money/2026-08.md: «-30000 аренда»'] },
    { observe: 'Отпуск помечен решённым, но даты снова открыли — какие в силе?', sides: ['GOALS.md: «отпуск 16–19, решено»', 'journal/2026-08.md: «даты снова открыли»'] },
  ];
  for (const one of distinct) {
    const res = await tools.tasks_standup(one);
    assert.equal(res.structured.created, true, `«${one.observe}» должно было завестись`);
  }
  await assert.rejects(
    () => session(api).tasks_standup({ observe: 'Реклама запущена, а бюджет на неё нигде не записан?', sides: ['projects/heys.md: «запуск рекламы»', 'money/2026-08.md: «строк по рекламе нет»'] }),
    (e) => e.code === 'too_many_observations' && /закрой через done с answer/.test(e.message),
  );
});

test('разные наблюдения про одну неделю повтором не считаются', async () => {
  const api = standupApi();
  const tools = session(api);
  await tools.tasks_standup({ observe: NOTICED, sides: NOTICED_SIDES });
  // То же расписание, но расхождение другое: время футбола против закрытия
  // студии. Отсечь его как повтор значит потерять настоящее наблюдение.
  const other = await tools.tasks_standup({
    observe: 'Футбол 9-го стоит на 16:00, а студия закрывается в 16:00 — успеет ли?',
    sides: ['days/2026-08-09.md: «15:00-16:00 Закрыть студию»', 'days/2026-08-09.md: «16:00–17:00 Футбол @центр»'],
  });
  assert.equal(other.structured.created, true);
  assert.equal(other.structured.open, 2);
});

test('замеченное и принесённое не путаются между собой при снятии', async () => {
  const api = standupApi();
  const tools = session(api);
  await tools.tasks_standup({ add: 'Расписание секций на сентябрь' });
  await tools.tasks_standup({ observe: 'Расписание секций: журнал и дни разошлись — что верно?', sides: ['j.md: «а»', 'd.md: «б»'] });
  await assert.rejects(
    () => session(api).tasks_standup({ done: 'расписание секций' }),
    (e) => e.code === 'ambiguous_standup_item',
  );
});

// ── План и факт ──────────────────────────────────────────────────────────
//
// Факт в задачнике ровно один: состоялось или нет, и только в закрытом дне.
// Длительности нет вовсе, поэтому и проверяется здесь в первую очередь то,
// чего механизм НЕ делает: не считает по одному случаю, не принимает
// незакрытый день за срыв и не правит память сам.

/** Закрытый день: слот и обязательная заметка «как прошло». */
const CLOSED_DAY = (date, slots) => `# План на ${date}\n${slots}\n\n> как-то так\n`;

function planFactFiles(dates, { line = '- 09:00–09:30 Уборка кухни #дело', note = true } = {}) {
  return dates.map((date) => ({
    path: `days/${date}.md`,
    text: note ? CLOSED_DAY(date, line) : `# План на ${date}\n${line}\n`,
  }));
}

test('одного и двух срывов мало — закономерность начинается с трёх', () => {
  const dates = ['2026-08-01', '2026-07-31', '2026-07-30'];
  for (const take of [1, 2]) {
    assert.deepEqual(
      tasks.planFactPatterns(planFactFiles(dates.slice(0, take)), { today: '2026-08-02' }),
      [],
      `${take} случай(ев) — это разброс, а не закономерность`,
    );
  }
  const found = tasks.planFactPatterns(planFactFiles(dates), { today: '2026-08-02' });
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Уборка кухни');
  assert.equal(found[0].planned, 3);
  assert.equal(found[0].missed, 3);
  assert.equal(found[0].happened, 0);
});

test('состоявшееся чаще, чем срывалось, закономерностью не считается', () => {
  const files = [
    ...planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30']),
    ...planFactFiles(['2026-07-29', '2026-07-28', '2026-07-27', '2026-07-26'], { line: '- [x] 09:00–09:30 Уборка кухни #дело' }),
  ];
  assert.deepEqual(tasks.planFactPatterns(files, { today: '2026-08-02' }), [], '3 из 7 — это обычный разброс');
});

test('незакрытый день фактом не считается: там «неизвестно», а не «не состоялось»', () => {
  const open = planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30'], { note: false });
  assert.deepEqual(tasks.planFactPatterns(open, { today: '2026-08-02' }), []);
  // Тот же набор дней, но закрытых, закономерность даёт — иначе проверка выше
  // доказывала бы только то, что файлы не прочитали.
  assert.equal(tasks.planFactPatterns(planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30']), { today: '2026-08-02' }).length, 1);
});

test('будущий день фактом не считается — он ещё не наступил', () => {
  const ahead = planFactFiles(['2026-08-03', '2026-08-04', '2026-08-05']);
  assert.deepEqual(tasks.planFactPatterns(ahead, { today: '2026-08-02' }), []);
});

test('про фактическую длительность механизм не говорит ничего — её взять неоткуда', () => {
  const found = tasks.planFactPatterns(planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30']), { today: '2026-08-02' })[0];
  assert.deepEqual(
    Object.keys(found).sort(),
    ['days', 'happened', 'missed', 'planned', 'share', 'title'],
    'появилось поле про длительность — значит план выдали за факт',
  );
  assert.doesNotMatch(tasks.planFactQuestion(found), /минут|часа|часов|длит/i);
});

test('расхождение плана с фактом приходит на планёрку вопросом и память не трогает', async () => {
  const api = standupApi(Object.fromEntries(
    planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30']).map((f) => [f.path, f.text]),
  ));
  await session(api).tasks_learn({ note: 'Уборка кухни — полчаса утром', evidence: 'его слова', kind: 'порог' });
  const before = api.file(tasks.PREFS_PATH);

  const agenda = await session(api).tasks_standup({});
  assert.equal(agenda.structured.plan_fact.length, 1);
  assert.equal(agenda.structured.plan_fact[0].missed, 3);
  assert.match(agenda.text, /План и факт/);
  assert.match(agenda.text, /спроси, не правь память/);
  assert.match(agenda.text, /не состоялось 3 раз из 3/);
  assert.equal(api.file(tasks.PREFS_PATH), before, 'память правится только его ответом');
});

test('спрошенное про то же расхождение второй раз на планёрку не всплывает', async () => {
  const api = standupApi(Object.fromEntries(
    planFactFiles(['2026-08-01', '2026-07-31', '2026-07-30']).map((f) => [f.path, f.text]),
  ));
  const first = await session(api).tasks_standup({});
  const pattern = first.structured.plan_fact[0];

  await session(api).tasks_standup({
    observe: tasks.planFactQuestion(pattern),
    sides: tasks.planFactSides(pattern),
  });
  const again = await session(api).tasks_standup({});
  assert.deepEqual(again.structured.plan_fact, [], 'спрошенное молчит — иначе это ежедневная придирка');
  assert.equal(again.structured.noticed.length, 1, 'вопрос остался висеть до его ответа');
});

// ── Пересмотр памяти ─────────────────────────────────────────────────────
//
// Всё, что только копится, однажды становится шумом. Поэтому старое и ни разу
// не пригодившееся показывается на планёрке — и ровно показывается: вычеркнуть
// его вправе только он.

const OLD_PREFS = [
  '# Предпочтения',
  '',
  '## Как он решает',
  '',
  '- 2026-06-01 · предпочтение · Старое и никому не понадобилось — его слова',
  '- 2026-06-01 · предпочтение · Старое, но в разборы попадало — его слова',
  '  - пригодилось: 2, последний раз 2026-07-30',
  '- 2026-07-25 · порог · Свежее, ещё месяца не прошло — его слова',
  '',
].join('\n');

test('в пересмотр попадают только старые и ни разу не пригодившиеся', () => {
  const stale = tasks.stalePreferences(tasks.parsePreferences({ text: OLD_PREFS }), { today: '2026-08-02' });
  assert.deepEqual(stale.map((p) => p.note), ['Старое и никому не понадобилось']);
  assert.equal(stale[0].age_days, 62);
});

test('короткое слово в другом падеже находит запись — «до зала» находит «зал»', () => {
  // Люди называют места короткими словами: зал, дом, юг. Основа у них не
  // отрезается (порог в 6 букв), и падеж делал слово другим — запись молча
  // не поднималась, что неотличимо от её отсутствия.
  const terms = tasks.topicTerms('сколько ехать до зала').terms;
  assert.ok(tasks.matchTerms('Студия на юге зал', terms).score > 0, '«зала» обязано найти «зал»');
  assert.ok(tasks.matchTerms('дома у родителей', tasks.topicTerms('еду домой').terms).score > 0);
});

test('похожие короткие слова не склеиваются — «дом» и «дым» разные', () => {
  assert.equal(tasks.matchTerms('дым', tasks.topicTerms('где дом').terms).score, 0);
  assert.equal(tasks.matchTerms('юг', tasks.topicTerms('дай ключ').terms).score, 0);
  // Две общие буквы — ещё не родство: «зал» и «заказ» начинаются одинаково,
  // но это разные слова. Порог ровно на этом случае и держится.
  assert.equal(tasks.matchTerms('заказ фурнитуры', tasks.topicTerms('до зала').terms).score, 0);
});

test('синонимы поднимают факт, названный его словами, а не словами записи', () => {
  // «Сколько ехать до зала» — в записи слово «студия», совпадения нет, и факт
  // не поднимется: неотличимо от того, что его вообще не записывали.
  const text = [
    '## Как он решает',
    '',
    '- 2026-08-04 · факт · Студия на юге, это же ЮЗР — его слова 04.08',
    '  - зовётся: зал, ЮЗР',
  ].join('\n');
  const [entry] = tasks.parsePreferences({ path: tasks.PREFS_PATH, text });
  assert.deepEqual(entry.aliases, ['зал', 'ЮЗР']);
  assert.equal(entry.kind, 'факт');
});

test('адресация «мне» не тонет в TOPIC_STOP_WORDS', () => {
  // На «запиши мне 300 г» слово «мне» выкидывается из terms — без raw-hit
  // предпочтение не попадало в «Из памяти», и модель шла в list_clients.
  const note = '«Мне» = аккаунт клиента Полтавский (client_id ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a). «Жене» / «цыпе» = аккаунт клиента Александра (client_id 4545ee50-4f5f-4fc0-b862-7ca45fa1bafc).';
  const clients = [
    { client_id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Полтавский' },
    { client_id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Александра' },
  ];
  const entry = { note, aliases: [], kind: 'предпочтение' };
  const map = tasks.clientAddressMap([entry], clients);
  assert.equal(map.get('мне').name, 'Полтавский');
  assert.equal(map.get('жене').name, 'Александра');
  assert.equal(map.get('цыпе').name, 'Александра');
  assert.equal(map.get('себе').name, 'Полтавский');
  assert.equal(map.get('жена').name, 'Александра', 'падеж жена из группы жене');
  assert.equal(tasks.preferenceHitsRawTopic(entry, 'заведи продукт и запиши мне 300 г'), true);
  assert.equal(tasks.preferenceHitsRawTopic(entry, 'запиши жене завтрак'), true);
  assert.equal(tasks.preferenceHitsRawTopic(entry, 'запиши жена завтрак'), true);
  assert.equal(tasks.preferenceHitsRawTopic(entry, 'изменение нормы'), false);
  const known = tasks.knownPreference([
    { note, aliases: ['мне', 'себе'], question: null, date: '2026-08-03' },
  ], null, { question: 'мне' });
  assert.ok(known, 'tasks_learn(question:мне) обязан найти запись по алиасу');
  assert.equal(known.matched_by, 'алиас');
});

test('diaryTopicUsesAddressAlias ловит «запиши мне» и не ловит чистый задачник', () => {
  assert.equal(
    tasks.diaryTopicUsesAddressAlias('Заведи продукт «черри» от помидора черри и запиши мне 300 г на сегодня'),
    true,
  );
  assert.equal(tasks.diaryTopicUsesAddressAlias('запиши жене завтрак'), true);
  assert.equal(tasks.diaryTopicUsesAddressAlias('что там по лендингу'), false);
  assert.equal(tasks.diaryTopicUsesAddressAlias('мне'), true);
  assert.equal(tasks.diaryTopicUsesAddressAlias('Find who «мне» is in curator memory'), true);
  assert.equal(tasks.diaryTopicUsesAddressAlias('кто такой мне'), true);
  assert.equal(tasks.diaryTopicUsesAddressAlias('кто жена'), true);
  assert.equal(tasks.diaryTopicUsesAddressAlias('Find who жена in curator memory'), true);
  // Short topic with address alias only — «кто жена», не «какая у меня машина».
  assert.equal(tasks.diaryTopicUsesAddressAlias('какая у меня машина'), false);
});

test('clientAddressMap и canon раскладывают падежи жена→жене', () => {
  const note = '«Мне» = аккаунт клиента Полтавский (client_id ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a). «Жене» / «цыпе» = аккаунт клиента Александра (client_id 4545ee50-4f5f-4fc0-b862-7ca45fa1bafc).';
  const clients = [
    { client_id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Полтавский' },
    { client_id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Александра' },
  ];
  const map = tasks.clientAddressMap([{ note, aliases: [], kind: 'предпочтение' }], clients);
  assert.equal(map.get('жена').name, 'Александра');
  assert.equal(map.get('жену').name, 'Александра');
  assert.equal(map.get('меня').name, 'Полтавский');
  assert.equal(tasks.addressAliasCanon('жена'), 'жене');
  assert.equal(tasks.addressAliasCanon('меня'), 'мне');
});

test('tasks_context отклоняет дневниковую фразу с «мне»', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_context({
    topic: 'Заведи продукт черри и запиши мне 300 г',
  });
  assert.match(res.text, /tasks_context здесь не нужен/);
  assert.equal(res.structured.skip_reason, 'diary_addressing_use_client_param');
});

test('tasks_context отклоняет archaeology-reframe с «мне»', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_context({
    topic: 'Find who «мне» is in curator memory',
  });
  assert.match(res.text, /tasks_context здесь не нужен/);
  assert.equal(res.structured.skip_reason, 'diary_addressing_use_client_param');
});

test('tasks_context отклоняет archaeology с «жена»', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_context({
    topic: 'кто жена',
  });
  assert.match(res.text, /tasks_context здесь не нужен/);
  assert.equal(res.structured.suggested_client, 'жене');
});

test('синонимы пишутся дочерней строкой и переживают чтение', () => {
  const block = tasks.preferenceBlock({
    date: '2026-08-04', kind: 'факт', note: 'Машина Skoda Octavia',
    evidence: 'его слова 04.08', aliases: ['тачка', 'авто'],
  });
  assert.match(block, /зовётся: тачка, авто/);
  const [entry] = tasks.parsePreferences({ path: tasks.PREFS_PATH, text: `## Как он решает\n\n${block}` });
  assert.deepEqual(entry.aliases, ['тачка', 'авто'], 'записанное читается обратно тем же составом');
});

test('запись без синонимов не ломается и не выдумывает их', () => {
  const block = tasks.preferenceBlock({
    date: '2026-08-04', kind: 'решение', note: 'Развилки по деньгам решает сам', evidence: 'его слова',
  });
  assert.doesNotMatch(block, /зовётся/);
  const [entry] = tasks.parsePreferences({ path: tasks.PREFS_PATH, text: `## Как он решает\n\n${block}` });
  assert.deepEqual(entry.aliases, []);
});

test('память на пересмотр показывается на планёрке и ничего не удаляется', async () => {
  const api = standupApi({ [tasks.PREFS_PATH]: OLD_PREFS });
  const agenda = await session(api).tasks_standup({});

  assert.equal(agenda.structured.stale_memory.length, 1);
  assert.equal(agenda.structured.stale_memory[0].note, 'Старое и никому не понадобилось');
  assert.match(agenda.text, /Память на пересмотр/);
  assert.match(agenda.text, /вычёркивает он сам/);

  // Файл памяти после планёрки — байт в байт прежний.
  assert.equal(api.file(tasks.PREFS_PATH), OLD_PREFS, 'стереть его решение система права не имеет');
  assert.equal(tasks.parsePreferences({ text: api.file(tasks.PREFS_PATH) }).length, 3);
});

test('удалять записанное нечем: инструмента для этого нет вовсе', () => {
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  const learn = built.schemas.find((s) => s.name === 'tasks_learn');
  assert.deepEqual(
    Object.keys(learn.inputSchema.properties).filter((k) => /delete|remove|drop|forget|удал/i.test(k)),
    [],
    'появился аргумент удаления — значит память можно стереть мимо него',
  );
  const names = built.schemas.map((s) => s.name);
  assert.ok(!names.some((n) => /forget|unlearn/i.test(n)));
});

// ── Напоминание про стенограмму ──────────────────────────────────────────
//
// Записать стенограмму может только модель: коннектор видит вызовы, но не
// текст разговора. Принуждения здесь не бывает, поэтому проверяется ровно то,
// на чём держится напоминание: оно появляется, когда записи нет, и молчит,
// как только она появилась.

const TRANSCRIPT_TODAY = 'transcript/2026-08-02.md';

test('стенограммы за сегодня нет — разбор фразы несёт приписку', async () => {
  const res = await session(liveTasksApi()).tasks_context({ topic: 'лендинг версия D' });
  assert.match(res.text, /Стенограмма за 2026-08-02 пуста/);
  assert.match(res.structured.transcript_reminder, new RegExp(TRANSCRIPT_TODAY));
  // Разбор от приписки не пострадал.
  assert.ok(res.structured.tasks.length, 'сам ответ инструмента остался на месте');
});

test('запись в стенограмму гасит age-приписку; новый write снова ставит pending', async () => {
  const api = liveTasksApi();
  const before = await session(api).tasks_capture({ text: 'Купить леску', project: 'family' });
  assert.match(before.text, /Стенограмма за 2026-08-02 пуста/);
  assert.equal(before.structured.transcript_pending, true);

  await session(api).tasks_append({ path: TRANSCRIPT_TODAY, block: '## 12:00\n\n**Кин:** купи леску' });

  const after = await session(api).tasks_capture({ text: 'Ещё одна', project: 'family' });
  assert.equal(after.structured.transcript_pending, true);
  assert.doesNotMatch(after.text, /пуста/, 'файл стенограммы уже есть — age-reminder молчит');
  assert.match(after.structured.transcript_reminder, /не закрыта после/, 'write без checkpoint всё ещё висит');
});

test('checkpoint снимает transcript_pending после записи без стенограммы', async () => {
  const api = liveTasksApi();
  // Свежая стенограмма есть — age-reminder молчит; pending от write всё равно висит.
  await session(api).tasks_append({
    path: TRANSCRIPT_TODAY,
    block: '## 09:00\n\n**Кин:** утро\n**Claude:** ок',
  });
  const wrote = await session(api).tasks_capture({ text: 'После свежей стенограммы', project: 'family' });
  assert.equal(wrote.structured.transcript_pending, true);
  assert.match(wrote.structured.transcript_reminder, /не закрыта после/);

  const closed = await session(api).tasks_checkpoint({
    transcript_block: '## 12:50\n\n**Кин:** После свежей стенограммы\n**Claude:** Положил в family задачу «После свежей стенограммы».',
  });
  assert.equal(closed.structured.transcript_pending, false);

  const next = await session(api).tasks_list({});
  assert.equal(next.structured.transcript_reminder, undefined);
});

test('стенограмма за вчера сегодняшнюю приписку не снимает', async () => {
  const api = liveTasksApi();
  await session(api).tasks_append({ path: 'transcript/2026-08-01.md', block: '## 20:00\n\n**Кин:** вчерашнее' });
  const res = await session(api).tasks_capture({ text: 'Сегодняшняя мысль', project: 'family' });
  assert.match(res.text, /Стенограмма за 2026-08-02 пуста/);
});

test('отставшая стенограмма названа временем последней записи', async () => {
  const files = {
    [tasks.keyForPath('projects/family.md')]: { path: 'projects/family.md', text: FAMILY_PROJECT, rev: 2, updatedAt: 1 },
    [tasks.keyForPath(TRANSCRIPT_TODAY)]: { path: TRANSCRIPT_TODAY, text: '## 09:00\n\n**Кин:** доброе утро', rev: 1, updatedAt: NOW - 3 * 60 * 60 * 1000 },
  };
  const api = liveApi(files, {
    files: {
      'projects/family.md': { rev: 2, updatedAt: 1 },
      [TRANSCRIPT_TODAY]: { rev: 1, updatedAt: NOW - 3 * 60 * 60 * 1000 },
    },
    updatedAt: 1,
  });
  const res = await session(api).tasks_capture({ text: 'Мысль посреди дня', project: 'family' });
  assert.match(res.structured.transcript_reminder, /3 ч назад/);
  assert.doesNotMatch(res.structured.transcript_reminder, /пуста/);
});

test('свежая стенограмма молчит', () => {
  const index = { files: { [TRANSCRIPT_TODAY]: { rev: 4, updatedAt: NOW - 5 * 60 * 1000 } }, updatedAt: NOW };
  const status = tasks.transcriptStatus(index, { date: '2026-08-02', nowMs: NOW });
  assert.equal(status.state, 'fresh');
  assert.equal(tasks.transcriptReminder(status), null);
});

test('напоминание висит на содержательных вызовах, а не на просмотре доски', async () => {
  const list = await session(liveTasksApi()).tasks_list({});
  assert.equal(list.structured.transcript_reminder, undefined, 'просмотр списка разговором не является');
  const read = await session(liveTasksApi()).tasks_read({ path: 'projects/heys.md' });
  assert.equal(read.structured.transcript_reminder, undefined, 'чтение файла разговором не является');
  const delta = await session(liveTasksApi()).tasks_delta({});
  assert.equal(delta.structured.transcript_reminder, undefined, 'проход по изменениям разговором не является');
});

test('в одном проходе приписка не повторяется на каждом вызове', async () => {
  const api = liveTasksApi();
  const tools = session(api);
  const first = await tools.tasks_capture({ text: 'Первая', project: 'family' });
  const second = await tools.tasks_append({ path: 'journal/2026-08.md', block: '## 2026-08-02\n\nРазобрали.' });
  assert.match(first.text, /Стенограмма за 2026-08-02 пуста/);
  assert.equal(second.structured.transcript_reminder, undefined, 'вторая такая же строка подряд — уже шум');
});

test('приписка не читает саму стенограмму', async () => {
  const api = liveTasksApi();
  const reads = [];
  const wrapped = {
    ...api,
    async getKVByCurator(bearer, clientId, key) { reads.push(key); return api.getKVByCurator(bearer, clientId, key); },
    async getKVManyByCurator(bearer, clientId, keys) { reads.push(...keys); return api.getKVManyByCurator(bearer, clientId, keys); },
  };
  await session(wrapped).tasks_capture({ text: 'Мысль', project: 'family' });
  assert.ok(!reads.includes(tasks.keyForPath(TRANSCRIPT_TODAY)), 'хватило индекса, файл не поднимался');
});

// ── Checkpoint обмена ───────────────────────────────────────────────────

test('checkpoint одним вызовом сохраняет полный обмен и вывод в журнал', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 12:40\n\n**Кин:** Проверь всё.\n**Claude:** Проверил три слоя и нашёл разрыв в обязательной записи.',
    journal_block: '## 2026-08-02 12:40 · heys\n\nВводная: нужна полная запись.\nРазбор: отдельного checkpoint не было.\nИтог: добавлен единый checkpoint обмена.',
  });
  assert.equal(res.structured.checkpoint, true);
  assert.match(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text, /\*\*Кин:\*\* Проверь всё\./);
  assert.match(api.kv[tasks.keyForPath('journal/2026-08.md')].text, /Итог: добавлен единый checkpoint обмена\./);
  assert.ok(res.structured.transcript.rev > 0);
  assert.ok(res.structured.journal.rev > 0);
});

test('checkpoint дописывает новый обмен в конец дня, а не в начало файла', async () => {
  // transcript/README.md, с 2026-08-11: хронология сверху вниз — как tasks_append.
  const api = liveTasksApi();
  const tools = session(api);
  await tools.tasks_checkpoint({
    transcript_block: '## 09:00\n\n**Кин:** Первый обмен дня.\n**Claude:** Принято.',
  });
  await tools.tasks_checkpoint({
    transcript_block: '## 12:44\n\n**Кин:** Второй обмен дня.\n**Claude:** Тоже принято.',
  });
  const text = api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text;
  assert.ok(
    text.indexOf('Первый обмен дня') < text.indexOf('Второй обмен дня'),
    'второй checkpoint должен встать после первого, а не перед',
  );
  assert.ok(text.trimEnd().endsWith('Тоже принято.'), 'самый свежий блок — в конце файла');
});

test('checkpoint дописывает метку вызова, а модель её не передаёт', async () => {
  // Связка «обмен ↔ строка mcp_call»: session_id выдаёт сервер, поэтому и
  // строку в блок добавляет сервер. Модель этих значений не знает.
  const api = liveTasksApi();
  const block = '## 12:40\n\n**Кин:** Запиши воду.\n**Claude:** Записал 300 мл.';
  await callContext.run({ sessionId: 'a2418c691812', seq: 7, ts: '2026-08-17T18:33:12.000Z' }, () =>
    session(api).tasks_checkpoint({ transcript_block: block }));

  const text = api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text;
  assert.match(text, /\[mcp session=a2418c691812 seq=7 ts=2026-08-17T18:33:12\.000Z\]/);
  assert.ok(text.trimEnd().endsWith('[mcp session=a2418c691812 seq=7 ts=2026-08-17T18:33:12.000Z]'), 'метка — последняя строка блока');
  assert.ok(!block.includes('mcp session='), 'модель прислала блок без метки');
});

test('без контекста вызова блок стенограммы не меняется', async () => {
  const api = liveTasksApi();
  await session(api).tasks_checkpoint({
    transcript_block: '## 12:40\n\n**Кин:** Прямой вызов.\n**Claude:** Без метки.',
  });
  assert.ok(!api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text.includes('[mcp session='));
});

test('два обмена подряд получают разные метки', async () => {
  // Два write в одном ходе — это два обмена, а не один: две метки с разным seq.
  const api = liveTasksApi();
  const tools = session(api);
  await callContext.run({ sessionId: 's1', seq: 1 }, () =>
    tools.tasks_checkpoint({ transcript_block: '## 09:00\n\n**Кин:** Вода.\n**Claude:** Записал.' }));
  await callContext.run({ sessionId: 's1', seq: 2 }, () =>
    tools.tasks_checkpoint({ transcript_block: '## 09:01\n\n**Кин:** И приём.\n**Claude:** Записал.' }));

  const text = api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text;
  assert.match(text, /\[mcp session=s1 seq=1\]/);
  assert.match(text, /\[mcp session=s1 seq=2\]/);
  assert.ok(text.indexOf('seq=1') < text.indexOf('seq=2'), 'порядок обменов сохраняется');
});

test('sortTranscriptChronologically выравнивает блоки по времени заголовка', () => {
  const mixed = [
    '## 21:03',
    '',
    '**Кин:** поздно',
    '**Claude:** ответ',
    '',
    '## 19:20',
    '',
    '**Кин:** раньше',
    '**Claude:** ответ2',
  ].join('\n');
  const sorted = tasks.sortTranscriptChronologically(mixed);
  assert.ok(sorted.indexOf('раньше') < sorted.indexOf('поздно'));
});

test('rotateFileText у transcript снимает старые блоки сверху', () => {
  const big = [
    '## 09:00',
    'старое'.repeat(15000),
    '## 12:00',
    'ещё'.repeat(15000),
    '## 18:00',
    'хвост',
  ].join('\n\n');
  const rotated = tasks.rotateFileText(`transcript/2026-08-11.md`, big);
  assert.ok(rotated.archives.length >= 1, 'должен появиться архив');
  assert.match(rotated.active, /18:00/);
  assert.doesNotMatch(rotated.active, /09:00/);
  assert.ok(tasks.utf8ByteLength(rotated.active) <= tasks.TASKS_ROTATE_TARGET_BYTES);
});

test('checkpoint без устойчивого вывода пишет только стенограмму', async () => {
  const api = liveTasksApi();
  const journalBefore = api.kv[tasks.keyForPath('journal/2026-08.md')].text;
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 12:41\n\n**Кин:** Спасибо.\n**Claude:** Пожалуйста.',
  });
  assert.match(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)].text, /\*\*Claude:\*\* Пожалуйста\./);
  assert.equal(res.structured.journal, null);
  assert.equal(api.kv[tasks.keyForPath('journal/2026-08.md')].text, journalBefore);
});

test('checkpoint не принимает половину обмена', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_checkpoint({ transcript_block: '## 12:42\n\n**Кин:** Только моя сторона.' }),
    (e) => e.code === 'incomplete_transcript_exchange',
  );
  assert.equal(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)], undefined);
});

test('checkpoint отклоняет отсылку «содержание в записи выше» вместо полного ответа', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_checkpoint({
      transcript_block: [
        '## 12:45',
        '',
        '**Кин:** почини гонку',
        '**Claude:** [техническое: вывод в журнал по обмену 12:45 не прошёл. Содержание обмена — в записи 12:45 выше.]',
      ].join('\n'),
    }),
    (e) => e.code === 'verbatim_transcript_required',
  );
  assert.equal(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)], undefined);
});

test('checkpoint отклоняет короткую выжимку на длинной реплике Кина', async () => {
  const api = liveTasksApi();
  const longKin = 'Нужно гарантированно не допускать таких ситуаций, когда из ответа берётся только сводка и теряется марка машины, цена и срок — это уже второй раз.';
  await assert.rejects(
    () => session(api).tasks_checkpoint({
      transcript_block: `## 13:00\n\n**Кин:** ${longKin}\n**Claude:** Ок, учёл.`,
    }),
    (e) => e.code === 'verbatim_transcript_required',
  );
});

test('checkpoint принимает автозапись дневника и короткие подтверждения', async () => {
  const api = liveTasksApi();
  const auto = await session(api).tasks_checkpoint({
    transcript_block: '## 13:01\n\n**Кин:** Цыпа арбуз 400\n**Claude:** [Автозапись инструмента] Записал: Перекус — Арбуз 400 г.',
  });
  assert.equal(auto.structured.checkpoint, true);
  const short = await session(api).tasks_checkpoint({
    transcript_block: '## 13:02\n\n**Кин:** Спасибо.\n**Claude:** Пожалуйста.',
  });
  assert.equal(short.structured.checkpoint, true);
});

test('ошибка журнала возникает до записи стенограммы', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_checkpoint({
      transcript_block: '## 12:43\n\n**Кин:** Проверка.\n**Claude:** Ответ.',
      journal_block: '## неверная дата\n\nИтог: не должно записаться.',
    }),
    (e) => e.code === 'invalid_journal_heading',
  );
  assert.equal(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)], undefined);
});

test('checkpoint с date=вчера пишет в вчерашний transcript, а не в сегодняшний', async () => {
  // Инцидент 06.08: обмен про вечер 05.08 с шапкой ## 23:40 уехал в
  // transcript/2026-08-06.md, потому что путь брался от «сейчас».
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    date: 'вчера',
    transcript_block: '## 23:40\n\n**Кин:** Закрой вчерашний день.\n**Claude:** Закрыл days/2026-08-01.md.',
    journal_block: '## 2026-08-01 23:40 · день\n\nВводная: закрыть вчера.\nРазбор: checkpoint без date уехал бы в сегодня.\nИтог: date=вчера кладёт обмен в нужный файл.',
  });
  assert.equal(res.structured.date, '2026-08-01');
  assert.equal(res.structured.transcript.path, YESTERDAY_TRANSCRIPT_PATH);
  assert.match(api.kv[tasks.keyForPath(YESTERDAY_TRANSCRIPT_PATH)].text, /Закрой вчерашний день/);
  assert.equal(api.kv[tasks.keyForPath(TRANSCRIPT_TODAY)], undefined);
  assert.match(api.kv[tasks.keyForPath('journal/2026-08.md')].text, /date=вчера кладёт обмен/);
});

test('checkpoint с date в будущем отклоняется', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_checkpoint({
      date: '2026-08-09',
      transcript_block: '## 10:00\n\n**Кин:** Завтра.\n**Claude:** Нет.',
    }),
    (e) => e.code === 'future_transcript',
  );
  assert.equal(api.kv[tasks.keyForPath('transcript/2026-08-09.md')], undefined);
});

test('checkpoint date и шапка журнала должны совпадать', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_checkpoint({
      date: '2026-08-01',
      transcript_block: '## 23:55\n\n**Кин:** Ок.\n**Claude:** Ок.',
      journal_block: '## 2026-08-02 23:55 · мимо\n\nИтог: чужая дата.',
    }),
    (e) => e.code === 'invalid_journal_heading',
  );
  assert.equal(api.kv[tasks.keyForPath(YESTERDAY_TRANSCRIPT_PATH)], undefined);
});

test('checkpoint без journal_block напоминает про вывод, если обмен похож на разбор', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 14:20\n\n**Кин:** Решили делать soft-nudge, открыто: ревизия на планёрке.\n**Claude:** Итог: эвристика в checkpoint, stop не блокируем.',
  });
  assert.equal(res.structured.checkpoint, true);
  assert.match(res.structured.journal_reminder, /journal_block/);
  assert.ok(res.structured.journal_reminder.length < 120);
  assert.match(res.text, /journal_block/);
});

test('checkpoint с journal_block не напоминает про журнал', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 14:21\n\n**Кин:** Решили soft-nudge.\n**Claude:** Итог: делаем.',
    journal_block: '## 2026-08-02 14:21 · heys\n\nВводная: soft-nudge.\nИтог: эвристика в checkpoint.',
  });
  assert.equal(res.structured.journal_reminder, undefined);
});

test('checkpoint на простой захват не шумит journal_reminder', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 14:22\n\n**Кин:** Ок, записал задачу про soft-nudge.\n**Claude:** Положил в projects/heys.md.',
  });
  assert.equal(res.structured.journal_reminder, undefined);
  assert.equal(res.structured.fact_reminder, undefined);
});

test('checkpoint напоминает про факт о мире без tasks_learn', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 14:23\n\n**Кин:** Марка машины — Camel AGM, без старт-стопа.\n**Claude:** Запомню для справки, в журнал не кладу.',
  });
  assert.match(res.structured.fact_reminder, /tasks_learn/);
  assert.ok(res.structured.fact_reminder.length < 100);
  assert.equal(res.structured.journal_reminder, undefined);
});

test('checkpointOutputReminders: тёзки без learn', () => {
  const r = tasks.checkpointOutputReminders({
    transcriptBlock: '## 14:24\n\n**Кин:** Маша-фотограф и Маша-аниматор — это разные люди.\n**Claude:** Буду различать суффиксом роли.',
  });
  assert.ok(r.fact_reminder);
  assert.equal(r.journal_reminder, undefined);
});

test('checkpointOutputReminders: learn уже был — без fact_reminder', () => {
  const r = tasks.checkpointOutputReminders({
    transcriptBlock: '## 14:25\n\n**Кин:** Марка — Camel.\n**Claude:** Записал через tasks_learn kind «факт».',
  });
  assert.equal(r.fact_reminder, undefined);
});

test('checkpoint напоминает про доску после сдачи без синхронизации спутников', async () => {
  const api = liveTasksApi();
  const res = await session(api).tasks_checkpoint({
    transcript_block: '## 22:10\n\n**Кин:** сделай всё как надо до конца.\n**Claude:** Закрыл heys/97e63a: smoke ок, тесты 901/901 зелёные. Готово.',
  });
  assert.match(res.structured.board_reminder, /доске/);
  assert.ok(res.structured.board_reminder.length < 120);
  assert.match(res.text, /standup/);
  assert.ok(!/полный текст правил|см\. выше|напоминание-спутник/i.test(res.text));
});

test('checkpointOutputReminders: спутники уже сняты — без board_reminder', () => {
  const r = tasks.checkpointOutputReminders({
    transcriptBlock: '## 22:11\n\n**Кин:** ок.\n**Claude:** Закрыл heys/97e63a, пункт планёрки снял через tasks_standup done, #next убрал.',
  });
  assert.equal(r.board_reminder, undefined);
});

test('checkpointOutputReminders: простой захват без сдачи — без board_reminder', () => {
  const r = tasks.checkpointOutputReminders({
    transcriptBlock: '## 22:12\n\n**Кин:** Добавь задачу про soft-nudge доски.\n**Claude:** Положил в projects/heys.md.',
  });
  assert.equal(r.board_reminder, undefined);
});

test('checkpointOutputReminders: сильная сдача без хэша всё равно напоминает про доску', () => {
  const r = tasks.checkpointOutputReminders({
    transcriptBlock: '## 22:13\n\n**Кин:** доведи.\n**Claude:** Довёл до конца: smoke пройден, задеплоил на прод.',
  });
  assert.ok(r.board_reminder);
});

// ── Свежесть и вес источника в поиске ────────────────────────────────────
//
// Слова отвечают на «про то ли это», но не на «что читать первым». Проверяется
// не сам факт поправок, а их баланс: поправка обязана уступать смыслу, иначе
// вчерашняя болтовня вытеснит решение по теме — ровно то, ради чего
// ранжирование и переделывалось.

const RANK_TODAY = '2026-08-02';

test('надбавки не могут перебить одно совпавшее слово', () => {
  const w = tasks.RANK_WEIGHTS;
  const ceiling = w.SOURCE_MAX + w.RECENCY_MAX + w.EXACT_BONUS + w.LINK_BONUS;
  assert.ok(
    ceiling < w.WORD_WEIGHT,
    `потолок надбавок ${ceiling} обязан быть ниже цены слова ${w.WORD_WEIGHT}: иначе свежесть начнёт решать за смысл`,
  );
});

test('журнал читается не только с начала месяца: берутся лучшие строки, а не первые', () => {
  // До 04.08 обход останавливался на пятом совпадении сверху вниз. Журнал —
  // один файл на месяц и дописывается вниз, поэтому бюджет всегда съедали
  // записи первых чисел, а сегодняшняя запись не читалась никогда. К концу
  // месяца слой становился недостижим целиком.
  const early = Array.from({ length: 8 }, (_, i) => `Мимоходом про батарею, разговор ${i + 1}.`).join('\n');
  const hits = tasks.searchFiles([{
    path: 'journal/2026-08.md',
    text: `## 2026-08-01\n\n${early}\n\n## 2026-08-30\n\nАртикул батареи для магазина — VARTA 577 400 078.\n`,
  }], 'артикул батареи', { today: RANK_TODAY, any: true });

  assert.ok(
    hits.some((h) => /577 400 078/.test(h.text)),
    'нужная строка в конце файла обязана доезжать, иначе свежий журнал недостижим',
  );
});

test('отменённая версия не выдаётся за действующую: снятие весит как решение', () => {
  // Инцидент 04.08: на «почему дело не в клемме» приходило «это классика
  // плохого контакта, а не севшего АКБ», а строка про снятие версии — нет.
  // Ответ по такой выдаче уверенно повторяет опровергнутый замером диагноз.
  const hits = tasks.searchFiles([{
    path: 'journal/2026-08.md',
    text: '## 2026-08-04\n\n'
      + 'Клемма рыжая от окисла, это классика плохого контакта.\n'
      + 'Снял и поставил клемму обратно — питание вернулось.\n'
      + 'Прикурили прямо на клемму, завелась сразу.\n'
      + 'Ещё раз про клемму: контакт грели, следов нет.\n'
      + 'Замер показал 4.37 В на клемме.\n'
      + 'Версия про окисленную клемму снимается: замкнутая банка.\n',
  }], 'клемма', { today: RANK_TODAY, any: true, limitPerFile: 3 });

  assert.ok(
    hits.some((h) => /снимается/.test(h.text)),
    'строка, отменяющая версию, обязана попадать в выдачу вперёд самой версии',
  );
});

test('длинные слова не склеиваются по трём первым буквам', () => {
  // Порог в три буквы писался под «зал»/«зала», а применялся ко всему подряд:
  // «квантовой» ↔ «квартира», «сколько» ↔ «скобках». Из-за этого честное
  // «ничего не нашлось» не выдавалось никогда.
  const sameStart = (word, line) => tasks.matchTerms(line, [{ word, kind: 'word' }]).score > 0;
  assert.equal(sameStart('квантовой', 'квартира в центре'), false);
  assert.equal(sameStart('сколько', 'в скобках рекомендация'), false);
  assert.equal(sameStart('машина', 'Маша-аниматор придёт'), false);
  // Короткие формы, ради которых правило и заводилось, продолжают сходиться.
  assert.equal(sameStart('зала', 'поехали до зал'), true);
  assert.equal(sameStart('дома', 'вернулись домой'), true);
  assert.equal(sameStart('лендингу', 'правки по лендинг'), true);
});

test('при равном совпадении слов свежая запись идёт первой', () => {
  const line = 'Говорили про зеркало в коридоре.';
  const hits = tasks.searchFiles([
    { path: 'journal/2026-05.md', text: `## 2026-05-06\n\n${line}\n` },
    { path: 'journal/2026-08.md', text: `## 2026-08-01\n\n${line}\n` },
  ], 'зеркало коридоре', { today: RANK_TODAY });

  assert.equal(hits.length, 2);
  assert.equal(hits[0].path, 'journal/2026-08.md', 'вчерашнее упоминание нужнее майского');
  assert.equal(hits[0].score, hits[1].score, 'по словам записи неразличимы — переставила именно свежесть');
});

test('дата берётся из заголовка дня, а не из имени месячного журнала', () => {
  // Обе записи в одном файле: по имени `journal/2026-08.md` они были бы
  // одинаково «первого августа», и свежесть не различила бы их вовсе.
  const hits = tasks.searchFiles([{
    path: 'journal/2026-08.md',
    text: '## 2026-08-01\n\nПро зеркало в коридоре.\n\n## 2026-08-30\n\nПро зеркало в коридоре.\n',
  }], 'зеркало коридоре', { today: '2026-08-30' });

  assert.equal(hits[0].date, '2026-08-30', 'запись тридцатого числа ближе к сегодня');
  assert.equal(hits[0].line, 7);
  assert.equal(hits[1].date, '2026-08-01');
});

test('месячная запись слабеет плавно, а не проваливается в ноль', () => {
  const today = tasks.recencyBonus(0);
  const month = tasks.recencyBonus(30);
  const year = tasks.recencyBonus(365);
  assert.ok(month > today / 2, `месяц назад — ${month} из ${today}, это не провал`);
  assert.ok(month < today, 'но и не наравне со свежим');
  assert.ok(year > 0 && year < month / 10, 'годовалая запись почти невесома, но не отброшена');
});

test('старое решение по теме не проваливается под свежее вскользь-упоминание', () => {
  // Слов поровну — единственное, чем записи различаются, это дата и то, что
  // одна из них решение, а вторая пересказ.
  const hits = tasks.searchFiles([
    { path: 'journal/2026-06.md', text: '## 2026-06-20\n\nРешили: лендинг уходит в релиз версией D.\n' },
    { path: 'journal/2026-08.md', text: '## 2026-08-01\n\nЗаодно посмотрел лендинг, релиз не трогали.\n' },
  ], 'лендинг релиз', { today: RANK_TODAY, any: true });

  assert.equal(hits[0].score, hits[1].score, 'по словам записи равны');
  assert.equal(hits[0].path, 'journal/2026-06.md', 'принятое решение весомее свежего пересказа');
  assert.equal(hits[0].weight, tasks.RANK_WEIGHTS.SOURCE_MAX);
});

test('решение весомее пересказа, задача весомее журнала, стенограмма легче всех', () => {
  const plain = 'зеркало в коридоре';
  const journal = tasks.sourceWeight('journal/2026-08.md', plain);
  const task = tasks.sourceWeight('projects/family.md', `- [ ] P2 ${plain}`);
  const decision = tasks.sourceWeight('journal/2026-08.md', `Решили: ${plain}`);
  const prefs = tasks.sourceWeight('docs/preferences.md', plain);
  const transcript = tasks.sourceWeight('transcript/2026-08-02.md', `Решили: ${plain}`);

  assert.ok(decision > task, 'решение весомее задачи');
  assert.ok(task > journal, 'задача весомее пересказа в журнале');
  assert.ok(journal > transcript, 'стенограмма легче журнала');
  assert.equal(transcript, 0, 'сырой лог разговора вес не набирает даже словом «решили»');
  assert.equal(prefs, decision, 'как он решает — это тоже решение');
});

test('запись, связанная руками через «см:», поднимается над случайным совпадением', () => {
  // Порядок намеренно против связи: без надбавки за «см:» первым остаётся
  // heys — он идёт раньше по списку файлов, а по словам все трое равны.
  const files = [
    { path: 'projects/heys.md', text: '# HEYS\n\n## Задачи\n\n- [ ] P2 Ремонт лендинга ^2026-08-01\n' },
    {
      path: 'projects/kinderly.md',
      text: '# Kinderly\n\n## Задачи\n\n- [ ] P1 Смета на ремонт зала ^2026-08-01\n',
    },
    {
      path: 'projects/family.md',
      text: `# Семья\n\n## Задачи\n\n- [ ] P2 Оплата ремонта ^2026-08-01\n  - см: kinderly/${tasks.taskHash('kinderly', 'Смета на ремонт зала')} — одна и та же смета\n`,
    },
  ];
  const opts = { today: RANK_TODAY, linkPairs: tasks.linkEndpointPairs(files) };
  const hits = tasks.searchFiles(files, 'ремонт', opts);

  const linked = hits.filter((h) => h.linked).map((h) => h.path);
  assert.deepEqual(new Set(linked), new Set(['projects/kinderly.md', 'projects/family.md']));
  assert.equal(
    hits[hits.length - 1].path,
    'projects/heys.md',
    'совпавшее только словом уходит под пару, связанную руками',
  );
});

test('битая ссылка связью не считается', () => {
  const files = [{
    path: 'projects/family.md',
    text: '# Семья\n\n## Задачи\n\n- [ ] P2 Оплата ремонта ^2026-08-01\n  - см: kinderly/0000000 — задачи такой уже нет\n',
  }];
  assert.deepEqual(tasks.linkEndpointPairs(files), []);
});

test('поиск инструментом отдаёт порядок ранжирования, а не порядок файлов', async () => {
  const api = liveApi({
    [tasks.keyForPath('journal/2026-05.md')]: { path: 'journal/2026-05.md', text: '## 2026-05-06\n\nПро зеркало в коридоре.\n', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('journal/2026-08.md')]: { path: 'journal/2026-08.md', text: '## 2026-08-01\n\nПро зеркало в коридоре.\n', rev: 1, updatedAt: 1 },
  });
  const res = await session(api).tasks_search({ query: 'зеркало коридоре' });
  assert.equal(res.structured.matches[0].path, 'journal/2026-08.md');
  assert.ok(res.structured.matches[0].rank > res.structured.matches[1].rank);
});

test('контекст темы поднимает свежую запись журнала над старой', async () => {
  // Обе записи в одном файле и старая идёт первой: порядок обхода за свежесть
  // здесь не отработает, переставить их может только сама поправка.
  const api = liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    [tasks.keyForPath('journal/2026-07.md')]: {
      path: 'journal/2026-07.md',
      text: '## 2026-07-01\n\nСобирали версию лендинга.\n\n## 2026-07-30\n\nСобирали версию лендинга.\n',
      rev: 1,
      updatedAt: 1,
    },
  });
  const res = await session(api).tasks_context({ topic: 'что там с версией лендинга' });
  const journal = res.structured.journal;
  assert.ok(journal.length >= 2);
  assert.equal(journal[0].date, '2026-07-30', 'июльская запись тридцатого числа нужнее первой');
  assert.equal(journal[1].date, '2026-07-01');
});

test('«требует решения» весом решения не считается', () => {
  const open = tasks.sourceWeight('projects/heys.md', '  - открыто: требует решения — какая версия в релиз?');
  const decided = tasks.sourceWeight('projects/heys.md', '  - решение: в релиз идёт версия D');
  assert.ok(open < decided, 'нерешённое не должно всплывать наравне с решённым');
  assert.equal(decided, tasks.RANK_WEIGHTS.SOURCE_MAX);
});

// ── Напоминания, быстрые дела, идеи ──────────────────────────────────────
//
// Три разные истории, и проверяется в них разное. У напоминаний своё
// хранилище — значит, проверяется файл: заводится, снимается, снятое не
// притворяется активным и повторное снятие ничего не портит. У быстрых дел
// хранилища нет вовсе — значит, проверяется, что выборка не притащила лишнего.
// У идей проверяется перенос: без накопленного превращение в задачу теряет
// ровно то, ради чего идею и держали.

const SOMEDAY = `# Когда-нибудь

Отложено осознанно, а не забыто.

## Задачи

## Идеи
`;

const QUICK_PROJECT = `# HEYS

## Задачи

- [ ] P1 Собрать лендинг due:2026-08-04 #ноут ^2026-08-01
- [ ] P2 Отписать Ване #15min ^2026-08-01
- [x] P2 Уже сделанное короткое #15min ^2026-08-01
- [ ] P3 Разобрать почту #30min ^2026-08-01
- [ ] P2 Переписать движок #2h ^2026-08-01
`;

function ideasApi() {
  return liveApi({
    [tasks.keyForPath('projects/someday.md')]: { path: 'projects/someday.md', text: SOMEDAY, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
  });
}

function quickApi() {
  return liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: QUICK_PROJECT, rev: 1, updatedAt: 1 },
  });
}

const remindersText = (api) => (api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)] || {}).text || '';

test('напоминание заводится с днём и объясняет свой формат в самом файле', async () => {
  const api = liveApi({});
  const res = await session(api).tasks_remind({ text: 'Поздравить брата', date: '2026-08-05', time: '9:00' });
  assert.equal(res.structured.created, true);
  assert.equal(res.structured.time, '09:00', 'час приводится к тому же виду, в каком лёг в файл');

  const text = remindersText(api);
  assert.match(text, /- \[ \] 2026-08-05 09:00 · Поздравить брата/);
  // Шапка — не украшение: файл правится руками, и без неё формат придётся угадывать.
  assert.match(text, /Формат строки/);
  assert.match(text, /напоминание не делают/i);

  const list = await session(api).tasks_remind({});
  assert.equal(list.structured.active.length, 1);
  assert.equal(list.structured.active[0].text, 'Поздравить брата');
});

test('снятое напоминание уходит из активных, но остаётся в файле', async () => {
  const api = liveApi({});
  await session(api).tasks_remind({ text: 'Продлить страховку', date: '2026-08-04' });
  const off = await session(api).tasks_remind({ done: 'страхов' });
  assert.equal(off.structured.removed, true);

  assert.match(remindersText(api), /- \[x\] 2026-08-04 · Продлить страховку/, 'снятое видно в файле галочкой, а не стёрто');
  const list = await session(api).tasks_remind({});
  assert.equal(list.structured.active.length, 0);
  assert.equal(list.structured.done, 1);
  assert.match(list.text, /Активных напоминаний нет/);
});

test('повторное снятие ничего не портит и файл не трогает', async () => {
  const api = liveApi({});
  await session(api).tasks_remind({ text: 'Продлить страховку', date: '2026-08-04' });
  await session(api).tasks_remind({ done: 'страхов' });
  const before = api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)];

  const again = await session(api).tasks_remind({ done: 'страхов' });
  assert.equal(again.structured.removed, false);
  assert.equal(again.structured.reason, 'already_done');
  assert.equal(api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)].rev, before.rev, 'второе снятие не пишет новую ревизию');
  assert.equal(api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)].text, before.text);
});

test('просроченное напоминание не пропадает, а идёт первым', async () => {
  const api = liveApi({});
  await session(api).tasks_remind({ text: 'Забрать посылку', date: '2026-07-30' });
  await session(api).tasks_remind({ text: 'Поздравить брата', date: '2026-08-05' });

  const list = await session(api).tasks_remind({});
  assert.equal(list.structured.overdue.length, 1);
  assert.equal(list.structured.active[0].text, 'Забрать посылку');
  assert.match(list.text, /Просрочено \(1\)/);
});

test('напоминание без дня не заводится молча, а отправляет к тегу места', async () => {
  const api = liveApi({});
  await assert.rejects(
    () => session(api).tasks_remind({ text: 'Напомнить, когда буду в студии' }),
    (e) => {
      assert.equal(e.code, 'date_required');
      // Отказ полезен, только если у него есть адрес: за местом не следит
      // ничто, но тег места на задаче существует и работает.
      assert.match(e.message, /tasks_capture/);
      assert.match(e.message, /tasks_focus/);
      return true;
    },
  );
  assert.equal(remindersText(api), '', 'отказ не оставляет за собой пустой файл');
});

test('под одно слово подошло два напоминания — снимать наугад нельзя', async () => {
  const api = liveApi({});
  await session(api).tasks_remind({ text: 'Позвонить в автосервис', date: '2026-08-04' });
  await session(api).tasks_remind({ text: 'Позвонить маме', date: '2026-08-05' });
  const before = api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)].text;

  await assert.rejects(
    () => session(api).tasks_remind({ done: 'позвонить' }),
    (e) => e.code === 'ambiguous_reminder' && /автосервис/.test(e.message) && /маме/.test(e.message),
  );
  assert.equal(api.kv[tasks.keyForPath(tasks.REMINDERS_PATH)].text, before);
});

test('быстрые дела берут только открытое с тегом времени в пределах порога', async () => {
  const res = await session(quickApi()).tasks_quick({});
  const titles = res.structured.picked.map((t) => t.title);
  assert.deepEqual(titles, ['Отписать Ване'], 'пятнадцатиминутное и только оно');
  assert.ok(!titles.includes('Уже сделанное короткое'), 'закрытая задача — не быстрое дело');
  assert.ok(!titles.includes('Собрать лендинг'), 'без тега времени задача сюда не попадает');
  assert.ok(res.structured.picked[0].ref.startsWith('heys/'), 'адрес есть — закрывать её обычным путём');
});

test('порог сдвигается, и в него входит всё, что короче', async () => {
  const res = await session(quickApi()).tasks_quick({ minutes: 60 });
  assert.deepEqual(
    res.structured.picked.map((t) => t.title).sort(),
    ['Отписать Ване', 'Разобрать почту'],
  );
  assert.ok(!res.structured.picked.some((t) => t.title === 'Переписать движок'), 'двухчасовое в час не влезает');
});

test('пустой список быстрых дел объясняет, что дело в тегах, а не в отсутствии дел', async () => {
  const api = liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
  });
  const res = await session(api).tasks_quick({});
  assert.equal(res.structured.picked.length, 0);
  assert.equal(res.structured.without_time_tag, res.structured.open_total);
  assert.match(res.text, /без тега времени/, 'иначе пустой ответ читается как «дел нет»');
});

const ORDERS_PROJECT = `# Kinderly

## Задачи

- [ ] P2 Заказать свисток #заказ ^2026-08-04
  - площадка: Озон
  - цена: ~500
- [ ] P2 Заказать фурнитуру для баскетбола #заказ ^2026-08-04
- [ ] P2 Собрать реквизит ^2026-08-04
`;

function ordersApi() {
  return liveApi({
    [tasks.keyForPath('projects/kinderly.md')]: { path: 'projects/kinderly.md', text: ORDERS_PROJECT, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('money/2026-08.md')]: { path: 'money/2026-08.md', text: '# Август\n', rev: 1, updatedAt: 1 },
  });
}

test('«Быстро заказать» берёт только открытое с тегом #заказ и показывает площадку с ценой', async () => {
  const res = await session(ordersApi()).tasks_orders({});
  assert.equal(res.structured.open.length, 2);
  const whistle = res.structured.open.find((o) => o.title === 'Заказать свисток');
  assert.equal(whistle.place, 'Озон');
  assert.equal(whistle.price, '~500');
  assert.ok(!res.structured.open.some((o) => o.title === 'Собрать реквизит'), 'без тега #заказ сюда не попадает');
});

test('закрытие покупки без суммы не проходит — иначе трата пропадёт молча', async () => {
  await assert.rejects(
    () => session(ordersApi()).tasks_orders({ done: 'свисток', contour: 'kinderly' }),
    (e) => e.code === 'invalid_amount',
  );
});

test('закрытие покупки без контура не проходит', async () => {
  await assert.rejects(
    () => session(ordersApi()).tasks_orders({ done: 'свисток', amount: 300 }),
    (e) => e.code === 'contour_required',
  );
});

test('закрытие покупки ставит галочку в проекте и пишет расход в money одним ходом', async () => {
  const api = ordersApi();
  const res = await session(api).tasks_orders({ done: 'свисток', amount: 300, contour: 'kinderly' });
  assert.equal(res.structured.title, 'Заказать свисток');
  assert.equal(res.structured.amount, 300);

  const projectText = api.kv[tasks.keyForPath('projects/kinderly.md')].text;
  assert.match(projectText, /^- \[x\] P2 Заказать свисток #заказ/m, 'задача закрыта в самом проекте');

  const moneyText = api.kv[tasks.keyForPath('money/2026-08.md')].text;
  assert.match(moneyText, /-300 заказы ~kinderly · Заказать свисток/, 'расход попал в money в формате, который читает доска');

  const list = await session(api).tasks_orders({});
  assert.equal(list.structured.open.length, 1, 'купленное больше не висит в списке');
});

test('идея копит мысли и уходит в задачу вместе с ними', async () => {
  const api = ideasApi();
  await session(api).tasks_idea({ text: 'Бот, который сам ведёт дневник' });
  await session(api).tasks_idea({ idea: 'бот', note: 'начать с текстового ввода' });
  const second = await session(api).tasks_idea({ idea: 'бот', note: 'нужен long polling' });
  assert.equal(second.structured.notes, 2);

  const moved = await session(api).tasks_idea({ idea: 'бот', to_project: 'heys' });
  assert.equal(moved.structured.notes_moved, 2);

  const project = api.kv[tasks.keyForPath('projects/heys.md')].text;
  assert.match(project, /- \[ \] P2 Бот, который сам ведёт дневник \^2026-08-02/);
  assert.match(project, /\n {2}- начать с текстового ввода\n {2}- нужен long polling/, 'накопленное переехало под задачу');
  assert.match(moved.structured.ref, /^heys\/[0-9a-f]{6}$/);

  const someday = api.kv[tasks.keyForPath('projects/someday.md')].text;
  assert.ok(!/Бот, который сам ведёт дневник/.test(someday), 'из идей она ушла — иначе будет жить в двух местах');
  assert.ok(!/long polling/.test(someday), 'и мысли под ней тоже');
  const left = await session(api).tasks_idea({});
  assert.equal(left.structured.ideas.length, 0);
});

test('идея не притворяется задачей и в списки задач не лезет', async () => {
  const api = ideasApi();
  await session(api).tasks_idea({ text: 'Бот, который сам ведёт дневник' });
  const list = await session(api).tasks_list({});
  assert.ok(
    !list.structured.overdue.concat(list.structured.next, list.structured.blocked)
      .some((t) => /Бот, который/.test(t.title)),
    'идею нельзя закрыть галочкой, поэтому среди задач ей делать нечего',
  );
  const someday = tasks.ensureFile(api.kv[tasks.keyForPath('projects/someday.md')], 'projects/someday.md');
  assert.equal(tasks.parseTasks(someday).length, 0);
});

test('превращение в несуществующий проект идею не трогает', async () => {
  const api = ideasApi();
  await session(api).tasks_idea({ text: 'Бот, который сам ведёт дневник' });
  const before = api.kv[tasks.keyForPath('projects/someday.md')].text;

  await assert.rejects(
    () => session(api).tasks_idea({ idea: 'бот', to_project: 'heyss' }),
    (e) => e.code === 'project_not_found',
  );
  assert.equal(api.kv[tasks.keyForPath('projects/someday.md')].text, before, 'идея не должна уехать в файл-призрак');
});

test('напоминания, быстрые дела и идеи объявлены и в схемах, и обработчиком', () => {
  const built = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  for (const name of ['tasks_remind', 'tasks_quick', 'tasks_idea']) {
    const schema = built.schemas.find((s) => s.name === name);
    assert.ok(schema, `${name} объявлен в схемах — иначе модель его не увидит`);
    assert.equal(schema.inputSchema.type, 'object');
    assert.equal(typeof built.tools[name], 'function', `${name} имеет обработчик`);
  }
});

test('подготовка к событию описана как три роли, а не как «заводи всё тройками»', () => {
  const rules = curatorInstructions('Антон', true);
  const prep = rules.split('\n').filter((l) => /^З\d+\. (Подготовка к чужому событию|Три роли)/.test(l));
  assert.equal(prep.length, 2, 'правило про подготовку и правило про его границы');
  const [roles, limits] = prep;
  // Три роли названы вместе с инструментами — иначе агент заведёт только задачу.
  for (const tool of ['tasks_capture', 'tasks_slot', 'tasks_remind']) assert.match(roles, new RegExp(tool));
  assert.match(roles, /ref/, 'слот связывается с задачей, а не просто называется похоже');
  assert.match(roles, /спроси/, 'длительность и нужность напоминания не угадываются');
  // Граница обязательна: без неё правило превращается в генератор троек.
  assert.match(limits, /в тот же день/);
  assert.match(limits, /просто задача/);
});

// ── Заголовок стенограммы обязан быть временем ───────────────────────────
//
// Без этого порядок дня восстанавливается только глазами, не кодом. Дёшево
// и без предупреждений: свободная формулировка отклоняется до записи.

test('заголовок стенограммы принимает время и диапазон', () => {
  assert.equal(tasks.transcriptHeadingError('transcript/2026-08-03.md', '## 14:35\n**Кин:** текст'), null);
  assert.equal(tasks.transcriptHeadingError('transcript/2026-08-03.md', '## ~16:50–18:10\n**Кин:** текст'), null);
  assert.equal(tasks.transcriptHeadingError('transcript/2026-08-03.md', '## 9:05\n**Кин:** текст'), null);
});

test('заголовок стенограммы темой вместо времени отклоняется', () => {
  const err = tasks.transcriptHeadingError('transcript/2026-08-03.md', '## Планёрка · идеи\n**Кин:** текст');
  assert.ok(err && /не время/.test(err));
});

test('запись без заголовка в стенограмму отклоняется', () => {
  const err = tasks.transcriptHeadingError('transcript/2026-08-03.md', '**Кин:** текст без заголовка вовсе');
  assert.ok(err && /Нужен заголовок/.test(err));
});

test('проверка заголовка не трогает журнал и другие файлы', () => {
  assert.equal(tasks.transcriptHeadingError('journal/2026-08.md', '## Планёрка · идеи'), null);
  assert.equal(tasks.transcriptHeadingError('projects/heys.md', 'просто текст'), null);
});

test('tasks_append отклоняет тематический заголовок в стенограмме до записи файла', async () => {
  const api = liveTasksApi();
  await assert.rejects(
    () => session(api).tasks_append({ path: 'transcript/2026-08-03.md', block: '## Планёрка · обсуждение\n**Кин:** текст' }),
    (e) => e.code === 'invalid_transcript_heading',
  );
  assert.ok(!api.kv[tasks.keyForPath('transcript/2026-08-03.md')], 'файл не создан и не изменён');
});

// ── Гонка записей: две сессии в один задачник ────────────────────────────
//
// Воспроизведено 2026-08-03: 20 одновременных записей от двух сессий, одна
// пропала, инструмент ответил `ok`. Отпечаток потери — совпавшая ревизия в
// двух ответах: обе сессии писали от одной основы, вторая легла поверх первой.
// Здесь чужая сессия не «где-то параллельно», а вставлена ровно в тот момент,
// где раньше терялось: между чтением инструмента и записью либо сразу после
// записи, до того как её успели проверить.

/**
 * Хранилище со второй сессией внутри. `onRead` даёт ей записать сразу после
 * того, как инструмент прочитал файл; `onWrite` — сразу после нашей записи,
 * до проверки. Оба крючка одноразовые: чужая сессия пишет один раз, иначе
 * повтор было бы не с чем сравнивать.
 */
function raceApi(files) {
  const api = liveApi(files);
  let onRead = null;
  let onWrite = null;
  const readOne = api.getKVByCurator;
  const writeMany = api.upsertKVManyByCurator;

  api.onRead = (key, fn) => { onRead = { key, fn }; };
  api.onWrite = (fn) => { onWrite = fn; };
  api.getKVByCurator = async (bearer, clientId, key) => {
    const res = await readOne(bearer, clientId, key);
    if (onRead && onRead.key === key) { const { fn } = onRead; onRead = null; fn(api.kv); }
    return res;
  };
  api.upsertKVManyByCurator = async (bearer, clientId, items, contextId) => {
    const res = await writeMany(bearer, clientId, items, contextId);
    if (onWrite) { const fn = onWrite; onWrite = null; fn(api.kv); }
    return res;
  };
  return api;
}

/** Чужая сессия дописала свою строку — со своей, уже свежей основы. */
function foreignAppend(path, line) {
  return (kv) => {
    const key = tasks.keyForPath(path);
    const cur = kv[key] || { path, text: '', rev: 0, updatedAt: 0 };
    kv[key] = { path, text: `${cur.text}${line}\n`, rev: cur.rev + 1, updatedAt: 2 };
    const files = (kv[tasks.INDEX_KEY] && kv[tasks.INDEX_KEY].files) || {};
    kv[tasks.INDEX_KEY] = { files: { ...files, [path]: { rev: kv[key].rev, updatedAt: 2 } }, updatedAt: 2 };
  };
}

/**
 * Чужая запись от ТОЙ ЖЕ основы: ложится поверх нашей и получает ту же
 * ревизию. Это и есть воспроизведённая потеря.
 */
function foreignClobber(path, base, line) {
  return (kv) => {
    kv[tasks.keyForPath(path)] = {
      path, text: `${base.text}${line}\n`, rev: base.rev + 1, updatedAt: 2,
    };
  };
}

function raceFiles() {
  return {
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    [tasks.keyForPath('projects/family.md')]: { path: 'projects/family.md', text: FAMILY_PROJECT, rev: 2, updatedAt: 1 },
  };
}

test('дописывание переживает чужую запись между чтением и записью', async () => {
  const api = raceApi(raceFiles());
  api.onRead(tasks.keyForPath('projects/family.md'), foreignAppend('projects/family.md', '- [ ] P3 Чужая задача ^2026-08-02'));

  const res = await session(api).tasks_capture({ text: 'Наша задача', project: 'family' });

  const saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.match(saved, /Чужая задача/, 'чужая запись на месте — поверх неё не легли');
  assert.match(saved, /Наша задача/, 'наша запись тоже на месте');
  assert.equal(res.structured.rev, 4, 'ревизия считается от свежей основы, а не от прочитанной');
});

test('правка задачи поверх чужой не проходит и говорит, что делать', async () => {
  const api = raceApi(raceFiles());
  const hash = tasks.taskHash('heys', 'Прогнать месячный аудит ПДн');
  api.onRead(tasks.keyForPath('projects/heys.md'), foreignAppend('projects/heys.md', '- [ ] P1 Чужая задача ^2026-08-02'));

  await assert.rejects(
    () => session(api).tasks_update({ project: 'heys', hash, state: 'done' }),
    (e) => {
      assert.equal(e.code, 'stale_write_blocked');
      assert.match(e.message, /Перечитай файл/);
      assert.match(e.message, /ревизия 3, сейчас 4/);
      return true;
    },
  );

  const saved = api.kv[tasks.keyForPath('projects/heys.md')].text;
  assert.match(saved, /Чужая задача/, 'чужая запись цела');
  assert.match(saved, /- \[ \] P2 Прогнать месячный аудит/, 'наша правка не легла — и об этом сказано вслух');
});

test('затирание сразу после записи не проходит молча — совпавшая ревизия ловится', async () => {
  const api = raceApi(raceFiles());
  const hash = tasks.taskHash('heys', 'Прогнать месячный аудит ПДн');
  // Чужая сессия писала от той же основы (ревизия 3) и легла поверх нашей:
  // у обеих записей выходит ревизия 4 — тот самый отпечаток из аудита.
  api.onWrite(foreignClobber('projects/heys.md', { text: HEYS_PROJECT, rev: 3 }, '- [ ] P1 Чужая задача ^2026-08-02'));

  await assert.rejects(
    () => session(api).tasks_update({ project: 'heys', hash, state: 'done' }),
    (e) => {
      assert.equal(e.code, 'stale_write_blocked');
      assert.match(e.message, /не удержалась/, 'сказано, что записанного в файле нет');
      assert.match(e.message, /той же ревизией 4/, 'назван отпечаток потери — совпавшая ревизия');
      return true;
    },
  );

  const saved = api.kv[tasks.keyForPath('projects/heys.md')].text;
  assert.match(saved, /Чужая задача/);
  assert.ok(!/- \[x\] P2 Прогнать месячный аудит/.test(saved), 'нашей правки нет — и вызов это признал ошибкой');
});

test('дописывание, затёртое сразу после записи, повторяется на свежем тексте', async () => {
  const api = raceApi(raceFiles());
  api.onWrite(foreignClobber('projects/family.md', { text: FAMILY_PROJECT, rev: 2 }, '- [ ] P3 Чужая задача ^2026-08-02'));

  const res = await session(api).tasks_capture({ text: 'Наша задача', project: 'family' });

  const saved = api.kv[tasks.keyForPath('projects/family.md')].text;
  assert.match(saved, /Чужая задача/, 'чужая запись на месте');
  assert.match(saved, /Наша задача/, 'наша дописана поверх свежего текста');
  assert.equal(saved.match(/Наша задача/g).length, 1, 'повтор не задвоил запись');
  assert.equal(res.structured.rev, 4);
});

test('чужая копия индекса не уносит след нашей записи', async () => {
  const api = raceApi(raceFiles());
  // Индекс один на весь задачник, поэтому за него дерутся даже записи в
  // РАЗНЫЕ файлы: чужой батч кладёт свою копию целиком.
  api.onWrite((kv) => {
    kv[tasks.INDEX_KEY] = { files: { 'projects/kinderly.md': { rev: 1, updatedAt: 2 } }, updatedAt: 2 };
  });

  await session(api).tasks_capture({ text: 'Наша задача', project: 'family' });

  const index = api.kv[tasks.INDEX_KEY];
  assert.equal(index.files['projects/family.md'].rev, 3, 'наш след в индексе восстановлен — иначе пуллер правку не заберёт');
  assert.ok(index.files['projects/kinderly.md'], 'чужой след при починке не потерян');
});

test('запись в свой файл не выкидывает из индекса чужой, заведённый по ходу сессии', async () => {
  const api = raceApi(raceFiles());
  const tools = session(api);
  await tools.tasks_capture({ text: 'Первая', project: 'family' });

  // Другая сессия завела новый файл и отметила его в индексе. У нашей сессии
  // индекс в этот момент уже прочитан и лежит в памяти.
  api.kv[tasks.keyForPath('projects/kinderly.md')] = { path: 'projects/kinderly.md', text: '# Kinderly\n\n## Задачи\n', rev: 1, updatedAt: 2 };
  api.kv[tasks.INDEX_KEY] = {
    files: { ...api.kv[tasks.INDEX_KEY].files, 'projects/kinderly.md': { rev: 1, updatedAt: 2 } },
    updatedAt: 2,
  };

  await tools.tasks_capture({ text: 'Вторая', project: 'heys' });

  const index = api.kv[tasks.INDEX_KEY];
  assert.ok(index.files['projects/kinderly.md'], 'чужой файл остался в индексе — правка в наш файл его не вытеснила');
  assert.equal(index.files['projects/heys.md'].rev, 4);
  assert.equal(index.files['projects/family.md'].rev, 3);
});

test('rotateFileText у journal снимает старые блоки сверху', () => {
  const big = [
    '## 2026-08-01 10:00 · старое',
    'текст'.repeat(15000),
    '## 2026-08-02 11:00 · середина',
    'ещё'.repeat(15000),
    '## 2026-08-02 12:00 · свежее',
    'хвост',
  ].join('\n\n');
  const rotated = tasks.rotateFileText('journal/2026-08.md', big);
  assert.ok(rotated.archives.length >= 1, 'должен появиться архив');
  assert.match(rotated.active, /2026-08-02 12:00/);
  assert.ok(tasks.utf8ByteLength(rotated.active) <= tasks.TASKS_ROTATE_TARGET_BYTES);
});

test('checkpoint на переполненный journal идёт дельтой, не полным телом', async () => {
  const api = withWrites();
  const journalKey = tasks.keyForPath('journal/2026-08.md');
  const huge = '## 2026-08-01 10:00 · старое\n' + 'x'.repeat(tasks.TASKS_ROTATE_TARGET_BYTES);
  api.kv[journalKey] = { path: 'journal/2026-08.md', text: huge, rev: 3, updatedAt: 1 };

  await session(api).tasks_checkpoint({
    transcript_block: '## 12:44\n\n**Кин:** тест дельты\n\n**Claude:** ответ дельты полный по смыслу, не выжимка — достаточно длинный для проверки.',
    journal_block: '## 2026-08-02 12:44 · дельта\n\nВводная: journal переполнен.\nРазбор: пишем блоком.\nИтог: append RPC.',
  });

  const appendWrites = api.writes.filter((w) => w.append);
  assert.ok(appendWrites.length >= 1, 'должна быть хотя бы одна дельта-запись');
  assert.ok(appendWrites.some((w) => w.append.path === 'journal/2026-08.md'));
  assert.match(api.kv[journalKey].text, /Итог: append RPC/);
});

test('корпус журнала включает archive/journal_* после ротации', () => {
  assert.equal(tasks.isJournalCorpusPath('journal/2026-08.md'), true);
  assert.equal(tasks.isJournalCorpusPath('archive/journal_2026-08_part1.md'), true);
  assert.equal(tasks.isJournalCorpusPath('archive/transcript_2026-08-06_part1.md'), false);
  assert.equal(tasks.isTranscriptCorpusPath('transcript/2026-08-06.md'), true);
  assert.equal(tasks.isTranscriptCorpusPath('archive/transcript_2026-08-06_part2.md'), true);
  assert.equal(tasks.sourceWeight('archive/journal_2026-08_part1.md', 'обычная строка'), 1.5);
  assert.equal(tasks.sourceWeight('archive/transcript_2026-08-06_part1.md', 'Решили: что-то'), 0);
  assert.equal(tasks.datedGroup('archive/journal_2026-08_part1.md'), 'journal');
  assert.equal(tasks.datedGroup('archive/transcript_2026-08-06_part1.md'), 'transcript');
});

test('tasks_context поднимает выводы из archive/journal_* и сырьё из archive/transcript_*', async () => {
  const journalArch = 'archive/journal_2026-08_part1.md';
  const transcriptArch = 'archive/transcript_2026-08-01_part1.md';
  const api = fakeApi({
    files: {
      [tasks.keyForPath(journalArch)]: {
        path: journalArch,
        text: '## 2026-08-01 10:00 · батарея\n\nВводная: какая батарея была.\nИтог: артикул старой батареи VARTA 577 400 078.\n',
        rev: 1,
        updatedAt: 1,
      },
      [tasks.keyForPath('journal/2026-08.md')]: {
        path: 'journal/2026-08.md',
        text: '## 2026-08-07 12:00 · свежее\n\nИтог: сегодня другое.\n',
        rev: 2,
        updatedAt: 2,
      },
      [tasks.keyForPath(transcriptArch)]: {
        path: transcriptArch,
        text: '## 10:05\n\n**Кин:** какая батарея была в машине раньше\n\n**Claude:** VARTA 577 400 078 — это в архивной стенограмме.\n',
        rev: 1,
        updatedAt: 1,
      },
      [tasks.keyForPath('projects/heys.md')]: {
        path: 'projects/heys.md',
        text: '# HEYS\n\n## Задачи\n\n- [ ] P2 Починить запись стенограммы ^2026-08-06\n',
        rev: 1,
        updatedAt: 1,
      },
    },
    index: {
      files: {
        [journalArch]: { rev: 1, updatedAt: 1 },
        'journal/2026-08.md': { rev: 2, updatedAt: 2 },
        [transcriptArch]: { rev: 1, updatedAt: 1 },
        'projects/heys.md': { rev: 1, updatedAt: 1 },
      },
      updatedAt: 2,
    },
  });
  const res = await session(api).tasks_context({ topic: 'артикул батареи VARTA' });
  assert.ok(
    (res.structured.journal || []).some((h) => /577 400 078/.test(h.text) && /archive\/journal_/.test(h.path)),
    'вывод из archive/journal_* обязан попадать в journalHits',
  );
  assert.ok(
    (res.structured.transcript || []).some((h) => /archive\/transcript_/.test(h.path)),
    'сырьё из archive/transcript_* поднимается отдельно',
  );
  assert.match(res.text, /записей в журнале/);
  assert.match(res.text, /сырья стенограммы/);
});

// ── Отметка по ходу дня против закрытия дня ──────────────────────────
//
// 3 сентября галочку умел ставить только tasks_close_day, а он обязан писать
// заметку «> как прошло» — по ней доска и считает день закрытым. Отметка в
// обед объявляла день законченным, и одиннадцать ещё не наступивших пунктов
// читались как «не состоялись».

// Регулярка доски, слово в слово из build_board.py: событие пишется для неё,
// и разойтись формату молча нельзя — вечерний «План и факт» просто опустеет.
const BOARD_EVENT_RE =
  /^~\s+(\d{2}:\d{2})\s+(закрыт|удалён|сдвинут)\s*·\s*(\d{2}:\d{2})-(\d{2}:\d{2})\s*(.*)$/;

test('отметка слота ставит галочку и пишет событие, дня не закрывая', async () => {
  const api = withBoard();
  const tools = build(api);
  const res = await tools.tasks_slot_done({ slot: '17:00' });

  const text = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  assert.match(text, /- \[x\] 17:00–22:00 Дом у родителей/, 'галочка на месте');

  const event = text.split('\n').find((line) => line.startsWith('~ '));
  assert.ok(event, 'событие дня записано');
  const parsed = BOARD_EVENT_RE.exec(event);
  assert.ok(parsed, `доска не прочитает такую строку: ${event}`);
  assert.equal(parsed[2], 'закрыт');
  assert.equal(parsed[3], '17:00');
  assert.equal(parsed[4], '22:00');
  assert.match(parsed[5], /Дом у родителей/);

  assert.equal(tasks.dayNote(text), null, 'заметку дня отметка не пишет');
  assert.equal(res.structured.dayClosed, false);
  assert.match(res.text, /День не закрываю/);
});

test('повторная отметка не плодит событий и не двигает время', async () => {
  const api = withBoard();
  const tools = build(api);
  await tools.tasks_slot_done({ slot: '17:00', at: '18:20' });
  const after = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  const second = await tools.tasks_slot_done({ slot: '17:00' });

  const text = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  assert.equal(text, after, 'второй вызов файл не меняет');
  assert.equal(second.structured.already, true);
  assert.equal(text.split('\n').filter((l) => l.startsWith('~ ')).length, 1);
  assert.match(text, /~ 18:20 закрыт/, 'время из первого вызова осталось');
});

test('закрытие дня пишет событие каждому отмеченному слоту', async () => {
  const api = withBoard();
  const tools = build(api);
  await tools.tasks_close_day({ date: '2026-08-02', done: ['17:00'], note: 'обычный день' });

  const text = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  const events = text.split('\n').filter((line) => line.startsWith('~ '));
  assert.equal(events.length, 1, 'у отмеченного слота есть событие');
  assert.ok(BOARD_EVENT_RE.test(events[0]), events[0]);
  assert.equal(tasks.dayNote(text).text, 'обычный день', 'заметка на месте');
});

test('слот, отмеченный по ходу дня, при закрытии не получает второго события', async () => {
  const api = withBoard();
  const tools = build(api);
  await tools.tasks_slot_done({ slot: '17:00', at: '18:20' });
  await tools.tasks_close_day({ date: '2026-08-02', done: ['17:00'], note: 'день прошёл' });

  const text = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  assert.equal(text.split('\n').filter((l) => l.startsWith('~ ')).length, 1);
  assert.match(text, /~ 18:20 закрыт/);
  assert.equal(tasks.dayNote(text).text, 'день прошёл');
});

test('несуществующий слот — понятный отказ, файл не тронут', async () => {
  const api = withBoard();
  const tools = build(api);
  const before = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  await assert.rejects(() => tools.tasks_slot_done({ slot: 'полёт на Луну' }));
  assert.equal(api.kv[tasks.keyForPath('days/2026-08-02.md')].text, before);
});

test('время закрытия пишется ЧЧ:ММ, мусор отбивается до записи', async () => {
  const api = withBoard();
  const tools = build(api);
  const before = api.kv[tasks.keyForPath('days/2026-08-02.md')].text;
  await assert.rejects(() => tools.tasks_slot_done({ slot: '17:00', at: 'вечером' }));
  assert.equal(api.kv[tasks.keyForPath('days/2026-08-02.md')].text, before);
});
