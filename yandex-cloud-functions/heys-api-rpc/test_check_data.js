const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_rpc',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    // Fix SSL issues
    max: 1,
    idleTimeoutMillis: 1000
});

const CLIENT_ID = process.env.CLIENT_ID || '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';

async function test() {
    let client;
    try {
        client = await pool.connect();

        // 1. Все записи для клиента (зашифрованные и нет)
        const all = await client.query(
            "SELECT k, v IS NOT NULL as has_v, v_encrypted IS NOT NULL as has_enc, key_version " +
            "FROM client_kv_store WHERE client_id = $1",
            [CLIENT_ID]
        );
        console.log('=== ВСЕ ЗАПИСИ для клиента ' + CLIENT_ID + ' ===');
        console.log(all.rows);

        // 2. Есть ли вообще зашифрованные записи в БД?
        const anyEnc = await client.query(
            "SELECT count(*) as cnt FROM client_kv_store WHERE v_encrypted IS NOT NULL"
        );
        console.log('\n=== Всего зашифрованных записей в БД ===');
        console.log(anyEnc.rows[0]);

        // 3. Plaintext записи (v не пустое)
        const plaintext = await client.query(
            "SELECT k, length(v::text) as v_len FROM client_kv_store " +
            "WHERE client_id = $1 AND v IS NOT NULL AND v != '{}' LIMIT 3",
            [CLIENT_ID]
        );
        console.log('\n=== Plaintext записи ===');
        console.log(plaintext.rows);

        // 4. Содержимое одной записи
        const sample = await client.query(
            "SELECT k, v::text as val FROM client_kv_store " +
            "WHERE client_id = $1 AND k = 'heys_profile'",
            [CLIENT_ID]
        );
        console.log('\n=== heys_profile ===');
        if (sample.rows[0]?.val) {
            console.log('НАЙДЕН (length=' + sample.rows[0].val.length + ')');
        } else {
            console.log('НЕ НАЙДЕН');
        }

    } catch (e) {
        console.error('ОШИБКА:', e.message);
    }
    finally {
        if (client) client.release();
        await pool.end();
    }
}
test();
