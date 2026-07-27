import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(appRoot, 'src');
const distRoot = path.join(appRoot, 'dist');
const assetsRoot = path.join(distRoot, 'assets');
const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);

await rm(distRoot, { recursive: true, force: true });
await mkdir(assetsRoot, { recursive: true });

const [htmlSource, cssSource, logic, bank, appSource, theme, logo, brandFont] = await Promise.all([
  readFile(path.join(srcRoot, 'index.html'), 'utf8'),
  readFile(path.join(srcRoot, 'styles.css'), 'utf8'),
  readFile(path.join(srcRoot, 'logic.js'), 'utf8'),
  readFile(path.join(srcRoot, 'data/question-bank.json'), 'utf8'),
  readFile(path.join(srcRoot, 'app.js'), 'utf8'),
  readFile(path.join(srcRoot, 'theme.js'), 'utf8'),
  readFile(path.join(srcRoot, 'assets/trainer-logo.png')),
  readFile(path.join(srcRoot, 'assets/helios-ext-light-c.otf')),
]);

const fontName = `helios-ext-light-c.${hash(brandFont)}.otf`;
const css = cssSource.replace('./helios-ext-light-c.otf', `./${fontName}`);
const cssName = `styles.${hash(css)}.css`;
const logicName = `logic.${hash(logic)}.js`;
const themeName = `theme.${hash(theme)}.js`;
const logoName = `trainer-logo.${hash(logo)}.png`;
const bankName = `question-bank.${hash(bank)}.json`;
const builtApp = appSource
  .replace('./logic.js', `./${logicName}`)
  .replace('./data/question-bank.json', `./assets/${bankName}`);
const appName = `app.${hash(builtApp)}.js`;
const html = htmlSource
  .replace('./styles.css', `./assets/${cssName}`)
  .replace('./theme.js', `./assets/${themeName}`)
  .replaceAll('./assets/trainer-logo.png', `./assets/${logoName}`)
  .replace('./app.js', `./assets/${appName}`);

await Promise.all([
  writeFile(path.join(distRoot, 'index.html'), html),
  writeFile(path.join(assetsRoot, cssName), css),
  writeFile(path.join(assetsRoot, logicName), logic),
  writeFile(path.join(assetsRoot, themeName), theme),
  writeFile(path.join(assetsRoot, logoName), logo),
  writeFile(path.join(assetsRoot, fontName), brandFont),
  writeFile(path.join(assetsRoot, bankName), bank),
  writeFile(path.join(assetsRoot, appName), builtApp),
]);

console.log(`Build: index.html + ${cssName}, ${themeName}, ${appName}, ${logicName}, ${bankName}, ${logoName}, ${fontName}`);
