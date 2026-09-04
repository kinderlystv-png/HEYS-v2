import fs from 'node:fs';

const canvasPath = 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html';
const verdictsPath = 'docs/ui/verdicts/strength-builder.json';
const canvas = fs.readFileSync(canvasPath, 'utf8');
const verdicts = JSON.parse(fs.readFileSync(verdictsPath, 'utf8')).rows;

const parentKeys = [
  'вид · карточка упражнения',
  'вид · раскрытое упражнение',
  'вид · таблица подходов в карточке',
  'вид · создание упражнения',
  'вид · выбор групп мышц',
  'Своё упражнение · текст',
  '5 · карточка упражнения несёт три вещи',
  'вид · день не состоялся',
  'День не состоялся · 17',
  'пропущенный день — выбор, а не упрёк',
  'вчерашняя ждёт решения, а не закрывается сама',
  'у брошенной сессии три исхода',
  'отчёт называет дыру',
  'пропущен сегодня и пропущен раньше — два разных случая',
  'целевой день с выбранным лимитом не предлагается',
];

const subPatterns = [
  /^Упражнение · карточка · \d+$/,
  /^Упражнение · карточка · текст$/,
  /^Своё упражнение · \d+$/,
  /^Своё упражнение · текст$/,
  /^Упражнение · группы мышц · \d+$/,
  /^Упражнение · группы мышц · текст$/,
  /^День не состоялся · \d+$/,
  /^День не состоялся · текст$/,
  /^Сессия · брошена вчера · \d+$/,
  /^Сессия · брошена вчера · текст$/,
];

function canvasHas(key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('<b>' + esc + '</b>').test(canvas);
}

const allKeys = new Set(parentKeys);
for (const k of Object.keys(verdicts)) {
  if (subPatterns.some((p) => p.test(k))) allKeys.add(k);
}
const re = /<b>([^<]+)<\/b>/g;
let m;
while ((m = re.exec(canvas)) !== null) {
  const k = m[1].trim();
  if (subPatterns.some((p) => p.test(k))) allKeys.add(k);
}

const catalogCardParents = parentKeys.slice(0, 7);
function sectionFor(key) {
  if (
    catalogCardParents.includes(key) ||
    /^Упражнение · карточка/.test(key) ||
    /^Своё упражнение/.test(key) ||
    /^Упражнение · группы мышц/.test(key) ||
    key === '5 · карточка упражнения несёт три вещи'
  ) return 'catalogCard';
  return 'day';
}

const sorted = [...allKeys].sort((a, b) => a.localeCompare(b, 'ru'));
const missing = parentKeys.filter((k) => !canvasHas(k));
console.log(JSON.stringify({ total: sorted.length, missing, catalog: sorted.filter((k) => sectionFor(k) === 'catalogCard').length, day: sorted.filter((k) => sectionFor(k) === 'day').length, keys: sorted.map((k) => ({ key: k, verdict: verdicts[k]?.v ?? null, section: sectionFor(k) })) }, null, 2));
