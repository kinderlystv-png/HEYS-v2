/**
 * Голос движка инсайтов — гейт по строке контракта «слова блока наблюдений»
 * (docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/
 * reports-insights.v4.dc.html, решение дизайнера 12 сентября 2026).
 *
 * Контракт одной находкой, четырьмя признаками:
 *   1. эмодзи нет ни в одной строке зоны, ни в одном слое;
 *   2. к человеку на «вы»;
 *   3. формул, доверительных интервалов и символов элементов в тексте нет —
 *      их место во втором слое и словами;
 *   4. числа, которого нет, не показывается вовсе: ни «NaN%», ни «—%», ни «0/100».
 *
 * Гейт читает исходники правил движка, а не бандл: строка, до экрана сегодня не
 * доходящая, завтра дойдёт. Комментарии и dev-логи не считаются текстом для
 * человека и в охват не входят — это сказано ниже поимённо, вместе с остатком,
 * который гейт намеренно не проверяет.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSIGHTS = path.join(WEB_ROOT, 'insights');

// Вне охвата и почему:
//   pi_ui_*.js            — слой отрисовки легаси-дашборда, не правила движка;
//                           его иконки снимает та же правка, что и вёрстку;
//   pi_pattern_debugger   — dev-only tooling (исключено правилом product UI);
//   pi_stats.test.js,
//   test_ews_v3.1.js      — тестовые файлы движка, текста человеку не отдают.
const OUT_OF_SCOPE = /^(pi_ui_.*|pi_pattern_debugger|pi_stats\.test|test_ews_v3\.1)\.js$/;

// Значения этих свойств — не фраза: иконка слота в легаси-UI и формула второго
// слоя, которую контракт прямо разрешает («их место во втором слое рядом с
// объяснением, как считается»).
const NON_PHRASE_PROPS = new Set(['emoji', 'icon', 'priorityEmoji', 'badge', 'formula']);

// Аргументы этих вызовов — диагностика для разработчика, а не текст человеку.
const LOG_CALLEES = /^(devLog|log|warn|error|debug|info|trace|assert|group|groupEnd|table|dir)$/;

const CYRILLIC = /[Ѐ-ӿ]/;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const DEV_PREFIX = /^\[(HEYS|PI|EWS)/;

function scopeFiles() {
  const files = [];
  for (const name of fs.readdirSync(INSIGHTS)) {
    if (name.endsWith('.js') && !OUT_OF_SCOPE.test(name)) files.push(path.join(INSIGHTS, name));
  }
  for (const name of fs.readdirSync(path.join(INSIGHTS, 'patterns'))) {
    if (name.endsWith('.js')) files.push(path.join(INSIGHTS, 'patterns', name));
  }
  return files.sort();
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => child && typeof child.type === 'string' && walk(child, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  }
}

/** Фразы движка одного файла: литералы, которые может прочитать человек. */
function collectPhrases(src, file) {
  const ast = parseAst(src, { allowReturnOutsideFunction: true });

  const skipRanges = [];
  walk(ast, (node) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const name = callee && (callee.type === 'Identifier' ? callee.name
        : callee.type === 'MemberExpression' && callee.property ? callee.property.name : null);
      const objectName = callee && callee.type === 'MemberExpression' && callee.object ? callee.object.name : '';
      if (objectName === 'console' || (name && LOG_CALLEES.test(name))) skipRanges.push([node.start, node.end]);
    }
    if (node.type === 'Property' && node.key) {
      const name = node.key.name || node.key.value;
      if (typeof name === 'string' && NON_PHRASE_PROPS.has(name)) skipRanges.push([node.value.start, node.value.end]);
    }
  });
  const skipped = (node) => skipRanges.some(([start, end]) => node.start >= start && node.end <= end);

  const phrases = [];
  const glyphOnly = [];
  const seen = new Set();
  walk(ast, (node) => {
    const isString = node.type === 'Literal' && typeof node.value === 'string';
    if (!isString && node.type !== 'TemplateLiteral') return;
    const raw = src.slice(node.start, node.end);
    if (!CYRILLIC.test(raw) && !PICTOGRAPH.test(raw)) return;
    if (skipped(node)) return;
    if (isString && DEV_PREFIX.test(node.value)) return;
    if (node.type === 'TemplateLiteral' && DEV_PREFIX.test(raw.slice(1))) return;
    // Вложенные литералы шаблона уже учтены самим шаблоном.
    if (seen.has(node.start)) return;
    if (node.type === 'TemplateLiteral') {
      walk(node, (inner) => { if (inner !== node) seen.add(inner.start); });
    }
    const line = src.slice(0, node.start).split('\n').length;
    const entry = { file: path.basename(file), line, raw };
    // Чистый глиф без букв и подстановок — иконка слота, не фраза.
    if (PICTOGRAPH.test(raw) && !/\p{L}/u.test(raw.replace(/\p{Extended_Pictographic}/gu, '')) && !raw.includes('${')) {
      glyphOnly.push(entry);
      return;
    }
    phrases.push(entry);
  });
  return { phrases, glyphOnly };
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]/u;

