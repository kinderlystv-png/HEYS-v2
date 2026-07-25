import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { READING_BOOK_SOURCES } from './legacy-bundle-config.mjs';

const root = process.cwd();
const requestedProfile = process.argv.find((arg) => arg.startsWith('--profile='))?.slice(10) || 'poltavsky';
const apply = process.argv.includes('--apply');
const overlayPath = path.join(root, 'apps/web/reading/personalization', `${requestedProfile}_v1.json`);

if (!fs.existsSync(overlayPath)) {
    console.error(`Персональный профиль не найден: ${overlayPath}`);
    process.exit(1);
}

const sandbox = { window: {}, structuredClone, console: { error() {}, warn() {}, log() {} } };
vm.createContext(sandbox);
const evaluate = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
evaluate(path.join(root, 'apps/web/heys_reading_catalog_v1.js'));
READING_BOOK_SOURCES.forEach((source) => evaluate(path.join(root, 'apps/web', source)));

const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const Reading = sandbox.window.HEYS.Reading;
const validation = Reading.validatePersonalizationOverlay(overlay, Reading.getPublishedBooks());
if (!validation.valid) {
    validation.errors.forEach((issue) => console.error(`${issue.code} ${issue.path}: ${issue.message}`));
    process.exit(1);
}

console.log(`Профиль ${overlay.profileId}: ${validation.bookCount} книг, контракт пройден.`);
if (!apply) {
    console.log('Проверка завершена без записи. Для client-scoped публикации добавьте --apply.');
    process.exit(0);
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const payload = JSON.stringify(overlay);
const sql = `
INSERT INTO client_kv_store (client_id, k, v, updated_at)
VALUES (${sqlString(overlay.clientId)}::uuid, 'heys_reading_personalization_v1', ${sqlString(payload)}::jsonb, NOW())
ON CONFLICT (client_id, k) DO UPDATE
SET v = EXCLUDED.v, updated_at = NOW();
`;
const result = spawnSync(path.join(root, 'scripts/db/psql.sh'), ['-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'Не удалось записать персональный профиль.\n');
    process.exit(result.status || 1);
}
console.log('Персональный профиль записан в client-scoped KV.');
