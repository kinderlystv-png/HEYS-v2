'use strict';

/**
 * Вложения в карточку: файл из разговора уезжает в приватное хранилище, а на
 * доске остаётся строка, которая его называет.
 *
 * Проверяется здесь три вещи, и все три ломаются молча.
 *
 * Первая — токен. Он не входит в аргументы, не выходит в ответе и не выходит
 * в тексте ошибки. Секрет, однажды попавший в переписку, уезжает в стенограмму
 * и дальше в git; отменить это нельзя, можно только менять токен.
 *
 * Вторая — доска. Строка вложения — обычная вложенная строка markdown, и
 * `build_board.py` разбирает её своими выражениями. Формат, который её парсер
 * не поймёт, не «не покажется красиво», а собьёт нумерацию галочек: доска
 * адресует подпункты по индексу от заголовка задачи. Поэтому разбор доски
 * здесь повторён теми же выражениями, что и в ней самой.
 *
 * Третья — сеть. Настоящий GitHub в тестах не трогается вовсе: транспорт
 * подставной, и проверочный файл в боевой репозиторий не уезжает.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../lib/tasks');
const assets = require('../lib/assets');
const { createTasksTools } = require('../lib/tasks-tools');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const JWT = 'curator-jwt';
// 2026-08-03 12:00 UTC — по Москве это 15:00, и путь обязан быть московским.
const NOW = Date.UTC(2026, 7, 3, 12, 0);

/** Значение никогда не должно оказаться ни в одном возвращаемом тексте. */
const FAKE_TOKEN = 'github_pat_11ABCDEFG0aaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbCCCC';

class ToolError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const HEYS_PROJECT = `# HEYS

## Задачи

- [ ] P1 Собрать оптимальную версию лендинга due:2026-08-04 #next ^2026-08-01
  - зум демо-ролика почти готов
  - открыто: версия D закрывает эту задачу или нужен ещё вариант?
- [ ] P2 Разобрать счёт за август ^2026-08-01
`;