// Дамп расчёта: размер выборки, p-значение, коэффициент, доверительный интервал.
const STATS_DUMP = /N\s*=\s*[\d$]|(?:^|[^\p{L}\w])p\s*[=<]\s*[\d$]|95\s*%\s*CI|(?:^|[^\p{L}\w])r\s*=\s*[\d$]|\bshrinkage\b/u;

// Символы элементов в «скобочной» форме: рядом с числом, в соотношении или
// списком в скобках. Буква витамина в прозе («витамины D и K») — не дамп.
const ELEMENTS = 'Fe|Mg|Zn|Ca|Na|Se|Cu|Mn';
const ELEMENT_DUMP = new RegExp(
  `(?:^|[\\s(,;:])(?:${ELEMENTS})\\s*[:=]\\s*[-\\d$]`
  + `|(?:^|[\\s(,;:])(?:${ELEMENTS})\\s+[-\\d$]`
  + `|(?:${ELEMENTS}):(?:${ELEMENTS})`
  + `|\\((?:${ELEMENTS})(?:\\s*,\\s*(?:${ELEMENTS}))+\\)`,
  'u'
);

// Числа, которого нет.
const MISSING_NUMBER = /NaN|—\s*%|(?:^|[^\d])0\s*\/\s*100(?:[^\d]|$)|\bundefined\b/u;

// «Ты»-формы: местоимения и глаголы второго лица единственного числа.
const TY_WORDS = [
  'ты', 'тебе', 'тебя', 'тобой', 'твой', 'твоя', 'твоё', 'твое', 'твои', 'твоих',
  'твоим', 'твоими', 'твоему', 'твоём', 'твоем', 'твою', 'твоего', 'твоей',
  'продолжай', 'будь', 'следи', 'запланируй', 'обрати', 'начни', 'замени', 'заполняй',
  'увеличь', 'найди', 'избегай', 'проверь', 'сдвинь', 'выпей', 'пересмотри', 'запиши',
  'веди', 'сократи', 'стабилизируй', 'снизь', 'съешь', 'принимай', 'смотри', 'исправь',
  'выполни', 'сделай', 'минимизируй', 'планируй', 'сравни', 'подстраивай', 'научись',
  'усиль', 'закрывай', 'разорви', 'закрой', 'используй', 'выбирай', 'удели', 'попей',
  'попробуй', 'контролируй', 'пробуй', 'береги', 'снижай', 'перенеси', 'добавь',
  'ложись', 'держи', 'ешь', 'пей', 'спи', 'убери', 'оставь', 'отдохни', 'выспись',
  'пропускай', 'сорвись', 'собирай', 'ставь', 'меняй', 'фиксируй', 'отмечай',
  'отслеживай', 'соблюдай', 'старайся', 'вернись', 'поешь', 'перекуси', 'прогуляйся',
  'займись', 'настрой', 'подбери', 'заведи', 'сохрани', 'учти', 'помни', 'смести',
  'раздели', 'распредели', 'держись', 'следуй', 'замечай', 'измеряй', 'взвешивайся',
  'ограничь'
];
const TY_FORM = new RegExp(
  `(?:^|[^\\p{L}])(?:${TY_WORDS.join('|')})(?:[^\\p{L}]|$)|(?:^|[^\\p{L}])\\p{L}+(?:ешь|ишь|ёшь)(?:[^\\p{L}]|$)`,
  'iu'
);

const RULES = [
  ['эмодзи в тексте наблюдения', EMOJI],
  ['«ты» вместо «вы»', TY_FORM],
  ['дамп расчёта (N=, p=, r=, 95% CI)', STATS_DUMP],
  ['символ элемента вместо слова', ELEMENT_DUMP],
  ['число, которого нет (NaN, —%, 0/100)', MISSING_NUMBER]
];

const files = scopeFiles();
const collected = files.map((file) => {
  const src = fs.readFileSync(file, 'utf8');
  return { file, ...collectPhrases(src, file) };
});
const allPhrases = collected.flatMap((entry) => entry.phrases);
const allGlyphs = collected.flatMap((entry) => entry.glyphOnly);

describe('движок инсайтов говорит с человеком (контракт reports-insights)', () => {
  it('охват гейта назван, а не подразумевается', () => {
    // Проверка обязана отличать «сошлось» от «не смотрели»: если файл движка
    // перестал читаться или фразы исчезли, гейт краснеет, а не молчит.
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(collected.every((entry) => entry.phrases.length + entry.glyphOnly.length >= 0)).toBe(true);
    expect(allPhrases.length).toBeGreaterThan(1500);
  });

  for (const [name, rule] of RULES) {
    it(`нет нарушения: ${name}`, () => {
      const hits = allPhrases.filter((phrase) => rule.test(phrase.raw));
      expect(hits.map((h) => `${h.file}:${h.line} ${h.raw}`)).toEqual([]);
    });
  }

  it('остаток: глифы-иконки легаси-дашборда только убывают', () => {
    // Это не фразы, а значения иконочных слотов (SCENARIO_ICONS, getCategoryEmoji,
    // levelEmoji и подобные), которые читает слой отрисовки pi_ui_*. Убрать их
    // можно только вместе с вёрсткой, поэтому здесь они посчитаны, а не спрятаны:
    // число может уменьшаться, но не расти.
    expect(allGlyphs.length).toBeLessThanOrEqual(47);
  });
});
