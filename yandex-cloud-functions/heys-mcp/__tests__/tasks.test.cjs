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

test('tasks_money без контура не проходит', async () => {
  const api = withBoard();
  await assert.rejects(() => build(api).tasks_money({ amount: 500, title: 'кофе' }),
    (e) => e.code === 'contour_required');
  assert.equal(api.writes.length, 0);
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
  const origMany = api.getKVManyByCurator;
  const orig = api.getKVByCurator;
  api.getKVByCurator = async (b, c, k) => (k === key
    ? { data: { path: 'money/2026-08.md', text: month, rev: 1, updatedAt: 1 }, error: null }
    : orig(b, c, k));
  api.getKVManyByCurator = origMany;

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

test('ночью метка создания ставится московским числом', async () => {
  const api = withWrites();
  const night = createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs: Date.UTC(2026, 7, 2, 22, 30), ToolError }).tools;
  await night.tasks_capture({ text: 'Ночная мысль', project: 'family' });
  const saved = api.writes[0].items.find((i) => i.k === tasks.keyForPath('projects/family.md')).v.text;
  assert.match(saved, /Ночная мысль \^2026-08-03/, 'метка обязана быть московской датой');
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

const { curatorInstructions } = require('../lib/curator');

test('у каждого нового инструмента задачника есть повод в правилах', () => {
  const rules = curatorInstructions('Антон', true);
  for (const [tool, why] of [
    ['tasks_delta', /начале сессии|прошлого прохода/],
    ['tasks_link', /не по словам|общих слов/],
    ['tasks_review', /три находки|потолок в три/],
    ['tasks_proposal', /месяц/],
    ['tasks_focus', /максимум три|три задачи/],
  ]) {
    assert.match(rules, new RegExp(tool), `${tool} нигде не назван — модель его не вызовет`);
    assert.match(rules, why, `у ${tool} нет объяснения, когда его звать`);
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

test('шестая нерешённая развилка на доску не ложится', async () => {
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
  const { schemas } = createTasksTools({ api: liveApi({}), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError });
  const known = new Set(schemas.map((s) => s.name));
  const named = new Set(curatorInstructions('Антон', true).match(/tasks_[a-zа-яё_]+/gi) || []);
  assert.ok(named.has('tasks_calendar') && named.has('tasks_budget'), 'новые правила названы своими именами');
  for (const name of named) assert.ok(known.has(name), `правило обещает несуществующий инструмент ${name}`);
});

// ── Эксперимент «два ответа» ─────────────────────────────────────────────

test('блок эксперимента живёт до дедлайна и исчезает после', () => {
  const during = curatorInstructions('Антон', true, Date.UTC(2026, 7, 5));
  assert.match(during, /Эксперимент до 2026-08-10/);
  assert.match(during, /tasks_vote/);
  const after = curatorInstructions('Антон', true, Date.UTC(2026, 7, 12));
  assert.ok(!/Эксперимент до 2026-08-10/.test(after), 'временный режим не должен тихо стать вечным');
  // Основные правила при этом на месте.
  assert.match(after, /^З1\./m);
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
  const money = rules.split('\n').find((l) => l.startsWith('З8.'));
  assert.ok(money, 'правило про деньги на месте');
  // README требует вносить сводку самому и ставить контур самому; прежняя
  // формулировка «сумму и контур бери у него» ровно этому противоречила.
  assert.ok(!/контур бери у него/.test(money));
  assert.match(money, /не переспрашивая/);
  assert.match(money, /контур ставь сам/);
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
