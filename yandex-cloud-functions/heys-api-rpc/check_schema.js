/**
 * Проверка структуры таблицы clients
 */

const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1000
});

async function main() {
    let client;
    try {
        client = await pool.connect();

        // Получить структуру таблицы clients
        const columns = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'clients'
            ORDER BY ordinal_position
        `);

        console.log('=== СТРУКТУРА ТАБЛИЦЫ clients ===');
        columns.rows.forEach(col => {
            console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : ''}`);
        });

        // Получить данные всех клиентов
        console.log('\n=== ДАННЫЕ КЛИЕНТОВ ===');
        const clients = await client.query(`SELECT * FROM clients LIMIT 5`);
        console.log(JSON.stringify(clients.rows, null, 2));

    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
