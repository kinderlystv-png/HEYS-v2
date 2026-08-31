// ui-v4-verdicts-per-zone.test.js — вердикты лежат по файлу на зону.
//
// До 31 августа это был один файл на все зоны, и за один день он дважды уехал
// в чужой коммит целиком вместе с чужой незакоммиченной работой. Дисциплиной
// это не лечится: `git commit -- <путь>` берёт содержимое файла целиком, а
// снимок правится в середине разбора зоны — коммитить середину нельзя, а к
// концу разбора в файле уже чужое.
//
// Тест держит раскладку: возврат к общему файлу и расползание пути по коду
// должны падать, а не проходить молча.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'docs/ui/verdicts');
const OLD = path.join(ROOT, 'docs/ui/ui-v4-contract-verdicts.json');

const zoneFiles = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('Вердикты разложены по зонам', () => {
  it('общего файла больше нет', () => {
    expect(fs.existsSync(OLD)).toBe(false);
  });

  it('каждая зона — свой файл, и их больше двадцати', () => {
    expect(zoneFiles().length).toBeGreaterThan(20);
  });

  it('имя файла совпадает с зоной, а не хранит её внутри', () => {
    // Иначе имя файла перестаёт быть адресом и зону снова придётся искать
    // перебором.
    for (const file of zoneFiles()) {
      const zone = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
      expect(zone.zones, file).toBeUndefined();
      expect(zone.rows, file).toBeTruthy();
      expect(zone.canvas, file).toMatch(/\.v4\.dc\.html$/);
    }
  });

  it('рядом лежит README — иначе новую зону ищут перебором', () => {
    const readme = path.join(DIR, 'README.md');
    expect(fs.existsSync(readme)).toBe(true);
    const text = fs.readFileSync(readme, 'utf8');
    expect(text).toContain('--rehash');
    expect(text).toContain('scripts/lib/ui-v4-verdicts.mjs');
  });
});

describe('Путь к вердиктам знает один модуль', () => {
  const lib = path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs');

  it('модуль есть и отдаёт зоны поимённо', () => {
    const src = fs.readFileSync(lib, 'utf8');
    expect(src).toContain("docs/ui/verdicts");
    for (const fn of ['listZoneIds', 'readZone', 'readAllZones', 'writeZone']) {
      expect(src, fn).toContain(`export function ${fn}`);
    }
  });

  it('rehash пишет одну зону, а не всё дерево', () => {
    // Ровно то, ради чего раскладка и делалась.
    const drift = fs.readFileSync(path.join(ROOT, 'scripts/ui-v4-check-contract-drift.mjs'), 'utf8');
    expect(drift).toContain('writeZone(zoneId, zone)');
    expect(drift).not.toContain('ui-v4-contract-verdicts.json');
  });

  it('простановка вердикта тоже пишет одну зону', () => {
    const setter = fs.readFileSync(path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs'), 'utf8');
    expect(setter).toContain('writeZone(zone, zoneData)');
    expect(setter).not.toContain('ui-v4-contract-verdicts.json');
  });

  it('id зоны не может увести запись из каталога', () => {
    // zonePath строит имя файла из аргумента командной строки.
    const src = fs.readFileSync(lib, 'utf8');
    expect(src).toMatch(/test\(String\(zoneId/);
  });
});
