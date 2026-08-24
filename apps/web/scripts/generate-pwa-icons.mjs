/**
 * PWA icons from icon-v4.svg (крупная H на #fffaf1).
 * apple-touch-icon — icon-v4-apple.svg (180×180, без скругления в PNG).
 * maskable — тот же знак на полном грунте (Android ярлык + splash).
 * Run: node apps/web/scripts/generate-pwa-icons.mjs
 *
 * Шрифт. Контракт app-splash «что в иконке» требует букву H рубленой, Figtree
 * весом 800. Растеризатор здесь — librsvg внутри sharp, а он рисует текст через
 * pango/fontconfig и `@font-face` в самом SVG игнорирует: сколько шрифт ни
 * вшивай в файл data-URL'ом, семейство ищется только среди тех, что видит
 * fontconfig. Прежняя редакция скрипта именно это и делала — подставляла Figtree
 * base64-строкой — и молча получала системный запасной шрифт: на 2026-08-25 при
 * весе 800 это был брусковый шрифт с засечками, прямо против строки «буква
 * рубленая». Поэтому шрифт отдаётся fontconfig'у своим конфигом, а не через SVG;
 * сам `@font-face` в .svg оставлен — он нужен, когда файл открывают в браузере.
 *
 * Перезапуск. FONTCONFIG_FILE обязан стоять в окружении процесса до его старта:
 * присвоение process.env.FONTCONFIG_FILE изнутри Node до fontconfig не доходит —
 * его getenv читает копию окружения, снятую при инициализации своей CRT
 * (проверено: конфиг из переменной, выставленной в теле скрипта, не читается,
 * кэш остаётся пустым). Поэтому скрипт один раз перезапускает сам себя с готовым
 * окружением; команда запуска от этого не меняется.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const fontDir = path.join(publicDir, 'fonts/figtree');
const fontPath = path.join(fontDir, 'Figtree-Variable.ttf');

if (!fs.existsSync(fontPath)) {
  console.error('Missing', fontPath);
  process.exit(1);
}

// Признак перезапуска — своя переменная, а не FONTCONFIG_FILE: если в окружении
// уже стоит чужой конфиг, он про наш шрифт ничего не знает, и полагаться на него
// нельзя.
if (!process.env.HEYS_ICONS_FC_CACHE) {
  // В конфиге назван только каталог Figtree: другого семейства растеризатору
  // взять неоткуда, значит буква либо нарисована Figtree, либо не нарисована.
  const confDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-icons-fc-'));
  const cacheDir = path.join(confDir, 'cache');
  fs.mkdirSync(cacheDir);
  const confPath = path.join(confDir, 'fonts.conf');
  const posix = (p) => p.split(path.sep).join('/');
  fs.writeFileSync(
    confPath,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${posix(fontDir)}</dir>
  <cachedir>${posix(cacheDir)}</cachedir>
</fontconfig>
`,
  );
  const child = spawnSync(process.execPath, [__filename], {
    stdio: 'inherit',
    env: { ...process.env, FONTCONFIG_FILE: confPath, HEYS_ICONS_FC_CACHE: cacheDir },
  });
  process.exit(child.status === null ? 1 : child.status);
}

const jobs = [
  { source: 'icon-v4.svg', name: 'icon-192.png', size: 192, flatten: '#fffaf1' },
  { source: 'icon-v4.svg', name: 'icon-512.png', size: 512, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'apple-touch-icon.png', size: 180, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'icon-maskable-192.png', size: 192, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'icon-maskable-512.png', size: 512, flatten: '#fffaf1' },
];

const sharp = (await import('sharp')).default;

function loadSvg(filename) {
  const file = path.join(publicDir, filename);
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

for (const { source, name, size, flatten } of jobs) {
  const out = path.join(publicDir, name);
  await sharp(Buffer.from(loadSvg(source)))
    .resize(size, size)
    .flatten({ background: flatten })
    .png()
    .toFile(out);
  console.log(`wrote ${name} (${size}, flatten ${flatten})`);
}

// Fail-closed: подмена шрифта запасным происходит молча и видна только глазами
// на готовом PNG — так и уехала в репозиторий брусковая H. Сканируя каталог из
// конфига, fontconfig кладёт туда кэш; пустой кэш означает, что конфиг не был
// прочитан и буква нарисована чем-то системным.
const cacheDir = process.env.HEYS_ICONS_FC_CACHE;
if (cacheDir && fs.readdirSync(cacheDir).length === 0) {
  console.error(
    'fontconfig не прочитал свой конфиг — буква нарисована запасным шрифтом, не Figtree.\n' +
      `Проверьте ${fontPath} и FONTCONFIG_FILE=${process.env.FONTCONFIG_FILE}`,
  );
  process.exit(1);
}
