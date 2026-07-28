import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.env.GENDA_SOURCE_ROOT || '/Users/poplavskijanton/Documents/Doctor';
const canonicalPath = path.join(sourceRoot, 'Банк_врачебных_тестов_офтальмология_КАНОН.json');
const outputPath = path.join(appRoot, 'src/data/question-bank.json');

const bank = JSON.parse(await readFile(canonicalPath, 'utf8'));
if (bank.schemaVersion !== 3 || bank.sourceOfTruth !== true || !Array.isArray(bank.questions)) {
  throw new Error('Ожидался канонический банк schemaVersion=3 и sourceOfTruth=true');
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
console.log(`Канон скопирован: ${bank.questions.length} вопросов → ${outputPath}`);
