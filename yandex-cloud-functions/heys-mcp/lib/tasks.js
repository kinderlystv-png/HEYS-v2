'use strict';

/**
 * Задачник в KV: markdown-файлы репозитория `~/tasks` как ключи клиента.
 *
 * Зачем это здесь. Задачник жил в git, и запись в него требовала доступа к
 * папке на маке. С телефона такого доступа нет никогда, поэтому правки
 * складывались в очередь и ждали, пока откроют ноут. Перенос хранилища в
 * client_kv_store снимает это: писать можно из любой сессии тем же путём,
 * которым куратор ведёт дневники клиентов.
 *
 * Что осталось прежним: формат markdown, структура папок, доска. Файлы на
 * диске становятся зеркалом, которое выкладывает пуллер, а источник правды —
 * значение ключа здесь.
 *
 * Главный инвариант: инструмент никогда не принимает текст файла целиком.
 * Только операция — дописать строку, заменить блок по якорю. Целиковая запись
 * — единственный способ молча затереть правку соседней сессии, и он закрыт
 * тем, что такого аргумента у инструментов просто нет.
 *
 * От инструментов закрыт, но не от KV: сам файл всё равно уходит наверх
 * целиком (`batch_upsert_client_kv_by_curator`) — и инструментом, и мостом
 * задачника, который выкладывает зеркало на диск. Ревизию там считает клиент
 * между своим чтением и записью, поэтому 02.09 пуш зеркала унёс задачу,
 * заведённую из чата получасом раньше (789 → 790). Отсюда `tasksWriteConflict`
 * и `mergeIndexValues` ниже: ту же сверку делает сервер, единственное место,
 * которое видит обе стороны.
 *
 * Модуль не делает сетевых вызовов: всё тестируется без прод-доступа.
 */

const KEY_PREFIX = 'heys_tasks_';
const INDEX_KEY = `${KEY_PREFIX}index`;

/** Папки задачника, у которых файл именуется датой или месяцем. */
const DATED_DIRS = new Set(['days', 'journal', 'transcript', 'money', 'archive']);

/** Файлы в корне репозитория, которые входят в задачник. */
const ROOT_FILES = new Set(['NOW.md', 'INBOX.md', 'GOALS.md', 'README.md', 'CLAUDE.md', 'habits.md']);

/**
 * Путь → ключ. Разделитель пути превращается в подчёркивание, регистр
 * опускается: ключи KV живут в одном плоском пространстве, и `Projects/HEYS.md`
 * с `projects/heys.md` обязаны попадать в один и тот же ключ, иначе появится
 * второй файл-двойник, которого нет на диске.
 */
function keyForPath(path) {
  const clean = normalizePath(path);
  if (!clean) return null;
  const withoutExt = clean.replace(/\.md$/i, '');
  return `${KEY_PREFIX}${withoutExt.replace(/[/\\]+/g, '_').toLowerCase()}`;
}

/** Обратное преобразование: ключ → путь. Нужно пуллеру и выдаче поиска. */
function pathForKey(key) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return null;
  const tail = key.slice(KEY_PREFIX.length);
  if (!tail || tail === 'index') return null;

  const parts = tail.split('_');
  const dir = parts[0];
  if (DATED_DIRS.has(dir) || dir === 'projects' || dir === 'docs') {
    return `${dir}/${parts.slice(1).join('_')}.md`;
  }
  const root = [...ROOT_FILES].find((name) => name.replace(/\.md$/i, '').toLowerCase() === tail);
  return root || `${tail}.md`;
}

/**
 * Нормализация пути. Отсекаем всё, что уводит за пределы задачника: абсолютные
 * пути, `..`, ведущие слеши. Инструмент получает путь от модели, а не от
 * файловой системы, поэтому проверять его обязательно.
 */
// Заголовок обмена в стенограмме обязан быть временем, а не темой: без этого
// порядок дня восстановить может только человек, глазами, а не код. Проверка
// дешёвая — файл и так пишется, лишнего чтения нет — и жёсткая: свободная
// формулировка отклоняется, а не проходит с предупреждением.
const TRANSCRIPT_HEADING_RE = /^##\s*~?\d{1,2}:\d{2}(\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/m;

function transcriptHeadingError(path, block) {
  if (!/^transcript\/\d{4}-\d{2}-\d{2}\.md$/i.test(String(path || ''))) return null;
  const firstHeading = String(block || '').split('\n').find((l) => l.trim().startsWith('#'));
  if (!firstHeading) return 'Нужен заголовок обмена — время «## ЧЧ:ММ», а не тема.';
  if (!TRANSCRIPT_HEADING_RE.test(firstHeading.trim())) {
    return `Заголовок «${firstHeading.trim()}» не время. Стенограмма — «## ЧЧ:ММ» (диапазон «## ЧЧ:ММ–ЧЧ:ММ» тоже годится), не тема разговора: по времени день восстанавливается, по теме — только глазами.`;
  }
  return null;
}

/**
 * Разбор сторон обмена. Порядок Кина и Claude в блоке не важен — важен сам
 * факт, что обе подписи есть и у каждой есть тело.
 */
function parseTranscriptSides(block) {
  const text = String(block || '');
  const kinMatch = /^\*\*Кин:\*\*\s*/m.exec(text);
  const claudeMatch = /^\*\*Claude:\*\*\s*/m.exec(text);
  if (!kinMatch || !claudeMatch) return null;
  const kinStart = kinMatch.index + kinMatch[0].length;
  const claudeStart = claudeMatch.index + claudeMatch[0].length;
  if (kinMatch.index < claudeMatch.index) {
    return {
      kin: text.slice(kinStart, claudeMatch.index).trim(),
      claude: text.slice(claudeStart).trim(),
    };
  }
  return {
    kin: text.slice(kinStart).trim(),
    claude: text.slice(claudeStart, kinMatch.index).trim(),
  };
}

/**
 * Тело ответа без однострочных квадратных скобок «[вывод терминала: …]» —
 * они разрешены как сводка техвозни и в длину содержания не входят.
 */
