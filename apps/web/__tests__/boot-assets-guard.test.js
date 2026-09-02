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

  // Прежняя версия теста требовала тега <link rel="preload"> с тем же
  // абсолютным путём, что у <script>. В исходнике это выполнялось, тест был
  // зелёным — а прод качал две копии: Vite видит <link rel="preload"> как
  // ссылку на ресурс, кладёт копию в assets/react-bundle-<hash>.js по правилу
  // assetFileNames и переписывает href, тег <script> при этом не трогая.
  // Замер 03.09 на app.heyslab.ru: /assets/react-bundle-BpykyQoh.js на 52,7 КБ
  // и /react-bundle.js на 44,8 КБ, оба распакованы в одинаковые 139 КБ
  // (heys/8bd9fe). Тест сторожил форму записи в исходнике и не видел того,
  // что делает с ней сборка, — теперь он сторожит саму причину.

  it('тегом <link rel="preload"> react-bundle не объявляется — его втягивает сборщик', () => {
    const preloadTags = [...live.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]*react-bundle[^"]*)"/g)]
      .map((m) => m[1]);
    expect(preloadTags, 'тег preload на react-bundle вернёт вторую копию из assets/').toHaveLength(0);
  });

  it('preload ставится скриптом и по тому же пути, что и <script>', () => {
    const script = [...live.matchAll(/<script[^>]*src="([^"]*react-bundle[^"]*)"/g)].map((m) => m[1]);
    expect(script, 'ожидается ровно один script react-bundle').toHaveLength(1);

    const fromScript = [...live.matchAll(/l\.href\s*=\s*'([^']*react-bundle[^']*)'/g)].map((m) => m[1]);
    expect(fromScript, 'preload должен создаваться скриптом').toHaveLength(1);

    // Разные URL — preload впустую: браузер качает файл, который никто не ждёт.
    expect(fromScript[0]).toBe(script[0]);
    // Относительный путь вернёт вторую хешированную копию из графа сборщика.
    expect(fromScript[0].startsWith('/'), 'путь обязан быть абсолютным').toBe(true);
  });

  it('в собранном dist нет хешированной копии react-bundle', () => {
    const assetsDir = path.resolve(WEB_DIR, 'dist', 'assets');
    if (!fs.existsSync(assetsDir)) return; // dist не собран — проверять нечего
    const copies = fs.readdirSync(assetsDir).filter((f) => /react-bundle/i.test(f));
    expect(copies, `сборщик снова втянул react-bundle: ${copies.join(', ')}`).toHaveLength(0);
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
