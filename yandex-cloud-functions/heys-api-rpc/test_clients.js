const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_rpc',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1000
});

async function test() {
    let client;
    try {
        client = await pool.connect();

        // 1. Какие клиенты есть?
        const clients = await client.query(
            "SELECT id FROM clients LIMIT 10"
        );
        console.log('=== КЛИЕНТЫ (ID, без ПДн) ===');
        console.log(clients.rows.map((r) => r.id));

        // 2. У каких клиентов есть зашифрованные данные?
        const withEnc = await client.query(
            "SELECT DISTINCT client_id FROM client_kv_store WHERE v_encrypted IS NOT NULL LIMIT 5"
        );
        console.log('\n=== Клиенты с зашифрованными данными ===');
        console.log(withEnc.rows);

        // 3. Примеры ключей зашифрованных записей
        const encKeys = await client.query(
            "SELECT DISTINCT k FROM client_kv_store WHERE v_encrypted IS NOT NULL LIMIT 10"
        );
        console.log('\n=== Какие ключи зашифрованы ===');
        console.log(encKeys.rows.map(r => r.k));

        // 4. Детали по первому клиенту с зашифрованными данными
        if (withEnc.rows[0]) {
            const cid = withEnc.rows[0].client_id;
            const data = await client.query(
                "SELECT k, key_version FROM client_kv_store WHERE client_id = $1 LIMIT 5",
                [cid]
            );
            console.log('\n=== Записи клиента ' + cid + ' ===');
            console.log(data.rows);
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
