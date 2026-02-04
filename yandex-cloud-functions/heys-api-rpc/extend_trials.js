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

        // 1. Посмотреть клиентов и их подписки
        console.log('=== КЛИЕНТЫ И ИХ ПОДПИСКИ ===');
        const clients = await client.query(`
            SELECT id, name, subscription_status, trial_ends_at, trial_started_at
            FROM clients
            ORDER BY trial_started_at NULLS LAST
        `);
        console.log(JSON.stringify(clients.rows, null, 2));

        // 2. Продлить триал на 30 дней ВСЕМ клиентам
        console.log('\n=== ПРОДЛЕНИЕ ТРИАЛА НА 30 ДНЕЙ ===');
        const updateClients = await client.query(`
            UPDATE clients
            SET
              subscription_status = 'trial',
              trial_ends_at = NOW() + INTERVAL '30 days',
              updated_at = NOW()
            RETURNING id, name, subscription_status, trial_ends_at
        `);
        console.log('Обновлено клиентов:', updateClients.rowCount);
        console.log(JSON.stringify(updateClients.rows, null, 2));

        // 3. Обновить subscriptions (если есть)
        const updateSubs = await client.query(`
            UPDATE subscriptions
            SET
              trial_ends_at = NOW() + INTERVAL '30 days',
              updated_at = NOW()
            RETURNING client_id, trial_ends_at
        `);
        console.log('\nОбновлено subscriptions:', updateSubs.rowCount);
        if (updateSubs.rows.length > 0) {
            console.log(JSON.stringify(updateSubs.rows, null, 2));
        }

        console.log('\n✅ Триал продлён для всех клиентов!');

    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
