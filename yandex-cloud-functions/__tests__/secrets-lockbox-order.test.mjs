// Порядок работы с секретами при холодном старте.
//
// Инцидент 21.08.2026, 13:59–14:06: 502 на живых клиентах. Пароль от базы
// переехал в Lockbox, а в окружении функции остался плейсхолдер
// `__IN_LOCKBOX__…`. initSecrets() стирал плейсхолдеры ПЕРЕД походом в сейф —
// и всё время сетевого вызова пароля в окружении не было вовсе. Кто прочитает
// его в этом окне, получит пустую строку, а odyssey отвечает на пустой пароль
// «incorrect password», уводя разбор в сторону смены пароля.
//
// Живьём это не воспроизвести: окно длится ровно столько, сколько идёт запрос
// в сейф, и ловится только тем, что заглядывает в окружение изнутри него.
import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const LOCKBOX_PATH = require.resolve('../shared/lockbox-client.js');
const SECRETS_PATH = require.resolve('../shared/secrets.js');
const DB_POOL_PATH = require.resolve('../heys-api-rest/db-pool.js');

const PLACEHOLDER = '__IN_LOCKBOX__heys-database__';
const REAL_PASSWORD = 'настоящий-пароль-из-сейфа';

let envBackup;

/** Подменяет lockbox-client и загружает secrets.js заново. */
function loadSecrets(getSecret) {
  require.cache[LOCKBOX_PATH] = {
    id: LOCKBOX_PATH,
    filename: LOCKBOX_PATH,
    loaded: true,
    exports: { getSecret, clearCache: () => {} },
  };
  delete require.cache[SECRETS_PATH];
  return require(SECRETS_PATH);
}

beforeEach(() => {
  envBackup = { ...process.env };
  process.env.LOCKBOX_DB_SECRET_ID = 'secret-db';
  delete process.env.LOCKBOX_APP_SECRET_ID;
  delete process.env.LOCKBOX_S3_SECRET_ID;
  process.env.PG_PASSWORD = PLACEHOLDER;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) delete process.env[key];
  }
  Object.assign(process.env, envBackup);
  delete require.cache[SECRETS_PATH];
  delete require.cache[LOCKBOX_PATH];
  delete require.cache[DB_POOL_PATH];
});

describe('секреты · порядок при холодном старте', () => {
  it('пока сейф отвечает, пароль из окружения не исчезает', async () => {
    const seenDuringFetch = [];
    const getSecret = vi.fn(async () => {
      // Мы внутри сетевого вызова — ровно то окно, в котором раньше было пусто.
      seenDuringFetch.push(process.env.PG_PASSWORD);
      await Promise.resolve();
      seenDuringFetch.push(process.env.PG_PASSWORD);
      return { PG_PASSWORD: REAL_PASSWORD };
    });

    const { initSecrets } = loadSecrets(getSecret);
    await initSecrets();

    expect(seenDuringFetch).toHaveLength(2);
    for (const value of seenDuringFetch) {
      expect(value, 'пароль пропал из окружения на время похода в сейф').toBeTruthy();
    }
  });

  it('после инициализации в окружении настоящий пароль, а не плейсхолдер', async () => {
    const { initSecrets } = loadSecrets(async () => ({ PG_PASSWORD: REAL_PASSWORD }));
    const result = await initSecrets();

    expect(process.env.PG_PASSWORD).toBe(REAL_PASSWORD);
    expect(result.db).toBe(1);
  });

  it('плейсхолдер, который сейф не заменил, всё-таки стирается', async () => {
    // Иначе downstream примет `__IN_LOCKBOX__…` за валидное значение и подпишет
    // им webhook — ради этого стирание и заводили.
    process.env.SOME_OTHER_SECRET = '__IN_LOCKBOX__heys-app__';
    const { initSecrets } = loadSecrets(async () => ({ PG_PASSWORD: REAL_PASSWORD }));
    await initSecrets();

    expect(process.env.SOME_OTHER_SECRET).toBeUndefined();
    expect(process.env.PG_PASSWORD).toBe(REAL_PASSWORD);
  });

  it('сейф не отдал пароль — результат не запоминается, следующий запрос пробует снова', async () => {
    let call = 0;
    const getSecret = vi.fn(async () => {
      call += 1;
      return call === 1 ? {} : { PG_PASSWORD: REAL_PASSWORD };
    });

    const { initSecrets } = loadSecrets(getSecret);
    await initSecrets();
    expect(process.env.PG_PASSWORD).toBeUndefined();

    // Раньше сломанный результат оставался в памяти экземпляра до конца его
    // жизни: один неудачный холодный старт — и все запросы к нему падали.
    await initSecrets();
    expect(getSecret).toHaveBeenCalledTimes(2);
    expect(process.env.PG_PASSWORD).toBe(REAL_PASSWORD);
  });

  it('сорвавшийся поход в сейф тоже не застревает в памяти', async () => {
    let call = 0;
    const getSecret = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('сеть недоступна');
      return { PG_PASSWORD: REAL_PASSWORD };
    });

    const { initSecrets } = loadSecrets(getSecret);
    await expect(initSecrets()).rejects.toThrow('сеть недоступна');

    await initSecrets();
    expect(getSecret).toHaveBeenCalledTimes(2);
    expect(process.env.PG_PASSWORD).toBe(REAL_PASSWORD);
  });
});

describe('пул базы · пустой пароль не доезжает до odyssey', () => {
  function loadPool() {
    delete require.cache[DB_POOL_PATH];
    return require(DB_POOL_PATH);
  }

  it('без пароля пул не создаётся и ошибка называет причину', () => {
    delete process.env.PG_PASSWORD;
    const { getPool } = loadPool();

    // Раньше пул строился с undefined-паролем, odyssey отвечал «incorrect
    // password», и причина терялась. Хуже того — пул кешировался, и экземпляр
    // оставался сломанным до конца жизни.
    expect(() => getPool()).toThrow(/PG_PASSWORD/);
    expect(() => getPool()).toThrow(/Lockbox/);
  });

  it('плейсхолдер вместо пароля — тот же отказ', () => {
    process.env.PG_PASSWORD = PLACEHOLDER;
    const { getPool } = loadPool();

    expect(() => getPool()).toThrow(/плейсхолдером/);
  });
});
