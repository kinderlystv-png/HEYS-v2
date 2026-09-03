'use strict';

/**
 * heys/c395d5: порядок работы с сейфом одинаков во всех копиях secrets.js.
 *
 * Инцидент 21.08.2026 (13:59–14:06, 502 на живых клиентах): initSecrets()
 * стирал плейсхолдеры ПЕРЕД походом в Lockbox, а между ними лежит сетевой
 * вызов — всё это время пароля от базы в окружении не было вовсе. Кто
 * прочитает его в этом окне, получит пустую строку, а odyssey отвечает на
 * пустой пароль «incorrect password», и разбор уходит в сторону смены пароля.
 *
 * Починка ac6a0852b (21.08) легла в shared/secrets.js и в пять плоских копий,
 * а четырнадцать копий по функциям — включая контур входа heys-api-auth и
 * heys-api-rpc — остались на старом порядке. Разошлись они молча: deploy-all.sh
 * раскладывает по функциям sync-merge, kv-payload-contracts, capacity-guard и
 * day-checklist-rules, но secrets.js в этом списке НЕТ — копии держатся руками.
 *
 * Проверок здесь две, и они независимы:
 *   1. поведение — в каждой копии strip вызывается ПОСЛЕ overlay;
 *   2. байты — ни одна копия не разошлась с эталоном shared/secrets.js.
 * Первая ловит сам дефект в каждом файле, вторая — всё остальное, что уедет
 * при следующей правке эталона (предохранители на неполный результат,
 * комментарии, будущие ключи).
 *
 * Соседний yandex-cloud-functions/__tests__/secrets-lockbox-order.test.mjs
 * написан под vitest, а vitest.config.ts исключает yandex-cloud-functions
 * целиком — под `node --test` он падает на импорте. То есть порядок сейчас не
 * стережёт никто; этот файл лежит там, где `node --test __tests__/*.test.cjs`
 * его действительно запускает.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL = path.join(ROOT, 'shared', 'secrets.js');

const PLACEHOLDER = '__IN_LOCKBOX__heys-database__';
const OTHER_PLACEHOLDER = '__IN_LOCKBOX__heys-app__';
const REAL_PASSWORD = 'настоящий-пароль-из-сейфа';

/**
 * Обход каталогов, а не список имён: копия новой функции обязана попасть под
 * проверку сама. Список бы её молча не заметил — ровно тот случай, когда
 * зелёный тест подтверждает только собственную слепоту.
 */
function findCopies() {
  const found = [CANONICAL];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'shared') continue;
    for (const rel of ['secrets.js', path.join('shared', 'secrets.js')]) {
      const file = path.join(ROOT, entry.name, rel);
      if (fs.existsSync(file)) found.push(file);
    }
  }
  return found.sort();
}

const COPIES = findCopies();
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');
const lf = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

/** Подменяет соседний lockbox-client копии и загружает её заново. */
function loadCopy(file, getSecret) {
  const lockbox = require.resolve(path.join(path.dirname(file), 'lockbox-client.js'));
  const secrets = require.resolve(file);
  require.cache[lockbox] = {
    id: lockbox,
    filename: lockbox,
    loaded: true,
    exports: { getSecret, clearCache: () => {} },
  };
  delete require.cache[secrets];
  return { module: require(secrets), unload: () => {
    delete require.cache[secrets];
    delete require.cache[lockbox];
  } };
}

/** Прогоняет fn на подготовленном окружении и возвращает всё как было. */
async function withEnv(fn) {
  const backup = { ...process.env };
  process.env.LOCKBOX_DB_SECRET_ID = 'secret-db';
  delete process.env.LOCKBOX_APP_SECRET_ID;
  delete process.env.LOCKBOX_S3_SECRET_ID;
  process.env.PG_PASSWORD = PLACEHOLDER;
  process.env.HEYS_TEST_UNTOUCHED_PLACEHOLDER = OTHER_PLACEHOLDER;
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in backup)) delete process.env[key];
    }
    Object.assign(process.env, backup);
  }
}

test('обход каталогов нашёл копии secrets.js и эталон', () => {
  assert.ok(fs.existsSync(CANONICAL), 'эталон shared/secrets.js не найден');
  assert.ok(
    COPIES.length > 10,
    `обход каталогов нашёл всего ${COPIES.length} копий secrets.js — так не бывает, проверь путь`,
  );
});

for (const file of COPIES) {
  const name = rel(file);

  test(`${name}: пока сейф отвечает, пароль из окружения не исчезает`, async () => {
    await withEnv(async () => {
      const seenDuringFetch = [];
      const { module, unload } = loadCopy(file, async () => {
        // Мы внутри сетевого вызова — ровно то окно, в котором раньше было пусто.
        seenDuringFetch.push(process.env.PG_PASSWORD);
        await Promise.resolve();
        seenDuringFetch.push(process.env.PG_PASSWORD);
        return { PG_PASSWORD: REAL_PASSWORD };
      });
      try {
        await module.initSecrets();
      } finally {
        unload();
      }

      assert.equal(seenDuringFetch.length, 2);
      for (const value of seenDuringFetch) {
        assert.equal(
          value,
          PLACEHOLDER,
          `${name}: пароль пропал из окружения на время похода в сейф — strip стоит до overlay`,
        );
      }
      assert.equal(
        process.env.PG_PASSWORD,
        REAL_PASSWORD,
        `${name}: значение из сейфа не наложилось на окружение`,
      );
    });
  });

  test(`${name}: плейсхолдер, который сейф не заменил, всё-таки стирается`, async () => {
    // Обратная сторона того же порядка: strip обязан отработать ПОСЛЕ overlay,
    // а не пропасть вовсе — иначе downstream примет `__IN_LOCKBOX__…` за
    // валидное значение и подпишет им webhook.
    await withEnv(async () => {
      const { module, unload } = loadCopy(file, async () => ({ PG_PASSWORD: REAL_PASSWORD }));
      try {
        await module.initSecrets();
      } finally {
        unload();
      }

      assert.equal(
        process.env.HEYS_TEST_UNTOUCHED_PLACEHOLDER,
        undefined,
        `${name}: strip не отработал вовсе — плейсхолдер уехал бы в downstream`,
      );
    });
  });
}

test('ни одна копия не разошлась с эталоном shared/secrets.js', () => {
  const canonical = lf(CANONICAL);
  const drifted = COPIES.filter((file) => lf(file) !== canonical).map(rel);

  assert.deepEqual(
    drifted,
    [],
    'копии держатся руками — deploy-all.sh secrets.js не раскладывает; сравняй с shared/secrets.js',
  );
  // Что именно проверено, чтобы «зелено» не читалось как «не смотрели».
  assert.ok(COPIES.length >= 20, `сверено копий: ${COPIES.length}, ожидалось не меньше 20`);
});
