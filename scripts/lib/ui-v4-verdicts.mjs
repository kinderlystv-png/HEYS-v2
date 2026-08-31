// ui-v4-verdicts.mjs — доступ к вердиктам контракта v4.
//
// Вердикты лежат по файлу на зону: `docs/ui/verdicts/<зона>.json`. Прежде это
// был один файл на все зоны, и он дважды за 31 августа уехал в чужой коммит
// целиком: путь в `git commit -- <путь>` указывался верно, но файл всегда
// содержал чужое незакоммиченное — снимок правится в середине разбора зоны, а
// коммитить середину нельзя. Теперь чужая работа физически не может попасть в
// чужой коммит.
//
// Путь спрятан здесь намеренно: на снимок ссылались 27 мест, и следующая
// перекладка не должна снова расходиться по ним.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');

/** Имя файла зоны. Зона — идентификатор канваса, без путей и расширений. */
export function zonePath(zoneId) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(zoneId || ''))) {
    throw new Error(`Недопустимый id зоны: «${zoneId}»`);
  }
  return path.join(VERDICTS_DIR, `${zoneId}.json`);
}

export function listZoneIds() {
  if (!fs.existsSync(VERDICTS_DIR)) return [];
  return fs
    .readdirSync(VERDICTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function readZone(zoneId) {
  const file = zonePath(zoneId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Все зоны разом — в той же форме, что отдавал прежний общий снимок
 * (`{ zones: { id: … } }`), чтобы читателям не пришлось менять код.
 */
export function readAllZones() {
  const zones = {};
  for (const id of listZoneIds()) {
    const zone = readZone(id);
    if (zone) zones[id] = zone;
  }
  return { zones };
}

export function writeZone(zoneId, zone) {
  fs.mkdirSync(VERDICTS_DIR, { recursive: true });
  fs.writeFileSync(zonePath(zoneId), `${JSON.stringify(zone, null, 2)}\n`, 'utf8');
}