function liveApi(files = {}) {
  const kv = { ...files };
  kv[tasks.INDEX_KEY] = {
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

function projectApi() {
  return liveApi({
    [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
  });
}

/**
 * Подставной GitHub. Отдаёт то, что сказали, и записывает всё, что получил, —
 * включая заголовки, чтобы можно было убедиться: токен уходит в сеть и только
 * туда.
 */
function fakeGitHub({ status = 201, throws = null, echoToken = false } = {}) {
  const calls = [];
  const request = async (req) => {
    calls.push(req);
    if (throws) throw new Error(throws);
    if (echoToken) {
      // Некоторые прокси возвращают заголовок эхом в теле. Клиент обязан это
      // пережить, не вынеся секрет наружу.
      return { status, body: `bad credentials for ${FAKE_TOKEN}` };
    }
    return { status };
  };
  return { calls, request };
}

function attachTools(api, github, { token = FAKE_TOKEN, nowMs = NOW } = {}) {
  const client = assets.createAssetsClient({
    token,
    repo: 'kinderlystv-png/tasks-assets',
    branch: 'main',
    request: github.request,
  });
  return createTasksTools({
    api, curatorJwt: JWT, clientId: CLIENT, nowMs, ToolError, assetsClient: client,
  }).tools;
}

function hashOf(api, title) {
  const file = tasks.ensureFile(api.kv[tasks.keyForPath('projects/heys.md')], 'projects/heys.md');
  const found = tasks.parseTasks(file).find((t) => t.title.includes(title));
  assert.ok(found, `в проекте нет задачи «${title}»`);
  return tasks.taskHash('heys', found.title);
}

function projectText(api) {
  return api.kv[tasks.keyForPath('projects/heys.md')].text;
}

/** Небольшой валидный base64 нужной длины в байтах. */
function payload(bytes) {
  return Buffer.alloc(bytes, 7).toString('base64');
}

// ── Путь в хранилище ─────────────────────────────────────────────────────

test('путь собирается по соглашению: месяц, дата, московское время, слаг', () => {
  const path = assets.assetPath({ filename: 'Screenshot 2026.png', caption: 'скрин планёрки', nowMs: NOW });
  assert.equal(path, 'assets/2026-08/2026-08-03-1500-skrin-planerki.png');
});

test('путь берёт московское время, а не UTC — иначе вечерний файл ложится вчерашним днём', () => {
  // 2026-08-03 22:30 UTC = 2026-08-04 01:30 по Москве.
  const lateUtc = Date.UTC(2026, 7, 3, 22, 30);
  const path = assets.assetPath({ filename: 'a.png', caption: 'ночной скрин', nowMs: lateUtc });
  assert.match(path, /^assets\/2026-08\/2026-08-04-0130-/);
});

test('кириллица и мусор в подписи не попадают в путь', () => {
  const path = assets.assetPath({ filename: 'счёт.pdf', caption: 'Счёт от Ани / август!!!', nowMs: NOW });
  assert.match(path, /^assets\/2026-08\/2026-08-03-1500-schet-ot-ani-avgust\.pdf$/);
  assert.ok(!/[^\x20-\x7e]/.test(path), 'в пути осталась не-латиница');
});

test('путь вложения не выглядит адресом задачи и не станет ссылкой на доске', () => {
  // Доска линкует всё, что похоже на «проект/шестьхекс». Путь вложения под
  // это попадать не должен, иначе строка превратится в битую ссылку.
  const ADDR_RE = /([a-zа-яё0-9][a-zа-яё0-9_-]*)\/([0-9a-f]{6})\b/i;
  for (const caption of ['скрин', 'счёт abcdef', 'deadbeef']) {
    const path = assets.assetPath({ filename: 'x.png', caption, nowMs: NOW });
    assert.equal(ADDR_RE.test(path), false, `путь «${path}» доска примет за адрес задачи`);
  }
});

test('ни имя файла, ни подпись не выводят путь за папку вложений', () => {
  const nasty = ['../../evil.png', 'a/../b.png', '/etc/passwd.png', '....//x.png'];
  for (const filename of nasty) {
    const path = assets.assetPath({ filename, caption: 'скрин', nowMs: NOW });
    assert.match(path, assets.ASSET_PATH_RE, `имя «${filename}» увело путь наружу: ${path}`);
  }
  for (const caption of ['../../../etc/passwd', 'a/b/c', '..\\..\\x']) {
    const path = assets.assetPath({ filename: 'a.png', caption, nowMs: NOW });
    assert.match(path, assets.ASSET_PATH_RE, `подпись «${caption}» увела путь наружу: ${path}`);
  }
});

// ── Картинка и документ ──────────────────────────────────────────────────

test('картинка и документ различаются по расширению и имеют разные потолки', () => {
  assert.equal(assets.classifyKind('a.JPG').kind, 'image');
  assert.equal(assets.classifyKind('a.png').maxBytes, assets.IMAGE_MAX_BYTES);
  assert.equal(assets.classifyKind('счёт.pdf').kind, 'document');
  assert.equal(assets.classifyKind('смета.xlsx').maxBytes, assets.DOC_MAX_BYTES);
  assert.ok(assets.DOC_MAX_BYTES > assets.IMAGE_MAX_BYTES, 'документ не жмут, ему нужен запас больше');
  assert.equal(assets.classifyKind('вирус.exe').kind, null);
  assert.equal(assets.classifyKind('безрасширения').kind, null);
});

test('тяжёлая картинка отклоняется с указанием, до чего её дожать', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'big.png', caption: 'скрин', content_base64: payload(assets.IMAGE_MAX_BYTES + 1),
    }),
    (err) => {
      assert.equal(err.code, 'file_too_large');
      assert.match(err.message, /сожми/i);
      assert.match(err.message, /1000/, 'не сказано, до какой ширины жать');
      return true;
    },
  );
  assert.equal(github.calls.length, 0, 'отклонённый файл не должен уезжать в хранилище');
});

test('документ того же размера принимается — его пережимать нельзя', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'счёт');
  const res = await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'счёт.pdf', caption: 'счёт от Ани', content_base64: payload(assets.IMAGE_MAX_BYTES + 1),
  });
  assert.equal(res.structured.kind, 'document');
  assert.equal(github.calls.length, 1);
});

test('документ сверх собственного потолка отклоняется без совета сжимать', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'счёт');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'скан.pdf', caption: 'скан', content_base64: payload(assets.DOC_MAX_BYTES + 1),
    }),
    (err) => {
      assert.equal(err.code, 'file_too_large');
      assert.doesNotMatch(err.message, /сожми/i, 'документ жать нельзя, советовать это нельзя тоже');
      return true;
    },
  );
});

test('файл неизвестного вида не принимается вовсе', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'payload.exe', caption: 'что-то', content_base64: payload(10),
    }),
    (err) => err.code === 'unsupported_file',
  );
  assert.equal(github.calls.length, 0);
});

