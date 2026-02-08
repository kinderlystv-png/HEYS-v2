/**
 * Apply single migration: 2026-02-08_fix_extend_and_curator_clients.sql
 * Fixes: admin_extend_subscription 500, get_curator_clients stale data, subscriptions sync
 */
const fs = require('fs');
const path = require('path');

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
        console.log('✅ Подключение к БД успешно');

        // 1. Показать текущее состояние
        console.log('\n=== СОСТОЯНИЕ SUBSCRIPTIONS (ДО) ===');
        const subs = await client.query(`
            SELECT s.client_id, 
                   c.name,
                   c.subscription_status AS clients_status,
                   public.get_effective_subscription_status(s.client_id) AS effective_status,
                   s.trial_started_at,
                   s.trial_ends_at,
                   s.trial_approved_at,
                   s.active_until
            FROM subscriptions s
            JOIN clients c ON c.id = s.client_id
            ORDER BY c.name
        `);
        subs.rows.forEach(s => {
            const match = s.clients_status === s.effective_status ? '✅' : '⚠️ MISMATCH';
            console.log(`  ${match} ${s.name}:`);
            console.log(`    clients_status: ${s.clients_status}`);
            console.log(`    effective_status: ${s.effective_status}`);
            console.log(`    trial_started: ${s.trial_started_at || 'NULL'}`);
            console.log(`    trial_ends: ${s.trial_ends_at || 'NULL'}`);
            console.log(`    trial_approved: ${s.trial_approved_at || 'NULL'}`);
            console.log(`    active_until: ${s.active_until || 'NULL'}`);
        });

        // 2. Клиенты БЕЗ subscriptions записи
        console.log('\n=== КЛИЕНТЫ БЕЗ SUBSCRIPTIONS ===');
        const noSubs = await client.query(`
            SELECT c.id, c.name, c.subscription_status, c.trial_ends_at
            FROM clients c
            LEFT JOIN subscriptions s ON s.client_id = c.id
            WHERE s.client_id IS NULL
            ORDER BY c.name
        `);
        if (noSubs.rows.length === 0) {
            console.log('  (все клиенты имеют subscriptions запись)');
        }
        noSubs.rows.forEach(c => {
            const endDate = c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('ru-RU') : 'N/A';
            console.log(`  ${c.name}: ${c.subscription_status || 'NULL'} (ends: ${endDate})`);
        });

        // 3. Применить миграцию
        console.log('\n=== ПРИМЕНЯЮ МИГРАЦИЮ ===');
        const dbDir = path.join(__dirname, '..', '..', 'database');
        const migrationFile = '2026-02-08_fix_extend_and_curator_clients.sql';
        const filePath = path.join(dbDir, migrationFile);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        console.log(`📄 Применяю: ${migrationFile}`);
        await client.query(sql);
        console.log('   ✅ Успешно');

        // 4. Проверяем результат
        console.log('\n=== ПОСЛЕ МИГРАЦИИ ===');
        const after = await client.query(`
            SELECT s.client_id, 
                   c.name,
                   c.subscription_status AS clients_status,
                   public.get_effective_subscription_status(s.client_id) AS effective_status,
                   s.trial_started_at,
                   s.trial_ends_at,
                   s.active_until
            FROM subscriptions s
            JOIN clients c ON c.id = s.client_id
            ORDER BY c.name
        `);
        after.rows.forEach(s => {
            const match = s.clients_status === s.effective_status ? '✅' : '⚠️';
            console.log(`  ${match} ${s.name}: clients=${s.clients_status}, effective=${s.effective_status}, trial_ends=${s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString('ru-RU') : 'N/A'}, active_until=${s.active_until ? new Date(s.active_until).toLocaleDateString('ru-RU') : 'N/A'}`);
        });

        // 5. Клиенты без subscriptions с активным статусом
        console.log('\n=== КЛИЕНТЫ БЕЗ SUBSCRIPTIONS (ПОСЛЕ) ===');
        const noSubsAfter = await client.query(`
            SELECT c.id, c.name, c.subscription_status, c.trial_ends_at
            FROM clients c
            LEFT JOIN subscriptions s ON s.client_id = c.id
            WHERE s.client_id IS NULL
            AND c.subscription_status IN ('trial', 'trial_pending', 'active')
            ORDER BY c.name
        `);
        if (noSubsAfter.rows.length === 0) {
            console.log('  ✅ Все клиенты с активным статусом имеют subscriptions запись');
        } else {
            noSubsAfter.rows.forEach(c => {
                console.log(`  ❌ ${c.name}: ${c.subscription_status}`);
            });
        }

        // 6. Тест get_curator_clients (обновлённый)
        console.log('\n=== ТЕСТ get_curator_clients (обновлённый) ===');
        const curatorId = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c';
        const test = await client.query(`SELECT * FROM get_curator_clients($1::UUID)`, [curatorId]);
        test.rows.forEach(c => {
            console.log(`  ${c.name}: status=${c.subscription_status}, trial_ends=${c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('ru-RU') : 'N/A'}, active_until=${c.active_until ? new Date(c.active_until).toLocaleDateString('ru-RU') : 'N/A'}`);
        });

        console.log('\n🎉 Готово!');
    } catch (e) {
        console.error('❌ Ошибка:', e.message);
        console.error(e.stack);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
