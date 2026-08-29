// Два тихих дефекта загрузки, найденных по логу 29 августа.
//
// 1. react-bundle грузился дважды. Относительный «react-bundle.js» резолвится
//    из корня Vite (apps/web/), поэтому сборщик втягивал файл в свой граф и
//    выпускал вторую хешированную копию assets/react-bundle-<hash>.js. Она
//    уезжала в dist общим `aws s3 sync` и предзагружалась вместо той, что
//    реально исполняется, — лишние ~139 КБ на каждой холодной загрузке.
//    Соседние boot-бандлы этой беды не знают: они лежат в public/ и сборщику
//    не видны. Абсолютный путь ставит react в тот же режим.
//
// 2. Service worker писал «Activation timeout — proceeding anyway» на каждом
//    старте. Гонку выигрывала активация, но пятисекундный таймер не отменялся,
//    досиживал срок и печатал предупреждение при полностью успешном старте —
//    заодно маскируя настоящий таймаут, случись он однажды.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(WEB_DIR, 'public/sw.js'), 'utf8');

/** Значения href/src у живых тегов — без учёта того, что лежит в комментариях. */
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('загрузка: react-bundle не должен приезжать дважды', () => {
  const live = stripHtmlComments(INDEX_HTML);

  it('preload и script указывают на один и тот же абсолютный путь', () => {
    const preload = [...live.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]*react-bundle[^"]*)"/g)]
      .map((m) => m[1]);
    const script = [...live.matchAll(/<script[^>]*src="([^"]*react-bundle[^"]*)"/g)].map((m) => m[1]);

    expect(preload, 'ожидается ровно один preload react-bundle').toHaveLength(1);
    expect(script, 'ожидается ровно один script react-bundle').toHaveLength(1);
    // Разные URL — preload впустую: браузер качает файл, который никто не исполнит.
    expect(preload[0]).toBe(script[0]);
    // Относительный путь вернёт вторую хешированную копию из сборщика.
    expect(preload[0].startsWith('/'), 'путь обязан быть абсолютным').toBe(true);
  });
});

describe('service worker: таймер активации отменяется', () => {
  it('setTimeout активации имеет парный clearTimeout', () => {
    expect(SW_SRC).toMatch(/Activation timeout/);
    // Идентификатор таймера должен сохраняться и сбрасываться, иначе предупреждение
    // печатается при успешной активации.
    expect(SW_SRC).toMatch(/activationTimeoutId\s*=\s*setTimeout/);
    expect(SW_SRC).toMatch(/clearTimeout\(activationTimeoutId\)/);
    // И отмена обязана вызываться на выигранной гонке, а не только объявляться.
    const raceAt = SW_SRC.indexOf('Promise.race([activationTasks, activationTimeout])');
    expect(raceAt, 'гонка активации не найдена').toBeGreaterThan(-1);
    const afterRace = SW_SRC.slice(raceAt, raceAt + 400);
    expect(afterRace).toMatch(/cancelActivationTimeout\(\)/);
  });
});