test('битый base64 отклоняется до похода в сеть', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  for (const bad of ['data:image/png;base64,AAAA', 'не base64!!', 'AAA', '']) {
    await assert.rejects(
      () => attachTools(api, github).tasks_attach({
        project: 'heys', hash, filename: 'a.png', caption: 'скрин', content_base64: bad,
      }),
      (err) => err.code === 'invalid_content',
      `«${bad}» принято за base64`,
    );
  }
  assert.equal(github.calls.length, 0);
});

test('вложение без подписи не заводится: потерянный файл оставит пустую строку', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'a.png', caption: '   ', content_base64: payload(10),
    }),
    (err) => err.code === 'caption_required',
  );
});

// ── Заливка и карточка ───────────────────────────────────────────────────

test('файл уходит в хранилище, а строка встаёт в карточку', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  const res = await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин версии D', content_base64: payload(2048),
  });

  assert.equal(github.calls.length, 1);
  const call = github.calls[0];
  assert.equal(call.method, 'PUT');
  assert.equal(call.url, 'https://api.github.com/repos/kinderlystv-png/tasks-assets/contents/assets/2026-08/2026-08-03-1500-skrin-versii-d.png');
  const body = JSON.parse(call.body);
  assert.equal(body.branch, 'main');
  assert.equal(body.content, payload(2048), 'байты обязаны уйти в хранилище целиком');

  assert.match(projectText(api), /^ {2}- вложение: assets\/2026-08\/2026-08-03-1500-skrin-versii-d\.png — скрин версии D$/m);
  assert.equal(res.structured.kind, 'image');
  assert.equal(res.structured.bytes, 2048);
});

test('строка вложения встаёт под своей задачей, а не под соседней', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'счёт');
  await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'invoice.pdf', caption: 'счёт', content_base64: payload(64),
  });
  const lines = projectText(api).split('\n');
  const at = lines.findIndex((l) => /вложение:/.test(l));
  assert.ok(at > 0);
  // Выше строки вложения — только её собственная задача.
  const owner = [...lines.slice(0, at)].reverse().find((l) => /^- \[/.test(l));
  assert.match(owner, /счёт за август/);
});

test('байты вложения не возвращаются в ответе — иначе они окажутся в переписке', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  const content = payload(4096);
  const res = await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин', content_base64: content,
  });
  const dump = JSON.stringify(res);
  assert.equal(dump.includes(content.slice(0, 64)), false, 'содержимое файла вернулось наружу');
  assert.equal(projectText(api).includes(content.slice(0, 64)), false, 'содержимое файла попало в карточку');
});

test('ответ говорит, что результат теперь в карточке, а не в переписке', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  const res = await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин', content_base64: payload(64),
  });
  assert.match(res.text, /карточк/i);
});

test('несуществующая задача останавливает вложение до заливки — сирот в хранилище не остаётся', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash: 'ffffff', filename: 'a.png', caption: 'скрин', content_base64: payload(64),
    }),
    (err) => err.code === 'task_not_found',
  );
  assert.equal(github.calls.length, 0, 'файл залит под задачу, которой нет');
});

test('отказ хранилища не оставляет в карточке ложной строки', async () => {
  const api = projectApi();
  const before = projectText(api);
  const github = fakeGitHub({ status: 403 });
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'a.png', caption: 'скрин', content_base64: payload(64),
    }),
    (err) => {
      assert.equal(err.code, 'attach_upload_failed');
      assert.match(err.message, /ничего не записано/i);
      return true;
    },
  );
  assert.equal(projectText(api), before, 'карточка изменилась, хотя файл не залит');
});

test('без настроенного доступа инструмент честно отказывает, а не делает вид', async () => {
  const api = projectApi();
  const hash = hashOf(api, 'лендинга');
  const tools = createTasksTools({
    api, curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError, env: {},
  }).tools;
  await assert.rejects(
    () => tools.tasks_attach({ project: 'heys', hash, filename: 'a.png', caption: 'скрин', content_base64: payload(64) }),
    (err) => err.code === 'attachments_not_configured',
  );
});

// ── Токен ────────────────────────────────────────────────────────────────

test('токен уходит только в сеть: ни в одном возвращаемом тексте его нет', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  const res = await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин', content_base64: payload(64),
  });

  assert.match(github.calls[0].headers.Authorization, /Bearer /, 'токен обязан дойти до GitHub');
  const outward = JSON.stringify(res) + projectText(api);
  assert.equal(outward.includes(FAKE_TOKEN), false, 'токен целиком оказался снаружи');
  assert.equal(outward.includes(FAKE_TOKEN.slice(0, 16)), false, 'наружу вышел кусок токена');
  assert.equal(/github_pat_|ghp_|gho_/.test(outward), false, 'наружу вышло что-то похожее на токен');
});

