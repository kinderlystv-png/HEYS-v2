/**
 * 🔍 Полная диагностика БД HEYS
 * Запуск: node db_check.js
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
        console.log('✅ Подключение к БД успешно\n');

        // 1. КЛИЕНТЫ И ПОДПИСКИ
        console.log('═══════════════════════════════════════════════════');
        console.log('  👥 КЛИЕНТЫ И ПОДПИСКИ');
        console.log('═══════════════════════════════════════════════════');
        const clients = await client.query(`
            SELECT id, name, phone_normalized, subscription_status, trial_ends_at, updated_at
            FROM clients
            ORDER BY name
        `);
        clients.rows.forEach(c => {
            const endDate = c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('ru-RU') : '—';
            const daysLeft = c.trial_ends_at
                ? Math.ceil((new Date(c.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))
                : 0;
            const status = c.subscription_status || 'none';
            console.log(`  📱 ${c.name} (${c.phone_normalized})`);
            console.log(`     Статус: ${status} | До: ${endDate} (${daysLeft} дней)`);
        });

        // 2. СЕССИИ
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  🔐 АКТИВНЫЕ СЕССИИ');
        console.log('═══════════════════════════════════════════════════');
        try {
            const sessions = await client.query(`
                SELECT cs.client_id, c.name, cs.expires_at
                FROM client_sessions cs
                JOIN clients c ON c.id = cs.client_id
                WHERE cs.expires_at > NOW()
                ORDER BY cs.expires_at DESC
            `);
            if (sessions.rows.length === 0) {
                console.log('  ⚠️ Нет активных сессий');
            } else {
                sessions.rows.forEach(s => {
                    const exp = new Date(s.expires_at).toLocaleString('ru-RU');
                    console.log(`  ✓ ${s.name} — истекает: ${exp}`);
                });
            }
        } catch (e) {
            console.log('  ⚠️ Таблица сессий недоступна или отсутствует');
        }

        // 3. ПРОДУКТЫ
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  🍎 ПРОДУКТЫ (shared_products)');
        console.log('═══════════════════════════════════════════════════');
        try {
            const products = await client.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN harm IS NOT NULL THEN 1 END) as with_harm,
                    COUNT(CASE WHEN nova_group IS NOT NULL THEN 1 END) as with_nova
                FROM shared_products
            `);
            const p = products.rows[0];
            console.log(`  📊 Всего продуктов: ${p.total}`);
            console.log(`     С harm score: ${p.with_harm} (${Math.round(p.with_harm / p.total * 100)}%)`);
            console.log(`     С NOVA group: ${p.with_nova} (${Math.round(p.with_nova / p.total * 100)}%)`);
        } catch (e) {
            console.log('  ⚠️ Ошибка запроса продуктов:', e.message);
        }

        // 4. KV STORE (данные клиентов)
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  💾 ДАННЫЕ КЛИЕНТОВ (client_kv_store)');
        console.log('═══════════════════════════════════════════════════');
        const kv = await client.query(`
            SELECT 
                c.name,
                COUNT(*) as total_keys,
                COUNT(CASE WHEN kv.k LIKE 'heys_dayv2_%' THEN 1 END) as days,
                MAX(kv.updated_at) as last_update
            FROM client_kv_store kv
            JOIN clients c ON c.id = kv.client_id
            GROUP BY c.id, c.name
            ORDER BY c.name
        `);
        kv.rows.forEach(r => {
            const lastUp = r.last_update ? new Date(r.last_update).toLocaleString('ru-RU') : '—';
            console.log(`  📂 ${r.name}: ${r.total_keys} ключей, ${r.days} дней | Обновление: ${lastUp}`);
        });

        // 5. ОЧЕРЕДЬ ТРИАЛА
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  📋 ОЧЕРЕДЬ ТРИАЛА');
        console.log('═══════════════════════════════════════════════════');
        const queue = await client.query(`
            SELECT status, COUNT(*) as cnt
            FROM trial_queue
            GROUP BY status
            ORDER BY status
        `);
        if (queue.rows.length === 0) {
            console.log('  ℹ️ Очередь пуста');
        } else {
            queue.rows.forEach(q => {
                console.log(`  ${q.status}: ${q.cnt}`);
            });
        }

        // 6. СОГЛАСИЯ
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  ✍️ СОГЛАСИЯ (consents)');
        console.log('═══════════════════════════════════════════════════');
        const consents = await client.query(`
            SELECT consent_type, COUNT(*) as cnt
            FROM consents
            GROUP BY consent_type
            ORDER BY consent_type
        `);
        if (consents.rows.length === 0) {
            console.log('  ℹ️ Нет согласий');
        } else {
            consents.rows.forEach(c => {
                console.log(`  ${c.consent_type}: ${c.cnt}`);
            });
        }

        // 7. CRITICAL FUNCTIONS CHECK
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  🔧 ПРОВЕРКА ФУНКЦИЙ');
        console.log('═══════════════════════════════════════════════════');
        const funcs = [
            'get_curator_clients',
            'admin_extend_trial',
            'admin_get_all_clients',
            'admin_extend_subscription',
            'verify_client_pin_v3',
            'get_subscription_status_by_session',
            'start_trial_by_session',
            'get_shared_products'
        ];

        for (const fn of funcs) {
            const check = await client.query(`
                SELECT 1 FROM pg_proc WHERE proname = $1
            `, [fn]);
            const status = check.rows.length > 0 ? '✅' : '❌';
            console.log(`  ${status} ${fn}`);
        }

        console.log('\n═══════════════════════════════════════════════════');
        console.log('  🎉 ДИАГНОСТИКА ЗАВЕРШЕНА');
        console.log('═══════════════════════════════════════════════════\n');

    } catch (e) {
        console.error('❌ Ошибка:', e.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