function transcriptSubstance(side) {
  return String(side || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (/^\[[^\]]+\]$/.test(trimmed)) return '';
      return line;
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Жёсткая сверка дословности (heys/49f059). Сервер чат не видит — сравнивать
 * «с ответом агента на экране» нечем. Ловит то, что ловится кодом: пустые
 * стороны, отсылки «содержание в записи выше», чисто технический stub и
 * явный перекос длины (длинная реплика Кина + короткая выжимка Claude).
 * Автозапись дневника (`[Автозапись инструмента]`) и короткие подтверждения
 * при короткой реплике — не трогает.
 */
const TRANSCRIPT_STUB_RE = [
  /содержание обмена\s*[—–-]\s*в записи/i,
  /содержание обмена целиком в записи/i,
  /содержание обмена\s*[—–-]\s*в записи\s+\d{1,2}:\d{2}/i,
  /в записи\s+\d{1,2}:\d{2}\s+выше/i,
  /см\.\s*запись\s+\d{1,2}:\d{2}/i,
  /см\.\s*выше/i,
  /только журнальн/i,
  /здесь только журнальн/i,
  /^(кратко|сводка|выжимка)\s*[:：]/i,
];

/**
 * Реплика из одних знаков препинания — заглушка, а не короткий ответ.
 *
 * Сторона Кина законно бывает в одно слово: «да», «б», «давай.», «делай сам».
 * Длиной заглушку от такой реплики не отличить, поэтому ловится не краткость, а
 * её признак — в строке нет ни одной буквы и ни одной цифры.
 */
const KIN_PLACEHOLDER_RE = /^[^\p{L}\p{N}]+$/u;

function verbatimTranscriptError(block) {
  const sides = parseTranscriptSides(block);
  if (!sides) return null;
  if (!sides.kin) {
    return 'Checkpoint не принят: реплика Кина пуста — нужна дословная полная реплика, не заголовок.';
  }
  // 4 сентября в стенограмму встал блок 03:20 с «**Кин:** ?»: гейт видел
  // непустую сторону и пропустил. Обмен потерян насовсем — восстановить, что
  // человек тогда сказал, уже неоткуда, а в отчёте трейса эта строка выглядит
  // как содержание. У стороны Claude проверки на подмену содержания были с
  // самого начала, у стороны Кина — не было ни одной.
  if (KIN_PLACEHOLDER_RE.test(sides.kin)) {
    return `Checkpoint не принят: вместо реплики Кина стоит «${sides.kin}» — знаки без слов. `
      + 'Нужны его слова дословно. Если обмен пишется задним числом и реплики правда нет, '
      + 'напиши «[реплика не восстановлена]»: пропуск, названный вслух, честнее вопросительного '
      + 'знака, который через месяц читается как содержание.';
  }
  if (!sides.claude) {
    return 'Checkpoint не принят: реплика Claude пуста — нужен ответ полностью по содержанию (числа, марки, сроки), не одна подпись.';
  }

  const substance = transcriptSubstance(sides.claude);
  const isAuto = /^\[Автозапись инструмента\]/i.test(sides.claude.trim());
  const onlyBracket = /^\[[\s\S]*\]$/.test(sides.claude.trim());

  if (!isAuto && onlyBracket && TRANSCRIPT_STUB_RE.some((re) => re.test(sides.claude))) {
    return 'Checkpoint не принят: ответ Claude — техническая отсылка к другой записи, а не полный обмен. Допиши содержание сюда же; «см. выше» / «содержание в записи N» в стенограмму не годится (heys/49f059).';
  }

  for (const re of TRANSCRIPT_STUB_RE) {
    if (re.test(sides.claude) && substance.length < 120) {
      return 'Checkpoint не принят: ответ Claude похож на сводку или отсылку без содержания. Нужен полный ответ в этом же блоке — детали из разбора теряются первыми.';
    }
  }

  if (!isAuto && sides.kin.length >= 80 && substance.length > 0 && substance.length < 40) {
    return 'Checkpoint не принят: ответ Claude слишком короткий относительно реплики Кина — похоже на сжатие до выжимки. Сжимать разрешено только форму, не смысл (transcript/README.md).';
  }

  if (!isAuto && !substance) {
    return 'Checkpoint не принят: после вычёркивания технических сводок в квадратных скобках у Claude не осталось содержания.';
  }

  return null;
}

const CHECKPOINT_JOURNAL_REMINDER = 'Похоже, нужен journal_block — допиши в следующем checkpoint.';
const CHECKPOINT_FACT_REMINDER = 'Похоже, нужен tasks_learn (kind «факт»).';
const CHECKPOINT_BOARD_REMINDER = 'Сверь спутников на доске (standup / открыто / #next) и сними лишнее.';

const JOURNAL_NUDGE_STRONG_RE = [
  /итог\s*:/i,
  /открыто\s*:/i,
  /снято\s*:/i,
  /разбор\s*:/i,
  /(?:heys|kinderly|family|personal|travel|someday|mine2d)\/[0-9a-f]{6}/i,
  /tasks_(?:decision|resolve)/i,
];

const JOURNAL_NUDGE_WEAK_RE = [
  /решил[иа]?/i,
  /решено/i,
  /делаем/i,
  /вариант/i,
  /отклон/i,
  /положил/i,
  /зав[её]л/i,
  /развилк/i,
  /\d[\d\s]*(?:₽|руб\.?)/i,
];

const FACT_NUDGE_RE = [
  /марка/i,
  /машин[аыу]?/i,
  /площад/i,
  /склад/i,
  /разные люди/i,
  /кто есть кто/i,
  /вид\s*[«"]факт[»"]/i,
  /факт\s+о\s+мире/i,
  /[-\p{L}\d]+-[-\p{L}\d]+\s+и\s+[-\p{L}\d]+-[-\p{L}\d]+\s+—\s+это\s+разные/iu,
];

const FACT_ALREADY_RECORDED_RE = [
  /tasks_learn/i,
  /kind\s*[«"]факт[»"]/i,
  /записал.*(?:памят|факт)/i,
];

/** Сдача работы / закрытие scope — повод сверить спутники на доске. */
const BOARD_NUDGE_STRONG_RE = [
  /tasks_update[^\n]{0,80}(?:state\s*[:=]\s*['"]?done|done)/i,
  /state\s*[:=]\s*['"]?done['"]?/i,
  /закрыл(?:а|и)?\s+(?:задач|пункт|scope|хэш|heys\/|kinderly\/)/i,
  /закрыто\s+\d{1,2}\.\d{2}/i,
  /\[x\].{0,40}(?:heys|kinderly|family|personal|travel|someday|mine2d)\/[0-9a-f]{6}/i,
  /(?:heys|kinderly|family|personal|travel|someday|mine2d)\/[0-9a-f]{6}.{0,40}\[x\]/i,
  /smoke\s*(?:ок|пройден|зелён|green|passed)/i,
  /задепло(?:ил|ен)|на проде/i,
  /дов[её]л(?:а|и)?\s+до\s+конца/i,
  /сдал(?:а|и)?\s+(?:задач|scope|работу)/i,
];

const BOARD_NUDGE_WEAK_RE = [
  /готов[оа]/i,
  /сделано/i,
  /критери[йи].{0,30}закрыт/i,
  /тесты?\s*(?:зелён|прошл|ok|ок)/i,
  /901\/901/,
];

const BOARD_ALREADY_SYNCED_RE = [
  /tasks_standup/i,
  /standup[^\n]{0,40}done/i,
  /актуализир\w*\s+(?:доск|standup|планёр)/i,
  /снял(?:а|и)?\s+(?:пункт|с\s+планёр|#next|открыто|#blocked)/i,
  /build_board/i,
  /на доске через/i,
  /спутник\w*\s+снят/i,
  /related\s+board/i,
];

const SIMPLE_KIN_RE = /^(?:спасибо|ок|да|нет|хорошо|понял|ясно)\.?$/i;

/**
 * Soft-nudge после checkpoint: журнал/факт/доска не обязательны, но если обмен
 * похож на разбор, факт о мире или сдачу работы — одна приписка в ответ
 * (precision > recall). Hard-block только у стенограммы.
 */
function checkpointOutputReminders({ transcriptBlock, journalBlock } = {}) {
  const jb = String(journalBlock || '').trim();
  const sides = parseTranscriptSides(transcriptBlock);
  if (!sides) return {};

  const kin = sides.kin.trim();
  const claude = sides.claude.trim();
  const text = `${kin}\n${claude}`;

  if (/просто запиши/i.test(kin)) return {};
  if (SIMPLE_KIN_RE.test(kin) && !JOURNAL_NUDGE_STRONG_RE.some((re) => re.test(text))
    && !BOARD_NUDGE_STRONG_RE.some((re) => re.test(text))) return {};

  const out = {};

  if (!jb) {
    const strong = JOURNAL_NUDGE_STRONG_RE.some((re) => re.test(text));
    const weakHits = JOURNAL_NUDGE_WEAK_RE.filter((re) => re.test(text)).length;
    if (strong || weakHits >= 2) out.journal_reminder = CHECKPOINT_JOURNAL_REMINDER;
  }

  if (!FACT_ALREADY_RECORDED_RE.some((re) => re.test(claude))
    && FACT_NUDGE_RE.some((re) => re.test(text))) {
    out.fact_reminder = CHECKPOINT_FACT_REMINDER;
  }

  if (!BOARD_ALREADY_SYNCED_RE.some((re) => re.test(claude))) {
    const boardStrong = BOARD_NUDGE_STRONG_RE.some((re) => re.test(text));
    const boardWeak = BOARD_NUDGE_WEAK_RE.filter((re) => re.test(text)).length;
    const hasHash = /(?:heys|kinderly|family|personal|travel|someday|mine2d)\/[0-9a-f]{6}/i.test(text);
    if (boardStrong || (boardWeak >= 2 && hasHash) || (boardWeak >= 1 && hasHash && /закрыл|закрыто|done|\[x\]/i.test(text))) {
      out.board_reminder = CHECKPOINT_BOARD_REMINDER;
    }
  }

  return out;
}

/**
 * Рабочий день задачника, а не календарное число. Сутки кончаются в 3 утра —
 * та же граница, что в дневнике HEYS. Мысль, записанная в час ночи, относится
 * к дню, который человек ещё живёт; закрывать в это время надо его же.
 *
 * От `moscowDate` отличается только сдвигом: та отвечает на «какое сейчас
 * число», эта — на «какой сейчас день». После полуночи это разные ответы.
 */
const DAY_START_HOUR = 3;

function taskDay(nowMs = Date.now()) {
  return moscowDate(nowMs - DAY_START_HOUR * 60 * 60 * 1000);
}

function normalizePath(path) {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('/') || /^[a-z]:/i.test(raw)) return null;
  const segments = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }
  if (!segments.length) return null;
  const joined = segments.join('/');
  return /\.md$/i.test(joined) ? joined : `${joined}.md`;
}

/**
 * Файлы, которые правит только владелец задачника.
 *
 * В самих файлах это написано словами: «Пишет только он» в money/budget.md и
 * «Правит его только он» в GOALS.md. До сих пор запрет жил лишь в тексте
 * правил, а инструменты пускали в оба файла беспрепятственно — правило без
 * опоры в коде держится ровно до первой уверенной просьбы «поправь лимит».
 * Список намеренно один на весь модуль: разложенный по обработчикам, он
 * рассыпался бы при добавлении следующего пишущего инструмента.
 */
const OWNER_ONLY_FILES = ['GOALS.md', 'money/budget.md'];

/**
 * Путь → защищённый файл, если это он. Сравнение идёт по нормализованному
 * пути в нижнем регистре: `Money/Budget` и `money/budget.md` — один файл, и
 * обойти отказ разным написанием нельзя.
 */
function ownerOnlyFile(path) {
  const clean = normalizePath(path);
  if (!clean) return null;
  const lower = clean.toLowerCase();
  return OWNER_ONLY_FILES.find((guarded) => guarded.toLowerCase() === lower) || null;
}

/** Текст отказа. Отдельно, чтобы объяснение было одно на все инструменты. */
function ownerOnlyRefusal(guarded) {
  return `${guarded} правит только он сам — так решил владелец задачника. Отказ не обходится: даже прямая просьба «поправь тут» его не снимает. Принеси ему предложение словами: что и на что поменять и почему. Правку он внесёт сам.`;
}

/**
 * Сегодняшняя дата по Москве.
 *
 * Задачник живёт по МСК: слоты в `days/`, метки `^` и операции в деньгах.
 * `toISOString()` считает по UTC, и с полуночи до трёх часов ночи по Москве
 * такая «сегодняшняя» дата молча уезжает на вчера — прямо в файл дня, где
 * ошибку на сутки уже никто не заметит. Поэтому дата всегда берётся с
 * указанием пояса, а не из смещения сервера.
 */
const MOSCOW_TZ = 'Europe/Moscow';

function moscowDate(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Час и минута по Москве — для отметок, где важен не день, а момент. */
function moscowTime(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: MOSCOW_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}`;
}

/** Пустой файл — валидное состояние: месяц журнала мог ещё не начаться. */
function emptyFile(path) {
  return { path: normalizePath(path), text: '', rev: 0, updatedAt: 0 };
}

/**
 * Значение ключа приводится к одной форме независимо от того, что там лежит.
 * Старые записи могли быть простой строкой — принимаем и её, чтобы миграция
 * формата не требовала одномоментной перезаписи всего задачника.
 */
/**
 * Переводы строк приводятся к LF на входе задачника.
 *
 * Разборы режут текст по переводу строки, а саму строку разбирают
 * регуляркой — и точка в JS не совпадает с CR, а якорь конца строки без
 * флага m перед ним не встаёт. На файле с CRLF parseTaskLine не совпадает
 * ни разу, и проект молча становится пустым: 18.08 так пропали все 144
 * задачи heys — планёрка не показала ни одной просрочки проекта, зато
 * объявила шесть живых слотов ссылками на задачи, которых нет. Источник
 * CRLF внешний (git с core.autocrlf на Windows), поэтому чинится здесь, на
 * единственном входе: разборов два десятка, и следующий написанный про это
 * забудет.
 */
function normalizeNewlines(text) {
  return typeof text === 'string' && text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

function ensureFile(raw, path) {
  if (typeof raw === 'string') {
    return { path: normalizePath(path), text: normalizeNewlines(raw), rev: 1, updatedAt: 0 };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyFile(path);
  return {
    path: normalizePath(raw.path || path),
    text: typeof raw.text === 'string' ? normalizeNewlines(raw.text) : '',
    rev: Number(raw.rev) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

/** Следующая ревизия файла. На ней держится отказ при устаревшем якоре. */
function bumpFile(file, text, nowMs) {
  return {
    path: file.path,
    text,
    rev: (Number(file.rev) || 0) + 1,
    updatedAt: nowMs,
  };
}

/**
 * Индекс задачника: путь → ревизия и время правки. Нужен, чтобы пуллер знал,
 * что перекачивать, а поиск — какие ключи читать, не вычитывая весь задачник
 * ради одного слова.
 */
function ensureIndex(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { files: {}, updatedAt: 0 };
  const files = (raw.files && typeof raw.files === 'object' && !Array.isArray(raw.files)) ? raw.files : {};
  const out = {};
  for (const [path, meta] of Object.entries(files)) {
    const normalized = normalizePath(path);
    if (!normalized || !meta || typeof meta !== 'object') continue;
    out[normalized] = { rev: Number(meta.rev) || 0, updatedAt: Number(meta.updatedAt) || 0 };
  }
  return { files: out, updatedAt: Number(raw.updatedAt) || 0 };
}

function withIndexEntry(index, file, nowMs) {
  return {
    files: { ...index.files, [file.path]: { rev: file.rev, updatedAt: file.updatedAt } },
    updatedAt: nowMs,
  };
}

/**
 * Файл задачника среди прочих ключей `heys_tasks_*`.
 *
 * Индекс и память прохода лежат в том же пространстве имён, но файлами не
 * являются: ни текста, ни ревизии у них нет, и проверять их как файлы значит
 * запретить их запись навсегда. Форма значения входит в признак намеренно —
 * следующий служебный ключ с этим префиксом не должен попасть под проверку
 * молча, только потому что его имя начинается так же.
 */
function isTasksFileKey(key, value) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return false;
  if (key === INDEX_KEY || key === STATE_KEY) return false;
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.text === 'string';
}

/**
 * Можно ли положить целиковый текст файла поверх облачного.
 *
 * Дельта-запись сверяет ревизию на сервере и отвечает 409 (`stale_rev`), а
 * целиковая приходит из моста задачника и от пишущих инструментов — там
 * ревизию проверяет клиент, между его чтением и записью успевает пройти
 * чужая правка, и она исчезает без следа: истории у KV нет. Отсюда та же
 * проверка на сервере, единственном месте, которое видит обе стороны.
 *
 * Победитель при расхождении — облако. Не потому что оно правее, а потому что
 * локальный файл переживёт потерю в git, а облачная правка не переживёт нигде:
 * 02.09 так пропала задача, заведённая через MCP за полчаса до пуша зеркала
 * (ревизия 789 → 790).
 *
 * @returns {null|{reason:string, currentRev:number, incomingRev:number}}
 */
function tasksWriteConflict(incoming, current) {
  const currentRev = Number(current && current.rev) || 0;
  if (currentRev <= 0) return null;   // файла в облаке ещё нет — затирать нечего
  const incomingRev = Number(incoming && incoming.rev) || 0;
  if (incomingRev === currentRev + 1) return null;
  return { reason: 'tasks_stale_rev', currentRev, incomingRev };
}

/**
 * Индекс задачника сливается, а не заменяется целиком.
 *
 * Индекс один на весь задачник, и за него дерутся даже записи в РАЗНЫЕ файлы:
 * пишущий кладёт свою копию, собранную при чтении, и уносит чужой свежий след.
 * Файл при этом цел, но пуллер о правке не узнает — ключ в KV есть, записи в
 * индексе нет. Файлов, заведённых облаком позже (ротация в archive/*_partN), в
 * присланной копии нет вовсе.
 *
 * Слияние здесь однозначно и продуктового выбора не требует: индекс —
 * производные данные, у каждой записи есть ревизия, и старшая всегда права.
 */
function mergeIndexValues(incoming, current) {
  const next = ensureIndex(current);
  const from = ensureIndex(incoming);
  for (const [path, meta] of Object.entries(from.files)) {
    const prev = next.files[path];
    if (!prev || meta.rev > prev.rev) next.files[path] = meta;
  }
  next.updatedAt = Math.max(from.updatedAt, next.updatedAt);
  return next;
}

/**
 * Предыдущий текст файла хранится рядом с текущим — одна версия, не история.
 *
 * Без него сервер умеет только выбрать победителя: две правки в разные места
 * одного файла превращались в потерю одной из них, хотя спорить им не о чем.
 * База даёт третью точку — общего предка, — и тогда непересекающиеся правки
 * сливаются молча, а спорные по-прежнему отбиваются.
 *
 * Порог по размеру не для экономии места, а честности ради: без базы слияние
 * недоступно, и файл ведёт себя ровно как до этой правки — отказ по ревизии.
 * Активные файлы держатся ниже TASKS_ROTATE_TARGET_BYTES ротацией, так что
 * порог задевает только то, что и без него слить не удалось бы.
 */
const TASKS_BASE_MAX_BYTES = 256 * 1024;

/**
 * Потолок на построчное сравнение: строк базы × строк стороны.
 *
 * Общие начало и конец отрезаются до сравнения, поэтому в живом файле сюда
 * попадают десятки строк. Потолок стоит на патологию (файл переписан целиком),
 * где точное сравнение стоило бы гигабайт: такой случай честнее отбить.
 */
const TASKS_MERGE_MAX_CELLS = 4 * 1000 * 1000;

/**
 * Текущее значение файла + предыдущий текст. Базу пишет только сервер: то,
 * что прислал клиент, здесь снимается — иначе базой стало бы что угодно, и
 * трёхстороннее слияние потеряло бы смысл.
 */
function withTasksBase(fileValue, currentValue) {
  const next = { ...fileValue };
  delete next.base;
  const prevText = currentValue && typeof currentValue.text === 'string' ? currentValue.text : null;
  const prevRev = Number(currentValue && currentValue.rev) || 0;
  if (prevText !== null && prevRev > 0 && utf8ByteLength(prevText) <= TASKS_BASE_MAX_BYTES) {
    next.base = { text: normalizeNewlines(prevText), rev: prevRev };
  }
  return next;
}

/**
 * Построчная разница база → сторона как список замен `base[start..end)`.
 *
 * @returns {null|Array<{start:number,end:number,lines:string[]}>} null — если
 *   расхождение слишком велико для точного сравнения.
 */
function diffLineOps(base, side) {
  let head = 0;
  const maxHead = Math.min(base.length, side.length);
  while (head < maxHead && base[head] === side[head]) head += 1;
  let tail = 0;
  while (
    tail < base.length - head
    && tail < side.length - head
    && base[base.length - 1 - tail] === side[side.length - 1 - tail]
  ) tail += 1;
  const a = base.slice(head, base.length - tail);
  const b = side.slice(head, side.length - tail);
  if (!a.length && !b.length) return [];
  if (!a.length) return [{ start: head, end: head, lines: b }];
  if (!b.length) return [{ start: head, end: head + a.length, lines: [] }];
  if (a.length * b.length > TASKS_MERGE_MAX_CELLS) return null;

  // Наибольшая общая подпоследовательность: длины суффиксов в одной матрице.
  const w = b.length + 1;
  const dp = new Int32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }

  const ops = [];
  let pendStart = -1;
  let pendEnd = -1;
  let pendLines = null;
  const flush = () => {
    if (pendStart < 0) return;
    ops.push({ start: head + pendStart, end: head + pendEnd, lines: pendLines });
    pendStart = -1;
    pendLines = null;
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    if (pendStart < 0) {
      pendStart = i;
      pendEnd = i;
      pendLines = [];
    }
    if (j < b.length && (i >= a.length || dp[i * w + (j + 1)] >= dp[(i + 1) * w + j])) {
      pendLines.push(b[j]);
      j += 1;
    } else {
      i += 1;
      pendEnd = i;
    }
  }
  flush();
  return ops;
}

function sameLines(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Трёхстороннее слияние markdown построчно.
 *
 * Сливается только то, где слияние однозначно: стороны правили разные куски
 * базы либо сделали одну и ту же правку. Любое пересечение — отказ, а не
 * маркеры конфликта в тексте: файл задачника читает не человек с git, а
 * пуллер и инструменты, и `<<<<<<<` в нём хуже потери.
 *
 * Правки, начинающиеся в одной точке базы, считаются спорными, даже если
 * формально не перекрываются: вставка перед переписанным блоком и сама
 * перезапись дают два разных осмысленных результата, а выбирать между ними
 * не наше дело.
 */
function mergeTasksText(baseText, currentText, incomingText) {
  if (currentText === incomingText) return { ok: true, text: currentText };
  if (baseText === currentText) return { ok: true, text: incomingText };
  if (baseText === incomingText) return { ok: true, text: currentText };

  const base = String(baseText).split('\n');
  const ours = diffLineOps(base, String(currentText).split('\n'));
  const theirs = diffLineOps(base, String(incomingText).split('\n'));
  if (!ours || !theirs) return { ok: false, reason: 'merge_too_large' };

  const out = [];
  let pos = 0;
  const copyUntil = (upto) => {
    while (pos < upto) {
      out.push(base[pos]);
      pos += 1;
    }
  };
  let oi = 0;
  let ti = 0;
  while (oi < ours.length || ti < theirs.length) {
    const o = oi < ours.length ? ours[oi] : null;
    const t = ti < theirs.length ? theirs[ti] : null;
    if (o && t && o.start === t.start && o.end === t.end && sameLines(o.lines, t.lines)) {
      copyUntil(o.start);
      out.push(...o.lines);
      pos = o.end;
      oi += 1;
      ti += 1;
      continue;
    }
    if (o && t && (o.start === t.start || (o.start < t.end && t.start < o.end))) {
      return { ok: false, reason: 'merge_conflict' };
    }
    const takeOurs = !t || (o && o.start < t.start);
    const op = takeOurs ? o : t;
    if (op.start < pos) return { ok: false, reason: 'merge_conflict' };
    copyUntil(op.start);
    out.push(...op.lines);
    pos = op.end;
    if (takeOurs) oi += 1; else ti += 1;
  }
  copyUntil(base.length);
  return { ok: true, text: out.join('\n') };
}

/**
 * Слияние целиковой записи с облачной, когда ревизии разошлись.
 *
 * Условие ровно одно и проверяется буквально: у нас есть предыдущая версия, и
 * присланное сделано именно от неё. Сохранённая база — это текст ревизии
 * `current.rev - 1`; клиент считал следующей ревизией `incoming.rev`, значит
 * его предком была `incoming.rev - 1`. Общий предок есть только когда эти два
 * числа совпали, то есть облако ушло вперёд ровно на одну запись.
 *
 * Отставание на две записи и больше сливать нельзя: база тогда новее предка
 * клиента, и его правка, сделанная до базы, прочиталась бы как удаление —
 * слияние молча выкинуло бы чужие строки. Такой случай отбивается, как и до
 * появления базы.
 *
 * @returns {{ok:true,value:object}|{ok:false,reason:string}}
 */
function mergeTasksFileValue(incoming, current, nowMs) {
  const currentRev = Number(current && current.rev) || 0;
  const incomingRev = Number(incoming && incoming.rev) || 0;
  if (currentRev <= 0 || incomingRev !== currentRev) return { ok: false, reason: 'no_common_base' };
  const base = current && current.base;
  const baseRev = Number(base && base.rev) || 0;
  if (!base || typeof base.text !== 'string' || baseRev !== currentRev - 1) {
    return { ok: false, reason: 'no_common_base' };
  }
  const currentText = typeof current.text === 'string' ? current.text : '';
  const incomingText = typeof incoming.text === 'string' ? incoming.text : '';
  const merged = mergeTasksText(
    normalizeNewlines(base.text),
    normalizeNewlines(currentText),
    normalizeNewlines(incomingText),
  );
  if (!merged.ok) return merged;
  const stamp = Number(nowMs) || Math.max(Number(incoming.updatedAt) || 0, Number(current.updatedAt) || 0);
  return {
    ok: true,
    baseRev,
    value: withTasksBase({
      path: normalizePath(incoming.path || current.path),
      text: merged.text,
      rev: currentRev + 1,
      updatedAt: stamp,
    }, current),
  };
}

/**
 * Основа слова: у длинных слов отбрасываются два последних символа.
 *
 * Это нужно для русского. Человек ищет «версия», а в журнале записано
 * «версию»; точное вхождение такую запись не найдёт, и поиск честно ответит
 * «ничего нет» там, где ответ есть. Полноценная лемматизация здесь избыточна —
 * задачник ищется по своим же формулировкам, а не по чужим текстам.
 */
function stemWord(word) {
  return word.length > 5 ? word.slice(0, word.length - 2) : word;
}

/**
 * Сравнение слов по общему началу — для коротких, где отрезать два символа
 * нельзя: «зал» превратился бы в один символ и совпал с чем угодно.
 *
 * Порог в три буквы: «зал» и «зала», «дом» и «дома» сходятся, а «дом» и «дым»
 * — нет. Короче трёх не сверяем вовсе: там осмысленной общей части уже не
 * остаётся, и совпадать начнёт всё подряд.
 */
function shortFormsMatch(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  /**
   * Порог растёт вместе со словом: три буквы, но не меньше трёх пятых длины.
   *
   * Голый порог в три буквы писался под «зал»/«зала», а применялся ко всему
   * подряд — и склеивал «квантовой» с «квартирой», «машину» с «Машей»,
   * «сколько» со «скобках». Цена была не в шуме: на любой вопрос что-нибудь
   * да находилось, и честного «ничего не нашлось» система не выдавала никогда,
   * то есть пустой ответ стал неотличим от настоящей находки.
   *
   * Доля вместо длины потому, что короткому слову общее начало и есть всё
   * слово, а длинному три буквы — случайное совпадение приставки.
   */
  const need = Math.max(3, Math.ceil(Math.max(a.length, b.length) * 0.6));
  return common >= need;
}

function lineMatchesTerm(line, term) {
  if (line.includes(term)) return true;
  const stem = stemWord(term);
  const words = line.split(/[^\p{L}\p{N}]+/u);
  // Длинное слово ищем по основе, короткое — по общему началу. Раньше короткие
  // не искались вовсе (порог в 4 символа на основу), и «до зала» не находило
  // «зал»: падеж делал слово другим. Людям же свойственно называть места
  // короткими словами — зал, дом, юг, — и именно они промахивались.
  if (stem.length >= 4) {
    if (words.some((word) => word && stemWord(word).startsWith(stem))) return true;
  }
  return words.some((word) => word && shortFormsMatch(word, term));
}

/**
 * Значимые слова из живой фразы.
 *
 * Зачем это на сервере. Инструмент, который просит «тему», перекладывает на
 * модель решение «что искать» — и ровно на этом шаге она промахивается: ищет
 * по «поставь» и «надо», не находит ничего и начинает перебирать запросы по
 * одному. Разбор фразы здесь делает этот шаг детерминированным: модель отдаёт
 * то, что услышала, а какие слова значимы — решает код.
 *
 * Имена, даты, времена и теги весят больше обычных слов: именно они привязывают
 * фразу к конкретной задаче, а не к десятку похожих.
 */
const TOPIC_STOP_WORDS = new Set([
  'в', 'во', 'на', 'и', 'а', 'но', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'от', 'до',
  'для', 'у', 'о', 'об', 'про', 'при', 'что', 'чтобы', 'как', 'так', 'это', 'этот',
  'эта', 'эти', 'том', 'тот', 'там', 'тут', 'здесь', 'я', 'ты', 'он', 'она', 'они',
  'мы', 'вы', 'мне', 'меня', 'мой', 'моя', 'мои', 'твой', 'наш', 'его', 'её', 'их',
  'себе', 'себя', 'ну', 'же', 'ли', 'бы', 'вот', 'ещё', 'еще', 'уже', 'только',
  'очень', 'потом', 'сейчас', 'надо', 'нужно', 'хочу', 'хочет', 'давай', 'давайте',
  'сделай', 'сделать', 'поставь', 'поставить', 'запиши', 'записать', 'добавь',
  'добавить', 'посмотри', 'посмотреть', 'скажи', 'сказать', 'напомни', 'напомнить',
  'найди', 'найти', 'покажи', 'показать', 'глянь', 'проверь', 'проверить',
  // Формы «мы»: «давай посмотрим», «поставим на понедельник». Перечислены
  // списком, а не отсечены основой: основа «сдела» съела бы «сделку», а
  // «показ» — настоящий показ в студии.
  'посмотрим', 'посмотрю', 'поставим', 'поставлю', 'запишем', 'добавим',
  'проверим', 'напомним', 'скажем', 'найдём', 'найдем', 'покажем', 'сделаем',
  'будет', 'было', 'был', 'была', 'быть', 'есть', 'нет', 'не', 'да', 'или', 'если',
  'когда', 'где', 'куда', 'кто', 'какой', 'какая', 'какие', 'сколько', 'можно',
  'может', 'вообще', 'просто', 'типа', 'значит',
  // Вопросительные и связочные из живой речи. Без них фраза «чем кончилось с
  // аккумулятором» весила «чем» и «кончилось» вдвое дороже единственного
  // тематического слова: у каждого слова одинаковый вес, и два служебных
  // побеждают одно нужное. Проверено 04.08 — в выдачу шли записи про Codex и
  // Google Calendar, а история с аккумулятором не приходила вовсе.
  'чем', 'чём', 'почему', 'зачем', 'отчего', 'откуда', 'кому', 'кого', 'чей',
  'каком', 'котором', 'которая', 'которые', 'кончилось', 'кончилась',
  'закончилось', 'закончилась', 'вышло', 'получилось',
]);

const DATE_TIME_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b/g;

/** Адреса задач, встреченные прямо в тексте фразы. */
function findAddresses(text) {
  return [...String(text || '').matchAll(ADDRESS_IN_TEXT_RE)]
    .map((m) => ({ project: m[1].toLowerCase(), hash: m[2].toLowerCase() }));
}

function topicTerms(phrase) {
  const raw = String(phrase || '').trim();
  const terms = [];
  const dropped = [];
  const seen = new Set();
  const push = (word, kind) => {
    const key = String(word).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    terms.push({ word: key, kind });
  };

  for (const match of raw.matchAll(DATE_TIME_RE)) push(match[0], match[0].includes(':') ? 'time' : 'date');
  let rest = raw.replace(DATE_TIME_RE, ' ').replace(ADDRESS_IN_TEXT_RE, ' ');
  for (const match of rest.matchAll(/#([\p{L}\p{N}]+)/gu)) push(match[1], 'tag');
  rest = rest.replace(/#[\p{L}\p{N}]+/gu, ' ');

  const words = rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  words.forEach((word, i) => {
    const lower = word.toLowerCase();
    // Заглавная буква не в начале фразы — почти всегда имя или название, и
    // терять его нельзя: по нему находится и человек, и его обязательства.
    const looksLikeName = i > 0 && /^\p{Lu}/u.test(word) && word.length > 2;
    if (!looksLikeName && (TOPIC_STOP_WORDS.has(lower) || lower.length < 3 || /^\d+$/.test(lower))) {
      dropped.push(lower);
      return;
    }
    push(lower, looksLikeName ? 'name' : 'word');
  });

  return { terms, dropped };
}

const TERM_WEIGHT = { name: 2, date: 2, time: 2, tag: 2, word: 1 };

/** Насколько строка отвечает фразе: сколько значимых слов в ней встретилось. */
function matchTerms(haystack, terms) {
  const text = String(haystack || '').toLowerCase();
  let score = 0;
  const hit = [];
  for (const term of terms) {
    if (!lineMatchesTerm(text, term.word)) continue;
    score += TERM_WEIGHT[term.kind] || 1;
    hit.push(term.word);
  }
  return { score, hit };
}

// ── Чем строка весит, кроме совпавших слов ───────────────────────────────
//
// Слова отвечают на «про то ли это», но не на «стоит ли это читать первым».
// Упоминание вчера почти всегда важнее такого же месяц назад, а принятое
// решение весомее пересказа того же в журнале. Обе поправки СКЛАДЫВАЮТСЯ с
// весом слов и намеренно не могут его перебить: потолок всех надбавок ниже
// цены одного совпавшего слова (см. тест про баланс). Иначе свежая болтовня
// вытеснила бы месячной давности решение ровно по теме — та самая ошибка,
// ради которой ранжирование и переделывалось.

const WORD_WEIGHT = 20;         // цена одного очка совпадения по словам
const SOURCE_MAX = 5;           // самый весомый источник: записанное решение
const RECENCY_MAX = 4;          // сегодняшняя запись
const RECENCY_HALFLIFE_DAYS = 45; // затухание плавное: месяц назад ещё ~2.5 из 4
const EXACT_BONUS = 6;          // фраза стоит целиком
const LINK_BONUS = 3;           // связь поставлена руками через «см:»

/**
 * Корпус выводов: активный journal/ и его ротационные части в archive/.
 * Ротация не удаляет — только дробит файл, иначе Payload too large.
 * Без архива в journalHits старые итоги месяца выпадали из tasks_context.
 */
function isJournalCorpusPath(path) {
  const p = String(path || '');
  return /^journal\/\d{4}-\d{2}\.md$/i.test(p)
    || /^archive\/journal_\d{4}-\d{2}_part\d+\.md$/i.test(p);
}

/** Деньги: активный месяц и (если появятся) архивные части той же ротации. */
function isMoneyCorpusPath(path) {
  const p = String(path || '');
  return /^money\/\d{4}-\d{2}\.md$/i.test(p)
    || /^archive\/money_\d{4}-\d{2}_part\d+\.md$/i.test(p);
}

/**
 * Сырьё разговора: активный день и архивные части. В автоконтекст не как
 * выводы — отдельным слоем «сырьё», когда слова совпали; вес в поиске = 0.
 */
function isTranscriptCorpusPath(path) {
  const p = String(path || '');
  return /^transcript\/\d{4}-\d{2}-\d{2}\.md$/i.test(p)
    || /^archive\/transcript_\d{4}-\d{2}-\d{2}_part\d+\.md$/i.test(p);
}

/**
 * Вес источника. Порядок важен: первое совпадение выигрывает, поэтому
 * стенограмма и архив проверяются раньше общих папок.
 */
const SOURCE_WEIGHT = [
  [/^docs\/preferences\.md$/i, 5],  // как он решает — записано с его слов
  [/^transcript\//i, 0],            // сырой лог разговора, в разбор не тащится
  [/^archive\/transcript_/i, 0],   // та же стенограмма после ротации
  [/^archive\/journal_/i, 1.5],    // выводы журнала после ротации = журнал
  [/^archive\/money_/i, 2],        // операции после ротации = money
  [/^archive\//i, 1],
  [/^projects\//i, 3],              // сами задачи
  [/^(NOW|GOALS)\.md$/i, 3],
  [/^(INBOX|habits)\.md$/i, 2],
  [/^days\//i, 2],
  [/^money\//i, 2],
  [/^journal\//i, 1.5],             // пересказ разговора — легче задачи
];

/**
 * Принятое решение, где бы оно ни лежало. Формулировка «решили ...» в журнале
 * весит как задача, а не как соседний абзац пересказа: по правилам разбора
 * записывают именно так, и терять это из-за папки нельзя.
 */
// «Решения» в родительном падеже здесь нет намеренно: «требует решения» —
// это открытый вопрос, а не принятое решение, и поднимать его как решение
// значит выдать нерешённое за решённое.
const DECISION_MARK_RE = /(?:^|[^\p{L}])(?:решил[иа]?|решено|решение|договорились|условились|остановились|выбрали)/iu;

/**
 * Отмена весит столько же, сколько решение.
 *
 * Иначе поиск отдаёт отменённое как действующее: 04.08 на «почему дело не в
 * клемме» приходили строки «это классика плохого контакта, а не севшего АКБ»,
 * а строка «версия про окисленную клемму снимается» — нет. Ответ по такой
 * выдаче уверенно повторяет диагноз, который через два часа опровергли
 * замером. Опровержение — самая ценная строка сюжета, а не примечание
 * к нему: без неё в задачнике живут два ответа на один вопрос.
 */
// Граница в конце обязательна: без неё «со снятой клеммой» — описание
// действия — весит как отмена версии.
const REVOKE_MARK_RE = /(?:^|[^\p{L}])(?:снят[аоы]|снимается|отменен[оа]|отменяется|опроверг\p{L}*|не подтвердил\p{L}*|оказалось не|устарел[оа]?|заменен[оа]|вместо этого)(?!\p{L})/iu;

function sourceWeight(path, line) {
  const p = String(path || '');
  let weight = 1.5;
  for (const [re, value] of SOURCE_WEIGHT) {
    if (re.test(p)) { weight = value; break; }
  }
  // Стенограмма остаётся самой лёгкой даже со словом «решили»: она сплошная
  // запись речи, и «решили» там звучит и в вопросе, и в отказе.
  const text = String(line || '');
  if (weight > 0 && (DECISION_MARK_RE.test(text) || REVOKE_MARK_RE.test(text))) return SOURCE_MAX;
  return weight;
}

/** Насколько запись далека от сегодня, в днях. null — датой не помечена. */
function daysFromToday(date, today) {
  if (!date || !today) return null;
  const a = Date.parse(date.length === 7 ? `${date}-01` : date);
  const b = Date.parse(today);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(Math.round((a - b) / DAY_MS));
}

function recencyBonus(days) {
  if (days === null) return 0;
  return RECENCY_MAX * Math.pow(0.5, Math.max(0, days) / RECENCY_HALFLIFE_DAYS);
}

const DATE_IN_TEXT_RE = /(\d{4}-\d{2}-\d{2})/;
const DATE_HEADING_RE = /^#{1,6}\s*.*?(\d{4}-\d{2}-\d{2})/;

/**
 * Дата строки: сначала своя, потом ближайший заголовок с датой выше, потом
 * дата в имени файла. Заголовок нужен журналу: у `journal/2026-08.md` в имени
 * только месяц, и без него запись вчерашнего дня считалась бы месячной.
 */
function lineDate(line, headingDate, path) {
  const own = DATE_IN_TEXT_RE.exec(String(line || ''));
  if (own) return own[1];
  if (headingDate) return headingDate;
  const inPath = /(\d{4}-\d{2}(?:-\d{2})?)/.exec(String(path || ''));
  return inPath ? inPath[1] : null;
}

/**
 * Пары концов явных ссылок в виде «путь:строка». Ссылка ведёт на задачу, а
 * задача в файле — это её заголовочная строка, поэтому совпадение внутри
 * задачи сводится к ней же (см. `anchorLine`).
 */
function linkEndpointPairs(files, links = null) {
  const all = links || collectLinks(files);
  const pairs = [];
  for (const link of all) {
    const target = findTaskByAddress(files, link.to);
    if (!target) continue;                       // битая ссылка связью не является
    pairs.push([`${link.from.path}:${link.from.line}`, `${target.path}:${target.line}`]);
  }
  return pairs;
}

/** Строка задачи, внутри которой лежит совпадение; для прочих файлов — она сама. */
function anchorLine(file, line) {
  if (!/^projects\//i.test(String(file.path || ''))) return line;
  let anchor = line;
  for (const task of parseTasks(file)) {
    if (task.line <= line) anchor = task.line; else break;
  }
  return anchor;
}

/**
 * Поиск по задачнику. Возвращает совпадения со строками вокруг: запись журнала
 * без соседних строк бесполезна — по ней не видно, о чём шла речь.
 *
 * Регистр игнорируется, запрос разбивается на слова, и строка считается
 * совпавшей, когда содержит их все. Это ближе к тому, как человек ищет
 * («лендинг версия D»), чем точное вхождение фразы.
 */
function searchFiles(files, query, {
  context = 2, limitPerFile = 5, limit = 40, terms: given = null, any = false,
  today = null, linkPairs = null, related = null,
} = {}) {
  // `terms` приходит из разбора живой фразы; `any` нужен там же: у фразы из
  // пяти слов строки, где встретились все пять, не бывает, а строка с двумя
  // самыми весомыми — ровно то, что искали.
  const terms = (given && given.length)
    ? given.map((t) => (typeof t === 'string' ? { word: t.toLowerCase(), kind: 'word' } : t))
    : String(query || '').toLowerCase().split(/\s+/).filter(Boolean).map((word) => ({ word, kind: 'word' }));
  if (!terms.length) return [];

  // Совпадение по всей фразе целиком — единственное, чем строки различаются,
  // когда все слова нашлись в каждой: `matchTerms` в этом режиме выдаёт всем
  // один и тот же вес, и сортировка по нему ничего не переставляет.
  const phrase = terms.length > 1 ? terms.map((t) => t.word).join(' ') : null;

  const results = [];
  const byPath = new Map();
  for (const file of files) {
    if (!file || typeof file.text !== 'string' || !file.text) continue;
    byPath.set(file.path, file);
    const lines = file.text.split('\n');
    /**
     * Лучшие совпадения файла, а не первые попавшиеся.
     *
     * Раньше обход останавливался на пятом совпадении сверху вниз. Для задачи
     * это незаметно — файл проекта маленький. Для журнала это отменяло весь
     * слой: он один на месяц и дописывается вниз, поэтому бюджет всегда
     * съедали записи первых чисел, а сегодняшние не читались никогда.
     * Проверено 04.08: на «артикул старой батареи» в журнале 43 совпадения,
     * прочитаны строки 61–330, а нужная (895) не пришла; в блоке про
     * аккумулятор 28 совпадений — прочитано ноль. Бонус за свежесть при этом
     * не спасал: свежие строки не доживали до ранжирования.
     */
    const perFile = [];
    let headingDate = null;
    for (let i = 0; i < lines.length; i += 1) {
      // Дата заголовка копится по ходу обхода: отдельный проход вверх стоил бы
      // столько же, сколько сам поиск.
      const heading = DATE_HEADING_RE.exec(lines[i]);
      if (heading) headingDate = heading[1];
      const { score, hit } = matchTerms(lines[i], terms);
      if (any ? !hit.length : hit.length !== terms.length) continue;
      const date = lineDate(lines[i], headingDate, file.path);
      perFile.push({
        path: file.path,
        line: i + 1,
        text: lines[i].trim(),
        score,
        matched: hit,
        exact: phrase ? lines[i].toLowerCase().includes(phrase) : false,
        date,
        age_days: daysFromToday(date, today),
        weight: sourceWeight(file.path, lines[i]),
        linked: false,
        context: lines
          .slice(Math.max(0, i - context), Math.min(lines.length, i + context + 1))
          .join('\n'),
      });
    }
    // Отбор внутри файла: сначала точная фраза, потом вес совпадения, потом
    // свежесть. Позиция в файле перестала что-либо значить — именно она и
    // прятала свежие записи.
    perFile.sort((a, b) => (Number(b.exact) - Number(a.exact))
      || (b.weight - a.weight)
      || (b.score - a.score)
      || (String(b.date || '').localeCompare(String(a.date || '')))
      || (a.line - b.line));
    results.push(...perFile.slice(0, limitPerFile));
  }

  // Явная связь «см:» — это то, что человек сам назвал связанным; поиск по
  // словам такую пару не находит никогда, у неё общих слов обычно нет.
  // Поднимаем запись, если её конец ссылки смотрит на другое найденное: на
  // соседнее совпадение или на уже найденную задачу (`related`).
  if (linkPairs && linkPairs.length && results.length) {
    const anchors = new Map();
    const keyOf = (m) => {
      const cacheKey = `${m.path}:${m.line}`;
      if (!anchors.has(cacheKey)) {
        const file = byPath.get(m.path);
        anchors.set(cacheKey, `${m.path}:${file ? anchorLine(file, m.line) : m.line}`);
      }
      return anchors.get(cacheKey);
    };
    const known = new Set(results.map(keyOf));
    for (const r of related || []) known.add(`${r.path}:${r.line}`);
    const boosted = new Set();
    for (const [from, to] of linkPairs) {
      if (from === to) continue;
      if (known.has(from) && known.has(to)) { boosted.add(from); boosted.add(to); }
    }
    if (boosted.size) for (const m of results) if (boosted.has(keyOf(m))) m.linked = true;
  }

  for (const m of results) {
    m.rank = Math.round((
      m.score * WORD_WEIGHT
      + m.weight
      + recencyBonus(m.age_days)
      + (m.exact ? EXACT_BONUS : 0)
      + (m.linked ? LINK_BONUS : 0)
    ) * 1000) / 1000;
  }

  // Отбор по релевантности идёт ДО потолка: иначе сорок первых попавшихся
  // строк вытесняют ту единственную, где фраза стоит целиком. Порядок обхода
  // (rankPaths: сначала задачи, потом дни и журнал) остаётся последним
  // доводом — сортировка в JS устойчива.
  return results
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

/**
 * Окно чтения файла.
 *
 * Журнал — один файл на месяц, и растёт он примерно на десятки килобайт в
 * день: к концу месяца целиковое чтение стоит сотни тысяч токенов на один
 * вызов. Отдаём хвост: свежая запись нужнее прошлогодней, а до начала есть
 * поиск и `from_line`. Обрезка обязана быть ВИДНОЙ — молча укороченный файл
 * страшнее длинного: по нему делают вывод «в журнале про это ничего нет».
 */
const READ_MAX_CHARS = 24000;
const READ_HARD_MAX = 120000;

function fileWindow(text, { maxChars = null, fromLine = null } = {}) {
  const full = String(text || '');
  const lines = full.split('\n');
  const limit = Math.min(
    READ_HARD_MAX,
    Math.max(1000, Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Number(maxChars) : READ_MAX_CHARS),
  );

  const start = Number.isFinite(Number(fromLine)) && Number(fromLine) > 0
    ? Math.min(Math.floor(Number(fromLine)), lines.length)
    : null;

  // Граница окна проходит по строке, а не по символу: обрезанная посередине
  // строка задачи читается как другая задача, а хэш у неё будет третий.
  let from;
  let to;
  if (start) {
    // Назвали, откуда читать, — читаем оттуда ВПЕРЁД: это и есть «достать
    // нужный кусок», ради которого параметр и заведён.
    from = start;
    to = start;
    let taken = 0;
    while (to <= lines.length) {
      const next = taken + lines[to - 1].length + (taken ? 1 : 0);
      if (next > limit && to > start) break;
      taken = next;
      to += 1;
      if (taken >= limit) break;
    }
    to -= 1;
  } else {
    // По умолчанию — хвост: свежая запись нужнее прошлогодней.
    to = lines.length;
    from = lines.length;
    let taken = 0;
    while (from >= 1) {
      const next = taken + lines[from - 1].length + (taken ? 1 : 0);
      if (next > limit && from < lines.length) break;
      taken = next;
      from -= 1;
      if (taken >= limit) break;
    }
    from += 1;
  }

  const out = lines.slice(from - 1, to).join('\n');
  return {
    text: out,
    truncated: from > 1 || to < lines.length,
    from_line: from,
    to_line: to,
    total_lines: lines.length,
    total_chars: full.length,
    shown_chars: out.length,
  };
}

/**
 * Заголовок задачи. Алгоритм повторяет `parse_task` из `~/tasks/build_board.py`
 * буква в букву, и отступать от него нельзя.
 *
 * Причина жёсткая: доска считает идентификатор задачи как
 * `md5("<проект>|<заголовок>")[:6]`, и по этому хэшу пользователь ссылается на
 * задачу в разговоре («heys/0765d3 · …»). Разойдись разбор на один пробел или
 * на срезанное тире — хэш станет другим, ссылка перестанет находить задачу, и
 * правка уедет не туда или не уедет вовсе. Порядок замен, схлопывание пробелов
 * и обрезка тире по краям — часть контракта, а не стиль.
 */
const PRIORITY_RE = /\bP([123])\b/g;
const DUE_RE = /\bdue:(\d{4}-\d{2}-\d{2})/g;
const CREATED_RE = /\^(\d{4}-\d{2}-\d{2})/g;
const TAG_RE = /#([\w\dа-яА-Я]+)/g;

function taskTitle(body) {
  let title = String(body || '').replace(/^\s*-\s*\[[ x>~]\]\s*/i, '');
  for (const rx of [PRIORITY_RE, DUE_RE, CREATED_RE, TAG_RE]) {
    title = title.replace(rx, '');
  }
  return title.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');
}

/** Идентификатор задачи, как его считает доска: md5("<проект>|<заголовок>")[:6]. */
function taskHash(projectKey, title) {
  return require('node:crypto')
    .createHash('md5')
    .update(`${projectKey}|${title}`, 'utf8')
    .digest('hex')
    .slice(0, 6);
}

/** Ключ проекта из пути: `projects/heys.md` → `heys`. Им же хэшируется задача. */
function projectKeyForPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  const match = /^projects\/(.+)\.md$/i.exec(normalized);
  return match ? match[1].toLowerCase() : normalized.replace(/\.md$/i, '').toLowerCase();
}

/**
 * Разбор строки задачи в формате задачника:
 * `- [ ] P1 Текст due:2026-08-05 #next #ноут ^2026-08-01`
 */
function parseTaskLine(line) {
  const match = /^(\s*)-\s*\[([ x>~-])\]\s*(.*)$/i.exec(String(line || ''));
  if (!match) return null;
  const body = match[3];
  const priority = /(^|\s)(P[0-9])(\s|$)/.exec(body);
  const due = /(?:^|\s)due:(\S+)/.exec(body);
  const created = /(?:^|\s)\^(\S+)/.exec(body);
  const tags = [...body.matchAll(/(?:^|\s)#([^\s]+)/g)].map((m) => m[1]);
  return {
    indent: match[1].length,
    done: match[2].toLowerCase() === 'x',
    waiting: match[2] === '>',
    priority: priority ? priority[2] : null,
    due: due ? due[1] : null,
    created: created ? created[1] : null,
    tags,
    title: taskTitle(body),
    raw: line,
  };
}

/**
 * Задачи файла вместе с вложенными строками. Вложенное — это контекст задачи
 * (`ждём:`, `при встрече:`, `открыто:`, подпункты), и без него задача читается
 * неверно: половина смысла живёт именно там.
 */
function parseTasks(file) {
  const lines = String((file && file.text) || '').split('\n');
  const tasks = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseTaskLine(lines[i]);
    if (parsed && parsed.indent === 0) {
      current = { ...parsed, path: file.path, line: i + 1, children: [] };
      tasks.push(current);
      continue;
    }
    if (!current) continue;
    const text = lines[i].trim();
    if (!text) { current = null; continue; }
    // Маркер списка снимается: `ждём:`, `при встрече:` и `открыто:` ищутся по
    // началу строки, и оставленный дефис прятал бы их от всех разборов.
    if (lines[i].startsWith(' ') || lines[i].startsWith('\t')) {
      current.children.push(text.replace(/^[-*]\s+/, ''));
    }
  }
  return tasks;
}

/**
 * Адрес задачи — тот же, которым она адресуется на доске.
 *
 * Возвращается из всего, что читает задачи, и это не удобство: без него
 * каждый, кто хочет потом снять вопрос или поправить срок, обязан повторить у
 * себя разбор заголовка и подсчёт хэша — и рано или поздно разойтись с доской
 * на один пробел. Один раз мы это уже чинили.
 */
function taskAddress(path, title) {
  if (!/^projects\//i.test(String(path || ''))) return { project: null, hash: null, ref: null };
  const project = projectKeyForPath(path);
  const hash = taskHash(project, title);
  return { project, hash, ref: `${project}/${hash}` };
}

/**
 * До какого дня задача отложена решением: вложенная строка `вернуться: …`.
 *
 * Это не «подвисло», а принятый ответ «не сейчас», и разбор здесь ровно тот
 * же, что на доске (`BACK_RE` в build_board.py): дата `ГГГГ-ММ-ДД` или `ДД.ММ`,
 * дальше через тире может идти причина — она не разбирается. Год у короткой
 * формы берётся ближайший, в котором эта дата ещё не прошла: «вернуться: 01.09»
 * в декабре значит сентябрь следующего года, а не позапрошлый месяц.
 */
const TASK_BACK_RE = /^\s*вернуться:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2})/i;

function taskBackDate(children, { today } = {}) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(today || '')) ? String(today) : null;
  for (const child of children || []) {
    const match = TASK_BACK_RE.exec(String(child || ''));
    if (!match) continue;
    const raw = match[1];
    if (!raw.includes('.')) return raw;
    // Короткая форма без года разрешается только когда известно «сегодня»:
    // угадывать год от системных часов здесь нечем и незачем.
    if (!base) continue;
    const [day, month] = raw.split('.').map(Number);
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
    const [thisYear, thisMonth, thisDay] = base.split('-').map(Number);
    const year = (month < thisMonth || (month === thisMonth && day < thisDay)) ? thisYear + 1 : thisYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Неточный срок: `окно: 2026-08-10..2026-08-12`.
 *
 * Он говорит «в начале недели» и «во второй половине августа» — и это не
 * уклончивость, а честное состояние дела: точность появится позже. Класть
 * диапазон в сам `due` нельзя, оттуда хвост уезжает в заголовок задачи, а на
 * заголовке держится её хэш — адрес проект/хэш поменялся бы, и все ссылки на
 * задачу перестали бы её находить.
 *
 * Поэтому окно живёт отдельной строкой, а `due` остаётся поздней границей —
 * крайним сроком. Ранняя граница нужна не для красоты: без неё задача со
 * сроком на конце окна молчит всё окно и всплывает в последний день, то есть
 * ровно тогда, когда делать уже поздно.
 */
const TASK_WINDOW_RE = /^\s*окно:\s*(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})\s*$/i;

function taskWindow(children) {
  for (const child of children || []) {
    const match = TASK_WINDOW_RE.exec(String(child || ''));
    if (!match) continue;
    const [, from, to] = match;
    // Перевёрнутое окно — это опечатка, а не «окно назад». Молча меняя границы
    // местами, мы бы сделали из опечатки правдоподобный срок.
    if (from > to) continue;
    return { from, to };
  }
  return null;
}

/**
 * День, с которого задача начинает считаться живой. Без окна это её срок; с
 * окном — ранняя граница. Просрочка при этом считается по-прежнему по `due`:
 * пока не прошёл крайний срок, задача не просрочена, даже если окно началось.
 */
function taskSignalDate(task) {
  const window = taskWindow(task && task.children);
  return (window && window.from) || (task && task.due) || null;
}

/**
 * Открытые вопросы задачника: вложенные строки `открыто:` под задачами.
 *
 * Вместе с вопросом отдаются срок и дата заведения ЗАДАЧИ, а не вопроса:
 * своей даты у строки `открыто:` нет и взять её неоткуда. Отбор на планёрку
 * ранжирует именно по ним, и подменять отсутствующую дату сегодняшней нельзя —
 * тогда старое и новое перемешаются, а разобрать это потом будет нечем.
 *
 * `back` — перенос самой задачи, унаследованный вопросом. Отложили переделку
 * склада до сентября — до сентября молчат и все её вопросы: спрашивать «нужен
 * ли насос» про то, к чему решено не возвращаться, значит мозолить глаза тем,
 * что уже решено отложить. Отсюда вопрос не выкидывается: снимать его вправе
 * только ответ, а сворачивает перенос — и разворачивает сам, когда день пришёл.
 */
function collectOpenQuestions(files, { today = null } = {}) {
  const out = [];
  for (const file of files) {
    for (const task of parseTasks(file)) {
      const back = taskBackDate(task.children, { today });
      for (const child of task.children) {
        if (/^открыто:/i.test(child)) {
          const address = taskAddress(file.path, task.title);
          const question = child.replace(/^открыто:\s*/i, '');
          out.push({
            path: file.path,
            ...address,
            task: task.title,
            question,
            due: task.due || null,
            // Вопрос наследует у задачи не только срок, но и окно: без этого
            // «аудит целиком или только новые формы?» под задачей с окном
            // 16–31 августа ждал бы 31-го, то есть последнего дня.
            signal: taskSignalDate(task),
            window: taskWindow(task.children),
            created: task.created || null,
            done: Boolean(task.done),
            back,
            line: task.line || 0,
            key: questionKey(address.ref || file.path, question),
          });
        }
      }
    }
  }
  return out;
}

/**
 * Ключ вопроса для памяти прохода. Считается от адреса задачи и текста вопроса,
 * потому что больше не от чего: строка `открыто:` не нумерована и не датирована.
 * Побочный эффект принят сознательно — переписал формулировку, и вопрос для
 * ротации стал новым. Это честнее обратного: молча считать переписанный вопрос
 * уже показанным.
 */
function questionKey(ref, question) {
  return require('node:crypto')
    .createHash('md5')
    .update(`${ref}|${String(question || '').trim()}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
}

/** Ожидания от людей: вложенные строки `ждём:` и `при встрече:`. */
function collectPeopleThreads(files) {
  const out = [];
  for (const file of files) {
    for (const task of parseTasks(file)) {
      for (const child of task.children) {
        const match = /^(ждём|при встрече):\s*(.*)$/i.exec(child);
        if (match) {
          out.push({
            path: file.path,
            ...taskAddress(file.path, task.title),
            task: task.title,
            kind: match[1].toLowerCase(),
            text: match[2],
          });
        }
      }
    }
  }
  return out;
}

// ── Связи: явная ссылка вместо случайного совпадения слов ────────────────
//
// До этого задача, запись журнала, слот дня и человек были связаны только
// словами: пересечение находилось поиском, то есть случайно. Явная ссылка —
// вложенная строка `см: kinderly/8e3572`, где адрес тот же, которым задача
// адресуется на доске. Формат читается человеком в markdown, доска рисует его
// как обычную вложенную строку и ничего не ломает.
//
// Ссылка хранится в одну сторону, а читается в обе: если А сослался на Б, то
// при разборе Б надо видеть А. Хранить обе стороны — значит держать их в
// согласии при каждой правке, а это лишний способ развести файлы.

/** Адрес задачи: `проект/хэш`. Строгая форма — для аргумента инструмента. */
function parseAddress(value) {
  const match = /^\s*([a-zа-яё0-9][a-zа-яё0-9_-]*)\s*\/\s*([0-9a-f]{6})\s*$/i.exec(String(value || ''));
  return match ? { project: match[1].toLowerCase(), hash: match[2].toLowerCase() } : null;
}

const ADDRESS_IN_TEXT_RE = /([a-zа-яё0-9][a-zа-яё0-9_-]*)\/([0-9a-f]{6})\b/gi;
const REF_LINE_RE = /^\s*(?:[-*]\s*)?см:\s*(.*)$/i;

/**
 * Разбор строки-ссылки. В одной строке может стоять несколько адресов и
 * пояснение словами: `см: kinderly/8e3572, heys/0765d3 — общая смета`.
 */
function parseRefLine(line) {
  const match = REF_LINE_RE.exec(String(line || ''));
  if (!match) return null;
  const refs = [...match[1].matchAll(ADDRESS_IN_TEXT_RE)]
    .map((m) => ({ project: m[1].toLowerCase(), hash: m[2].toLowerCase() }));
  if (!refs.length) return null;
  const note = match[1]
    .replace(ADDRESS_IN_TEXT_RE, '')
    .replace(/^[\s,;·—–-]+|[\s,;·—–-]+$/g, '')
    .trim();
  return { refs, note };
}

/**
 * Ссылка слота дня на задачу. Формат не наш: доска давно читает
 * `- 15:00–17:00 Съёмка · kinderly/8e3572 #фокус` и рисует такой слот
 * кликабельным. Второй способ связать слот с задачей был бы форматом-двойником,
 * поэтому здесь мы просто читаем существующий.
 */
const SLOT_LINE_RE = /^-\s*(?:\[[ x]\]\s*)?(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+?)\s*$/;

function parseSlotRef(line) {
  const match = SLOT_LINE_RE.exec(String(line || '').trim());
  if (!match) return null;
  // `\b` здесь ставить нельзя: граница слова считается по ASCII, и после
  // кириллического «#фокус» её просто нет — тег оставался бы в строке и ломал
  // разбор адреса.
  const body = match[3]
    .replace(SLOT_MARK_RE, '')
    .replace(/\s*#[\p{L}\d]+/gu, '')
    .replace(/\s*@[\p{L}\d-]+/gu, '')
    .trim();
  if (!body.includes('·')) return null;
  const tail = body.slice(body.lastIndexOf('·') + 1).trim();
  const ref = parseAddress(tail);
  if (!ref) return null;
  return { ref, title: body.slice(0, body.lastIndexOf('·')).trim(), from: match[1], to: match[2] };
}

/** Ближайший заголовок выше строки — им подписывается ссылка из журнала или дня. */
function nearestHeading(lines, at) {
  for (let i = at; i >= 0; i -= 1) {
    if (/^#{1,6}\s/.test(lines[i])) return lines[i].replace(/^#{1,6}\s*/, '').trim();
  }
  return null;
}

/** Все ссылки задачника: откуда, куда и с каким пояснением. */
function collectLinks(files) {
  const links = [];
  for (const file of files) {
    if (!file || typeof file.text !== 'string' || !file.text) continue;
    const isProject = /^projects\//i.test(file.path || '');
    const projectKey = isProject ? projectKeyForPath(file.path) : null;

    if (isProject) {
      for (const task of parseTasks(file)) {
        for (const child of task.children) {
          const parsed = parseRefLine(child);
          if (!parsed) continue;
          const from = {
            path: file.path,
            line: task.line,
            project: projectKey,
            hash: taskHash(projectKey, task.title),
            title: task.title,
          };
          for (const to of parsed.refs) links.push({ from, to, note: parsed.note });
        }
      }
    }

    // Ссылка вне задачи: запись журнала, слот дня, операция в деньгах.
    const isDay = /^days\//i.test(file.path || '');
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (isDay) {
        const slot = parseSlotRef(lines[i]);
        if (slot) {
          links.push({
            from: { path: file.path, line: i + 1, project: null, hash: null, title: `${slot.from}–${slot.to} ${slot.title}` },
            to: slot.ref,
            note: 'слот дня',
          });
          continue;
        }
      }
      if (!REF_LINE_RE.test(lines[i])) continue;
      if (isProject && /^\s/.test(lines[i])) continue; // уже учтена как вложенная строка задачи
      const parsed = parseRefLine(lines[i]);
      if (!parsed) continue;
      const from = {
        path: file.path,
        line: i + 1,
        project: null,
        hash: null,
        title: nearestHeading(lines, i) || (lines[i - 1] || '').trim() || file.path,
      };
      for (const to of parsed.refs) links.push({ from, to, note: parsed.note });
    }
  }
  return links;
}

/** Задача по адресу с доски. Возвращает задачу вместе с её файлом. */
function findTaskByAddress(files, address) {
  if (!address) return null;
  const wanted = `projects/${address.project}.md`.toLowerCase();
  const file = files.find((f) => String(f.path || '').toLowerCase() === wanted);
  if (!file) return null;
  for (const task of parseTasks(file)) {
    if (taskHash(address.project, task.title) === address.hash) {
      return { ...task, project: address.project, hash: address.hash };
    }
  }
  return null;
}

/**
 * Связи задачи в обе стороны. Исходящие идут с разрешённой целью: ссылка на
 * задачу, которой больше нет, — это не связь, а мусор, и он должен быть видно
 * помечен `missing`, а не молча пропущен.
 */
function linksFor(files, address, links = null) {
  const all = links || collectLinks(files);
  const key = `${address.project}/${address.hash}`;
  const outgoing = all
    .filter((l) => l.from.project === address.project && l.from.hash === address.hash)
    .map((l) => {
      const target = findTaskByAddress(files, l.to);
      return {
        ref: `${l.to.project}/${l.to.hash}`,
        note: l.note,
        title: target ? target.title : null,
        path: target ? target.path : null,
        done: target ? target.done : null,
        children: target ? target.children : [],
        missing: !target,
      };
    });
  const incoming = all
    .filter((l) => `${l.to.project}/${l.to.hash}` === key)
    .map((l) => ({
      ref: l.from.project && l.from.hash ? `${l.from.project}/${l.from.hash}` : null,
      path: l.from.path,
      line: l.from.line,
      title: l.from.title,
      note: l.note,
    }));
  return { outgoing, incoming };
}

// ── Дельта: что изменилось с прошлого прохода ────────────────────────────
//
// У каждого файла в индексе есть ревизия, и по ней видно, что файл трогали.
// Но «файл изменился» — слишком грубо, чтобы на этом что-то решать: в проекте
// на полсотни строк это может быть и новая задача, и снятая галочка. Поэтому
// прошлый проход запоминается отпечатком: ревизия, число строк и по задаче —
// её состояние и слепок вложенных строк. Тогда разница читается словами:
// «добавилась задача», «закрылась», «появилась строка ждём:».

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDigest(value) {
  return require('node:crypto').createHash('md5').update(String(value), 'utf8').digest('hex').slice(0, 4);
}

function taskMark(task) {
  if (task.done) return 'x';
  if (task.waiting) return '>';
  return ' ';
}

/** Отпечаток файла — то, что кладётся в память прохода. */
function fileSnapshot(file) {
  const text = String((file && file.text) || '');
  // Считаем непустые строки: пустая строка в конце файла то появляется, то
  // исчезает от разных операций записи, и на счёте всех строк хвост дописанного
  // уезжал бы на строку.
  const snapshot = {
    rev: Number(file.rev) || 0,
    updatedAt: Number(file.updatedAt) || 0,
    lines: text ? text.split('\n').filter((l) => l.trim()).length : 0,
  };
  if (/^projects\//i.test(file.path || '')) {
    const projectKey = projectKeyForPath(file.path);
    snapshot.tasks = {};
    for (const task of parseTasks(file)) {
      snapshot.tasks[taskHash(projectKey, task.title)] = `${taskMark(task)}${shortDigest(task.children.join('\n'))}`;
    }
  }
  return snapshot;
}

const MARK_WORD = { ' ': 'открыта', x: 'закрыта', '>': 'ждёт', '~': 'в работе' };

/**
 * Разница между отпечатком прошлого прохода и текущим файлом.
 *
 * Хвост дописанных строк берётся по числу строк: журнал, день и деньги всегда
 * дописываются в конец, и это самый дешёвый способ показать «что нового», не
 * храня прошлый текст целиком. Строк стало меньше — значит правили середину, и
 * тогда честнее сказать «изменился», чем показать неверный хвост.
 */
function diffFile(prev, file, { tailLimit = 12 } = {}) {
  const next = fileSnapshot(file);
  const out = {
    path: file.path,
    status: prev ? 'changed' : 'added',
    rev_from: prev ? prev.rev : 0,
    rev_to: next.rev,
    appended: [],
    added_tasks: [],
    closed_tasks: [],
    changed_tasks: [],
    gone_tasks: [],
  };

  const filled = String(file.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const prevLines = prev ? Number(prev.lines) || 0 : 0;
  if (filled.length > prevLines) out.appended = filled.slice(prevLines).slice(0, tailLimit);

  if (next.tasks) {
    const projectKey = projectKeyForPath(file.path);
    const before = (prev && prev.tasks) || null;
    const byHash = new Map();
    for (const task of parseTasks(file)) byHash.set(taskHash(projectKey, task.title), task);

    for (const [hash, task] of byHash) {
      const was = before ? before[hash] : undefined;
      const now = next.tasks[hash];
      const entry = {
        hash,
        ref: `${projectKey}/${hash}`,
        title: task.title,
        state: MARK_WORD[taskMark(task)] || 'открыта',
        due: task.due,
        priority: task.priority,
        children: task.children,
      };
      if (!before) continue;              // прошлого слепка задач нет — деталей не выдумываем
      if (was === undefined) { out.added_tasks.push(entry); continue; }
      if (was === now) continue;
      if (was[0] !== now[0] && task.done) { out.closed_tasks.push(entry); continue; }
      out.changed_tasks.push({ ...entry, was: MARK_WORD[was[0]] || 'открыта' });
    }
    if (before) {
      for (const hash of Object.keys(before)) {
        if (!byHash.has(hash)) out.gone_tasks.push({ hash, ref: `${projectKey}/${hash}` });
      }
    }
  }

  return { diff: out, snapshot: next };
}

// ── Развитие контекстов: что заметить самому ─────────────────────────────
//
// Здесь считаются наблюдения, которые методичка задачника («Гибкость
// контекстов», «Люди», «Журнал») велит замечать самому: тема переросла проект,
// тема расползлась по проектам, обещание висит без движения, проект пора
// схлопнуть, мысль ходит по журналу кругами.
//
// Всё это — эвристики, и они обязаны быть скупыми. Потолок в три находки за
// проход стоит не здесь, а в инструменте, но правила подбора настроены так,
// чтобы кандидатов было единицы, а не десятки: длинный список наблюдений
// перестают читать, и тогда вся затея работает в минус.

const THEME_STOP_WORDS = [
  'сделать', 'купить', 'написать', 'позвонить', 'отправить', 'забрать', 'найти',
  'проверить', 'добавить', 'обновить', 'поставить', 'решить', 'разобрать',
  'посмотреть', 'узнать', 'сходить', 'съездить', 'привезти', 'доделать',
  'собрать', 'закрыть', 'спросить', 'договориться', 'который', 'которая',
  'чтобы', 'нужно', 'потом', 'после', 'перед', 'через', 'вместе', 'сейчас',
  'самый', 'самое', 'ещё', 'если', 'когда', 'может', 'можно', 'вообще',
  'todo', 'задача', 'задачи', 'вопрос', 'вариант',
];
/**
 * Основа слова для темы — первые пять букв.
 *
 * `stemWord` для поиска отрезает два символа, и этого хватает, пока рядом есть
 * сравнение по началу слова. Здесь сравниваются сами основы, и такая обрезка
 * разводит «праздник» и «праздника» в разные темы — то есть ровно ту тему, из-за
 * которой стоило бы завести отдельный контекст, никто и не заметит.
 */
function themeStem(word) {
  return word.length > 5 ? word.slice(0, 5) : word;
}

const THEME_STOP_STEMS = new Set(THEME_STOP_WORDS.map((w) => themeStem(w)));

/** Слова темы: основа → самое короткое написание, им тему и называем. */
function themeTokens(text) {
  const out = new Map();
  for (const word of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 5 || /^\d+$/.test(word)) continue;
    const stem = themeStem(word);
    if (THEME_STOP_STEMS.has(stem)) continue;
    const prev = out.get(stem);
    if (!prev || word.length < prev.length) out.set(stem, word);
  }
  return out;
}

function dateToMs(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function projectFiles(files) {
  return files.filter((f) => /^projects\//i.test(f.path || ''));
}

/**
 * Находки по задачнику. Возвращает всех кандидатов без потолка и без памяти:
 * и то и другое — дело инструмента, а функция должна оставаться проверяемой.
 */
function reviewFindings(files, { nowMs = Date.now(), index = null, minTheme = 5, staleDays = 14, quietDays = 30 } = {}) {
  const findings = [];
  const projects = projectFiles(files);
  const themeByProject = new Map(); // stem → { word, projects: Map<project, tasks[]> }

  for (const file of projects) {
    const projectKey = projectKeyForPath(file.path);
    if (projectKey === 'someday') continue; // отложенное лежит кучей по замыслу
    const open = parseTasks(file).filter((t) => !t.done);

    const byStem = new Map();
    for (const task of open) {
      for (const [stem, word] of themeTokens(task.title)) {
        if (!byStem.has(stem)) byStem.set(stem, { word, tasks: [] });
        byStem.get(stem).tasks.push(task);
        if (!themeByProject.has(stem)) themeByProject.set(stem, { word, projects: new Map() });
        const across = themeByProject.get(stem);
        if (word.length > across.word.length) across.word = word;
        if (!across.projects.has(projectKey)) across.projects.set(projectKey, []);
        across.projects.get(projectKey).push(task);
      }
    }

    // 1. Тема переросла проект: задач по ней много, но это не весь проект.
    for (const [stem, group] of byStem) {
      if (group.tasks.length < minTheme) continue;
      if (group.tasks.length >= open.length) continue; // это и есть сам проект, делить нечего
      findings.push({
        kind: 'split_context',
        key: `split_context:${projectKey}:${stem}`,
        project: projectKey,
        rank: 2,
        weight: group.tasks.length,
        subject: group.word,
        title: `Выделить «${group.word}» из ${projectKey} в отдельный контекст`,
        questions: [
          `В ${projectKey} набралось ${group.tasks.length} задач про «${group.word}» — выделяем в отдельный контекст, и как тогда назовём файл в projects/?`,
        ],
        context: [
          `задач по теме: ${group.tasks.length} из ${open.length} открытых в проекте`,
          ...group.tasks.slice(0, 4).map((t) => `— ${t.title}`),
        ],
      });
    }

    // 2. Проект без движения и почти пустой — кандидат на схлопывание.
    const meta = index && index.files ? index.files[file.path] : null;
    const lastTouch = Math.max(
      Number(meta && meta.updatedAt) || 0,
      ...open.map((t) => dateToMs(t.created) || 0),
      ...parseTasks(file).map((t) => dateToMs(t.due) || 0),
    );
    if (open.length > 0 && open.length < 3 && lastTouch && nowMs - lastTouch >= quietDays * DAY_MS) {
      const days = Math.floor((nowMs - lastTouch) / DAY_MS);
      findings.push({
        kind: 'collapse_project',
        key: `collapse_project:${projectKey}`,
        project: projectKey,
        rank: 4,
        weight: days,
        subject: projectKey,
        title: `Схлопнуть проект ${projectKey}`,
        questions: [
          `${projectKey} стоит без движения ${days} дней, в нём ${open.length} задач${open.length === 1 ? 'а' : 'и'} — вернуть их в родительский контекст или в someday.md?`,
        ],
        context: open.map((t) => `— ${t.title}`),
      });
    }

    // 3. Обещание человеку висит без движения.
    for (const task of parseTasks(file).filter((t) => !t.done)) {
      for (const child of task.children) {
        const match = /^ждём:\s*(.*)$/i.exec(child);
        if (!match) continue;
        const body = match[1];
        const person = body.split(/[—–-]/)[0].trim();
        // Имя и дату из текста ожидания убираем: вопрос и так начинается с
        // имени, а «Даня — привезёт зеркало, с 2026-07-05» внутри вопроса
        // читается как заикание.
        const what = body.slice(person.length).replace(/^[\s—–-]+/, '').replace(/,?\s*с\s+\d{4}-\d{2}-\d{2}\s*$/, '').trim() || body;
        const since = dateToMs((/(?:^|\s)с\s+(\d{4}-\d{2}-\d{2})/.exec(body) || [])[1]) || dateToMs(task.created);
        if (!since) continue;
        const days = Math.floor((nowMs - since) / DAY_MS);
        if (days < staleDays) continue;
        findings.push({
          kind: 'stale_promise',
          key: `stale_promise:${projectKey}:${shortDigest(`${person}|${body}`)}`,
          project: projectKey,
          // Ожидание уже висит на своей задаче — вопрос должен лечь под неё, а
          // не завести вторую задачу про то же самое.
          hash: taskHash(projectKey, task.title),
          rank: 1,
          weight: days,
          subject: person,
          title: `Зависло ожидание: ${person} — ${what}`,
          questions: [
            `${person}: «${what}» — ждём ${days} дней. Напомнить или снять ожидание?`,
          ],
          context: [`задача: ${task.title}`, `ждём с ${new Date(since).toISOString().slice(0, 10)}, это ${days} дней`],
        });
      }
    }
  }

  // 4. Тема всплывает в разных проектах — каждый раз ложится в новый.
  for (const [stem, across] of themeByProject) {
    if (across.projects.size < 3) continue;
    const total = [...across.projects.values()].reduce((sum, list) => sum + list.length, 0);
    findings.push({
      kind: 'scattered_theme',
      key: `scattered_theme:${stem}`,
      project: [...across.projects.keys()][0],
      rank: 3,
      weight: total,
      subject: across.word,
      title: `Свести «${across.word}» в один контекст`,
      questions: [
        `«${across.word}» лежит в ${[...across.projects.keys()].join(', ')} — держим в одном месте или так и оставляем?`,
      ],
      context: [...across.projects.entries()].map(([p, list]) => `${p}: ${list.length} — ${list[0].title}`),
    });
  }

  // 5. Мысль ходит по журналу кругами.
  findings.push(...repeatedThoughts(files, { nowMs }));

  return findings;
}

/** Повторяющиеся мысли журнала: одна и та же фраза в разные дни. */
function repeatedThoughts(files, { minTimes = 3, minDates = 2 } = {}) {
  const groups = new Map();
  for (const file of files.filter((f) => /^journal\//i.test(f.path || ''))) {
    const lines = String(file.text || '').split('\n');
    let date = null;
    for (let i = 0; i < lines.length; i += 1) {
      const heading = /^#{1,6}\s*(\d{4}-\d{2}-\d{2})/.exec(lines[i]);
      if (heading) { date = heading[1]; continue; }
      const line = lines[i].trim();
      if (line.length < 25 || /^#/.test(line)) continue;
      // Отпечаток мысли — четыре самых длинных слова строки. Первые попавшиеся
      // слова не годятся: «опять думаю про …» и «снова думаю про …» — это одна
      // мысль, а по началу строки они разные. Длинные слова в русской фразе и
      // есть то, о чём она.
      const tokens = [...themeTokens(line).entries()];
      if (tokens.length < 3) continue;
      const signature = tokens
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 4)
        .map(([stem]) => stem)
        .sort()
        .join('+');
      if (!groups.has(signature)) groups.set(signature, { lines: [], dates: new Set(), words: themeTokens(line) });
      const group = groups.get(signature);
      group.lines.push({ path: file.path, line: i + 1, text: line, date });
      if (date) group.dates.add(date);
    }
  }

  const out = [];
  for (const [signature, group] of groups) {
    if (group.lines.length < minTimes || group.dates.size < minDates) continue;
    // Мысль называем её же словами, а не набором основ: «расползаются
    // праздники» человек в своей записи не узнает, а свою фразу — узнает сразу.
    const sample = group.lines.map((l) => l.text).sort((a, b) => a.length - b.length)[0];
    const label = sample.length > 70 ? `${sample.slice(0, 70).trim()}…` : sample;
    out.push({
      kind: 'repeating_thought',
      key: `repeating_thought:${shortDigest(signature)}`,
      project: null,
      rank: 5,
      weight: group.lines.length,
      subject: label,
      title: `Мысль повторяется в журнале: «${label}»`,
      questions: [
        `Ты возвращаешься к этому ${group.lines.length}-й раз (${[...group.dates].join(', ')}) — заводим задачу или отпускаем?`,
      ],
      context: group.lines.slice(0, 3).map((l) => `${l.date || l.path}: ${l.text.slice(0, 120)}`),
    });
  }
  return out;
}

// ── Память прохода ───────────────────────────────────────────────────────
//
// Без памяти всё вышенаписанное вредно: агент, который каждый проход заново
// «замечает» одно и то же, превращается в генератор шума, и его перестают
// читать вместе со всем остальным. Поэтому проход помнит две вещи: отпечаток
// задачника (чтобы входить в разницу, а не во весь файлопад) и то, что уже
// предлагал — вместе с ответом.
//
// Отказ держится месяц: ровно так написано в методичке про выделение
// контекста («повторно с ней не приставать раньше месяца»). Предложение без
// ответа не поднимается две недели — оно и так висит на доске.

const STATE_KEY = `${KEY_PREFIX}agent_state`;
// `later` — это его «вернёмся к этому», а не «ещё не отвечал»: срок совпадает
// с `proposed`, но статус отдельный. Иначе ответ «позже» неотличим от молчания,
// и стоит однажды сдвинуть срок непрочитанного предложения — вместе с ним
// молча уедет и то, о чём он прямо просил вернуться.
const PROPOSAL_COOLDOWN_DAYS = { proposed: 14, later: 14, declined: 30, accepted: 90 };

/** Предложение, на которое ответа по существу ещё нет: своё же, но не закрытое. */
const PROPOSAL_OPEN_STATUSES = new Set(['proposed', 'later']);

function ensureState(raw) {
  const base = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const seen = (base.seen && typeof base.seen === 'object' && !Array.isArray(base.seen)) ? base.seen : {};
  const files = (seen.files && typeof seen.files === 'object' && !Array.isArray(seen.files)) ? seen.files : {};
  const proposals = (base.proposals && typeof base.proposals === 'object' && !Array.isArray(base.proposals))
    ? base.proposals
    : {};
  // За какой день уже спрошено про деньги. Хранится дата, а не флаг: планёрка
  // бывает не каждый день, и «спрашивал вчера» не значит «спрашивал про этот
  // день». Одна дата — один вопрос, сколько бы раз за утро ни звали повестку.
  const nudge = (base.money_nudge && typeof base.money_nudge === 'object' && !Array.isArray(base.money_nudge))
    ? base.money_nudge
    : null;
  // Ротация простых вопросов и их спячка. Оба живут здесь, а не в файлах
  // задачника: «этот уже спрашивали сегодня утром» и «про этот молчим до 17-го»
  // — состояние прохода, а не запись, которую он ведёт руками. Строка
  // «открыто:» от этого не меняется вовсе.
  const rota = (base.question_rota && typeof base.question_rota === 'object' && !Array.isArray(base.question_rota))
    ? base.question_rota
    : {};
  const rotaShown = (rota.shown && typeof rota.shown === 'object' && !Array.isArray(rota.shown)) ? rota.shown : {};
  const sleep = (base.question_sleep && typeof base.question_sleep === 'object' && !Array.isArray(base.question_sleep))
    ? base.question_sleep
    : {};
  // Отметки о сверке стенограмм здесь нет намеренно: она живёт в самом файле
  // стенограммы. Дата в памяти отвечала одинаково неверно на все три случая —
  // вторая планёрка за день, ночная работа во вчерашнем файле и пропущенная
  // планёрка, — потому что помнила день, а не место, где кончилось прочитанное.
  //
  // transcript_pending — флаг «была запись в задачник/дневник без checkpoint».
  // Нужен Stop-хукам и приписке: таймер stale не ловит свежий write без стенограммы.
  const pending = (base.transcript_pending && typeof base.transcript_pending === 'object'
    && !Array.isArray(base.transcript_pending))
    ? base.transcript_pending
    : null;
  return {
    version: 1,
    seen: { at: Number(seen.at) || 0, files: { ...files } },
    proposals: { ...proposals },
    money_nudge: (nudge && typeof nudge.date === 'string' && nudge.date)
      ? { date: nudge.date, at: Number(nudge.at) || 0 }
      : null,
    question_rota: { shown: { ...rotaShown } },
    question_sleep: { ...sleep },
    transcript_pending: (pending && Number(pending.at) > 0)
      ? {
        at: Number(pending.at),
        tool: pending.tool ? String(pending.tool) : null,
        day: pending.day ? String(pending.day) : null,
      }
      : null,
    updatedAt: Number(base.updatedAt) || 0,
  };
}

/** Пометить: была запись без закрытия стенограммы. */
function markTranscriptPending(state, { tool = null, day = null, nowMs = Date.now() } = {}) {
  return {
    ...ensureState(state),
    transcript_pending: {
      at: Number(nowMs) || Date.now(),
      tool: tool ? String(tool) : null,
      day: day ? String(day) : null,
    },
  };
}

/** Снять pending после успешного tasks_checkpoint. */
function clearTranscriptPending(state) {
  return { ...ensureState(state), transcript_pending: null };
}

/** Сколько ещё молчать про это предложение. */
function proposalCooldown(entry, nowMs) {
  if (!entry) return { blocked: false, days_left: 0, status: null };
  const days = PROPOSAL_COOLDOWN_DAYS[entry.status] ?? PROPOSAL_COOLDOWN_DAYS.proposed;
  const since = Number(entry.answeredAt) || Number(entry.proposedAt) || 0;
  const left = Math.ceil((since + days * DAY_MS - nowMs) / DAY_MS);
  return { blocked: left > 0, days_left: Math.max(0, left), status: entry.status };
}

/**
 * Что из найденного вообще можно поднимать. Потолок жёсткий: не больше трёх за
 * проход, независимо от того, сколько нашлось. Это не настройка — без него
 * длинный список наблюдений перестают читать, и вместе с ним перестают читать
 * блок «Требует решения».
 */
function pickFindings(state, findings, { nowMs = Date.now(), limit = 3 } = {}) {
  const cap = Math.max(0, Math.min(Number(limit) || 3, 3));
  const skipped = [];
  const fresh = [];
  for (const finding of findings) {
    const cooldown = proposalCooldown(state.proposals[finding.key], nowMs);
    if (cooldown.blocked) { skipped.push({ ...finding, cooldown }); continue; }
    fresh.push(finding);
  }
  fresh.sort((a, b) => (a.rank - b.rank) || (b.weight - a.weight) || a.key.localeCompare(b.key));
  return { picked: fresh.slice(0, cap), skipped, held_back: Math.max(0, fresh.length - cap) };
}

function rememberProposal(state, finding, { nowMs = Date.now(), ref = null } = {}) {
  const prev = state.proposals[finding.key] || {};
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [finding.key]: {
        kind: finding.kind,
        subject: finding.subject,
        project: finding.project,
        title: finding.title,
        status: 'proposed',
        proposedAt: nowMs,
        answeredAt: 0,
        ref: ref || prev.ref || null,
        note: prev.note || null,
      },
    },
    updatedAt: nowMs,
  };
}

function answerProposal(state, key, { status = 'declined', nowMs = Date.now(), note = null } = {}) {
  const prev = state.proposals[key];
  if (!prev) return null;
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [key]: { ...prev, status, answeredAt: nowMs, note: note || prev.note || null },
    },
    updatedAt: nowMs,
  };
}

// ── Пять простых вопросов на планёрку ────────────────────────────────────
//
// К 2026-08-03 на доске 29 строк «открыто:», и разбираются они плохо не потому,
// что трудные, а потому что лежат все сразу: список, который нельзя закрыть за
// один заход, перестают открывать целиком. Планёрка берёт из них пять таких, на
// которые он отвечает не вставая, — и спрашивает их вслух каждое утро и вечер.
//
// Простой вопрос — это выбор из двух или «да/нет»: не надо ничего считать и не
// нужен другой человек. Смысл кодом не прочитать, поэтому отбор идёт по форме
// записи, а она видна:
//
//   ЗА — в вопросе есть развилка: «… или …», частица «ли», либо он кончается
//   «?» и не начинается с вопросительного слова (тогда это «да/нет»).
//   «Какая площадь у склада» развилки не несёт, и ответом на него будет не
//   решение, а поход с рулеткой.
//
//   ПРОТИВ — три вещи, каждая делает вопрос неотвечаемым на месте: нужен другой
//   человек («согласовать», «спросить», родня, имя собственное), надо посчитать
//   или замерить, и длина — формулировка длиннее SIMPLE_QUESTION_MAX_LEN это уже
//   не вопрос, а сложенный в строку кусок разбора.
//
// Планка проверена на живом задачнике: из 29 вопросов простыми признаны 17.
// Она намеренно осторожная — пропустить простой вопрос дешевле, чем каждое утро
// подсовывать ему тот, на который нельзя ответить без рулетки и созвона.
//
// Границы слов пишутся классами букв, а не `\b`: в JS `\b` считает буквой
// только ASCII, поэтому `\bбрат\b` не совпадает НИ С ЧЕМ. На этом уже один раз
// потеряли отсев по родне.

/** Длиннее этого — не вопрос, а кусок разбора: ответить на месте нельзя. */
const SIMPLE_QUESTION_MAX_LEN = 140;
/** Сколько простых вопросов уходит в одну планёрку. */
const SIMPLE_QUESTION_LIMIT = 5;
/**
 * Спячка по умолчанию. Две планёрки в день и пул около двух десятков означают,
 * что круг проходится примерно за двое суток. Две недели — это ~7 кругов: вопрос
 * гарантированно замолкает, но не исчезает. Срок тот же, что у «вернёмся к
 * этому» у предложений (PROPOSAL_COOLDOWN_DAYS.later) — это одно и то же по сути.
 */
const QUESTION_SLEEP_DAYS = 14;

const CHOICE_RE = /\sили\s/i;
const CHOICE_LI_RE = /(?:^|\s)ли(?=[\s,.?!;:]|$)/i;
const OPEN_WH_RE = /(?:^|\s)(как(?:ой|ая|ое|ие|ого|ому|ую|им|ом)?|сколько|насколько|где|куда|откуда|когда|почему|зачем|что|чего|чем|кто|кого|кому)(?=[\s,.?!;:]|$)/i;
const NEEDS_PERSON_RE = /(?<![а-яё])(согласов|спрос|уточнить у|договор|кто-то другой|кто-нибудь|брат|сестр|жена|жены|муж|мужа|мама|мамы|папа|папы|собственник|арендодател|подрядчик)/i;
const NEEDS_COUNT_RE = /(?<![а-яё])(сколько|посчит|подсчит|пересчит|не считается|замер|измер|собрать данные|список|объём|смет[ауы])/i;

/**
 * Имя собственное в середине вопроса — признак того, что в деле есть кто-то
 * ещё. Первое слово и слово после точки, «?», тире или кавычки не в счёт: там
 * заглавная буква стоит по грамматике, а не по имени. Топоним сюда тоже
 * попадает («пока ты в Суперлэнде») — и это не промах: место, где он будет не
 * один, ровно так же делает вопрос несамостоятельным.
 */
function mentionsProperName(text) {
  const s = String(text || '');
  const re = /[А-ЯЁ][а-яё]{2,}/g;
  let match;
  while ((match = re.exec(s))) {
    if (match.index === 0) continue;
    const before = s.slice(0, match.index).replace(/\s+$/, '');
    if (!before || /[.?!:;—–«"(]$/.test(before)) continue;
    return true;
  }
  return false;
}

/** Простой ли вопрос — и если нет, то почему. Причина нужна отладке и тестам. */
function isSimpleQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return { simple: false, reason: 'пусто' };
  if ([...text].length > SIMPLE_QUESTION_MAX_LEN) return { simple: false, reason: 'слишком длинный' };
  const choice = CHOICE_RE.test(text) || CHOICE_LI_RE.test(text);
  const yesNo = !choice && /\?\s*$/.test(text) && !OPEN_WH_RE.test(text);
  if (!choice && !yesNo) return { simple: false, reason: 'нет развилки' };
  if (NEEDS_PERSON_RE.test(text) || mentionsProperName(text)) return { simple: false, reason: 'нужен другой человек' };
  if (NEEDS_COUNT_RE.test(text)) return { simple: false, reason: 'надо посчитать' };
  return { simple: true, reason: null };
}

/**
 * Порядок: ближе срок задачи — выше. Задача без срока идёт после всех, у кого
 * срок есть: «когда-нибудь» не может обгонять «послезавтра». При равных сроках
 * выше тот вопрос, что старше, — а своей даты у него нет, поэтому старшинство
 * берётся сначала по дате заведения задачи, потом по месту в файле: строки
 * дописываются вниз, и верхняя действительно старше. Два вопроса под ОДНОЙ
 * задачей неразличимы по всем четырём признакам — их разводит устойчивость
 * сортировки: порядок сбора равен порядку строк в файле, и он сохраняется.
 */
function compareSimpleQuestions(a, b) {
  if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (Boolean(a.created) !== Boolean(b.created)) return a.created ? -1 : 1;
  if (a.created && b.created && a.created !== b.created) return a.created < b.created ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return (a.line || 0) - (b.line || 0);
}

/**
 * Пятёрка на эту планёрку.
 *
 * Ротация нужна ровно затем, чтобы вторая планёрка дня не повторила первую.
 * Память хранит показанное, но круг не бесконечен: если незаданных осталось
 * меньше пяти, круг начинается заново и добор идёт с начала списка. Молчать
 * нельзя — планёрка без вопросов не уменьшает число открытых.
 *
 * Отвеченный вопрос уходит из ротации сам: строки `открыто:` под задачей больше
 * нет, значит нет и вопроса в пуле. Отдельного «снять с ротации» не существует
 * и заводить его не надо — иначе появится вторая запись о том же, и они
 * разойдутся.
 */
function pickSimpleQuestions(questions, state, { today, limit = SIMPLE_QUESTION_LIMIT } = {}) {
  const cap = Math.max(1, Number(limit) || SIMPLE_QUESTION_LIMIT);
  const sleep = (state && state.question_sleep) || {};
  const shown = (state && state.question_rota && state.question_rota.shown) || {};

  const pool = [];
  const sleeping = [];
  for (const item of questions) {
    // Задача закрыта, а строка «открыто:» под ней осталась — это остаток, а не
    // вопрос: спрашивать про решённое значит тратить его время впустую. Строку
    // при этом никто не трогает, её судьба — отдельный разговор.
    if (item.done) continue;
    if (!isSimpleQuestion(item.question).simple) continue;
    // Спячка вопроса и перенос его задачи — разные вещи: там отложен один
    // вопрос, здесь вся задача целиком. Сработали обе — молчим до более
    // поздней из дат, иначе ранняя разбудила бы вопрос раньше времени.
    const nap = sleep[item.key];
    const until = today
      ? [nap && nap.until, item.back].filter((date) => date && date > today).sort().pop() || null
      : null;
    if (until) {
      sleeping.push({ ...item, until, deferred: Boolean(item.back && item.back === until) });
      continue;
    }
    pool.push(item);
  }
  pool.sort(compareSimpleQuestions);

  // Одна задача с несколькими «открыто:» не должна забирать весь круг: не
  // больше одного её вопроса за раз, остальные ждут следующего круга ротации
  // (инцидент 06.08 — норма белка отдавала 4 вопроса из 5, «Ремонт склада»
  // не показывался вовсе). Без ref вопрос уникален сам по себе.
  const usedRefs = new Set();
  const takeOne = (item) => {
    if (item.ref && usedRefs.has(item.ref)) return false;
    if (item.ref) usedRefs.add(item.ref);
    return true;
  };

  const unseen = pool.filter((item) => !shown[item.key]);
  const picked = [];
  for (const item of unseen) {
    if (picked.length >= cap) break;
    if (takeOne(item)) picked.push(item);
  }

  let roundReset = false;
  if (picked.length < cap && pool.length > picked.length) {
    roundReset = true;
    const taken = new Set(picked.map((item) => item.key));
    for (const item of pool) {
      if (picked.length >= cap) break;
      if (taken.has(item.key)) continue;
      if (takeOne(item)) picked.push(item);
    }
    picked.sort(compareSimpleQuestions);
  }
  return {
    picked,
    sleeping,
    pool: pool.length,
    round_reset: roundReset,
    keys: questions.map((item) => item.key),
  };
}

/**
 * Запомнить показанное. Заодно выкидывает из памяти ключи, которых в задачнике
 * больше нет: отвеченный вопрос не должен занимать место в ротации вечно.
 * Начался новый круг — старые отметки стираются целиком, иначе он не начнётся.
 */
function rememberShownQuestions(state, { picked = [], keys = [], reset = false, nowMs = Date.now() } = {}) {
  const alive = new Set(keys);
  const prev = (state.question_rota && state.question_rota.shown) || {};
  const shown = reset ? {} : Object.fromEntries(Object.entries(prev).filter(([key]) => alive.has(key)));
  for (const item of picked) shown[item.key] = nowMs;
  const sleep = Object.fromEntries(Object.entries(state.question_sleep || {}).filter(([key]) => alive.has(key)));
  return { ...state, question_rota: { shown }, question_sleep: sleep, updatedAt: nowMs };
}

/**
 * Отправить вопрос в спячку. Строку `открыто:` это не трогает намеренно:
 * «не трогать» — это «не спрашивай пока», а не «вопроса больше нет». Удалять
 * его вправе только он сам, и делается это через tasks_resolve.
 */
function sleepQuestion(state, item, { until, nowMs = Date.now() } = {}) {
  return {
    ...state,
    question_sleep: {
      ...(state.question_sleep || {}),
      [item.key]: { until, at: nowMs, question: item.question, ref: item.ref || null },
    },
    updatedAt: nowMs,
  };
}

// ── Что читать первым, когда всё не влезает ──────────────────────────────
//
// Чтение пачкой ограничено сверху: задачник целиком — это десятки килобайт, и
// тащить их в каждый поиск незачем. Но резать по порядку ключей нельзя. Ключи
// идут по алфавиту, `days/` растёт на файл в день и стоит раньше `projects/`,
// поэтому через пару недель под нож попадали бы сами задачи — молча, без
// ошибки: поиск просто «ничего не нашёл». Порядок задаётся смыслом, а не
// алфавитом, и дни берутся ближайшие к сегодня, а не самые старые.

const PATH_RANK = [
  [/^projects\//i, 0],          // сами задачи — без них не отвечает ничто
  [/^(NOW|INBOX|GOALS|habits)\.md$/i, 1],
  // 2 — рабочая память и справочники, см. isStateFile / isReference ниже
  [/^days\//i, 3],
  [/^journal\//i, 4],
  [/^archive\/journal_/i, 4],   // ротация журнала — тот же слой выводов
  [/^money\//i, 5],
  [/^archive\/money_/i, 5],
  [/^archive\//i, 6],
  [/^transcript\//i, 8],
  [/^archive\/transcript_/i, 8],
];

/**
 * Справочник: формат файлов, договорённости, карта районов и время в пути.
 *
 * Стоял 7-м рангом, и это оказалось миной. Датированные папки растут на файл в
 * день, а потолок чтения не растёт: по счёту файлов README.md и CLAUDE.md
 * выпадали из сплошного прохода примерно к 19 августа — молча, вместе с картой
 * районов, которую больше взять негде. Цена подъёма нулевая: справочники малы,
 * их всего несколько штук, и в потолок они и так помещались — менялся только
 * порядок, в котором их отрезают.
 *
 * Признак — имя файла, а не корень: справка о формате лежит рядом с данными
 * (`days/README.md`, `money/README.md`), и по папке она неотличима от
 * датированных файлов, которые её и вытесняют.
 */
function isReference(path) {
  return /(^|\/)(README|CLAUDE)\.md$/i.test(String(path || ''));
}

/**
 * Рабочая память живёт в docs/, но документацией не является.
 *
 * Признак не «лежит в docs/», а «это состояние, которое пишет сам коннектор»:
 * как он решает (tasks_learn), что вынесено на планёрку (tasks_standup), о чём
 * напомнить (tasks_remind), чей ответ победил в эксперименте (tasks_vote).
 * Список закрытый и растёт только вместе с инструментом, который туда пишет, —
 * поэтому его можно перечислить, в отличие от отчётов.
 *
 * Пути объявлены ниже по файлу, рядом со своими инструментами, поэтому набор
 * собирается при первом обращении, а не при загрузке модуля.
 */
let stateFilesCache = null;
function stateFiles() {
  if (!stateFilesCache) {
    stateFilesCache = new Set([PREFS_PATH, STANDUP_PATH, REMINDERS_PATH, VOTES_PATH]);
  }
  return stateFilesCache;
}

function isStateFile(path) {
  return stateFiles().has(String(path || '').trim().toLowerCase());
}

/**
 * Разовый отчёт: всё остальное в docs/ — аудит, симуляция, разбор ночи, разбор
 * токенов, дашборд. Это 62% задачника по объёму (≈97 тысяч токенов из 156) и
 * почти целиком написанное один раз для одного прочтения. Признак нарочно
 * выведен «от обратного»: перечислять имена отчётов бессмысленно, их пишут
 * агенты и завтра появится ещё три, а вот файлов состояния конечное число.
 */
function isOneOffReport(path) {
  const clean = String(path || '').trim().toLowerCase();
  return /^docs\//.test(clean) && !isStateFile(clean);
}

function pathRank(path) {
  if (isStateFile(path)) return 2;      // рабочая память — вровень с задачами, до дней
  if (isReference(path)) return 2;      // справочники — там же: их вытесняли растущие дни
  if (isOneOffReport(path)) return 9;   // разовые отчёты — последними
  for (const [re, rank] of PATH_RANK) if (re.test(String(path || ''))) return rank;
  return 8;                             // прочее (rituals/ и подобное) — перед отчётами
}

/** Насколько дата в имени файла далека от сегодняшней, в днях. */
function dateDistance(path, today) {
  const found = /(\d{4}-\d{2}(?:-\d{2})?)/.exec(String(path || ''));
  if (!found || !today) return null;
  const [a, b] = [found[1].length === 7 ? `${found[1]}-01` : found[1], today];
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS));
}

/**
 * Порядок чтения: сначала по смыслу, внутри датированных папок — ближайшее к
 * сегодня. Будущее и вчера нужнее, чем позапрошлый месяц.
 */
function rankPaths(paths, { today = null } = {}) {
  return [...paths].sort((a, b) => {
    const byRank = pathRank(a) - pathRank(b);
    if (byRank) return byRank;
    const da = dateDistance(a, today);
    const db = dateDistance(b, today);
    if (da !== null && db !== null && da !== db) return da - db;
    return String(a).localeCompare(String(b));
  });
}

/**
 * Сколько файлов из одной датированной папки берётся в сплошной проход.
 *
 * Порядок сам по себе от вытеснения не спасает: `days/` пополняется каждый
 * день и стоит выше журнала, денег и архива, поэтому за год он один занял бы
 * весь потолок, а всё, что ниже, перестало бы читаться — снова молча. Двенадцать
 * — это две недели дней либо год месячных файлов журнала и денег: дальше начинается
 * прошлое, за которым и так ходят прицельно, поиском или прямым чтением.
 */
const DATED_QUOTA = 12;

/**
 * Папка для квоты сплошного прохода.
 * Ротационные части в archive/ считают к той же группе, что активный файл:
 * иначе archive/ съедает свою дюжину, а journal_* вытесняются чужим хвостом.
 */
function datedGroup(path) {
  const p = String(path || '');
  const rotated = /^archive\/(journal|transcript|money)_/i.exec(p);
  if (rotated) return rotated[1].toLowerCase();
  const found = /^([^/]+)\/[^/]*\d{4}-\d{2}/.exec(p);
  return found ? found[1].toLowerCase() : null;
}

/**
 * Что читать сплошным проходом: порядок по смыслу плюс потолок на каждую
 * растущую папку.
 *
 * Лишнее не выбрасывается, а уходит в хвост: если после отбора место осталось,
 * тринадцатый день прочитается — просто после справочников и журнала, а не
 * вместо них. Поднимать сам потолок для этого нельзя: каждый файл прохода
 * оплачивается в каждом разборе фразы.
 */
function selectPaths(paths, { today = null, max = null, perGroup = DATED_QUOTA } = {}) {
  const order = rankPaths(paths, { today });
  const taken = new Map();
  const head = [];
  const rest = [];
  for (const path of order) {
    const group = perGroup ? datedGroup(path) : null;
    if (!group) { head.push(path); continue; }
    const count = taken.get(group) || 0;
    if (count >= perGroup) { rest.push(path); continue; }
    taken.set(group, count + 1);
    head.push(path);
  }
  const selected = [...head, ...rest];
  return max ? selected.slice(0, max) : selected;
}

// ── Стенограмма: напоминание, а не принуждение ───────────────────────────
//
// Записать стенограмму может только сама модель: коннектор видит вызовы
// инструментов, но не текст разговора, и подставить реплику вместо неё не
// может никто. Значит принуждения здесь не бывает — бывает напоминание там,
// куда модель точно смотрит: в результате её же вызова.
//
// Проверка идёт ПО ИНДЕКСУ и не читает файл вовсе: индекс уже поднят для
// любого чтения и записи, в нём есть и сам факт файла, и время последней
// записи. Читать стенограмму ради напоминания было бы вдвойне неуместно —
// она намеренно последняя в `rankPaths` и в разбор не тащится.

const TRANSCRIPT_STALE_MS = 60 * 60 * 1000;

function transcriptPath(date) {
  return `transcript/${date}.md`;
}

/**
 * Состояние стенограммы за день: нет вовсе, отстала или свежая.
 *
 * `updatedAt` в индексе двигает любая запись в файл — и своя, и приехавшая
 * синхронизацией с диска, поэтому «час назад» здесь значит «час назад в
 * задачнике», а не «час назад по этому чату».
 */
function transcriptStatus(index, { date, nowMs, staleMs = TRANSCRIPT_STALE_MS } = {}) {
  const path = transcriptPath(date);
  const entry = index && index.files ? index.files[path] : null;
  if (!entry || !(Number(entry.rev) > 0) || !(Number(entry.updatedAt) > 0)) {
    return { path, date, state: 'missing', age_min: null };
  }
  const age = Number(nowMs) - Number(entry.updatedAt);
  if (!Number.isFinite(age)) return { path, date, state: 'missing', age_min: null };
  const ageMin = Math.max(0, Math.round(age / 60000));
  return { path, date, state: age >= staleMs ? 'stale' : 'fresh', age_min: ageMin };
}

/**
 * Одна строка приписки — или null, когда напоминать не о чем.
 *
 * Номер правила сюда не пишется намеренно: нумерация уже один раз сдвигалась
 * от вставки правила в середину, и приписка с чужим номером хуже, чем без
 * него. Названо то, что делать, а не то, где это записано.
 */
function transcriptReminder(status) {
  if (!status) return null;
  if (status.state === 'missing') {
    return `Стенограмма за ${status.date} пуста — допиши в ${status.path} его реплику дословно и свои выводы.`;
  }
  if (status.state === 'stale') {
    const hours = Math.floor(status.age_min / 60);
    const ago = hours >= 1 ? `${hours} ч назад` : `${status.age_min} мин назад`;
    return `Последняя запись в ${status.path} — ${ago}, а разговор идёт: допиши стенограмму.`;
  }
  return null;
}

// ── Ревизия стенограмм перед планёркой ───────────────────────────────────
//
// Планёрка начиналась с повестки, а повестка собрана только из того, что уже
// заведено. Всё, что за день обсудили и не завели, до неё не доходило вовсе и
// пропадало молча — стенограмма единственное место, где оно осталось.
//
// Отметка о сверке лежит в САМОМ файле стенограммы, а не в памяти прохода.
// Причина простая: планёрок бывает две за день, ночная работа попадает во
// вчерашний файл (сутки задачника кончаются в 3 утра), а планёрку могли
// пропустить вовсе. Дата в памяти на все три случая отвечает одинаково
// неверно — «сегодня уже сверено», хотя сверен был другой текст. Отметка в
// файле отвечает на единственный вопрос, который тут важен: где кончается
// прочитанное. Всё, что ниже последней отметки, — несверенный хвост.
//
// Побочный эффект намеренный: отметки копятся и получается журнал сверок,
// который владелец читает глазами вместе со стенограммой.
//
// Сравнить хвост с задачником код по-прежнему не может: «это уже завели» —
// суждение о смысле, а не совпадение строк. Он делает две вещи: приносит
// материал (какие хвосты и какого размера) и подсовывает кандидатов на
// потерю — подсказку против невнимательности, не результат сверки.

/** Заголовок обмена вида «## 14:20» или «## 14:20–15:00» — с временем внутри. */
const TRANSCRIPT_ENTRY_RE = /^##\s*(~?\d{1,2}:\d{2}(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?)\s*$/;

/**
 * Размер стенограммы: сколько в ней обменов и сколько непустых строк.
 *
 * Пустые строки не считаются намеренно: между блоками их столько же, сколько
 * блоков, и число «строк» с ними говорит про разметку, а не про разговор.
 *
 * `last_entry` — время последнего обмена по заголовку. Заголовки старых
 * стенограмм бывают темой, а не временем (проверка появилась позже файлов):
 * такой файл отдаёт `last_entry: null`, а не выдуманное время.
 */
function transcriptShape(text) {
  const raw = String(text || '');
  const lines = raw.split('\n');
  const headings = lines.filter((line) => /^##\s+\S/.test(line));
  const times = headings
    .map((line) => (TRANSCRIPT_ENTRY_RE.exec(line.trim()) || [])[1] || null)
    .filter(Boolean);
  return {
    sections: headings.length,
    lines: lines.filter((line) => line.trim()).length,
    last_entry: times.length ? times[times.length - 1] : null,
  };
}

/**
 * Отметка о сверке. Заголовок блока обязан быть временем — иначе он не пройдёт
 * `transcriptHeadingError`, и формат стенограммы разъедется на второй же
 * отметке. Всё отличие от обычного обмена — в первой строке тела: она начинается
 * жирным «Сверено с доской» и дальше несёт дату, время и итог.
 *
 * Дата в строке не дублирует имя файла: отметка часто ложится во ВЧЕРАШНИЙ
 * файл (ночная работа) и делается уже сегодня. Без даты выходило бы, что
 * вчерашний разговор сверили вчера же.
 */
const REVIEW_MARK_RE = /^\*\*Сверено с доской\*\*\s*·\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*·\s*(.*)$/;

/** Сколько дней назад заглядывать: планёрку могли пропустить не один раз. */
const REVIEW_WINDOW_DAYS = 7;

function reviewMarkLine({ date, time, summary }) {
  return `**Сверено с доской** · ${date} ${padTime(time)} · ${String(summary || '').trim()}`;
}

function reviewMarkBlock({ date, time, summary }) {
  return `## ${padTime(time)}\n\n${reviewMarkLine({ date, time, summary })}`;
}

/** Дописать отметку в конец стенограммы. */
function appendReviewMark(text, mark) {
  return appendBlock(text, reviewMarkBlock(mark));
}

/**
 * Несверенный хвост файла: всё, что стоит НИЖЕ последней отметки.
 *
 * Отметок нет вовсе — хвост это весь файл: сверять его никто не начинал.
 * Отметок несколько — считается последняя, а не первая: между ними текст уже
 * прочитан. Отметка в последней строке — хвост пустой, и день в блок не идёт.
 */
function transcriptTail(text) {
  const lines = String(text || '').split('\n');
  let marks = 0;
  let last = null;
  let cut = 0;
  lines.forEach((line, i) => {
    if (i < cut) return; // строка уже поглощена как продолжение предыдущей отметки
    const match = REVIEW_MARK_RE.exec(line.trim());
    if (!match) return;
    marks += 1;
    // reviewMarkLine пишет итог одной строкой, но живой текст (ручная правка,
    // старая запись до этого правила) может перенести его на несколько строк.
    // Без этого продолжение итога читалось бы как несверенный текст — шум
    // после каждой отметки, и так навсегда.
    const parts = [match[3].trim()];
    let j = i + 1;
    while (j < lines.length && lines[j].trim()
           && !/^##\s/.test(lines[j]) && !/^\*\*/.test(lines[j].trim())) {
      parts.push(lines[j].trim());
      j += 1;
    }
    last = { date: match[1], time: padTime(match[2]), summary: parts.join(' ').trim() };
    cut = j;
  });
  return { text: lines.slice(cut).join('\n'), marks, last_mark: last };
}

/** Что за день известно: размер несверенного хвоста и последняя отметка. */
function dayReviewDay(file, date) {
  const text = (file && typeof file.text === 'string') ? file.text : '';
  const tail = transcriptTail(text);
  const shape = transcriptShape(tail.text);
  return {
    date,
    path: transcriptPath(date),
    exists: Boolean(text.trim()),
    marks: tail.marks,
    last_mark: tail.last_mark,
    sections: shape.sections,
    lines: shape.lines,
    last_entry: shape.last_entry,
    unreviewed: Boolean(tail.text.trim()),
  };
}

/** Несверенные хвосты окна — материал для кандидатов. Наружу не отдаётся. */
function reviewTails(entries) {
  return (entries || [])
    .map(({ date, file }) => ({ date, text: transcriptTail((file && file.text) || '').text }))
    .filter((tail) => tail.text.trim());
}

/**
 * Причины дня — контекстные строки, которые «Закрыть день» пишет под слотом
 * («✕ не было», «отменилось», «в работу») или самостоятельной строкой у
 * снятого слота. Формат тот же двойной отступ, что у остальных вложенных
 * строк, но это не подзадача (`- [ ]`) и не ждём:/при встрече:/открыто:/см: —
 * у тех своя дорога в задачнике. Решено 05.08: разбираются в той же ревизии,
 * что и хвост стенограммы, — отдельной категорией, а не раз в неделю, иначе
 * теряют актуальность к моменту разбора.
 */
const DAY_REASON_RE = /^ {2}- (.+)$/;
const DAY_REASON_SKIP_RE = /^(ждём:|при встрече:|открыто:|см:|\[[ xX>~-]\])/i;

function dayFileReasons(text) {
  return String(text || '').split('\n')
    .map((line) => DAY_REASON_RE.exec(line))
    .filter(Boolean)
    .map((m) => m[1].trim())
    .filter((line) => line && !DAY_REASON_SKIP_RE.test(line));
}

/**
 * Отметка «Сверено с доской» в дне — тот же формат строки, что у стенограммы
 * (transcriptTail её узнаёт), но без заголовка `## ЧЧ:ММ`: в days/*.md нет
 * обменов по времени, есть только план, и посторонний заголовок среди слотов
 * читался бы чужеродно.
 */
function appendDayReviewMark(text, mark) {
  return appendBlock(text, reviewMarkLine(mark));
}

/**
 * Что читать перед этой планёркой.
 *
 * Дни без несверенного хвоста в ответ не попадают вовсе: показывать «за 30
 * июля всё сверено» семь раз подряд значит превратить блок в фон. Отдельным
 * случаем — сегодняшней стенограммы нет: сверять не с чем, и это не тишина, а
 * находка.
 */
function dayReviewStatus(entries, { date, candidates = null, dayEntries = [] } = {}) {
  const days = (entries || []).map(({ date: day, file }) => dayReviewDay(file, day));
  const today = days.find((day) => day.date === date) || dayReviewDay(null, date);
  const unreviewed = days
    .filter((day) => day.unreviewed)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const dayReasons = [];
  for (const { date: day, file } of dayEntries || []) {
    const tail = transcriptTail((file && file.text) || '');
    for (const text of dayFileReasons(tail.text)) dayReasons.push({ date: day, path: `days/${day}.md`, text });
  }
  return {
    date,
    path: today.path,
    window_days: REVIEW_WINDOW_DAYS,
    today_missing: !today.exists,
    days: unreviewed,
    day_reasons: dayReasons,
    candidates: candidates || emptyReviewCandidates(),
    needed: unreviewed.length > 0 || !today.exists || dayReasons.length > 0,
  };
}

/** Строка про один день хвоста: откуда читать и сколько там. */
function reviewDayLine(day) {
  const size = [
    `обменов ${day.sections}`,
    `строк ${day.lines}`,
    day.last_entry ? `последняя запись ${day.last_entry}` : null,
  ].filter(Boolean).join(', ');
  const from = day.last_mark
    ? `после отметки ${day.last_mark.date} ${day.last_mark.time}`
    : 'отметок нет — файл целиком';
  return `${day.path} — ${from} (${size})`;
}

/**
 * Блок «Ревизия» — или null, когда несверенного хвоста нет нигде.
 *
 * Кандидаты идут последними и названы кандидатами: код не знает, завели это
 * или нет, он знает только, что похожего в задачнике не нашлось. Поставить их
 * выше требования прочитать хвост значит получить ревизию по списку из четырёх
 * строк — а теряется как раз то, что в список не попало.
 */
function dayReviewBlock(status) {
  if (!status || !status.needed) return null;
  const parts = [];
  if (status.days.length) {
    parts.push(`Ревизия — до повестки. Несверенные хвосты стенограмм за ${status.window_days} дней:\n${
      status.days.map((day) => `- ${reviewDayLine(day)}`).join('\n')}\nПрочитай их через tasks_read`
      + ' — только хвост, выше последней отметки уже сверено — и сверь с задачником.'
      + ' Ищи потерянное: принятое решение, которого нигде нет; договорённость с человеком без задачи,'
      + ' слота или напоминания; дело, о котором договорились, а задачи нет; названные число, срок или цену;'
      + ' вопрос, оставшийся без ответа и не помеченный «открыто:». Найденное заводи сразу — задачей,'
      + ' напоминанием, идеей или пунктом планёрки. Пересказывать стенограмму не надо: он в этом разговоре был.');
  } else if (status.today_missing) {
    parts.push(`Ревизия — до повестки: стенограммы за сегодня нет вовсе (${status.path} пуст).`
      + ' Разговор за день не записан, сверять не с чем — и это само по себе потеря: всё, что сегодня обсудили'
      + ' и не завели, восстановить уже неоткуда. Скажи ему об этом и начни писать стенограмму с ближайшего обмена.');
  }
  // Причины из «Закрыть день» — решено 05.08: та же ревизия, отдельная
  // категория, каждую планёрку, а не раз в неделю (иначе теряют актуальность).
  // Это не гадание кандидатов ниже — прямая цитата его слов, назначенная
  // задаче или другой сущности здесь и сейчас.
  if (status.day_reasons && status.day_reasons.length) {
    parts.push(`Причины из закрытых дней (${status.day_reasons.length}), ещё не сверенные с задачником —`
      + ' его слова из «Закрыть день», не гадание: у каждой актуализируй или заведи то, к чему она относится'
      + ' (задачу, факт, решение), прямо сейчас, а не откладывай:\n'
      + status.day_reasons.map((r) => `- ${r.date}: ${r.text}`).join('\n'));
  }
  parts.push('Закончил — tasks_standup с reviewed и коротким итогом: отметка ляжет в конец каждого прочитанного файла,'
    + ' и на следующей планёрке ты увидишь только то, что появилось после неё.');
  const body = parts.join('\n\n');
  const hints = reviewCandidateLines(status.candidates);
  return hints ? `${body}\n\n${hints}` : body;
}

// ── Кандидаты на потерю ──────────────────────────────────────────────────
//
// Ревизия целиком держалась на внимании: код приносил текст, сравнивал человек.
// Прочитал по диагонали — ревизия превратилась в ритуал, и поймать это некому.
//
// Поэтому код сам вытаскивает из хвоста то, чему не нашлось пары в задачнике:
// имена, суммы, время и вопросы. Это КАНДИДАТЫ, а не находки. Код не знает,
// была ли названная сумма тратой или ценой из разведки рынка, и знать не может.
// Формулировка обязана оставлять место ошибке: «названа сумма, в деньгах её
// нет — проверь», а не «потеряна трата».
//
// Ложное срабатывание тут дешевле пропуска, но врать нельзя ни в ту, ни в
// другую сторону. Совпадения ищутся простыми средствами: нормализованное
// вхождение по началу слова, без стемминга и словарей.

const REVIEW_CANDIDATE_CAP = 5;

/** Пусто по всем четырём видам — чтобы форма ответа не зависела от находок. */
function emptyReviewCandidates() {
  return {
    people: [], money: [], time: [], questions: [],
    dropped: { people: 0, money: 0, time: 0, questions: 0 },
    total: 0,
  };
}

/**
 * Текст хвоста без разметки: заголовки, отметки и подписи говорящего убраны.
 *
 * Подписи убираются первыми: «**Кин:**» в начале строки — это разметка, а имя
 * в ней стоит в каждом втором абзаце и в кандидаты не годится вовсе.
 */
function reviewProse(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line) && !REVIEW_MARK_RE.test(line.trim()))
    .map((line) => line
      .replace(/^\s*(?:[-*]\s+)?\*\*[^*]{1,40}:\*\*\s*/, '')
      .replace(/^\s*(?:[-*]\s+)?[A-Za-zА-ЯЁа-яё][\p{L}]{1,20}:\s+/u, ''))
    .join('\n');
}

/** Все слова задачника одним множеством — по ним и проверяется «нашлось». */
function reviewWordSet(files) {
  const words = new Set();
  for (const file of files || []) {
    for (const word of String((file && file.text) || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (word) words.add(word);
    }
  }
  return words;
}

/**
 * Нашлось ли слово в задачнике. Сравнение по началу слова и без последних двух
 * букв: «Маше», «Машей» и «Маша» — один человек, а полноценной лемматизации
 * тут не нужно. Границы слова заданы разбиением по не-буквам: `\b` в JS считает
 * буквой только ASCII и на кириллице срабатывает где попало.
 */
function reviewWordSeen(words, value) {
  const lower = String(value || '').toLowerCase();
  if (!lower) return true;
  const stem = lower.slice(0, Math.max(3, lower.length - 2));
  for (const word of words) if (word.startsWith(stem)) return true;
  return false;
}

const REVIEW_NAME_RE = /[А-ЯЁ][а-яё]{2,}/g;
// Разделитель тысяч — только пробел и неразрывный: пустить сюда `\s` значит
// склеить «5 задач» с «300 руб» через перевод строки в одну сумму 5300.
const REVIEW_MONEY_RE = /(\d[\d  ]*(?:[.,]\d+)?)[  ]*(₽|руб[а-яё]*|тыс[а-яё]*|млн|млрд|k|к)(?![а-яё])/gi;
const REVIEW_DATE_RE = /(?<![\d.,:])(\d{1,2})\.(\d{1,2})(?![\d.])/g;
const REVIEW_TIME_RE = /(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g;
const REVIEW_WEEKDAY_RE = /(?<![а-яё])(понедельник|вторник|сред[уые]|четверг|пятниц[уые]|суббот[уые]|воскресень[еяю])(?![а-яё])/gi;
// Нумерация та же, что у weekdayIndex: понедельник нулевой, воскресенье шестое.
const REVIEW_WEEKDAYS = [
  ['понедельник', 0], ['вторник', 1], ['сред', 2], ['четверг', 3],
  ['пятниц', 4], ['суббот', 5], ['воскресень', 6],
];
const REVIEW_MONEY_SCALE = [
  [/^тыс/i, 1000], [/^k$/i, 1000], [/^к$/i, 1000], [/^млн/i, 1e6], [/^млрд/i, 1e9],
];
/** Мельче сотни рублей — это не потеря, а шум: «пять рублей» в разговоре. */
const REVIEW_MONEY_MIN = 100;

/** Сумма из «45 700 ₽» и «340 тысяч» — в рублях. */
function reviewAmount(digits, unit) {
  const clean = String(digits).replace(/[\s ]/g, '').replace(',', '.');
  const value = Number(clean);
  if (!Number.isFinite(value) || value <= 0) return null;
  const scale = (REVIEW_MONEY_SCALE.find(([re]) => re.test(unit)) || [null, 1])[1];
  return Math.round(value * scale);
}

/** Ближайшая дата названного дня недели, считая от сегодня вперёд. */
function reviewWeekdayDate(word, today) {
  if (!today) return null;
  const lower = String(word).toLowerCase();
  const found = REVIEW_WEEKDAYS.find(([stem]) => lower.startsWith(stem));
  if (!found) return null;
  const shift = (found[1] - weekdayIndex(today) + 7) % 7 || 7;
  return shiftDate(today, shift);
}

/**
 * Кандидаты на потерю по всем хвостам окна.
 *
 * @param {Array} tails  [{ date, text }] — только несверенное
 * @param {Object} ctx   files — проекты, дни и напоминания; money — { 'ГГГГ-ММ': текст };
 *                       openQuestions — collectOpenQuestions по проектам
 */
function reviewCandidates(tails, {
  files = [], money = {}, openQuestions = [], today = null, cap = REVIEW_CANDIDATE_CAP,
} = {}) {
  const out = emptyReviewCandidates();
  const prose = (tails || []).map((tail) => reviewProse(tail.text)).join('\n');
  if (!prose.trim()) return out;

  const words = reviewWordSet(files);
  const amounts = new Set();
  for (const [month, text] of Object.entries(money || {})) {
    for (const op of parseMoneyOps(text, month)) amounts.add(Math.abs(op.amount));
  }
  const slotSpans = [];
  const slotTimes = new Set();
  const slotDates = new Set();
  for (const file of files || []) {
    const day = /^days\/(\d{4}-\d{2}-\d{2})\.md$/i.exec(file.path || '');
    if (!day) continue;
    const slots = parseSlots(file.text || '');
    if (slots.length) slotDates.add(day[1]);
    for (const slot of slots) {
      slotTimes.add(padTime(slot.start));
      slotSpans.push([slot.from, slot.to]);
    }
  }
  // Час считается покрытым и тогда, когда он попал ВНУТРЬ уже стоящего слота:
  // «сняли портрет с 16:50 до 18:10» при слоте 16:50–18:10 — это не потеря, а
  // пересказ расписания. Сравнение по одному только началу давало их пачками.
  const slotCovers = (value) => {
    const minutes = timeToMinutes(value);
    if (minutes === null) return false;
    const shifted = minutes < DAY_TAIL_BEFORE ? minutes + 24 * 60 : minutes;
    return slotSpans.some(([from, to]) => shifted >= from && shifted <= to);
  };
  const reminders = (files || []).find((file) => file.path === REMINDERS_PATH) || null;
  for (const reminder of parseReminders(reminders)) {
    if (reminder.done) continue;
    slotDates.add(reminder.date);
    if (reminder.time) slotTimes.add(reminder.time);
  }

  const seen = new Set();
  const push = (kind, item, dedup = null) => {
    const key = `${kind}|${(dedup || item.quote).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (out[kind].length >= cap) { out.dropped[kind] += 1; return; }
    out[kind].push(item);
  };

  // 1. Люди. Заглавная в начале предложения стоит по грамматике, а не по имени.
  // Второе сито — сам же хвост: «Чай», «Пуш», «Вот» с большой буквы попадаются
  // в любом разговоре, но то же слово там же встречается и со строчной, а имя
  // человека — почти никогда. Словаря для этого не нужно, только сам текст.
  const lowered = new Set(prose.split(/[^\p{L}\p{N}]+/u).filter((w) => w && /^\p{Ll}/u.test(w)));
  for (const line of prose.split('\n')) {
    for (const match of line.matchAll(REVIEW_NAME_RE)) {
      const before = line.slice(0, match.index).replace(/[\s*_>«"([]+$/, '');
      if (!before || /[.?!:;—–…]$/.test(before)) continue;
      if (lowered.has(match[0].toLowerCase())) continue;
      if (reviewWordSeen(words, match[0])) continue;
      // Дубль снимается по началу слова, а не по написанию: «Суперленд» и
      // «Суперленде» — одно, и две строки об одном занимают половину потолка.
      // Четыре буквы, а не «минус два с конца»: у разных падежей длина разная,
      // и отрезание с конца разводило бы их обратно по разным ключам.
      push('people', {
        quote: match[0],
        what: 'ни в одной открытой задаче, ни в напоминаниях, ни в слотах его нет — проверь, завели ли договорённость',
      }, match[0].toLowerCase().slice(0, 4));
    }
  }

  // 2. Деньги. Названная сумма — ещё не трата: это может быть цена из разведки.
  for (const match of prose.matchAll(REVIEW_MONEY_RE)) {
    const amount = reviewAmount(match[1], match[2]);
    if (amount === null || amount < REVIEW_MONEY_MIN || amounts.has(amount)) continue;
    push('money', {
      quote: match[0].trim(),
      amount,
      what: `в деньгах за этот период суммы ${amount} нет — проверь, была ли это операция или просто названная цена`,
    });
  }

  // 3. Время. Названный час без слота и без напоминания живёт только в разговоре.
  for (const match of prose.matchAll(REVIEW_DATE_RE)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) continue;
    const year = String(today || '').slice(0, 4) || null;
    const iso = year ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
    if (iso && slotDates.has(iso)) continue;
    push('time', { quote: match[0], date: iso, what: `на ${iso || match[0]} нет ни слота в днях, ни напоминания — проверь, поставлено ли` });
  }
  for (const match of prose.matchAll(REVIEW_TIME_RE)) {
    const hour = Number(match[1]);
    if (hour > 23 || Number(match[2]) > 59) continue;
    const time = padTime(`${match[1]}:${match[2]}`);
    if (slotTimes.has(time) || slotCovers(time)) continue;
    push('time', { quote: match[0], time, what: `на ${time} нет ни слота в ближайших днях, ни напоминания — проверь, поставлено ли` });
  }
  for (const match of prose.matchAll(REVIEW_WEEKDAY_RE)) {
    const iso = reviewWeekdayDate(match[1], today);
    if (!iso || slotDates.has(iso)) continue;
    push('time', { quote: match[0], date: iso, what: `ближайший такой день — ${iso}, слотов и напоминаний на него нет — проверь` });
  }

  // 4. Вопросы. Заданный вслух вопрос без строки «открыто:» назавтра исчезает.
  //
  // Границей предложения считается и закрывающая кавычка: разговор наполовину
  // состоит из цитат, и без этого два вопроса подряд слипались в один, который
  // уже ни на что не похож. Открывающие кавычки и тире с начала срезаются.
  for (const raw of prose.split(/(?<=[.!?»)\]])\s+/)) {
    const sentence = raw.trim().replace(/\s+/g, ' ')
      // «Его слова: «А почему…» — подпись перед цитатой, а не часть вопроса.
      // Срезается только вплотную к открывающей кавычке: без неё под правило
      // попал бы и живой вопрос, начинающийся с уточнения через двоеточие.
      .replace(/^[^«»?]{0,25}:\s*«/, '')
      .replace(/^[«"'\-—–\s]+/, '')
      .replace(/[»"']+$/, '');
    if (!/\?$/.test(sentence)) continue;
    const size = [...sentence].length;
    if (size < 12 || size > 200) continue;
    if (openQuestions.some((q) => questionSimilarity(q.question, sentence) >= DECISION_SIMILARITY)) continue;
    push('questions', { quote: sentence, what: 'похожей строки «открыто:» на доске нет — проверь, помечен ли вопрос открытым' });
  }

  out.total = out.people.length + out.money.length + out.time.length + out.questions.length;
  return out;
}

/** Кандидаты словами — или null, когда их нет: пустой раздел не показываем. */
function reviewCandidateLines(candidates) {
  if (!candidates || !candidates.total) return null;
  // Показываем только те признаки, что попадают. Замер на живых стенограммах
  // 1–3 августа: деньги 1 из 1, вопросы ~2/3 по делу, а люди 0 из 6 и время
  // 0 из 5 — там имена продуктов и таймстампы логов. Подсказка, где всё ложное,
  // не помогает, а приучает пролистывать блок мимо глаз. Признаки считаются
  // по-прежнему (видно в structured), но в текст не идут, пока не научатся.
  const kinds = [['money', 'деньги'], ['questions', 'вопросы']];
  const lines = [];
  for (const [kind, title] of kinds) {
    for (const item of candidates[kind]) lines.push(`- ${title}: «${item.quote}» — ${item.what}`);
  }
  const dropped = Object.values(candidates.dropped).reduce((n, x) => n + x, 0);
  return 'Кандидаты на потерю — подсказка кода, а не результат сверки: он видит только, что похожего в задачнике'
    + ' не нашлось, и не знает, завели это или нет. Хвост всё равно читать целиком, кандидаты страхуют от'
    + ` невнимательности.\n${lines.join('\n')}${dropped ? `\n(и ещё ${dropped} — не показываю, список должен читаться)` : ''}`;
}

// ── Эксперимент «два ответа» ─────────────────────────────────────────────
//
// Недельная проверка (решение пользователя 2026-08-03): на содержательный
// вопрос агент даёт два ответа — процедурный и свободный, — а пользователь
// выбирает. Голоса копятся здесь, обычным файлом задачника: статистика,
// которую нельзя прочитать глазами, не статистика.

const VOTES_PATH = 'docs/experiment-two-answers.md';
const VOTES_SECTION = '## Голоса';

/** Во что превратился голос: процедурный / свободный / ничья. */
function voteWinner(choice, procedural) {
  const c = String(choice).trim();
  if (c === 'ничья') return 'ничья';
  return c === String(procedural).trim() ? 'процедурный' : 'свободный';
}

function voteLine({ date, winner, question, note }) {
  return `- ${date} · ${winner} · ${question}${note ? ` — ${note}` : ''}`;
}

function parseVotes(file) {
  const counts = { 'процедурный': 0, 'свободный': 0, 'ничья': 0 };
  const votes = [];
  for (const raw of String((file && file.text) || '').split('\n')) {
    const match = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*(процедурный|свободный|ничья)\s*·\s*(.+)$/.exec(raw.trim());
    if (!match) continue;
    counts[match[2]] += 1;
    votes.push({ date: match[1], winner: match[2], question: match[3] });
  }
  return { counts, votes, total: votes.length };
}

// ── Деньги ───────────────────────────────────────────────────────────────
//
// Формат строки задан в money/README.md и читается доской:
//   - ДД -СУММА категория ~контур · счёт · комментарий
// День — две цифры, месяц берётся из имени файла. Второго формата тут быть не
// может: доска разбирает строки одним выражением, и всё, что в него не попало,
// молча выпадает из всех подсчётов — операция вроде записана, а её нигде нет.

const MONEY_OP_RE = /^-\s+(\d{1,2})\s+([+-]\d+(?:\.\d+)?)\s+([^\s~·]+)\s*(?:~(\S+))?\s*(?:·\s*(.*))?$/;
const MONEY_BALANCE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*·\s*остаток\s+([\d.]+)/;

function moneyLine({ date, amount, income = false, category, contour, account = null, comment = null }) {
  const day = String(date).slice(8, 10);
  const sum = `${income ? '+' : '-'}${Math.abs(Number(amount))}`;
  const tail = [account, comment].filter(Boolean).join(' · ');
  return `- ${day} ${sum} ${category} ~${contour}${tail ? ` · ${tail}` : ''}`;
}

function parseMoneyOps(text, month) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const match = MONEY_OP_RE.exec(raw.trim());
    if (!match) continue;
    out.push({
      date: `${month}-${match[1].padStart(2, '0')}`,
      amount: Number(match[2]),
      category: match[3],
      contour: match[4] || null,
    });
  }
  return out;
}

/** Последний известный остаток на счетах — из того же файла месяца. */
function lastBalance(text) {
  let found = null;
  for (const raw of String(text || '').split('\n')) {
    const match = MONEY_BALANCE_RE.exec(raw.trim());
    if (match) found = { date: match[1], amount: Number(match[2]) };
  }
  return found;
}

/**
 * Внесены ли деньги за день. Признак ровно один и очень узкий: есть ли в файле
 * месяца хоть одна операция с этой датой.
 *
 * Это НЕ «были ли траты». Про траты знает Zenmoney и он сам, а задачник знает
 * только то, что в нём записано, — из пустого дня следует «не внесено», и
 * ничего больше. Разница не косметическая: «ты не внёс расходы» и «трат не
 * было» — разные утверждения, и второе выдумывать нельзя.
 *
 * Считается по завершённому дню — по вчерашнему. Пока день идёт, отсутствие
 * операций не значит вообще ничего: трата случится через час. Решение
 * владельца от 2026-08-03: спрашивать утром, на планёрке, за вчера, когда
 * деньги дня уже закрыты целиком.
 */
function moneyDayStatus(text, date) {
  const month = String(date).slice(0, 7);
  const ops = parseMoneyOps(text, month).filter((op) => op.date === date);
  return { date, month, path: `money/${month}.md`, operations: ops.length, empty: ops.length === 0 };
}

/**
 * Одна строка приписки — или null, когда за день уже что-то записано.
 *
 * Null здесь так же важен, как строка: напоминание, которое приходит каждое
 * утро независимо от того, сделал он это или нет, перестают читать за неделю.
 */
function moneyDayReminder(status) {
  if (!status || !status.empty) return null;
  return `Деньги за ${status.date} не сведены: в ${status.path} за этот день нет ни одной операции. `
    + 'Спроси, какие были расходы и доходы, и внеси их через tasks_money. '
    + 'Пустой день значит «не внесено», а не «трат не было» — так и спрашивай, а не утверждай.';
}

/**
 * Картина месяца после записи. Смысл тот же, что у day_after в дневниках: не
 * «записал», а «вот что теперь». Без этого каждая трата обсуждается вслепую.
 *
 * Оценок и советов тут нет намеренно: лимиты в budget.md на август стоят «?»
 * по его же решению — не выдумывать нормы до первого честного месяца.
 */
function monthAfter(text, { month, today = null, contour = null, recurring = null } = {}) {
  const ops = parseMoneyOps(text, month);
  const spent = ops.filter((o) => o.amount < 0).reduce((n, o) => n + Math.abs(o.amount), 0);
  const income = ops.filter((o) => o.amount > 0).reduce((n, o) => n + o.amount, 0);
  const byContour = {};
  for (const op of ops) {
    if (op.amount >= 0) continue;
    const key = op.contour || '_';
    byContour[key] = (byContour[key] || 0) + Math.abs(op.amount);
  }
  const todaySpent = today
    ? ops.filter((o) => o.date === today && o.amount < 0).reduce((n, o) => n + Math.abs(o.amount), 0)
    : null;

  // Что ещё спишется само до конца месяца: строки recurring, чей день позже
  // сегодняшнего. Это прогноз, а не обязательство, — так и подписано в файле.
  let ahead = null;
  if (recurring && today) {
    const day = Number(today.slice(8, 10));
    ahead = parseMoneyOps(recurring, month)
      .filter((o) => o.amount < 0 && Number(o.date.slice(8, 10)) > day)
      .reduce((n, o) => n + Math.abs(o.amount), 0);
  }

  return {
    month,
    spent: Math.round(spent * 100) / 100,
    income: Math.round(income * 100) / 100,
    today_spent: todaySpent === null ? null : Math.round(todaySpent * 100) / 100,
    contour: contour ? { key: contour, spent: Math.round((byContour[contour] || 0) * 100) / 100 } : null,
    by_contour: byContour,
    balance: lastBalance(text),
    recurring_ahead: ahead,
    operations: ops.length,
  };
}

/**
 * Лимиты из `money/budget.md`. `?` и пустое значение — это НЕ ноль и не
 * «неизвестно потом посчитаем»: в файле прямо написано, что месяц идёт без
 * лимитов по его решению. Поэтому здесь `null`, и всё, что считает отклонение,
 * обязано этот `null` увидеть и промолчать, а не подставить своё число.
 */
function parseBudget(text) {
  const limits = {};
  const cushion = { goal: null, monthly: null, deadline: null };
  let section = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('##')) {
      const head = line.replace(/^#+\s*/, '').toLowerCase();
      section = head.includes('подушк') ? 'cushion' : (head.includes('лимит') ? 'limits' : null);
      continue;
    }
    const match = /^-\s*([^|]+?)\s*\|\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const rawValue = match[2].trim();
    const number = /^-?\d+(?:\.\d+)?$/.test(rawValue) ? Number(rawValue) : null;
    if (section === 'cushion') {
      if (key.startsWith('цел')) cushion.goal = number;
      else if (key.includes('месяц')) cushion.monthly = number;
      else if (key.startsWith('срок')) cushion.deadline = rawValue && rawValue !== '?' ? rawValue : null;
      continue;
    }
    if (section === 'limits') limits[key] = number;
  }
  return { limits, cushion };
}

/**
 * Картина денег месяца — то, чего не хватало, чтобы вообще что-то сказать про
 * «хватит ли на поездку». Оценок тут по-прежнему нет: они появляются только
 * там, где есть лимит-число. Где лимита нет, где нет доходов — так и написано,
 * потому что молчаливая подстановка нуля здесь врёт сильнее пустоты.
 */
function budgetPicture({
  month, text, budget = null, recurring = null, today = null, contour = null, months = [],
} = {}) {
  const base = monthAfter(text, { month, today, contour, recurring });
  const parsed = parseBudget(budget);
  const ops = parseMoneyOps(text, month);

  const net = (key) => ops
    .filter((o) => o.contour === key)
    .reduce((n, o) => n + (o.amount < 0 ? Math.abs(o.amount) : -o.amount), 0);
  const cushionMonth = Math.round(net('cushion') * 100) / 100;
  const travelMonth = Math.round(net('travel') * 100) / 100;
  const debtMonth = Math.round((base.by_contour.debt || 0) * 100) / 100;
  // Для разбивки расходов нужна расходная сторона подушки, а не итог месяца:
  // снятие из подушки итог уменьшает, но потреблением от этого не становится —
  // иначе «потребление» распухало бы ровно на снятую сумму.
  const cushionSpent = Math.round((base.by_contour.cushion || 0) * 100) / 100;

  // Подушка копится не месяцем: складываем взносы по всем месяцам, которые
  // вообще есть в задачнике. Если месяц один — так и будет один.
  const cushionTotal = Math.round(months
    .reduce((n, m) => n + parseMoneyOps(m.text, m.month)
      .filter((o) => o.contour === 'cushion')
      .reduce((s, o) => s + (o.amount < 0 ? Math.abs(o.amount) : -o.amount), 0), 0) * 100) / 100;

  const keys = [...new Set([...Object.keys(parsed.limits), ...Object.keys(base.by_contour)])]
    .filter((k) => k !== '_')
    .sort();
  const limits = keys.map((key) => {
    const spent = Math.round((base.by_contour[key] || 0) * 100) / 100;
    const limit = Object.prototype.hasOwnProperty.call(parsed.limits, key) ? parsed.limits[key] : null;
    return limit === null
      ? { contour: key, spent, limit: null, over: null, measurable: false }
      : { contour: key, spent, limit, over: Math.round((spent - limit) * 100) / 100, measurable: true };
  });
  const unmeasured = limits.filter((l) => !l.measurable).map((l) => l.contour);

  return {
    ...base,
    // «Взнос в подушку» и «погашение кредита» — не потребление; свести их в одну
    // строку расходов значит каждый месяц пугать человека собственными
    // сбережениями. Разводим явно, но исходный `spent` не трогаем.
    split: {
      consumption: Math.round((base.spent - cushionSpent - debtMonth) * 100) / 100,
      debt: debtMonth,
      cushion: cushionSpent,
    },
    limits,
    unmeasured,
    // Доходы за месяц не записаны — вывод односторонний. Это его решение, а не
    // дыра в данных: так и записано в money/2026-08.md, раздел «Открыто».
    income_present: base.income > 0,
    one_sided: base.income <= 0,
    cushion: {
      month: cushionMonth,
      total: cushionTotal,
      goal: parsed.cushion.goal,
      monthly: parsed.cushion.monthly,
      deadline: parsed.cushion.deadline,
    },
    travel: { month: travelMonth },
  };
}

// ── Как он решает ────────────────────────────────────────────────────────
//
// Дообучить модель на этом задачнике нельзя: такого в API нет, да и данных на
// два порядка мало. То, что человек называет «обучением на моём контексте»,
// получается иначе — накоплением его решений в одном коротком месте, которое
// читается всегда. Это обычный markdown в задачнике, а не скрытое состояние:
// он должен уметь прочитать это глазами и вычеркнуть неверное.
//
// Записывается только подтверждённое: его слова, его выбор. Догадка агента
// про то, «как он, наверное, любит», — это ровно тот мусор, из-за которого
// такую память перестают читать.

const PREFS_PATH = 'docs/preferences.md';
const PREFS_SECTION = '## Как он решает';
const PREFS_SOFT_LIMIT = 60;

/**
 * Виды памяти и их права.
 *
 * Первые три и «факт» — с его слов, и трогать их без него нельзя.
 * «Наблюдение» заведено отдельно именно ради разницы в правах: это то, что
 * агент вывел из данных сам. Свой вывод можно уточнить, когда он подтвердился
 * ещё раз; его решение переписать выводом нельзя никогда, и держится это не на
 * добросовестности модели, а на отказе инструмента.
 *
 * «Факт» — это устройство его мира, а не способ решать: марка машины, площадь
 * склада, две Маши — один человек или разные. Такое спрашивали по четыре раза
 * за день, потому что записывать было некуда: предпочтение и порог про другое,
 * а ответ в разговоре не оседает нигде. Права у факта его же, владельческие:
 * «вижу по журналу, что машина другая» — это догадка, и переписывать ею
 * названное им нельзя ровно так же, как его порог.
 */
const PREFS_KINDS = ['предпочтение', 'порог', 'решение', 'наблюдение', 'факт'];
const PREFS_OWNER_KINDS = ['предпочтение', 'порог', 'решение', 'факт'];

/** Сколько дней записи хватает, чтобы спрашивать «а это ещё нужно». */
const PREFS_STALE_DAYS = 30;

/**
 * Факту тот же срок не годится. «Площадь склада — 200 м²» может не всплывать
 * полгода и мусором от этого не станет: у факта нет причины пригождаться
 * каждый месяц. Но и молчать про него нельзя — устаревший факт хуже
 * отсутствующего: отсутствующий спросят, а устаревшим ответят уверенно.
 * Поэтому срок длиннее и считается иначе (см. stalePreferences).
 */
const PREFS_FACT_STALE_DAYS = 180;

/** Вложенные строки записи: заданный вопрос, два счётчика и отметка устаревания. */
/**
 * Дочерние строки записи памяти. «зовётся» — слова, которыми он называет то же
 * самое: «тачка» вместо «машина», «зал» вместо «студия». Без них факт поднимается
 * только на дословном совпадении, и «сколько ехать до зала» не найдёт запись про
 * студию — а неподнявшийся факт неотличим от отсутствующего.
 */
const PREFS_CHILD_RE = /^(вопрос|подтверждено|пригодилось|устарело|зовётся|зовется):\s*(.*)$/i;

/** Синонимы одной строкой: «тачка, авто» — по любому из них факт поднимется. */
function parseAliases(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCounterChild(value) {
  const count = /^(\d+)/.exec(String(value || '').trim());
  const date = /(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return { count: count ? Number(count[1]) : 0, date: date ? date[1] : null };
}

function counterChild(field, { count, date }) {
  return `${field}: ${count}${date ? `, последний раз ${date}` : ''}`;
}

/**
 * Отметка «это больше не так»: дата и чем заменено.
 *
 * Строкой, а не удалением, и по той же причине, по которой удаления памяти нет
 * вовсе: он должен видеть глазами, что было записано раньше и когда это
 * перестало быть правдой. Продал машину — старая марка остаётся в файле с
 * датой, а не исчезает, будто её никогда и не говорили.
 */
function staleChild({ date, replacedBy = null }) {
  return `устарело: ${date}${replacedBy ? `, заменено на «${replacedBy}»` : ''}`;
}

function parseStaleChild(value) {
  const raw = String(value || '').trim();
  const date = /(\d{4}-\d{2}-\d{2})/.exec(raw);
  const replaced = /«([^»]+)»/.exec(raw);
  return { date: date ? date[1] : null, replaced_by: replaced ? replaced[1] : null };
}

/**
 * Строки памяти предпочтений: дата, вид, сама формулировка, откуда известно.
 *
 * Под записью могут лежать вложенные строки — заданный вопрос и счётчики. Они
 * не отдельная запись, а её продолжение, поэтому разбираются вместе с ней:
 * запись без них — обычная старая строка, и читается она ровно как раньше.
 */
function parsePreferences(file) {
  const out = [];
  const lines = String((file && file.text) || '').split('\n');
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (/^\s/.test(raw)) {
      if (!current) continue;
      const child = PREFS_CHILD_RE.exec(raw.trim().replace(/^[-*]\s+/, ''));
      if (!child) continue;
      const field = child[1].toLowerCase();
      if (field === 'вопрос') current.question = child[2].trim();
      else if (field === 'зовётся' || field === 'зовется') current.aliases = parseAliases(child[2]);
      else if (field === 'устарело') current.stale = parseStaleChild(child[2]);
      else current[field === 'подтверждено' ? 'confirmed' : 'used'] = parseCounterChild(child[2]);
      continue;
    }
    const match = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*([^·]+?)\s*·\s*(.+)$/.exec(raw.trim());
    if (!match) { current = null; continue; }
    const body = match[3];
    const split = body.lastIndexOf(' — ');
    current = {
      line: i,
      date: match[1],
      kind: match[2].trim(),
      note: (split === -1 ? body : body.slice(0, split)).trim(),
      evidence: split === -1 ? null : body.slice(split + 3).trim(),
      question: null,
      confirmed: { count: 0, date: null },
      used: { count: 0, date: null },
      aliases: [],
      stale: null,
    };
    out.push(current);
  }
  return out;
}

/**
 * Уже записано ли то же самое. Дословного совпадения мало: одна и та же мысль
 * записывается разными словами, и память быстро зарастает повторами.
 *
 * Вопрос сравнивается наравне с ответом, и это не удвоение проверки. Ответы на
 * один и тот же вопрос формулируются как угодно («уборка — три часа», «на
 * уборку закладываем 180 минут»), а сам вопрос человек и модель задают
 * похожими словами почти всегда. Повтор ловится по той оси, по которой он
 * действительно повторяется.
 *
 * Помеченное устаревшим из сравнения не выкидывается, а только уступает
 * живому при равном совпадении. Выкинуть было бы хуже: старое значение факта
 * тогда записалось бы заново как новое, и в памяти оказались бы две живые
 * записи, отвечающие на один вопрос по-разному.
 */
function knownPreference(existing, note, { threshold = DECISION_SIMILARITY, question = null } = {}) {
  let best = null;
  const consider = (entry, score, by) => {
    if (score < threshold) return;
    if (best && (best.score > score || (best.score === score && !best.stale))) return;
    best = { ...entry, score: Math.round(score * 100) / 100, matched_by: by };
  };
  for (const entry of existing) {
    if (note) consider(entry, questionSimilarity(note, entry.note), 'формулировка');
    if (question) {
      if (entry.question) consider(entry, questionSimilarity(question, entry.question), 'вопрос');
      consider(entry, questionSimilarity(question, entry.note), 'вопрос');
      // Точный алиас («мне», «тачка») — иначе стоп-слово/короткий вопрос
      // даёт «в памяти ничего нет», хотя запись лежит с зовётся:.
      const q = String(question).trim().toLowerCase();
      const qCanon = addressAliasCanon(q);
      for (const alias of entry.aliases || []) {
        const a = String(alias).trim().toLowerCase();
        if (a === q || addressAliasCanon(a) === q || a === qCanon || addressAliasForms(a).includes(q)) {
          consider(entry, 1, 'алиас');
        }
      }
      // «жена» в note в кавычках — hit даже без зовётся:.
      if (ADDRESS_ALIAS_CANON_BY_FORM.has(q) || ADDRESS_ALIAS_FORMS[qCanon]) {
        const noteLower = String(entry.note || '').toLowerCase();
        if (addressAliasForms(q).some((f) => noteLower.includes(`«${f}»`) || noteLower.includes(`"${f}"`))) {
          consider(entry, 1, 'алиас');
        }
      }
    }
  }
  return best;
}

const CLIENT_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Падежи/формы адресных алиасов. Канон = ключ (то, что пишут в client=).
 * Smoke3 07.08: модель искала «жена», карта знала только «жене».
 *
 * В topic-детект не входят слишком частые формы («меня», «себя») — иначе
 * «какая у меня машина» ломает обычный tasks_context.
 */
const ADDRESS_ALIAS_FORMS = Object.freeze({
  мне: Object.freeze(['мне', 'меня', 'мной', 'мною']),
  себе: Object.freeze(['себе', 'себя', 'собой']),
  жене: Object.freeze(['жене', 'жена', 'жены', 'жену', 'женой']),
  цыпе: Object.freeze(['цыпе', 'цыпа', 'цыпы', 'цыпу']),
});

/** Формы, безопасные для ловли в topic (без «у меня / себя»). */
const ADDRESS_ALIAS_TOPIC_FORMS = Object.freeze([
  'мне', 'себе',
  'жене', 'жена', 'жены', 'жену', 'женой',
  'цыпе', 'цыпа', 'цыпы', 'цыпу',
]);

const ADDRESS_ALIAS_CANON_BY_FORM = (() => {
  const map = new Map();
  for (const [canon, forms] of Object.entries(ADDRESS_ALIAS_FORMS)) {
    for (const form of forms) map.set(form, canon);
  }
  return map;
})();

/** Канон группы («жена» → «жене») или lowercased исходник, если группа неизвестна. */
function addressAliasCanon(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  return ADDRESS_ALIAS_CANON_BY_FORM.get(key) || key;
}

/** Все формы группы для алиаса; неизвестный — сам себя. */
function addressAliasForms(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return [];
  const canon = ADDRESS_ALIAS_CANON_BY_FORM.get(key) || key;
  const forms = ADDRESS_ALIAS_FORMS[canon];
  return forms ? [...forms] : [canon];
}

function allHardcodedAddressAliasForms() {
  return [...ADDRESS_ALIAS_TOPIC_FORMS];
}

/**
 * Алиасы адресации дневника из памяти («мне» → Полтавский).
 *
 * Нужны, потому что «мне»/«себе» — TOPIC_STOP_WORDS: на «запиши мне 300 г»
 * tasks_context не поднимает предпочтение в text, и модель уходит в
 * list_clients + grep. Карта даёт resolveTarget и list_clients прямой ответ.
 */
function clientAddressMap(preferences, clients) {
  const list = Array.isArray(clients) ? clients : [];
  const byId = new Map(list.map((c) => [String(c.client_id || '').toLowerCase(), c]));
  const map = new Map(); // aliasLower -> { client_id, name }

  const put = (alias, client) => {
    const key = String(alias || '').trim().toLowerCase();
    if (!key || key.length > 40 || !client) return;
    const target = { client_id: client.client_id, name: client.name || null };
    if (!map.has(key)) map.set(key, target);
    for (const form of addressAliasForms(key)) {
      if (!map.has(form)) map.set(form, target);
    }
  };

  const clientByNameIn = (text) => {
    const lower = String(text || '').toLowerCase();
    for (const c of list) {
      const name = String(c.name || '').trim();
      if (name.length >= 3 && lower.includes(name.toLowerCase())) return c;
    }
    return null;
  };

  for (const entry of preferences || []) {
    if (entry.stale) continue;
    const note = String(entry.note || '');
    // Окна по UUID (или по имени, если uuid в записи нет): алиасы до маркера
    // клиента N → клиент N. Иначе «Жене» / «цыпе» = Александра склеивается с
    // первым упомянутым клиентом.
    const markers = [];
    for (const m of note.matchAll(CLIENT_UUID_RE)) {
      const client = byId.get(m[0].toLowerCase());
      if (client) markers.push({ index: m.index, length: m[0].length, client });
    }
    if (!markers.length) {
      for (const c of list) {
        const name = String(c.name || '').trim();
        if (name.length < 3) continue;
        const idx = note.toLowerCase().indexOf(name.toLowerCase());
        if (idx >= 0) markers.push({ index: idx, length: name.length, client: c });
      }
      markers.sort((a, b) => a.index - b.index);
    }
    if (markers.length) {
      for (let i = 0; i < markers.length; i += 1) {
        const start = i === 0 ? 0 : markers[i - 1].index + markers[i - 1].length;
        const end = markers[i].index + markers[i].length;
        const window = note.slice(start, end);
        for (const m of window.matchAll(/[«"]([^»"]{1,40})[»"]/g)) put(m[1], markers[i].client);
      }
    }

    const mentioned = new Set(markers.map((m) => m.client.client_id));
    // зовётся: только если в записи один клиент — иначе «жене» уедет не туда.
    if (mentioned.size === 1) {
      const only = list.find((c) => c.client_id === [...mentioned][0]);
      for (const alias of entry.aliases || []) put(alias, only);
    } else if (!mentioned.size) {
      const only = clientByNameIn(note);
      if (only) {
        for (const m of note.matchAll(/[«"]([^»"]{1,40})[»"]/g)) put(m[1], only);
        for (const alias of entry.aliases || []) put(alias, only);
      }
    }
  }
  // «себе» ≡ «мне» для собственного дневника куратора (часто не пишут в кавычках).
  if (map.has('мне') && !map.has('себе')) {
    const me = map.get('мне');
    const client = list.find((c) => String(c.client_id) === String(me.client_id));
    if (client) put('себе', client);
  }
  return map;
}

/** Алиас из сырой фразы (в т.ч. стоп-слово «мне»), без topicTerms. */
function preferenceHitsRawTopic(entry, topic) {
  const raw = String(topic || '');
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const aliases = [
    ...(entry.aliases || []),
    ...[...String(entry.note || '').matchAll(/[«"]([^»"]{1,40})[»"]/g)].map((m) => m[1]),
  ];
  const forms = new Set();
  for (const alias of aliases) {
    for (const form of addressAliasForms(alias)) forms.add(form);
    const a = String(alias || '').trim().toLowerCase();
    if (a) forms.add(a);
  }
  for (const a of forms) {
    if (!a) continue;
    // Граница слова: «мне» в «запиши мне 300», но не «изменение».
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * Алиас адресации в topic («мне», «жена», «цыпу»…). Unicode-границы, не \b.
 */
function addressAliasInTopic(topic) {
  const raw = String(topic || '').trim().toLowerCase();
  if (!raw) return false;
  const forms = allHardcodedAddressAliasForms().map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${forms.join('|')})(?:[^\\p{L}\\p{N}]|$)`, 'u');
  return re.test(raw);
}

/**
 * Фраза про дневник с алиасом («запиши мне …») — адресация через client=алиас,
 * не tasks_context. Инцидент 07.08: модель звала context, хотя сервер уже
 * разворачивает «мне» в client_id.
 *
 * Smoke2/3: archaeology («Find who мне», «кто жена») без дневниковых маркеров.
 */
function diaryTopicUsesAddressAlias(topic) {
  if (!addressAliasInTopic(topic)) return false;
  const raw = String(topic || '').trim().toLowerCase();
  if (/(?:запиш|внес|завед|создай|добав|продукт|приём|перекус|обед|завтрак|ужин|дневник|еду|съел|\d+\s*г|мл|ml)/u.test(raw)) return true;
  if (/(?:кто\s+(такой|такая|есть)|find\s+who|who\s+is|curator\s+memory|в\s+памят|памят|алиас|alias|list_client|ищу\s+кто|проверь.*(жен|мне|цып)|спрашивал.*(жен|мне|цып))/u.test(raw)) return true;
  const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length <= 4) return true;
  return false;
}

function preferenceLine({ date, kind, note, evidence }) {
  return `- ${date} · ${kind} · ${note}${evidence ? ` — ${evidence}` : ''}`;
}

/** Запись целиком: строка и заданный вопрос под ней, если он был. */
function preferenceBlock({ date, kind, note, evidence, question = null, aliases = null }) {
  const head = preferenceLine({ date, kind, note, evidence });
  const rows = [];
  const asked = String(question || '').trim();
  if (asked) rows.push(`  - вопрос: ${asked}`);
  const named = (Array.isArray(aliases) ? aliases : String(aliases || '').split(/[,;]/))
    .map((x) => String(x).trim()).filter(Boolean);
  if (named.length) rows.push(`  - зовётся: ${named.join(', ')}`);
  return rows.length ? `${head}\n${rows.join('\n')}` : head;
}

/**
 * Счётчик у записи памяти: сколько раз она подтверждалась или пригождалась.
 *
 * Правится сразу пачкой и с конца файла: каждая вставка вложенной строки
 * двигает номера строк ниже, и обновление «сверху вниз» промахнулось бы уже на
 * второй записи.
 */
function bumpPreferenceCounter(text, entries, { field = 'пригодилось', date = null } = {}) {
  const key = field === 'подтверждено' ? 'confirmed' : 'used';
  let out = String(text || '');
  const order = [...(entries || [])].sort((a, b) => b.line - a.line);
  for (const entry of order) {
    const lines = out.split('\n');
    const next = counterChild(field, { count: (entry[key]?.count || 0) + 1, date });
    let at = -1;
    for (let i = entry.line + 1; i < lines.length; i += 1) {
      if (!/^\s/.test(lines[i]) || !lines[i].trim()) break;
      const child = PREFS_CHILD_RE.exec(lines[i].trim().replace(/^[-*]\s+/, ''));
      if (child && child[1].toLowerCase() === field) { at = i; break; }
    }
    if (at === -1) {
      out = appendChild(out, entry.line, next);
    } else {
      lines[at] = `  - ${next}`;
      out = lines.join('\n');
    }
  }
  return out;
}

/**
 * Дописать синонимы к уже записанному — третий вход, которого не было.
 *
 * Синонимы рисовались только при создании записи и при замене через
 * `replaces`. Значит к живому факту добавить «зовётся: тачка, авто» было
 * нечем: повтор того же значения уходил в ветку подтверждения и переданные
 * синонимы молча выбрасывал, а `replaces` штампует «устарело» с датой —
 * то есть записал бы в память событие, которого не было, ради косметики
 * поиска. Проверено 04.08: факт про машину не поднимался ни на «шкоду», ни
 * на «тачку», и починить это штатно было невозможно.
 *
 * Возвращает null, когда добавлять нечего: все синонимы уже стоят.
 */
function addPreferenceAliases(text, entry, aliases) {
  const add = parseAliases(Array.isArray(aliases) ? aliases.join(',') : aliases);
  if (!add.length || !entry) return null;
  const have = (entry.aliases || []).map((a) => a.toLowerCase());
  const fresh = add.filter((a) => !have.includes(a.toLowerCase()));
  if (!fresh.length) return null;

  const merged = [...(entry.aliases || []), ...fresh];
  const child = `зовётся: ${merged.join(', ')}`;
  const lines = String(text || '').split('\n');
  for (let i = entry.line + 1; i < lines.length; i += 1) {
    if (!/^\s/.test(lines[i]) || !lines[i].trim()) break;
    const found = PREFS_CHILD_RE.exec(lines[i].trim().replace(/^[-*]\s+/, ''));
    if (found && /^зов[её]тся$/i.test(found[1])) {
      lines[i] = `  - ${child}`;
      return { text: lines.join('\n'), added: fresh, aliases: merged };
    }
  }
  return { text: appendChild(String(text || ''), entry.line, child), added: fresh, aliases: merged };
}

/**
 * Пометить запись устаревшей — по её собственной строке, а не по номеру.
 *
 * Номер строки здесь не годится вовсе: между чтением и записью файл могли
 * переписать из другой сессии, и повтор на свежем тексте (rebase) обязан найти
 * ту же запись заново. Не нашлась — возвращаем null, и вызывающий отказывает
 * вслух: молча дописать новое значение, не погасив старое, значит оставить в
 * памяти два живых ответа на один вопрос.
 */
function markPreferenceStale(text, entry, { date, replacedBy = null } = {}) {
  const head = preferenceLine(entry).trim();
  const lines = String(text || '').split('\n');
  const at = lines.findIndex((line) => line.trim() === head);
  if (at === -1) return null;
  const mark = staleChild({ date, replacedBy });
  for (let i = at + 1; i < lines.length; i += 1) {
    if (!/^\s/.test(lines[i]) || !lines[i].trim()) break;
    const child = PREFS_CHILD_RE.exec(lines[i].trim().replace(/^[-*]\s+/, ''));
    if (child && child[1].toLowerCase() === 'устарело') {
      lines[i] = `  - ${mark}`;
      return lines.join('\n');
    }
  }
  return appendChild(lines.join('\n'), at, mark);
}

/** Живая память: всё, кроме помеченного устаревшим. */
function activePreferences(entries) {
  return (entries || []).filter((entry) => !entry.stale);
}

/**
 * Что пора пересмотреть. Для разных видов памяти это разные вопросы, и меряются
 * они по-разному.
 *
 * Обычная запись: старше месяца и ни разу не пригодилась — «это ещё нужно?».
 * «Пригодилось» считается с того дня, как счётчик вообще завели, — у записи,
 * сделанной раньше, пустой счётчик значит «не считали», а не «не нужна».
 *
 * Факт: срок вшестеро длиннее и считается от последнего касания, а не от даты
 * записи. Причина в том, что счётчик у факта работает наоборот: факт, который
 * пригождается каждую неделю, — самый опасный из устаревших, им отвечают
 * уверенно и не проверяя. Поэтому «пригодилось» его не освобождает, а только
 * отодвигает срок: раз попал в разбор — значит был верен на тот день.
 *
 * Список только показывается, вычёркивает из него он сам.
 */
function stalePreferences(entries, { today = null, days = PREFS_STALE_DAYS, factDays = PREFS_FACT_STALE_DAYS } = {}) {
  if (!today) return [];
  const ageFrom = (date) => Math.floor((dateToMs(today) - dateToMs(date)) / DAY_MS);
  return activePreferences(entries)
    .map((entry) => {
      if (entry.kind !== 'факт') {
        const age = ageFrom(entry.date);
        const due = Number.isFinite(age) && age > days && !(entry.used?.count > 0);
        return due ? { ...entry, age_days: age, reason: 'вычеркнуть' } : null;
      }
      // Последнее касание: запись, подтверждение или попадание в разбор.
      const touched = [entry.date, entry.confirmed?.date, entry.used?.date]
        .filter(Boolean).sort().pop();
      const age = ageFrom(touched);
      return Number.isFinite(age) && age > factDays
        ? { ...entry, age_days: age, reason: 'проверить' }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.age_days - a.age_days);
}

// ── Окружение находки ────────────────────────────────────────────────────
//
// Поиск по словам возвращает обрывки строк, и дальше модель додумывает, что
// вокруг них. Между тем весь задачник — проценты окна модели, экономить не на
// чем. Поэтому к найденному прикладывается его окружение: проект целиком (он
// маленький) и время, которое уже выделено под эти задачи в днях.
//
// Время — отдельный смысл: пересечение по часам поиск по словам не находит
// никогда, у «дзюдо в понедельник» и «уборки 15:30» нет общих слов.

/**
 * Проекты найденных задач — целиком, коротким списком открытых задач.
 * @param {Array} files все файлы задачника
 * @param {Array} matched найденные задачи
 */
function projectNeighborhood(files, matched, { limit = 3, perProject = 12 } = {}) {
  const order = [];
  for (const task of matched) {
    const key = projectKeyForPath(task.path);
    if (key && !order.includes(key)) order.push(key);
    if (order.length >= limit) break;
  }
  const out = [];
  for (const key of order) {
    const file = files.find((f) => projectKeyForPath(f.path) === key);
    if (!file) continue;
    const all = parseTasks(file);
    const open = all.filter((t) => !t.done);
    out.push({
      project: key,
      open_count: open.length,
      done_count: all.length - open.length,
      tasks: open.slice(0, perProject).map((t) => ({
        ...taskAddress(file.path, t.title),
        title: t.title,
        pri: t.pri,
        due: t.due || null,
        tags: t.tags,
        waiting: t.children.filter((c) => /^(открыто|ждём|при встрече):/i.test(c)),
      })),
      truncated: Math.max(0, open.length - perProject),
    });
  }
  return out;
}

/**
 * Время в днях, относящееся к найденному: слоты со ссылкой на эти задачи и
 * слоты, названные теми же словами. Отвечает на «когда это стоит» — вопрос, на
 * который список задач не отвечает вовсе.
 */
function slotsAround(files, refs, terms, { from = null, limit = 20 } = {}) {
  const wanted = new Set(refs.map((r) => String(r).toLowerCase()));
  const out = [];
  for (const file of files) {
    if (!/^days\//i.test(String(file.path || ''))) continue;
    const date = /days\/(\d{4}-\d{2}-\d{2})/i.exec(file.path)?.[1] || null;
    if (from && date && date < from) continue;
    for (const line of String(file.text || '').split('\n')) {
      const slot = SLOT_LINE_RE.exec(line.trim());
      if (!slot) continue;
      const linked = parseSlotRef(line);
      const ref = linked ? `${linked.ref.project}/${linked.ref.hash}` : null;
      const byRef = ref && wanted.has(ref.toLowerCase());
      const byWord = !byRef && terms.length ? matchTerms(slot[3], terms).score > 0 : false;
      if (!byRef && !byWord) continue;
      out.push({
        date,
        from: slot[1],
        to: slot[2],
        title: (linked ? linked.title : slot[3].replace(SLOT_MARK_RE, '').replace(/\s*#[\p{L}\d]+/gu, '')).trim(),
        ref,
        why: byRef ? 'под эту задачу' : 'названо теми же словами',
      });
    }
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.from.localeCompare(b.from));
  return out.slice(0, limit);
}

// ── Потолок и дубли развилок ─────────────────────────────────────────────
//
// Потолок в три находки за проход стоит на автоматическом обходе, но развилку
// можно положить и напрямую, в любом разговоре. Без такой же проверки здесь
// потолок не значит ничего: тот же вопрос ложится вторым, третьим, и блок
// «Требует решения» перестают читать целиком — вместе с тем, что там важно.
//
// Порог схожести 0.6 взят тот же, что в ритуальном контуре: два разных числа
// для одного и того же решения — способ получить два разных поведения.

const OPEN_DECISIONS_CAP = 30;
const DECISION_SIMILARITY = 0.6;

/** Значимые слова фразы, приведённые к основе: «встречу» и «встреча» — одно. */
function questionStems(text) {
  return new Set(topicTerms(text).terms.map((t) => stemWord(t.word)).filter((w) => w.length >= 3));
}

/**
 * Насколько два вопроса про одно и то же: доля общих значимых слов.
 * Точного совпадения строк мало — один и тот же вопрос человек и модель
 * формулируют по-разному, и дубль проходит мимо проверки.
 */
function questionSimilarity(a, b) {
  const first = questionStems(a);
  const second = questionStems(b);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared += 1;
  return shared / (first.size + second.size - shared);
}

/**
 * Что мешает положить развилку: такой вопрос уже висит открытым, ответ на него
 * уже записан фактом, или доска держит столько нерешённого, что новое просто не
 * прочитают.
 *
 * Проверка по фактам стоит здесь, а не в правилах, по той же причине, что и
 * остальные отказы этого файла: правило можно не прочитать. Вопрос, на который
 * ответ уже лежит в памяти, — это тот самый четвёртый раз про марку машины,
 * только положенный на доску, где он ещё и переживёт разговор.
 *
 * Сверяются только факты: устройство его мира отвечает на вопрос целиком.
 * Предпочтение или решение на вопрос доски похоже словами, но не отвечает на
 * него, и глушить им развилку значило бы терять настоящие вопросы.
 *
 * @param {Array} openQuestions результат collectOpenQuestions
 * @param {string[]} questions что собираемся спросить
 * @param {Array} facts записи памяти (parsePreferences); берутся живые факты
 */
function decisionGuard(openQuestions, questions, { cap = OPEN_DECISIONS_CAP, threshold = DECISION_SIMILARITY, facts = [] } = {}) {
  const duplicates = [];
  const answered = [];
  const fresh = [];
  const known = activePreferences(facts).filter((entry) => entry.kind === 'факт');
  for (const question of questions) {
    let best = null;
    for (const open of openQuestions) {
      const score = questionSimilarity(question, open.question);
      if (score >= threshold && (!best || score > best.score)) {
        best = { asked: question, same_as: open.question, ref: open.ref, task: open.task, score: Math.round(score * 100) / 100 };
      }
    }
    if (best) { duplicates.push(best); continue; }
    const fact = knownPreference(known, null, { question, threshold });
    if (fact) { answered.push({ asked: question, fact }); continue; }
    fresh.push(question);
  }
  const openTasks = [...new Set(openQuestions.map((q) => q.ref).filter(Boolean))];
  return { fresh, duplicates, answered, open_refs: openTasks, open_count: openTasks.length, cap, over_cap: openTasks.length >= cap };
}

// ── «Что делать прямо сейчас» ────────────────────────────────────────────
//
// «Есть час», «я в студии», «голова не варит» — это ситуация, а не просьба
// показать всё. Отбор идёт по месту, времени и состоянию, а не по возрасту
// задачи: самая старая задача почти никогда не бывает самой подходящей.

const PLACE_TAGS = new Set(['студия', 'дом', 'ноут', 'город']);
const TIME_TAGS = { '15min': 15, '30min': 30, '45min': 45, '1h': 60, '2h': 120 };

function taskPlace(task) {
  return (task.tags || []).map((t) => t.toLowerCase()).find((t) => PLACE_TAGS.has(t)) || null;
}

function taskMinutes(task) {
  for (const tag of (task.tags || [])) {
    const minutes = TIME_TAGS[String(tag).toLowerCase()];
    if (minutes) return minutes;
  }
  return null;
}

/**
 * Подбор задач под ситуацию. Возвращает не больше `limit` штук, каждая — с
 * причиной, по которой она здесь: без причины список читается как «покажи всё»,
 * а именно от этого методичка и уводит.
 */
function pickFocus(tasks_, { place = null, minutes = null, mood = null, today = null, limit = 3 } = {}) {
  const wantedPlace = place ? String(place).replace(/^#/, '').toLowerCase() : null;
  const budget = Number(minutes) || null;
  const low = mood === 'low';

  const scored = [];
  for (const task of tasks_) {
    if (task.done || task.waiting) continue;
    const tags = (task.tags || []).map((t) => t.toLowerCase());
    const blocked = tags.includes('blocked') || task.children.some((c) => /^открыто:/i.test(c));
    const taskPlaceTag = taskPlace(task);
    const taskTime = taskMinutes(task);

    // Место: задача с чужим местом сюда не подходит вовсе — её физически не
    // сделать. Задача без места подходит везде.
    if (wantedPlace && taskPlaceTag && taskPlaceTag !== wantedPlace) continue;
    // Время: задача, которая заведомо длиннее окна, — не вариант.
    if (budget && taskTime && taskTime > budget) continue;

    const reasons = [];
    let score = 0;
    if (wantedPlace && taskPlaceTag === wantedPlace) { score += 40; reasons.push(`место: #${taskPlaceTag}`); }
    if (budget && taskTime) { score += 25; reasons.push(`влезает в ${budget} мин (#${Object.keys(TIME_TAGS).find((k) => TIME_TAGS[k] === taskTime)})`); }
    // Окно считается и без срока: строку «окно:» можно положить руками, и тогда
    // due у задачи нет вовсе — а «начало недели» всё равно уже наступило.
    const signal = taskSignalDate(task);
    if (signal && today) {
      // Просрочка — всегда по сроку. Всё остальное считается от дня, с которого
      // задачу можно делать: у задачи с окном это его начало, иначе тот же срок.
      // Иначе «вторая половина августа» с крайним сроком 31-го молчала бы две
      // недели и всплыла в последний день.
      const window = taskWindow(task.children);
      if (task.due && task.due < today) { score += 50; reasons.push(`просрочено с ${task.due}`); }
      else if (signal === today) { score += 45; reasons.push(window ? `окно открылось ${window.from}` : 'срок сегодня'); }
      else if (signal < today) { score += 45; reasons.push(`окно с ${window ? window.from : signal}${task.due ? `, край ${task.due}` : ''}`); }
      else if (dateToMs(signal) - dateToMs(today) <= 3 * DAY_MS) { score += 20; reasons.push(window ? `окно с ${window.from}` : `срок ${task.due}`); }
    }
    if (task.priority === 'P1') { score += 30; reasons.push('P1'); }
    else if (task.priority === 'P2') score += 15;
    else if (task.priority === 'P3') score += 5;
    if (tags.includes('next')) { score += 20; reasons.push('#next'); }

    // Состояние. «Голова не варит» — это про короткое и понятное: длинная
    // задача с подпунктами в таком состоянии не делается, а откладывается.
    if (low) {
      if (taskTime && taskTime <= 15) { score += 35; reasons.push('короткая, под «голова не варит»'); }
      if (task.children.filter((c) => /^-?\s*\[[ x]\]/.test(c)).length >= 2) score -= 25;
      if (task.title.length > 60) score -= 15;
      if (task.priority === 'P1') score -= 10;
    }
    if (blocked) { score -= 60; reasons.push('ждёт твоего решения'); }

    scored.push({ ...task, score, blocked, reasons });
  }

  return scored
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
}

// ── Операции записи ──────────────────────────────────────────────────────
//
// Все они принимают текст файла и возвращают новый текст. Целиковой замены
// среди них нет намеренно: инструмент не умеет сказать «вот новое содержимое»,
// он умеет только «вставь строку сюда» и «замени вот этот блок». Это и есть
// защита от молчаливого затирания правки соседней сессии.

/** Номер строки с заголовком раздела (`## Задачи`), или -1. */
function findSectionLine(lines, section) {
  const wanted = String(section || '').trim().toLowerCase();
  return lines.findIndex((line) => line.trim().toLowerCase() === wanted);
}

/**
 * Вставка задачи в раздел. Строка встаёт в конец раздела, а не в конец файла:
 * ниже по файлу живут «## Идеи» и другие разделы, и дописанная вслепую задача
 * оказалась бы в чужом.
 */
/**
 * Вставить строку первой в разделе. Нужно там, где файл читается сверху вниз
 * как лента свежего: операции месяца лежат новыми вверх, и дописанная в конец
 * строка выглядела бы как самая старая.
 */
function prependToSection(text, line, section) {
  const lines = String(text || '').split('\n');
  const start = findSectionLine(lines, section);
  if (start === -1) return appendToSection(text, line, section);
  let at = start + 1;
  while (at < lines.length && lines[at].trim() === '') at += 1;
  return [...lines.slice(0, at), line, ...lines.slice(at)].join('\n');
}

function appendToSection(text, line, section = '## Задачи') {
  const lines = String(text || '').split('\n');
  const start = findSectionLine(lines, section);
  if (start === -1) {
    // Раздела нет — заводим его в конце файла, а не молча кладём строку абы куда.
    const tail = lines.length && lines[lines.length - 1].trim() === '' ? lines.slice(0, -1) : lines;
    return [...tail, '', section, '', line, ''].join('\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) { end = i; break; }
  }
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1;
  return [...lines.slice(0, end), line, ...lines.slice(end)].join('\n');
}

/** Дописать блок в конец файла — для журнала и инбокса. */
function appendBlock(text, block) {
  const base = String(text || '').replace(/\s+$/, '');
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/**
 * Время из заголовка блока «## ЧЧ:ММ» в минутах от начала суток задачника.
 * Ночь до трёх — это ещё вчерашний день (та же граница, что у tasks_checkpoint
 * и у дневника), поэтому она уезжает в конец файла, а не в его начало.
 */
function blockMinutes(block) {
  const m = /^##\s*(\d{1,2}):(\d{2})\b/m.exec(String(block || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
  return (h < 3 ? h + 24 : h) * 60 + min;
}

/**
 * Вставить блок по времени, а не в конец файла.
 *
 * Стенограмму пишут несколько сессий сразу, и запись, начатая раньше, приходит
 * позже — appendBlock ставил её в конец, и хронология рвалась: в
 * transcript/2026-09-02.md подряд идут 20:10, 14:20, 18:45, 18:52. Читают такой
 * файл как раз с середины, и порядок в нём — единственный ориентир.
 *
 * Блок без разбираемого времени и файл без единого заголовка уходят в конец —
 * прежнее поведение, чтобы ничего не потерялось.
 */
function insertBlockByTime(text, block) {
  const base = String(text || '').replace(/\s+$/, '');
  if (!base) return `${block}\n`;
  const mine = blockMinutes(block);
  if (mine == null) return appendBlock(base, block);

  const lines = base.split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = blockMinutes(lines[i]);
    if (t != null) heads.push({ line: i, minutes: t });
  }
  if (!heads.length) return appendBlock(base, block);

  // Первый блок, начавшийся позже нашего: перед ним и встаём.
  const after = heads.find((h) => h.minutes > mine);
  if (!after) return appendBlock(base, block);

  const head = lines.slice(0, after.line).join('\n').replace(/\s+$/, '');
  const tail = lines.slice(after.line).join('\n').replace(/^\s+/, '');
  return `${head}\n\n${block}\n\n${tail}\n`;
}

/**
 * Вставить блок первым в файл. Оставлен для дельт с mode=prepend (деньги и пр.).
 * Стенограмма с 2026-08-11 пишется через appendBlock — хронология сверху вниз,
 * как tasks_append и transcriptTail.
 */
function prependBlock(text, block) {
  const base = String(text || '').replace(/^\s+/, '');
  return base ? `${block}\n\n${base}` : `${block}\n`;
}

/** Найти задачу по хэшу доски. Возвращает индекс строки и разбор, либо null. */
function findTaskByHash(file, hash) {
  const projectKey = projectKeyForPath(file.path);
  const lines = String(file.text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseTaskLine(lines[i]);
    if (!parsed || parsed.indent !== 0) continue;
    if (taskHash(projectKey, parsed.title) === String(hash).toLowerCase()) {
      return { line: i, parsed, projectKey };
    }
  }
  return null;
}

/**
 * Правка полей задачи прямо в строке. Меняются только названные поля;
 * остальное — включая порядок слов и авторскую формулировку — остаётся как
 * было. Заголовок не трогаем: от него зависит хэш, по которому на задачу
 * ссылаются с доски.
 */
function applyTaskPatch(rawLine, patch = {}) {
  let line = rawLine;

  if (patch.state) {
    const mark = { new: ' ', doing: '~', done: 'x', wait: '>' }[patch.state];
    if (!mark) throw new Error(`invalid_state:${patch.state}`);
    line = line.replace(/^(\s*-\s*\[)[ x>~](\])/i, `$1${mark}$2`);
  }

  if (patch.due !== undefined) {
    const next = patch.due ? `due:${patch.due}` : '';
    if (patch.due && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due)) throw new Error(`invalid_due:${patch.due}`);
    line = /\bdue:\d{4}-\d{2}-\d{2}/.test(line)
      ? line.replace(/\s*\bdue:\d{4}-\d{2}-\d{2}/, next ? ` ${next}` : '')
      : (next ? `${line} ${next}` : line);
  }

  if (patch.priority) {
    if (!/^P[123]$/.test(patch.priority)) throw new Error(`invalid_priority:${patch.priority}`);
    line = /\bP[123]\b/.test(line)
      ? line.replace(/\bP[123]\b/, patch.priority)
      : line.replace(/^(\s*-\s*\[[ x>~]\]\s*)/i, `$1${patch.priority} `);
  }

  // Конец тега проверяем через «дальше не буква и не цифра», а не через `\b`:
  // граница слова в JS считается по ASCII, и у кириллического `#ноут` её в
  // конце строки просто нет. С `\b` тот же тег добавлялся вторым, а снять его
  // было нельзя вовсе — молча, на самых частых тегах места.
  const tagEnd = '(?![\\p{L}\\d_])';
  for (const tag of (patch.addTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    if (!new RegExp(`#${clean}${tagEnd}`, 'u').test(line)) line = `${line} #${clean}`;
  }
  for (const tag of (patch.removeTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    line = line.replace(new RegExp(`\\s*#${clean}${tagEnd}`, 'u'), '');
  }

  return line.replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
}

/** Вложенная строка под задачей: контекст, `ждём:`, `при встрече:`, `открыто:`. */
function appendChild(text, taskLine, childLine) {
  const lines = String(text || '').split('\n');
  let insertAt = taskLine + 1;
  while (insertAt < lines.length) {
    const line = lines[insertAt];
    if (!line.trim()) break;
    if (!/^\s/.test(line)) break;
    insertAt += 1;
  }
  return [...lines.slice(0, insertAt), `  - ${childLine}`, ...lines.slice(insertAt)].join('\n');
}

/**
 * Найти индекс строки-якоря.
 *
 * Сначала — точное совпадение после trim (как раньше). Не нашли — уникальная
 * строка, которая содержит needle (как матчер done у планёрки). Инцидент
 * 05.08: агент копировал «Codex» / кусок пункта из tasks_read, а патч
 * требовал байт-в-байт всю строку и отвечал anchor_not_found на живом файле.
 * Несколько совпадений — ошибка с кандидатами, а не молчаливый первый hit.
 *
 * `fromIndex` — искать только ниже этой строки (для якоря `to`, чтобы не
 * поймать одноимённый заголовок выше `from`).
 */
function findAnchorLine(lines, raw, { label = 'from', fromIndex = 0 } = {}) {
  const needle = String(raw || '').trim();
  if (!needle) throw new Error(`empty_anchor:${label}`);
  const slice = lines.slice(fromIndex);

  const exactRel = slice.findIndex((line) => line.trim() === needle);
  if (exactRel !== -1) return fromIndex + exactRel;

  const lower = needle.toLowerCase();
  const hits = [];
  for (let i = 0; i < slice.length; i += 1) {
    const trimmed = slice[i].trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().includes(lower)) hits.push(fromIndex + i);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`anchor_not_found:${raw}`);
  const preview = hits.slice(0, 5).map((i) => `${i + 1}:${lines[i].trim().slice(0, 80)}`).join(' | ');
  throw new Error(`anchor_ambiguous:${label}:${hits.length}:${preview}`);
}

/**
 * Замена блока по якорям — для переработок вроде «перегруппируй раздел».
 * Якорь — точная строка или уникальная подстрока; блок заменяется вместе с
 * ограничивающей строкой `from`, но без `to`. Без `to` меняется ровно одна
 * строка `from` — раньше патч без `to` жрал файл до конца, и это выглядело
 * как «одиночный якорь сломан», хотя start находился. Не нашли или нашли
 * несколько — ошибка, а не повод дописать текст куда-нибудь.
 */
function patchBlock(text, { from, to = null, replacement = '' }) {
  const lines = String(text || '').split('\n');
  const start = findAnchorLine(lines, from, { label: 'from' });
  let end = start + 1;
  if (to) {
    // Ищем строго ниже from — иначе одноимённый заголовок выше съест диапазон.
    end = findAnchorLine(lines, to, { label: 'to', fromIndex: start + 1 });
  }
  const body = String(replacement).split('\n');
  // replacement без завершающего \n даёт одну строку; с завершающим — лишний
  // пустой элемент в конце. Убираем только хвостовой пустой, чтобы «строка\n»
  // и «строка» вели себя одинаково при замене одной строки.
  if (body.length > 1 && body[body.length - 1] === '') body.pop();
  return [...lines.slice(0, start), ...body, ...lines.slice(end)].join('\n');
}

/**
 * Отметить или снять галочку у подпункта задачи. Подпункт ищется по тексту, а
 * не по номеру: номер меняется от любой вставки выше, а текст — это то, что
 * человек называет вслух.
 */
function toggleSubtask(text, taskLine, subtaskText, done = true) {
  const lines = String(text || '').split('\n');
  const needle = String(subtaskText || '').trim().toLowerCase();
  if (!needle) throw new Error('empty_subtask');
  for (let i = taskLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) break;
    if (!/^\s/.test(lines[i])) break;
    const match = /^(\s*-\s*\[)([ x])(\]\s*)(.*)$/i.exec(lines[i]);
    if (!match) continue;
    if (!match[4].trim().toLowerCase().includes(needle)) continue;
    lines[i] = `${match[1]}${done ? 'x' : ' '}${match[3]}${match[4]}`;
    return { text: lines.join('\n'), matched: match[4].trim() };
  }
  throw new Error(`subtask_not_found:${subtaskText}`);
}

/**
 * Снять вложенную строку у задачи — ответ получен, ожидание закрылось.
 *
 * Методичка задачника требует снимать `открыто:` и `ждём:` в том же ходе, в
 * котором пришёл ответ: вопрос, оставшийся висеть после ответа, всплывает
 * снова и заставляет спрашивать второй раз.
 */
function removeChild(text, taskLine, needle) {
  const lines = String(text || '').split('\n');
  const wanted = String(needle || '').trim().toLowerCase();
  if (!wanted) throw new Error('empty_needle');
  for (let i = taskLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) break;
    if (!/^\s/.test(lines[i])) break;
    if (!lines[i].toLowerCase().includes(wanted)) continue;
    const removed = lines[i].trim().replace(/^[-*]\s+/, '');
    lines.splice(i, 1);
    return { text: lines.join('\n'), removed };
  }
  throw new Error(`child_not_found:${needle}`);
}

/** Перенос задачи со всеми вложенными строками из одного файла в другой. */
function cutTask(text, taskLine) {
  const lines = String(text || '').split('\n');
  let end = taskLine + 1;
  while (end < lines.length && lines[end].trim() && /^\s/.test(lines[end])) end += 1;
  const block = lines.slice(taskLine, end).join('\n');
  return { text: [...lines.slice(0, taskLine), ...lines.slice(end)].join('\n'), block };
}

/**
 * Строка слота. Галочка в начале — часть формата, а не украшение: доска пишет
 * закрытый слот как `- [x] 15:00-17:00 Kinderly` и продолжает считать его
 * занятым временем. Без этой группы такой слот выпадал из разбора целиком, и
 * прошедший рабочий день выглядел бы отсюда полностью свободным.
 */
const SLOT_RE = /^-?\s*(?:\[([ xX])\]\s*)?(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s+(.*)$/;

/**
 * Тег вида слота — тот же словарь, что в build_board.py (KIND_RE).
 *
 * Границу слова здесь пришлось написать руками: `\b` в JS считает словом только
 * латиницу, поэтому после кириллического «фокус» границы не возникает никогда и
 * тег не находился вовсе. Всё подряд оказывалось «фокусом», а сам `#фокус`
 * оставался висеть в заголовке слота. В Python `\b` знает про кириллицу, из-за
 * чего доска разбирала те же строки правильно, а здесь — молча нет.
 */
const SLOT_KIND_RE = /\s*#(фон|дело|фокус|привычка)(?![\wа-яё])/i;
const SLOT_KINDS = new Set(['фон', 'дело', 'фокус', 'привычка']);

/** Вид слота из текста строки и заголовок без тега. Тег может стоять где угодно в строке. */
function slotKindAndTitle(rawTitle) {
  const match = SLOT_KIND_RE.exec(rawTitle);
  const kind = match ? match[1].toLowerCase() : 'фокус'; // доска подставляет тот же дефолт
  return { kind, title: rawTitle.replace(SLOT_KIND_RE, '').trim() };
}

// ── Чей слот и что он забирает ───────────────────────────────────────────
//
// «У жены тренировка завтра в обед» — событие не его, но зависит от него он:
// в это время ребёнок на нём и машина уехала. Отдельной сущности под это не
// нужно, нужны два необязательных признака у слота: чей он и что забирает.
//
// Ресурсов в семье ровно два — машина одна на двоих и ребёнок, который должен
// быть с кем-то. Оба признака необязательны и по умолчанию пусты: обязательное
// поле не заполняется, это в этом же задачнике уже проверено на тегах времени
// (стояли на трёх задачах из пятидесяти двух, пока их не расставили разом).
//
// Формат — русская скобка после названия и ДО ссылки на задачу:
//   `- 12:00–15:00 Тренировка Саши (чей: жена; занято: машина, ребёнок) #фон`
// Доска (build_board.py, parse_day) снимает со строки только `#вид` и `@место`,
// а ссылку ищет rsplit'ом по последней «·» — скобка ей не мешает и читается
// человеком как есть. Отсюда и требование ставить её перед ссылкой: после неё
// хвост перестал бы совпадать с REF_RE, и слот потерял бы кликабельность.
//
// Что из занятости следует — здесь НЕ решается. Таблицы «ресурс → запрещённые
// места» в коде нет намеренно: студия у них рядом с тренировкой, то есть без
// машины она достижима, а что-то другое — нет. Географию знает он один, и
// спрашивается она один раз, а ответ живёт в docs/preferences.md.

const SLOT_RESOURCES = new Set(['машина', 'ребёнок']);

const SLOT_MARK_RE = /\s*\((?:чей:\s*([^;()]+?))?\s*;?\s*(?:занято:\s*([^()]+?))?\)/i;

/** «ребенок» и «Ребёнок» — один и тот же ребёнок. */
function normalizeResource(value) {
  const raw = String(value || '').trim().toLowerCase();
  const flat = raw.replace(/ё/g, 'е');
  for (const known of SLOT_RESOURCES) {
    if (known.replace(/ё/g, 'е') === flat) return known;
  }
  return raw || null;
}

/**
 * Признаки слота из его заголовка. Скобка без ключевых слов — обычный текст
 * («уборка (перенесена с 4 августа)»), и трогать её нельзя.
 */
function parseSlotMark(rawTitle) {
  const raw = String(rawTitle || '');
  const match = SLOT_MARK_RE.exec(raw);
  if (!match || (!match[1] && !match[2])) return { whose: null, takes: [], title: raw.trim() };
  const takes = String(match[2] || '')
    .split(/[,;]/)
    .map((item) => normalizeResource(item))
    .filter(Boolean);
  return {
    whose: match[1] ? match[1].trim() : null,
    takes: [...new Set(takes)],
    title: raw.replace(SLOT_MARK_RE, '').replace(/\s{2,}/g, ' ').trim(),
  };
}

/** Собрать скобку обратно. Нечего сказать — ничего и не пишем. */
function buildSlotMark({ whose = null, takes = [] } = {}) {
  const who = String(whose || '').trim();
  const list = [...new Set((takes || []).map((item) => normalizeResource(item)).filter(Boolean))];
  if (!who && !list.length) return '';
  const parts = [];
  if (who) parts.push(`чей: ${who}`);
  if (list.length) parts.push(`занято: ${list.join(', ')}`);
  return `(${parts.join('; ')})`;
}

/**
 * Занятость ресурсов по дню: что занято, когда и чьим событием. Это факт, а не
 * запрет: вывод «значит туда не поедешь» делает он, а не эта функция.
 */
function resourceLoad(slots) {
  const out = [];
  for (const slot of slots) {
    for (const resource of slot.takes || []) {
      out.push({
        resource, from: slot.start, to: slot.end, whose: slot.whose || null, title: slot.title,
      });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.resource.localeCompare(b.resource));
}

/** Что занято в конкретную минуту дня — под вопрос «что делать прямо сейчас». */
function resourcesAt(slots, at, { dayStart = DAY_TAIL_BEFORE } = {}) {
  const minute = timeToMinutes(at);
  if (minute === null) throw new Error(`invalid_time:${at}`);
  const point = minute < dayStart ? minute + 24 * 60 : minute;
  return resourceLoad(slots.filter((slot) => point >= slot.from && point < slot.to));
}

/**
 * Смысл пересечения двух слотов — зеркало clash_kind() из build_board.py.
 * Расходиться с доской нельзя: инструмент и так столкнулся с этим один раз —
 * писал слоты без тега, доска подставляла «фокус» по умолчанию, и пятнадцать
 * минут на дела в кассе доска честно посчитала «два дела требуют головы
 * одновременно», хотя по смыслу это была врезка внутри вечера с родителями.
 */
function slotClashLevel(kindA, kindB) {
  const pair = new Set([kindA, kindB]);
  if (pair.has('дело')) return null; // врезка живёт внутри чего угодно
  if (pair.size === 2 && pair.has('фон') && pair.has('фокус')) return null; // работать внутри события — норма
  if (pair.size === 1 && pair.has('фон')) return 'вопрос'; // без адреса не различить один это блок или два
  if (pair.has('привычка')) return 'вопрос';
  return 'конфликт';
}

/** Минуты от полуночи. Свой разбор: модуль намеренно ни от чего не зависит. */
function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Сутки задачника кончаются не в полночь. Слот `00:00–03:00` в файле дня — это
 * ночь ПОСЛЕ него, и доска рисует его внизу, после 23:00. Поэтому всё, что
 * начинается раньше пяти утра, считается продолжением тех же суток: иначе
 * ночной слот численно оказывается «раньше» вечернего, и пересечение с ним
 * не находится вовсе.
 */
// Граница дня одна на оба решения. Раньше их было две: запись меняла день в
// 03:00 (DAY_START_HOUR), а сортировка считала ночной хвост до 05:00 — блок,
// написанный между тремя и пятью, ложился в новый день, но сортировался как
// хвост прошлого и уезжал в конец файла вместо начала. Поймано вживую
// 04.09 в 03:20. Значение взято по правилу владельца: «до 3 ночи если пишу,
// это ещё прошлый день».
const DAY_TAIL_BEFORE = DAY_START_HOUR * 60;

function slotMinutes(from, to, dayStart = DAY_TAIL_BEFORE) {
  let start = timeToMinutes(from);
  let end = timeToMinutes(to);
  if (start === null || end === null) return null;
  if (start < dayStart) start += 24 * 60;
  if (end < dayStart) end += 24 * 60;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/**
 * Слоты дня как интервалы — чтобы видеть пересечения до записи, а не после.
 *
 * `dayStart` двигает границу «где кончаются сутки»: для пересечений хватает
 * пяти утра, а свободное время считается от той же семи утра, что и на доске
 * (H0 в build_board.py). Разойтись тут нельзя — иначе окно, которое доска
 * рисует свободным, инструмент назовёт занятым.
 */
function parseSlots(text, { dayStart = DAY_TAIL_BEFORE } = {}) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = SLOT_RE.exec(lines[i].trim());
    if (!match) continue;
    const span = slotMinutes(match[2], match[3], dayStart);
    if (!span) continue;
    const { kind, title: withMark } = slotKindAndTitle(match[4].trim());
    // Признаки снимаются с заголовка так же, как тег вида: слот без них
    // разбирается ровно как раньше, а со скобкой — не тащит её в название.
    const { whose, takes, title } = parseSlotMark(withMark);
    out.push({
      line: i, from: span.start, to: span.end, kind, title, whose, takes, raw: lines[i],
      start: match[2], end: match[3], done: String(match[1] || '').toLowerCase() === 'x',
    });
  }
  return out;
}

/**
 * Пересечения нового слота с уже стоящими. Доска рисует слоты друг поверх
 * друга и о конфликте не скажет, а методичка требует называть его сразу —
 * поэтому считаем здесь и возвращаем инструменту, чтобы тот сказал вслух.
 */
function slotConflicts(text, from, to, kind = 'фокус') {
  const span = slotMinutes(from, to);
  if (!span) throw new Error(`invalid_time:${from}-${to}`);
  return parseSlots(text)
    // Закрытый слот конфликтом не считается — так же его пропускает
    // mark_clashes() на доске: время уже прошло, двигать нечего.
    .filter((slot) => !slot.done)
    .filter((slot) => span.start < slot.to && span.end > slot.from)
    .map((slot) => ({ ...slot, level: slotClashLevel(kind, slot.kind) }))
    .filter((slot) => slot.level) // «дело» и «фон+фокус» — законное совмещение, не показываем как проблему
    .map((slot) => ({ title: slot.title, raw: slot.raw.trim(), level: slot.level }));
}

// ── Снять, перенести, закрыть ────────────────────────────────────────────
//
// Слот умели только ставить. Из-за этого «отмени праздник 25-го» кончалось
// словами: ассистент говорил «снял», в дне оставалась строка, и загруженность
// дальше считала день занятым. Расхождение между сказанным и записанным — то,
// ради чего задачник и заводили, поэтому снятие и перенос живут здесь, рядом
// с постановкой, и той же арифметикой.

/** Часть заголовка без ссылки на задачу: по ней слот и ищут словами. */
function slotPlainTitle(title) {
  const body = String(title || '').trim();
  const cut = body.lastIndexOf('·');
  if (cut < 0) return body;
  return parseAddress(body.slice(cut + 1).trim()) ? body.slice(0, cut).trim() : body;
}

/**
 * Совпал ли слот с тем, как его назвали словами. Слова ищутся все и в любом
 * порядке: «праздник Ксении» и «Ксении праздник» — про одно и то же, а вот
 * лишнее слово должно отсекать, иначе «уборка» снимет не тот слот.
 */
function slotTitleMatches(title, needle) {
  const hay = slotPlainTitle(title).toLowerCase();
  const words = String(needle || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((word) => hay.includes(word));
}

/**
 * Слоты дня, подходящие под описание: время начала, слова заголовка или оба
 * сразу. Возвращаются ВСЕ подходящие — выбор «какой из них» инструмент делать
 * не вправе: молча снятый не тот слот не виден вообще никак.
 */
function findSlotsIn(text, { at = null, title = null } = {}) {
  const wantAt = at ? timeToMinutes(String(at).trim()) : null;
  if (at && wantAt === null) throw new Error(`invalid_time:${at}`);
  const needle = title ? String(title).trim() : null;
  if (wantAt === null && !needle) throw new Error('slot_query_required');
  return parseSlots(text).filter((slot) => {
    if (wantAt !== null && timeToMinutes(slot.start) !== wantAt) return false;
    if (needle && !slotTitleMatches(slot.title, needle)) return false;
    return true;
  });
}

/** ЧЧ:ММ в канонический вид: «9:00» и «09:00» — одна и та же минута. */
function padTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) throw new Error(`invalid_time:${value}`);
  return minutesToTime(minutes);
}

/** Разобрать строку слота на приставку с галочкой и хвост после времени. */
function splitSlotLine(raw) {
  const match = SLOT_RE.exec(String(raw || '').trim());
  if (!match) throw new Error('not_a_slot');
  return { mark: match[1] || null, from: match[2], to: match[3], tail: match[4] };
}

/** Собрать строку слота обратно. Формат тот же, что пишет доска. */
function buildSlotLine({ mark = null, from, to, tail }) {
  const box = mark ? `[${mark.toLowerCase() === 'x' ? 'x' : ' '}] ` : '';
  return `- ${box}${padTime(from)}–${padTime(to)} ${String(tail).trim()}`;
}

/** Убрать строку слота из файла дня. Задачу, на которую он ссылался, не трогаем. */
function removeSlotLine(text, index) {
  const lines = String(text || '').split('\n');
  if (index < 0 || index >= lines.length) throw new Error('slot_line_out_of_range');
  lines.splice(index, 1);
  return lines.join('\n');
}

/** Переставить время у слота на месте: ссылка, тег вида и место остаются как были. */
function retimeSlotLine(text, index, from, to) {
  const lines = String(text || '').split('\n');
  const parts = splitSlotLine(lines[index]);
  lines[index] = buildSlotLine({ ...parts, from, to });
  return lines.join('\n');
}

/**
 * Галочка у слота. Доска пишет закрытый слот как `- [x] 15:00-17:00 …` и
 * продолжает считать его занятым временем — свой значок «состоялось» тут был
 * бы форматом-двойником.
 */
function markSlotDone(text, index, done = true) {
  const lines = String(text || '').split('\n');
  const parts = splitSlotLine(lines[index]);
  lines[index] = buildSlotLine({ ...parts, mark: done ? 'x' : ' ' });
  return lines.join('\n');
}

/**
 * Заметка дня — строка `> …` внизу файла (days/README.md). Она же отметка
 * того, что день вообще закрывали: слот без галочки в закрытом дне значит «не
 * состоялось», а в незакрытом — «неизвестно», и различить это можно только по
 * ней.
 */
const DAY_NOTE_RE = /^>\s?(.*)$/;

function dayNote(text) {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = DAY_NOTE_RE.exec(lines[i].trim());
    if (match) return { line: i, text: match[1].trim() };
  }
  return null;
}

/** Записать заметку дня. Второе закрытие переписывает строку, а не плодит вторую. */
function setDayNote(text, note) {
  const clean = String(note || '').trim().replace(/\s*\n\s*/g, ' ');
  if (!clean) throw new Error('empty_note');
  const existing = dayNote(text);
  if (!existing) return appendBlock(text, `> ${clean}`);
  const lines = String(text || '').split('\n');
  lines[existing.line] = `> ${clean}`;
  return lines.join('\n');
}

/**
 * Событие дня — строка `~ …` внизу файла (days/README.md). Её пишет доска, когда
 * со слотом что-то происходит, и ровно из этих строк собирается «План и факт»
 * на вечернем закрытии.
 *
 * Чат в этот канал не ходил вовсе. Отметить дело он мог только через
 * tasks_close_day, а тот пишет заметку `>`, по которой доска и считает день
 * закрытым (build_board.day_closed). Отметка в обед объявляла день
 * законченным: 3 сентября так одиннадцать неотмеченных пунктов стали
 * читаться как «не состоялись».
 *
 * Формат повторяет board_server.day_event и регулярку build_board:
 * `~ 14:31 закрыт · 14:00-14:40 Ателье`. Между временами дефис, хотя сами
 * слоты набраны длинным тире, — доска ищет именно дефис.
 */
const DAY_EVENT_KINDS = new Set(['закрыт', 'удалён', 'сдвинут']);
const NEWLINE = String.fromCharCode(10);

function appendDayEvent(text, kind, slot, { at = null, nowMs = Date.now(), extra = '' } = {}) {
  if (!DAY_EVENT_KINDS.has(kind)) throw new Error(`unknown_day_event_kind:${kind}`);
  const time = /^\d{2}:\d{2}$/.test(String(at || '').trim())
    ? String(at).trim()
    : moscowTime(nowMs);
  const title = String(slot && slot.title ? slot.title : '').trim();
  const line = `~ ${time} ${kind} · ${slot.start}-${slot.end} ${title}`.trimEnd()
    + (extra ? ` ${extra}` : '');
  return appendBlock(text, line);
}

/** Есть ли уже событие про этот слот — повторная отметка не плодит строк. */
function hasDayEvent(text, kind, slot) {
  // Без регулярки: время у слота своё, а строка события собрана нами же —
  // достаточно узнать её по началу и хвосту, и не думать про экранирование.
  const tail = ` ${kind} · ${slot.start}-${slot.end}`;
  return String(text || '').split(NEWLINE)
    .some((line) => line.trim().startsWith('~ ') && line.includes(tail));
}

// ── Загруженность вперёд ─────────────────────────────────────────────────
//
// «Когда можно уехать» — вопрос не про поиск по словам. Поиск находит то, что
// названо теми же словами; свободная неделя не названа никак. Поэтому здесь
// считается ровно то, что человек видит на доске: занятость дня, свободные
// окна и то, что повторяется из недели в неделю.
//
// Числа перенесены из build_board.py, а не выбраны заново. Своя арифметика
// свободного времени — это гарантированное расхождение: инструмент сказал бы
// «вторник свободен», а на доске там стоит зарядка.

/** H0 в build_board.py: раньше семи утра доска день не рисует. */
const BOARD_DAY_START = 7 * 60;
/** NIGHT: после часа ночи «свободно» не рисуем. */
const BOARD_DAY_END = 25 * 60;
/** SNAP: слот короче четверти часа всё равно занимает четверть часа. */
const BOARD_SNAP = 15;
/** Порог годного окна. Меньше — это не «свободно», а щель между делами. */
const FREE_GAP_MIN = 45;

/** Минуты → ЧЧ:ММ. Хвост суток остаётся хвостом: 25:00 показывается как 01:00. */
function minutesToTime(value) {
  const total = ((Math.round(Number(value)) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Свободные окна дня — зеркало freeGaps() из build_board.py, строка в строку.
 * Вход — интервалы в минутах от полуночи с той же разверткой суток (07:00…01:00).
 */
function freeGaps(spans) {
  const busy = spans
    .map((s) => [s.from, Math.max(s.to, s.from + BOARD_SNAP)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cur = BOARD_DAY_START;
  for (const [a, b] of busy) {
    if (a - cur >= FREE_GAP_MIN) gaps.push({ from: cur, to: a });
    cur = Math.max(cur, b);
  }
  if (BOARD_DAY_END - cur >= FREE_GAP_MIN) gaps.push({ from: cur, to: BOARD_DAY_END });
  return gaps.map((g) => ({
    from: minutesToTime(g.from), to: minutesToTime(g.to), minutes: g.to - g.from,
  }));
}

/**
 * Занято минут — это объединение интервалов, а не их сумма. Сумма врёт ровно
 * там, где на доске всё и живёт: врезка «забрать торт» стоит внутри вечера у
 * родителей, и сложение выдало бы «занято 26 часов». Объединение к тому же
 * сходится со свободными окнами: занято + свободно = длина суток доски.
 */
function busyMinutes(spans) {
  const clipped = spans
    .map((s) => [s.from, Math.max(s.to, s.from + BOARD_SNAP)])
    .map(([a, b]) => [Math.max(a, BOARD_DAY_START), Math.min(b, BOARD_DAY_END)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of clipped) {
    if (!cur) { cur = [a, b]; continue; }
    if (a <= cur[1]) cur[1] = Math.max(cur[1], b);
    else { total += cur[1] - cur[0]; cur = [a, b]; }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

const RU_WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const RU_WEEKDAY_INDEX = Object.fromEntries(RU_WEEKDAYS.map((w, i) => [w, i]));
const RECURRING_LINE_RE = /^([\wа-яё,-]+)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+?)\s*$/i;

/** Дни недели повтора — тот же словарь, что rec_weekdays() на доске. */
function recurringWeekdays(spec) {
  const raw = String(spec || '').toLowerCase().trim();
  if (['ежедневно', 'каждый', 'всегда'].includes(raw)) return [0, 1, 2, 3, 4, 5, 6];
  if (['будни', 'будние'].includes(raw)) return [0, 1, 2, 3, 4];
  if (raw === 'выходные') return [5, 6];
  const out = new Set();
  for (const part of raw.split(',')) {
    const item = part.trim();
    if (item.includes('-')) {
      const [a, b] = item.split('-', 2).map((x) => x.trim());
      if (!(a in RU_WEEKDAY_INDEX) || !(b in RU_WEEKDAY_INDEX)) continue;
      const i = RU_WEEKDAY_INDEX[a];
      const j = RU_WEEKDAY_INDEX[b];
      const range = i <= j
        ? Array.from({ length: j - i + 1 }, (_, k) => i + k)
        : [...Array.from({ length: 7 - i }, (_, k) => i + k), ...Array.from({ length: j + 1 }, (_, k) => k)];
      range.forEach((d) => out.add(d));
    } else if (item in RU_WEEKDAY_INDEX) {
      out.add(RU_WEEKDAY_INDEX[item]);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * `days/recurring.md` — слоты, которые доска подставляет сама. В файлах дней
 * их нет вовсе, поэтому без разбора этого файла зарядка и понедельничный
 * разбор пропали бы из занятости, а окно под них оказалось бы «свободным».
 */
function parseRecurringSlots(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('Дни:') || line.startsWith('Строка')) continue;
    const match = RECURRING_LINE_RE.exec(line);
    if (!match) continue;
    const days = recurringWeekdays(match[1]);
    if (!days.length) continue;
    const raw4 = match[4].trim();
    const { kind, title } = slotKindAndTitle(raw4);
    // Повтор без тега — привычка, а не фокус: ровно так его помечает parse_day()
    // на доске. Иначе зарядка и дзюдо попадали бы в «время, которое требует
    // головы», и полчаса разминки читались бы как полчаса работы.
    out.push({ days, start: match[2], end: match[3], title, kind: SLOT_KIND_RE.test(raw4) ? kind : 'привычка' });
  }
  return out;
}

/** Понедельник = 0, как в build_board.py и в `days/recurring.md`. */
function weekdayIndex(date) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7;
}

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата, — ключ недельной сводки. */
function weekStart(date) {
  const wd = weekdayIndex(date);
  return wd === null ? null : shiftDate(date, -wd);
}

/**
 * Заголовок слота без служебных хвостов: ссылки на задачу и метки места.
 * Нужен только для того, чтобы узнать повтор: `Дзюдо @ЮЗР` и `Дзюдо` — одно
 * и то же событие, а по сырой строке они выглядят разными.
 */
function slotCoreTitle(title) {
  let out = String(title || '').trim();
  const parts = out.split('·').map((p) => p.trim());
  if (parts.length > 1 && parseAddress(parts[parts.length - 1])) {
    out = parts.slice(0, -1).join(' · ').trim();
  }
  out = out.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Загруженность одного дня. Дня без файла не существует как ошибки: это
 * просто свободный день, и показывать его надо именно так — иначе «уехать
 * можно» превращается в «данных нет».
 */
function dayLoad({ date, text = '', recurring = [] } = {}) {
  const own = parseSlots(text, { dayStart: BOARD_DAY_START })
    .map((s) => ({
      start: s.start, end: s.end, from: s.from, to: s.to, kind: s.kind, title: s.title,
      whose: s.whose, takes: s.takes, repeat: false, done: !!s.done,
    }));
  const wd = weekdayIndex(date);
  const have = new Set(own.map((s) => `${s.start}|${slotCoreTitle(s.title)}`));
  const added = [];
  for (const rec of recurring) {
    if (wd === null || !rec.days.includes(wd)) continue;
    if (have.has(`${rec.start}|${slotCoreTitle(rec.title)}`)) continue;
    const span = slotMinutes(rec.start, rec.end, BOARD_DAY_START);
    if (!span) continue;
    added.push({
      start: rec.start, end: rec.end, from: span.start, to: span.end,
      kind: rec.kind || 'привычка', title: rec.title, whose: null, takes: [],
      repeat: true, done: false,
    });
  }
  const slots = [...own, ...added].sort((a, b) => a.from - b.from);
  const busy = busyMinutes(slots);
  const focus = busyMinutes(slots.filter((s) => s.kind === 'фокус'));
  return {
    date,
    weekday: wd === null ? null : RU_WEEKDAYS[wd],
    has_file: !!String(text || '').trim(),
    busy_minutes: busy,
    focus_minutes: focus,
    slots: slots.map((s) => ({
      from: s.start, to: s.end, title: s.title, kind: s.kind, repeat: s.repeat,
      whose: s.whose || null, takes: s.takes || [], done: !!s.done,
    })),
    free: freeGaps(slots),
    // Занятость машины и ребёнка идёт рядом со свободными окнами, а не вместо
    // них: арифметику свободного времени трогать нельзя — она зеркалит доску.
    resources: resourceLoad(slots),
  };
}

/**
 * Якоря — то, что повторяется из недели в неделю. Опознаются повторением, а не
 * названием: списка «дзюдо, футбол, зарядка» здесь нет и быть не должно, иначе
 * инструмент знал бы только те якоря, которые кто-то однажды перечислил.
 */
function anchorSlots(days, { minTimes = 2, minWeeks = 2 } = {}) {
  const groups = new Map();
  for (const day of days) {
    for (const slot of day.slots || []) {
      const key = slotCoreTitle(slot.title).toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { title: slotCoreTitle(slot.title), hits: [] });
      groups.get(key).hits.push({ date: day.date, weekday: day.weekday, from: slot.from, to: slot.to, repeat: slot.repeat });
    }
  }
  const out = [];
  for (const group of groups.values()) {
    const dates = [...new Set(group.hits.map((h) => h.date))];
    const weeks = new Set(dates.map((d) => weekStart(d)));
    const fromRecurring = group.hits.some((h) => h.repeat);
    if (!fromRecurring && (dates.length < minTimes || weeks.size < minWeeks)) continue;
    const times = {};
    for (const hit of group.hits) {
      const key = `${hit.from}–${hit.to}`;
      times[key] = (times[key] || 0) + 1;
    }
    const usual = Object.entries(times).sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      title: group.title,
      times: dates.length,
      weeks: weeks.size,
      weekdays: [...new Set(group.hits.map((h) => h.weekday))].filter(Boolean)
        .sort((a, b) => RU_WEEKDAY_INDEX[a] - RU_WEEKDAY_INDEX[b]),
      usual_time: usual,
      source: fromRecurring ? 'days/recurring.md' : 'повтор в днях',
    });
  }
  return out.sort((a, b) => b.times - a.times || a.title.localeCompare(b.title, 'ru'));
}

/**
 * Сводка по неделям: где плотно, где пусто и сколько дней свободны совсем.
 * Именно она отвечает на «в каком месяце уезжать», а не список из тридцати дней.
 */
function weekLoad(days) {
  const byWeek = new Map();
  for (const day of days) {
    const key = weekStart(day.date);
    if (!key) continue;
    if (!byWeek.has(key)) byWeek.set(key, { start: key, days: [], busy_minutes: 0, focus_minutes: 0, free_days: 0 });
    const week = byWeek.get(key);
    week.days.push(day.date);
    week.busy_minutes += day.busy_minutes;
    week.focus_minutes += day.focus_minutes;
    if (day.busy_minutes === 0) week.free_days += 1;
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.start.localeCompare(b.start));
  for (const week of weeks) {
    week.end = week.days[week.days.length - 1];
    // Крайние недели окна почти всегда обрезаны: у первой видно два дня, у
    // последней — четыре. Сравнивать их с целыми по сумме минут нельзя, иначе
    // «свободнее всего» достаётся огрызку недели просто потому, что в кадр
    // попало полтора дня. Полнота недели отдаётся явно, чтобы это было видно.
    week.days_count = week.days.length;
    week.full = week.days.length === 7;
  }
  return weeks;
}

/**
 * Отрезки подряд идущих полностью свободных дней. Это прямой ответ на «когда
 * можно уехать»: не «вторник свободен», а «с 11 по 14 не занято ничего».
 */
function freeStretches(days, { minDays = 2 } = {}) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= minDays) out.push({ from: run[0], to: run[run.length - 1], days: run.length });
    run = [];
  };
  for (const day of days) {
    if (day.busy_minutes === 0) run.push(day.date);
    else flush();
  }
  flush();
  return out;
}

/**
 * Отметка привычки. Формат строки — `- Название | дата, дата` — и его нельзя
 * выдумывать: ровно так его читает `parse_habits` и пишет `toggle` в
 * `board_server.py`. Разойдись на разделитель, и доска перестанет видеть
 * отметку, сделанную из чата, а тап по ячейке затрёт её своим форматом.
 */
function markHabit(text, habit, date) {
  const lines = String(text || '').split('\n');
  const needle = String(habit || '').trim().toLowerCase();
  if (!needle) throw new Error('empty_habit');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('- ') || !line.includes('|')) continue;
    const cut = line.slice(2).indexOf('|') + 2;
    const title = line.slice(2, cut).trim();
    if (!title.toLowerCase().includes(needle)) continue;
    const dates = line.slice(cut + 1).split(',').map((d) => d.trim()).filter(Boolean);
    if (dates.includes(date)) return { text: String(text), habit: title, already: true };
    const next = [...new Set([...dates, date])].sort();
    lines[i] = `- ${title} | ${next.join(', ')}`;
    return { text: lines.join('\n'), habit: title, already: false };
  }
  throw new Error(`habit_not_found:${habit}`);
}

/** Снять дату у привычки. Повтор без этой даты — already. */
function unmarkHabit(text, habit, date) {
  const lines = String(text || '').split('\n');
  const needle = String(habit || '').trim().toLowerCase();
  if (!needle) throw new Error('empty_habit');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('- ') || !line.includes('|')) continue;
    const cut = line.slice(2).indexOf('|') + 2;
    const title = line.slice(2, cut).trim();
    if (!title.toLowerCase().includes(needle)) continue;
    const dates = line.slice(cut + 1).split(',').map((d) => d.trim()).filter(Boolean);
    if (!dates.includes(date)) return { text: String(text), habit: title, already: true };
    const next = dates.filter((d) => d !== date);
    lines[i] = next.length ? `- ${title} | ${next.join(', ')}` : `- ${title} |`;
    return { text: lines.join('\n'), habit: title, already: false };
  }
  throw new Error(`habit_not_found:${habit}`);
}

/**
 * Порядок важности в «Требует решения» — зеркало build_board.py stKind().
 * Признаки механические: срок/слот сегодня → важное; «А или Б» / «… ли» → быстро;
 * остальное — ответ надо составить самому.
 */
const DECIDE_RX_TODAY = /сегодня|сегодняшн/i;
const DECIDE_RX_FORK = /(?:^|[\s(])или(?=$|[\s,.?!)])/i;
const DECIDE_RX_YESNO = /(?:^|[\s(])ли(?=$|[\s,.?!)])|да\s*\/\s*нет/i;

function todaySlotRefsFromText(text) {
  const refs = new Set();
  for (const line of String(text || '').split('\n')) {
    const slot = parseSlotRef(line);
    if (slot?.ref) refs.add(`${slot.ref.project}/${slot.ref.hash}`);
  }
  return refs;
}

function decideKind(row, { today, slotRefs }) {
  // Открывшееся окно приравнено к наступившему сроку: у задачи «в начале
  // недели» крайний срок стоит на среде, и до среды она бы в «Требует решения»
  // не попадала вовсе.
  const due = row.signal || row.due || '';
  const plain = row.plain || '';
  const ref = row.ref || '';
  if ((due && due <= today) || row.overdue || (ref && slotRefs.has(ref)) || DECIDE_RX_TODAY.test(plain)) {
    return 'hot';
  }
  return DECIDE_RX_FORK.test(plain) || DECIDE_RX_YESNO.test(plain) ? 'quick' : 'rest';
}

function formatDecideRow(row) {
  if (row.source === 'open') return `${row.ref} · ${row.plain} (${row.title})`;
  return `${row.ref} · ${row.title}`;
}

/**
 * Собирает «Требует решения» как доска: #blocked — отдельные строки, каждый
 * «открыто:» — своя строка, затем группировка hot → quick → rest.
 */
function buildDecideGroups({ blockedTasks, openQuestions, today, dayText }) {
  const slotRefs = todaySlotRefsFromText(dayText);
  const rows = [];

  for (const task of blockedTasks || []) {
    if (!task.tags.some((t) => t.toLowerCase() === 'blocked')) continue;
    const back = taskBackDate(task.children, { today });
    if (back && back > today) continue;
    rows.push({
      ref: task.ref,
      title: task.title,
      plain: task.title,
      due: task.due || null,
      // Задача с окном становится горячей, когда окно открылось, а не когда
      // истекает крайний срок: решать её надо внутри окна.
      signal: taskSignalDate(task),
      window: taskWindow(task.children),
      overdue: !!(task.due && task.due < today),
      source: 'blocked',
      task,
    });
  }

  for (const q of openQuestions || []) {
    if (q.done) continue;
    if (q.back && q.back > today) continue;
    rows.push({
      ref: q.ref,
      title: q.task,
      plain: q.question,
      due: q.due || null,
      signal: q.signal || null,
      window: q.window || null,
      overdue: !!(q.due && q.due < today),
      source: 'open',
      question: q.question,
      task: q.task,
    });
  }

  const grouped = { hot: [], quick: [], rest: [], all: rows };
  for (const row of rows) grouped[decideKind(row, { today, slotRefs })].push(row);
  return grouped;
}

/** Текст блока «Требует решения» для tasks_standup — порядок как на доске. */
function renderDecideStandupBlock(grouped, cap = STANDUP_GROUP_CAP) {
  const sections = [
    ['важное', 'hot'],
    ['быстро решается', 'quick'],
    ['остальное', 'rest'],
  ];
  const parts = [];
  let hidden = 0;
  for (const [name, key] of sections) {
    const all = grouped[key];
    if (!all.length) continue;
    const shown = all.slice(0, cap);
    hidden += all.length - shown.length;
    const tail = all.length > cap ? ` (и ещё ${all.length - cap})` : '';
    parts.push(`${name}${tail}:\n${shown.map((r) => `- ${formatDecideRow(r)}`).join('\n')}`);
  }
  if (!parts.length) return null;
  const headMore = hidden ? ` (ещё ${hidden} не показываю)` : '';
  return `Требует решения${headMore}:\n\n${parts.join('\n\n')}`;
}

function decideGroupsShown(grouped, cap = STANDUP_GROUP_CAP) {
  const pick = (key) => grouped[key].slice(0, cap);
  return {
    hot: pick('hot'),
    quick: pick('quick'),
    rest: pick('rest'),
    all: [...pick('hot'), ...pick('quick'), ...pick('rest')],
  };
}

// ── Планёрка ─────────────────────────────────────────────────────────────
//
// Утро начинается не с чтения всего задачника, а с повестки: что висит, что он
// сам просил обсудить, где данные разошлись. Своего хранилища у планёрки нет и
// быть не должно — почти всё она собирает из уже существующих разборов. Своё у
// неё ровно одно: список того, что он в разговоре отложил «до планёрки».
//
// Список живёт обычным файлом задачника, как предпочтения и голоса. Скрытое
// состояние здесь не годится: пункт, который нельзя прочитать глазами и
// вычеркнуть, через неделю становится чужой памятью о его словах. Снятый пункт
// остаётся в файле галочкой — так видно, что обсудили, и повестка его больше
// не поднимает.

const STANDUP_PATH = 'docs/standup.md';
const STANDUP_SECTION = '## На планёрку';
const STANDUP_OBSERVED_SECTION = '## Замечено';

/** Сколько пунктов показывать в одной группе повестки. */
const STANDUP_GROUP_CAP = 5;

/**
 * Сколько замеченного можно держать открытым одновременно.
 *
 * Потолок здесь жёстче, чем у остальных групп, и это не про длину списка.
 * Механическое расхождение доказано арифметикой, а замеченное — догадка, за
 * подтверждением которой идут к человеку. Три догадки за утро он разберёт;
 * десять превращают планёрку в допрос, после которого перестают отвечать и на
 * верные.
 */
const STANDUP_OBSERVE_CAP = 3;

/** С какого возраста обещание «ждём:» считается зависшим. */
const STANDUP_STALE_DAYS = 10;

/**
 * Категория пункта повестки. Он решил 05.08: показывать планёрку двумя
 * отдельными блоками, а не общим списком — «Разработка» (доска, окно
 * планёрки, коннектор, стенограмма — то, что чинится или улучшается кодом) и
 * «Общее» (всё остальное). Признак — предмет разговора, а не то, чем пункт
 * закрывается: «Быстро заказать» про покупки, а не про доску, поэтому он
 * общий, хотя реализуется кодом. Категорию определяет модель, не текстовый
 * поиск по ключевым словам — угадать «разработку» по словам ненадёжнее, чем
 * дать это судить тому, кто читал разговор целиком.
 */
const STANDUP_CATEGORIES = ['разработка', 'общее'];

/**
 * Приоритет пункта повестки, решено 05.08: если у пункта есть явный приоритет
 * — берём его, иначе — приоритет связанной задачи (ref, найденный по тексту
 * пункта), иначе P2 по умолчанию, как у обычных задач. Явный приоритет пишем
 * в строку меткой `[P1]`/`[P3]` только когда его назвали — P2 молчаливый,
 * чтобы не захламлять строку меткой, которая ничего не меняет для читателя.
 */
const STANDUP_DEFAULT_PRIORITY = 'P2';
const STANDUP_PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 };

/** Первая ссылка вида «проект/хэш» в тексте пункта — источник приоритета по умолчанию. */
const STANDUP_REF_RE = /\b([a-zа-я][a-zа-я0-9]*)\/([0-9a-f]{6})\b/i;

function standupItemRef(text) {
  const match = STANDUP_REF_RE.exec(String(text || ''));
  return match ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}` : null;
}

/**
 * Тема (сессия) пункта повестки — решено 05.08: он садится за ноутбук не по
 * одному пункту, а пачкой вокруг одной зоны кода или темы («PWA доски»,
 * «механика повестки»). Свободный текст, не список — тем будет столько,
 * сколько реально наберётся, а не заранее заданный enum. Пишется меткой
 * `[тема:Имя]`, а не отдельным префиксом типа category, чтобы не путать с
 * `[разработка]`/`[P1]` при разборе.
 */
const STANDUP_SESSION_RE = /^\[тема:([^\]]+)\]\s*(.*)$/;

function standupLine({
  date, topic, note = null, category = null, priority = null, session = null,
}) {
  const cat = category && STANDUP_CATEGORIES.includes(category) ? `[${category}] ` : '';
  const pr = priority && /^P[123]$/.test(priority) ? `[${priority}] ` : '';
  const ses = session && String(session).trim() ? `[тема:${String(session).trim()}] ` : '';
  return `- [ ] ${date} · ${cat}${pr}${ses}${topic}${note ? ` — ${note}` : ''}`;
}

/**
 * Границы раздела файла: от строки после заголовка до следующего заголовка.
 * Пункты повестки и замеченное не должны смешиваться, идеи в `## Идеи` — не
 * заезжать в `## Задачи` соседнего раздела.
 */
function sectionRange(lines, section) {
  const start = findSectionLine(lines, section);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) { end = i; break; }
  }
  return { start: start + 1, end };
}

const STANDUP_HEAD_RE = /^-\s*\[([ xX])\]\s*(\d{4}-\d{2}-\d{2})\s*·\s*(.+)$/;

/**
 * Пункты повестки из файла. Формат тот же, что у задач: галочка спереди, чтобы
 * он мог снять пункт руками в markdown, не открывая чат.
 */
function parseStandupItems(file, { section = STANDUP_SECTION } = {}) {
  const out = [];
  const lines = String((file && file.text) || '').split('\n');
  const range = sectionRange(lines, section);
  if (!range) return out;
  for (let i = range.start; i < range.end; i += 1) {
    const match = STANDUP_HEAD_RE.exec(lines[i].trim());
    if (!match) continue;
    let body = match[3].trim();
    // Категория — необязательный маркер `[разработка]`/`[общее]` перед темой.
    // Пункты без маркера (заведённые до 05.08) читаются как «общее»: старая
    // формулировка молчала про доску и планёрку, значит по умолчанию не про них.
    let category = null;
    const catMatch = /^\[(разработка|общее)\]\s*(.*)$/.exec(body);
    if (catMatch) { category = catMatch[1]; body = catMatch[2]; }
    // Приоритет — необязательный маркер `[P1]`/`[P3]` сразу после категории,
    // решено 05.08. Без маркера приоритет не «пустой», а вычисляется читателем
    // (tasks-tools) из ref или дефолта — здесь только то, что названо явно.
    let priority = null;
    const prMatch = /^\[(P[123])\]\s*(.*)$/.exec(body);
    if (prMatch) { priority = prMatch[1]; body = prMatch[2]; }
    // Тема — необязательный маркер `[тема:Имя]` сразу после приоритета,
    // решено 05.08: садится за ноутбук пачкой по одной зоне, а не по пункту.
    let session = null;
    const seMatch = STANDUP_SESSION_RE.exec(body);
    if (seMatch) { session = seMatch[1].trim(); body = seMatch[2]; }
    const split = body.lastIndexOf(' — ');
    out.push({
      line: i,
      done: match[1].toLowerCase() === 'x',
      date: match[2],
      category: category || 'общее',
      priority,
      session,
      ref: standupItemRef(body),
      topic: (split === -1 ? body : body.slice(0, split)).trim(),
      note: split === -1 ? null : body.slice(split + 3).trim(),
    });
  }
  return out;
}

/**
 * Приоритет пункта для сортировки повестки. Порядок решён 05.08: явный
 * маркер побеждает всегда (можно вручную поднять важность обсуждения выше
 * приоритета самой задачи), иначе берём приоритет задачи по ref, иначе P2.
 * `priorityByRef` — карта `проект/хэш → P1|P2|P3`, считает её вызывающий
 * код по уже прочитанным файлам проектов, здесь только выбор источника.
 */
function standupEffectivePriority(item, priorityByRef = {}) {
  if (item.priority) return item.priority;
  if (item.ref && priorityByRef[item.ref]) return priorityByRef[item.ref];
  return STANDUP_DEFAULT_PRIORITY;
}

/** Сортировка списка пунктов повестки по приоритету, устойчивая — при равном приоритете порядок (по дате добавления) не меняется. */
function sortStandupByPriority(list, priorityByRef = {}) {
  return [...list].sort((a, b) => (
    STANDUP_PRIORITY_ORDER[standupEffectivePriority(a, priorityByRef)]
    - STANDUP_PRIORITY_ORDER[standupEffectivePriority(b, priorityByRef)]
  ));
}

/**
 * Замеченное: то, что нашлось не арифметикой, а по смыслу.
 *
 * Разрешено это ровно на одном условии — наблюдение выносится вопросом с
 * обеими сторонами цитатами, а его ответ записывается тут же и навсегда
 * закрывает тему. Иначе цена ошибочного наблюдения перестаёт быть одним
 * вопросом и становится ежедневной придиркой.
 *
 * Стороны лежат вложенными строками, как контекст задачи: человек читает их
 * глазами в markdown и за секунду видит, кто прав.
 */
function observationBlock({ date, question, sides = [] }) {
  return [`- [ ] ${date} · ${question}`, ...sides.map((side) => `  - ${side}`)].join('\n');
}

function parseStandupObservations(file) {
  const lines = String((file && file.text) || '').split('\n');
  const range = sectionRange(lines, STANDUP_OBSERVED_SECTION);
  const out = [];
  if (!range) return out;
  let current = null;
  for (let i = range.start; i < range.end; i += 1) {
    const raw = lines[i];
    if (!/^\s/.test(raw)) {
      const head = STANDUP_HEAD_RE.exec(raw.trim());
      if (head) {
        current = {
          line: i,
          done: head[1].toLowerCase() === 'x',
          date: head[2],
          question: head[3].trim(),
          sides: [],
          answer: null,
        };
        out.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (!current || !raw.trim()) continue;
    const text = raw.trim().replace(/^[-*]\s+/, '');
    const answered = /^ответ:\s*(.*)$/i.exec(text);
    if (answered) current.answer = answered[1].trim();
    else current.sides.push(text);
  }
  return out;
}

/**
 * Снять строку с галочкой: галочка, а не удаление — снятое видно в файле.
 * Одна на все списки с `- [ ]`: повестка, замеченное, напоминания.
 */
function markLineDone(text, index, done = true) {
  const lines = String(text || '').split('\n');
  if (index < 0 || index >= lines.length) throw new Error(`line_out_of_range:${index}`);
  const next = lines[index].replace(/\[[ xX]\]/, done ? '[x]' : '[ ]');
  if (next === lines[index]) throw new Error(`line_not_item:${index}`);
  lines[index] = next;
  return lines.join('\n');
}

/** Снять пункт повестки. */
function markStandupDone(text, index, done = true) {
  return markLineDone(text, index, done);
}

/**
 * Сменить категорию пункта повестки, не трогая topic/note/priority/session.
 * «общее» пишется без маркера (молчаливый дефолт); «разработка» — с `[разработка]`.
 */
function setStandupCategory(text, index, category) {
  if (!STANDUP_CATEGORIES.includes(category)) {
    throw new Error(`invalid_category:${category}`);
  }
  const lines = String(text || '').split('\n');
  if (index < 0 || index >= lines.length) throw new Error(`standup_line_out_of_range:${index}`);
  const items = parseStandupItems({ text: String(text || '') });
  const item = items.find((i) => i.line === index);
  if (!item) throw new Error(`standup_item_not_found:${index}`);
  lines[index] = standupLine({
    date: item.date,
    topic: item.topic,
    note: item.note || undefined,
    category: category === 'разработка' ? 'разработка' : null,
    priority: item.priority || undefined,
    session: item.session || undefined,
  });
  return lines.join('\n');
}

/**
 * Ответ на замеченное. Пишется вложенной строкой рядом с самим наблюдением и
 * закрывает его галочкой: наблюдение, на которое ответили «это нормально»,
 * обязано замолчать насовсем, а не всплыть через неделю другими словами.
 */
function answerObservation(text, index, answer) {
  const said = String(answer || '').trim();
  if (!said) throw new Error('empty_answer');
  return appendChild(markStandupDone(text, index), index, `ответ: ${said}`);
}

/**
 * Уже спрашивали ли про это. Мера и порог — те же, что у развилок доски:
 * своя третья проверка схожести разошлась бы с ними на первой же правке.
 *
 * Сравнивается наблюдение целиком — вопрос вместе со сторонами, — а не одна
 * формулировка вопроса. Причина проверялась на живом случае: одно и то же
 * расхождение, пересказанное другими словами, набирало 0.58 и проходило мимо
 * порога, хотя ссылалось на те же две строки в тех же двух файлах. Наблюдение
 * — это вопрос И его опора; по опоре повтор виден там, где формулировка уже
 * разошлась.
 *
 * Перекос намеренный: спорная пара скорее промолчит, чем спросит второй раз.
 * Владелец согласился платить за наблюдение одним вопросом, а не двумя, и
 * лишний повтор обесценивает механизм быстрее, чем пропущенная догадка.
 */
function observationText({ question, sides = [] }) {
  return [String(question || ''), ...(sides || []).map(String)].join(' ');
}

function knownObservation(existing, observation, { threshold = DECISION_SIMILARITY } = {}) {
  const wanted = observationText(
    typeof observation === 'string' ? { question: observation } : observation,
  );
  let best = null;
  for (const entry of existing) {
    const score = questionSimilarity(wanted, observationText(entry));
    if (score >= threshold && (!best || score > best.score)) best = { ...entry, score: Math.round(score * 100) / 100 };
  }
  return best;
}

// ── Напоминания ──────────────────────────────────────────────────────────
//
// Единственная новая сущность за всю эту тройку, и заводится она потому, что
// её нечем подменить: в задачнике нет ничего, что само дёрнет в нужный день.
// Задача — это то, что делают; напоминание — то, о чём вспоминают, и разница
// не словесная. Задача с датой попадает в загруженность, в фокус и в счёт
// «сколько на мне висит»; «поздравить брата» ничего из этого не значит и,
// оказавшись задачей, только разбавляет список настоящей работы.
//
// Повод показать напоминание — приход человека на доску, а не наступивший
// час: расписание из задачника убрано намеренно. Поэтому в файле лежит день,
// а не таймер, и просроченное не пропадает, а поднимается наверх.
//
// Файл обычный markdown: он читается и правится руками, как повестка и
// предпочтения. Снятое остаётся галочкой — так видно, что было.

const REMINDERS_PATH = 'docs/reminders.md';
const REMINDERS_SECTION = '## Напоминания';

/**
 * Шапка файла — пишется один раз, в пустой файл. Сам раздел заводит вставка:
 * так у него получаются те же отбивки, что у повестки и предпочтений.
 */
const REMINDERS_HEADER = [
  '# Напоминания',
  '',
  'О чём вспомнить в конкретный день. Это не задачи: напоминание не делают,',
  'о нём вспоминают, поэтому в проекте ему места нет и в загруженность оно не',
  'входит. Всплывает при открытии доски, а не по часам.',
  '',
  'Формат строки: `- [ ] ГГГГ-ММ-ДД ЧЧ:ММ · текст`, время можно опустить.',
  'Снятое помечается `[x]` и остаётся в файле.',
  '',
].join('\n');

const REMINDER_RE = /^-\s*\[([ xX])\]\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*·\s*(.+)$/;

function reminderLine({ date, time = null, text }) {
  return `- [ ] ${date}${time ? ` ${padTime(time)}` : ''} · ${String(text).trim()}`;
}

function parseReminders(file) {
  const out = [];
  const lines = String((file && file.text) || '').split('\n');
  const range = sectionRange(lines, REMINDERS_SECTION);
  if (!range) return out;
  for (let i = range.start; i < range.end; i += 1) {
    const match = REMINDER_RE.exec(lines[i].trim());
    if (!match) continue;
    out.push({
      line: i,
      done: match[1].toLowerCase() === 'x',
      date: match[2],
      time: match[3] ? padTime(match[3]) : null,
      text: match[4].trim(),
    });
  }
  return out;
}

/**
 * Активные напоминания в том порядке, в каком их читают: просроченное сверху,
 * потом сегодняшнее, потом будущее. Внутри дня — по времени, безвременное
 * первым: у него нет часа, и ждать от него очереди не за чем.
 */
function activeReminders(reminders, { today = null } = {}) {
  return reminders
    .filter((r) => !r.done)
    .map((r) => ({
      ...r,
      overdue: Boolean(today && r.date < today),
      today: Boolean(today && r.date === today),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      || String(a.time || '').localeCompare(String(b.time || ''))
      || a.line - b.line);
}

// ── Идеи ─────────────────────────────────────────────────────────────────
//
// Раздел `## Идеи` в projects/someday.md существовал и до этого — пустым.
// Место было, в него не клали, потому что не было чем.
//
// Идея отличается от «когда-нибудь» не сроком, а тем, что её развивают: к ней
// дописывают мысли, и однажды она либо становится задачей проекта, либо
// отмирает. Поэтому у неё есть вложенные строки, как контекст у задачи, и
// поэтому при превращении в задачу они переезжают вместе с ней: без них
// остаётся голый заголовок, а всё, что он про эту идею надумал, теряется.
//
// Галочки у идеи нет намеренно. Идею не закрывают — её продвигают; галочка
// звала бы отметить сделанным то, чего никто не делал, и заодно втащила бы
// идеи во все разборы задач, которые ищут строки `- [ ]`.

const SOMEDAY_PATH = 'projects/someday.md';
const IDEAS_SECTION = '## Идеи';

const IDEA_RE = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*(.+)$/;

function ideaLine({ date, text }) {
  return `- ${date} · ${String(text).trim()}`;
}

/** Идеи вместе с накопленными под ними мыслями. */
function parseIdeas(file) {
  const out = [];
  const lines = String((file && file.text) || '').split('\n');
  const range = sectionRange(lines, IDEAS_SECTION);
  if (!range) return out;
  let current = null;
  for (let i = range.start; i < range.end; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) { current = null; continue; }
    if (/^\s/.test(raw)) {
      if (current) current.notes.push(raw.trim().replace(/^[-*]\s+/, ''));
      continue;
    }
    const match = IDEA_RE.exec(raw.trim());
    if (!match) { current = null; continue; }
    current = { line: i, date: match[1], text: match[2].trim(), notes: [] };
    out.push(current);
  }
  return out;
}

// ── Расхождения ──────────────────────────────────────────────────────────
//
// Самое ценное на планёрке и самое опасное место в коде. Разошедшиеся данные
// копятся молча: задачу «свести расписание» удалили как решённую, а сами дни не
// поменяли. Но искать расхождения «по смыслу» нельзя — сравнение текста журнала
// с содержимым дней это не проверка, а догадка, и одна выдуманная нестыковка
// обесценит весь список.
//
// Поэтому здесь только то, что сходится или не сходится арифметически: ссылка
// ведёт или не ведёт в живую задачу, срок прошёл или нет, два слота пересеклись
// или нет. Ни одного правила вида «похоже, тут противоречие».

/** Порядок групп в выдаче: спор данных важнее просто просроченного срока. */
const DIVERGENCE_ORDER = [
  'слот без задачи',
  'слот на закрытую задачу',
  'слоты пересеклись',
  'ссылка в никуда',
  'висит без вопроса',
  'срок прошёл',
];

const DAY_FILE_RE = /^days\/(\d{4}-\d{2}-\d{2})\.md$/i;

/**
 * Места, где данные задачника спорят сами с собой.
 *
 * @param {Array} files файлы задачника: проекты и дни
 * @param {string} today сегодняшняя дата — прошлые дни не проверяются вовсе:
 *   слот на закрытую задачу вчера означает «сделали», а не расхождение.
 */
function findDivergences(files, { today = null } = {}) {
  const all = (files || []).filter((f) => f && typeof f.text === 'string' && f.text);
  const projects = all.filter((f) => /^projects\//i.test(f.path || ''));
  const out = [];

  // 1–2. Слот дня ведёт в задачу, которой нет или которая уже закрыта.
  // 3. Два слота одного дня пересеклись так, что движок зовёт это конфликтом.
  for (const file of all) {
    const match = DAY_FILE_RE.exec(file.path || '');
    if (!match) continue;
    const date = match[1];
    if (today && date < today) continue;

    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i].trim();
      if (/^-?\s*\[x\]/i.test(raw)) continue; // состоявшееся событие не расхождение
      const slot = parseSlotRef(lines[i]);
      if (!slot) continue;
      const ref = `${slot.ref.project}/${slot.ref.hash}`;
      const target = findTaskByAddress(projects, slot.ref);
      if (!target) {
        out.push({
          kind: 'слот без задачи',
          date,
          path: file.path,
          line: i + 1,
          ref,
          what: `${date} ${slot.from}–${slot.to} «${slot.title}» ссылается на ${ref}, а такой задачи нет`,
        });
      } else if (target.done) {
        out.push({
          kind: 'слот на закрытую задачу',
          date,
          path: file.path,
          line: i + 1,
          ref,
          what: `${date} ${slot.from}–${slot.to} «${slot.title}» стоит под ${ref} «${target.title}», а задача уже закрыта`,
        });
      }
    }

    const slots = parseSlots(file.text).filter((s) => !s.done);
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        if (slots[a].from >= slots[b].to || slots[a].to <= slots[b].from) continue;
        if (slotClashLevel(slots[a].kind, slots[b].kind) !== 'конфликт') continue;
        out.push({
          kind: 'слоты пересеклись',
          date,
          path: file.path,
          line: slots[b].line + 1,
          ref: null,
          what: `${date}: «${slotPlainTitle(slots[a].title)}» ${slots[a].start}–${slots[a].end} и «${slotPlainTitle(slots[b].title)}» ${slots[b].start}–${slots[b].end} стоят одновременно`,
        });
      }
    }
  }

  // 4. Задача висит в «Требует решения», а спрашивать нечего: строку «открыто:»
  // сняли руками, тег остался. На доске она занимает место вопроса, которого нет.
  // Обратную сторону — «открыто:» без тега — здесь не ищем намеренно: такие
  // задачи повестка и так показывает в группе «требует решения», и второй раз
  // тот же список читать не станут.
  for (const file of projects) {
    for (const task of parseTasks(file)) {
      if (task.done) continue;
      if (!task.tags.some((t) => t.toLowerCase() === 'blocked')) continue;
      if (task.children.some((c) => /^открыто:/i.test(c))) continue;
      out.push({
        kind: 'висит без вопроса',
        date: null,
        path: file.path,
        line: task.line,
        ...taskAddress(file.path, task.title),
        what: `«${task.title}» помечена #blocked, но ни одного «открыто:» под ней нет`,
      });
    }
  }

  // 5. Ссылка «см:» ведёт в задачу, которой больше нет. Слоты сюда не попадают:
  // они уже проверены выше и попали бы вторым пунктом про то же самое.
  for (const link of collectLinks(projects)) {
    if (!link.from.project || !link.from.hash) continue;
    if (findTaskByAddress(projects, link.to)) continue;
    const ref = `${link.to.project}/${link.to.hash}`;
    out.push({
      kind: 'ссылка в никуда',
      date: null,
      path: link.from.path,
      line: link.from.line,
      ref,
      from: `${link.from.project}/${link.from.hash}`,
      what: `«${link.from.title}» ссылается на ${ref}, а такой задачи нет`,
    });
  }

  // 6. Срок прошёл, отметки нет. Стоит последним: просрочки всегда больше, чем
  // споров в данных, и без порядка она вытеснила бы их из-под потолка группы.
  if (today) {
    for (const file of projects) {
      for (const task of parseTasks(file)) {
        if (task.done || !task.due || task.due >= today) continue;
        out.push({
          kind: 'срок прошёл',
          date: task.due,
          path: file.path,
          line: task.line,
          ...taskAddress(file.path, task.title),
          what: `«${task.title}» — срок ${task.due} прошёл, отметки нет`,
        });
      }
    }
  }

  const rank = (kind) => {
    const at = DIVERGENCE_ORDER.indexOf(kind);
    return at === -1 ? DIVERGENCE_ORDER.length - 1 : at;
  };
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || String(a.date || '').localeCompare(String(b.date || '')));
}

/**
 * Зависшие обещания: строки «ждём:» и «при встрече:» старше порога.
 *
 * Возраст берётся из хвоста «с ГГГГ-ММ-ДД», если он есть, иначе из даты
 * заведения задачи. Обещание без обеих дат возраста не имеет — и зависшим его
 * называть нечем, поэтому оно сюда не попадает вовсе.
 */
function stuckPromises(files, { today = null, staleDays = STANDUP_STALE_DAYS } = {}) {
  if (!today) return [];
  const projects = (files || []).filter((f) => f && /^projects\//i.test(f.path || ''));
  const out = [];
  for (const file of projects) {
    for (const task of parseTasks(file)) {
      if (task.done) continue;
      for (const child of task.children) {
        const match = /^(ждём|при встрече):\s*(.*)$/i.exec(child);
        if (!match) continue;
        const since = /(?:^|\s)с\s+(\d{4}-\d{2}-\d{2})/.exec(match[2]);
        const started = since ? since[1] : task.created;
        if (!started || !/^\d{4}-\d{2}-\d{2}$/.test(started)) continue;
        const age = Math.floor((dateToMs(today) - dateToMs(started)) / DAY_MS);
        if (!Number.isFinite(age) || age < staleDays) continue;
        out.push({
          path: file.path,
          line: task.line,
          ...taskAddress(file.path, task.title),
          task: task.title,
          kind: match[1].toLowerCase(),
          text: match[2],
          since: started,
          days: age,
        });
      }
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

// ── План и факт ──────────────────────────────────────────────────────────
//
// Единственный факт, который в задачнике действительно есть, — состоялось или
// нет. Фактической длительности нет вовсе: галочка не запоминает, во сколько
// дело началось на самом деле и когда кончилось. Считать «уборка заняла три
// часа» здесь не из чего, и подставлять сюда плановые часы значило бы выдать
// план за факт — то есть сравнить план с самим собой.
//
// Факт читается только с закрытых дней. Слот без галочки в закрытом дне — это
// «не состоялось», в незакрытом — «неизвестно»: там просто никто не отмечал.
//
// Порог в три случая выбран арифметикой, а не на глаз. Если исход случаен, как
// монета, три одинаковых подряд выпадают в одном случае из восьми, два — в
// каждом четвёртом. То есть один сорванный слот не значит ничего, два — почти
// ничего, а на трёх «не состоялось» уже дешевле спросить, чем молчать. Ждать
// четырёх при двух десятках закрытых дней значит не сработать никогда.

const PLAN_FACT_MIN_CASES = 3;
/** Доля срывов, ниже которой это не закономерность, а обычный разброс. */
const PLAN_FACT_MIN_SHARE = 0.6;
/** Насколько далеко назад смотрим: дальше это уже не «сейчас так живётся». */
const PLAN_FACT_WINDOW_DAYS = 60;

/**
 * Повторяющиеся расхождения плана с фактом по закрытым дням.
 *
 * Возвращает только счёт состоявшегося и несостоявшегося — ничего про
 * длительность, потому что её взять неоткуда.
 */
function planFactPatterns(files, {
  today = null,
  minCases = PLAN_FACT_MIN_CASES,
  minShare = PLAN_FACT_MIN_SHARE,
  windowDays = PLAN_FACT_WINDOW_DAYS,
} = {}) {
  if (!today) return [];
  const from = shiftDate(today, -windowDays);
  const byTitle = new Map();
  for (const file of files || []) {
    const found = /^days\/(\d{4}-\d{2}-\d{2})\.md$/i.exec(String(file.path || ''));
    if (!found) continue;
    const date = found[1];
    if (date > today || date < from) continue;
    // Незакрытый день фактом не является: там не «не состоялось», а «не смотрели».
    if (!dayNote(file.text)) continue;
    for (const slot of parseSlots(file.text)) {
      const title = slotCoreTitle(slot.title);
      const key = title.toLowerCase();
      if (!key) continue;
      if (!byTitle.has(key)) byTitle.set(key, { title, planned: 0, happened: 0, missed: 0, days: [] });
      const acc = byTitle.get(key);
      acc.planned += 1;
      if (slot.done) acc.happened += 1;
      else { acc.missed += 1; acc.days.push(date); }
    }
  }
  const out = [];
  for (const acc of byTitle.values()) {
    if (acc.missed < minCases) continue;
    const share = acc.missed / acc.planned;
    if (share < minShare) continue;
    out.push({ ...acc, share: Math.round(share * 100) / 100, days: acc.days.slice(-5) });
  }
  return out.sort((a, b) => b.missed - a.missed || String(a.title).localeCompare(String(b.title)));
}

/** Как расхождение звучит вопросом к нему. Утверждать тут нечего: причину знает он. */
function planFactQuestion(pattern) {
  return `«${pattern.title}» стоит в плане, но в закрытых днях не состоялось ${pattern.missed} раз из ${pattern.planned} — план неверный или отмечать забываем?`;
}

function planFactSides(pattern) {
  return [
    `план: ${pattern.title} — ${pattern.planned} раз в закрытых днях`,
    `факт: состоялось ${pattern.happened}, без отметки ${pattern.missed}${pattern.days.length ? ` (${pattern.days.join(', ')})` : ''}`,
  ];
}

/** Порог ротации активного файла — с запасом под JSON-обёртку RPC (256 КБ). */
const TASKS_ROTATE_TARGET_BYTES = 180 * 1024;
/**
 * Полная запись через batch_upsert не должна приближаться к лимиту тела запроса.
 * Тело кураторского batch_upsert принимается до 1 МБ (heys-api-rpc/index.js), и
 * этот порог держит запас под JSON-обёртку. Поднят с 240 КБ 20.08: projects/heys.md
 * пишется целиком, дельта-записи у projects/ нет, и на 157 тыс. символов проект
 * встал в read-only — не проходили ни новые задачи, ни правки существующих.
 */
const TASKS_WRITE_PAYLOAD_LIMIT = 960 * 1024;

function utf8ByteLength(text) {
  return Buffer.byteLength(String(text || ''), 'utf8');
}

function isDeltaWritablePath(path) {
  const clean = normalizePath(path);
  if (!clean) return false;
  return /^transcript\/\d{4}-\d{2}-\d{2}\.md$/i.test(clean)
    || /^journal\/\d{4}-\d{2}\.md$/i.test(clean);
}

function rotatableKind(path) {
  const clean = normalizePath(path);
  if (!clean) return null;
  if (/^transcript\//i.test(clean)) return 'transcript';
  if (/^journal\//i.test(clean)) return 'journal';
  return null;
}

const TRANSCRIPT_BLOCK_HEADING_RE = /^##\s*~?\d{1,2}:\d{2}(\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/;
const JOURNAL_BLOCK_HEADING_RE = /^##\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;

function splitMarkdownBlocks(text, headingRe) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let current = [];
  let seenHeading = false;
  for (const line of lines) {
    if (headingRe.test(line.trim())) {
      seenHeading = true;
      if (current.length) blocks.push(current.join('\n').replace(/\s+$/, ''));
      current = [line];
    } else if (seenHeading) {
      current.push(line);
    } else if (line.trim()) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n').replace(/\s+$/, ''));
  return blocks.filter((b) => b.trim());
}

/** Минуты от полуночи для сортировки блоков стенограммы (ночь 00:00–04:59 — после вечера). */
function transcriptBlockSortMinutes(block) {
  const heading = String(block || '').split('\n').find((line) => TRANSCRIPT_BLOCK_HEADING_RE.test(line.trim()));
  if (!heading) return null;
  const match = TRANSCRIPT_ENTRY_RE.exec(heading.trim());
  if (!match) return null;
  const start = match[1].split(/[–—-]/)[0].trim().replace(/^~/, '');
  const minutes = timeToMinutes(start);
  if (minutes === null) return null;
  return minutes < DAY_TAIL_BEFORE ? minutes + 24 * 60 : minutes;
}

/** Выровнять блоки стенограммы по времени заголовка; без времени — порядок как был. */
function sortTranscriptChronologically(text) {
  const blocks = splitMarkdownBlocks(text, TRANSCRIPT_BLOCK_HEADING_RE);
  if (blocks.length <= 1) return String(text || '').replace(/\s+$/, '') ? `${String(text).replace(/\s+$/, '')}\n` : '';
  const indexed = blocks.map((block, index) => ({
    block,
    index,
    sortKey: transcriptBlockSortMinutes(block),
  }));
  const allKeyed = indexed.every((entry) => entry.sortKey !== null);
  if (!allKeyed) return String(text || '').replace(/\s+$/, '') ? `${String(text).replace(/\s+$/, '')}\n` : '';
  indexed.sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);
  return `${indexed.map((entry) => entry.block).join('\n\n')}\n`;
}

function archiveRotatePath(sourcePath, part) {
  const base = String(sourcePath || '').replace(/\.md$/i, '').replace(/\//g, '_');
  return `archive/${base}_part${part}.md`;
}

/**
 * Урезать переполненный transcript/journal: старое — в archive/*_partN.md,
 * активный ключ остаётся ниже TASKS_ROTATE_TARGET_BYTES.
 */
function rotateFileText(path, text) {
  const kind = rotatableKind(path);
  const raw = String(text || '');
  if (!kind || utf8ByteLength(raw) <= TASKS_ROTATE_TARGET_BYTES) {
    return { active: raw, archives: [] };
  }
  const headingRe = kind === 'transcript' ? TRANSCRIPT_BLOCK_HEADING_RE : JOURNAL_BLOCK_HEADING_RE;
  let blocks = splitMarkdownBlocks(raw, headingRe);
  if (blocks.length <= 1) {
    return { active: raw, archives: [] };
  }
  const archives = [];
  let part = 1;
  while (utf8ByteLength(blocks.join('\n\n')) > TASKS_ROTATE_TARGET_BYTES && blocks.length > 1) {
    // transcript и journal: старые блоки сверху, свежие внизу — в архив уходит начало.
    const moved = blocks.shift();
    if (!moved || !moved.trim()) break;
    archives.push({ path: archiveRotatePath(path, part), text: `${moved.trim()}\n` });
    part += 1;
  }
  const active = blocks.join('\n\n').trim();
  return { active: active ? `${active}\n` : '', archives };
}

function estimateWritePayloadBytes(path, text) {
  const fileObj = bumpFile(emptyFile(path), String(text || ''), Date.now());
  const indexObj = withIndexEntry(ensureIndex(null), fileObj, Date.now());
  const items = [
    { k: keyForPath(path), v: fileObj },
    { k: INDEX_KEY, v: indexObj },
  ];
  return utf8ByteLength(JSON.stringify({ p_items: items }));
}

/**
 * Дельта-запись: prepend/append блока + ротация при переполнении.
 * Возвращает обновлённый файл и нулевой или более архивных файлов.
 */
function applyDeltaToFile(file, mode, block, nowMs) {
  const path = normalizePath(file.path);
  const cleanBlock = String(block || '').trim();
  if (!cleanBlock) throw new Error('empty_block');
  if (mode !== 'prepend' && mode !== 'append' && mode !== 'chrono') throw new Error('invalid_mode');
  // Стенограмма обязана лежать по времени, кем бы ни была записана: она
  // пишется несколькими сессиями сразу, и запись, начатая раньше, приходит
  // позже. 04.09 нашлось, что tasks_checkpoint писал chrono, а tasks_append —
  // append, и 29 файлов из 35 лежали вразнобой, до 23 разрывов в дне.
  // Правило держится здесь, а не дисциплиной вызывающих: инвариант нельзя
  // обмануть формой кода, в отличие от проверки по исходнику.
  if (mode === 'append' && isTranscriptCorpusPath(path)) throw new Error('transcript_requires_chrono');

  const rotatedBefore = rotateFileText(path, file.text);
  let text = rotatedBefore.active;
  // chrono — вставка по времени заголовка: стенограмма пишется несколькими
  // сессиями сразу, и запись, начатая раньше, приходит позже. Режим обязан
  // совпадать с тем, что делает клиентский put, иначе rebase и дельта разойдутся.
  text = mode === 'prepend' ? prependBlock(text, cleanBlock)
    : mode === 'chrono' ? insertBlockByTime(text, cleanBlock)
      : appendBlock(text, cleanBlock);
  const rotatedAfter = rotateFileText(path, text);

  const nextFile = bumpFile(file, rotatedAfter.active, nowMs);
  const archiveFiles = [
    ...rotatedBefore.archives,
    ...rotatedAfter.archives,
  ].map((entry) => bumpFile(emptyFile(entry.path), entry.text, nowMs));

  return { file: nextFile, archives: archiveFiles };
}

module.exports = {
  KEY_PREFIX,
  INDEX_KEY,
  moscowDate,
  moscowTime,
  taskDay,
  SLOT_KINDS,
  slotKindAndTitle,
  slotClashLevel,
  toggleSubtask,
  removeChild,
  cutTask,
  parseSlots,
  slotConflicts,
  // чей слот и что он забирает
  SLOT_RESOURCES,
  normalizeResource,
  parseSlotMark,
  buildSlotMark,
  resourceLoad,
  resourcesAt,
  // снять, перенести, закрыть день
  slotPlainTitle,
  slotTitleMatches,
  findSlotsIn,
  padTime,
  splitSlotLine,
  buildSlotLine,
  removeSlotLine,
  retimeSlotLine,
  markSlotDone,
  appendDayEvent,
  hasDayEvent,
  dayNote,
  setDayNote,
  markHabit,
  unmarkHabit,
  // планёрка
  STANDUP_PATH,
  STANDUP_SECTION,
  STANDUP_OBSERVED_SECTION,
  STANDUP_GROUP_CAP,
  STANDUP_OBSERVE_CAP,
  STANDUP_STALE_DAYS,
  STANDUP_CATEGORIES,
  STANDUP_DEFAULT_PRIORITY,
  STANDUP_PRIORITY_ORDER,
  buildDecideGroups,
  renderDecideStandupBlock,
  decideGroupsShown,
  formatDecideRow,
  decideKind,
  standupLine,
  standupItemRef,
  standupEffectivePriority,
  sortStandupByPriority,
  markLineDone,
  parseStandupItems,
  observationBlock,
  observationText,
  parseStandupObservations,
  markStandupDone,
  setStandupCategory,
  answerObservation,
  knownObservation,
  findDivergences,
  stuckPromises,
  // план и факт
  PLAN_FACT_MIN_CASES,
  PLAN_FACT_MIN_SHARE,
  PLAN_FACT_WINDOW_DAYS,
  planFactPatterns,
  planFactQuestion,
  planFactSides,
  TASKS_ROTATE_TARGET_BYTES,
  TASKS_WRITE_PAYLOAD_LIMIT,
  utf8ByteLength,
  isDeltaWritablePath,
  rotatableKind,
  rotateFileText,
  archiveRotatePath,
  estimateWritePayloadBytes,
  applyDeltaToFile,
  isJournalCorpusPath,
  isMoneyCorpusPath,
  isTranscriptCorpusPath,
  // загруженность вперёд
  BOARD_DAY_START,
  BOARD_DAY_END,
  BOARD_SNAP,
  FREE_GAP_MIN,
  RU_WEEKDAYS,
  timeToMinutes,
  minutesToTime,
  freeGaps,
  busyMinutes,
  recurringWeekdays,
  parseRecurringSlots,
  weekdayIndex,
  shiftDate,
  weekStart,
  slotCoreTitle,
  dayLoad,
  anchorSlots,
  weekLoad,
  freeStretches,
  taskHash,
  projectKeyForPath,
  appendToSection,
  transcriptHeadingError,
  parseTranscriptSides,
  verbatimTranscriptError,
  checkpointOutputReminders,
  CHECKPOINT_JOURNAL_REMINDER,
  CHECKPOINT_FACT_REMINDER,
  CHECKPOINT_BOARD_REMINDER,
  transcriptSubstance,
  prependToSection,
  appendBlock,
  insertBlockByTime,
  blockMinutes,
  prependBlock,
  findTaskByHash,
  applyTaskPatch,
  appendChild,
  patchBlock,
  findSectionLine,
  keyForPath,
  pathForKey,
  normalizePath,
  OWNER_ONLY_FILES,
  ownerOnlyFile,
  ownerOnlyRefusal,
  emptyFile,
  ensureFile,
  bumpFile,
  normalizeNewlines,
  ensureIndex,
  withIndexEntry,
  isTasksFileKey,
  tasksWriteConflict,
  mergeIndexValues,
  TASKS_BASE_MAX_BYTES,
  TASKS_MERGE_MAX_CELLS,
  withTasksBase,
  diffLineOps,
  mergeTasksText,
  mergeTasksFileValue,
  searchFiles,
  RANK_WEIGHTS: {
    WORD_WEIGHT, SOURCE_MAX, RECENCY_MAX, RECENCY_HALFLIFE_DAYS, EXACT_BONUS, LINK_BONUS,
  },
  sourceWeight,
  recencyBonus,
  daysFromToday,
  linkEndpointPairs,
  // стенограмма
  TRANSCRIPT_STALE_MS,
  transcriptPath,
  transcriptStatus,
  transcriptReminder,
  // ревизия стенограмм перед планёркой
  transcriptShape,
  transcriptTail,
  sortTranscriptChronologically,
  transcriptBlockSortMinutes,
  REVIEW_WINDOW_DAYS,
  REVIEW_MARK_RE,
  reviewMarkLine,
  reviewMarkBlock,
  appendReviewMark,
  dayFileReasons,
  appendDayReviewMark,
  dayReviewDay,
  dayReviewStatus,
  dayReviewBlock,
  reviewTails,
  REVIEW_CANDIDATE_CAP,
  reviewCandidates,
  reviewCandidateLines,
  emptyReviewCandidates,
  READ_MAX_CHARS,
  READ_HARD_MAX,
  fileWindow,
  parseTaskLine,
  parseTasks,
  taskTitle,
  taskAddress,
  collectOpenQuestions,
  taskBackDate,
  taskWindow,
  taskSignalDate,
  questionKey,
  isSimpleQuestion,
  compareSimpleQuestions,
  pickSimpleQuestions,
  rememberShownQuestions,
  sleepQuestion,
  SIMPLE_QUESTION_MAX_LEN,
  SIMPLE_QUESTION_LIMIT,
  QUESTION_SLEEP_DAYS,
  collectPeopleThreads,
  // разбор фразы
  topicTerms,
  matchTerms,
  findAddresses,
  TOPIC_STOP_WORDS,
  // связи
  parseAddress,
  parseRefLine,
  parseSlotRef,
  collectLinks,
  findTaskByAddress,
  linksFor,
  // дельта
  fileSnapshot,
  diffFile,
  // развитие контекстов
  reviewFindings,
  repeatedThoughts,
  themeTokens,
  // память прохода
  STATE_KEY,
  PROPOSAL_COOLDOWN_DAYS,
  PROPOSAL_OPEN_STATUSES,
  ensureState,
  markTranscriptPending,
  clearTranscriptPending,
  proposalCooldown,
  pickFindings,
  rememberProposal,
  answerProposal,
  // порядок чтения
  pathRank,
  rankPaths,
  selectPaths,
  datedGroup,
  DATED_QUOTA,
  isStateFile,
  isOneOffReport,
  isReference,
  // эксперимент «два ответа»
  VOTES_PATH,
  VOTES_SECTION,
  voteWinner,
  voteLine,
  parseVotes,
  // деньги
  moneyLine,
  parseMoneyOps,
  moneyDayStatus,
  moneyDayReminder,
  lastBalance,
  monthAfter,
  parseBudget,
  budgetPicture,
  // как он решает
  PREFS_PATH,
  PREFS_SECTION,
  PREFS_SOFT_LIMIT,
  PREFS_KINDS,
  PREFS_OWNER_KINDS,
  PREFS_STALE_DAYS,
  PREFS_FACT_STALE_DAYS,
  parsePreferences,
  knownPreference,
  clientAddressMap,
  preferenceHitsRawTopic,
  diaryTopicUsesAddressAlias,
  addressAliasCanon,
  addressAliasForms,
  addressAliasInTopic,
  activePreferences,
  preferenceLine,
  preferenceBlock,
  bumpPreferenceCounter,
  addPreferenceAliases,
  markPreferenceStale,
  staleChild,
  stalePreferences,
  // окружение находки
  projectNeighborhood,
  slotsAround,
  // потолок развилок
  OPEN_DECISIONS_CAP,
  DECISION_SIMILARITY,
  questionSimilarity,
  decisionGuard,
  // что делать сейчас
  PLACE_TAGS,
  TIME_TAGS,
  taskMinutes,
  pickFocus,
  // напоминания
  REMINDERS_PATH,
  REMINDERS_SECTION,
  REMINDERS_HEADER,
  reminderLine,
  parseReminders,
  activeReminders,
  // идеи
  SOMEDAY_PATH,
  IDEAS_SECTION,
  ideaLine,
  parseIdeas,
};