test('токен не выходит наружу через текст ошибки от GitHub', async () => {
  const api = projectApi();
  const github = fakeGitHub({ status: 401, echoToken: true });
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'a.png', caption: 'скрин', content_base64: payload(64),
    }),
    (err) => {
      assert.equal(err.code, 'attach_upload_failed');
      assert.equal(err.message.includes(FAKE_TOKEN), false, 'токен вышел в тексте ошибки');
      assert.equal(err.message.includes(FAKE_TOKEN.slice(0, 16)), false, 'кусок токена вышел в тексте ошибки');
      assert.equal(/github_pat_|ghp_/.test(err.message), false);
      assert.match(err.message, /просрочен|отозван/i, 'ошибка должна объяснять, что делать');
      return true;
    },
  );
});

test('токен не выходит наружу через сбой сети', async () => {
  const api = projectApi();
  const github = fakeGitHub({ throws: `socket hang up while sending Bearer ${FAKE_TOKEN}` });
  const hash = hashOf(api, 'лендинга');
  await assert.rejects(
    () => attachTools(api, github).tasks_attach({
      project: 'heys', hash, filename: 'a.png', caption: 'скрин', content_base64: payload(64),
    }),
    (err) => {
      assert.equal(err.message.includes(FAKE_TOKEN), false);
      assert.equal(err.message.includes(FAKE_TOKEN.slice(0, 16)), false);
      return true;
    },
  );
});

test('вырезание секрета ловит и часть токена, и чужой токен', () => {
  assert.equal(assets.scrubToken(`x ${FAKE_TOKEN} y`, FAKE_TOKEN).includes('github_pat'), false);
  assert.equal(assets.scrubToken(`x ${FAKE_TOKEN.slice(0, 20)} y`, FAKE_TOKEN).includes('github_pat'), false);
  assert.equal(assets.scrubToken('ghp_aaaaaaaaaaaaaaaaaaaa', 'другой-секрет').includes('ghp_'), false);
  assert.equal(assets.scrubToken('обычный текст', FAKE_TOKEN), 'обычный текст');
});

test('токен не описан в схеме инструмента — модель не должна уметь его передать', () => {
  // Схемы берём ровно те, что уезжают в claude.ai, — из самой сборки набора.
  const { schemas } = createTasksTools({
    api: projectApi(), curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError, env: {},
  });
  const schema = schemas.find((s) => s.name === 'tasks_attach');
  assert.ok(schema, 'tasks_attach не объявлен — модель его не увидит');
  const dump = JSON.stringify(schema).toLowerCase();
  for (const forbidden of ['token', 'токен', 'secret', 'pat', 'authorization']) {
    assert.equal(dump.includes(forbidden), false, `в схеме есть «${forbidden}» — появится способ прислать секрет`);
  }
  assert.deepEqual(schema.inputSchema.required, ['project', 'hash', 'filename', 'content_base64', 'caption']);
});

// ── Доска ────────────────────────────────────────────────────────────────

/**
 * Разбор вложенной строки повторяет `build_board.py`: SUB_RE снимает отступ и
 * необязательный маркер, дальше строка проверяется по SUBTASK_RE и REF_LINE_RE,
 * а всё остальное становится обычной строкой контекста.
 */
const BOARD_TASK_RE = /^- \[([ ~x>])\]\s*(.+?)\s*$/;
const BOARD_SUB_RE = /^\s{2,}[-*]?\s*(.+?)\s*$/;
const BOARD_SUBTASK_RE = /^\[([ x])\]\s*(.+?)\s*$/;
const BOARD_REF_LINE_RE = /^(?:[-*]\s*)?см\s*:\s*(.*)$/i;

function boardParse(text) {
  const out = [];
  let last = null;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const taskMatch = BOARD_TASK_RE.exec(line.trim());
    if (taskMatch && !line.startsWith('  ')) {
      last = { title: taskMatch[2], sub: [] };
      out.push(last);
      continue;
    }
    if (line.startsWith('  ') && last) {
      const sm = BOARD_SUB_RE.exec(line);
      if (sm) {
        const raw = sm[1];
        const st = BOARD_SUBTASK_RE.exec(raw);
        if (st) last.sub.push({ text: st[2], done: st[1] === 'x' });
        else if (BOARD_REF_LINE_RE.test(raw)) last.sub.push({ text: raw, done: null, lk: true });
        else last.sub.push({ text: raw, done: null });
      }
      continue;
    }
    last = null;
  }
  return out;
}

