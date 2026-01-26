const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_rpc',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

const CLIENT_ID = process.env.CLIENT_ID || '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';
const ENCRYPTION_KEY = process.env.HEYS_ENCRYPTION_KEY;

async function test() {
    const client = await pool.connect();
    try {
        const fnCheck = await client.query(
            "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'decrypt_health_data'"
        );
        console.log('1. Функция decrypt_health_data:', fnCheck.rows.length > 0 ? 'СУЩЕСТВУЕТ' : 'НЕ НАЙДЕНА');

        const encrypted = await client.query(
            "SELECT k, v_encrypted IS NOT NULL as enc, key_version FROM client_kv_store " +
            "WHERE client_id = $1 AND v_encrypted IS NOT NULL LIMIT 2",
            [CLIENT_ID]
        );
        console.log('2. Зашифрованные записи:', encrypted.rows);

        if (!ENCRYPTION_KEY) {
            throw new Error('HEYS_ENCRYPTION_KEY is not set in env');
        }

        await client.query("SET heys.encryption_key = $1", [ENCRYPTION_KEY]);
        console.log('3. Ключ установлен');

        const dec = await client.query(
            "SELECT k, decrypt_health_data(v_encrypted)::text as d FROM client_kv_store " +
            "WHERE client_id = $1 AND v_encrypted IS NOT NULL LIMIT 1",
            [CLIENT_ID]
        );
        const result = dec.rows[0];
        console.log('4. Ключ записи:', result?.k);
        console.log('5. Расшифровка: длина=' + (result?.d?.length || 0));

    } catch (e) {
        console.error('ОШИБКА:', e.message);
    }
    finally {
        client.release();
        pool.end();
    }
}
test();
