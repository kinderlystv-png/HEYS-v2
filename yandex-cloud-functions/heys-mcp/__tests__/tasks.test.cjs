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
  const kvExtra = {
    [tasks.keyForPath('habits.md')]: { path: 'habits.md', text: HABITS, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('days/2026-08-02.md')]: { path: 'days/2026-08-02.md', text: DAY, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('money/2026-08.md')]: { path: 'money/2026-08.md', text: '# Август\n', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('archive/2026-08.md')]: { path: 'archive/2026-08.md', text: '# Архив\n', rev: 1, updatedAt: 1 },
  };
  const origGet = api.getKVByCurator;
  api.getKVByCurator = async (bearer, clientId, key) =>
    (kvExtra[key] !== undefined ? { data: kvExtra[key], error: null } : origGet(bearer, clientId, key));
  return api;
}

test('tasks_slot называет пересечения вместо молчания', async () => {
  const api = withBoard();
  const res = await build(api).tasks_slot({ date: '2026-08-02', from: '18:00', to: '20:00', title: 'Забрать торт' });
  assert.equal(res.structured.conflicts.length, 2);
  assert.match(res.text, /Пересекается с/);
});

test('tasks_money без контура не проходит', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_money({ amount: 500, title: 'кофе' }),
    (e) => e.code === 'contour_required');
  assert.equal(api.writes.length, 0);
});

test('tasks_money пишет операцию в месяц по дате', async () => {
  const api = withBoard();
  const res = await build(api).tasks_money({ amount: 7500, title: 'Зарплата Маше', contour: 'kinderly', date: '2026-08-02' });
  assert.equal(res.structured.path, 'money/2026-08.md');
  const saved = api.writes[0].items[0].v.text;
  assert.match(saved, /- 2026-08-02 7500 ₽ · Зарплата Маше · kinderly/);
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