test('доска разбирает строку вложения как обычную строку контекста и не ломается', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин версии D', content_base64: payload(64),
  });

  const parsed = boardParse(projectText(api));
  const task = parsed.find((t) => t.title.includes('лендинга'));
  const attach = task.sub.find((s) => /вложение:/.test(s.text));
  assert.ok(attach, 'доска потеряла строку вложения');
  assert.equal(attach.done, null, 'строка вложения не должна выглядеть галочкой');
  assert.ok(!attach.lk, 'строка вложения не должна выглядеть ссылкой «см:»');
  assert.equal(attach.text, 'вложение: assets/2026-08/2026-08-03-1500-skrin-versii-d.png — скрин версии D');
});

test('вложение не сдвигает нумерацию подпунктов — по ней доска ставит галочки', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const withSubtasks = HEYS_PROJECT.replace(
    '  - зум демо-ролика почти готов',
    '  - зум демо-ролика почти готов\n  - [ ] собрать версию D\n  - [x] снять ролик',
  );
  api.kv[tasks.keyForPath('projects/heys.md')] = { path: 'projects/heys.md', text: withSubtasks, rev: 3, updatedAt: 1 };

  const before = boardParse(withSubtasks).find((t) => t.title.includes('лендинга'));
  const beforeChecks = before.sub.map((s, i) => [i, s.text, s.done]).filter(([, , d]) => d !== null);

  const hash = hashOf(api, 'лендинга');
  await attachTools(api, github).tasks_attach({
    project: 'heys', hash, filename: 'shot.png', caption: 'скрин', content_base64: payload(64),
  });

  const after = boardParse(projectText(api)).find((t) => t.title.includes('лендинга'));
  const afterChecks = after.sub.map((s, i) => [i, s.text, s.done]).filter(([, , d]) => d !== null);
  assert.deepEqual(afterChecks, beforeChecks, 'вложение сдвинуло индексы галочек — доска начнёт ставить их не туда');
});

test('строка вложения читается обратно тем же разбором, что её написал', () => {
  const line = assets.buildAttachLine({ path: 'assets/2026-08/2026-08-03-1500-skrin.png', caption: 'скрин версии D' });
  const parsed = assets.parseAttachLine(`  - ${line}`);
  assert.deepEqual(parsed, {
    path: 'assets/2026-08/2026-08-03-1500-skrin.png',
    caption: 'скрин версии D',
    kind: 'image',
  });
  assert.equal(assets.parseAttachLine('  - см: heys/8e3572 — общая смета'), null);
  assert.equal(assets.parseAttachLine('  - зум демо-ролика почти готов'), null);
  // Путь наружу папки вложений не признаётся вложением вовсе.
  assert.equal(assets.parseAttachLine('  - вложение: ../../secrets.md — ой'), null);
  assert.equal(assets.parseAttachLine('  - вложение: /etc/passwd'), null);
});

test('подпись не может увести строку на новую и подделать соседний пункт', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const hash = hashOf(api, 'лендинга');
  await attachTools(api, github).tasks_attach({
    project: 'heys',
    hash,
    filename: 'a.png',
    caption: 'скрин\n- [ ] поддельная задача\n  - открыто: подделка',
    content_base64: payload(64),
  });
  const text = projectText(api);
  assert.equal(/поддельная задача/.test(text) && /^- \[ \] поддельная/m.test(text), false, 'подпись развернулась в отдельную задачу');
  const parsed = boardParse(text);
  assert.equal(parsed.filter((t) => /поддельн/.test(t.title)).length, 0);
});

// ── Правило ──────────────────────────────────────────────────────────────

const { curatorInstructions } = require('../lib/curator');

test('у вложений есть правило: результат обязан осесть в карточке', () => {
  const rules = curatorInstructions('Антон', true);
  assert.match(rules, /tasks_attach/, 'инструмент нигде не назван — модель его не вызовет');
  assert.match(rules, /пока результат не лежит в карточке — работа не сделана/i);
  assert.match(rules, /вместо карточки — никогда/i, 'не сказано, что файл в чат не заменяет карточку');
});

test('правила задачника пронумерованы сплошь и без повторов', () => {
  const rules = curatorInstructions('Антон', true);
  const numbers = [...rules.matchAll(/(?:^|\n)\s*З(\d+)\./g)].map((m) => Number(m[1]));
  assert.ok(numbers.length >= 39, `правил всего ${numbers.length}`);
  const sorted = [...numbers].sort((a, b) => a - b);
  assert.deepEqual(sorted, numbers, 'правила идут не по порядку');
  assert.deepEqual(sorted, sorted.map((_, i) => i + 1), 'в нумерации правил дыра или повтор');
});
